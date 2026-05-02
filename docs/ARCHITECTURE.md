# Architecture

The extension is a 380px popup with three independent features (Qur'an audio, Hadith of the day, Dhikr reminders) plus a background script that owns long-running state. Vanilla JavaScript and CSS, no build step, no bundler. Two browser builds share most code via a `shared/` directory.

## Repository layout

```
shared/                source of truth for cross-browser logic
  dhikr.js             adhkar collection, AR/FR reward translations
  i18n.js              UI string table for en/fr/ar plus t() helper
  reciter-catalogue.js fetchers for Quran.com / MP3Quran / Islamic.network
  audio-urls.js        provider-aware surah audio URL resolution
  hadith.js            hadith fetchers with response-shape validation
  browser.js           browser/chrome namespace polyfill

scripts/
  sync.mjs             copies shared/ into chrome/shared/ and firefox/shared/
  check-sync.mjs       fails if either copy drifts; runs in pre-commit hook

chrome/                Chrome Manifest V3 build
  manifest.json        service-worker background, type:module
  background/
    background.js      service worker, ES module
  popup/               UI surface
  offscreen/           invisible audio host (offscreen document)
  shared/              copied from /shared via scripts/sync.mjs

firefox/               Firefox Manifest V2 build
  manifest.json        page-based persistent background, type:module via HTML
  background/
    background.html    one <script type="module" src="background.js">
    background.js      persistent script, ES module
  popup/
  shared/              copied from /shared
```

## Why two builds

Chrome and Firefox have different lifecycles and different APIs for long-lived audio. Chrome MV3 service workers terminate after ~30s of idle, so audio cannot live in the worker. Firefox does not yet have a stable solution for background audio under MV3. Each build uses its platform's working pattern:

- **Chrome MV3**: service worker hands audio off to an offscreen document. The offscreen document hosts the `<audio>` element and survives across worker restarts.
- **Firefox MV2**: persistent background page hosts the `<audio>` element directly. No offscreen document.

The `shared/` directory holds everything that does not depend on this difference.

## Audio playback flow (Chrome)

```
popup click  ->  background service worker  ->  offscreen document
              chrome.runtime.sendMessage      chrome.offscreen.createDocument
              { action: 'playAudio', ... }   forwards message
                                              audioPlayer.src = url
                                              audioPlayer.play()
                                              writes audioState to storage
              <-  popup polls every 1s        responds to getAudioState
```

When a surah ends and autoplay is on, the background script reads the next surah ID and sends a fresh `playAudio` message. The offscreen document handles wraparound (114 -> 1).

## Audio playback flow (Firefox)

Same popup -> background message. The background page calls `audioPlayer.play()` directly on a long-lived `<audio>` element. No offscreen document. The `audioState` shape and message contract are identical to Chrome.

## Dhikr notification flow

Interval setting is read from `chrome.storage.local.dhikrSettings`. The background script picks one of two scheduling primitives based on the interval:

- `>= 60s` -> `chrome.alarms.create('dhikr-reminder', { periodInMinutes })`. Alarms wake a terminated service worker.
- `< 60s` -> recursive `setTimeout`, since `chrome.alarms` does not support sub-minute periods. The timeout chain stops when the user toggles notifications off.

When a reminder fires, the background script reads `dhikrReminderMode`:

- `notification` -> `chrome.notifications.create({ requireInteraction: true, ... })`. Auto-dismissed after 60 seconds via `setTimeout(notifications.clear, 60_000)` so a forgotten reminder cannot pile up.
- `popup` -> `chrome.windows.create({ url: 'popup/reminder.html', type: 'popup', width: 420, height: 320 })`. The reminder window reads the current dhikr from storage and renders.

## Message contract

All messages between popup, background, and offscreen go through `chrome.runtime.sendMessage`. The contract is defined by `action` strings:

| action | from -> to | payload |
| --- | --- | --- |
| `ping` | popup -> background | none |
| `playAudio` | popup -> background -> offscreen | `{ audioUrl, suraId, reciterKey }` |
| `pauseAudio` | popup -> background -> offscreen | none |
| `resumeAudio` | popup -> background -> offscreen | none |
| `seekAudio` | popup -> background -> offscreen | `{ time }` |
| `getAudioState` | popup -> background -> offscreen | none, returns `{ state }` |
| `startDhikrNotifications` | popup -> background | `{ intervalSeconds }` |
| `stopDhikrNotifications` | popup -> background | none |
| `updateDhikrInterval` | popup -> background | `{ intervalSeconds }` |
| `setSleepTimer` | popup -> background | `{ minutes }` (0 cancels) |
| `showBrowserNotification` | background -> offscreen | `{ title, body, icon }` |

Background returns `true` from `onMessage` to signal an async response.

## Storage schema

Everything lives in `chrome.storage.local` (Firefox: `browser.storage.local`). Keys:

| key | shape | lifetime |
| --- | --- | --- |
| `audioState` | `{ audioUrl, suraId, reciterKey, currentTime, duration, isPlaying, timestamp }` | written by the offscreen (Chrome) and the persistent background (Firefox) on play / pause / seek / ended / throttled timeupdate. The popup reads this on open as the primary restoration source. |
| `userSelections` | `{ suraId, reciterKey, autoplayEnabled, timestamp }` | until manually cleared |
| `dhikrSettings` | `{ enabled, intervalSeconds, reminderMode }` | until manually cleared |
| `currentDhikr` | one entry from `dhikrCollection` | overwritten on each reminder |
| `reciterCache` | `{ reciters: [...], timestamp }` | refreshed every 6 hours |
| `reciterCoverage` | `{ timestamp, map: { [reciterId]: 'complete' \| 'limited' } }` | refreshed every 24 hours by the background coverage probe; 30-day TTL when read |
| `sleepTimer` | `{ minutes: 0 \| 15 \| 30 \| 45 \| 60 }` | persists across sessions; 0 means off |
| `hadithCacheEn` | `string[]` | up to 30 entries, replenished asynchronously |
| `hadithCacheFr` | `string[]` | same |
| `uiLanguage` | `'en' \| 'fr' \| 'ar'` | until manually cleared |

The 10MB quota is far above realistic usage (well under 1MB even pessimistically).

## Reciter catalogue

Four providers feed the catalogue:

- **Quran.com** (`api.quran.com`) — verse-by-verse and chapter recitations.
- **MP3Quran.net** — additional reciters with their own server URL pattern.
- **Islamic.network** (`cdn.islamic.network`) — audio CDN; reciters keyed by slug.
- **Al-Quran Cloud** (`api.alquran.cloud`) — curated audio editions whose `identifier` is an Islamic.network slug. Replaces the hardcoded slug list 2.0.0 carried.

Results are deduplicated by `name + style`. The popup caches the deduped list under `reciterCache` for six hours.

A background coverage probe HEAD-tests four sample surahs (1, 50, 87, 114) per reciter and writes results to `reciterCoverage` with a 30-day TTL. Reciters with at least two passes are `complete`; one or zero passes are `limited`. The picker label surfaces this so users can choose reliable reciters confidently. The probe runs once on install/startup with a 30-second delay, then every 24 hours via `chrome.alarms`. Every probed URL passes through `ensureAllowedAudioHost` before any HEAD request.

## Resume behaviour

The popup reads `audioState` from `chrome.storage.local` directly on open. It does not depend on a runtime round-trip to the background to recover the resume position. If the saved state indicates active playback, the popup follows up with a `getAudioState` message to refresh the in-flight currentTime; otherwise the storage state is authoritative. This pattern survives Chrome's service-worker termination during long idle and Firefox browser restarts.

The popup renders Resume whenever the offscreen document (Chrome) or background page (Firefox) holds a live or paused audio with non-zero progress, regardless of whether the surah and reciter inputs currently match the saved selections. The semantics are: as long as audio is alive somewhere, the popup must always offer a way to control it. Clicking Resume issues a keyless `resumeAudio` message; the offscreen document or background page resumes from its own internal state, so the popup's input fields can drift out of match without breaking the control surface.

## Sync mechanism

`scripts/sync.mjs` walks the repo-root `shared/` and copies every file (excluding `CLAUDE.md` and `.DS_Store`) into `chrome/shared/` and `firefox/shared/`. The destination is wiped and rewritten on each run so removed files do not linger.

`scripts/check-sync.mjs` hashes both copies and the source. It exits non-zero if any file in the source has no matching hash in either copy or vice versa. Wire it into `.git/hooks/pre-commit` so a contributor cannot commit drift.

Why copies rather than symlinks: symlinks across `chrome/` and `firefox/` break on Windows without dev mode, do not survive zip packaging, and confuse Manifest V3 static analysis.

## What is not in this architecture

- No build step. Everything ships as written.
- No transpiler. The minimum Chrome version is 109 and the minimum Firefox version is 109; both support every ES2020+ feature used in the source.
- No bundler. ES modules resolve relative paths natively.
- No framework. Vanilla DOM APIs throughout.
- No analytics, no telemetry, no remote scripts. See `PRIVACY.md`.

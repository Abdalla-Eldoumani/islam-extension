# Architecture

The extension is a 360 px popup with three parts (Qur'an audio, a hadith, and the adhkar with their reminders) plus a background context that keeps audio and reminders running when the popup is closed. Plain JavaScript and CSS, no build step, no bundler. Both browser builds load the same popup and modules from `shared/`.

## Repository layout

```
shared/                  source for everything both builds use
  popup/
    index.html           the popup
    popup.js             popup logic: pickers, playback controls, hadith, adhkar
    dhikr-view.js        renders one dhikr and its source line (popup and reminder window)
    reminder.html/.js    the small reminder window
    styles.css           page styles and design tokens
    reminder.css         reminder window additions
  audio-player.js        drives an <audio> element: play, pause, resume, seek, state
  audio-urls.js          surah audio URL for a catalogue entry, media host allowlist
  browser.js             picks the browser or chrome namespace
  combobox.js/.css       the searchable surah and reciter pickers
  dhikr.js               the adhkar with their sources, and the shahada
  hadith.js              random hadith from the pinned dataset, with a cache
  i18n.js                UI strings for en, fr and ar
  playback.js            stored audio state, autoplay, sleep timer
  reciter-catalogue.js   the merged reciter list from three providers
  reminders.js           reminder settings, alarms, notification or window
  sources.js             label and link for a cited hadith or verse

scripts/
  sync.mjs               copies shared/ into chrome/shared/ and firefox/shared/
  check-sync.mjs         fails when either copy differs from shared/

chrome/                  Manifest V3 build
  background/background.js   service worker (ES module)
  offscreen/                 offscreen document holding the <audio> element
  assets/                    icons, fonts and font licences
  shared/                    copy of shared/

firefox/                 Manifest V2 build
  background/background.html + background.js   persistent background page
  assets/                    icons, fonts and font licences
  shared/                    copy of shared/
```

Both manifests point the toolbar popup at `shared/popup/index.html`.

## Why two builds

Chrome stops a Manifest V3 service worker after about 30 seconds without events, so the worker cannot hold an audio element. Chrome's answer is the offscreen document. Firefox has no offscreen document, but a Manifest V2 background page can stay loaded (`persistent: true`) and hold the audio element itself.

- **Chrome**: the service worker receives the popup's messages and forwards audio commands to the offscreen document, creating it on demand.
- **Firefox**: the background page owns `new Audio()` and handles everything in one place.

Both use `shared/audio-player.js` for the player, `shared/playback.js` for stored state, autoplay and the sleep timer, and `shared/reminders.js` for reminders.

## Message contract

The popup talks to the background with `runtime.sendMessage`. Every reply has the shape `{ success, ... }`, or `{ success: false, error }`.

| action | payload | reply |
| --- | --- | --- |
| `playAudio` | `{ audioUrl, suraId, reciterKey }` | `{ state }` |
| `pauseAudio` | none; also cancels the sleep timer | `{ state }` |
| `resumeAudio` | none | `{ state }` |
| `seekAudio` | `{ time }` in seconds | `{ state }` |
| `getAudioState` | none | `{ state }`, or the stored state when no player is running |
| `updateReminders` | `{ settings: { notificationsEnabled, interval, mode } }` | `{ settings }` |
| `setSleepTimer` | `{ minutes }`: 15, 30, 45 or 60; anything else turns it off | none |

`state` is `{ audioUrl, suraId, reciterKey, isPlaying, currentTime, duration, live }`. `live` is true when an audio element holds the track right now.

On Chrome the worker forwards audio commands with `target: 'offscreen'`, and the offscreen document answers only messages with that target. The offscreen document reports back with `{ target: 'background', action: 'audioState' | 'audioEnded', state }`; the worker accepts those only from the offscreen document's URL. An offscreen document can use only the runtime API, so the worker writes what it reports to storage.

## Audio

`shared/audio-urls.js` builds the file URL from a catalogue entry:

- **Quran.com** (`qc:<id>`): asks `api.quran.com/api/v4/chapter_recitations/<id>/<surah>` for the file. The ids come from Quran.com's chapter-reciter list, which is the list that endpoint accepts.
- **MP3Quran** (`mp3:<id>`): the reciter's server plus a three-digit file name, for example `.../114.mp3`.
- **Al-Quran Cloud** (`islamic:<edition>`): `cdn.islamic.network/quran/audio-surah/<bitrate>/<edition>/<surah>.mp3`.

Every URL must be https on `download.quranicaudio.com`, `cdn.islamic.network` or a `*.mp3quran.net` host before it reaches an audio element. The popup checks it, and the player checks it again.

The player waits up to 15 seconds for the file's metadata, then plays and reports its state. It reports again on pause, when the track ends, and every 10 seconds while playing. The popup polls `getAudioState` once a second while audio plays.

When a track ends with Autoplay on, the background resolves the next surah the same reciter recorded (wrapping from 114 to 1), plays it, and saves it as the selected surah.

## Resume

The background stores every reported state under `audioState`. When no audio element holds a track (Chrome closed the offscreen document, or the browser restarted), `getAudioState` returns that stored state with `isPlaying: false`, and `resumeAudio` starts the stored file again from its saved position.

On open, the popup restores the saved surah and reciter. If audio is live in the background, the popup adopts its surah and reciter instead. The main button shows Pause while the selection is playing, Resume with the saved time when the selection is paused part way, and Play otherwise. When audio plays for a different selection, a banner names it and offers to stop it.

## Reminders

`shared/reminders.js` keeps everything in storage and alarms, so it survives Chrome stopping the service worker.

- `updateReminders` validates the settings (30 to 3600 seconds, mode `notification` or `popup`), stores them under `dhikrSettings`, and creates the `dhikr-reminder` alarm with the interval as its period. A change of mode alone keeps the running alarm, because the mode is read when the alarm fires.
- When `dhikr-reminder` fires, the background shows a random dhikr as a notification or as a small window (`shared/popup/reminder.html?dhikr=<index>`), records what it showed under `shownReminder`, and sets the one-minute `dhikr-dismiss` alarm. The next reminder replaces the previous one; `dhikr-dismiss` closes it if nothing replaces it.
- On browser start and on install or update, the background clears any reminder left from the last session and recreates the alarm if reminders are on.

Notification and window text use the language chosen in the popup. Chrome's alarms fire at most every 30 seconds from Chrome 120; Firefox documents no minimum.

## Storage

Everything is in `storage.local`.

| key | shape | written by |
| --- | --- | --- |
| `uiLanguage` | `'en' \| 'fr' \| 'ar'` | popup |
| `userSelections` | `{ suraId, reciterKey, autoplayEnabled, timestamp }` | popup; autoplay updates `suraId` |
| `audioState` | `{ audioUrl, suraId, reciterKey, currentTime, duration, isPlaying, timestamp }` | background |
| `sleepTimer` | `{ minutes }`, 0 when off | background |
| `dhikrSettings` | `{ notificationsEnabled, interval, mode }` | background |
| `shownReminder` | `{ notificationId }` or `{ windowId }` | background |
| `reciterCatalog` | `{ reciters, timestamp }`, reused for 6 hours, never stored empty | popup and background |
| `hadithCacheEn`, `hadithCacheFr`, `hadithCacheAr` | up to 30 `{ text, collection, number }` | popup |

Installing or updating removes keys earlier versions used: `currentDhikr`, `reciterCache` and `reciterCoverage`, and the `reciter-coverage-probe` alarm.

## Reciter catalogue

`shared/reciter-catalogue.js` fetches three lists in parallel and keeps whatever succeeds:

- **Quran.com** (`api.quran.com/api/qdc/audio/reciters`): the chapter reciters.
- **MP3Quran** (`www.mp3quran.net/api/_english.json`): reciters on https servers. The `suras` field says which surahs each one recorded; complete reciters store `surahs: null`.
- **Al-Quran Cloud** (`api.alquran.cloud/v1/edition/format/audio`), filtered by the Islamic Network CDN's directory listing (`cdn.islamic.network/quran/info/by-surah/info.json`): only editions with all 114 whole-surah files are offered, at the highest bitrate listed for them.

Entries with the same name and style are merged; the merged ids stay in `altIds` so an older saved selection still resolves.

## Hadith

`shared/hadith.js` picks Sahih al-Bukhari or Sahih Muslim at random, then a random entry number, and fetches it from the fawazahmed0/hadith-api dataset through jsDelivr at a pinned commit, in the edition for the popup's language (`eng-`, `fra-` or `ara-`). It keeps the hadith only when the text passes the safety check and its number maps to one sunnah.com page:

- Bukhari: the dataset's number is sunnah.com's number.
- Muslim: sunnah.com numbers by the dataset's `arabicnumber`. `408` stays `408`, `2708.01` becomes `2708a`; other decimals and entries without an `arabicnumber` are skipped.

Up to eight entries are tried per hadith. The popup shows the next cached hadith and refills the cache in the background.

## Sync mechanism

`scripts/sync.mjs` copies every file under `shared/` (except Markdown files and `.DS_Store`) into `chrome/shared/` and `firefox/shared/`, wiping each destination first so deleted files do not linger. `scripts/check-sync.mjs` compares SHA-256 hashes and exits non-zero on any difference. The pre-commit hook in `.githooks/` and the CI workflow both run it.

Copies rather than symlinks: symlinks break on Windows without developer mode and do not survive packaging.

## What is not here

- No build step, transpiler, bundler or framework. ES modules load by relative path.
- No analytics, telemetry or remote code. See `PRIVACY.md`.
- No rate limiting on the hadith and surah-list requests. Reopening the popup quickly repeats them; hadith requests use `cache: 'force-cache'`.

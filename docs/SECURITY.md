# Security

This document describes the third-party dependencies, the trust boundaries, and the open items from the most recent audit.

## Reporting a vulnerability

Open a GitHub issue marked `security` or email the maintainer using the address on the Chrome Web Store listing. Please do not file public issues for unpatched vulnerabilities. We will respond within 7 days.

## Threat model

The extension runs in the popup, the background service worker (Chrome) or persistent background page (Firefox), and an offscreen audio host (Chrome only). It has no content scripts, no `<all_urls>` host permission, and no broad DOM access. The attack surface is:

- Network responses from the third-party APIs we call.
- Storage that the user or another extension can write to (other extensions cannot, since each extension has its own storage).
- The popup's own DOM, where any `innerHTML`-style write would be a risk.

## Third-party dependencies

| Dependency | Purpose | Trust posture |
| --- | --- | --- |
| `api.quran.com` | Surah metadata and recitations catalogue. | Operated by the Quran.com Foundation. We treat their JSON as untrusted: every URL is validated against the media-host allowlist before reaching the audio element. |
| `verses.quran.com` | Quran.com audio CDN. | Same. |
| `www.mp3quran.net`, `*.mp3quran.net` | Reciter catalogue and audio mirrors. | Same. |
| `cdn.islamic.network` | Audio for Islamic.network reciter slugs. | Same. |
| `api.alquran.cloud` | Curated audio editions catalogue. The 2.1.0 fourth provider. | Treated as untrusted; we filter responses to `format === 'audio'` and use the returned `identifier` as a slug. The resulting audio URLs still resolve to `cdn.islamic.network` and pass through `ensureAllowedAudioHost`. |
| `cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@<sha>` | English and French hadith editions. | JSDelivr serves a specific commit. We pin to the SHA recorded in `shared/hadith.js`. To bump, look up the commit on the upstream repo and update both the constant and the note here. The response is shape-validated before reaching the popup. |
| `api.hadith.gading.dev` | Arabic hadith. | Treated as untrusted; shape-validated. |
| `hadeethenc.com` | Hadith fallback. | Treated as untrusted; shape-validated. |

### Response shape validation

`shared/hadith.js` rejects any response where:

- the body field is not a string,
- the string is empty or longer than 4096 characters,
- the string contains a `<script`, `<iframe`, `<object`, or `<embed` substring.

A rejection falls through to the next API in the chain. If every API rejects, the popup shows the per-locale fallback string.

### Media host allowlist

`shared/audio-urls.js` exports `ensureAllowedAudioHost`. Every URL that becomes the `<audio>` source passes through this check. The allowlist is:

- `verses.quran.com`
- `cdn.islamic.network`
- `mirrors.quranicaudio.com`
- `download.quranicaudio.com`
- `www.mp3quran.net` plus any subdomain ending in `.mp3quran.net`

A URL outside the allowlist throws "Audio source unavailable for this combination", which the popup surfaces as a play-failure message.

## CSP

Both manifests declare:

```
default-src 'self';
style-src 'self';
font-src 'self';
media-src <enumerated audio hosts>;
connect-src <enumerated API hosts>;
object-src 'none';
```

No `'unsafe-inline'`, no `'unsafe-eval'`, no `data:` URIs, no `https:` wildcards. Inline scripts are disallowed by Manifest V3 by default; inline styles are disallowed by the CSP above.

## Subresource Integrity

The extension does not load any subresource over the network at startup. Fonts ship inside the package (`assets/fonts/*.woff2`). Stylesheets and scripts are extension-relative. Therefore SRI is not applicable to the extension itself.

For the JSDelivr-hosted hadith content, SRI is impractical because the response is per-hadith and dynamic. We mitigate by shape validation (above) and by pinning to a known commit SHA (planned for the next release).

## Console output in production

`ENV_PROD = true` in `chrome/background/background.js`, `firefox/background/background.js`, `chrome/offscreen/offscreen.js`, `chrome/popup/popup.js`, and `firefox/popup/popup.js`. While the gate is true:

- `console.log`, `console.warn`, and `console.error` are replaced with no-ops.
- The originals are preserved as `console._log`, `console._warn`, and `console._error` for ad-hoc debugging.

## Audit items deferred

The following items from the last audit are documented rather than fixed in the current release:

- **Permission scope** — every requested permission has a feature-level use. Listed in `PRIVACY.md`. No action.
- **Request rate-limiting** — rapidly opening and closing the popup fires repeated API requests. Adding deduplication is a behaviour change that needs separate testing.
- **Storage quota** — `chrome.storage.local` allows 10MB. Realistic usage is well under 1MB.
- **Firefox MV3 migration** — pending Mozilla's resolution of background audio playback in MV3. Tracked in `MV3_MIGRATION.md`.

## 2.1.0 audit summary

The 2.1.0 release added one third-party host (`api.alquran.cloud`) and one in-extension probe (`shared/reciter-coverage.js`) that issues HEAD requests against the existing media CDNs. We re-swept the codebase for the dangerous DOM-string-write and dynamic-evaluation primitives flagged in the 2.0.0 audit; none have returned. We re-confirmed that the popup's restoration path now reads `audioState` from storage rather than relying on a runtime round-trip, which closes a race condition that was not a vulnerability but did surface as a regression-class bug. Both `web-ext lint` runs are at the same steady state as 2.0.0.

The coverage probe deserves explicit mention: every URL it constructs is checked against `ensureAllowedAudioHost` before any HEAD request is issued. Off-allowlist URLs are dropped without a network call. Probe results are stored under `chrome.storage.local.reciterCoverage` with a 30-day TTL.

## 2.1.1 audit summary

The 2.1.1 release adds no third-party hosts. The popup migrated to `shared/reciter-catalogue.js`, which means the popup and the background service worker (or persistent background page on Firefox) now share a single allowlist enforcement path through `ensureAllowedAudioHost`. The new `shared/combobox.js` module renders option labels via `textContent` and `replaceChildren` only; no `innerHTML` is introduced. The dhikr bracket fix likewise builds DOM nodes with explicit `dir` and `lang` attributes rather than concatenating into a single string. Both `web-ext lint` runs are at the same steady state as 2.1.0.

The combobox normalises a comparison key for filtering (NFKD strip, Arabic tashkeel and tatweel removed, lowercase). The displayed label is never modified, preserving the religious-content-immutable rule for surah names and reciter names alike.

Audio-state restoration polls `chrome.runtime.sendMessage({ action: 'getAudioState' })` with a 1500 ms timeout. The cap prevents a slow or stuck service-worker wakeup from leaving the popup in an indeterminate state; on timeout the popup falls back to `chrome.storage.local.audioState`. No new attack surface: the message contract is unchanged from 2.1.0 and `ensureAllowedAudioHost` still gates every URL the offscreen document loads.

## 2.1.2 audit summary

The 2.1.2 release adds no third-party hosts, no new media or connect sources, no new external scripts, and no new file types. The new playing banner element renders via `textContent` and `replaceChildren`. The two new clear buttons share their click handlers with the existing combobox X icons and add no new code paths into the audio resolver. `web-ext lint` runs at the same steady state as 2.1.1.

A defense-in-depth pass added `isAllowedAudioHost` checks at the entry of `playAudio` in `chrome/offscreen/offscreen.js` and `firefox/background/background.js`. The popup already gates URLs through `ensureAllowedAudioHost` before sending the play message; the new checks make the trust boundary explicit at the receiver and reject any future caller (a content script, a second extension page) that tries to bypass the popup. The inline Arabic hadith path in both popup files now applies the same length cap (4096 chars) and markup rejection that `shared/hadith.js#isSafeHadithText` enforces, closing a divergence where a compromised `api.hadith.gading.dev` response could have been rendered unbounded.

## Audit items closed in the current release

- JSDelivr response shape validation; URL pinned to a specific commit SHA recorded in `shared/hadith.js`.
- `innerHTML` writes replaced with `textContent` and `replaceChildren` everywhere.
- `console.warn` and `console.error` silenced in the production gate.
- Offscreen test buttons and the debug-info div removed.
- Inline `<style>` block in `popup/reminder.html` extracted to `popup/reminder.css`; CSP `style-src` no longer permits `'unsafe-inline'`.
- Media-host allowlist enforced in `shared/audio-urls.js`.
- Dhikr reminder interval floor raised from 5s to 30s; notifications auto-dismiss after 60s.
- Google Fonts CDN dropped; fonts are self-hosted under `assets/fonts/`.

## Self-hosted fonts

WOFF2 files for Cormorant Garamond, Plus Jakarta Sans, and Amiri ship in `chrome/assets/fonts/` and `firefox/assets/fonts/`. The popup loads them via `@font-face` declarations with `font-display: swap`. No third-party font CDN is contacted at runtime. Total font payload is around 315 KB.

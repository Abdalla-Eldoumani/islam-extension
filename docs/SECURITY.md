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
| `cdn.islamic.network` | Audio for the four built-in Islamic.network slugs. | Same. |
| `cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1` | English and French hadith editions. | JSDelivr serves whatever the upstream tag points at. We pin to the `@1` tag today; the next release will pin to a specific commit SHA. The response is shape-validated before reaching the popup. |
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

## Audit items closed in the current release

- JSDelivr response shape validation (commit SHA pin still pending).
- `innerHTML` writes replaced with `textContent` and `replaceChildren` everywhere.
- `console.warn` and `console.error` silenced in the production gate.
- Offscreen test buttons and the debug-info div removed.
- Inline `<style>` block in `popup/reminder.html` extracted to `popup/reminder.css`; CSP `style-src` no longer permits `'unsafe-inline'`.
- Media-host allowlist enforced in `shared/audio-urls.js`.
- Dhikr reminder interval floor raised from 5s to 30s; notifications auto-dismiss after 60s.
- Google Fonts CDN dropped; fonts are self-hosted under `assets/fonts/`.

## Self-hosted fonts

The current release expects WOFF2 files in `assets/fonts/`. Until the maintainer adds them, the popup falls back to system serif and sans-serif. Visual regression is acceptable until the WOFF2 set lands; the feature behaviour is unchanged.

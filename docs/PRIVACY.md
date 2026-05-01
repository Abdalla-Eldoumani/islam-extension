# Privacy

This extension does not collect personal data, does not run analytics, does not load remote scripts at runtime, and does not phone home.

The browser stores some preferences locally so the popup remembers your choices. Network requests are made only to the third-party APIs listed below, only when you use the related feature, and only with the data the API needs to respond.

## Permissions

### Chrome (Manifest V3)

| Permission | Why we need it |
| --- | --- |
| `offscreen` | Hosts the `<audio>` element so playback survives the popup closing. Required for Manifest V3 background audio. |
| `storage` | Persists your language choice, selected reciter and surah, autoplay flag, dhikr settings, and the hadith cache. |
| `alarms` | Schedules dhikr reminders at intervals of 1 minute or longer. Sub-minute intervals use `setTimeout`, which does not need a permission. |
| `notifications` | Shows the dhikr reminder when the interval fires and the popup is closed. |
| `windows` | Opens the popup-mode dhikr reminder window. Used only when the user picks the popup reminder style. |

Host permissions are listed below the table. The extension requests no broad `<all_urls>` access and runs no content scripts.

### Firefox (Manifest V2)

`storage`, `alarms`, `notifications`. Hosts requested via the same listed entries. No `<all_urls>`. No content scripts. No `tabs`, `activeTab`, or `webRequest`.

### Hosts

The host permissions enumerate the audio CDNs and the hadith APIs:

- `api.quran.com` — Surah metadata, recitations catalogue, audio URLs.
- `verses.quran.com` — Audio CDN for Quran.com recitations.
- `www.mp3quran.net` and `*.mp3quran.net` — Reciter catalogue and audio mirrors.
- `cdn.islamic.network` — Audio CDN for Alafasy, Husary, Shuraym, Tablawee.
- `mirrors.quranicaudio.com`, `download.quranicaudio.com` — Audio mirrors for the Quran.com catalogue.
- `api.hadith.gading.dev` — Arabic hadith collections.
- `cdn.jsdelivr.net` — English and French hadith editions, served from the `fawazahmed0/hadith-api` repo via JSDelivr.
- `hadeethenc.com` — Hadith fallback when the JSDelivr source fails.

The CSP `connect-src` enumerates the same hosts as a defence-in-depth check. The `media-src` allowlist constrains audio URL hosts; URLs returned by API responses that fall outside the allowlist are rejected before reaching the audio element.

## What is stored locally

Everything stays on your device in `chrome.storage.local` (or `browser.storage.local` on Firefox). Nothing syncs across devices. Nothing leaves the browser.

| Key | Purpose | Cleared when |
| --- | --- | --- |
| `audioState` | Last played surah, reciter, and timestamp so you can resume. | Never automatically. Cleared on uninstall. |
| `userSelections` | Selected sura, reciter, autoplay flag. | Never automatically. |
| `dhikrSettings` | Notifications on/off, interval, reminder mode. | Never automatically. |
| `currentDhikr` | Most recently displayed dhikr. | Overwritten on each reminder. |
| `reciterCache` | Deduplicated reciter list with a 6-hour expiry. | Refreshed every 6 hours. |
| `hadithCacheEn`, `hadithCacheFr` | Up to 30 hadiths each, replenished asynchronously. | Trimmed as entries are consumed. |
| `uiLanguage` | The locale you picked from the selector. | Never automatically. |

You can clear all of this from the extension's settings in `chrome://extensions` (Chrome) or `about:addons` (Firefox).

## What third parties receive

When you use a feature, the corresponding API receives a request. The request includes:

- Your IP address (every HTTP request does).
- Your User-Agent string (every HTTP request does).
- The path the extension constructed: `/recitations/<id>/by_chapter/<sura>` for audio, `/editions/eng-bukhari/<n>.min.json` for English hadith, and so on.

The third parties do not receive any of your stored data, your locale choice, or any identifier the extension creates. The extension does not send cookies and does not authenticate against any of the APIs.

## What the extension does not do

- No analytics, no telemetry, no usage tracking.
- No accounts, no sign-in, no third-party auth.
- No advertising network connections.
- No remote scripts. The `default-src 'self'` CSP forbids loading any code from a host other than the extension package.
- No background tabs, no content scripts injected into pages, no access to your browsing history.

## Reporting a privacy issue

Open an issue at the GitHub repository, or email the maintainer using the address listed in the Chrome Web Store listing. We treat privacy reports as high priority.

# Privacy

The extension collects no personal data, runs no analytics, loads no remote code and has no server of its own.

It stores your preferences and some caches in the browser's local extension storage. It sends requests only to the services below, only for the feature in use, and only with what each service needs to answer.

## Permissions

### Chrome (Manifest V3)

| Permission | Why |
| --- | --- |
| `offscreen` | Holds the audio element in an offscreen document so recitation continues after the popup closes. |
| `storage` | Saves the language, selected surah and reciter, autoplay, playback position, sleep timer, reminder settings, and the reciter and hadith caches. |
| `alarms` | Runs the reminder schedule, the one-minute reminder dismissal, and the sleep timer. |
| `notifications` | Shows a reminder as a system notification when that style is chosen. |

The small reminder window uses the `windows` API, which needs no permission.

### Firefox (Manifest V2)

`storage`, `alarms` and `notifications`, plus the same host entries. The background page holds the audio element, so no `offscreen` permission is needed.

Neither build asks for `<all_urls>`, `tabs`, `activeTab`, `history` or `webRequest`, and neither injects scripts into web pages.

### Hosts the extension fetches from

| Host | What it is used for |
| --- | --- |
| `api.quran.com` | Surah names, the Quran.com reciter list, and the address of each Quran.com recitation file. |
| `www.mp3quran.net` | The MP3Quran reciter list. |
| `api.alquran.cloud` | The Al-Quran Cloud audio editions, and the surah list if Quran.com does not answer. |
| `cdn.islamic.network` | The directory of whole-surah audio files for the Al-Quran Cloud editions. |
| `cdn.jsdelivr.net` | Hadith from the `fawazahmed0/hadith-api` repository at a pinned commit. |

These are the `host_permissions` (Firefox: `permissions`) and the CSP `connect-src`.

### Hosts audio plays from

`download.quranicaudio.com` (Quran.com recitations), `cdn.islamic.network` (Al-Quran Cloud editions) and `*.mp3quran.net` (MP3Quran servers). These make up the CSP `media-src`, and the extension refuses an audio address on any other host.

## What is stored locally

Everything is in `storage.local`: nothing syncs between devices, and nothing is sent anywhere.

| Key | Contents | Cleared |
| --- | --- | --- |
| `uiLanguage` | The language you picked. | On uninstall. |
| `userSelections` | Selected surah and reciter, autoplay on or off. | On uninstall. |
| `audioState` | The last surah played, its reciter, file address and position, for Resume. | Replaced as you play; on uninstall. |
| `sleepTimer` | The sleep timer choice. | Reset when playback is paused; on uninstall. |
| `dhikrSettings` | Reminders on or off, the interval and the style. | On uninstall. |
| `shownReminder` | Which reminder is on screen, so it can be closed. | When the reminder closes. |
| `reciterCatalog` | The merged reciter list. | Refreshed after six hours. |
| `hadithCacheEn`, `hadithCacheFr`, `hadithCacheAr` | Up to 30 hadith per language with their collection and number. | One is used each time the popup opens, and the cache is refilled. |

Removing the extension from `chrome://extensions` or `about:addons` deletes all of it.

## What the services receive

Each request carries what every web request carries: your IP address and your browser's User-Agent. The address says what is wanted, for example `/api/v4/chapter_recitations/7/114` for a recitation file or `/editions/eng-bukhari/6405.min.json` for a hadith. A hadith address therefore shows which language the popup uses.

The services receive nothing from storage and no identifier created by the extension. The extension does not sign in to any service.

## What the extension does not do

- No analytics, telemetry or usage tracking.
- No accounts or sign-in.
- No advertising.
- No remote code: the CSP `default-src 'self'` allows scripts only from the extension package.
- No access to your tabs, pages or browsing history.

## Reporting a privacy issue

Open an issue on the GitHub repository, or email the maintainer at the address on the Chrome Web Store listing.

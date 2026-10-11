# Qur'an & Sunnah Companion

A browser extension with Qur'an recitation, a hadith from Sahih al-Bukhari or Sahih Muslim each time you open it, and dhikr reminders. The Chrome build uses Manifest V3 and the Firefox build uses Manifest V2.

[Chrome Web Store](https://chromewebstore.google.com/detail/quran-sunnah-companion/okkohadnmodfaienacdlfaledjblcbka?hl=en-US&utm_source=ext_sidebar) | [GitHub](https://github.com/Abdalla-Eldoumani/islam-extension)

## Features

### Qur'an recitation
- One searchable list of reciters from three catalogues: Quran.com, MP3Quran and Al-Quran Cloud. Duplicates across catalogues are merged; the list had 426 entries on 9 October 2026.
- Every entry plays whole surahs. A reciter who recorded only part of the Qur'an shows the number of surahs available, and surahs that reciter did not record are skipped.
- A progress bar with seeking, autoplay of the next surah, and a sleep timer of 15, 30, 45 or 60 minutes.
- Playback continues after the popup closes, and a paused surah can be resumed after the browser restarts.

### Hadith
- A random hadith from Sahih al-Bukhari or Sahih Muslim in the interface language: English, French or Arabic.
- Each hadith shows its collection and number, for example "Sahih al-Bukhari 6405", linked to its page on sunnah.com.
- The text comes from the [fawazahmed0/hadith-api](https://github.com/fawazahmed0/hadith-api) dataset at one pinned commit. Up to 30 hadith per language are cached so the next one appears at once.
- When no hadith can be loaded, the popup shows the shahada, labelled as the shahada.

### Dhikr
- 28 adhkar in Arabic, each with a transliteration and an English meaning.
- Each dhikr names its source: a hadith linked to sunnah.com or verses linked to quran.com.
- Qur'anic adhkar use the exact verse text from the Quran.com API with the Saheeh International translation. For adhkar taken from hadith, the English line is this project's own rendering of the meaning, except where the source line says "English from sunnah.com".
- A virtue is shown only when its hadith is graded sahih or hasan. Quoted virtues reproduce the English and Arabic of the sunnah.com page.
- Reminders from every 30 seconds to every hour, as a system notification or a small window. A reminder closes after a minute, or when the next one replaces it.

### Privacy
No accounts, analytics, ads or tracking. Preferences and caches stay in the browser's local extension storage. Requests go only to the catalogue, audio and hadith hosts listed in [docs/PRIVACY.md](docs/PRIVACY.md). The adhkar are bundled with the extension and work offline.

## Installation

### Chrome Web Store
Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/quran-sunnah-companion/okkohadnmodfaienacdlfaledjblcbka?hl=en-US&utm_source=ext_sidebar).

### Chrome, Edge and other Chromium browsers, unpacked
1. Download and extract the [repository ZIP](https://github.com/Abdalla-Eldoumani/islam-extension/archive/refs/heads/main.zip), or clone the repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the `chrome/` folder.
4. Pin the extension from the puzzle-piece menu in the toolbar.

### Firefox
Release versions of Firefox install only add-ons signed by Mozilla. To run the repository version, open `about:debugging`, choose **This Firefox**, click **Load Temporary Add-on** and select `firefox/manifest.json`. The add-on stays loaded until Firefox closes. See [docs/INSTALLATION.md](docs/INSTALLATION.md) for other options.

## Usage

- **Qur'an**: pick a surah and a reciter, then press Play. Turn on Autoplay to continue with the next surah.
- **Hadith**: a new hadith appears each time the popup opens. Follow the reference to read it on sunnah.com.
- **Dhikr**: press Next dhikr to move through the collection. Turn on Reminders, choose an interval and a style, and allow notifications if the browser asks.

## Technical details

Plain JavaScript and CSS with no build step and no runtime dependencies. The popup, the reminder window and the modules both builds use live in `shared/`, and `npm run sync` copies them into `chrome/shared/` and `firefox/shared/`.

- **Chrome (Manifest V3)**: a service worker handles messages, alarms and autoplay. An offscreen document holds the audio element.
- **Firefox (Manifest V2)**: a persistent background page holds the audio element and does the same work.

### Services used
- **Quran.com API**: surah names, the Quran.com reciter list and its audio file addresses.
- **MP3Quran**: a reciter list and its audio servers.
- **Al-Quran Cloud and the Islamic Network CDN**: audio editions and their whole-surah files.
- **jsDelivr**: serves the hadith dataset from GitHub at the pinned commit.

### Browser support
- Chrome and other Chromium browsers, version 121 or later.
- Firefox 140 or later (Firefox for Android 142 or later).

### Languages
English, French and Arabic, chosen from the menu in the header. Arabic turns the whole page right to left. On first use the interface follows the browser language.

## Contributing

Contributions are welcome. See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for setup, conventions and how to add a reciter catalogue or a language.

```bash
git clone https://github.com/Abdalla-Eldoumani/islam-extension.git
cd islam-extension
npm ci
npm run sync
npm test
```

Run `git config core.hooksPath .githooks` once to turn on the pre-commit sync check. Edit files in `shared/`, never in `chrome/shared/` or `firefox/shared/`, then run `npm run sync` before reloading the extension.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): layout, message contract, storage keys, and how audio and reminders work in each build.
- [docs/INSTALLATION.md](docs/INSTALLATION.md): install steps for Chrome, Edge, Brave and Firefox.
- [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md): development workflow, commits, the religious-content rules, adding catalogues and languages.
- [docs/I18N.md](docs/I18N.md): the string table, right-to-left layout and the read-only rule for religious text.
- [docs/PRIVACY.md](docs/PRIVACY.md): permissions, what is stored, and what each service receives.
- [docs/SECURITY.md](docs/SECURITY.md): trust boundaries, the content security policy, and reporting a vulnerability.
- [docs/MV3_MIGRATION.md](docs/MV3_MIGRATION.md): what a Manifest V3 Firefox build would need.

## Troubleshooting

- **Audio does not play**: check the connection and try another reciter. A reciter who recorded only some surahs cannot play the others.
- **Notifications do not appear**: allow notifications for the browser in the operating system settings, and for the extension if the browser asks. The small-window style needs no notification permission.
- **The extension does not load**: turn on Developer mode and select the `chrome/` folder, or `firefox/manifest.json` in Firefox.

## License

The code is under the [MIT](LICENSE) licence. The bundled fonts (Amiri, Cormorant Garamond and Plus Jakarta Sans) are under the SIL Open Font License 1.1; the licence texts are in `assets/fonts/` in each build.

## Acknowledgments

All praise is due to Allah (SWT). Thanks to Quran.com, MP3Quran, Al-Quran Cloud and the Islamic Network, to the maintainers of the hadith-api dataset and sunnah.com, and to the reciters whose recitations make this possible.

## Changelog

### 2.2.1

- Hadith. The narrator line ("Narrated Abu Huraira:") now sits on its own line above the text. The dataset runs the two together; the stored text is unchanged and only the display splits it.
- Dhikr. Wording checked against the sunnah.com page each entry names. The paired tasbih now follows Bukhari 6406 and quotes its reward sentence, in English and Arabic. The salawat quotes its reward from Muslim 408, and the Sayyid al-Istighfar (Bukhari 6306) is the full supplication in the hadith's Arabic with sunnah.com's English, credited in its source line. The reward line under Allahu Akbar is removed: its hadith (Tirmidhi 3519) is graded hasan on sunnah.com and da'if by al-Albani, and the line was a paraphrase. Subhan Allah and al-Hamdu Lillah now quotes Muslim 223.
- Firefox. The minimum version is 140 (142 on Android), the first release that reads the data-collection declaration in the manifest.
- Design. A slate and sage palette in the light and dark schemes, 16 px body text, the selected surah's name set large above the player, and a solid play control. Long adhkar step down in size so the whole text fits. The icon is the same ring at every size, in the new colours; the 16 px icon used to be a crescent.

### 2.2.0

- Audio. Al-Quran Cloud reciters now play whole surahs from the Islamic Network CDN; editions the CDN does not hold as whole surahs are no longer listed. Quran.com reciters come from its chapter-reciter list, so the reciter you pick is the one you hear. The first-ayah fallback is gone. MP3Quran reciters with partial recordings show how many surahs they have, and autoplay skips the missing ones. The 128 kbps label, which no provider supplied, is removed.
- Hadith. Hadith now come only from Sahih al-Bukhari and Sahih Muslim, with the collection and number linked to sunnah.com, in English, French and Arabic. The three unsourced French fallback hadith are removed; when nothing loads, the shahada is shown and labelled as such.
- Dhikr. Every dhikr names its source with a link. Reward lines are kept only where the hadith is graded sahih or hasan, and several now quote the source instead of paraphrasing it. Qur'anic adhkar use the exact verse text and Saheeh International. Five adhkar without a confirmed source in the wording shown were removed, and 71:28 and 17:24 are now two separate entries.
- Reminders. The interval and style are kept in storage, every interval runs on browser alarms, and a reminder closes after a minute. The test notification at startup is gone. Notifications and the reminder window follow the interface language.
- Firefox. Autoplay continues with the popup closed. In both builds a paused surah can be resumed after the browser restarts.
- Design. One ruled page replaces the stacked cards. Arabic mirrors the layout without special cases, Latin text uses Plus Jakarta Sans, and Arabic is never set in italics. Controls have labels and 44 px targets, focus rings meet contrast, and status messages are announced to screen readers.
- Removed: the two clear buttons under the sleep timer (the clear buttons inside the pickers remain) and the Continue button (Resume shows the saved time instead).
- Both builds share one popup, the font licences ship with the fonts, and CI runs the sync check, the tests and both lints on Node 22.

### 2.1.2

- Resume affordance now follows the selection. When the surah or reciter input changes mid-playback, the popup switches to Play instead of stranding Resume against the new selection. Audio state restoration on a failed fetch reverts to the previous live state on both Chrome and Firefox, where Chrome previously left the keys half-updated. Restoring the original selection brings Pause back immediately instead of waiting for the next state poll.
- Stop-playing banner. When audio is alive in the background but does not match the current selection, a banner above the controls names the playing track and discards it on click. The user can start a new selection without restoring the original to Pause first. The banner no longer flashes during autoplay-next transitions and hides correctly when the saved state is missing a surah id.
- Two clear buttons under the sleep timer. A more visible target than the inline X icons in the comboboxes. Each button disables when its input is empty and translates with the rest of the UI.
- Status text and the banner discard button now translate with the rest of the UI. French and Arabic users no longer see English-only "Playing..." or "Stop playing" strings. The dhikr reward line on Chrome now shows the French translation that was already wired on Firefox.
- Hardening pass: the offscreen document on Chrome and the background page on Firefox now reject any `playAudio` URL that is not on the media-host allowlist, mirroring the popup-side check. The inline Arabic hadith path applies the same length cap and markup rejection that the shared module enforces. Stale red status text from a failed playback no longer survives a popup reopen, and the progress slider disables and dims when seeking would not affect the current selection.

### 2.1.1

- Audio control persistence. Play, Pause, and Resume now render on every popup reopen as long as the offscreen document or background page still holds audio, regardless of whether the inputs match the saved keys. Restoration polls the runtime first (the offscreen always sets `audioUrl` on play) and falls back to `chrome.storage.local.audioState` if the service worker is asleep or slow to wake. Saved reciter ids from previous catalogue revisions resolve to the canonical entry via the alt-id index.
- Combobox redesign. The surah and reciter pickers ship as a parchment panel inside the existing design system. Type-to-filter is case-insensitive and accent-insensitive, including for Arabic tashkeel and tatweel. Outside-click closes the panel even when clicking on a different card inside the popup.
- Clear-surah button. The surah picker has its own inline clear icon, mirroring the clear-reciter affordance.
- Dhikr bracket rendering. Mixed Arabic and Latin dhikr lines no longer flip the closing parenthesis past the Arabic word.
- Shared reciter catalogue in the popup. The popup migrated to `shared/reciter-catalogue.js`, removing the popup-local copies and bringing the popup and background paths back into agreement on canonical ids.
- Polling tracker no longer wipes the Resume affordance when a surah ends naturally with autoplay off. The end-of-track render now defers to the same logic the popup uses on a cold reopen, so the timestamp and progress bar stay visible instead of collapsing to zero.

### 2.1.0

- Resume bug fix. Pause, close the popup, reopen later: the play button now correctly shows `Resume` with the saved timestamp on both Chrome and Firefox. Firefox also persists position across full browser restarts.
- Reciter catalogue expansion. Al-Quran Cloud joins as a fourth provider; the previously hardcoded Islamic.network slug list is dropped. Coverage labels in the picker (`complete`, `limited`, `unknown`) are populated by a daily background HEAD-probe so users can pick reliable reciters confidently.
- Surah search. The surah picker is now a search-as-you-type input. Type `mulk`, `67`, `Al-Fatihah`, or `الفاتحة` to filter.
- Continue affordance. When a previous session is detected, a `Continue Surah <name> from M:SS` button appears above the play controls.
- Sleep timer. New dropdown in the Qur'an card with Off / 15 / 30 / 45 / 60-minute presets. Audio pauses when the timer fires.
- Design refinement. Stronger ink and rule contrast, larger card titles, gold-rule ON-state for toggle buttons, and the reminder window now uses the parchment tokens.
- Security audit refresh. `api.alquran.cloud` added to the allowlist; coverage probe HEAD requests pass through `ensureAllowedAudioHost`. See `docs/SECURITY.md` for the full audit summary.

### 2.0.0

- Modernization pass: consolidated cross-browser logic into `shared/`, parchment design tokens with self-hosted fonts and SVG sprite, JSDelivr hadith source pinned to a commit SHA, dhikr interval floor raised with auto-dismiss, emoji prefixes removed from UI strings.

---

May Allah (SWT) accept this effort and make it beneficial. Ameen.

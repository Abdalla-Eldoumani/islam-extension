# Qur'an & Sunnah Companion

A browser extension that brings Qur'an recitation, authentic Hadith, and Dhikr reminders to your browser. Available for Chrome (Manifest V3) and Firefox (Manifest V2).

[Chrome Web Store](https://chromewebstore.google.com/detail/quran-sunnah-companion/okkohadnmodfaienacdlfaledjblcbka?hl=en-US&utm_source=ext_sidebar) | [GitHub](https://github.com/Abdalla-Eldoumani/islam-extension)

## Features

### Qur'an Recitation
- 50+ reciters from Quran.com, MP3Quran.net, and Islamic.network with automatic deduplication
- Inline search to filter reciters by name, bitrate, and style
- All 114 Surahs with progress bar, seek controls, and autoplay
- Background playback continues when the popup is closed

### Authentic Hadith
- 9-book Arabic collection with English and French translations
- Local cache for instant display
- New hadith each time you open the popup

### Dhikr Reminders
- 32 authentic adhkar with Arabic, English, and transliteration
- Reward explanations in English, Arabic, and French
- Configurable interval (30 seconds to 1 hour) with preset buttons
- Two reminder styles: system notification or in-extension popup
- Notifications auto-dismiss after 60 seconds so a forgotten reminder cannot pile up

### Privacy
No personal data is collected. No accounts, tracking, or ads. The extension uses storage for preferences, alarms for Dhikr scheduling, and network access for Qur'an audio and Hadith APIs. The Dhikr collection works offline.

## Installation

### Chrome Web Store
Install directly from the [Chrome Web Store](https://chromewebstore.google.com/detail/quran-sunnah-companion/okkohadnmodfaienacdlfaledjblcbka?hl=en-US&utm_source=ext_sidebar).

### Manual Installation (Chrome)
1. Download and extract the [repository ZIP](https://github.com/Abdalla-Eldoumani/islam-extension/archive/refs/heads/main.zip)
2. Open `chrome://extensions` and enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `chrome/` folder from the extracted files
4. Pin the extension from the puzzle piece icon in the toolbar

### Firefox (Permanent)
1. Download the [repository ZIP](https://github.com/Abdalla-Eldoumani/islam-extension/archive/refs/heads/main.zip) and extract it
2. Go to `about:addons` > gear icon > **Install Add-on From File** and select `firefox/manifest.json`

### Firefox (Temporary / Development)
1. Go to `about:debugging` > **This Firefox** > **Load Temporary Add-on**
2. Select `firefox/manifest.json` from the cloned repository

## Usage

- **Qur'an**: Pick a Surah and reciter, press Play. Turn on autoplay to advance through Surahs automatically.
- **Hadith**: Opens with a new hadith each time.
- **Dhikr**: Toggle reminders on, choose an interval, and allow browser notifications when prompted.

## Technical Details

Built with vanilla JavaScript and CSS (no frameworks). Uses Chrome Extension APIs: Storage, Alarms, Notifications, Offscreen.

### APIs
- **Quran.com** -- Surah metadata and primary audio
- **MP3Quran.net** -- Additional reciters
- **Islamic.network** -- CDN audio sources
- **Hadith APIs** -- Arabic collections and English/French translations

### Browser Support
- Chrome / Chromium 109+ (Manifest V3)
- Firefox 109+ (Manifest V2, included in `firefox/`)
- Microsoft Edge and other Chromium browsers

### Trilingual Interface
One-tap language switcher (English / Francais / Arabic) with full RTL support. All UI labels, Surah names, Dhikr rewards, and Hadiths update instantly.

## Contributing

Contributions are welcome. See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for setup, conventions, and how to add a reciter or a language.

```bash
git clone https://github.com/Abdalla-Eldoumani/islam-extension.git
cd islam-extension
npm install
npm run sync
```

The Chrome and Firefox builds share their non-platform code via a `shared/` directory. Edit files there, then run `npm run sync` to copy them into both `chrome/shared/` and `firefox/shared/` before reloading the extension.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — message passing, storage schema, the Chrome MV3 + offscreen pattern, the Firefox MV2 background page pattern.
- [docs/INSTALLATION.md](docs/INSTALLATION.md) — install steps for Chrome, Firefox, Edge, Brave.
- [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) — development workflow, atomic commits, religious-content rules, adding reciters and locales.
- [docs/I18N.md](docs/I18N.md) — translation tables, RTL handling, the read-only rule for religious text.
- [docs/PRIVACY.md](docs/PRIVACY.md) — permissions table, what data is stored where, what is sent to which third party.
- [docs/SECURITY.md](docs/SECURITY.md) — third-party dependencies, vulnerability reporting, the deferred audit items.
- [docs/MV3_MIGRATION.md](docs/MV3_MIGRATION.md) — the Firefox MV3 path, gated on Mozilla resolving background audio playback.

## Troubleshooting

- **Audio won't play**: Verify your internet connection, try another reciter, or check that browser audio permissions are enabled.
- **Notifications not showing**: Allow notifications when prompted and confirm they are enabled in your browser settings.
- **Extension won't load**: Enable Developer mode and make sure you selected the `chrome/` or `firefox/` folder.

## License

[MIT](LICENSE)

## Acknowledgments

All praise is due to Allah (SWT). Thanks to Quran.com for their API and to the reciters whose recitations make this possible.

## Changelog

### 2.1.1

- Audio control persistence. Play, Pause, and Resume now render on every popup reopen as long as the offscreen document or background page still holds audio, regardless of whether the inputs match the saved keys. Saved reciter ids from previous catalogue revisions resolve to the canonical entry via the alt-id index.
- Combobox redesign. The surah and reciter pickers ship as a parchment panel inside the existing design system. Type-to-filter is case-insensitive and accent-insensitive, including for Arabic tashkeel and tatweel.
- Clear-surah button. The surah picker has its own inline clear icon, mirroring the clear-reciter affordance.
- Dhikr bracket rendering. Mixed Arabic and Latin dhikr lines no longer flip the closing parenthesis past the Arabic word.
- Shared reciter catalogue in the popup. The popup migrated to `shared/reciter-catalogue.js`, removing the popup-local copies and bringing the popup and background paths back into agreement on canonical ids.

### 2.1.0

- Resume bug fix. Pause, close the popup, reopen later — the play button now correctly shows `Resume` with the saved timestamp on both Chrome and Firefox. Firefox also persists position across full browser restarts.
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

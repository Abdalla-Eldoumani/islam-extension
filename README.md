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
- 26+ authentic adhkar with Arabic, English, and transliteration
- Reward explanations in English, Arabic, and French
- Configurable interval (5 seconds to 1 hour) with preset buttons
- Two reminder styles: system notification or in-extension popup

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

Contributions are welcome. Open an issue or submit a pull request.

```bash
git clone https://github.com/Abdalla-Eldoumani/islam-extension.git
cd islam-extension
```

## Troubleshooting

- **Audio won't play**: Verify your internet connection, try another reciter, or check that browser audio permissions are enabled.
- **Notifications not showing**: Allow notifications when prompted and confirm they are enabled in your browser settings.
- **Extension won't load**: Enable Developer mode and make sure you selected the `chrome/` or `firefox/` folder.

## License

[MIT](LICENSE)

## Acknowledgments

All praise is due to Allah (SWT). Thanks to Quran.com for their API and to the reciters whose recitations make this possible.

---

May Allah (SWT) accept this effort and make it beneficial. Ameen.

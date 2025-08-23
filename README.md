# 🕌 Qur'an & Sunnah Companion

> **Your pocket-size īmān boost in every tab** ✨

A lightweight, privacy-respectful Chrome extension that brings Qur'an recitation, authentic Hadith, and Dhikr reminders directly to your browser—without navigating away from your current tab.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/)
[![Firefox Preview](https://img.shields.io/badge/Firefox-Preview-orange?logo=firefox-browser&logoColor=white)](#option-3-firefox-early-preview)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)](https://developer.chrome.com/docs/extensions/mv3/intro/)

## 🌟 Features

### 📖 Qur'an Recitation
* **50+ reciters** combined from Quran.com, MP3Quran & Islamic.network **with automatic de-duplication** (names/styles collapsed into a single clean entry)
* **Inline search** — type to filter instantly
* **Bit-rate & style badges** (e.g. 128 kbps Murattal)
* **"Clear ✖" button** to reset the reciter field in one click
* **Resilient fallback chain** if a file is missing
* **All 114 Sūrahs**, progress bar & seek controls
* **Autoplay** next surah + background playback (offscreen API)

### 📚 Authentic Hadith
* **9-book Arabic collection**
* **Super-fast English translations** (30-item local cache for instant display)
* **French language support** with authentic translations
* Automatic fallback to secondary API if translation fails
* New hadith each time you open the popup

### 🤲 Dhikr Reminders
* **26 authentic adhkār** with **6 new high-reward entries** — Arabic, English & transliteration side-by-side
* **Enhanced rewards explanations** translated into Arabic and French
* **Reminder style selector:** 📣 *System Notification* **or** 🗔 *In-extension Pop-up*
* **Smart cache** so adhkār load instantly offline
* Custom interval (5 s – 1 h) + quick-preset buttons
* Rewards displayed in all three languages

### 🔒 Privacy & Performance
- **Zero personal data collection** - completely private
- **No external accounts required** - works immediately
- **Lightweight design** - minimal impact on browser performance
- **Offline-ready** Dhikr collection
- **Smart input handling** - Resume button changes to Play when selections change
- **Enhanced UI/UX** - Modern glassmorphism design with better animations

## 🚀 Quick Start

### Option 1: Chrome Web Store
- With a simple click add it to your extensions now!
- [Chrome Extension](https://chromewebstore.google.com/detail/quran-sunnah-companion/okkohadnmodfaienacdlfaledjblcbka?hl=en-US&utm_source=ext_sidebar)

### Option 2: Install Manually (Available Now)

**Don't worry if you're not technical! These steps are designed for everyone.**

#### Step 1: Download the Extension
1. Go to the [GitHub repository](https://github.com/Abdalla-Eldoumani/islam-extension)
2. Click the green **"Code"** button
3. Select **"Download ZIP"**
4. Save the file to your computer (usually goes to Downloads folder)
5. **Extract/Unzip** the downloaded file:
   - **Windows**: Right-click the ZIP file → "Extract All"
   - **Mac**: Double-click the ZIP file
   - **Linux**: Right-click → "Extract Here"

#### Step 2: Enable Developer Mode in Chrome
1. Open **Google Chrome**
2. Type `chrome://extensions` in the address bar and press Enter
   - Or click the three dots (⋮) → **More tools** → **Extensions**
3. In the top-right corner, toggle **"Developer mode"** to ON
   - You'll see a blue switch that should be activated

#### Step 3: Load the Extension
1. Click the **"Load unpacked"** button (appears after enabling Developer mode)
2. Navigate to the folder where you extracted the ZIP file
3. Select the **main folder** (should be named `islam-extension-main` or similar)
4. Click **"Select Folder"** (Windows) or **"Open"** (Mac)

#### Step 4: Pin the Extension (Recommended)
1. Look for the puzzle piece icon (🧩) in your Chrome toolbar
2. Click it to see your extensions
3. Find **"Qur'an & Sunnah Companion"** and click the pin icon (📌)
4. The extension icon will now appear directly in your toolbar

#### Step 5: Start Using!
1. Click the extension icon in your toolbar
2. Select a Surah and reciter
3. Click **Play** to start listening
4. Explore Hadith and set up Dhikr reminders

### Option 3: Firefox

Full **feature-parity Firefox build** is included under `firefox/` with **native Manifest V2 support**.

1. Download/clone the repo and open the `firefox` folder.
2. In Firefox, visit `about:addons` → ⚙︎ **Install Add-on From File…** and select `manifest.json` (or use `about:debugging` → **Load Temporary Add-on** in developer mode).

**New Firefox features:**
- **Direct audio playback** in background (no offscreen documents needed)
- **French language support** for complete trilingual experience
- **26 enhanced Dhikr** with comprehensive reward translations
- All Chrome UI/UX improvements and smart input handling

## 📱 How to Use

### 🎵 Playing Qur'an
1. **Select a Surah** from the dropdown (1-114)
2. **Search or pick a reciter** from the **300+** available (type to filter)
3. **Click Play** to start listening (audio keeps playing when you close the popup)
4. **Enable Autoplay** to move to the next Surah automatically
5. **Use the progress bar** to skip to different parts

### 📖 Reading Hadith
- Fresh authentic Hadith loads automatically
- Content refreshes each time you open the extension

### 🔔 Setting Up Dhikr Reminders
1. **Click "Notifications: OFF"** to enable
2. **Set your preferred interval** (30 seconds to 1 hour)
3. **Use preset buttons** for quick setup (30s, 1m, 5m, 15m)
4. **Allow notifications** when Chrome asks for permission

## 🛠️ Technical Details

### Built With
- **Manifest V3** - Latest Chrome extension standard
- **Vanilla JavaScript** - No frameworks, pure performance
- **CSS Grid & Flexbox** - Modern, responsive design
- **Chrome APIs** - Storage, Alarms, Notifications, Offscreen

### APIs Used
- **Quran.com Catalog API** – Surah metadata & primary audio streams
- **MP3Quran.net API** – high-bit-rate MP3 mirrors (with server-side caching)
- **Islamic.network Recitations API** – additional reciters & styles
- **Hadith Gading API** – 9 classical Arabic books
- **Hadith-API CDN** – English translations (Bukhārī/Muslim …)
- **Local Dhikr Collection** – Offline-ready assets

### Browser Compatibility
- **Chrome / Chromium 109+** (Manifest V3)
- **Firefox 109+** (Manifest V2 build inside `firefox/`)
- **Microsoft Edge** & other Chromium browsers with MV3 support

## 🤝 Open Source

This project is **100% open source** under the MIT License, which means:

✅ **Free to use** for personal and commercial purposes  
✅ **Free to modify** and create your own versions  
✅ **Free to distribute** and share with others  
✅ **No restrictions** on how you use the code  

### Contributing
We welcome contributions! Whether you're:
- 🐛 **Reporting bugs**
- 💡 **Suggesting features** 
- 🔧 **Fixing issues**
- 📖 **Improving documentation**
- 🌍 **Adding translations**

Feel free to open an issue or submit a pull request on GitHub.

### Development Setup
```bash
# Clone the repository
git clone https://github.com/Abdalla-Eldoumani/islam-extension.git

# Navigate to the project
cd islam-extension
```

## 🔒 Privacy & Permissions

### What We Access
- **Storage** - Save your preferences (Surah, reciter, autoplay settings)
- **Alarms** - Schedule Dhikr reminder notifications
- **Notifications** - Show Dhikr reminders
- **Audio Domains** - Access Qur'an audio files from trusted sources

### What We DON'T Do
❌ Collect personal information  
❌ Track your browsing  
❌ Send data to external servers  
❌ Require accounts or logins  
❌ Show advertisements  

## 📞 Support & Feedback

### Having Issues?
1. **Check the troubleshooting section** below
2. **Open an issue** on GitHub with details
3. **Contact us** through the repository

### Troubleshooting

**Audio won't play?**
- Check your internet connection
- Try a different reciter or Surah
- Ensure Chrome has audio permissions

**Notifications not working?**
- Allow notifications when Chrome asks
- Check Chrome's notification settings
- Try disabling and re-enabling in the extension
- Be persistent with the toggle button - try again if it doesn't respond immediately

**Extension won't load?**
- Make sure Developer mode is enabled
- Try refreshing the extension in chrome://extensions
- Check that you selected the correct folder

## 📜 License

```
MIT License

Copyright (c) 2025 Qur'an & Sunnah Companion

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 🙏 Acknowledgments

- **First and formost all praise is due to Allah (SWT)**
- **Quran.com** for providing the excellent API
- **All the reciters** whose beautiful recitations make this possible
- **The Muslim developer community** for inspiration and feedback
- **Contributors and testers** who help improve the extension

---

**May Allah (SWT) accept this small effort and make it beneficial for the Ummah. Ameen.** 🤲

*If this extension benefits you, please remember us in your duas and consider starring the repository to help others discover it.* 

## Recent Updates & Improvements

### ✨ Version 1.5.0 Highlights
* **French language support** - Complete trilingual interface (English, Arabic, French)
* **Enhanced Dhikr collection** - 6 new high-reward authentic supplications added
* **Smart resume functionality** - Resume button intelligently changes to Play when selections change  
* **Improved UI/UX** - Modern glassmorphism design with enhanced animations
* **Firefox optimization** - Direct background audio playback without offscreen documents
* **Comprehensive reward translations** - All Dhikr rewards available in all three languages

## Known Issues & Limitations

1. **Notification Toggle (Chrome)**: Occasionally unresponsive, requires persistence from users.
2. **Audio Loading**: Some reciters may have limited sura availability.
3. **Autoplay**: Requires user interaction for first play (browser autoplay policy).

## 🌐 Trilingual Interface
- **One-tap language switcher** (English ⇄ Français ⇄ العربية) right in the header
- Direction, fonts, labels, Surah names & Dhikr rewards localize instantly
- **Complete French support** - Hadiths, Dhikr rewards, and UI elements
- **RTL support** for Arabic with proper font rendering
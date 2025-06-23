# 🕌 Qur'an & Sunnah Companion

> **Your pocket-size īmān boost in every tab** ✨

A lightweight, privacy-respectful Chrome extension that brings Qur'an recitation, authentic Hadith, and Dhikr reminders directly to your browser—without navigating away from your current tab.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)](https://developer.chrome.com/docs/extensions/mv3/intro/)

## 🌟 Features

### 📖 Qur'an Recitation
- **3 renowned reciters** available:
  - **Abdul Basit** (Murattal & Mujawwad styles)
  - **Mahmoud Khalil Al-Hussary** (Muallim style)
  - **Siddiq Minshawi** (Murattal style)
- **All 114 Surahs** with high-quality audio
- **Autoplay functionality** to continue through multiple Surahs
- **Progress tracking** with seek controls
- **Persistent playback** - audio continues even when popup is closed

### 📚 Authentic Hadith
- **Sahih Bukhari collection** with random authentic narrations
- **Arabic text** for those who can read it
- **Fresh content** loads automatically

### 🤲 Dhikr Reminders
- **20+ authentic Dhikr** with rewards and transliterations
- **Customizable notifications** (30 seconds to 1 hour intervals)
- **Background reminders** to keep you connected throughout the day
- **Authentic rewards** mentioned for each remembrance

### 🔒 Privacy & Performance
- **Zero personal data collection** - completely private
- **No external accounts required** - works immediately
- **Lightweight design** - minimal impact on browser performance
- **Offline-ready** Dhikr collection

## 🚀 Quick Start

### Option 1: Chrome Web Store (Coming Soon)
*The extension is currently under review for the Chrome Web Store. Once approved, you'll be able to install it with one click.*

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

### 🎥 Video Tutorial
*Coming soon - we'll add a video walkthrough for visual learners!*

## 📱 How to Use

### 🎵 Playing Qur'an
1. **Select a Surah** from the dropdown (1-114)
2. **Choose a reciter** from renowned scholars
3. **Click Play** to start listening
4. **Enable Autoplay** to continue to the next Surah automatically
5. **Use progress bar** to skip to different parts

### 📖 Reading Hadith
- Fresh authentic Hadith loads automatically
- Content refreshes each time you open the extension

### 🔔 Setting Up Dhikr Reminders
1. **Click "Notifications: OFF"** to enable
2. **Set your preferred interval** (30 seconds to 1 hour)
3. **Use preset buttons** for quick setup (30s, 1m, 5m, 15m)
4. **Allow notifications** when Chrome asks for permission

> **⚠️ Note**: The notification toggle button may occasionally be unresponsive. If it doesn't work immediately, please be persistent and try again after a few moments. We're actively working to resolve this issue.

## 🛠️ Technical Details

### Built With
- **Manifest V3** - Latest Chrome extension standard
- **Vanilla JavaScript** - No frameworks, pure performance
- **CSS Grid & Flexbox** - Modern, responsive design
- **Chrome APIs** - Storage, Alarms, Notifications, Offscreen

### APIs Used
- **Quran.com API** - Surah data and audio files
- **Hadith API** - Authentic Sahih Bukhari collection
- **Local Dhikr Collection** - No external dependencies

### Browser Compatibility
- **Chrome 109+** (required for Offscreen API)
- **Microsoft Edge 109+** (Chromium-based)
- **Other Chromium browsers** with Manifest V3 support

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

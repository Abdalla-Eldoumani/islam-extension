/**
 * Background service worker for Qur'an & Sunnah Companion
 * Handles offscreen document creation, message forwarding for audio playback, and Dhikr notifications.
 */

const dhikrCollection = [
  {
    arabic: 'سُبْحَانَ اللَّهِ',
    english: 'Glory be to Allah',
    transliteration: 'Subhan Allah',
    reward: 'Each recitation equals a tree planted in Paradise'
  },
  {
    arabic: 'الْحَمْدُ لِلَّهِ',
    english: 'Praise be to Allah',
    transliteration: 'Alhamdulillah',
    reward: 'Fills the scales of good deeds'
  },
  {
    arabic: 'اللَّهُ أَكْبَرُ',
    english: 'Allah is the Greatest',
    transliteration: 'Allahu Akbar',
    reward: 'Fills what is between heaven and earth'
  },
  {
    arabic: 'لَا إِلَٰهَ إِلَّا اللَّهُ',
    english: 'There is no god but Allah',
    transliteration: 'La ilaha illa Allah',
    reward: 'The best of remembrance, heaviest on the scales'
  },
  {
    arabic: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ',
    english: 'Glory be to Allah and praise be to Him',
    transliteration: 'Subhan Allahi wa bihamdihi',
    reward: '100 sins erased, even if like foam on the sea'
  },
  {
    arabic: 'أَسْتَغْفِرُ اللَّهَ',
    english: 'I seek forgiveness from Allah',
    transliteration: 'Astaghfirullah',
    reward: 'Opens doors of mercy and provision'
  },
  {
    arabic: 'لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ',
    english: 'There is no power except with Allah',
    transliteration: 'La hawla wa la quwwata illa billah',
    reward: 'A treasure from the treasures of Paradise'
  }
];

let dhikrAlarmName = 'dhikr-reminder';
let dhikrTimeoutId = null;
let dhikrIntervalSeconds = 60;
let dhikrNotificationsActive = false;
let dhikrReminderMode = 'notification'; // 'notification' | 'popup'

// ---- HELPER PROMISE WRAPPERS -------------------------------------------------
/**
 * Chrome's notifications.getPermissionLevel historically supported only the
 * callback form.  In newer Chrome versions a promise form is available, but we
 * still need to support both to avoid runtime errors that can silently break
 * the start/stop logic.  This helper normalises the API into a Promise that
 * always resolves with the permission string (`granted`, `denied`, `default`).
 * @returns {Promise<'granted'|'denied'|'default'>}
 */
function getNotificationPermissionLevel() {
  // Newer Chrome releases (>=116) return a promise when no callback is
  // supplied.  Detect this by checking the function length (expected
  // callback-arity of 1 in the classic API).
  try {
    if (chrome.notifications.getPermissionLevel.length === 0) {
      // Promise variant available.
      return chrome.notifications.getPermissionLevel();
    }
  } catch (_) {
    // Fall back to callback style below.
  }

  // Fallback for older Chrome versions – wrap the callback style.
  return new Promise((resolve) => {
    try {
      chrome.notifications.getPermissionLevel((level) => {
        // In very old versions the callback can be undefined; treat it as
        // 'denied' so we fail gracefully.
        resolve(level || 'denied');
      });
    } catch (err) {
      console.error('getPermissionLevel callback form failed:', err);
      resolve('denied');
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background: Message received from:', sender.tab ? 'content script' : (sender.url?.includes('popup') ? 'popup' : 'offscreen'), message);
  console.log('Background: Sender details:', { tab: sender.tab, url: sender.url, origin: sender.origin });
  
  // Single message router - prevents multiple handlers from processing the same message
  handleMessage(message, sender, sendResponse);
  
  // Always return true to keep the message channel open for async responses
  return true;
});

// Track ongoing operations to prevent race conditions
const ongoingOperations = new Map();

async function handleMessage(message, sender, sendResponse) {
  try {
    // Handle ping messages immediately (synchronous)
    if (message.action === 'ping') {
      console.log('Background: Responding to ping');
      sendResponse({ success: true, message: 'Background script is alive' });
      return;
    }
    
    // Ignore messages from the offscreen document itself to prevent loops
    if (!sender.tab && sender.url && sender.url.includes('offscreen.html')) {
      console.log('Background: Ignoring message from offscreen document to prevent loops');
      sendResponse({ success: false, error: 'Message from offscreen document ignored' });
      return;
    }

    // Route dhikr notification messages
    if (message.action === 'startDhikrNotifications' || 
        message.action === 'stopDhikrNotifications' || 
        message.action === 'updateDhikrInterval' ||
        message.action === 'updateDhikrMode') {
      
      // Prevent duplicate operations with timestamp tracking
      const operationKey = `dhikr-${message.action}`;
      const now = Date.now();
      const lastOperationTime = ongoingOperations.get(operationKey);
      
      if (lastOperationTime && (now - lastOperationTime) < 2000) {
        console.log(`Background: Operation ${operationKey} called too recently (${now - lastOperationTime}ms ago), rejecting duplicate`);
        sendResponse({ success: false, error: 'Operation called too frequently, please wait' });
        return;
      }
      
      ongoingOperations.set(operationKey, now);
      console.log(`Background received message: ${message.action}`, message);
      
      try {
        await handleDhikrMessage(message, sendResponse);
      } finally {
        // Keep the timestamp for a short while to prevent rapid calls
        setTimeout(() => {
          ongoingOperations.delete(operationKey);
        }, 1000);
      }
      return;
    }

    // Route audio messages
    if (message.action === 'playAudio' || 
        message.action === 'pauseAudio' || 
        message.action === 'resumeAudio' || 
        message.action === 'seekAudio' || 
        message.action === 'getAudioState') {
      
      console.log(`Background received message: ${message.action}`, message);
      await handleAudioMessage(message, sendResponse);
      return;
    }

    // Handle unknown actions
    console.error('Background: Unknown action received:', message.action);
    sendResponse({ success: false, error: `Unknown action: ${message.action}` });
    
  } catch (error) {
    console.error('Background: Error in handleMessage:', error);
    sendResponse({ success: false, error: `Message handling failed: ${error.message}` });
  }
}

async function handleDhikrMessage(message, sendResponse) {
  try {
    // Validate message structure
    if (!message || typeof message.action !== 'string') {
      throw new Error('Invalid message format');
    }

    if (message.action === 'startDhikrNotifications') {
      // Validate interval parameter
      if (typeof message.interval !== 'number' || message.interval < 5 || message.interval > 3600) {
        throw new Error('Invalid interval: must be a number between 5 and 3600 seconds');
      }
      
      await startDhikrNotifications(message.interval, message.mode);
      console.log('Background: startDhikrNotifications completed successfully');
      sendResponse({ success: true, message: 'Notifications started successfully' });
      
    } else if (message.action === 'stopDhikrNotifications') {
      await stopDhikrNotifications();
      console.log('Background: stopDhikrNotifications completed successfully');
      sendResponse({ success: true, message: 'Notifications stopped successfully' });
      
    } else if (message.action === 'updateDhikrInterval') {
      // Validate interval parameter
      if (typeof message.interval !== 'number' || message.interval < 5 || message.interval > 3600) {
        throw new Error('Invalid interval: must be a number between 5 and 3600 seconds');
      }
      
      await updateDhikrInterval(message.interval);
      console.log('Background: updateDhikrInterval completed successfully');
      sendResponse({ success: true, message: 'Interval updated successfully' });
      
    } else if (message.action === 'updateDhikrMode') {
      if (typeof message.mode !== 'string' || (message.mode !== 'notification' && message.mode !== 'popup')) {
        throw new Error('Invalid mode: must be "notification" or "popup"');
      }
      dhikrReminderMode = message.mode;
      console.log('Background: updateDhikrMode ->', dhikrReminderMode);
      sendResponse({ success: true, message: 'Mode updated successfully' });
      
    } else {
      throw new Error(`Unknown dhikr action: ${message.action}`);
    }
  } catch (error) {
    console.error(`Background: ${message.action} failed:`, error);
    sendResponse({ 
      success: false, 
      error: error.message || 'Unknown error occurred',
      action: message.action 
    });
  }
}

async function handleAudioMessage(message, sendResponse) {
  try {
    // For any audio action, ensure the offscreen document exists.
    console.log('Background: Creating offscreen document if needed...');
    await createOffscreenDocumentIfNeeded();
    console.log('Background: Offscreen document ready');
    
    // Forward the message to the offscreen document.
    console.log('Background: Forwarding message to offscreen document...');
    
    // Use a Promise to properly handle the async message passing
    const offscreenResponse = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          console.error('Background: Error forwarding to offscreen:', chrome.runtime.lastError.message);
          reject(new Error(`Offscreen communication failed: ${chrome.runtime.lastError.message}`));
        } else {
          console.log('Background: Received response from offscreen:', response);
          resolve(response);
        }
      });
    });
    
    // Check the response from offscreen document
    if (!offscreenResponse) {
      console.error('Background: No response received from offscreen document');
      sendResponse({ success: false, error: 'No response from audio player' });
    } else if (!offscreenResponse.success) {
      console.error('Background: Offscreen document returned error:', offscreenResponse.error);
      sendResponse({ success: false, error: offscreenResponse.error || 'Audio playback failed' });
    } else {
      console.log('Background: Sending successful response to popup');
      
      // Start audio monitoring for autoplay when audio starts playing
      if (message.action === 'playAudio') {
        startAudioMonitoring();
      }
      
      sendResponse(offscreenResponse);
    }
    
  } catch (error) {
    console.error('Background: Error in handleAudioMessage:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function createOffscreenDocumentIfNeeded() {
  try {
    const hasDocument = await chrome.offscreen.hasDocument();
    if (hasDocument) {
      console.log('Background: Offscreen document already exists.');
      return;
    }

    console.log('Background: Creating new offscreen document...');
    await chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Keep Qur\'an audio playing when popup closes'
    });
    console.log('Background: Offscreen document created successfully');
    
    // Give the offscreen document a moment to initialize
    await new Promise(resolve => setTimeout(resolve, 100));
    
  } catch (error) {
    console.error('Background: Failed to create offscreen document:', error);
    throw new Error(`Failed to create audio player: ${error.message}`);
  }
}

// --- DHIKR NOTIFICATION FUNCTIONS ---

async function startDhikrNotifications(intervalSeconds, mode = 'notification') {
  try {
    console.log('Background: Starting Dhikr notifications with interval:', intervalSeconds, 'seconds');
    
    // If using classic notifications, ensure permission is granted
    if (mode === 'notification') {
      const permissionLevel = await getNotificationPermissionLevel();
      console.log('Background: Notification permission level:', permissionLevel);
      if (permissionLevel === 'denied') {
        throw new Error('Notifications are disabled. Please enable notifications for this extension in Chrome settings.');
      }
    }
    
    // Stop any existing notifications first
    await stopDhikrNotifications();
    
    // Store the interval and mark as active
    dhikrIntervalSeconds = intervalSeconds;
    dhikrNotificationsActive = true;
    dhikrReminderMode = mode;
    
    if (intervalSeconds >= 60) {
      // Use chrome.alarms for intervals >= 1 minute
      const periodMinutes = intervalSeconds / 60;
      console.log('Background: Using chrome.alarms with period:', periodMinutes, 'minutes');
      
      await chrome.alarms.create(dhikrAlarmName, {
        delayInMinutes: periodMinutes,
        periodInMinutes: periodMinutes,
      });
      
      console.log('Background: Dhikr alarm created successfully');
    } else {
      // Use setTimeout for intervals < 1 minute
      console.log('Background: Using setTimeout for sub-minute interval:', intervalSeconds, 'seconds');
      scheduleNextDhikrTimeout();
    }
    
    // Show a test notification immediately to confirm it's working
    setTimeout(() => {
      showDhikrNotification(true);
    }, 2000);
    
  } catch (error) {
    console.error('Background: Failed to start Dhikr notifications:', error);
    dhikrNotificationsActive = false;
    throw error;
  }
}

async function stopDhikrNotifications() {
  try {
    console.log('Background: Stopping Dhikr notifications');
    
    // Mark as inactive first
    dhikrNotificationsActive = false;
    
    // Clear chrome.alarms
    await chrome.alarms.clear(dhikrAlarmName);
    console.log('Background: Dhikr alarm cleared successfully');
    
    // Clear setTimeout
    if (dhikrTimeoutId) {
      clearTimeout(dhikrTimeoutId);
      dhikrTimeoutId = null;
      console.log('Background: Dhikr timeout cleared successfully');
    }
    
  } catch (error) {
    console.error('Background: Failed to stop Dhikr notifications:', error);
    throw error;
  }
}

async function updateDhikrInterval(intervalSeconds) {
  try {
    console.log('Background: Updating Dhikr interval to:', intervalSeconds, 'seconds');
    
    if (dhikrNotificationsActive) {
      // Restart with new interval
      await startDhikrNotifications(intervalSeconds, dhikrReminderMode);
    }
  } catch (error) {
    console.error('Background: Failed to update Dhikr interval:', error);
    throw error;
  }
}

function getRandomDhikr() {
  return dhikrCollection[Math.floor(Math.random() * dhikrCollection.length)];
}

// Show Dhikr in a small extension popup window ------------------------------
async function showDhikrPopup(dhikr, isTest = false) {
  try {
    // Store current dhikr so the popup page can read it
    await chrome.storage.local.set({ currentDhikr: dhikr });

    // Create a focused popup window
    await chrome.windows.create({
      url: chrome.runtime.getURL('popup/reminder.html'),
      type: 'popup',
      width: 420,
      height: 320,
      focused: true
    });
    console.log('Background: Dhikr popup window opened');
  } catch (err) {
    console.error('Background: Failed to open Dhikr popup window:', err);
  }
}

// Handle alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === dhikrAlarmName) {
    console.log('Background: Dhikr alarm triggered');
    showDhikrNotification();
  }
});

async function showDhikrNotification(isTest = false) {
  try {
    const dhikr = getRandomDhikr();

    // If user selected popup mode, show popup and return early
    if (dhikrReminderMode === 'popup') {
      await showDhikrPopup(dhikr, isTest);
      return;
    }

    // Check notification permission level first (robust polyfill)
    const permissionLevel = await getNotificationPermissionLevel();
    console.log('Background: Current notification permission level:', permissionLevel);
    
    if (permissionLevel === 'denied') {
      console.error('Background: Notifications are denied, cannot show notification');
      return;
    }
    
    // Use chrome.runtime.getURL to get the proper path to the icon
    const iconUrl = chrome.runtime.getURL('assets/icon48.png');
    console.log('Background: Using icon URL:', iconUrl);
    
    // Try Chrome extension notification first (more reliable for popups)
    console.log('Background: Trying Chrome extension notification first...');
    let chromeNotificationWorked = false;
    
    try {
      const chromeNotificationId = await chrome.notifications.create({
        type: 'basic',
        iconUrl: iconUrl,
        title: isTest ? 'Test - Dhikr Reminder 🤲' : 'Dhikr Reminder 🤲',
        message: `${dhikr.arabic}\n${dhikr.english}\n\nReward: ${dhikr.reward}`,
        priority: 2, // High priority
        requireInteraction: true, // Stay visible until user interacts
        silent: false
      });
      
      if (chromeNotificationId) {
        console.log('Background: Chrome extension notification created:', chromeNotificationId);
        chromeNotificationWorked = true;
      }
    } catch (chromeError) {
      console.error('Background: Chrome extension notification failed:', chromeError);
    }
    
    // Fallback to browser notification if Chrome notification failed
    if (!chromeNotificationWorked) {
      console.log('Background: Trying browser notification as fallback...');
      try {
        await createOffscreenDocumentIfNeeded();
        const browserNotificationResponse = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            action: 'showBrowserNotification',
            title: isTest ? 'Test - Dhikr Reminder 🤲' : 'Dhikr Reminder 🤲',
            body: `${dhikr.arabic}\n${dhikr.english}\n\nReward: ${dhikr.reward}`,
            icon: iconUrl,
            requireInteraction: true
          }, response => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        });
        
        if (browserNotificationResponse?.success) {
          console.log('Background: Browser notification succeeded');
          chromeNotificationWorked = true;
        }
      } catch (browserError) {
        console.error('Background: Browser notification failed:', browserError);
      }
    }
    
    // If neither worked, try creating a popup window as last resort
    if (!chromeNotificationWorked && isTest) {
      console.log('Background: Trying popup window as last resort for test...');
      try {
        await chrome.windows.create({
          url: chrome.runtime.getURL('popup/index.html') + '?notification_test=true',
          type: 'popup',
          width: 400,
          height: 200,
          focused: true
        });
        console.log('Background: Test popup window created');
      } catch (popupError) {
        console.error('Background: Failed to create popup window:', popupError);
      }
    }
    
    // As a final fallback, try audio notification
    if (!chromeNotificationWorked && !isTest) {
      console.log('Background: Trying audio notification fallback...');
      try {
        await createOffscreenDocumentIfNeeded();
        await chrome.runtime.sendMessage({
          action: 'playNotificationSound',
          dhikr: dhikr
        });
        console.log('Background: Audio notification sent');
      } catch (audioError) {
        console.error('Background: Audio notification failed:', audioError);
      }
    }
    
    if (isTest) {
      console.log('Background: Test Dhikr notification completed:', dhikr.arabic);
    } else {
      console.log('Background: Dhikr notification completed:', dhikr.arabic);
    }
    
  } catch (error) {
    console.error('Background: Failed to show Dhikr notification:', error);
    console.error('Background: Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
  }
}

// Initialize Dhikr notifications on startup if enabled
chrome.runtime.onStartup.addListener(async () => {
  try {
    const { dhikrSettings } = await chrome.storage.local.get('dhikrSettings');
    if (dhikrSettings?.notificationsEnabled) {
      console.log('Background: Restoring Dhikr notifications on startup with interval:', dhikrSettings.interval || 60, 'and mode:', dhikrSettings.mode || 'notification');
      await startDhikrNotifications(dhikrSettings.interval || 60, dhikrSettings.mode || 'notification');
    }
  } catch (error) {
    console.error('Background: Failed to restore Dhikr notifications on startup:', error);
  }
});

// Also handle installation/update
chrome.runtime.onInstalled.addListener(async () => {
  try {
    const { dhikrSettings } = await chrome.storage.local.get('dhikrSettings');
    if (dhikrSettings?.notificationsEnabled) {
      console.log('Background: Restoring Dhikr notifications after install/update with interval:', dhikrSettings.interval || 60, 'and mode:', dhikrSettings.mode || 'notification');
      await startDhikrNotifications(dhikrSettings.interval || 60, dhikrSettings.mode || 'notification');
    }
  } catch (error) {
    console.error('Background: Failed to restore Dhikr notifications after install/update:', error);
  }
});

// --- AUDIO MONITORING FOR AUTOPLAY ---

let audioMonitoringInterval = null;

async function startAudioMonitoring() {
  if (audioMonitoringInterval) {
    clearInterval(audioMonitoringInterval);
  }
  
  console.log('Background: Starting audio monitoring for autoplay');
  
  audioMonitoringInterval = setInterval(async () => {
    try {
      // Check if offscreen document exists
      const hasDocument = await chrome.offscreen.hasDocument();
      if (!hasDocument) {
        console.log('Background: No offscreen document, stopping audio monitoring');
        stopAudioMonitoring();
        return;
      }
      
      // Get current audio state
      const response = await chrome.runtime.sendMessage({ action: 'getAudioState' });
      if (!response?.success || !response.state?.audioUrl) {
        // No active audio, stop monitoring
        stopAudioMonitoring();
        return;
      }
      
      const state = response.state;
      
      // Check if audio finished (not playing, current time >= duration, and duration > 0)
      if (!state.isPlaying && 
          state.currentTime >= state.duration && 
          state.duration > 0 && 
          state.currentTime > 0) {
        
        console.log('Background: Audio finished, checking autoplay settings');
        
        // Get user settings to check if autoplay is enabled
        const { userSelections } = await chrome.storage.local.get('userSelections');
        
        if (userSelections?.autoplayEnabled) {
          console.log('Background: Autoplay enabled, triggering next sura');
          await handleAutoplayNext(state.suraId, state.reciterKey);
        } else {
          console.log('Background: Autoplay disabled, stopping monitoring');
          stopAudioMonitoring();
        }
      }
      
    } catch (error) {
      console.error('Background: Audio monitoring error:', error);
      // Don't stop monitoring on errors, just log them
    }
  }, 2000); // Check every 2 seconds (less frequent than popup)
}

function stopAudioMonitoring() {
  if (audioMonitoringInterval) {
    clearInterval(audioMonitoringInterval);
    audioMonitoringInterval = null;
    console.log('Background: Stopped audio monitoring');
  }
}

async function handleAutoplayNext(currentSuraId, reciterKey) {
  try {
    console.log(`Background: Autoplay moving from Sura ${currentSuraId} to next`);
    
    // Calculate next sura ID
    const currentId = parseInt(currentSuraId);
    const nextSuraId = currentId >= 114 ? '1' : (currentId + 1).toString();
    
    console.log(`Background: Playing next sura: ${nextSuraId} with reciter: ${reciterKey}`);
    
    // Get the audio URL for the next sura
    const audioUrl = await getNextSuraAudioUrl(reciterKey, nextSuraId);
    
    // Play the next sura
    const playResponse = await chrome.runtime.sendMessage({
      action: 'playAudio',
      audioUrl: audioUrl,
      suraId: nextSuraId,
      reciterKey: reciterKey,
    });
    
    if (playResponse?.success) {
      // Update user selections to reflect the new sura
      const { userSelections } = await chrome.storage.local.get('userSelections');
      if (userSelections) {
        userSelections.suraId = nextSuraId;
        userSelections.timestamp = Date.now();
        await chrome.storage.local.set({ userSelections });
        console.log('Background: Updated user selections for autoplay');
      }
      
      console.log('Background: Autoplay successful, continuing monitoring');
    } else {
      console.error('Background: Autoplay failed:', playResponse?.error);
      stopAudioMonitoring();
    }
    
  } catch (error) {
    console.error('Background: Autoplay error:', error);
    stopAudioMonitoring();
  }
}

// Cache for MP3Quran catalogue lookups to avoid hitting the API repeatedly.
const mp3quranCache = {};

async function getMp3QuranReciterById(id) {
  if (mp3quranCache[id]) return mp3quranCache[id];
  try {
    const res = await fetch('https://www.mp3quran.net/api/_english.json');
    const data = await res.json();
    const reciter = data.reciters?.find(r => String(r.id) === String(id));
    if (reciter) mp3quranCache[id] = reciter;
    return reciter;
  } catch (err) {
    console.error('Background: Failed to fetch MP3Quran catalogue:', err);
    return null;
  }
}

async function getNextSuraAudioUrl(reciterKey, suraId) {
  // Detect provider prefix
  let provider = 'qc';
  let rawId = reciterKey;
  if (reciterKey.includes(':')) {
    const parts = reciterKey.split(':');
    provider = parts[0];
    rawId = parts.slice(1).join(':');
  }

  // MP3Quran provider -----------------------------------------------------------
  if (provider === 'mp3') {
    const reciter = await getMp3QuranReciterById(rawId);
    if (!reciter) throw new Error('Reciter not found in MP3Quran catalogue');
    const base = reciter.Server.endsWith('/') ? reciter.Server : reciter.Server + '/';
    const suraStr = String(suraId).padStart(3, '0');
    return `${base}${suraStr}.mp3`;
  }

  // Islamic.network provider ----------------------------------------------------
  if (provider === 'islamic') {
    const slug = rawId; // e.g. ar.alafasy
    return `https://cdn.islamic.network/quran/audio/128/${slug}/${suraId}.mp3`;
  }

  // Default: Quran.com -----------------------------------------------------------
  const reciterId = rawId;

  // Try to get full chapter audio first
  const chapterUrl = `https://api.quran.com/api/v4/chapter_recitations/${reciterId}/${suraId}`;
  console.log('Background: Fetching chapter audio from:', chapterUrl);
  try {
    const chapterResponse = await fetch(chapterUrl);
    if (chapterResponse.ok) {
      const chapterData = await chapterResponse.json();
      if (chapterData.audio_file?.audio_url) {
        const audioUrl = chapterData.audio_file.audio_url;
        return audioUrl.startsWith('http') ? audioUrl : `https://verses.quran.com/${audioUrl}`;
      }
    }
  } catch (error) {
    console.log('Background: Chapter audio not available, trying verse-by-verse approach:', error.message);
  }

  // Fallback to verse-by-verse audio
  const versesUrl = `https://api.quran.com/api/v4/recitations/${reciterId}/by_chapter/${suraId}`;
  console.log('Background: Fetching verse audio from:', versesUrl);
  const response = await fetch(versesUrl);
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
  }
  const data = await response.json();
  if (!data.audio_files || data.audio_files.length === 0) {
    throw new Error('No audio files found in API response.');
  }
  const firstAudio = data.audio_files[0];
  let audioUrl = firstAudio.url || firstAudio.audio_url;
  if (!audioUrl) throw new Error('Audio URL not found in API response.');
  if (audioUrl.startsWith('//')) {
    return `https:${audioUrl}`;
  } else if (audioUrl.startsWith('http')) {
    return audioUrl;
  } else {
    return `https://verses.quran.com/${audioUrl}`;
  }
}

// Add new function to handle setTimeout-based notifications
function scheduleNextDhikrTimeout() {
  if (!dhikrNotificationsActive) {
    console.log('Background: Dhikr notifications are not active, stopping timeout scheduling');
    return;
  }
  
  console.log('Background: Scheduling next dhikr notification in', dhikrIntervalSeconds, 'seconds');
  
  dhikrTimeoutId = setTimeout(() => {
    if (dhikrNotificationsActive) {
      console.log('Background: Timeout triggered, showing dhikr notification');
      showDhikrNotification(false);
      // Schedule the next one
      scheduleNextDhikrTimeout();
    }
  }, dhikrIntervalSeconds * 1000);
} 
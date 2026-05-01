/**
 * Background script for Qur'an & Sunnah Companion (Firefox)
 * Handles audio playback directly and Dhikr notifications.
 */

import { getRandomDhikr } from '../shared/dhikr.js';
import { getSuraAudioUrl as getSuraAudioUrlShared } from '../shared/audio-urls.js';

// ---------------------------------------------------------------------------
// Logging control – keep errors/warnings but silence verbose logs in release
// ---------------------------------------------------------------------------
if (typeof console !== 'undefined') {
  console._log = console.log;
  console._warn = console.warn;
  console._error = console.error;
  const ENV_PROD = true; // flip to false when actively debugging background
  if (ENV_PROD) {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  }
}


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
    if (browser.notifications.getPermissionLevel.length === 0) {
      // Promise variant available.
      return browser.notifications.getPermissionLevel();
    }
  } catch (_) {
    // Fall back to callback style below.
  }

  // Fallback for older Chrome versions – wrap the callback style.
  return new Promise((resolve) => {
    try {
      browser.notifications.getPermissionLevel((level) => {
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

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

// Firefox audio state management
let audioPlayer = null;
let currentAudioState = {
  audioUrl: null,
  suraId: null,
  reciterKey: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  timestamp: Date.now()
};

async function handleAudioMessage(message, sendResponse) {
  try {
    console.log('Background: Handling audio message:', message.action);
    
    switch (message.action) {
      case 'playAudio':
        await playAudio(message.audioUrl, message.suraId, message.reciterKey);
        break;
      case 'pauseAudio':
        pauseAudio();
        break;
      case 'resumeAudio':
        resumeAudio();
        break;
      case 'seekAudio':
        seekAudio(message.time);
        break;
      case 'getAudioState':
        updateCurrentTime();
        break;
      default:
        throw new Error(`Unknown audio action: ${message.action}`);
    }
    
    sendResponse({ success: true, state: currentAudioState });
    
  } catch (error) {
    console.error('Background: Error in handleAudioMessage:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function playAudio(audioUrl, suraId, reciterKey) {
  try {
    // Stop any existing audio
    if (audioPlayer) {
      audioPlayer.pause();
      audioPlayer.src = '';
    }
    
    // Create new audio element
    audioPlayer = new Audio(audioUrl);
    audioPlayer.preload = 'auto';
    
    // Update state
    currentAudioState = {
      audioUrl,
      suraId,
      reciterKey,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      timestamp: Date.now()
    };
    
    // Set up event listeners
    audioPlayer.addEventListener('loadedmetadata', () => {
      currentAudioState.duration = audioPlayer.duration;
    });
    
    audioPlayer.addEventListener('timeupdate', () => {
      currentAudioState.currentTime = audioPlayer.currentTime;
      currentAudioState.timestamp = Date.now();
    });
    
    audioPlayer.addEventListener('play', () => {
      currentAudioState.isPlaying = true;
    });
    
    audioPlayer.addEventListener('pause', () => {
      currentAudioState.isPlaying = false;
    });
    
    audioPlayer.addEventListener('ended', () => {
      currentAudioState.isPlaying = false;
    });
    
    // Start playback
    await audioPlayer.play();
    currentAudioState.isPlaying = true;
    
    console.log('Background: Audio playback started');
    
  } catch (error) {
    console.error('Background: Audio playback failed:', error);
    throw new Error(`Audio playback failed: ${error.message}`);
  }
}

function pauseAudio() {
  if (audioPlayer && !audioPlayer.paused) {
    audioPlayer.pause();
    currentAudioState.isPlaying = false;
    console.log('Background: Audio paused');
  }
}

function resumeAudio() {
  if (audioPlayer && audioPlayer.paused) {
    audioPlayer.play();
    currentAudioState.isPlaying = true;
    console.log('Background: Audio resumed');
  }
}

function seekAudio(time) {
  if (audioPlayer) {
    audioPlayer.currentTime = time;
    currentAudioState.currentTime = time;
    console.log('Background: Audio seeked to', time);
  }
}

function updateCurrentTime() {
  if (audioPlayer) {
    currentAudioState.currentTime = audioPlayer.currentTime;
    currentAudioState.duration = audioPlayer.duration || 0;
    currentAudioState.timestamp = Date.now();
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
      // Use browser.alarms for intervals >= 1 minute
      const periodMinutes = intervalSeconds / 60;
      console.log('Background: Using browser.alarms with period:', periodMinutes, 'minutes');
      
      await browser.alarms.create(dhikrAlarmName, {
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
    
    // Clear browser.alarms
    await browser.alarms.clear(dhikrAlarmName);
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

// Show Dhikr in a small extension popup window ------------------------------
async function showDhikrPopup(dhikr, isTest = false) {
  try {
    // Store current dhikr so the popup page can read it
    await browser.storage.local.set({ currentDhikr: dhikr });

    // Create a focused popup window
    await browser.windows.create({
      url: browser.runtime.getURL('popup/reminder.html'),
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
browser.alarms.onAlarm.addListener((alarm) => {
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
    
    // Use browser.runtime.getURL to get the proper path to the icon
    const iconUrl = browser.runtime.getURL('assets/icon48.png');
    console.log('Background: Using icon URL:', iconUrl);
    
    // Try Chrome extension notification first (more reliable for popups)
    console.log('Background: Trying Chrome extension notification first...');
    let browserNotificationWorked = false;
    
    try {
      const browserNotificationId = await browser.notifications.create({
        type: 'basic',
        iconUrl: iconUrl,
        title: isTest ? 'Test - Dhikr Reminder' : 'Dhikr Reminder',
        message: `${dhikr.arabic}\n${dhikr.english}\n\nReward: ${dhikr.reward}`,
        priority: 2, // High priority
        requireInteraction: true, // Stay visible until user interacts
        silent: false
      });
      
      if (browserNotificationId) {
        console.log('Background: Chrome extension notification created:', browserNotificationId);
        browserNotificationWorked = true;
        // Auto-dismiss after 60 seconds even with requireInteraction set.
        setTimeout(() => {
          browser.notifications.clear(browserNotificationId).catch(() => {});
        }, 60_000);
      }
    } catch (browserError) {
      console.error('Background: Chrome extension notification failed:', browserError);
    }
    
    // Fallback to browser notification if Chrome notification failed
    if (!browserNotificationWorked) {
      console.log('Background: Trying browser notification as fallback...');
      try {
        // Create browser notification directly in Firefox
        try {
          const fallbackId = `dhikr-${Date.now()}`;
          await browser.notifications.create(fallbackId, {
            type: 'basic',
            iconUrl: iconUrl,
            title: isTest ? 'Test - Dhikr Reminder' : 'Dhikr Reminder',
            message: `${dhikr.arabic}\n${dhikr.english}\n\nReward: ${dhikr.reward}`,
            requireInteraction: true
          });
          setTimeout(() => {
            browser.notifications.clear(fallbackId).catch(() => {});
          }, 60_000);
          console.log('Background: Firefox notification created successfully');
          browserNotificationWorked = true;
        } catch (notificationError) {
          console.error('Background: Firefox notification failed:', notificationError);
        }
      } catch (browserError) {
        console.error('Background: Browser notification failed:', browserError);
      }
    }
    
    // If neither worked, try creating a popup window as last resort
    if (!browserNotificationWorked && isTest) {
      console.log('Background: Trying popup window as last resort for test...');
      try {
        await browser.windows.create({
          url: browser.runtime.getURL('popup/index.html') + '?notification_test=true',
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
    if (!browserNotificationWorked && !isTest) {
      console.log('Background: Trying audio notification fallback...');
      try {
        // Firefox can play audio directly in background
        const notificationSound = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBS6O2fPLeSsFJoHO8diJNwgcb7/x555NEA1VqePxuGEbBzuT2fHNeSsFJgAA');
        notificationSound.volume = 0.3;
        await notificationSound.play();
        console.log('Background: Audio notification played');
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
browser.runtime.onStartup.addListener(async () => {
  try {
    const { dhikrSettings } = await browser.storage.local.get('dhikrSettings');
    if (dhikrSettings?.notificationsEnabled) {
      console.log('Background: Restoring Dhikr notifications on startup with interval:', dhikrSettings.interval || 60, 'and mode:', dhikrSettings.mode || 'notification');
      await startDhikrNotifications(dhikrSettings.interval || 60, dhikrSettings.mode || 'notification');
    }
  } catch (error) {
    console.error('Background: Failed to restore Dhikr notifications on startup:', error);
  }
});

// Also handle installation/update
browser.runtime.onInstalled.addListener(async () => {
  try {
    const { dhikrSettings } = await browser.storage.local.get('dhikrSettings');
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
      // Check if audio player exists
      if (!audioPlayer || !currentAudioState.audioUrl) {
        console.log('Background: No audio player, stopping audio monitoring');
        stopAudioMonitoring();
        return;
      }
      
      // Update current state
      updateCurrentTime();
      const state = currentAudioState;
      
      // Check if audio finished (not playing, current time >= duration, and duration > 0)
      if (!state.isPlaying && 
          state.currentTime >= state.duration && 
          state.duration > 0 && 
          state.currentTime > 0) {
        
        console.log('Background: Audio finished, checking autoplay settings');
        
        // Get user settings to check if autoplay is enabled
        const { userSelections } = await browser.storage.local.get('userSelections');
        
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
    const playResponse = await browser.runtime.sendMessage({
      action: 'playAudio',
      audioUrl: audioUrl,
      suraId: nextSuraId,
      reciterKey: reciterKey,
    });
    
    if (playResponse?.success) {
      // Update user selections to reflect the new sura
      const { userSelections } = await browser.storage.local.get('userSelections');
      if (userSelections) {
        userSelections.suraId = nextSuraId;
        userSelections.timestamp = Date.now();
        await browser.storage.local.set({ userSelections });
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
  return getSuraAudioUrlShared(reciterKey, suraId, {
    resolveMp3Reciter: async (_key, rawId) => getMp3QuranReciterById(rawId)
  });
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
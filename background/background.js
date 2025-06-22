/**
 * Background service worker for Qur'an & Sunnah Companion
 * Handles offscreen document creation, message forwarding for audio playback, and Dhikr notifications.
 */

// Dhikr collection (same as in popup)
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background: Message received from:', sender.tab ? 'popup' : 'offscreen', message);
  console.log('Background: Sender details:', { tab: sender.tab, url: sender.url, origin: sender.origin });
  
  // Handle ping messages immediately
  if (message.action === 'ping') {
    console.log('Background: Responding to ping');
    sendResponse({ success: true, message: 'Background script is alive' });
    return true;
  }
  
  // Ignore messages from the offscreen document itself
  // Check for offscreen document URL pattern
  if (!sender.tab && sender.url && sender.url.includes('offscreen.html')) {
    console.log('Background: Ignoring message from offscreen document');
    return false;
  }
  
  // Also ignore if no tab and no URL (this shouldn't happen but just in case)
  if (!sender.tab && !sender.url) {
    console.log('Background: Ignoring message with no sender context');
    return false;
  }

  // Handle all messages from the popup asynchronously.
  (async () => {
    console.log(`Background received message: ${message.action}`, message);
    
    try {
      // Handle Dhikr notification actions
      if (message.action === 'startDhikrNotifications') {
        await startDhikrNotifications(message.interval);
        sendResponse({ success: true });
        return;
      }
      
      if (message.action === 'stopDhikrNotifications') {
        await stopDhikrNotifications();
        sendResponse({ success: true });
        return;
      }
      
      if (message.action === 'updateDhikrInterval') {
        await updateDhikrInterval(message.interval);
        sendResponse({ success: true });
        return;
      }
      
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
        sendResponse(offscreenResponse);
      }
      
    } catch (error) {
      console.error('Background: Error in background script:', error);
      sendResponse({ success: false, error: error.message });
    }
  })().catch(error => {
    console.error('Background: Unhandled error in async handler:', error);
    sendResponse({ success: false, error: 'Background script error: ' + error.message });
  });
  
  // Return true to indicate that sendResponse will be called asynchronously.
  return true;
});

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

async function startDhikrNotifications(intervalSeconds) {
  try {
    console.log('Background: Starting Dhikr notifications with interval:', intervalSeconds, 'seconds');
    
    // Check notification permission level first
    const permissionLevel = await chrome.notifications.getPermissionLevel();
    console.log('Background: Notification permission level:', permissionLevel);
    
    if (permissionLevel === 'denied') {
      throw new Error('Notifications are disabled. Please enable notifications for this extension in Chrome settings.');
    }
    
    // Clear any existing alarm
    await chrome.alarms.clear(dhikrAlarmName);
    
    // Create new alarm
    await chrome.alarms.create(dhikrAlarmName, {
      delayInMinutes: intervalSeconds / 60,
      periodInMinutes: intervalSeconds / 60
    });
    
    console.log('Background: Dhikr alarm created successfully');
    
    // Show a test notification immediately to confirm it's working
    setTimeout(() => {
      showDhikrNotification(true);
    }, 2000);
    
  } catch (error) {
    console.error('Background: Failed to start Dhikr notifications:', error);
    throw error;
  }
}

async function stopDhikrNotifications() {
  try {
    console.log('Background: Stopping Dhikr notifications');
    await chrome.alarms.clear(dhikrAlarmName);
    console.log('Background: Dhikr alarm cleared successfully');
  } catch (error) {
    console.error('Background: Failed to stop Dhikr notifications:', error);
    throw error;
  }
}

async function updateDhikrInterval(intervalSeconds) {
  try {
    console.log('Background: Updating Dhikr interval to:', intervalSeconds, 'seconds');
    
    // Check if alarm exists
    const alarm = await chrome.alarms.get(dhikrAlarmName);
    if (alarm) {
      // Restart with new interval
      await startDhikrNotifications(intervalSeconds);
    }
  } catch (error) {
    console.error('Background: Failed to update Dhikr interval:', error);
    throw error;
  }
}

function getRandomDhikr() {
  return dhikrCollection[Math.floor(Math.random() * dhikrCollection.length)];
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
    // Check permission level before showing notification
    const permissionLevel = await chrome.notifications.getPermissionLevel();
    console.log('Background: Current notification permission level:', permissionLevel);
    
    if (permissionLevel === 'denied') {
      console.error('Background: Notifications are denied, cannot show notification');
      return;
    }
    
    const dhikr = getRandomDhikr();
    
    // Use chrome.runtime.getURL to get the proper path to the icon
    const iconUrl = chrome.runtime.getURL('assets/icon48.png');
    console.log('Background: Using icon URL:', iconUrl);
    
    const notificationOptions = {
      type: 'basic',
      iconUrl: iconUrl,
      title: isTest ? 'Dhikr Notifications Enabled! 🤲' : 'Dhikr Reminder 🤲',
      message: `${dhikr.arabic}\n${dhikr.english}`,
      contextMessage: `Reward: ${dhikr.reward}`,
      priority: 1,
      requireInteraction: false,
      silent: false
    };
    
    console.log('Background: Creating notification with options:', notificationOptions);
    
    const notificationId = await chrome.notifications.create(notificationOptions);
    console.log('Background: Notification created with ID:', notificationId);
    
    if (isTest) {
      console.log('Background: Test Dhikr notification shown:', dhikr.arabic);
    } else {
      console.log('Background: Dhikr notification shown:', dhikr.arabic);
    }
    
    // Auto-clear notification after 10 seconds to avoid clutter
    setTimeout(async () => {
      try {
        await chrome.notifications.clear(notificationId);
        console.log('Background: Auto-cleared notification:', notificationId);
      } catch (clearError) {
        console.log('Background: Could not clear notification (may have been dismissed):', clearError.message);
      }
    }, 10000);
    
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
      console.log('Background: Restoring Dhikr notifications on startup');
      await startDhikrNotifications(dhikrSettings.interval || 60);
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
      console.log('Background: Restoring Dhikr notifications after install/update');
      await startDhikrNotifications(dhikrSettings.interval || 60);
    }
  } catch (error) {
    console.error('Background: Failed to restore Dhikr notifications after install/update:', error);
  }
}); 
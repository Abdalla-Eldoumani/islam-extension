/**
 * Offscreen document script for audio playback
 * Manages Qur'an audio playback with full controls
 */

const audioPlayer = document.getElementById('quran-player');
let currentAudioState = {
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  audioUrl: null,
  suraId: null,
  reciterKey: null
};

// ---------------------------------------------------------------------------
// Logging control – keep errors/warnings but silence verbose logs in release
// ---------------------------------------------------------------------------
if (typeof console !== 'undefined') {
  console._log = console.log;
  const ENV_PROD = true;
  if (ENV_PROD) {
    console.log = () => {};
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Offscreen: Received message:', message.action, message);
  
  (async () => {
    try {
      switch (message.action) {
        case 'playAudio':
          console.log('Offscreen: Starting playAudio with URL:', message.audioUrl);
          await playAudio(message.audioUrl, message.suraId, message.reciterKey);
          console.log('Offscreen: playAudio completed successfully');
          sendResponse({ success: true });
          break;
        case 'pauseAudio':
          pauseAudio();
          sendResponse({ success: true });
          break;
        case 'resumeAudio':
          await resumeAudio();
          sendResponse({ success: true });
          break;
        case 'seekAudio':
          seekAudio(message.time);
          sendResponse({ success: true });
          break;
        case 'getAudioState':
          sendResponse({ success: true, state: currentAudioState });
          break;
        case 'showBrowserNotification':
          await showBrowserNotification(message.title, message.body, message.icon);
          sendResponse({ success: true });
          break;
        default:
          console.warn('Offscreen: Ignoring unknown action – likely meant for another context:', message.action);
          return;
      }
    } catch (error) {
      console.error('Offscreen message handling failed:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  
  return true;
});

async function playAudio(audioUrl, suraId, reciterKey) {
  try {
    console.log('Offscreen: Attempting to play audio:', audioUrl);
    
    // Stop current audio if playing
    if (!audioPlayer.paused) {
      console.log('Offscreen: Stopping current audio');
      audioPlayer.pause();
    }
    
    // Reset audio player
    audioPlayer.src = '';
    audioPlayer.load();
    
    // Test if the audio URL is accessible
    console.log('Offscreen: Testing audio URL accessibility...');
    try {
      const testResponse = await fetch(audioUrl, { method: 'HEAD' });
      console.log('Offscreen: Audio URL test response:', testResponse.status, testResponse.statusText);
      if (!testResponse.ok) {
        throw new Error(`Audio URL not accessible: ${testResponse.status} ${testResponse.statusText}`);
      }
    } catch (fetchError) {
      console.error('Offscreen: Audio URL fetch test failed:', fetchError);
      console.log('Offscreen: Continuing despite HEAD request failure...');
    }
    
    audioPlayer.crossOrigin = 'anonymous';
    audioPlayer.preload = 'auto';
    audioPlayer.src = audioUrl;
    audioPlayer.load();
    
    currentAudioState.audioUrl = audioUrl;
    currentAudioState.suraId = suraId;
    currentAudioState.reciterKey = reciterKey;
    currentAudioState.currentTime = 0;
    
    console.log('Offscreen: Loading audio...');
    
    await new Promise((resolve, reject) => {
      const onCanPlay = () => {
        console.log('Offscreen: Audio can play');
        cleanup();
        resolve();
      };
      
      const onLoadedData = () => {
        console.log('Offscreen: Audio data loaded');
        cleanup();
        resolve();
      };
      
      const onLoadedMetadata = () => {
        console.log('Offscreen: Audio metadata loaded');
        cleanup();
        resolve();
      };
      
      const cleanup = () => {
        audioPlayer.removeEventListener('canplay', onCanPlay);
        audioPlayer.removeEventListener('loadeddata', onLoadedData);
        audioPlayer.removeEventListener('loadedmetadata', onLoadedMetadata);
        audioPlayer.removeEventListener('error', onError);
      };
      
      const onError = (e) => {
        console.error('Offscreen: Audio load error:', e);
        console.error('Offscreen: Audio player error details:', audioPlayer.error);
        console.error('Offscreen: Audio player network state:', audioPlayer.networkState);
        console.error('Offscreen: Audio player ready state:', audioPlayer.readyState);
        console.error('Offscreen: Audio src:', audioPlayer.src);
        console.error('Offscreen: Audio currentSrc:', audioPlayer.currentSrc);
        
        let errorMessage = 'Unknown audio error';
        if (audioPlayer.error) {
          switch (audioPlayer.error.code) {
            case 1: errorMessage = 'MEDIA_ERR_ABORTED: Audio loading was aborted'; break;
            case 2: errorMessage = 'MEDIA_ERR_NETWORK: Network error occurred'; break;
            case 3: errorMessage = 'MEDIA_ERR_DECODE: Audio decoding failed'; break;
            case 4: errorMessage = 'MEDIA_ERR_SRC_NOT_SUPPORTED: Audio format not supported'; break;
            default: errorMessage = audioPlayer.error.message || 'Unknown media error';
          }
        }
        
        cleanup();
        reject(new Error(`Audio failed to load: ${errorMessage}`));
      };
      
      audioPlayer.addEventListener('canplay', onCanPlay);
      audioPlayer.addEventListener('loadeddata', onLoadedData);
      audioPlayer.addEventListener('loadedmetadata', onLoadedMetadata);
      audioPlayer.addEventListener('error', onError);
      
      setTimeout(() => {
        cleanup();
        reject(new Error('Audio load timeout after 15 seconds'));
      }, 15000);
    });
    
    console.log('Offscreen: Starting audio playback...');
    try {
      const playPromise = audioPlayer.play();
      if (playPromise !== undefined) {
        await playPromise;
        console.log('Offscreen: Audio play promise resolved successfully');
      }
      currentAudioState.isPlaying = true;
    } catch (playError) {
      console.error('Offscreen: Audio play failed:', playError);
      if (playError.name === 'NotAllowedError') {
        throw new Error('Audio playback blocked by browser autoplay policy');
      } else if (playError.name === 'NotSupportedError') {
        throw new Error('Audio format not supported');
      } else {
        throw new Error(`Audio playback failed: ${playError.message}`);
      }
    }
    
    await saveAudioState();
    
    console.log('Offscreen: Audio playing successfully:', audioUrl);
  } catch (error) {
    console.error('Offscreen: Audio playback failed:', error);
    currentAudioState.isPlaying = false;
    throw error;
  }
}

function pauseAudio() {
  audioPlayer.pause();
  currentAudioState.isPlaying = false;
  saveAudioState();
}

async function resumeAudio() {
  try {
    if (!currentAudioState.audioUrl) {
      throw new Error('No audio loaded to resume');
    }

    const savedTime = currentAudioState.currentTime;
    console.log(`Offscreen: Attempting to resume from ${formatTime(savedTime)}`);

    const needsReload = (
      audioPlayer.readyState === 0 ||
      audioPlayer.networkState === 3 ||
      audioPlayer.src !== currentAudioState.audioUrl
    );

    if (needsReload) {
      console.log('Offscreen: Audio element needs reload, restoring from saved position');
      await playAudio(currentAudioState.audioUrl, currentAudioState.suraId, currentAudioState.reciterKey);
      
      if (savedTime > 0) {
        await new Promise(resolve => {
          const onCanSeek = () => {
            if (audioPlayer.duration > savedTime) {
              audioPlayer.currentTime = savedTime;
              console.log(`Offscreen: Restored playback position to ${formatTime(savedTime)}`);
            }
            audioPlayer.removeEventListener('loadedmetadata', onCanSeek);
            audioPlayer.removeEventListener('canplay', onCanSeek);
            resolve();
          };
          
          if (audioPlayer.readyState >= 1) {
            onCanSeek();
          } else {
            audioPlayer.addEventListener('loadedmetadata', onCanSeek);
            audioPlayer.addEventListener('canplay', onCanSeek);
          }
          
          setTimeout(resolve, 3000);
        });
      }
      
      currentAudioState.isPlaying = true;
      await saveAudioState();
      return;
    }

    const playPromise = audioPlayer.play();
    if (playPromise !== undefined) {
      await playPromise;
    }
    currentAudioState.isPlaying = true;
    await saveAudioState();
    console.log(`Offscreen: Audio resumed successfully from ${formatTime(savedTime)}`);
  } catch (error) {
    console.error('Offscreen: Resume failed:', error);
    currentAudioState.isPlaying = false;
    throw error;
  }
}

function seekAudio(time) {
  audioPlayer.currentTime = time;
  currentAudioState.currentTime = time;
  saveAudioState();
  console.log('Offscreen: Seeked to time:', time);
}

async function saveAudioState() {
  currentAudioState.currentTime = audioPlayer.currentTime;
  currentAudioState.duration = audioPlayer.duration || 0;
  currentAudioState.timestamp = Date.now(); // Add timestamp for tracking when state was saved
  
  try {
    await chrome.storage.local.set({ audioState: currentAudioState });
    console.log('Offscreen: Saved audio state at', formatTime(currentAudioState.currentTime));
  } catch (error) {
    console.error('Failed to save audio state:', error);
  }
}

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

let lastSaveTime = 0;
audioPlayer.addEventListener('timeupdate', () => {
  currentAudioState.currentTime = audioPlayer.currentTime;
  currentAudioState.duration = audioPlayer.duration || 0;
  
  const now = Date.now();
  if (now - lastSaveTime > 10000) {
    saveAudioState();
    lastSaveTime = now;
  }
});

audioPlayer.addEventListener('ended', () => {
  currentAudioState.isPlaying = false;
  saveAudioState();
});

// Load saved state on startup
chrome.storage.local.get('audioState').then(result => {
  if (result.audioState) {
    currentAudioState = { ...currentAudioState, ...result.audioState };
  }
});

// Add browser notification fallback
async function showBrowserNotification(title, body, icon, requireInteraction = false) {
  try {
    console.log('Offscreen: Attempting browser notification...');
    console.log('Offscreen: Title:', title);
    console.log('Offscreen: Body:', body);
    console.log('Offscreen: Icon:', icon);
    
    if (!('Notification' in window)) {
      throw new Error('Browser notifications not supported');
    }
    
    let permission = Notification.permission;
    console.log('Offscreen: Browser notification permission:', permission);
    
    if (permission === 'default') {
      permission = await Notification.requestPermission();
      console.log('Offscreen: Requested permission, result:', permission);
    }
    
    if (permission === 'granted') {
      const notificationOptions = {
        body: body,
        icon: icon,
        requireInteraction: true,
        silent: false,
        tag: 'dhikr-reminder',
        timestamp: Date.now(),
        vibrate: [200, 100, 200],
        actions: [
          { action: 'close', title: 'Close' }
        ]
      };
      
      console.log('Offscreen: Creating notification with options:', notificationOptions);
      
      const notification = new Notification(title, notificationOptions);
      
      console.log('Offscreen: Browser notification created:', notification);
      
      notification.onclick = () => {
        console.log('Offscreen: Notification clicked');
        notification.close();
        try {
          window.focus();
        } catch (e) {
          console.log('Offscreen: Could not focus window:', e);
        }
      };
      
      notification.onshow = () => {
        console.log('Offscreen: Notification shown successfully');
      };
      
      notification.onerror = (error) => {
        console.error('Offscreen: Notification error:', error);
      };
      
      notification.onclose = () => {
        console.log('Offscreen: Notification closed');
      };
      
      if (!requireInteraction) {
        setTimeout(() => {
          notification.close();
          console.log('Offscreen: Auto-closed notification after 15 seconds');
        }, 15000);
      }
      
      return true;
    } else {
      throw new Error(`Browser notification permission denied: ${permission}`);
    }
  } catch (error) {
    console.error('Offscreen: Browser notification failed:', error);
    throw error;
  }
}
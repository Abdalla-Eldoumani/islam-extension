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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Offscreen: Received message:', message.action, message);
  
  // Handle async operations properly
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
          sendResponse({ success: false, error: 'Unknown action' });
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
      // Don't throw here - the HEAD request might fail even if audio works
      console.log('Offscreen: Continuing despite HEAD request failure...');
    }
    
    // Set up audio player with Chrome extension-friendly settings
    audioPlayer.crossOrigin = 'anonymous'; // Handle CORS
    audioPlayer.preload = 'auto'; // Preload the audio
    audioPlayer.src = audioUrl;
    audioPlayer.load(); // Force load the audio
    
    currentAudioState.audioUrl = audioUrl;
    currentAudioState.suraId = suraId;
    currentAudioState.reciterKey = reciterKey;
    currentAudioState.currentTime = 0;
    
    console.log('Offscreen: Loading audio...');
    
    // Wait for audio to be ready with better error handling
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
      
      // Timeout after 15 seconds
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
    
    // Save state to storage
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
    const playPromise = audioPlayer.play();
    if (playPromise !== undefined) {
      await playPromise;
    }
    currentAudioState.isPlaying = true;
    await saveAudioState();
    console.log('Offscreen: Audio resumed successfully');
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
  
  try {
    await chrome.storage.local.set({ audioState: currentAudioState });
  } catch (error) {
    console.error('Failed to save audio state:', error);
  }
}

// Update audio state periodically
audioPlayer.addEventListener('timeupdate', () => {
  currentAudioState.currentTime = audioPlayer.currentTime;
  currentAudioState.duration = audioPlayer.duration || 0;
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

// Add test button for debugging
document.getElementById('test-audio').addEventListener('click', async () => {
  const debugInfo = document.getElementById('debug-info');
  debugInfo.innerHTML = 'Testing audio...';
  
  try {
    // Test with a simple audio URL
    const testUrl = 'https://download.quranicaudio.com/qdc/siddiq_minshawi/murattal/112.mp3';
    console.log('Offscreen: Test button clicked, testing URL:', testUrl);
    
    audioPlayer.crossOrigin = 'anonymous';
    audioPlayer.preload = 'auto';
    audioPlayer.src = testUrl;
    audioPlayer.load();
    
    console.log('Offscreen: Audio element configured, waiting for load...');
    
    await new Promise((resolve, reject) => {
      const onCanPlay = () => {
        console.log('Offscreen: Test audio can play');
        cleanup();
        resolve();
      };
      const onError = (e) => {
        console.error('Offscreen: Test audio error:', e, audioPlayer.error);
        cleanup();
        reject(new Error(`Audio load failed: ${audioPlayer.error?.message || 'Unknown error'}`));
      };
      const cleanup = () => {
        audioPlayer.removeEventListener('canplay', onCanPlay);
        audioPlayer.removeEventListener('error', onError);
      };
      
      audioPlayer.addEventListener('canplay', onCanPlay);
      audioPlayer.addEventListener('error', onError);
      setTimeout(() => {
        cleanup();
        reject(new Error('Timeout after 10 seconds'));
      }, 10000);
    });
    
    console.log('Offscreen: Attempting to play test audio...');
    const playPromise = audioPlayer.play();
    if (playPromise !== undefined) {
      await playPromise;
    }
    
    console.log('Offscreen: Test audio playing successfully!');
    debugInfo.innerHTML = 'Audio test successful! Check console for details.';
  } catch (error) {
    console.error('Offscreen: Test audio failed:', error);
    debugInfo.innerHTML = `Audio test failed: ${error.message}`;
  }
});

// Add network test button
document.getElementById('test-network').addEventListener('click', async () => {
  const debugInfo = document.getElementById('debug-info');
  debugInfo.innerHTML = 'Testing network connectivity...';
  
  try {
    const testUrl = 'https://download.quranicaudio.com/qdc/siddiq_minshawi/murattal/112.mp3';
    console.log('Offscreen: Testing network connectivity to:', testUrl);
    
    // Test with fetch
    const response = await fetch(testUrl, { method: 'HEAD' });
    console.log('Offscreen: Network test response:', response.status, response.statusText);
    
    if (response.ok) {
      debugInfo.innerHTML = `Network test successful! Status: ${response.status}`;
    } else {
      debugInfo.innerHTML = `Network test failed! Status: ${response.status} ${response.statusText}`;
    }
  } catch (error) {
    console.error('Offscreen: Network test failed:', error);
    debugInfo.innerHTML = `Network test failed: ${error.message}`;
  }
});

// Add browser notification fallback
async function showBrowserNotification(title, body, icon) {
  try {
    console.log('Offscreen: Attempting browser notification...');
    
    // Check if browser notifications are supported and permitted
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
      const notification = new Notification(title, {
        body: body,
        icon: icon,
        requireInteraction: false,
        silent: false
      });
      
      console.log('Offscreen: Browser notification created:', notification);
      
      // Auto-close after 5 seconds
      setTimeout(() => {
        notification.close();
      }, 5000);
      
      return true;
    } else {
      throw new Error(`Browser notification permission denied: ${permission}`);
    }
  } catch (error) {
    console.error('Offscreen: Browser notification failed:', error);
    throw error;
  }
} 
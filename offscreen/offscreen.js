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

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  try {
    switch (message.action) {
      case 'playAudio':
        await playAudio(message.audioUrl, message.suraId, message.reciterKey);
        sendResponse({ success: true });
        break;
      case 'pauseAudio':
        pauseAudio();
        sendResponse({ success: true });
        break;
      case 'resumeAudio':
        resumeAudio();
        sendResponse({ success: true });
        break;
      case 'seekAudio':
        seekAudio(message.time);
        sendResponse({ success: true });
        break;
      case 'getAudioState':
        sendResponse({ success: true, state: currentAudioState });
        break;
      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
  } catch (error) {
    console.error('Offscreen message handling failed:', error);
    sendResponse({ success: false, error: error.message });
  }
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
    
    // Set up audio player
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
        audioPlayer.removeEventListener('canplay', onCanPlay);
        audioPlayer.removeEventListener('error', onError);
        audioPlayer.removeEventListener('loadeddata', onLoadedData);
        resolve();
      };
      
      const onLoadedData = () => {
        console.log('Offscreen: Audio data loaded');
        audioPlayer.removeEventListener('canplay', onCanPlay);
        audioPlayer.removeEventListener('error', onError);
        audioPlayer.removeEventListener('loadeddata', onLoadedData);
        resolve();
      };
      
      const onError = (e) => {
        console.error('Offscreen: Audio load error:', e);
        console.error('Offscreen: Audio player error details:', audioPlayer.error);
        console.error('Offscreen: Audio player network state:', audioPlayer.networkState);
        console.error('Offscreen: Audio player ready state:', audioPlayer.readyState);
        audioPlayer.removeEventListener('canplay', onCanPlay);
        audioPlayer.removeEventListener('error', onError);
        audioPlayer.removeEventListener('loadeddata', onLoadedData);
        reject(new Error('Audio failed to load: ' + (audioPlayer.error ? audioPlayer.error.message : 'Unknown error')));
      };
      
      audioPlayer.addEventListener('canplay', onCanPlay);
      audioPlayer.addEventListener('loadeddata', onLoadedData);
      audioPlayer.addEventListener('error', onError);
      
      // Timeout after 15 seconds
      setTimeout(() => {
        audioPlayer.removeEventListener('canplay', onCanPlay);
        audioPlayer.removeEventListener('error', onError);
        audioPlayer.removeEventListener('loadeddata', onLoadedData);
        reject(new Error('Audio load timeout after 15 seconds'));
      }, 15000);
    });
    
    console.log('Offscreen: Starting audio playback...');
    await audioPlayer.play();
    currentAudioState.isPlaying = true;
    
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

function resumeAudio() {
  audioPlayer.play();
  currentAudioState.isPlaying = true;
  saveAudioState();
}

function seekAudio(time) {
  audioPlayer.currentTime = time;
  currentAudioState.currentTime = time;
  saveAudioState();
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
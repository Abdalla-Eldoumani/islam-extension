/**
 * Background service worker for Qur'an & Sunnah Companion
 * Handles offscreen document creation and message forwarding for audio playback.
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Ignore messages from the offscreen document itself, which will not have a tab property.
  if (!sender.tab) {
    return false;
  }

  // Handle all other messages from the popup asynchronously.
  (async () => {
    console.log(`Background received message: ${message.action}`, message);
    
    try {
      // For any audio action, ensure the offscreen document exists.
      console.log('Background: Creating offscreen document if needed...');
      await createOffscreenDocumentIfNeeded();
      console.log('Background: Offscreen document ready');
      
      // Forward the message to the offscreen document.
      console.log('Forwarding message to offscreen document...');
      chrome.runtime.sendMessage(message, response => {
        // Handle cases where the offscreen document might have closed.
        if (chrome.runtime.lastError) {
          console.error('Error forwarding to offscreen:', chrome.runtime.lastError.message);
          sendResponse({ success: false, error: 'The audio player is not available. Please try again.' });
        } else {
          console.log('Received response from offscreen:', response);
          // Check if the response indicates an error
          if (response && !response.success) {
            console.error('Offscreen document returned error:', response.error);
            sendResponse({ success: false, error: response.error || 'Audio playback failed' });
          } else if (!response) {
            console.error('No response received from offscreen document');
            sendResponse({ success: false, error: 'No response from audio player' });
          } else {
            sendResponse(response);
          }
        }
      });
    } catch (error) {
      console.error('Error in background script:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  
  // Return true to indicate that sendResponse will be called asynchronously.
  return true;
});

async function createOffscreenDocumentIfNeeded() {
  if (await chrome.offscreen.hasDocument()) {
    console.log('Offscreen document already exists.');
    return;
  }

  console.log('Creating new offscreen document...');
  await chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Keep Qur\'an audio playing when popup closes'
  });
} 
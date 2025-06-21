/**
 * Background service worker for Qur'an & Sunnah Companion
 * Handles offscreen document creation and message forwarding for audio playback.
 */

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

  // Handle all other messages from the popup asynchronously.
  (async () => {
    console.log(`Background received message: ${message.action}`, message);
    
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
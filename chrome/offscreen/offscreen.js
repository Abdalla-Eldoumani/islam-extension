// Holds the <audio> element for the Chrome build. It answers only messages
// the service worker addresses to it, and reports state back to the worker,
// which stores it (offscreen documents have no storage API).

import { createAudioPlayer } from '../shared/audio-player.js';

function notify(action, state) {
  chrome.runtime.sendMessage({ target: 'background', action, state }).catch(() => {});
}

const player = createAudioPlayer(document.getElementById('quran-player'), {
  onState: (state) => notify('audioState', state),
  onEnded: (state) => notify('audioEnded', state)
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'offscreen') return false;
  player.handle(message).then(
    (state) => sendResponse({ success: true, state }),
    (error) => sendResponse({ success: false, error: error.message })
  );
  return true;
});

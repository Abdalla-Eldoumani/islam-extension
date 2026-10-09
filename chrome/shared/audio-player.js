// Drives the <audio> element in both builds: the Chrome offscreen document
// and the Firefox background page. State goes out through onState instead of
// storage because an offscreen document can only use the runtime API.

import { isAllowedAudioHost } from './audio-urls.js';

const LOAD_TIMEOUT_MS = 15000;
const PROGRESS_EVERY_MS = 10000;

export function createAudioPlayer(audio, { onState, onEnded }) {
  let track = { audioUrl: null, suraId: null, reciterKey: null, currentTime: 0, duration: 0 };
  let lastReport = 0;

  function holdsTrack() {
    return !!track.audioUrl && audio.src === track.audioUrl && audio.readyState > 0;
  }

  function state() {
    const live = holdsTrack();
    return {
      audioUrl: track.audioUrl,
      suraId: track.suraId,
      reciterKey: track.reciterKey,
      isPlaying: live && !audio.paused && !audio.ended,
      currentTime: live ? audio.currentTime : track.currentTime,
      duration: live && Number.isFinite(audio.duration) ? audio.duration : track.duration,
      live
    };
  }

  function report() {
    const s = state();
    track = { ...track, currentTime: s.currentTime, duration: s.duration };
    lastReport = Date.now();
    onState(s);
  }

  audio.addEventListener('timeupdate', () => {
    if (Date.now() - lastReport >= PROGRESS_EVERY_MS) report();
  });
  audio.addEventListener('pause', report);
  audio.addEventListener('ended', () => onEnded(state()));

  function waitForMetadata() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('Audio load timed out')), LOAD_TIMEOUT_MS);
      const loaded = () => finish();
      const failed = () => finish(new Error(`Audio failed to load (media error ${audio.error?.code ?? 'unknown'})`));
      function finish(error) {
        clearTimeout(timer);
        audio.removeEventListener('loadedmetadata', loaded);
        audio.removeEventListener('error', failed);
        if (error) reject(error);
        else resolve();
      }
      audio.addEventListener('loadedmetadata', loaded);
      audio.addEventListener('error', failed);
    });
  }

  async function play({ audioUrl, suraId, reciterKey }, startAt = 0) {
    if (!isAllowedAudioHost(audioUrl)) throw new Error('Audio source unavailable for this combination');
    track = { audioUrl, suraId, reciterKey, currentTime: startAt, duration: 0 };
    audio.src = audioUrl;
    await waitForMetadata();
    if (startAt > 0 && startAt < audio.duration) audio.currentTime = startAt;
    await audio.play();
    report();
  }

  // saved is the last stored state, used when this context was recreated
  // (after a browser restart) and holds no track of its own.
  async function resume(saved) {
    if (holdsTrack()) {
      await audio.play();
      report();
      return;
    }
    const from = track.audioUrl ? track : saved;
    if (!from?.audioUrl) throw new Error('No audio to resume');
    await play(from, from.currentTime || 0);
  }

  function seek(time) {
    if (holdsTrack() && Number.isFinite(time) && time >= 0) {
      audio.currentTime = time;
      report();
    }
  }

  async function handle(message) {
    switch (message.action) {
      case 'playAudio': await play(message); break;
      case 'pauseAudio': audio.pause(); break;
      case 'resumeAudio': await resume(message.saved); break;
      case 'seekAudio': seek(message.time); break;
      case 'getAudioState': break;
      default: throw new Error(`Unknown audio action: ${message.action}`);
    }
    return state();
  }

  return { handle, state };
}

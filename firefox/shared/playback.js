// Background-side playback helpers shared by both builds: the stored audio
// state used to resume after a restart, autoplay of the next surah, and the
// sleep timer.

import { browser } from './browser.js';
import { findReciter, loadReciters } from './reciter-catalogue.js';
import { getNextSuraId, getSuraAudioUrl } from './audio-urls.js';

export const SLEEP_ALARM = 'sleep-timer';
const SLEEP_TIMER_MINUTES = [15, 30, 45, 60];

export async function saveAudioState(state) {
  if (!state?.audioUrl) return;
  const { audioUrl, suraId, reciterKey, currentTime, duration, isPlaying } = state;
  await browser.storage.local.set({
    audioState: { audioUrl, suraId, reciterKey, currentTime, duration, isPlaying, timestamp: Date.now() }
  });
}

// What the popup sees when no audio element holds a track: the last stored
// state, never reported as playing.
export async function storedAudioState() {
  const { audioState } = await browser.storage.local.get('audioState');
  return audioState?.audioUrl ? { ...audioState, isPlaying: false, live: false } : null;
}

// The playAudio command for the surah after the one that just ended, or null
// when autoplay is off or the reciter has no later recording.
export async function nextSurahCommand(ended) {
  const { userSelections } = await browser.storage.local.get('userSelections');
  if (!userSelections?.autoplayEnabled || !ended?.reciterKey || !ended?.suraId) return null;
  const reciter = findReciter(await loadReciters({ allowStale: true }), ended.reciterKey);
  const suraId = reciter && getNextSuraId(ended.suraId, reciter);
  if (!suraId) return null;
  const audioUrl = await getSuraAudioUrl(reciter, suraId);
  return { action: 'playAudio', audioUrl, suraId, reciterKey: ended.reciterKey };
}

export async function rememberSurah(suraId) {
  const { userSelections } = await browser.storage.local.get('userSelections');
  await browser.storage.local.set({ userSelections: { ...userSelections, suraId, timestamp: Date.now() } });
}

export async function setSleepTimer(minutes) {
  await browser.alarms.clear(SLEEP_ALARM);
  const chosen = SLEEP_TIMER_MINUTES.includes(minutes) ? minutes : 0;
  await browser.storage.local.set({ sleepTimer: { minutes: chosen } });
  if (chosen) await browser.alarms.create(SLEEP_ALARM, { delayInMinutes: chosen });
}

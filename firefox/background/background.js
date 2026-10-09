// Persistent background page for the Firefox build. It owns the <audio>
// element, so playback, autoplay and the sleep timer carry on with the popup
// closed. Reminders and playback helpers are shared with the Chrome build.

import { browser } from '../shared/browser.js';
import { createAudioPlayer } from '../shared/audio-player.js';
import { applyReminderSettings, handleReminderAlarm, restoreReminders } from '../shared/reminders.js';
import {
  SLEEP_ALARM, nextSurahCommand, rememberSurah, saveAudioState, setSleepTimer, storedAudioState
} from '../shared/playback.js';

const AUDIO_ACTIONS = new Set(['playAudio', 'pauseAudio', 'resumeAudio', 'seekAudio', 'getAudioState']);
// Keys and alarms written by versions before 2.2.0.
const OBSOLETE_KEYS = ['currentDhikr', 'reciterCache', 'reciterCoverage'];
const OBSOLETE_ALARMS = ['reciter-coverage-probe'];

const audio = new Audio();
audio.preload = 'auto';

const player = createAudioPlayer(audio, {
  onState: (state) => { saveAudioState(state).catch(() => {}); },
  onEnded: (state) => {
    saveAudioState(state).then(() => autoplay(state)).catch(() => {});
  }
});

async function autoplay(ended) {
  const command = await nextSurahCommand(ended);
  if (!command) return;
  await player.handle(command);
  await rememberSurah(command.suraId);
}

async function handleAudio(message) {
  if (message.action === 'getAudioState' && !player.state().audioUrl) return storedAudioState();
  if (message.action === 'pauseAudio') await setSleepTimer(0);
  if (message.action === 'resumeAudio') return player.handle({ ...message, saved: await storedAudioState() });
  return player.handle(message);
}

async function handleMessage(message) {
  if (AUDIO_ACTIONS.has(message?.action)) return { success: true, state: await handleAudio(message) };
  if (message?.action === 'updateReminders') {
    return { success: true, settings: await applyReminderSettings(message.settings) };
  }
  if (message?.action === 'setSleepTimer') {
    await setSleepTimer(message.minutes);
    return { success: true };
  }
  throw new Error(`Unknown action: ${message?.action}`);
}

browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse, (error) => sendResponse({ success: false, error: error.message }));
  return true;
});

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SLEEP_ALARM) {
    setSleepTimer(0).then(() => player.handle({ action: 'pauseAudio' })).catch(() => {});
    return;
  }
  handleReminderAlarm(alarm).catch(() => {});
});

browser.runtime.onStartup.addListener(() => {
  restoreReminders().catch(() => {});
});

browser.runtime.onInstalled.addListener(() => {
  browser.storage.local.remove(OBSOLETE_KEYS).catch(() => {});
  OBSOLETE_ALARMS.forEach((name) => browser.alarms.clear(name).catch(() => {}));
  restoreReminders().catch(() => {});
});

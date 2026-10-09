// Service worker for the Chrome build. Audio lives in an offscreen document;
// this worker forwards commands to it, stores what it reports, and runs
// autoplay, the sleep timer and reminders. Chrome stops the worker when it
// is idle, so everything it relies on is kept in storage or in alarms.

import { applyReminderSettings, handleReminderAlarm, restoreReminders } from '../shared/reminders.js';
import {
  SLEEP_ALARM, nextSurahCommand, rememberSurah, saveAudioState, setSleepTimer, storedAudioState
} from '../shared/playback.js';

const OFFSCREEN_PATH = 'offscreen/offscreen.html';
const AUDIO_ACTIONS = new Set(['playAudio', 'pauseAudio', 'resumeAudio', 'seekAudio', 'getAudioState']);
// Keys and alarms written by versions before 2.2.0.
const OBSOLETE_KEYS = ['currentDhikr', 'reciterCache', 'reciterCoverage'];
const OBSOLETE_ALARMS = ['reciter-coverage-probe'];

let creatingOffscreen = null;

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  creatingOffscreen ??= chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ['AUDIO_PLAYBACK'],
    justification: "Keeps Qur'an recitation playing after the popup closes."
  }).finally(() => { creatingOffscreen = null; });
  await creatingOffscreen;
}

async function toOffscreen(message) {
  await ensureOffscreen();
  const response = await chrome.runtime.sendMessage({ ...message, target: 'offscreen' });
  if (!response?.success) throw new Error(response?.error || 'No response from the audio player');
  return response.state;
}

async function handleAudio(message) {
  if (message.action === 'getAudioState' && !(await chrome.offscreen.hasDocument())) {
    return storedAudioState();
  }
  if (message.action === 'pauseAudio') await setSleepTimer(0);
  if (message.action === 'resumeAudio') {
    return toOffscreen({ ...message, saved: await storedAudioState() });
  }
  return toOffscreen(message);
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

async function autoplay(ended) {
  const command = await nextSurahCommand(ended);
  if (!command) return;
  await toOffscreen(command);
  await rememberSurah(command.suraId);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target === 'background') {
    if (sender.url !== chrome.runtime.getURL(OFFSCREEN_PATH)) return false;
    const saved = saveAudioState(message.state);
    if (message.action === 'audioEnded') saved.then(() => autoplay(message.state)).catch(() => {});
    else saved.catch(() => {});
    return false;
  }
  handleMessage(message).then(sendResponse, (error) => sendResponse({ success: false, error: error.message }));
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SLEEP_ALARM) {
    setSleepTimer(0)
      .then(async () => { if (await chrome.offscreen.hasDocument()) await toOffscreen({ action: 'pauseAudio' }); })
      .catch(() => {});
    return;
  }
  handleReminderAlarm(alarm).catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  restoreReminders().catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.remove(OBSOLETE_KEYS).catch(() => {});
  OBSOLETE_ALARMS.forEach((name) => chrome.alarms.clear(name).catch(() => {}));
  restoreReminders().catch(() => {});
});

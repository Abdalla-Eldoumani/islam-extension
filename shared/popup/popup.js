// Popup: the Qur'an player, one hadith, and the adhkar with their reminder
// settings. Audio and reminders run in the background context; this page
// renders state and sends commands.

import { browser } from '../browser.js';
import { createCombobox } from '../combobox.js';
import { SHAHADA, dhikrCollection } from '../dhikr.js';
import { getHadith, splitArabicRuns, splitNarrator, truncateHadith } from '../hadith.js';
import { LANG_STORAGE_KEY, getCurrentLang, resolveLang, setCurrentLang, t } from '../i18n.js';
import { getSuraAudioUrl, hasSurah } from '../audio-urls.js';
import { findReciter, loadReciters } from '../reciter-catalogue.js';
import { isValidInterval } from '../reminders.js';
import { fillDhikr, fillSource } from './dhikr-view.js';

const MESSAGE_TIMEOUT_MS = 5000;
// Starting a surah waits for the file's metadata, which the player allows 15 s.
const PLAY_TIMEOUT_MS = 20000;
const POLL_MS = 1000;

const $ = (id) => document.getElementById(id);

const view = {
  suras: [],
  reciters: [],
  suraId: null,
  reciterKey: null,
  autoplay: false,
  audio: null,
  catalogLoaded: false,
  busy: false,
  seeking: false,
  hadith: undefined,
  hadithExpanded: false,
  dhikrIndex: 0,
  reminders: { notificationsEnabled: false, interval: 60, mode: 'notification' }
};

let suraBox = null;
let reciterBox = null;
let pollTimer = null;
let hadithRequest = 0;

// ---- messaging ---------------------------------------------------------

async function send(message, timeoutMs = MESSAGE_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
  });
  try {
    const response = await Promise.race([browser.runtime.sendMessage(message), timeout]);
    if (!response?.success) throw new Error(response?.error || 'no-response');
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function errorText(error) {
  const message = String(error?.message || '');
  if (message === 'notifications-blocked') return t('notificationsBlocked');
  if (message === 'timeout') return t('requestTimedOut');
  if (/context invalidated/i.test(message)) return t('extensionReloaded');
  return t('notificationError');
}

function setStatus(id, text, isError = false) {
  const el = $(id);
  el.textContent = text;
  el.classList.toggle('status--error', isError);
}

// ---- surahs and reciters ----------------------------------------------

async function fetchSuras(lang) {
  try {
    const res = await fetch(`https://api.quran.com/api/v4/chapters?language=${lang}`);
    if (res.ok) {
      const { chapters } = await res.json();
      if (Array.isArray(chapters) && chapters.length) return chapters;
    }
  } catch (_) {
    // Fall through to Al-Quran Cloud, which needs no key either.
  }
  try {
    const res = await fetch('https://api.alquran.cloud/v1/surah');
    if (res.ok) {
      const { data } = await res.json();
      if (Array.isArray(data) && data.length) {
        return data.map((s) => ({ id: s.number, name_simple: s.englishName, name_arabic: s.name }));
      }
    }
  } catch (_) {
    // Both providers unreachable; the picker says so.
  }
  return [];
}

function suraName(sura) {
  return getCurrentLang() === 'ar' ? sura.name_arabic : sura.name_simple;
}

function suraLabel(sura) {
  return `${sura.id}. ${suraName(sura)}`;
}

function findSura(id) {
  return view.suras.find((s) => String(s.id) === String(id)) || null;
}

function reciterLabel(reciter) {
  const details = [];
  if (reciter.style) details.push(reciter.style);
  if (reciter.surahs) details.push(t('reciterSurahCount', { count: reciter.surahs.length }));
  return details.length ? `${reciter.reciter_name} (${details.join(', ')})` : reciter.reciter_name;
}

function currentReciter() {
  return findReciter(view.reciters, view.reciterKey);
}

// Typed text counts as a selection when it is an exact label, or for surahs
// a bare number from 1 to 114.
function suraFromText(text) {
  const value = text.trim();
  const byLabel = view.suras.find((s) => suraLabel(s) === value);
  if (byLabel) return String(byLabel.id);
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 114 ? String(n) : null;
}

function reciterFromText(text) {
  const value = text.trim();
  return view.reciters.find((r) => reciterLabel(r) === value)?.id || null;
}

function refreshClearButtons() {
  $('clear-sura').dataset.visible = String(!!$('sura-input').value);
  $('clear-reciter').dataset.visible = String(!!$('reciter-input').value);
}

// The chosen surah's name, shown large above the controls. It repeats what the
// field already says, so it is hidden from assistive technology.
function renderSurahHero() {
  const sura = findSura(view.suraId);
  $('surah-hero').hidden = !sura;
  if (!sura) return;
  const lang = getCurrentLang();
  const name = $('surah-hero-name');
  $('surah-hero-arabic').textContent = sura.name_arabic;
  name.hidden = lang === 'ar';
  name.lang = lang;
  name.textContent = `${sura.id} · ${sura.name_simple}`;
}

function showSelection() {
  if (view.suraId && suraBox) suraBox.setValue(view.suraId);
  if (view.reciterKey && reciterBox) reciterBox.setValue(view.reciterKey);
  refreshClearButtons();
  renderSurahHero();
}

async function saveSelections() {
  await browser.storage.local.set({
    userSelections: {
      suraId: view.suraId,
      reciterKey: view.reciterKey,
      autoplayEnabled: view.autoplay,
      timestamp: Date.now()
    }
  });
}

function selectionChanged() {
  refreshClearButtons();
  renderSurahHero();
  const reciter = currentReciter();
  if (view.suraId && reciter && !hasSurah(reciter, view.suraId)) setStatus('quran-status', t('surahNotAvailable'));
  else setStatus('quran-status', '');
  saveSelections().catch(() => {});
  renderPlayback();
}

function setupComboboxes() {
  suraBox = createCombobox({
    inputEl: $('sura-input'),
    panelEl: $('sura-panel'),
    name: 'sura',
    getOptions: () => view.suras.map((s) => ({
      id: String(s.id),
      label: suraLabel(s),
      secondary: getCurrentLang() === 'ar' ? s.name_simple : s.name_arabic
    })),
    onSelect: (option) => { view.suraId = option.id; selectionChanged(); },
    onClear: () => { view.suraId = null; selectionChanged(); }
  });
  reciterBox = createCombobox({
    inputEl: $('reciter-input'),
    panelEl: $('reciter-panel'),
    name: 'reciter',
    getOptions: () => view.reciters.map((r) => ({ id: r.id, label: reciterLabel(r) })),
    onSelect: (option) => { view.reciterKey = option.id; selectionChanged(); },
    onClear: () => { view.reciterKey = null; selectionChanged(); }
  });
}

// ---- playback ---------------------------------------------------------

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function selectionMatchesAudio() {
  const audio = view.audio;
  return !!audio?.audioUrl && audio.suraId === view.suraId && audio.reciterKey === view.reciterKey;
}

function setPlayButton(action, icon, label) {
  const button = $('play-button');
  button.dataset.action = action;
  $('play-button-icon').setAttribute('href', icon);
  $('play-button-label').textContent = label;
}

function renderPlayback() {
  const audio = view.audio;
  const matches = selectionMatchesAudio();
  const playing = matches && audio.isPlaying;
  const ended = matches && audio.duration > 0 && audio.currentTime >= audio.duration - 1;
  const resumable = matches && !audio.isPlaying && audio.currentTime > 0 && !ended;
  const reciter = currentReciter();
  const playable = !!view.suraId && !!reciter && hasSurah(reciter, view.suraId);

  if (playing) setPlayButton('pause', '#icon-pause', t('pause'));
  else if (resumable) setPlayButton('resume', '#icon-play', `${t('resume')} (${formatTime(audio.currentTime)})`);
  else setPlayButton('play', '#icon-play', t('play'));
  $('play-button').disabled = view.busy || !(playing || resumable || playable);

  const toggle = $('autoplay-toggle');
  toggle.setAttribute('aria-pressed', String(view.autoplay));

  const showProgress = matches && audio.duration > 0;
  $('progress').hidden = !showProgress;
  if (showProgress && !view.seeking) {
    const bar = $('progress-bar');
    bar.value = String((audio.currentTime / audio.duration) * 100);
    bar.setAttribute('aria-valuetext', `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`);
    $('current-time').textContent = formatTime(audio.currentTime);
    $('total-time').textContent = formatTime(audio.duration);
  }

  const elsewhere = !!audio?.isPlaying && !matches;
  $('playing-banner').hidden = !elsewhere;
  if (elsewhere) {
    const sura = findSura(audio.suraId);
    const playingReciter = findReciter(view.reciters, audio.reciterKey);
    $('playing-banner-label').textContent = t('playingBannerLabel', {
      surah: sura ? suraLabel(sura) : audio.suraId,
      reciter: playingReciter ? playingReciter.reciter_name : ''
    });
  }
}

function syncPolling() {
  const wanted = !!view.audio?.isPlaying;
  if (wanted && !pollTimer) pollTimer = setInterval(() => { refreshAudio().catch(() => {}); }, POLL_MS);
  if (!wanted && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// adopt: on open, point the pickers at audio the background is holding.
// While polling, follow autoplay when the selection was on the old surah.
async function refreshAudio({ adopt = false } = {}) {
  let state;
  try {
    state = (await send({ action: 'getAudioState' })).state || null;
  } catch (_) {
    return;
  }
  const followed = selectionMatchesAudio();
  const previous = view.audio;
  view.audio = state;
  const advanced = followed && state?.audioUrl && state.reciterKey === previous.reciterKey
    && state.suraId !== previous.suraId;
  if (state?.audioUrl && ((adopt && state.live) || advanced)) {
    view.suraId = state.suraId;
    view.reciterKey = state.reciterKey;
    showSelection();
  }
  if (!state?.isPlaying && $('quran-status').textContent === t('statusPlaying')) setStatus('quran-status', '');
  renderPlayback();
  syncPolling();
}

async function play() {
  const reciter = currentReciter();
  const audioUrl = await getSuraAudioUrl(reciter, view.suraId);
  const { state } = await send({ action: 'playAudio', audioUrl, suraId: view.suraId, reciterKey: reciter.id }, PLAY_TIMEOUT_MS);
  view.audio = state;
}

async function onPlayButton() {
  const action = $('play-button').dataset.action;
  view.busy = true;
  renderPlayback();
  try {
    if (action === 'pause') {
      view.audio = (await send({ action: 'pauseAudio' })).state;
      $('sleep-timer').value = '0';
      setStatus('quran-status', '');
    } else {
      if (action === 'resume') view.audio = (await send({ action: 'resumeAudio' }, PLAY_TIMEOUT_MS)).state;
      else await play();
      setStatus('quran-status', t('statusPlaying'));
    }
  } catch (error) {
    setStatus('quran-status', action === 'pause' ? errorText(error) : t('statusReciterUnavailable'), true);
  } finally {
    view.busy = false;
    renderPlayback();
    syncPolling();
  }
}

async function stopPlayingElsewhere() {
  try {
    view.audio = (await send({ action: 'pauseAudio' })).state;
    $('sleep-timer').value = '0';
  } catch (error) {
    setStatus('quran-status', errorText(error), true);
  }
  renderPlayback();
  syncPolling();
}

async function seekTo(percent) {
  const audio = view.audio;
  if (!audio?.duration) return;
  try {
    view.audio = (await send({ action: 'seekAudio', time: (percent / 100) * audio.duration })).state;
  } catch (_) {
    // The next poll shows the real position.
  }
  renderPlayback();
}

// ---- hadith -------------------------------------------------------------

// Sets fetched text, marking the Arabic runs inside non-Arabic text so each
// carries its own language and direction.
function setHadithText(el, text, lang) {
  if (lang === 'ar') {
    el.textContent = text;
    return;
  }
  el.replaceChildren(...splitArabicRuns(text).map(({ text: chunk, arabic }) => {
    if (!arabic) return document.createTextNode(chunk);
    const run = document.createElement('span');
    run.lang = 'ar';
    run.dir = 'rtl';
    run.textContent = chunk;
    return run;
  }));
}

function renderHadith() {
  const lang = getCurrentLang();
  const textEl = $('hadith-text');
  const narratorEl = $('hadith-narrator');
  const sourceEl = $('hadith-source');
  const expand = $('hadith-expand');
  textEl.lang = lang;
  narratorEl.lang = lang;
  narratorEl.hidden = true;
  if (view.hadith === undefined) {
    textEl.textContent = t('loading');
    textEl.dir = 'auto';
    sourceEl.hidden = true;
    expand.hidden = true;
    setStatus('hadith-status', '');
    return;
  }
  if (view.hadith === null) {
    textEl.textContent = SHAHADA[lang] || SHAHADA.en;
    textEl.dir = lang === 'ar' ? 'rtl' : 'ltr';
    sourceEl.textContent = t('shahada');
    sourceEl.hidden = false;
    expand.hidden = true;
    setStatus('hadith-status', t('hadithUnavailable'));
    return;
  }
  const { narrator, body } = splitNarrator(view.hadith.text);
  setHadithText(narratorEl, narrator, lang);
  narratorEl.hidden = !narrator;
  const { truncated, short, full } = truncateHadith(body);
  setHadithText(textEl, truncated && !view.hadithExpanded ? short : full, lang);
  textEl.dir = 'auto';
  expand.hidden = !truncated;
  expand.textContent = view.hadithExpanded ? t('showLessHadith') : t('seeFullHadith');
  expand.setAttribute('aria-expanded', String(view.hadithExpanded));
  fillSource(sourceEl, { collection: view.hadith.collection, number: view.hadith.number }, lang);
  setStatus('hadith-status', '');
}

async function loadHadith() {
  const request = ++hadithRequest;
  view.hadith = undefined;
  view.hadithExpanded = false;
  renderHadith();
  const hadith = await getHadith(getCurrentLang()).catch(() => null);
  if (request !== hadithRequest) return;
  view.hadith = hadith;
  renderHadith();
}

// ---- dhikr and reminders ------------------------------------------------

function renderDhikr() {
  fillDhikr({
    arabic: $('dhikr-arabic'),
    translit: $('dhikr-translit'),
    meaning: $('dhikr-meaning'),
    virtue: $('dhikr-virtue'),
    source: $('dhikr-source')
  }, dhikrCollection[view.dhikrIndex], getCurrentLang());
}

function renderReminders() {
  const settings = view.reminders;
  $('reminders-toggle').setAttribute('aria-pressed', String(settings.notificationsEnabled));
  $('reminder-settings').hidden = !settings.notificationsEnabled;
  $('reminder-interval').value = String(settings.interval);
  $('reminder-mode').value = settings.mode;
  document.querySelectorAll('.preset').forEach((button) => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.seconds) === settings.interval));
  });
}

function intervalIsValid() {
  const input = $('reminder-interval');
  const valid = isValidInterval(Number(input.value));
  input.setAttribute('aria-invalid', String(!valid));
  $('interval-error').hidden = valid;
  $('interval-error').textContent = valid ? '' : t('invalidInterval');
  return valid;
}

async function updateReminders(changes) {
  const toggle = $('reminders-toggle');
  toggle.disabled = true;
  try {
    const { settings } = await send({ action: 'updateReminders', settings: { ...view.reminders, ...changes } });
    view.reminders = settings;
    setStatus('reminder-status', '');
  } catch (error) {
    setStatus('reminder-status', errorText(error), true);
  } finally {
    toggle.disabled = false;
    renderReminders();
  }
}

// ---- language -----------------------------------------------------------

function renderPlaceholders() {
  const failed = (list) => view.catalogLoaded && list.length === 0;
  $('sura-input').placeholder = failed(view.suras) ? t('surahsUnavailable') : t('searchSura');
  $('reciter-input').placeholder = failed(view.reciters) ? t('recitersUnavailable') : t('reciterPlaceholder');
}

function renderStaticText() {
  const lang = getCurrentLang();
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.title = t('appTitle');
  const text = {
    'app-title': 'appTitle',
    'language-label': 'languageLabel',
    'quran-title': 'quran',
    'sura-label': 'surahLabel',
    'reciter-label': 'reciterLabel',
    'autoplay-label': 'autoplay',
    'progress-label': 'positionLabel',
    'sleep-timer-label': 'sleepTimerLabel',
    'playing-banner-stop-label': 'stopPlaying',
    'hadith-title': 'hadith',
    'hadith-note': 'hadithNote',
    'dhikr-title': 'dhikr',
    'next-dhikr-label': 'nextDhikr',
    'reminders-label': 'reminders',
    'reminder-interval-label': 'reminderLabel',
    'presets-label': 'presetsLabel',
    'reminder-mode-label': 'reminderStyle'
  };
  for (const [id, key] of Object.entries(text)) $(id).textContent = t(key);
  renderPlaceholders();
  $('clear-sura').setAttribute('aria-label', t('clearSurah'));
  $('clear-reciter').setAttribute('aria-label', t('clearReciter'));
  const sleepKeys = { 0: 'sleepTimerOff', 15: 'sleepTimer15', 30: 'sleepTimer30', 45: 'sleepTimer45', 60: 'sleepTimer60' };
  for (const option of $('sleep-timer').options) option.textContent = t(sleepKeys[option.value]);
  for (const button of document.querySelectorAll('.preset')) button.textContent = t(`preset${button.dataset.seconds}`);
  $('reminder-mode').options[0].textContent = t('modeNotification');
  $('reminder-mode').options[1].textContent = t('modePopup');
  $('language-select').value = lang;
}

async function changeLanguage(lang) {
  setCurrentLang(lang);
  await browser.storage.local.set({ [LANG_STORAGE_KEY]: lang });
  renderStaticText();
  renderDhikr();
  renderPlayback();
  if (!$('interval-error').hidden) intervalIsValid();
  loadHadith();
  const suras = await fetchSuras(lang);
  if (suras.length) view.suras = suras;
  showSelection();
  suraBox.refresh();
  reciterBox.refresh();
}

// ---- wiring -------------------------------------------------------------

function bindEvents() {
  $('language-select').addEventListener('change', (e) => { changeLanguage(e.target.value).catch(() => {}); });

  $('sura-input').addEventListener('input', (e) => {
    view.suraId = suraFromText(e.target.value);
    selectionChanged();
  });
  $('reciter-input').addEventListener('input', (e) => {
    view.reciterKey = reciterFromText(e.target.value);
    selectionChanged();
  });
  $('clear-sura').addEventListener('click', () => { suraBox.clear(); $('sura-input').focus(); });
  $('clear-reciter').addEventListener('click', () => { reciterBox.clear(); $('reciter-input').focus(); });

  $('play-button').addEventListener('click', onPlayButton);
  $('playing-banner-stop').addEventListener('click', stopPlayingElsewhere);
  $('autoplay-toggle').addEventListener('click', () => {
    view.autoplay = !view.autoplay;
    saveSelections().catch(() => {});
    renderPlayback();
  });

  const bar = $('progress-bar');
  bar.addEventListener('input', () => { view.seeking = true; });
  bar.addEventListener('change', () => {
    view.seeking = false;
    seekTo(Number(bar.value));
  });

  $('sleep-timer').addEventListener('change', (e) => {
    send({ action: 'setSleepTimer', minutes: Number(e.target.value) })
      .catch((error) => setStatus('quran-status', errorText(error), true));
  });

  $('hadith-expand').addEventListener('click', () => {
    view.hadithExpanded = !view.hadithExpanded;
    renderHadith();
  });

  $('next-dhikr').addEventListener('click', () => {
    view.dhikrIndex = (view.dhikrIndex + 1) % dhikrCollection.length;
    renderDhikr();
  });

  $('reminders-toggle').addEventListener('click', () => {
    const enabling = !view.reminders.notificationsEnabled;
    if (enabling && !intervalIsValid()) {
      $('reminder-settings').hidden = false;
      $('reminder-interval').focus();
      return;
    }
    updateReminders({ notificationsEnabled: enabling });
  });
  $('reminder-interval').addEventListener('change', (e) => {
    if (intervalIsValid()) updateReminders({ interval: Number(e.target.value) });
  });
  document.querySelectorAll('.preset').forEach((button) => {
    button.addEventListener('click', () => {
      $('reminder-interval').value = button.dataset.seconds;
      intervalIsValid();
      updateReminders({ interval: Number(button.dataset.seconds) });
    });
  });
  $('reminder-mode').addEventListener('change', (e) => { updateReminders({ mode: e.target.value }); });
}

async function init() {
  const stored = await browser.storage.local.get([LANG_STORAGE_KEY, 'userSelections', 'dhikrSettings', 'sleepTimer']);
  setCurrentLang(resolveLang(stored[LANG_STORAGE_KEY], browser.i18n?.getUILanguage?.() || navigator.language));
  view.autoplay = stored.userSelections?.autoplayEnabled === true;
  view.reminders = { ...view.reminders, ...stored.dhikrSettings };
  const sleepMinutes = String(stored.sleepTimer?.minutes ?? 0);
  $('sleep-timer').value = [...$('sleep-timer').options].some((o) => o.value === sleepMinutes) ? sleepMinutes : '0';

  setupComboboxes();
  bindEvents();
  renderStaticText();
  renderDhikr();
  renderReminders();
  renderPlayback();
  loadHadith();

  const [suras, reciters] = await Promise.all([
    fetchSuras(getCurrentLang()),
    loadReciters().catch(() => [])
  ]);
  view.suras = suras;
  view.reciters = reciters;
  view.catalogLoaded = true;
  renderPlaceholders();

  const saved = stored.userSelections;
  if (findSura(saved?.suraId)) view.suraId = String(saved.suraId);
  const savedReciter = findReciter(reciters, saved?.reciterKey);
  if (savedReciter) view.reciterKey = savedReciter.id;
  showSelection();
  renderPlayback();
  await refreshAudio({ adopt: true });
}

init();

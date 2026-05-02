/**
 * Popup script for Qur'an & Sunnah Companion
 * Handles UI, API calls, and communication with the background script.
 * This version uses the Quran.com v4 API for Surah names, reciters, and audio.
 */

import { dhikrCollection, DHIKR_REWARD_AR } from '../shared/dhikr.js';
import { getSuraAudioUrl as getSuraAudioUrlShared } from '../shared/audio-urls.js';
import { I18N, LANG_STORAGE_KEY } from '../shared/i18n.js';
import { getCoverageLabel } from '../shared/reciter-coverage.js';

// Silence verbose logs in production. Flip ENV_PROD to false when debugging.
if (typeof console !== 'undefined') {
  console._log = console.log;
  console._warn = console.warn;
  console._error = console.error;
  const ENV_PROD = true;
  if (ENV_PROD) {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  }
}

// Build an inline SVG node that references a sprite symbol by id. Used by
// setIconLabel below so that buttons render an icon next to a text label
// without ever assigning an HTML string.
const SVG_NS = 'http://www.w3.org/2000/svg';
function makeIconSvg(iconId) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${iconId}`);
  svg.appendChild(use);
  return svg;
}

function setIconLabel(el, iconId, label) {
  if (!el) return;
  el.replaceChildren(makeIconSvg(iconId), document.createTextNode(' ' + label));
}

// --- STATE AND CACHE ---

// Global progress tracking interval
let progressTrackingInterval = null;

// Keep full list of reciters for quick filtering
let ALL_RECITERS = [];

// Track the last known audio state to detect input changes
let lastKnownAudioState = {
  suraId: null,
  reciterKey: null,
  currentTime: 0,
  isPlaying: false
};

// Unified in-memory catalogue for all reciters pulled from every provider.
const RECITER_CATALOG = {};

// Map display label -> reciterKey for the datalist picker
const RECITER_LABEL_TO_KEY = {};

// Sura search: maps for the datalist filter on `sura-input`. Filled in
// setupQuranSelectors. The label looks like "67. Al-Mulk".
const SURA_LABEL_TO_ID = {};
const SURA_ID_TO_LABEL = {};

function getSelectedSuraId() {
  const input = document.getElementById('sura-input');
  if (!input || !input.value) return '';
  const val = input.value.trim();
  if (SURA_LABEL_TO_ID[val]) return SURA_LABEL_TO_ID[val];
  // Fallback: a bare number 1-114 resolves to that surah id directly.
  const n = parseInt(val, 10);
  if (!Number.isNaN(n) && n >= 1 && n <= 114) return String(n);
  return '';
}

function setSelectedSuraById(id) {
  const input = document.getElementById('sura-input');
  if (!input) return;
  input.value = SURA_ID_TO_LABEL[id] || '';
}

function getReciterKey() {
  const input = document.getElementById('reciter-input');
  if (!input.value) return '';
  return RECITER_LABEL_TO_KEY[input.value];
}

function setReciterInputByKey(key) {
  const input = document.getElementById('reciter-input');
  const label = Object.keys(RECITER_LABEL_TO_KEY).find(l => RECITER_LABEL_TO_KEY[l] === key);
  if (label) input.value = label;
}

// --- LIFECYCLE ---

document.addEventListener('DOMContentLoaded', async () => {
  await initLanguage();

  await setupQuranSelectors();

  await Promise.all([loadDhikr(), loadSavedAudioState()]);

  setupEventHandlers();
});

// --- UI SETUP & EVENT HANDLERS ---

function setupEventHandlers() {
  const playButton = document.getElementById('play-quran');
  const pauseButton = document.getElementById('pause-quran');
  const autoplayButton = document.getElementById('autoplay-toggle');
  const suraInput = document.getElementById('sura-input');
  const reciterInput = document.getElementById('reciter-input');

  playButton.addEventListener('click', handlePlayPauseResume);
  pauseButton.addEventListener('click', handlePlayPauseResume);
  autoplayButton.addEventListener('click', toggleAutoplay);

  suraInput.addEventListener('input', () => {
    handleInputChange();
  });
  suraInput.addEventListener('change', () => {
    handleInputChange();
  });
  reciterInput.addEventListener('input', () => {
    handleInputChange();
  });

  document.getElementById('progress-bar').addEventListener('change', (e) => {
    seekAudio(e.target.value);
  });

  document.getElementById('next-dhikr').addEventListener('click', nextDhikr);
  
  const notificationToggle = document.getElementById('toggle-notifications');
  if (notificationToggle && !notificationToggle.hasAttribute('data-listener-added')) {
    notificationToggle.addEventListener('click', toggleDhikrNotifications);
    notificationToggle.setAttribute('data-listener-added', 'true');
  }
  
  document.getElementById('dhikr-interval').addEventListener('input', validateInterval);
  
  document.querySelectorAll('.card__preset').forEach(button => {
    button.addEventListener('click', (e) => {
      const seconds = parseInt(e.target.dataset.seconds);
      document.getElementById('dhikr-interval').value = seconds;
      updatePresetButtons(seconds);
      validateInterval();
      saveDhikrSettings();
    });
  });

  const clearReciterBtn = document.getElementById('clear-reciter');
  if (clearReciterBtn) {
    clearReciterBtn.addEventListener('click', () => {
      reciterInput.value = '';
      handleInputChange();
      reciterInput.focus();
    });
  }

  const sleepTimer = document.getElementById('sleep-timer');
  if (sleepTimer) {
    chrome.storage.local.get('sleepTimer').then(({ sleepTimer: saved }) => {
      if (typeof saved?.minutes === 'number') sleepTimer.value = String(saved.minutes);
    });
    sleepTimer.addEventListener('change', async () => {
      const minutes = parseInt(sleepTimer.value, 10) || 0;
      await chrome.storage.local.set({ sleepTimer: { minutes } });
      try {
        await chrome.runtime.sendMessage({ action: 'setSleepTimer', minutes });
      } catch (err) {
        console.warn('Failed to set sleep timer:', err);
      }
    });
  }

  // Reminder mode selector change ------------------------------------------
  const modeSelect = document.getElementById('reminder-mode');
  if (modeSelect) {
    modeSelect.addEventListener('change', async () => {
      await saveDhikrSettings();

      // If notifications already active, update mode in background
      const notifEnabled = document.getElementById('toggle-notifications').dataset.enabled === 'true';
      if (notifEnabled) {
        const newMode = modeSelect.value;
        chrome.runtime.sendMessage({ action: 'updateDhikrMode', mode: newMode }, (resp) => {
          if (chrome.runtime.lastError) {
            console.warn('Failed to update mode:', chrome.runtime.lastError.message);
          } else {
            // console.log('Mode updated:', resp);
          }
        });
      }
    });
  }

  // datalist handles filtering natively, so no extra handler
}

// New function to handle input changes
function handleInputChange() {
  validateQuranSelection();
  saveUserSelections();
  
  // Check if current selections differ from active audio state
  const currentSuraId = getSelectedSuraId();
  const currentReciterKey = getReciterKey();
  
  if (lastKnownAudioState.suraId && lastKnownAudioState.reciterKey) {
    const hasChanged = (
      currentSuraId !== lastKnownAudioState.suraId || 
      currentReciterKey !== lastKnownAudioState.reciterKey
    );
    
    if (hasChanged) {
      console.log('Input changed - resetting playback state');
      resetPlaybackState();
    }
  }
}

// Function to reset playback state when inputs change
function resetPlaybackState() {
  // Reset the button to "Play" mode
  const playButton = document.getElementById('play-quran');
  setIconLabel(playButton, 'play-triangle', t('play'));
  playButton.dataset.action = 'play';
  
  // Hide progress container since we're starting fresh
  document.getElementById('progress-container').classList.add('hidden');
  document.getElementById('progress-bar').value = 0;
  document.getElementById('current-time').textContent = formatTime(0);
  document.getElementById('total-time').textContent = formatTime(0);
  
  // Clear availability status
  const availabilityStatus = document.getElementById('quran-availability');
  availabilityStatus.textContent = '';
  availabilityStatus.style.color = '';
  
  // Reset last known state
  lastKnownAudioState = {
    suraId: null,
    reciterKey: null, 
    currentTime: 0,
    isPlaying: false
  };
}

async function handlePlayPauseResume(event) {
  const action = event.target.dataset.action;
  switch (action) {
    case 'play':
      await playQuranAudio();
      break;
    case 'pause':
      await pauseQuranAudio();
      break;
    case 'resume':
      await resumeQuranAudio();
      break;
  }
}

// --- DATA FETCHING & INITIALIZATION ---

async function saveUserSelections() {
  try {
    const suraId = getSelectedSuraId();
    const reciterKey = getReciterKey();
    const autoplayEnabled = document.getElementById('autoplay-toggle').dataset.autoplay === 'true';
    
    const userSelections = {
      suraId: suraId || null,
      reciterKey: reciterKey || null,
      autoplayEnabled: autoplayEnabled,
      timestamp: Date.now()
    };
    
    await chrome.storage.local.set({ userSelections });
    // console.log('Saved user selections:', userSelections);
  } catch (error) {
    console.error('Failed to save user selections:', error);
  }
}

async function loadSavedAudioState() {
  try {
    // Load both user selections and audio state
    const { audioState, userSelections } = await chrome.storage.local.get(['audioState', 'userSelections']);

    // First, restore user selections (even if no audio is playing)
    if (userSelections?.suraId || userSelections?.reciterKey) {
      if (userSelections.suraId) {
        setSelectedSuraById(userSelections.suraId);
      }

      // Wait for reciters to load before setting reciter selection
      const waitForReciters = new Promise(resolve => {
        const reciterDatalist = document.getElementById('reciter-list');
        if (reciterDatalist.options.length > 0) {
          resolve();
          return;
        }
        const observer = new MutationObserver(() => {
          if (reciterDatalist.options.length > 0) {
            observer.disconnect();
            resolve();
          }
        });
        observer.observe(reciterDatalist, { childList: true });
        setTimeout(() => { observer.disconnect(); resolve(); }, 3000);
      });

      await waitForReciters;

      if (userSelections.reciterKey) {
        setReciterInputByKey(userSelections.reciterKey);
      }

      if (typeof userSelections.autoplayEnabled === 'boolean') {
        updateAutoplayButton(userSelections.autoplayEnabled);
      }

      validateQuranSelection();
    }

    // Storage is the source of truth for restoration. The offscreen document
    // may not be alive yet when the popup opens; relying on a runtime round
    // trip to background here used to lose the resume position.
    let restoredState = (audioState && audioState.audioUrl) ? audioState : null;

    // If the saved state suggests playback was active, refresh from runtime to
    // catch any progress made between the last storage write and now.
    if (restoredState?.isPlaying) {
      try {
        const stateResponse = await chrome.runtime.sendMessage({ action: 'getAudioState' });
        if (stateResponse?.success && stateResponse.state?.audioUrl) {
          restoredState = stateResponse.state;
        }
      } catch (_) {
        // Service worker not yet awake; storage state is good enough.
      }
    }

    if (restoredState) {
      await applyRestoredAudioState(restoredState);
    }
  } catch (error) {
    console.error('Failed to load saved audio state:', error);
  }
}

async function applyRestoredAudioState(state) {
  const availabilityStatus = document.getElementById('quran-availability');
  const currentSuraId = getSelectedSuraId();
  const currentReciterKey = getReciterKey();
  const matchesCurrent = state.reciterKey === currentReciterKey && state.suraId === currentSuraId;

  if (!matchesCurrent && state.reciterKey && state.suraId) {
    if (SURA_ID_TO_LABEL[state.suraId]) {
      setSelectedSuraById(state.suraId);
    }
    setReciterInputByKey(state.reciterKey);
    validateQuranSelection();
    await saveUserSelections();
  }

  lastKnownAudioState = {
    suraId: state.suraId,
    reciterKey: state.reciterKey,
    currentTime: state.currentTime,
    isPlaying: state.isPlaying
  };

  updateProgressUI(state);
  updatePlayButtonUI(state.isPlaying, true, state.currentTime);

  if (availabilityStatus && !state.isPlaying && state.currentTime > 5) {
    showContinueAffordance(availabilityStatus, state);
  }

  if (state.isPlaying) {
    startProgressTracking();
  }
}

// Render a clickable "Continue Surah <name> from M:SS" affordance into the
// availability status slot. Clicking it triggers Resume, the same as the
// play button in resume mode.
function showContinueAffordance(host, state) {
  const suraName = SURA_ID_TO_LABEL[state.suraId] || `Surah ${state.suraId}`;
  const time = formatTime(state.currentTime);
  const label = (t('continueAffordance') || 'Continue {name} from {time}')
    .replace('{name}', suraName)
    .replace('{time}', time);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'continue-affordance';
  button.textContent = label;
  button.addEventListener('click', () => {
    button.remove();
    resumeQuranAudio();
  });
  host.replaceChildren(button);
  host.style.color = '';
}

async function loadHadith() {
  const hadithEl = document.getElementById('hadith-text');
  try {
    if (CURRENT_LANG === 'ar') {
      // ---------------- Arabic ----------------
      const AR_BOOKS = [
        { id: 'abu-daud', available: 4419 },
        { id: 'ahmad', available: 4305 },
        { id: 'bukhari', available: 6638 },
        { id: 'darimi', available: 2949 },
        { id: 'ibnu-majah', available: 4285 },
        { id: 'malik', available: 1587 },
        { id: 'muslim', available: 4930 },
        { id: 'nasai', available: 5364 },
        { id: 'tirmidzi', available: 3625 }
      ];
      const picked = AR_BOOKS[Math.floor(Math.random() * AR_BOOKS.length)];
      const rand = Math.floor(Math.random() * picked.available) + 1;
      const res = await fetch(`https://api.hadith.gading.dev/books/${picked.id}?range=${rand}-${rand}`);
      if (!res.ok) throw new Error('Hadith API failed');
      const data = await res.json();
      const hadithTxt = data?.data?.hadiths?.[0]?.arab || data?.data?.hadiths?.[0]?.id || '';
      hadithEl.textContent = hadithTxt || 'حدث خطأ فى جلب الحديث';
    } else if (CURRENT_LANG === 'fr') {
      // ---------------- French with local cache ----------------
      const CACHE_KEY = 'hadithCacheFr';
      const TARGET_CACHE_SIZE = 30;

      let { [CACHE_KEY]: cacheArr } = await chrome.storage.local.get(CACHE_KEY);
      cacheArr = Array.isArray(cacheArr) ? cacheArr : [];

      let text = '';
      if (cacheArr.length > 0) {
        text = cacheArr.shift();
        // save trimmed cache back but don't await to prevent UI delay
        chrome.storage.local.set({ [CACHE_KEY]: cacheArr }).catch(console.error);
      }

      if (!text) {
        text = await fetchRandomFrenchHadith();
      }

      // Top-up the cache asynchronously if it's below threshold
      if (cacheArr.length < TARGET_CACHE_SIZE - 5) {
        (async () => {
          try {
            const needed = TARGET_CACHE_SIZE - cacheArr.length;
            const newOnes = [];
            for (let i = 0; i < needed; i++) {
              const h = await fetchRandomFrenchHadith();
              if (h) newOnes.push(h);
            }
            const updated = cacheArr.concat(newOnes);
            await chrome.storage.local.set({ [CACHE_KEY]: updated });
          } catch (err) {
            console.warn('Failed to refill French hadith cache:', err);
          }
        })();
      }

      hadithEl.textContent = text || 'Erreur lors du chargement du Hadith.';
    } else {
      // ---------------- English with local cache ----------------
      const CACHE_KEY = 'hadithCacheEn';
      const TARGET_CACHE_SIZE = 30;

      let { [CACHE_KEY]: cacheArr } = await chrome.storage.local.get(CACHE_KEY);
      cacheArr = Array.isArray(cacheArr) ? cacheArr : [];

      let text = '';
      if (cacheArr.length > 0) {
        text = cacheArr.shift();
        // save trimmed cache back but don't await to prevent UI delay
        chrome.storage.local.set({ [CACHE_KEY]: cacheArr }).catch(console.error);
      }

      if (!text) {
        text = await fetchRandomEnglishHadith();
      }

      // Top-up the cache asynchronously if it's below threshold
      if (cacheArr.length < TARGET_CACHE_SIZE - 5) {
        (async () => {
          try {
            const needed = TARGET_CACHE_SIZE - cacheArr.length;
            const newOnes = [];
            for (let i = 0; i < needed; i++) {
              const h = await fetchRandomEnglishHadith();
              if (h) newOnes.push(h);
            }
            const updated = cacheArr.concat(newOnes);
            await chrome.storage.local.set({ [CACHE_KEY]: updated });
          } catch (err) {
            console.warn('Failed to refill hadith cache:', err);
          }
        })();
      }

      hadithEl.textContent = text || 'Error loading Hadith.';
    }
  } catch (error) {
    console.error('Failed to load Hadith:', error);
    if (CURRENT_LANG === 'ar') {
      hadithEl.textContent = 'لَا إِلَٰهَ إِلَّا اللَّهُ';
    } else if (CURRENT_LANG === 'fr') {
      hadithEl.textContent = "Il n'y a de divinité qu'Allah";
    } else {
      hadithEl.textContent = 'There is no god but Allah';
    }
  }
}

// Helper function to fetch a random English hadith
async function fetchRandomEnglishHadith() {
  const EN_EDITIONS = [
    { edition: 'eng-bukhari', count: 6638 },
    { edition: 'eng-muslim', count: 4930 },
    { edition: 'eng-abudawud', count: 4419 },
    { edition: 'eng-nasai', count: 5364 },
    { edition: 'eng-ibnmajah', count: 4285 },
    { edition: 'eng-tirmidhi', count: 3625 },
    { edition: 'eng-malik', count: 1587 }
  ];

  for (let i = 0; i < 6; i++) {
    const pick = EN_EDITIONS[Math.floor(Math.random() * EN_EDITIONS.length)];
    const num = Math.floor(Math.random() * pick.count) + 1;
    const url = `https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/${pick.edition}/${num}.min.json`;
    try {
      const res = await fetch(url, { cache: 'force-cache' });
      if (res.ok) {
        const data = await res.json();
        const text = data.hadith?.english || data.english;
        if (text) return text;
      }
    } catch (_) {}
  }

  for (let j = 0; j < 20; j++) {
    const randomId = Math.floor(Math.random() * 5000) + 1;
    try {
      const res = await fetch(`https://hadeethenc.com/api/v1/hadeeths/one/?language=en&id=${randomId}`);
      if (res.ok) {
        const data = await res.json();
        const txt = data?.hadeeth || data?.title;
        if (txt) return txt;
      }
    } catch (_) {}
  }

  return '';
}

// Helper function to fetch a random French hadith
async function fetchRandomFrenchHadith() {
  const FR_EDITIONS = [
    { edition: 'fra-bukhari', count: 7008 },
    { edition: 'fra-muslim', count: 5362 },
    { edition: 'fra-abudawud', count: 4590 },
    { edition: 'fra-nasai', count: 5662 },
    { edition: 'fra-ibnmajah', count: 4339 },
    { edition: 'fra-malik', count: 1594 },
    { edition: 'fra-nawawi', count: 42 },
    { edition: 'fra-qudsi', count: 40 },
    { edition: 'fra-dehlawi', count: 40 }
  ];

  for (let i = 0; i < 6; i++) {
    const pick = FR_EDITIONS[Math.floor(Math.random() * FR_EDITIONS.length)];
    const num = Math.floor(Math.random() * pick.count) + 1;
    const url = `https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/${pick.edition}/${num}.min.json`;
    try {
      const res = await fetch(url, { cache: 'force-cache' });
      if (res.ok) {
        const data = await res.json();
        const text = data.hadiths?.[0]?.text || data.hadith?.french || data.french;
        if (text && text.trim()) {
          // Clean up the text a bit if needed
          return text.length > 500 ? text.substring(0, 497) + '...' : text;
        }
      }
    } catch (err) {
      console.warn('Failed to fetch French hadith:', err);
    }
  }

  // Fallback to a default French hadith if APIs fail
  const fallbackHadiths = [
    "Rapporté par 'Umar ibn Al-Khattab : J'ai entendu le Messager d'Allah (ﷺ) dire : « Les actions ne valent que par les intentions, et chacun n'obtient que ce qu'il a eu l'intention de faire... »",
    "Rapporté par 'A'ishah : Le Prophète (ﷺ) a dit : « Celui qui innove dans notre religion une chose qui n'en fait pas partie, cette chose sera rejetée. »",
    "Rapporté par Abu Hurairah : Le Messager d'Allah (ﷺ) a dit : « Un croyant fort est meilleur et plus aimé d'Allah qu'un croyant faible, bien qu'il y ait du bien dans les deux... »"
  ];

  return fallbackHadiths[Math.floor(Math.random() * fallbackHadiths.length)];
}


let currentDhikrIndex = 0;

async function loadDhikr() {
  displayCurrentDhikr();
  await loadDhikrSettings();
}



function getRewardText(rewardEn) {
  if (!rewardEn) return '';
  return CURRENT_LANG === 'ar' ? (DHIKR_REWARD_AR[rewardEn] || '') : rewardEn;
}

function getSuraName(chapter) {
  return CURRENT_LANG === 'ar' ? chapter.name_arabic : chapter.name_simple;
}

function displayCurrentDhikr() {
  const dhikr = dhikrCollection[currentDhikrIndex];
  const textEl = document.getElementById('dhikr-text');
  const infoEl = document.getElementById('dhikr-info');
  if (CURRENT_LANG === 'ar') {
    textEl.textContent = dhikr.arabic;
    const reward = getRewardText(dhikr.reward);
    infoEl.textContent = reward ? `الأجر: ${reward}` : '';
  } else {
    textEl.textContent = `${dhikr.arabic} (${dhikr.transliteration || ''}) - ${dhikr.english}`;
    infoEl.textContent = dhikr.reward ? `Reward: ${dhikr.reward}` : '';
  }
}

async function loadDhikrSettings() {
  try {
    const { dhikrSettings } = await chrome.storage.local.get('dhikrSettings');
    if (dhikrSettings) {
      const notificationsEnabled = dhikrSettings.notificationsEnabled || false;
      const interval = dhikrSettings.interval || 60;
      const mode = dhikrSettings.mode || 'notification';
      
      const toggleBtn = document.getElementById('toggle-notifications');
      toggleBtn.dataset.enabled = notificationsEnabled.toString();
      setIconLabel(toggleBtn, 'bell-line', notificationsEnabled ? t('notificationsOn') : t('notificationsOff'));
      document.getElementById('dhikr-interval').value = interval;
      
      const modeSelect = document.getElementById('reminder-mode');
      if (modeSelect) modeSelect.value = mode;
      
      if (notificationsEnabled) {
        document.getElementById('notification-settings').classList.remove('hidden');
        updatePresetButtons(interval);
      }
    }
  } catch (error) {
    console.error('Failed to load dhikr settings:', error);
  }
}

async function saveDhikrSettings() {
  try {
    const notificationsEnabled = document.getElementById('toggle-notifications').dataset.enabled === 'true';
    const interval = parseInt(document.getElementById('dhikr-interval').value);
    const mode = document.getElementById('reminder-mode')?.value || 'notification';
    
    const dhikrSettings = {
      notificationsEnabled,
      interval,
      mode,
      timestamp: Date.now()
    };
    
    await chrome.storage.local.set({ dhikrSettings });
    console.log('Saved dhikr settings:', dhikrSettings);
  } catch (error) {
    console.error('Failed to save dhikr settings:', error);
  }
}

async function setupQuranSelectors() {
  const suraDatalist = document.getElementById('sura-list');
  const reciterInput = document.getElementById('reciter-input');
  const reciterDatalist = document.getElementById('reciter-list');

  try {
    const [suras, reciters, { reciterCoverage }] = await Promise.all([
      fetchSuras(),
      fetchReciters(),
      chrome.storage.local.get('reciterCoverage')
    ]);

    suraDatalist.replaceChildren();
    suras.forEach((s) => {
      const label = `${s.id}. ${getSuraName(s)}`;
      SURA_LABEL_TO_ID[label] = String(s.id);
      SURA_ID_TO_LABEL[String(s.id)] = label;
      const option = document.createElement('option');
      option.value = label;
      suraDatalist.appendChild(option);
    });

    ALL_RECITERS = reciters;
    reciterDatalist.replaceChildren();
    reciters.forEach(r => {
      const coverage = getCoverageLabel(reciterCoverage, r.id);
      const label = `${r.reciter_name} (${r.style}, ${r.bitrate || 128}kbps, ${coverage})`;
      RECITER_LABEL_TO_KEY[label] = r.id;
      const option = document.createElement('option');
      option.value = label;
      reciterDatalist.appendChild(option);
    });
  } catch (error) {
    console.error("Failed to setup Qur'an selectors:", error);
    const suraInput = document.getElementById('sura-input');
    if (suraInput) suraInput.placeholder = 'Surahs unavailable. Check connection.';
    reciterInput.placeholder = 'Reciters unavailable. Check connection.';
  }
}

function populateSelect(selectEl, items, defaultOptionText, mapper) {
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = defaultOptionText;
  selectEl.replaceChildren(placeholder);
  items.forEach(item => {
    const { value, text } = mapper(item);
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    selectEl.appendChild(option);
  });
}

async function fetchSuras(lang = CURRENT_LANG || 'en') {
  const response = await fetch(`https://api.quran.com/api/v4/chapters?language=${lang}`);
  if (!response.ok) throw new Error('Failed to fetch suras');
  const { chapters } = await response.json();
  return chapters;
}

// --- AUDIO LOGIC ---

function validateQuranSelection() {
  const suraId = getSelectedSuraId();
  const reciterId = getReciterKey();
  const playButton = document.getElementById('play-quran');
  const autoplayButton = document.getElementById('autoplay-toggle');
  const availabilityStatus = document.getElementById('quran-availability');
  
  const isEnabled = !!suraId && !!reciterId;
  playButton.disabled = !isEnabled;
  autoplayButton.disabled = !isEnabled;
}

async function playQuranAudio() {
  setUILoading(true);
  const suraId = getSelectedSuraId();
  const reciterId = getReciterKey();
  const availabilityStatus = document.getElementById('quran-availability');
  
  // Update last known state when starting new playback
  lastKnownAudioState.suraId = suraId;
  lastKnownAudioState.reciterKey = reciterId;
  
  try {
    console.log('Popup: Testing background script connectivity...');
    try {
      const testResponse = await chrome.runtime.sendMessage({ action: 'ping' });
      console.log('Popup: Background script ping response:', testResponse);
    } catch (pingError) {
      console.error('Popup: Background script ping failed:', pingError);
      console.error('Popup: Chrome runtime lastError:', chrome.runtime.lastError);
    }
    
    const audioUrl = await getSuraAudioUrl(reciterId, suraId);
    console.log('Fetched audio URL:', audioUrl);
    
    console.log('Popup: Sending message to background script...');
    const response = await chrome.runtime.sendMessage({
      action: 'playAudio',
      audioUrl: audioUrl,
      suraId: suraId,
      reciterKey: reciterId,
    });

    console.log('Popup: Received response from background:', response);
    
    if (chrome.runtime.lastError) {
      console.error('Popup: Chrome runtime error:', chrome.runtime.lastError);
      throw new Error(`Chrome runtime error: ${chrome.runtime.lastError.message}`);
    }

    if (!response?.success) {
      throw new Error(response?.error || 'Background script failed to play audio.');
    }
    
    availabilityStatus.textContent = 'Playing...';
    availabilityStatus.style.color = 'var(--status-positive)';
    updatePlayButtonUI(true, true, 0);
    lastKnownAudioState.isPlaying = true;
    startProgressTracking();
  } catch (error) {
    console.error('Audio playback failed:', error);
    availabilityStatus.textContent = 'Reciter not available right now.';
    availabilityStatus.style.color = 'var(--status-negative)';
    updatePlayButtonUI(false, true);
  } finally {
    setUILoading(false);
  }
}

async function getSuraAudioUrl(reciterKey, suraId) {
  return getSuraAudioUrlShared(reciterKey, suraId, {
    resolveMp3Reciter: (key) => RECITER_CATALOG[key]
  });
}

async function pauseQuranAudio() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'pauseAudio' });
    if (response?.success) {
      // Get current state to update UI with correct progress
      const stateResponse = await chrome.runtime.sendMessage({ action: 'getAudioState' });
      if (stateResponse?.success) {
        updatePlayButtonUI(false, true, stateResponse.state.currentTime);
        updateProgressUI(stateResponse.state);
      } else {
        updatePlayButtonUI(false, true);
      }
    }
  } catch (error) {
    console.error('Failed to pause audio:', error);
    updatePlayButtonUI(false, true);
  }
  
  if (progressTrackingInterval) {
    clearInterval(progressTrackingInterval);
    progressTrackingInterval = null;
  }
}

async function resumeQuranAudio() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'resumeAudio' });
    if (response?.success) {
      // Get the current state after resuming to update UI properly
      const stateResponse = await chrome.runtime.sendMessage({ action: 'getAudioState' });
      if (stateResponse?.success) {
        updatePlayButtonUI(true, true, stateResponse.state.currentTime);
        updateProgressUI(stateResponse.state);
      } else {
        updatePlayButtonUI(true, true);
      }
      startProgressTracking();
    } else {
      console.error('Failed to resume audio:', response?.error);
      updatePlayButtonUI(false, true);
    }
  } catch (error) {
    console.error('Failed to resume audio:', error);
    updatePlayButtonUI(false, true);
  }
}

async function seekAudio(percentage) {
  try {
    const { success, state } = await chrome.runtime.sendMessage({ action: 'getAudioState' });
    if (success && state?.duration) {
      const seekTime = (percentage / 100) * state.duration;
      await chrome.runtime.sendMessage({ action: 'seekAudio', time: seekTime });
    }
  } catch (error) {
    console.error('Failed to seek audio:', error);
  }
}

async function toggleAutoplay() {
  const autoplayButton = document.getElementById('autoplay-toggle');
  const currentState = autoplayButton.dataset.autoplay === 'true';
  const newState = !currentState;
  
  updateAutoplayButton(newState);
  await saveUserSelections();
  
  console.log('Autoplay toggled:', newState ? 'ON' : 'OFF');
}

function updateAutoplayButton(isEnabled) {
  const autoplayButton = document.getElementById('autoplay-toggle');
  autoplayButton.dataset.autoplay = isEnabled.toString();
  autoplayButton.setAttribute('aria-pressed', isEnabled ? 'true' : 'false');
  setIconLabel(autoplayButton, 'cycle-arrow', isEnabled ? t('autoplayOn') : t('autoplayOff'));
}

function getNextSuraId(currentSuraId) {
  const currentId = parseInt(currentSuraId);
  return currentId >= 114 ? '1' : (currentId + 1).toString();
}

async function playNextSura() {
  const currentSuraId = getSelectedSuraId();
  const reciterKey = getReciterKey();
  
  if (!currentSuraId || !reciterKey) {
    console.log('Cannot play next sura: missing current selection');
    return;
  }
  
  const nextSuraId = getNextSuraId(currentSuraId);
  console.log(`Autoplay: Moving from Sura ${currentSuraId} to Sura ${nextSuraId}`);
  
  setSelectedSuraById(nextSuraId);
  await saveUserSelections();
  
  updatePlayButtonUI(false, true, 0);
  setIconLabel(document.getElementById('play-quran'), 'play-triangle', t('play'));
  document.getElementById('play-quran').dataset.action = 'play';
  
  await playQuranAudio();
}

// --- UI HELPERS ---

function setUILoading(isLoading) {
  document.getElementById('quran-loading').classList.toggle('hidden', !isLoading);
  document.getElementById('play-quran').disabled = isLoading;
  document.getElementById('pause-quran').disabled = isLoading;
}

function updatePlayButtonUI(isPlaying, isEnabled, currentTime = 0) {
  const playButton = document.getElementById('play-quran');
  const pauseButton = document.getElementById('pause-quran');

  // Enable/disable interactions depending on allowed state
  pauseButton.disabled = !isEnabled;

  // Check if we should show resume based on stored state and current selections
  const currentSuraId = getSelectedSuraId();
  const currentReciterKey = getReciterKey();
  const hasMatchingSelection = (
    lastKnownAudioState.suraId === currentSuraId && 
    lastKnownAudioState.reciterKey === currentReciterKey
  );
  
  const hasProgress = (currentTime > 0 || document.getElementById('progress-bar').value > 0) && hasMatchingSelection;

  if (isPlaying) {
    // Audio currently playing ---------------------------------------------
    playButton.classList.remove('hidden');
    playButton.disabled = true;
    setIconLabel(playButton, 'play-triangle', t('playing'));
    playButton.dataset.action = '';
    pauseButton.classList.remove('hidden');
    setIconLabel(pauseButton, 'pause-bars', t('pause'));
  } else {
    // Audio not playing (stopped or paused) --------------------------------
    playButton.classList.remove('hidden');
    playButton.disabled = !isEnabled;

    if (hasProgress && hasMatchingSelection) {
      setIconLabel(playButton, 'play-triangle', `${t('resume')} (${formatTime(currentTime)})`);
      playButton.dataset.action = 'resume';
    } else {
      setIconLabel(playButton, 'play-triangle', t('play'));
      playButton.dataset.action = 'play';
    }

    pauseButton.classList.add('hidden');
  }
}

function updateProgressUI({ currentTime, duration }) {
  // Show progress container if we have valid audio data
  if (duration > 0 || currentTime > 0) {
    document.getElementById('progress-container').classList.remove('hidden');
    
    if (duration > 0) {
      document.getElementById('progress-bar').value = (currentTime / duration) * 100;
      document.getElementById('progress-bar').max = 100;
    } else {
      document.getElementById('progress-bar').value = 0;
    }
    
    document.getElementById('current-time').textContent = formatTime(currentTime || 0);
    document.getElementById('total-time').textContent = formatTime(duration || 0);
  }
}

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function startProgressTracking() {
  if (progressTrackingInterval) clearInterval(progressTrackingInterval);
  
  progressTrackingInterval = setInterval(async () => {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getAudioState' });
      if (response?.success) {
        updateProgressUI(response.state);
        
        if (!response.state.isPlaying && response.state.currentTime >= response.state.duration && response.state.duration > 0) {
          // Audio finished playing
          clearInterval(progressTrackingInterval);
          progressTrackingInterval = null;
          
          const autoplayEnabled = document.getElementById('autoplay-toggle').dataset.autoplay === 'true';
          
          if (autoplayEnabled) {
            console.log('Sura finished, autoplay is enabled - playing next sura');
            // Reset UI to fresh state before autoplay
            updatePlayButtonUI(false, true, 0);
            setIconLabel(document.getElementById('play-quran'), 'play-triangle', t('play'));
            document.getElementById('play-quran').dataset.action = 'play';
            document.getElementById('progress-bar').value = 0;
            document.getElementById('current-time').textContent = formatTime(0);
            
            // Small delay before playing next to ensure clean transition
            setTimeout(() => {
              playNextSura();
            }, 1000);
          } else {
            console.log('Sura finished, autoplay is disabled - stopping playback');
            updatePlayButtonUI(false, true, 0);
            setIconLabel(document.getElementById('play-quran'), 'play-triangle', t('play'));
            document.getElementById('play-quran').dataset.action = 'play';
            document.getElementById('progress-bar').value = 0;
            document.getElementById('current-time').textContent = formatTime(0);
          }
        } else if (!response.state.isPlaying) {
          // Audio paused - but don't clear the interval immediately because it might resume
          updatePlayButtonUI(false, true, response.state.currentTime);
        } else if (response.state.isPlaying) {
          updatePlayButtonUI(true, true, response.state.currentTime);
        }
      } else {
        throw new Error('Failed to get audio state.');
      }
    } catch (error) {
      console.error('Progress tracking error:', error);
      clearInterval(progressTrackingInterval);
      progressTrackingInterval = null;
    }
  }, 1000);
}

// --- DHIKR FUNCTIONALITY ---

let notificationToggleInProgress = false;
let lastToggleTime = 0;

function nextDhikr() {
  currentDhikrIndex = (currentDhikrIndex + 1) % dhikrCollection.length;
  displayCurrentDhikr();
}

async function toggleDhikrNotifications() {
  // Prevent multiple simultaneous calls and rapid clicking
  const now = Date.now();
  if (notificationToggleInProgress || (now - lastToggleTime) < 1000) {
    console.log('Notification toggle already in progress or too soon, ignoring click');
    return;
  }
  
  lastToggleTime = now;
  notificationToggleInProgress = true;
  
  const button = document.getElementById('toggle-notifications');
  const settingsPanel = document.getElementById('notification-settings');
  const currentState = button.dataset.enabled === 'true';
  const newState = !currentState;
  
  // Disable button during operation and show loading state
  button.disabled = true;
  const originalText = button.textContent;
  setIconLabel(button, 'cycle-arrow', newState ? 'Enabling...' : 'Disabling...');
  
  try {
    let response;
    const messageTimeout = 1000;
    
    if (newState && !validateInterval()) {
      button.disabled = false;
      notificationToggleInProgress = false;
      return;
    }
    
    if (newState) {
      // Starting notifications
      settingsPanel.classList.remove('hidden');
      const interval = parseInt(document.getElementById('dhikr-interval').value);
      const mode = document.getElementById('reminder-mode')?.value || 'notification';
      updatePresetButtons(interval);
      
      console.log('Sending startDhikrNotifications message...');
      
      response = await Promise.race([
        new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            action: 'startDhikrNotifications',
            interval: interval,
            mode: mode
          }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        }),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timed out')), messageTimeout);
        })
      ]);
      
    } else {
      settingsPanel.classList.add('hidden');
      
      console.log('Sending stopDhikrNotifications message...');
      
      response = await Promise.race([
        new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            action: 'stopDhikrNotifications'
          }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        }),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timed out')), messageTimeout);
        })
      ]);
    }
    
    console.log('Received response:', response);
    
    if (!response) {
      throw new Error('No response received from background script');
    }
    
    if (typeof response !== 'object') {
      throw new Error(`Invalid response format: expected object, got ${typeof response}`);
    }
    
    if (!response.success) {
      throw new Error(response.error || 'Background script returned failure');
    }
    
    button.dataset.enabled = newState.toString();
    button.setAttribute('aria-pressed', newState ? 'true' : 'false');
    setIconLabel(button, 'bell-line', newState ? t('notificationsOn') : t('notificationsOff'));
    
    await saveDhikrSettings();
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
  } catch (error) {
    console.error('Failed to toggle notifications:', error);
    
    // Reset button state on error
    button.dataset.enabled = currentState.toString();
    button.textContent = originalText;
    
    if (currentState) {
      settingsPanel.classList.remove('hidden');
    } else {
      settingsPanel.classList.add('hidden');
    }
    
    // Show appropriate error message
    let errorMessage = 'An error occurred. Please try again.';
    
    if (error.message.includes('disabled') || error.message.includes('denied')) {
      errorMessage = 'Notifications are blocked. Please enable notifications for this extension in Chrome settings.';
    } else if (error.message.includes('timeout') || error.message.includes('timed out')) {
      errorMessage = 'Request timed out. The extension might be restarting. Please wait a moment and try again.';
    } else if (error.message.includes('Extension context invalidated')) {
      errorMessage = 'Extension was reloaded. Please close and reopen the popup.';
    } else if (error.message.includes('runtime.lastError')) {
      errorMessage = 'Chrome extension error. Please try reloading the extension.';
    } else if (error.message.includes('already in progress')) {
      errorMessage = 'Operation already in progress. Please wait and try again.';
    } else if (error.message.includes('Invalid interval')) {
      errorMessage = 'Invalid notification interval. Please check your settings.';
    } else if (error.message.length > 0 && error.message.length < 100) {
      errorMessage = `Error: ${error.message}`;
    }
    
    showNotificationMessage(errorMessage, 'error');
  } finally {
    button.disabled = false;
    notificationToggleInProgress = false;
  }
}

function showNotificationMessage(message, type = 'info') {
  let messageEl = document.getElementById('notification-message');
  if (!messageEl) {
    messageEl = document.createElement('div');
    messageEl.id = 'notification-message';
    messageEl.className = 'card__notification-message';
    const toggleButton = document.getElementById('toggle-notifications');
    toggleButton.parentNode.insertBefore(messageEl, toggleButton.nextSibling);
  }
  
  messageEl.textContent = message;
  messageEl.className = `card__notification-message card__notification-message--${type}`;
  messageEl.classList.remove('hidden');
  
  setTimeout(() => {
    messageEl.classList.add('hidden');
  }, 8000);
}

function validateInterval() {
  const input = document.getElementById('dhikr-interval');
  const validationMessage = document.getElementById('interval-validation');
  const value = parseInt(input.value);
  
  if (isNaN(value) || value < 5 || value > 3600) {
    input.setCustomValidity('Interval must be between 5 seconds and 1 hour (3600 seconds)');
    validationMessage.textContent = 'Please enter a valid interval between 5 seconds and 1 hour';
    validationMessage.classList.remove('hidden');
    return false;
  } else {
    input.setCustomValidity('');
    validationMessage.classList.add('hidden');
    updatePresetButtons(value);
    saveDhikrSettings();
    
    // Update notifications if they're enabled
    const notificationsEnabled = document.getElementById('toggle-notifications').dataset.enabled === 'true';
    if (notificationsEnabled) {
      chrome.runtime.sendMessage({
        action: 'updateDhikrInterval',
        interval: value
      });
    }
    
    return true;
  }
}

function updatePresetButtons(currentInterval) {
  document.querySelectorAll('.card__preset').forEach(button => {
    const buttonSeconds = parseInt(button.dataset.seconds);
    if (buttonSeconds === currentInterval) {
      button.classList.add('active');
    } else {
      button.classList.remove('active');
    }
  });
}

// ---------------------------
// 🗺️  BASIC I18N SUPPORT
// ---------------------------

let CURRENT_LANG = 'en';

function t(key) {
  return (I18N[CURRENT_LANG] && I18N[CURRENT_LANG][key]) || key;
}

async function initLanguage() {
  // Load saved preference or fall back to browser UI language
  const { [LANG_STORAGE_KEY]: savedLang } = await chrome.storage.local.get(LANG_STORAGE_KEY);
  if (savedLang && I18N[savedLang]) {
    CURRENT_LANG = savedLang;
  } else {
    const browserLang = (chrome.i18n?.getUILanguage?.() || navigator.language || 'en').split('-')[0];
    CURRENT_LANG = I18N[browserLang] ? browserLang : 'en';
  }

  // Apply language immediately
  applyLanguage();

  // Set selector value
  const langSelect = document.getElementById('language-select');
  if (langSelect) {
    langSelect.value = CURRENT_LANG;
    langSelect.addEventListener('change', async (e) => {
      const newLang = e.target.value;
      if (I18N[newLang]) {
        CURRENT_LANG = newLang;
        await chrome.storage.local.set({ [LANG_STORAGE_KEY]: newLang });
        applyLanguage();
      }
    });
  }
}

function applyLanguage() {
  // Direction & lang attribute
  document.documentElement.lang = CURRENT_LANG;
  document.body.dir = CURRENT_LANG === 'ar' ? 'rtl' : 'ltr';

  // Static titles
  const titleEl = document.getElementById('app-title');
  if (titleEl) titleEl.textContent = t('appTitle');
  const quranTitle = document.getElementById('quran-title');
  if (quranTitle) quranTitle.textContent = t('quran');
  const hadithTitle = document.getElementById('hadith-title');
  if (hadithTitle) hadithTitle.textContent = t('hadith');
  const dhikrTitle = document.getElementById('dhikr-title');
  if (dhikrTitle) dhikrTitle.textContent = t('dhikr');

  // Placeholders & labels
  const reciterInput = document.getElementById('reciter-input');
  if (reciterInput) reciterInput.placeholder = t('reciterPlaceholder');

  const reminderLabel = document.getElementById('reminder-label');
  if (reminderLabel) reminderLabel.childNodes[0].nodeValue = `${t('reminderLabel')}\n            `;

  const reminderStyleLabel = document.getElementById('reminder-style-label');
  if (reminderStyleLabel) reminderStyleLabel.childNodes[0].nodeValue = `${t('reminderStyle')}\n            `;

  const modeSelect = document.getElementById('reminder-mode');
  if (modeSelect && modeSelect.options.length >= 2) {
    modeSelect.options[0].textContent = t('modeNotification');
    modeSelect.options[1].textContent = t('modePopup');
  }

  const playBtn = document.getElementById('play-quran');
  if (playBtn && playBtn.dataset.action === 'play') setIconLabel(playBtn, 'play-triangle', t('play'));

  const pauseBtn = document.getElementById('pause-quran');
  if (pauseBtn) setIconLabel(pauseBtn, 'pause-bars', t('pause'));

  const autoplayBtn = document.getElementById('autoplay-toggle');
  if (autoplayBtn) {
    const on = autoplayBtn.dataset.autoplay === 'true';
    setIconLabel(autoplayBtn, 'cycle-arrow', on ? t('autoplayOn') : t('autoplayOff'));
  }

  const nextDhikrBtn = document.getElementById('next-dhikr');
  if (nextDhikrBtn) setIconLabel(nextDhikrBtn, 'next-arrow', t('nextDhikr'));
  const notifBtn = document.getElementById('toggle-notifications');
  if (notifBtn) {
    const en = notifBtn.dataset.enabled === 'true';
    setIconLabel(notifBtn, 'bell-line', en ? t('notificationsOn') : t('notificationsOff'));
  }

  const loadingEl = document.getElementById('quran-loading');
  if (loadingEl) loadingEl.textContent = t('loading');

  const suraInput = document.getElementById('sura-input');
  if (suraInput) suraInput.placeholder = t('searchSura');

  const sleepTimerLabel = document.getElementById('sleep-timer-label');
  if (sleepTimerLabel) {
    const select = document.getElementById('sleep-timer');
    sleepTimerLabel.childNodes[0].nodeValue = t('sleepTimerLabel') + ' ';
    if (select) {
      [['0', 'sleepTimerOff'], ['15', 'sleepTimer15'], ['30', 'sleepTimer30'], ['45', 'sleepTimer45'], ['60', 'sleepTimer60']]
        .forEach(([value, key]) => {
          const opt = select.querySelector(`option[value="${value}"]`);
          if (opt) opt.textContent = t(key);
        });
    }
  }

  const clearReciterBtn = document.getElementById('clear-reciter');
  if (clearReciterBtn) setIconLabel(clearReciterBtn, 'clear-cross', t('clearReciter'));

  const currentTimeEl = document.getElementById('current-time');
  if (currentTimeEl) currentTimeEl.textContent = t('currentTime');
  
  const totalTimeEl = document.getElementById('total-time');
  if (totalTimeEl) totalTimeEl.textContent = t('totalTime');
  
  const hadithTextEl = document.getElementById('hadith-text');
  if (hadithTextEl) hadithTextEl.textContent = t('hadithText');

  const dhikrTextEl = document.getElementById('dhikr-text');
  if (dhikrTextEl) dhikrTextEl.textContent = t('dhikrText');

  const intervalValidationEl = document.getElementById('interval-validation');
  if (intervalValidationEl) intervalValidationEl.textContent = t('intervalValidation');

  const notificationMessageEl = document.getElementById('notification-message');
  if (notificationMessageEl) notificationMessageEl.textContent = t('notificationMessage');


  const hadithEl = document.getElementById('hadith-text');
  if (hadithEl) hadithEl.textContent = t('loading');

  displayCurrentDhikr();
  loadHadith();
  fetchSuras().then(suras => {
    const datalist = document.getElementById('sura-list');
    const currentSelected = getSelectedSuraId();

    // Wipe and rebuild the lookup maps + datalist with locale-appropriate names.
    Object.keys(SURA_LABEL_TO_ID).forEach((k) => delete SURA_LABEL_TO_ID[k]);
    Object.keys(SURA_ID_TO_LABEL).forEach((k) => delete SURA_ID_TO_LABEL[k]);
    if (datalist) datalist.replaceChildren();
    suras.forEach((s) => {
      const label = `${s.id}. ${getSuraName(s)}`;
      SURA_LABEL_TO_ID[label] = String(s.id);
      SURA_ID_TO_LABEL[String(s.id)] = label;
      if (datalist) {
        const option = document.createElement('option');
        option.value = label;
        datalist.appendChild(option);
      }
    });

    if (currentSelected) {
      setSelectedSuraById(currentSelected);
    }
  }).catch(err => console.error('Failed to refresh suras for lang', CURRENT_LANG, err));
}
/**
 * Popup script for Qur'an & Sunnah Companion
 * Handles UI, API calls, and communication with the background script.
 * This version uses the Quran.com v4 API for Surah names, reciters, and audio.
 */

import { dhikrCollection, DHIKR_REWARD_AR, DHIKR_REWARD_FR } from '../shared/dhikr.js';
import { getSuraAudioUrl as getSuraAudioUrlShared } from '../shared/audio-urls.js';

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

// Build an inline SVG node referencing a sprite symbol by id.
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
  const suraSelect = document.getElementById('sura-select');
  const reciterInput = document.getElementById('reciter-input');

  playButton.addEventListener('click', handlePlayPauseResume);
  pauseButton.addEventListener('click', handlePlayPauseResume);
  autoplayButton.addEventListener('click', toggleAutoplay);
  
  suraSelect.addEventListener('change', () => {
    handleInputChange();
  });
  reciterInput.addEventListener('input', () => {
    handleInputChange();
  });

  document.getElementById('progress-bar').addEventListener('change', (e) => {
    seekAudio(e.target.value);
  });

  // Dhikr event handlers
  document.getElementById('next-dhikr').addEventListener('click', nextDhikr);
  
  // Add single event listener for notifications toggle with debouncing
  const notificationToggle = document.getElementById('toggle-notifications');
  if (notificationToggle && !notificationToggle.hasAttribute('data-listener-added')) {
    notificationToggle.addEventListener('click', toggleDhikrNotifications);
    notificationToggle.setAttribute('data-listener-added', 'true');
  }
  
  document.getElementById('dhikr-interval').addEventListener('input', validateInterval);
  
  // Preset buttons
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

  // Reminder mode selector change ------------------------------------------
  const modeSelect = document.getElementById('reminder-mode');
  if (modeSelect) {
    modeSelect.addEventListener('change', async () => {
      await saveDhikrSettings();

      // If notifications already active, update mode in background
      const notifEnabled = document.getElementById('toggle-notifications').dataset.enabled === 'true';
      if (notifEnabled) {
        const newMode = modeSelect.value;
        browser.runtime.sendMessage({ action: 'updateDhikrMode', mode: newMode }, (resp) => {
          if (browser.runtime.lastError) {
            console.warn('Failed to update mode:', browser.runtime.lastError.message);
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
  const currentSuraId = document.getElementById('sura-select').value;
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
    const suraId = document.getElementById('sura-select').value;
    const reciterKey = getReciterKey();
    const autoplayEnabled = document.getElementById('autoplay-toggle').dataset.autoplay === 'true';
    
    const userSelections = {
      suraId: suraId || null,
      reciterKey: reciterKey || null,
      autoplayEnabled: autoplayEnabled,
      timestamp: Date.now()
    };
    
    await browser.storage.local.set({ userSelections });
    // console.log('Saved user selections:', userSelections);
  } catch (error) {
    console.error('Failed to save user selections:', error);
  }
}

async function loadSavedAudioState() {
  try {
    // Load both user selections and audio state
    const { audioState, userSelections } = await browser.storage.local.get(['audioState', 'userSelections']);
    
    // First, restore user selections (even if no audio is playing)
    if (userSelections?.suraId || userSelections?.reciterKey) {
      // console.log('Restoring user selections:', userSelections);
      
      if (userSelections.suraId) {
        document.getElementById('sura-select').value = userSelections.suraId;
      }

      // Wait for reciters to load before setting reciter selection
      const waitForReciters = new Promise(resolve => {
        const reciterDatalist = document.getElementById('reciter-list');
        if (reciterDatalist.options.length > 0) { // Already populated
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
        setTimeout(() => { observer.disconnect(); resolve(); }, 3000); // Failsafe timeout
      });

      await waitForReciters;
      
      if (userSelections.reciterKey) {
        setReciterInputByKey(userSelections.reciterKey);
      }
      
      // Restore autoplay setting
      if (typeof userSelections.autoplayEnabled === 'boolean') {
        updateAutoplayButton(userSelections.autoplayEnabled);
      }
      
      validateQuranSelection();
    }

    // Then, restore audio state - check if there's any active audio session
    const stateResponse = await browser.runtime.sendMessage({ action: 'getAudioState' });
    if (stateResponse?.success && stateResponse.state?.audioUrl) {
      const currentSuraId = document.getElementById('sura-select').value;
      const currentReciterKey = getReciterKey();
      
      // console.log('Checking audio state:', { 
      //   audioState: stateResponse.state, 
      //   currentSuraId, 
      //   currentReciterKey,
      //   stateSuraId: stateResponse.state.suraId,
      //   stateReciterKey: stateResponse.state.reciterKey
      // });
      
      // If the audio state matches current selections, restore the playback UI
      if (stateResponse.state.reciterKey === currentReciterKey && 
          stateResponse.state.suraId === currentSuraId) {
        
        // console.log('Restoring audio playback state:', stateResponse.state);
        updateProgressUI(stateResponse.state);
        updatePlayButtonUI(stateResponse.state.isPlaying, true, stateResponse.state.currentTime);
        
        if (stateResponse.state.isPlaying) {
          startProgressTracking();
        }
      } else if (stateResponse.state.reciterKey && stateResponse.state.suraId) {
        // If there's an active audio session but it doesn't match current selections,
        // update the selections to match the active session
        // console.log('Updating selections to match active audio session');
        
        if (Array.from(document.getElementById('sura-select').options).some(opt => opt.value === stateResponse.state.suraId)) {
          document.getElementById('sura-select').value = stateResponse.state.suraId;
        }
        
        setReciterInputByKey(stateResponse.state.reciterKey);
        
        validateQuranSelection();
        updateProgressUI(stateResponse.state);
        updatePlayButtonUI(stateResponse.state.isPlaying, true, stateResponse.state.currentTime);
        
        if (stateResponse.state.isPlaying) {
          startProgressTracking();
        }
        
        // Save these as the new user selections
        await saveUserSelections();
      }
    }
  } catch (error) {
    console.error('Failed to load saved audio state:', error);
  }
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
      // ---------------- French with fallback ----------------
      const text = await fetchRandomFrenchHadith();
      hadithEl.textContent = text || 'Il n\'y a de divinité qu\'Allah';
    } else {
      // ---------------- English with local cache ----------------
      const CACHE_KEY = 'hadithCacheEn';
      const TARGET_CACHE_SIZE = 30;

      let { [CACHE_KEY]: cacheArr } = await browser.storage.local.get(CACHE_KEY);
      cacheArr = Array.isArray(cacheArr) ? cacheArr : [];

      let text = '';
      if (cacheArr.length > 0) {
        text = cacheArr.shift(); // use first item
        // save trimmed cache back but don't await to prevent UI delay
        browser.storage.local.set({ [CACHE_KEY]: cacheArr }).catch(console.error);
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
            await browser.storage.local.set({ [CACHE_KEY]: updated });
          } catch (err) {
            console.warn('Failed to refill hadith cache:', err);
          }
        })();
      }

      hadithEl.textContent = text || 'Error loading Hadith.';
    }
  } catch (error) {
    console.error('Failed to load Hadith:', error);
    hadithEl.textContent = CURRENT_LANG === 'ar' ? 'لَا إِلَٰهَ إِلَّا اللَّهُ' : 'There is no god but Allah';
  }
}

// Helper: fetch a single random English hadith (tries fast JSdelivr, fallback HadeethEnc)
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

  // Try JSDelivr first – 6 quick attempts (random editions)
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
    } catch (_) { /* ignore */ }
  }

  // Fallback – up to 20 attempts on HadeethEnc (random IDs)
  for (let j = 0; j < 20; j++) {
    const randomId = Math.floor(Math.random() * 5000) + 1;
    try {
      const res = await fetch(`https://hadeethenc.com/api/v1/hadeeths/one/?language=en&id=${randomId}`);
      if (res.ok) {
        const data = await res.json();
        const txt = data?.hadeeth || data?.title;
        if (txt) return txt;
      }
    } catch (_) { /* ignore */ }
  }

  return '';
}

// French Hadith fetcher with fallbacks
async function fetchRandomFrenchHadith() {
  const FRENCH_FALLBACKS = [
    'Le Prophète ﷺ a dit : "Les actions ne valent que par les intentions."',
    'Le Prophète ﷺ a dit : "Souriez à votre frère, c\'est une aumône."',
    'Le Prophète ﷺ a dit : "Le meilleur des hommes est celui qui est utile aux autres."',
    'Le Prophète ﷺ a dit : "Celui qui croit en Allah et au Jour dernier, qu\'il dise du bien ou qu\'il se taise."',
    'Le Prophète ﷺ a dit : "La foi (iman) a soixante-dix et quelques branches."'
  ];

  // Try HadeethEnc API for French
  for (let i = 0; i < 10; i++) {
    const randomId = Math.floor(Math.random() * 1000) + 1;
    try {
      const res = await fetch(`https://hadeethenc.com/api/v1/hadeeths/one/?language=fr&id=${randomId}`);
      if (res.ok) {
        const data = await res.json();
        const txt = data?.hadeeth || data?.title;
        if (txt && txt.length > 20) return txt;
      }
    } catch (_) { /* ignore */ }
  }

  // Return random fallback
  return FRENCH_FALLBACKS[Math.floor(Math.random() * FRENCH_FALLBACKS.length)];
}

// Comprehensive collection of authentic Dhikr with their rewards

let currentDhikrIndex = 0;

async function loadDhikr() {
  displayCurrentDhikr();
  await loadDhikrSettings();
}

// --- Arabic translations for Dhikr rewards -----------------------------------

// --- French translations for Dhikr rewards -----------------------------------

// Helper to get reward in current language ------------------------------------
function getRewardText(rewardEn) {
  if (!rewardEn) return '';
  if (CURRENT_LANG === 'ar') return DHIKR_REWARD_AR[rewardEn] || '';
  if (CURRENT_LANG === 'fr') return DHIKR_REWARD_FR[rewardEn] || rewardEn;
  return rewardEn;
}

// Helper to pick proper sura display name -------------------------------------
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
  } else if (CURRENT_LANG === 'fr') {
    textEl.textContent = `${dhikr.arabic} (${dhikr.transliteration || ''}) - ${dhikr.english}`;
    const reward = getRewardText(dhikr.reward);
    infoEl.textContent = reward ? `Récompense : ${reward}` : '';
  } else {
    // Default to English
    textEl.textContent = `${dhikr.arabic} (${dhikr.transliteration || ''}) - ${dhikr.english}`;
    const reward = getRewardText(dhikr.reward);
    infoEl.textContent = reward ? `Reward: ${reward}` : '';
  }
}


async function loadDhikrSettings() {
  try {
    const { dhikrSettings } = await browser.storage.local.get('dhikrSettings');
    if (dhikrSettings) {
      const notificationsEnabled = dhikrSettings.notificationsEnabled || false;
      const interval = dhikrSettings.interval || 60;
      const mode = dhikrSettings.mode || 'notification';
      
      document.getElementById('toggle-notifications').dataset.enabled = notificationsEnabled.toString();
      setIconLabel(document.getElementById('toggle-notifications'), 'bell-line', notificationsEnabled ? t('notificationsOn') : t('notificationsOff'));
      document.getElementById('dhikr-interval').value = interval;
      
      // Set reminder mode selector
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
    
    await browser.storage.local.set({ dhikrSettings });
    console.log('Saved dhikr settings:', dhikrSettings);
  } catch (error) {
    console.error('Failed to save dhikr settings:', error);
  }
}

async function setupQuranSelectors() {
  const suraSelect = document.getElementById('sura-select');
  const reciterInput = document.getElementById('reciter-input');
  const reciterDatalist = document.getElementById('reciter-list');

  try {
    const [suras, reciters] = await Promise.all([fetchSuras(), fetchReciters()]);
    populateSelect(suraSelect, suras, t('selectSura'), s => ({ value: s.id, text: `${s.id}. ${getSuraName(s)}` }));
    // Store for filtering
    ALL_RECITERS = reciters;
    // Build datalist
    reciterDatalist.replaceChildren();
    reciters.forEach(r => {
      const label = `${r.reciter_name} (${r.style}, ${r.bitrate || 128}kbps)`;
      RECITER_LABEL_TO_KEY[label] = r.id;
      const option = document.createElement('option');
      option.value = label;
      reciterDatalist.appendChild(option);
    });
  } catch (error) {
    console.error("Failed to setup Qur'an selectors:", error);
    const errorOption = document.createElement('option');
    errorOption.value = '';
    errorOption.textContent = 'Error';
    suraSelect.replaceChildren(errorOption);
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
  // Quran.com supports ?language=ar or en
  const response = await fetch(`https://api.quran.com/api/v4/chapters?language=${lang}`);
  if (!response.ok) throw new Error('Failed to fetch suras');
  const { chapters } = await response.json();
  // console.log(`Fetched ${chapters.length} surahs for lang`, lang);
  return chapters;
}

// ---------------------------------------------------------------------------------
// Reciter catalogue helpers (multi-provider)
// ---------------------------------------------------------------------------------

// 1) Quran.com – existing provider -------------------------------------------------
async function fetchQuranComReciters() {
  const url = 'https://api.quran.com/api/v4/resources/recitations?per_page=500';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Quran.com recitations request failed');
  const { recitations } = await res.json();
  return recitations.map(r => {
    const reciterKey = `qc:${r.id}`;
    return {
      id: reciterKey,
      reciter_name: r.reciter_name,
      style: r.style || 'Default',
      source: 'qurancom',
      qurancomId: r.id,
      bitrate: 128
    };
  });
}

// 2) MP3Quran.net -----------------------------------------------------------------
async function fetchMp3QuranReciters() {
  const url = 'https://www.mp3quran.net/api/_english.json';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.reciters)) return [];

    return data.reciters.map(r => {
      const reciterKey = `mp3:${r.id}`;
      return {
        id: reciterKey,
        reciter_name: r.name,
        style: r.rewaya || 'Default',
        source: 'mp3quran',
        server: r.Server.endsWith('/') ? r.Server : r.Server + '/',
        bitrate: 128,
        mp3quranId: r.id
      };
    });
  } catch (err) {
    console.error('Failed to fetch MP3Quran reciters:', err);
    return [];
  }
}

// 3) Islamic.network CDN -----------------------------------------------------------
// No public catalogue endpoint – we hard-code popular slugs. Extend as needed.
async function fetchIslamicNetworkReciters() {
  const slugs = [
    'ar.alafasy',
    'ar.husary',
    'ar.shuraym',
    'ar.tablawee'
    // Add more slugs here as required
  ];
  return slugs.map(slug => {
    const reciterKey = `islamic:${slug}`;
    const prettyName = slug.split('.')[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return {
      id: reciterKey,
      reciter_name: prettyName,
      style: 'Default',
      source: 'islamic',
      slug,
      bitrate: 128
    };
  });
}

const RECITER_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

async function loadCachedReciters() {
  try {
    const { reciterCache } = await browser.storage.local.get('reciterCache');
    if (!reciterCache?.timestamp || !Array.isArray(reciterCache.reciters)) return null;
    if (Date.now() - reciterCache.timestamp > RECITER_CACHE_TTL_MS) return null;
    return reciterCache.reciters;
  } catch (_) {
    return null;
  }
}

// Aggregate loader ----------------------------------------------------------------
async function fetchReciters() {
  const cached = await loadCachedReciters();
  if (cached) {
    cached.forEach(r => {
      RECITER_CATALOG[r.id] = r;
      (r.altIds || []).forEach(alt => (RECITER_CATALOG[alt] = r));
    });
    return [...cached].sort((a, b) => a.reciter_name.localeCompare(b.reciter_name));
  }

  const combined = (await Promise.all([
    fetchQuranComReciters(),
    fetchMp3QuranReciters(),
    fetchIslamicNetworkReciters()
  ])).flat();

  // -----------------------------------------------
  // 🧹  Deduplicate reciters across providers
  // -----------------------------------------------
  const dedupedMap = new Map();
  combined.forEach(r => {
    // Normalise key by reciter name + style (case-insensitive)
    const key = `${r.reciter_name.toLowerCase()}|${(r.style || '').toLowerCase()}`;
    if (!dedupedMap.has(key)) {
      // First occurrence becomes canonical entry
      dedupedMap.set(key, { ...r, altIds: [] });
    } else {
      // Duplicate – push to altIds so we still remember it
      dedupedMap.get(key).altIds.push(r.id);
    }
  });

  const deduped = Array.from(dedupedMap.values());

  // Persist in global catalogue (canonical id only)
  deduped.forEach(r => {
    RECITER_CATALOG[r.id] = r;
    // Also register alternative IDs to point to canonical entry
    (r.altIds || []).forEach(alt => (RECITER_CATALOG[alt] = r));
  });

  // Cache deduped catalogue for 6 h (21 600 000 ms)
  try {
    await browser.storage.local.set({ reciterCache: { reciters: deduped, timestamp: Date.now() } });
  } catch (err) {
    console.warn('Failed to save reciter cache:', err);
  }

  return deduped.sort((a, b) => a.reciter_name.localeCompare(b.reciter_name));
}

// --- AUDIO LOGIC ---

function validateQuranSelection() {
  const suraId = document.getElementById('sura-select').value;
  const reciterId = getReciterKey();
  const playButton = document.getElementById('play-quran');
  const autoplayButton = document.getElementById('autoplay-toggle');
  const availabilityStatus = document.getElementById('quran-availability');
  
  const isEnabled = !!suraId && !!reciterId;
  playButton.disabled = !isEnabled;
  autoplayButton.disabled = !isEnabled;
  
  // if (isEnabled) {
  //     availabilityStatus.innerHTML = '&#x2705; Ready to play';
  //     availabilityStatus.style.color = 'green';
  // } else {
  //     availabilityStatus.textContent = '';
  // }
}

async function playQuranAudio() {
  setUILoading(true);
  const suraId = document.getElementById('sura-select').value;
  const reciterId = getReciterKey();
  const availabilityStatus = document.getElementById('quran-availability');
  
  try {
    // First, test if background script is responsive
    console.log('Popup: Testing background script connectivity...');
    try {
      const testResponse = await browser.runtime.sendMessage({ action: 'ping' });
      console.log('Popup: Background script ping response:', testResponse);
    } catch (pingError) {
      console.error('Popup: Background script ping failed:', pingError);
      console.error('Popup: Chrome runtime lastError:', browser.runtime.lastError);
    }
    
    const audioUrl = await getSuraAudioUrl(reciterId, suraId);
    console.log('Fetched audio URL:', audioUrl);
    
    console.log('Popup: Sending message to background script...');
    const response = await browser.runtime.sendMessage({
      action: 'playAudio',
      audioUrl: audioUrl,
      suraId: suraId,
      reciterKey: reciterId,
    });

    console.log('Popup: Received response from background:', response);
    
    if (browser.runtime.lastError) {
      console.error('Popup: Chrome runtime error:', browser.runtime.lastError);
      throw new Error(`Chrome runtime error: ${browser.runtime.lastError.message}`);
    }

    if (!response?.success) {
      throw new Error(response?.error || 'Background script failed to play audio.');
    }
    
    availabilityStatus.textContent = '✅ Playing...';
    availabilityStatus.style.color = 'green';
    updatePlayButtonUI(true, true, 0);
    startProgressTracking();
  } catch (error) {
    console.error('Audio playback failed:', error);
    availabilityStatus.textContent = '❌ Reciter not available right now.';
    availabilityStatus.style.color = 'red';
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
    const response = await browser.runtime.sendMessage({ action: 'pauseAudio' });
    if (response?.success) {
      // Get current state to update UI with correct progress
      const stateResponse = await browser.runtime.sendMessage({ action: 'getAudioState' });
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
    const response = await browser.runtime.sendMessage({ action: 'resumeAudio' });
    if (response?.success) {
      // Get the current state after resuming to update UI properly
      const stateResponse = await browser.runtime.sendMessage({ action: 'getAudioState' });
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
    const { success, state } = await browser.runtime.sendMessage({ action: 'getAudioState' });
    if (success && state?.duration) {
      const seekTime = (percentage / 100) * state.duration;
      await browser.runtime.sendMessage({ action: 'seekAudio', time: seekTime });
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
  // Surahs are numbered 1-114, so wrap around to 1 after 114
  return currentId >= 114 ? '1' : (currentId + 1).toString();
}

async function playNextSura() {
  const currentSuraId = document.getElementById('sura-select').value;
  const reciterKey = getReciterKey();
  
  if (!currentSuraId || !reciterKey) {
    console.log('Cannot play next sura: missing current selection');
    return;
  }
  
  const nextSuraId = getNextSuraId(currentSuraId);
  console.log(`Autoplay: Moving from Sura ${currentSuraId} to Sura ${nextSuraId}`);
  
  // Update the selection
  document.getElementById('sura-select').value = nextSuraId;
  await saveUserSelections();
  
  // Ensure UI is in clean state before starting new sura
  updatePlayButtonUI(false, true, 0);
  setIconLabel(document.getElementById('play-quran'), 'play-triangle', t('play'));
  document.getElementById('play-quran').dataset.action = 'play';
  
  // Start playing the next sura
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

  const hasProgress = currentTime > 0 || document.getElementById('progress-bar').value > 0;

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
    setIconLabel(playButton, 'play-triangle', hasProgress ? t('resume') : t('play'));
    playButton.dataset.action = hasProgress ? 'resume' : 'play';
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
      const response = await browser.runtime.sendMessage({ action: 'getAudioState' });
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
          // Audio paused - but don't clear the interval immediately
          // This allows us to detect when it resumes
          updatePlayButtonUI(false, true, response.state.currentTime);
        } else if (response.state.isPlaying) {
          // Audio is playing - make sure UI reflects this
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

// Add debouncing for notification toggle
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
    const messageTimeout = 1000; // 1 second timeout
    
    if (newState && !validateInterval()) {
      // Invalid interval – show feedback and abort the toggle attempt gracefully.
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
      
      // Send message with robust timeout handling
      response = await Promise.race([
        new Promise((resolve, reject) => {
          browser.runtime.sendMessage({
            action: 'startDhikrNotifications',
            interval: interval,
            mode: mode
          }, (response) => {
            if (browser.runtime.lastError) {
              reject(new Error(browser.runtime.lastError.message));
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
      // Stopping notifications
      settingsPanel.classList.add('hidden');
      
      console.log('Sending stopDhikrNotifications message...');
      
      // Send message with robust timeout handling
      response = await Promise.race([
        new Promise((resolve, reject) => {
          browser.runtime.sendMessage({
            action: 'stopDhikrNotifications'
          }, (response) => {
            if (browser.runtime.lastError) {
              reject(new Error(browser.runtime.lastError.message));
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
    
    // Validate response
    if (!response) {
      throw new Error('No response received from background script');
    }
    
    if (typeof response !== 'object') {
      throw new Error(`Invalid response format: expected object, got ${typeof response}`);
    }
    
    if (!response.success) {
      throw new Error(response.error || 'Background script returned failure');
    }
    
    // Update UI only after successful response
    button.dataset.enabled = newState.toString();
    button.setAttribute('aria-pressed', newState ? 'true' : 'false');
    setIconLabel(button, 'bell-line', newState ? t('notificationsOn') : t('notificationsOff'));
    
    // // Show success message
    // if (newState) {
    //   showNotificationMessage('Dhikr notifications enabled! You should see a test notification shortly.', 'success');
    // } else {
    //   showNotificationMessage('Dhikr notifications disabled.', 'info');
    // }
    
    await saveDhikrSettings();
    
    // Small delay to prevent rapid re-clicking
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
    // Re-enable button and reset flag
    button.disabled = false;
    notificationToggleInProgress = false;
  }
}

function showNotificationMessage(message, type = 'info') {
  // Create or update message element
  let messageEl = document.getElementById('notification-message');
  if (!messageEl) {
    messageEl = document.createElement('div');
    messageEl.id = 'notification-message';
    messageEl.className = 'card__notification-message';
    
    // Insert after the toggle button
    const toggleButton = document.getElementById('toggle-notifications');
    toggleButton.parentNode.insertBefore(messageEl, toggleButton.nextSibling);
  }
  
  messageEl.textContent = message;
  messageEl.className = `card__notification-message card__notification-message--${type}`;
  messageEl.classList.remove('hidden');
  
  // Auto-hide after 8 seconds
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
      browser.runtime.sendMessage({
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

const LANG_STORAGE_KEY = 'uiLanguage';
let CURRENT_LANG = 'en';

const I18N = {
  en: {
    appTitle: "Qur'an & Sunnah Companion",
    quran: "Qur'an",
    hadith: "Hadith",
    dhikr: "Dhikr",
    selectSura: "Select Sura...",
    reciterPlaceholder: "Select or type a reciter...",
    play: "▶ Play",
    resume: "▶ Resume",
    pause: "⏸ Pause",
    autoplayOn: "🔄 Autoplay: ON",
    autoplayOff: "🔄 Autoplay: OFF",
    loading: "Loading...",
    nextDhikr: "🔄 Next Dhikr",
    notificationsOn: "🔔 Notifications: ON",
    notificationsOff: "🔔 Notifications: OFF",
    playing: "▶ Playing",
    reminderStyle: "Reminder Style:",
    modeNotification: "📣 Notification",
    modePopup: "🗔 Pop-up",
    reminderLabel: "Reminder Interval (seconds):",
    invalidInterval: "Please enter a value between 5 and 3600 seconds.",
    notificationError: "An error occurred. Please try again.",
    clearReciter: "✖ Clear"
  },
  ar: {
    appTitle: "رفيق القرآن والسنة",
    quran: "القرآن",
    hadith: "حديث",
    dhikr: "ذِكر",
    selectSura: "اختر السورة...",
    reciterPlaceholder: "اختر أو اكتب اسم القارئ...",
    play: "▶ تشغيل",
    resume: "▶ استئناف",
    pause: "⏸ إيقاف",
    autoplayOn: "🔄 التشغيل التلقائي: مفعل",
    autoplayOff: "🔄 التشغيل التلقائي: معطل",
    loading: "جارٍ التحميل...",
    nextDhikr: "🔄 الذكر التالي",
    notificationsOn: "🔔 الإشعارات: مفعلة",
    notificationsOff: "🔔 الإشعارات: معطلة",
    playing: "▶ قيد التشغيل",
    reminderStyle: "نوع التذكير:",
    modeNotification: "📣 إشعار",
    modePopup: "🗔 نافذة منبثقة",
    reminderLabel: "فاصل التذكير (ثوان):",
    invalidInterval: "يرجى إدخال قيمة بين 5 و 3600 ثانية.",
    notificationError: "حدث خطأ. يرجى المحاولة مرة أخرى.",
    clearReciter: "✖ مسح"
  },
  fr: {
    appTitle: "Compagnon Coran & Sunnah",
    quran: "Coran",
    hadith: "Hadith",
    dhikr: "Dhikr",
    selectSura: "Sélectionner une sourate...",
    reciterPlaceholder: "Sélectionner ou taper un récitateur...",
    play: "▶ Lire",
    resume: "▶ Reprendre",
    pause: "⏸ Pause",
    autoplayOn: "🔄 Lecture auto : ACTIVÉE",
    autoplayOff: "🔄 Lecture auto : DÉSACTIVÉE",
    loading: "Chargement...",
    nextDhikr: "🔄 Dhikr suivant",
    notificationsOn: "🔔 Notifications : ACTIVÉES",
    notificationsOff: "🔔 Notifications : DÉSACTIVÉES",
    playing: "▶ En cours",
    reminderStyle: "Style de rappel :",
    modeNotification: "📣 Notification système",
    modePopup: "🗔 Fenêtre contextuelle",
    reminderLabel: "Intervalle de rappel (secondes) :",
    invalidInterval: "Veuillez entrer une valeur entre 5 et 3600 secondes.",
    notificationError: "Une erreur s'est produite. Veuillez réessayer.",
    clearReciter: "✖ Effacer"
  }
};

function t(key) {
  return (I18N[CURRENT_LANG] && I18N[CURRENT_LANG][key]) || key;
}

async function initLanguage() {
  // Load saved preference or fall back to browser UI language
  const { [LANG_STORAGE_KEY]: savedLang } = await browser.storage.local.get(LANG_STORAGE_KEY);
  if (savedLang && I18N[savedLang]) {
    CURRENT_LANG = savedLang;
  } else {
    const browserLang = (browser.i18n?.getUILanguage?.() || navigator.language || 'en').split('-')[0];
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
        await browser.storage.local.set({ [LANG_STORAGE_KEY]: newLang });
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
  if (reminderLabel) reminderLabel.childNodes[0].nodeValue = `${t('reminderLabel')}\n            `; // preserve spacing

  // Reminder style label & options
  const reminderStyleLabel = document.getElementById('reminder-style-label');
  if (reminderStyleLabel) reminderStyleLabel.childNodes[0].nodeValue = `${t('reminderStyle')}\n            `;

  const modeSelect = document.getElementById('reminder-mode');
  if (modeSelect && modeSelect.options.length >= 2) {
    modeSelect.options[0].textContent = t('modeNotification');
    modeSelect.options[1].textContent = t('modePopup');
  }

  // Buttons that exist at load
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

  // Loading text
  const loadingEl = document.getElementById('quran-loading');
  if (loadingEl) loadingEl.textContent = t('loading');

  // Update select default option if still default
  const suraSelect = document.getElementById('sura-select');
  if (suraSelect && suraSelect.options.length > 0 && suraSelect.options[0].value === '') {
    suraSelect.options[0].textContent = t('selectSura');
  }

  // Update clear reciter button
  const clearReciterBtn = document.getElementById('clear-reciter');
  if (clearReciterBtn) setIconLabel(clearReciterBtn, 'clear-cross', t('clearReciter'));

  // Update current time and total time
  const currentTimeEl = document.getElementById('current-time');
  if (currentTimeEl) currentTimeEl.textContent = t('currentTime');
  const totalTimeEl = document.getElementById('total-time');
  if (totalTimeEl) totalTimeEl.textContent = t('totalTime');
  // Update hadith text
  const hadithTextEl = document.getElementById('hadith-text');
  if (hadithTextEl) hadithTextEl.textContent = t('hadithText');
  // Update dhikr text
  const dhikrTextEl = document.getElementById('dhikr-text');
  if (dhikrTextEl) dhikrTextEl.textContent = t('dhikrText');
  // Update interval validation
  const intervalValidationEl = document.getElementById('interval-validation');
  if (intervalValidationEl) intervalValidationEl.textContent = t('intervalValidation');
  // Update notification message
  const notificationMessageEl = document.getElementById('notification-message');
  if (notificationMessageEl) notificationMessageEl.textContent = t('notificationMessage');

  // Reset Hadith area while we fetch a new one in the selected language
  const hadithEl = document.getElementById('hadith-text');
  if (hadithEl) hadithEl.textContent = t('loading');

  // Refresh dynamic texts that depend on language
  displayCurrentDhikr();
  // Reload hadith and sura names when language changes
  loadHadith();
  fetchSuras().then(suras => {
    const suraSelect = document.getElementById('sura-select');
    const currentVal = suraSelect.value;
    populateSelect(
      suraSelect,
      suras,
      t('selectSura'),
      s => ({ value: s.id, text: `${s.id}. ${getSuraName(s)}` })
    );
    // restore previous selection if still valid
    if (currentVal) {
      suraSelect.value = currentVal;
    }
  }).catch(err => console.error('Failed to refresh suras for lang', CURRENT_LANG, err));
}
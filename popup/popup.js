/**
 * Popup script for Qur'an & Sunnah Companion
 * Handles UI, API calls, and communication with the background script.
 * This version uses the Al-Quran.cloud API for audio.
 */

// --- STATE AND CACHE ---

// Global progress tracking interval
let progressTrackingInterval = null;
// Cache for { reciterId: Set<suraId> }
const reciterAvailabilityCache = new Map();
// Cache for { 'reciterId-suraId': 'url' }
const audioUrlCache = new Map();

// --- LIFECYCLE ---

document.addEventListener('DOMContentLoaded', async () => {
  await setupQuranSelectors();
  await Promise.all([loadHadith(), loadDhikr(), loadSavedAudioState()]);
  setupEventHandlers();
});

// --- UI SETUP & EVENT HANDLERS ---

function setupEventHandlers() {
  const playButton = document.getElementById('play-quran');
  const pauseButton = document.getElementById('pause-quran');
  const suraSelect = document.getElementById('sura-select');
  const reciterSelect = document.getElementById('reciter-select');

  playButton.addEventListener('click', handlePlayPauseResume);
  pauseButton.addEventListener('click', handlePlayPauseResume);
  
  suraSelect.addEventListener('change', validateQuranSelection);
  reciterSelect.addEventListener('change', validateQuranSelection);

  document.getElementById('progress-bar').addEventListener('change', (e) => {
    seekAudio(e.target.value);
  });
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

async function loadSavedAudioState() {
  try {
    const { audioState } = await chrome.storage.local.get('audioState');
    if (audioState?.suraId && audioState?.reciterKey) {
      document.getElementById('sura-select').value = audioState.suraId;
      document.getElementById('reciter-select').value = audioState.reciterKey;
      
      validateQuranSelection();

      const stateResponse = await chrome.runtime.sendMessage({ action: 'getAudioState' });
      if (stateResponse?.success && stateResponse.state?.audioUrl) {
        updateProgressUI(stateResponse.state);
        updatePlayButtonUI(stateResponse.state.isPlaying, true);
        if (stateResponse.state.isPlaying) {
          startProgressTracking();
        }
      }
    }
  } catch (error) {
    console.error('Failed to load saved audio state:', error);
  }
}

async function loadHadith() {
  const hadithEl = document.getElementById('hadith-text');
  try {
    const response = await fetch('https://api.hadith.gading.dev/books/bukhari?range=1-300');
    if (!response.ok) throw new Error('Network response was not ok.');
    const data = await response.json();
    const randomHadith = data.data.hadiths[Math.floor(Math.random() * data.data.hadiths.length)];
    hadithEl.textContent = randomHadith?.arab || 'Error loading Hadith.';
  } catch (error) {
    console.error('Failed to load Hadith:', error);
    hadithEl.textContent = 'لَا إِلَٰهَ إِلَّا اللَّهُ - There is no god but Allah';
  }
}

async function loadDhikr() {
  const dhikrCollection = [
    { arabic: 'سُبْحَانَ اللَّهِ', english: 'Glory be to Allah' },
    { arabic: 'الْحَمْدُ لِلَّهِ', english: 'Praise be to Allah' },
    { arabic: 'اللَّهُ أَكْبَرُ', english: 'Allah is the Greatest' },
  ];
  const randomDhikr = dhikrCollection[Math.floor(Math.random() * dhikrCollection.length)];
  document.getElementById('dhikr-text').textContent = `${randomDhikr.arabic} - ${randomDhikr.english}`;
}

async function setupQuranSelectors() {
  const suraSelect = document.getElementById('sura-select');
  const reciterSelect = document.getElementById('reciter-select');

  try {
    const [suras, reciters] = await Promise.all([fetchSuras(), fetchReciters()]);
    populateSelect(suraSelect, suras, 'Select Sura...', s => ({ value: s.number, text: `${s.number}. ${s.englishName}` }));
    populateSelect(reciterSelect, reciters, 'Select Reciter...', r => ({ value: r.identifier, text: r.name }));
  } catch (error) {
    console.error("Failed to setup Qur'an selectors:", error);
    suraSelect.innerHTML = '<option value="">Error loading Suras</option>';
    reciterSelect.innerHTML = '<option value="">Error loading Reciters</option>';
  }
}

function populateSelect(selectEl, items, defaultOptionText, mapper) {
  selectEl.innerHTML = `<option value="">${defaultOptionText}</option>`;
  items.forEach(item => {
    const { value, text } = mapper(item);
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    selectEl.appendChild(option);
  });
}

async function fetchSuras() {
  const response = await fetch('https://api.alquran.cloud/v1/surah');
  if (!response.ok) throw new Error('Failed to fetch suras from alquran.cloud');
  const data = await response.json();
  console.log(`Successfully fetched ${data.data.length} surahs.`);
  return data.data;
}

async function fetchReciters() {
  const preferredReciterNames = [
    "Mishary Rashid al-`Afasy", "Maher Al Muaiqly", "Mahmud Khalil Al-Husary",
    "Mohamed Siddiq al-Minshawi", "Bandar Baleela", "Badr Al Turki", 
    "Yasser Ad-Dussary", "Ali Abdur-Rahman al-Huthaify", "Mohammad Ayyub", 
    "Mohamed Rifaat", "Abdel Basset Abdel Samad", "Abdur-Rahman as-Sudais"
  ].map(name => name.toLowerCase());

  const response = await fetch('https://api.alquran.cloud/v1/edition?format=audio&language=ar');
  if (!response.ok) throw new Error('Failed to fetch reciters from alquran.cloud');
  const data = await response.json();

  const reciters = data.data.filter(reciter => 
    preferredReciterNames.some(preferred => reciter.name.toLowerCase().includes(preferred) || preferred.includes(reciter.name.toLowerCase()))
  );
  console.log(`Found ${reciters.length} matching preferred reciters.`);
  return reciters;
}

// --- AUDIO LOGIC ---

async function fetchAndCacheAvailableSurahsForReciter(reciterId) {
  if (reciterAvailabilityCache.has(reciterId)) {
    console.log(`Using cached availability for reciter ${reciterId}.`);
    return; // Already fetched and cached
  }

  const response = await fetch(`https://api.quran.com/api/v4/recitations/${reciterId}/audio_files`);
  if (!response.ok) {
    reciterAvailabilityCache.set(reciterId, new Set()); // Cache failure as empty set
    throw new Error(`API check failed with status ${response.status}.`);
  }

  const data = await response.json();
  const availableSuraIds = new Set();
  
  data.audio_files.forEach(file => {
    availableSuraIds.add(file.chapter_id);
    const audioUrl = `https://${file.audio_url.startsWith('//') ? file.audio_url.substring(2) : file.audio_url}`;
    audioUrlCache.set(`${reciterId}-${file.chapter_id}`, audioUrl);
  });
  
  reciterAvailabilityCache.set(reciterId, availableSuraIds);
  console.log(`Cached ${availableSuraIds.size} available surahs for reciter ${reciterId}.`);
}

function validateQuranSelection() {
  const suraId = parseInt(document.getElementById('sura-select').value, 10);
  const reciterId = document.getElementById('reciter-select').value;
  const availabilityStatus = document.getElementById('quran-availability');
  
  updatePlayButtonUI(false, false); // Always disable button first

  if (!suraId || !reciterId) {
    availabilityStatus.textContent = '';
    return;
  }

  const availableSurahs = reciterAvailabilityCache.get(reciterId);
  
  // If we haven't loaded this reciter's data yet, the status will be set by handleReciterChange
  if (!availableSurahs) {
    return;
  }
  
  if (availableSurahs.has(suraId)) {
    availabilityStatus.textContent = '✅ Available';
    updatePlayButtonUI(false, true);
  } else {
    availabilityStatus.textContent = '❌ Not available for this reciter.';
  }
}

async function playQuranAudio() {
  setUILoading(true);
  const suraId = document.getElementById('sura-select').value;
  const reciterId = document.getElementById('reciter-select').value; // e.g., "ar.alafasy"
  
  try {
    const audioUrl = `https://cdn.islamic.network/quran/audio-surah/${reciterId}/${suraId}.mp3`;
    console.log('Constructed audio URL:', audioUrl);
    
    const response = await chrome.runtime.sendMessage({
      action: 'playAudio',
      audioUrl: audioUrl,
      suraId,
      reciterKey: reciterId,
    });

    if (!response?.success) {
      throw new Error(response?.error || 'Background script failed to play audio.');
    }
    
    updatePlayButtonUI(true, true);
    startProgressTracking();
  } catch (error) {
    console.error('Audio playback failed:', error);
    alert(`Unable to play audio. The file may not be available on the CDN for this combination.`);
    updatePlayButtonUI(false, true);
  } finally {
    setUILoading(false);
  }
}

async function pauseQuranAudio() {
  await chrome.runtime.sendMessage({ action: 'pauseAudio' });
  updatePlayButtonUI(false, true);
  if (progressTrackingInterval) {
    clearInterval(progressTrackingInterval);
    progressTrackingInterval = null;
  }
}

async function resumeQuranAudio() {
  await chrome.runtime.sendMessage({ action: 'resumeAudio' });
  updatePlayButtonUI(true, true);
  startProgressTracking();
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

// --- UI HELPERS ---

function setUILoading(isLoading) {
  document.getElementById('quran-loading').classList.toggle('hidden', !isLoading);
  const buttons = document.querySelectorAll('.card__button');
  buttons.forEach(button => button.disabled = isLoading);
}

function updatePlayButtonUI(isPlaying, isEnabled) {
  const playButton = document.getElementById('play-quran');
  const pauseButton = document.getElementById('pause-quran');

  playButton.disabled = !isEnabled;
  pauseButton.disabled = !isEnabled;
  
  const hasProgress = document.getElementById('progress-bar').value > 0;
  
  if (isPlaying) {
    playButton.classList.add('hidden');
    pauseButton.classList.remove('hidden');
  } else {
    playButton.textContent = hasProgress ? '▶ Resume' : '▶ Play';
    playButton.dataset.action = hasProgress ? 'resume' : 'play';
    playButton.classList.remove('hidden');
    pauseButton.classList.add('hidden');
  }
}

function updateProgressUI({ currentTime, duration }) {
  if (duration > 0) {
    document.getElementById('progress-container').classList.remove('hidden');
    document.getElementById('progress-bar').value = (currentTime / duration) * 100;
    document.getElementById('current-time').textContent = formatTime(currentTime);
    document.getElementById('total-time').textContent = formatTime(duration);
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
          updatePlayButtonUI(false, true);
          document.getElementById('play-quran').textContent = '▶ Play';
          document.getElementById('play-quran').dataset.action = 'play';
          document.getElementById('progress-bar').value = 0;
          document.getElementById('current-time').textContent = formatTime(0);
          clearInterval(progressTrackingInterval);
          progressTrackingInterval = null;
        } else if (!response.state.isPlaying) {
          updatePlayButtonUI(false, true);
          clearInterval(progressTrackingInterval);
          progressTrackingInterval = null;
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
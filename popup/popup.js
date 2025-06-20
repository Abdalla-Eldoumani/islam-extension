/**
 * Popup script for Qur'an & Sunnah Companion
 * Handles UI, API calls, and communication with the background script.
 */

// --- STATE AND CACHE ---

// Global progress tracking interval
let progressTrackingInterval = null;
// Cache for reciter audio availability { 'reciterId-suraId': 'url' | null }
const audioUrlCache = new Map();

// --- LIFECYCLE ---

document.addEventListener('DOMContentLoaded', async () => {
  await setupQuranSelectors();
  await Promise.all([loadHadith(), loadDhikr(), loadSavedAudioState()]);
  setupEventHandlers();
});

// --- UI SETUP & EVENT HANDLERS ---

function setupEventHandlers() {
  document.getElementById('play-quran').addEventListener('click', handlePlayPauseResume);
  document.getElementById('pause-quran').addEventListener('click', handlePlayPauseResume);
  
  document.getElementById('sura-select').addEventListener('change', validateQuranSelection);
  document.getElementById('reciter-select').addEventListener('change', validateQuranSelection);

  document.getElementById('progress-bar').addEventListener('change', (e) => {
    seekAudio(e.target.value);
  });
}

async function handlePlayPauseResume(event) {
  const action = event.target.dataset.action;
  switch(action) {
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

      // Validate the restored selection to update UI availability status
      await validateQuranSelection();
      
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
    const response = await fetch('https://api.hadith.gading.dev/books/bukhari?range=1-10');
    if (!response.ok) throw new Error('Network response was not ok.');
    const data = await response.json();
    const randomHadith = data.data.hadiths[Math.floor(Math.random() * data.data.hadiths.length)];
    hadithEl.textContent = randomHadith?.arab || randomHadith?.id || 'SubhanAllah - Glory be to Allah';
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
    { arabic: 'لَا إِلَٰهَ إِلَّا اللَّهُ', english: 'There is no god but Allah' },
    { arabic: 'أَسْتَغْفِرُ اللَّهَ', english: 'I seek forgiveness from Allah' },
  ];
  const randomDhikr = dhikrCollection[Math.floor(Math.random() * dhikrCollection.length)];
  document.getElementById('dhikr-text').textContent = `${randomDhikr.arabic} - ${randomDhikr.english}`;
}

async function setupQuranSelectors() {
  const suraSelect = document.getElementById('sura-select');
  const reciterSelect = document.getElementById('reciter-select');

  try {
    const [suras, reciters] = await Promise.all([fetchSuras(), fetchReciters()]);
    
    populateSelect(suraSelect, suras, 'Select Sura...', s => ({ value: s.id, text: `${s.id}. ${s.name}` }));
    populateSelect(reciterSelect, reciters, 'Select Reciter...', r => ({ value: r.id, text: r.reciter_name }));

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
  const response = await fetch('https://api.quran.com/api/v4/chapters?language=en');
  if (!response.ok) throw new Error('Failed to fetch suras');
  const data = await response.json();
  console.log(`Successfully fetched ${data.chapters.length} surahs.`);
  return data.chapters.map(sura => ({ id: sura.id, name: sura.name_simple }));
}

async function fetchReciters() {
  const preferredReciterNames = [
    "Mishari Rashid al-`Afasy", "Maher Al Muaiqly", "Mahmud Khalil Al-Husary",
    "Mohamed Siddiq al-Minshawi", "Bandar Baleela", "Badr Al Turki", 
    "Yasser Ad-Dussary", "Ali Abdur-Rahman al-Huthaify", "Mohammad Ayyub", 
    "Mohamed Rifaat", "Abdel Basset Abdel Samad", "Abdur-Rahman as-Sudais"
  ];
  
  const response = await fetch('https://api.quran.com/api/v4/resources/recitations?language=en');
  if (!response.ok) throw new Error('Failed to fetch reciters');
  const data = await response.json();
  
  const reciters = data.recitations.filter(reciter => 
    preferredReciterNames.some(name => reciter.reciter_name.includes(name))
  );
  console.log(`Found ${reciters.length} matching preferred reciters.`);
  return reciters;
}

// --- AUDIO LOGIC ---

async function validateQuranSelection() {
  const suraId = document.getElementById('sura-select').value;
  const reciterId = document.getElementById('reciter-select').value;
  const availabilityStatus = document.getElementById('quran-availability');
  
  updatePlayButtonUI(false, false); // Disable button initially
  if (!suraId || !reciterId) {
    availabilityStatus.textContent = '';
    return;
  }

  availabilityStatus.textContent = 'Checking availability...';
  try {
    await getAndCacheAudioUrl(suraId, reciterId);
    availabilityStatus.textContent = '✅ Available';
    updatePlayButtonUI(false, true); // Enable play
  } catch (error) {
    console.warn(error.message);
    availabilityStatus.textContent = '❌ Not available for this reciter.';
    updatePlayButtonUI(false, false); // Keep disabled
  }
}

async function getAndCacheAudioUrl(suraId, reciterId) {
  const cacheKey = `${reciterId}-${suraId}`;
  if (audioUrlCache.has(cacheKey)) {
    const url = audioUrlCache.get(cacheKey);
    if (url) return url;
    throw new Error('Combination previously determined to be unavailable.');
  }

  const response = await fetch(`https://api.quran.com/api/v4/recitations/${reciterId}/audio_files?chapter_number=${suraId}`);
  if (!response.ok) {
    audioUrlCache.set(cacheKey, null);
    throw new Error(`API check failed with status ${response.status}.`);
  }

  const data = await response.json();
  const audioUrl = data.audio_files[0]?.audio_url;

  if (!audioUrl) {
    audioUrlCache.set(cacheKey, null);
    throw new Error('No audio file found in API response.');
  }

  const correctedUrl = `https://${audioUrl.startsWith('//') ? audioUrl.substring(2) : audioUrl}`;
  audioUrlCache.set(cacheKey, correctedUrl);
  return correctedUrl;
}

async function playQuranAudio() {
  setUILoading(true);
  const suraId = document.getElementById('sura-select').value;
  const reciterId = document.getElementById('reciter-select').value;
  
  try {
    const audioUrl = await getAndCacheAudioUrl(suraId, reciterId);
    const response = await chrome.runtime.sendMessage({
      action: 'playAudio',
      audioUrl: audioUrl,
      suraId,
      reciterKey: reciterId
    });

    if (!response?.success) {
      throw new Error(response?.error || 'Background script failed to play audio.');
    }
    
    updatePlayButtonUI(true, true);
    startProgressTracking();
  } catch (error) {
    console.error('Audio playback failed:', error);
    alert(`Unable to play audio: ${error.message}`);
    updatePlayButtonUI(false, true); // Re-enable play button on failure
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
  document.getElementById('play-quran').disabled = isLoading;
  document.getElementById('pause-quran').disabled = isLoading;
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
        
        // If audio finished playing, update button state
        if (!response.state.isPlaying && response.state.currentTime >= response.state.duration) {
          updatePlayButtonUI(false, true);
          document.getElementById('play-quran').textContent = '▶ Play';
          document.getElementById('play-quran').dataset.action = 'play';
          clearInterval(progressTrackingInterval);
          progressTrackingInterval = null;
        } else if (!response.state.isPlaying) {
          // It's paused
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
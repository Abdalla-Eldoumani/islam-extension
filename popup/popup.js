/**
 * Popup script for Qur'an & Sunnah Companion
 * Handles UI, API calls, and communication with the background script.
 * This version uses the Quran.com v4 API for Surah names and quranicaudio.com for audio.
 */

// --- STATE AND CACHE ---

// Global progress tracking interval
let progressTrackingInterval = null;
// Cache for { reciterIdentifier: { server, availableSurahs: Set } }
const recitationDetailsCache = new Map();

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

async function handleReciterChange() {
  const reciterId = document.getElementById('reciter-select').value;
  const availabilityStatus = document.getElementById('quran-availability');
  updatePlayButtonUI(false, false);

  if (!reciterId) {
    availabilityStatus.textContent = '';
    return;
  }
  
  availabilityStatus.textContent = 'Loading reciter data...';
  try {
    await fetchAndCacheAvailableSurahs(reciterId);
  } catch (error) {
    console.error(`Failed to fetch data for reciter ${reciterId}:`, error);
    availabilityStatus.textContent = '❌ Could not load reciter data.';
  }
  validateQuranSelection();
}

// --- DATA FETCHING & INITIALIZATION ---

async function loadSavedAudioState() {
  try {
    const { audioState } = await chrome.storage.local.get('audioState');
    if (audioState?.suraId && audioState?.reciterKey) {
      document.getElementById('sura-select').value = audioState.suraId;

      // The reciter select is populated asynchronously. We need to wait for it.
      const waitForReciters = new Promise(resolve => {
        const reciterSelect = document.getElementById('reciter-select');
        if (reciterSelect.options.length > 1) { // Already populated
          resolve();
          return;
        }
        const observer = new MutationObserver(() => {
          if (reciterSelect.options.length > 1) {
            observer.disconnect();
            resolve();
          }
        });
        observer.observe(reciterSelect, { childList: true });
        setTimeout(() => { observer.disconnect(); resolve(); }, 3000); // Failsafe timeout
      });

      await waitForReciters;
      
      // Check if the saved reciter is still in the list
      if (Array.from(document.getElementById('reciter-select').options).some(opt => opt.value === audioState.reciterKey)) {
        document.getElementById('reciter-select').value = audioState.reciterKey;
      }
      
      validateQuranSelection();

      const stateResponse = await chrome.runtime.sendMessage({ action: 'getAudioState' });
      if (stateResponse?.success && stateResponse.state?.audioUrl && stateResponse.state.reciterKey === audioState.reciterKey && stateResponse.state.suraId === audioState.suraId) {
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
    populateSelect(suraSelect, suras, 'Select Sura...', s => ({ value: s.id, text: `${s.id}. ${s.name_simple}` }));
    populateSelect(reciterSelect, reciters, 'Select Reciter...', r => ({ value: r.id, text: r.name }));
  } catch (error) {
    console.error("Failed to setup Qur'an selectors:", error);
    suraSelect.innerHTML = '<option value="">Error</option>';
    reciterSelect.innerHTML = '<option value="">Error</option>';
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
  const { chapters } = await response.json();
  console.log(`Successfully fetched ${chapters.length} surahs.`);
  return chapters;
}

async function fetchReciters() {
    // From project overview: Mishary, Abdul Basit, Minshawi, Al-Hussary, Bandar Balila, 
    // Badr Turki, Maher al-Muaiqly, Muhammad Refat, Ali Jabir, Mohamed Ayoub
    const preferredReciterSubstrings = [
        "Mishary", "Basit", "Minshawi", "Husary", "Bandar Balila", 
        "Badr Al-Turki", "Maher Al Muaiqly", "Rifat", "Ali Jaber", "Ayyub"
    ];

    const response = await fetch('https://quranicaudio.com/api/reciters');
    if (!response.ok) throw new Error('Failed to fetch reciters from quranicaudio.com');
    const data = await response.json();
    
    const processedRecitations = [];

    const reciters = data.reciters.filter(r => preferredReciterSubstrings.some(name => r.name.includes(name)));

    reciters.forEach(reciter => {
        reciter.moshaf.forEach(moshaf => {
            // We only want full surah recitations, which usually have 114 surahs
            if (moshaf.surah_total >= 114) { 
                const identifier = `${reciter.id}-${moshaf.id}`;
                const displayName = `${reciter.name} (${moshaf.name})`;

                processedRecitations.push({
                    id: identifier,
                    name: displayName
                });

                const availableSurahs = new Set(moshaf.surah_list.split(',').map(s => parseInt(s, 10)));
                recitationDetailsCache.set(identifier, {
                    server: moshaf.server,
                    availableSurahs
                });
            }
        });
    });
    
    console.log(`Found ${processedRecitations.length} full recitations from preferred reciters.`);
    return processedRecitations.sort((a,b) => a.name.localeCompare(b.name));
}

// --- AUDIO LOGIC ---

function validateQuranSelection() {
  const suraId = parseInt(document.getElementById('sura-select').value, 10);
  const reciterIdentifier = document.getElementById('reciter-select').value;
  const playButton = document.getElementById('play-quran');
  const availabilityStatus = document.getElementById('quran-availability');
  
  if (!suraId || !reciterIdentifier) {
    playButton.disabled = true;
    availabilityStatus.textContent = '';
    return;
  }
  
  const reciterData = recitationDetailsCache.get(reciterIdentifier);
  
  if (reciterData && reciterData.availableSurahs.has(suraId)) {
    availabilityStatus.innerHTML = '&#x2705; Available'; // Checkmark emoji
    availabilityStatus.style.color = 'green';
    updatePlayButtonUI(false, true); // isPlaying=false, isEnabled=true
  } else if (reciterData) {
    availabilityStatus.innerHTML = '&#x274C; Not available'; // Cross emoji
    availabilityStatus.style.color = 'red';
    updatePlayButtonUI(false, false); // isPlaying=false, isEnabled=false
  } else {
    availabilityStatus.textContent = '';
    updatePlayButtonUI(false, false);
  }
}

async function playQuranAudio() {
  setUILoading(true);
  const suraId = document.getElementById('sura-select').value;
  const reciterIdentifier = document.getElementById('reciter-select').value;
  
  try {
    const reciterData = recitationDetailsCache.get(reciterIdentifier);
    if (!reciterData) throw new Error('Reciter data not found in cache.');

    const paddedSuraId = suraId.toString().padStart(3, '0');
    const audioUrl = `${reciterData.server}/${paddedSuraId}.mp3`;
    console.log('Constructed audio URL:', audioUrl);
    
    const response = await chrome.runtime.sendMessage({
      action: 'playAudio',
      audioUrl: audioUrl,
      suraId,
      reciterKey: reciterIdentifier,
    });

    if (!response?.success) {
      throw new Error(response?.error || 'Background script failed to play audio.');
    }
    
    updatePlayButtonUI(true, true);
    startProgressTracking();
  } catch (error) {
    console.error('Audio playback failed:', error);
    alert(`Unable to play audio: ${error.message}`);
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
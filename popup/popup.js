/**
 * Popup script for Qur'an & Sunnah Companion
 * Handles UI, API calls, and communication with the background script.
 * This version uses the Quran.com v4 API for Surah names, reciters, and audio.
 */

// --- STATE AND CACHE ---

// Global progress tracking interval
let progressTrackingInterval = null;

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
    populateSelect(reciterSelect, reciters, 'Select Reciter...', r => ({ value: r.id, text: `${r.reciter_name} (${r.style})`}));
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
    const response = await fetch('https://api.quran.com/api/v4/resources/recitations?language=en');
    if (!response.ok) throw new Error('Failed to fetch reciters from api.quran.com');
    const { recitations } = await response.json();
    
    // Use substrings for more robust matching against the preferred list
    const preferredReciterSubstrings = [
      "Alafasy", "AbdulBaset", "Al-Husary", "Minshawi", "Muaiqly", 
      "Ali Jaber", "Ayyub", "Bandar Baleela", "Badr Al-Turki", "Jibreel", "al-Afasy"
    ];
    
    const filteredRecitations = recitations.filter(r => 
        r.style && preferredReciterSubstrings.some(name => r.reciter_name.includes(name))
    );

    console.log(`Found ${filteredRecitations.length} recitations from preferred reciters.`);
    return filteredRecitations.sort((a,b) => a.reciter_name.localeCompare(b.reciter_name));
}

// --- AUDIO LOGIC ---

function validateQuranSelection() {
  const suraId = document.getElementById('sura-select').value;
  const reciterId = document.getElementById('reciter-select').value;
  const playButton = document.getElementById('play-quran');
  const availabilityStatus = document.getElementById('quran-availability');
  
  const isEnabled = !!suraId && !!reciterId;
  playButton.disabled = !isEnabled;
  
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
  const reciterId = document.getElementById('reciter-select').value;
  const availabilityStatus = document.getElementById('quran-availability');
  
  try {
    // First, test if background script is responsive
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
    
    // availabilityStatus.innerHTML = '&#x2705; Playing...';
    // availabilityStatus.style.color = 'green';
    updatePlayButtonUI(true, true);
    startProgressTracking();
  } catch (error) {
    console.error('Audio playback failed:', error);
    availabilityStatus.innerHTML = '&#x274C; Audio not found for this selection.';
    availabilityStatus.style.color = 'red';
    updatePlayButtonUI(false, true);
  } finally {
    setUILoading(false);
  }
}

async function getSuraAudioUrl(reciterId, suraId) {
    // Try to get full chapter audio first
    const chapterUrl = `https://api.quran.com/api/v4/chapter_recitations/${reciterId}/${suraId}`;
    console.log('Fetching chapter audio from:', chapterUrl);
    
    try {
        const chapterResponse = await fetch(chapterUrl);
        if (chapterResponse.ok) {
            const chapterData = await chapterResponse.json();
            console.log('Chapter API response:', chapterData);
            
            if (chapterData.audio_file?.audio_url) {
                const audioUrl = chapterData.audio_file.audio_url;
                return audioUrl.startsWith('http') ? audioUrl : `https://verses.quran.com/${audioUrl}`;
            }
        }
    } catch (error) {
        console.log('Chapter audio not available, trying verse-by-verse approach:', error.message);
    }
    
    // Fallback to verse-by-verse audio
    const versesUrl = `https://api.quran.com/api/v4/recitations/${reciterId}/by_chapter/${suraId}`;
    console.log('Fetching verse audio from:', versesUrl);
    
    const response = await fetch(versesUrl);
    if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('Verses API response data:', data);
    
    if (!data.audio_files || data.audio_files.length === 0) {
        throw new Error('No audio files found in API response.');
    }
    
    // Get the first verse audio file
    const firstAudio = data.audio_files[0];
    console.log('First audio file object:', firstAudio);
    
    let audioUrl = firstAudio.url || firstAudio.audio_url;
    
    if (!audioUrl) {
        console.error('No audio URL found in response:', data);
        throw new Error('Audio URL not found in API response.');
    }
    
    // Handle different URL formats
    if (audioUrl.startsWith('//')) {
        // Protocol-relative URL
        return `https:${audioUrl}`;
    } else if (audioUrl.startsWith('http')) {
        // Absolute URL
        return audioUrl;
    } else {
        // Relative URL - need to determine the correct base
        if (audioUrl.includes('quranicaudio.com') || audioUrl.includes('everyayah')) {
            return `https://verses.quran.com/${audioUrl}`;
        } else {
            // Try different base URLs based on the reciter pattern
            return `https://verses.quran.com/${audioUrl}`;
        }
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

 
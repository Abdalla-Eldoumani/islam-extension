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
  const autoplayButton = document.getElementById('autoplay-toggle');
  const suraSelect = document.getElementById('sura-select');
  const reciterSelect = document.getElementById('reciter-select');

  playButton.addEventListener('click', handlePlayPauseResume);
  pauseButton.addEventListener('click', handlePlayPauseResume);
  autoplayButton.addEventListener('click', toggleAutoplay);
  
  suraSelect.addEventListener('change', () => {
    validateQuranSelection();
    saveUserSelections();
  });
  reciterSelect.addEventListener('change', () => {
    validateQuranSelection();
    saveUserSelections();
  });

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

async function saveUserSelections() {
  try {
    const suraId = document.getElementById('sura-select').value;
    const reciterKey = document.getElementById('reciter-select').value;
    const autoplayEnabled = document.getElementById('autoplay-toggle').dataset.autoplay === 'true';
    
    const userSelections = {
      suraId: suraId || null,
      reciterKey: reciterKey || null,
      autoplayEnabled: autoplayEnabled,
      timestamp: Date.now()
    };
    
    await chrome.storage.local.set({ userSelections });
    console.log('Saved user selections:', userSelections);
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
      console.log('Restoring user selections:', userSelections);
      
      if (userSelections.suraId) {
        document.getElementById('sura-select').value = userSelections.suraId;
      }

      // Wait for reciters to load before setting reciter selection
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
      
      if (userSelections.reciterKey && Array.from(document.getElementById('reciter-select').options).some(opt => opt.value === userSelections.reciterKey)) {
        document.getElementById('reciter-select').value = userSelections.reciterKey;
      }
      
      // Restore autoplay setting
      if (typeof userSelections.autoplayEnabled === 'boolean') {
        updateAutoplayButton(userSelections.autoplayEnabled);
      }
      
      validateQuranSelection();
    }

    // Then, restore audio state - check if there's any active audio session
    const stateResponse = await chrome.runtime.sendMessage({ action: 'getAudioState' });
    if (stateResponse?.success && stateResponse.state?.audioUrl) {
      const currentSuraId = document.getElementById('sura-select').value;
      const currentReciterKey = document.getElementById('reciter-select').value;
      
      console.log('Checking audio state:', { 
        audioState: stateResponse.state, 
        currentSuraId, 
        currentReciterKey,
        stateSuraId: stateResponse.state.suraId,
        stateReciterKey: stateResponse.state.reciterKey
      });
      
      // If the audio state matches current selections, restore the playback UI
      if (stateResponse.state.reciterKey === currentReciterKey && 
          stateResponse.state.suraId === currentSuraId) {
        
        console.log('Restoring audio playback state:', stateResponse.state);
        updateProgressUI(stateResponse.state);
        updatePlayButtonUI(stateResponse.state.isPlaying, true, stateResponse.state.currentTime);
        
        if (stateResponse.state.isPlaying) {
          startProgressTracking();
        }
      } else if (stateResponse.state.reciterKey && stateResponse.state.suraId) {
        // If there's an active audio session but it doesn't match current selections,
        // update the selections to match the active session
        console.log('Updating selections to match active audio session');
        
        if (Array.from(document.getElementById('sura-select').options).some(opt => opt.value === stateResponse.state.suraId)) {
          document.getElementById('sura-select').value = stateResponse.state.suraId;
        }
        
        if (Array.from(document.getElementById('reciter-select').options).some(opt => opt.value === stateResponse.state.reciterKey)) {
          document.getElementById('reciter-select').value = stateResponse.state.reciterKey;
        }
        
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
    updatePlayButtonUI(true, true, 0);
    startProgressTracking();
  } catch (error) {
    console.error('Audio playback failed:', error);
    // availabilityStatus.innerHTML = '&#x274C; Audio not found for this selection.';
    // availabilityStatus.style.color = 'red';
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
  autoplayButton.textContent = isEnabled ? '🔄 Autoplay: ON' : '🔄 Autoplay: OFF';
}

function getNextSuraId(currentSuraId) {
  const currentId = parseInt(currentSuraId);
  // Surahs are numbered 1-114, so wrap around to 1 after 114
  return currentId >= 114 ? '1' : (currentId + 1).toString();
}

async function playNextSura() {
  const currentSuraId = document.getElementById('sura-select').value;
  const reciterKey = document.getElementById('reciter-select').value;
  
  if (!currentSuraId || !reciterKey) {
    console.log('Cannot play next sura: missing current selection');
    return;
  }
  
  const nextSuraId = getNextSuraId(currentSuraId);
  console.log(`Autoplay: Moving from Sura ${currentSuraId} to Sura ${nextSuraId}`);
  
  // Update the selection
  document.getElementById('sura-select').value = nextSuraId;
  await saveUserSelections();
  
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

  playButton.disabled = !isEnabled;
  pauseButton.disabled = !isEnabled;
  
  const hasProgress = currentTime > 0 || document.getElementById('progress-bar').value > 0;
  
  if (isPlaying) {
    playButton.classList.add('hidden');
    pauseButton.classList.remove('hidden');
    pauseButton.textContent = '⏸ Pause';
  } else {
    playButton.textContent = hasProgress ? '▶ Resume' : '▶ Play';
    playButton.dataset.action = hasProgress ? 'resume' : 'play';
    playButton.classList.remove('hidden');
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
            // Small delay before playing next to ensure clean transition
            setTimeout(() => {
              playNextSura();
            }, 1000);
          } else {
            console.log('Sura finished, autoplay is disabled - stopping playback');
            updatePlayButtonUI(false, true, 0);
            document.getElementById('play-quran').textContent = '▶ Play';
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

 
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

  // Dhikr event handlers
  document.getElementById('next-dhikr').addEventListener('click', nextDhikr);
  document.getElementById('toggle-notifications').addEventListener('click', toggleDhikrNotifications);
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

// Comprehensive collection of authentic Dhikr with their rewards
const dhikrCollection = [
  {
    arabic: 'سُبْحَانَ اللَّهِ',
    english: 'Glory be to Allah',
    transliteration: 'Subhan Allah',
    reward: 'Each recitation equals a tree planted in Paradise'
  },
  {
    arabic: 'الْحَمْدُ لِلَّهِ',
    english: 'Praise be to Allah',
    transliteration: 'Alhamdulillah',
    reward: 'Fills the scales of good deeds'
  },
  {
    arabic: 'اللَّهُ أَكْبَرُ',
    english: 'Allah is the Greatest',
    transliteration: 'Allahu Akbar',
    reward: 'Fills what is between heaven and earth'
  },
  {
    arabic: 'لَا إِلَٰهَ إِلَّا اللَّهُ',
    english: 'There is no god but Allah',
    transliteration: 'La ilaha illa Allah',
    reward: 'The best of remembrance, heaviest on the scales'
  },
  {
    arabic: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ',
    english: 'Glory be to Allah and praise be to Him',
    transliteration: 'Subhan Allahi wa bihamdihi',
    reward: '100 sins erased, even if like foam on the sea'
  },
  {
    arabic: 'سُبْحَانَ اللَّهِ الْعَظِيمِ وَبِحَمْدِهِ',
    english: 'Glory be to Allah the Magnificent and praise be to Him',
    transliteration: 'Subhan Allahil-Azeem wa bihamdihi',
    reward: 'Beloved to Allah, light on the tongue, heavy on the scales'
  },
  {
    arabic: 'لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ',
    english: 'There is no power except with Allah',
    transliteration: 'La hawla wa la quwwata illa billah',
    reward: 'A treasure from the treasures of Paradise'
  },
  {
    arabic: 'أَسْتَغْفِرُ اللَّهَ',
    english: 'I seek forgiveness from Allah',
    transliteration: 'Astaghfirullah',
    reward: 'Opens doors of mercy and provision'
  },
  {
    arabic: 'اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ',
    english: 'O Allah, send blessings upon Muhammad',
    transliteration: 'Allahumma salli ala Muhammad',
    reward: 'Allah sends 10 blessings for each one sent'
  },
  {
    arabic: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
    english: 'In the name of Allah, the Most Gracious, the Most Merciful',
    transliteration: 'Bismillahir-Rahmanir-Raheem',
    reward: 'Protection and blessings in all affairs'
  },
  {
    arabic: 'رَبِّ اغْفِرْ لِي',
    english: 'My Lord, forgive me',
    transliteration: 'Rabbighfir li',
    reward: 'Direct supplication for forgiveness'
  },
  {
    arabic: 'اللَّهُمَّ أَعِنِّي عَلَى ذِكْرِكَ وَشُكْرِكَ وَحُسْنِ عِبَادَتِكَ',
    english: 'O Allah, help me to remember You, thank You, and worship You excellently',
    transliteration: 'Allahumma a\'inni ala dhikrika wa shukrika wa husni ibadatik',
    reward: 'Comprehensive dua for spiritual improvement'
  },
  {
    arabic: 'حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ',
    english: 'Allah is sufficient for us and He is the best Guardian',
    transliteration: 'Hasbunallahu wa ni\'mal-wakeel',
    reward: 'Protection from all harms and anxieties'
  },
  {
    arabic: 'رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ',
    english: 'Our Lord, give us good in this world and good in the next world and save us from the punishment of the Fire',
    transliteration: 'Rabbana atina fi\'d-dunya hasanatan wa fi\'l-akhirati hasanatan wa qina adhab an-nar',
    reward: 'The most comprehensive dua for both worlds'
  },
  {
    arabic: 'اللَّهُمَّ إِنِّي أَسْأَلُكَ الْهُدَى وَالتُّقَى وَالْعَفَافَ وَالْغِنَى',
    english: 'O Allah, I ask You for guidance, piety, chastity and contentment',
    transliteration: 'Allahumma inni as\'aluka\'l-huda wa\'t-tuqa wa\'l-\'afafa wa\'l-ghina',
    reward: 'Dua for the four pillars of a good life'
  },
  {
    arabic: 'رَضِيتُ بِاللَّهِ رَبًّا وَبِالْإِسْلَامِ دِينًا وَبِمُحَمَّدٍ رَسُولًا',
    english: 'I am pleased with Allah as my Lord, Islam as my religion, and Muhammad as my Messenger',
    transliteration: 'Radeetu billahi rabban wa bil-Islami deenan wa bi Muhammadin rasoolan',
    reward: 'Guarantees Paradise for the one who says it with conviction'
  },
  {
    arabic: 'اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَٰهَ إِلَّا أَنْتَ خَلَقْتَنِي وَأَنَا عَبْدُكَ',
    english: 'O Allah, You are my Lord, there is no god but You. You created me and I am Your servant',
    transliteration: 'Allahumma anta rabbi la ilaha illa anta khalaqtani wa ana \'abduk',
    reward: 'Beginning of Sayyid al-Istighfar - master of seeking forgiveness'
  },
  {
    arabic: 'يَا حَيُّ يَا قَيُّومُ بِرَحْمَتِكَ أَسْتَغِيثُ',
    english: 'O Ever-Living, O Self-Sustaining, by Your mercy I seek help',
    transliteration: 'Ya Hayyu Ya Qayyum bi-rahmatika astaghith',
    reward: 'Powerful dua for seeking Allah\'s help and mercy'
  },
  {
    arabic: 'اللَّهُمَّ اهْدِنِي فِيمَنْ هَدَيْتَ',
    english: 'O Allah, guide me among those You have guided',
    transliteration: 'Allahumma\'hdini fiman hadayt',
    reward: 'Dua for guidance and righteousness'
  },
  {
    arabic: 'رَبِّ أَوْزِعْنِي أَنْ أَشْكُرَ نِعْمَتَكَ',
    english: 'My Lord, inspire me to be grateful for Your blessing',
    transliteration: 'Rabbi awzi\'ni an ashkura ni\'matak',
    reward: 'Dua for gratitude and righteous deeds'
  }
];

let currentDhikrIndex = 0;

async function loadDhikr() {
  displayCurrentDhikr();
  await loadDhikrSettings();
}

function displayCurrentDhikr() {
  const dhikr = dhikrCollection[currentDhikrIndex];
  document.getElementById('dhikr-text').textContent = `${dhikr.arabic} - ${dhikr.english}`;
  document.getElementById('dhikr-info').textContent = `Reward: ${dhikr.reward}`;
}

function getRandomDhikr() {
  return dhikrCollection[Math.floor(Math.random() * dhikrCollection.length)];
}

async function loadDhikrSettings() {
  try {
    const { dhikrSettings } = await chrome.storage.local.get('dhikrSettings');
    if (dhikrSettings) {
      const notificationsEnabled = dhikrSettings.notificationsEnabled || false;
      const interval = dhikrSettings.interval || 60;
      
      document.getElementById('toggle-notifications').dataset.enabled = notificationsEnabled.toString();
      document.getElementById('toggle-notifications').textContent = notificationsEnabled ? '🔔 Notifications: ON' : '🔔 Notifications: OFF';
      document.getElementById('dhikr-interval').value = interval;
      
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
    
    const dhikrSettings = {
      notificationsEnabled,
      interval,
      timestamp: Date.now()
    };
    
    await chrome.storage.local.set({ dhikrSettings });
    console.log('Saved dhikr settings:', dhikrSettings);
  } catch (error) {
    console.error('Failed to save dhikr settings:', error);
  }
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
  
  // Ensure UI is in clean state before starting new sura
  updatePlayButtonUI(false, true, 0);
  document.getElementById('play-quran').textContent = '▶ Play';
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
            // Reset UI to fresh state before autoplay
            updatePlayButtonUI(false, true, 0);
            document.getElementById('play-quran').textContent = '▶ Play';
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

// --- DHIKR FUNCTIONALITY ---

// Add debouncing for notification toggle
let notificationToggleInProgress = false;

function nextDhikr() {
  currentDhikrIndex = (currentDhikrIndex + 1) % dhikrCollection.length;
  displayCurrentDhikr();
}

async function toggleDhikrNotifications() {
  // Prevent multiple simultaneous calls
  if (notificationToggleInProgress) {
    console.log('Notification toggle already in progress, ignoring click');
    return;
  }
  
  notificationToggleInProgress = true;
  
  const button = document.getElementById('toggle-notifications');
  const settingsPanel = document.getElementById('notification-settings');
  const currentState = button.dataset.enabled === 'true';
  const newState = !currentState;
  
  // Disable button during operation and show loading state
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = newState ? '🔄 Enabling...' : '🔄 Disabling...';
  
  try {
    let response;
    const messageTimeout = 8000; // 8 second timeout
    
    if (newState) {
      // Starting notifications
      settingsPanel.classList.remove('hidden');
      const interval = parseInt(document.getElementById('dhikr-interval').value);
      updatePresetButtons(interval);
      
      console.log('Sending startDhikrNotifications message...');
      
      // Send message with robust timeout handling
      response = await Promise.race([
        new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            action: 'startDhikrNotifications',
            interval: interval
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
      // Stopping notifications
      settingsPanel.classList.add('hidden');
      
      console.log('Sending stopDhikrNotifications message...');
      
      // Send message with robust timeout handling
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
    button.textContent = newState ? '🔔 Notifications: ON' : '🔔 Notifications: OFF';
    
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

 
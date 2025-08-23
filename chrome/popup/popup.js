/**
 * Popup script for Qur'an & Sunnah Companion
 * Handles UI, API calls, and communication with the background script.
 * This version uses the Quran.com v4 API for Surah names, reciters, and audio.
 */

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
  return RECITER_LABEL_TO_KEY[input.value] || '';
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
  playButton.textContent = t('play');
  playButton.dataset.action = 'play';
  
  // Hide progress container since we're starting fresh
  document.getElementById('progress-container').classList.add('hidden');
  document.getElementById('progress-bar').value = 0;
  document.getElementById('current-time').textContent = formatTime(0);
  document.getElementById('total-time').textContent = formatTime(0);
  
  // Clear availability status
  const availabilityStatus = document.getElementById('quran-availability');
  availabilityStatus.innerHTML = '';
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
        setTimeout(() => { observer.disconnect(); resolve(); }, 3000);
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
    const stateResponse = await chrome.runtime.sendMessage({ action: 'getAudioState' });
    if (stateResponse?.success && stateResponse.state?.audioUrl) {
      const currentSuraId = document.getElementById('sura-select').value;
      const currentReciterKey = getReciterKey();
      
      // If the audio state matches current selections, restore the playback UI
      if (stateResponse.state.reciterKey === currentReciterKey && stateResponse.state.suraId === currentSuraId) {
        
        // console.log('Restoring audio playback state:', stateResponse.state);
        lastKnownAudioState = {
          suraId: stateResponse.state.suraId,
          reciterKey: stateResponse.state.reciterKey,
          currentTime: stateResponse.state.currentTime,
          isPlaying: stateResponse.state.isPlaying
        };
        
        updateProgressUI(stateResponse.state);
        updatePlayButtonUI(stateResponse.state.isPlaying, true, stateResponse.state.currentTime);
        
        // Show resume indicator if there's significant progress
        if (stateResponse.state.currentTime > 30) {
          availabilityStatus.innerHTML = `⏯ Ready to resume from ${formatTime(stateResponse.state.currentTime)}`;
          availabilityStatus.style.color = '#007bff';
        } else if (stateResponse.state.currentTime > 5) {
          availabilityStatus.innerHTML = `⏯ Previous session available`;
          availabilityStatus.style.color = '#007bff';
        }
        
        if (stateResponse.state.isPlaying) {
          startProgressTracking();
        }
      } else if (stateResponse.state.reciterKey && stateResponse.state.suraId) {
        // If there's an active audio session but it doesn't match current selections, update the selections to match the active session
        // console.log('Updating selections to match active audio session');
        
        if (Array.from(document.getElementById('sura-select').options).some(opt => opt.value === stateResponse.state.suraId)) {
          document.getElementById('sura-select').value = stateResponse.state.suraId;
        }
        
        setReciterInputByKey(stateResponse.state.reciterKey);
        
        validateQuranSelection();
        lastKnownAudioState = {
          suraId: stateResponse.state.suraId,
          reciterKey: stateResponse.state.reciterKey,
          currentTime: stateResponse.state.currentTime,
          isPlaying: stateResponse.state.isPlaying
        };
        
        updateProgressUI(stateResponse.state);
        updatePlayButtonUI(stateResponse.state.isPlaying, true, stateResponse.state.currentTime);
        
        if (stateResponse.state.isPlaying) {
          startProgressTracking();
        }
        
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
    reward: "Powerful dua for seeking Allah's help and mercy"
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
  },
  {
    arabic: 'لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ',
    english: 'There is no god except Allah, alone without partner; His is the dominion and His is the praise and He is over all things capable',
    transliteration: 'La ilaha illallahu wahdahu la sharika lah, lahul mulk wa lahul hamd, wa huwa ala kulli shay\'in qadir',
    reward: 'Saying it 100 times equals freeing 10 slaves, 100 good deeds written and 100 sins erased, protection from Shaytan all day'
  },
  {
    arabic: 'سُبْحَانَ اللَّهِ وَالْحَمْدُ لِلَّهِ وَلَا إِلَٰهَ إِلَّا اللَّهُ وَاللَّهُ أَكْبَرُ',
    english: 'Glory be to Allah, praise be to Allah, there is no god but Allah, Allah is the Greatest',
    transliteration: 'Subhan Allah, walhamdulillah, wa la ilaha illallah, wallahu akbar',
    reward: 'More beloved to the Prophet than all the world and what it contains'
  },
  {
    arabic: 'أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ',
    english: 'I seek refuge in the perfect words of Allah from the evil of what He has created',
    transliteration: 'A\'udhu bi kalimatillahi at-tammati min sharri ma khalaq',
    reward: 'Protection from harm until morning'
  },
  {
    arabic: 'بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ',
    english: 'In the name of Allah with whose name nothing is harmed on earth or in the heavens, and He is the All-Hearing, the All-Knowing',
    transliteration: 'Bismillahi alladhi la yadurru ma\'a ismihi shay\'un fil-ardi wa la fis-sama\'i wa huwa as-sami\'u al-alim',
    reward: 'Nothing will harm the one who says it three times in morning and evening'
  },
  {
    arabic: 'حَسْبِيَ اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ، عَلَيْهِ تَوَكَّلتُ وَهُوَ رَبُّ الْعَرْشِ الْعَظِيمِ',
    english: 'Allah is sufficient for me; there is no god but Him. Upon Him I rely and He is the Lord of the mighty throne',
    transliteration: 'Hasbiyallahu la ilaha illa Huwa, alayhi tawakkaltu wa Huwa Rabbul-Arsh il-Azeem',
    reward: 'Whoever recites it seven times morning and evening Allah will suffice him'
  },
  {
    arabic: 'رَبِّ اشْرَحْ لِي صَدْرِي وَيَسِّرْ لِي أَمْرِي',
    english: 'My Lord, expand for me my chest and ease for me my task',
    transliteration: 'Rabbi shrah li sadri wa yassir li amri',
    reward: 'Ease in tasks and removal of anxiety'
  },
  {
    arabic: 'رَبِّ اغْفِرْ لِي وَلِوَالِدَيَّ وَارْحَمْهُمَا كَمَا رَبَّيَانِي صَغِيرًا',
    english: 'My Lord, forgive me and my parents and have mercy on them as they raised me when I was small',
    transliteration: 'Rabbi ighfir li waliwalidayya warhamhuma kama rabbayani sagheera',
    reward: "Dua for parents leading to Allah's mercy"
  }
];

let currentDhikrIndex = 0;

async function loadDhikr() {
  displayCurrentDhikr();
  await loadDhikrSettings();
}

// --- Translations for Dhikr rewards ----------------------------------------
const DHIKR_REWARD_AR = {
  'Each recitation equals a tree planted in Paradise': 'تُغرس له شجرةٌ في الجنة',
  'Fills the scales of good deeds': 'تملأ ميزان الحسنات',
  'Fills what is between heaven and earth': 'تملأ ما بين السماء والأرض',
  'The best of remembrance, heaviest on the scales': 'أفضل الذكر وأثقلها في الميزان',
  '100 sins erased, even if like foam on the sea': 'يحط الله بها مائة خطيئة وإن كانت مثل زبد البحر',
  'Beloved to Allah, light on the tongue, heavy on the scales': 'حبيبتان إلى الرحمن، خفيفتان على اللسان، ثقيلتان في الميزان',
  'A treasure from the treasures of Paradise': 'كنز من كنوز الجنة',
  'Opens doors of mercy and provision': 'يفتح أبواب الرحمة والرزق',
  'Allah sends 10 blessings for each one sent': 'يُصلي الله عليه عشرًا بكل صلاة',
  'Protection and blessings in all affairs': 'يحصل بها الحفظ والبركة في الأمور',
  'Direct supplication for forgiveness': 'دعاء مباشر للمغفرة',
  'Comprehensive dua for spiritual improvement': 'دعاء جامع لزيادة الإيمان والعمل الصالح',
  'Protection from all harms and anxieties': 'حماية من كل شر وهم',
  'The most comprehensive dua for both worlds': 'من أَوْسَعِ الأدعية للدنيا والآخرة',
  'Dua for the four pillars of a good life': 'دعاء لأصول السعادة الأربع',
  'Guarantees Paradise for the one who says it with conviction': 'ضمان الجنة لمن قالها موقنًا',
  'Beginning of Sayyid al-Istighfar - master of seeking forgiveness': 'بداية سيد الاستغفار',
  "Powerful dua for seeking Allah's help and mercy": 'دعاء قوي لطلب العون والرحمة',
  'Dua for guidance and righteousness': 'دعاء للهداية والاستقامة',
  'Dua for gratitude and righteous deeds': 'دعاء للشكر والعمل الصالح',
  'Saying it 100 times equals freeing 10 slaves, 100 good deeds written and 100 sins erased, protection from Shaytan all day': 'يعدل عتق 10 رقاب ويكتب 100 حسنة ويمحى 100 سيئة ويحفظه من الشيطان يومًا كاملاً',
  'More beloved to the Prophet than all the world and what it contains': 'أحب إلى النبي مما طلعت عليه الشمس',
  'Relief from anxieties and debts': 'فرج للهموم والدين',
  'Protection from harm until morning': 'حفظ من كل أذى حتى الصباح',
  'Nothing will harm the one who says it three times in morning and evening': 'لا يضره شيء إذا قالها ثلاثًا صباحًا ومساءً',
  'Whoever recites it seven times morning and evening Allah will suffice him': 'من قالها سبع مرات صباحًا ومساءً كفاه الله',
  'Ease in tasks and removal of anxiety': 'تيسير الأمور وشرح الصدر',
  "Dua for parents leading to Allah's mercy": 'دعاء للوالدين يجلب رحمة الله',
  'Protection from loss of blessings': 'حفظ من زوال النعمة وغضب الله'
};

const DHIKR_REWARD_FR = {
  'Each recitation equals a tree planted in Paradise': 'Chaque récitation équivaut à un arbre planté au Paradis',
  'Fills the scales of good deeds': 'Remplit la balance des bonnes actions',
  'Fills what is between heaven and earth': 'Remplit ce qui se trouve entre le ciel et la terre',
  'The best of remembrance, heaviest on the scales': 'Le meilleur des rappels, le plus lourd sur la balance',
  '100 sins erased, even if like foam on the sea': '100 péchés effacés, même s’ils étaient comme l’écume de la mer',
  'Beloved to Allah, light on the tongue, heavy on the scales': 'Aimées d’Allah, légères sur la langue, lourdes sur la balance',
  'A treasure from the treasures of Paradise': 'Un trésor parmi les trésors du Paradis',
  'Opens doors of mercy and provision': 'Ouvre les portes de la miséricorde et de la subsistance',
  'Allah sends 10 blessings for each one sent': 'Allah envoie 10 bénédictions pour chacune envoyée',
  'Protection and blessings in all affairs': 'Protection et bénédictions dans toutes les affaires',
  'Direct supplication for forgiveness': 'Invocation directe pour le pardon',
  'Comprehensive dua for spiritual improvement': 'Invocation globale pour l’amélioration spirituelle',
  'Protection from all harms and anxieties': 'Protection contre tous les maux et angoisses',
  'The most comprehensive dua for both worlds': 'L’invocation la plus globale pour les deux mondes',
  'Dua for the four pillars of a good life': 'Invocation pour les quatre piliers d’une bonne vie',
  'Guarantees Paradise for the one who says it with conviction': 'Garantit le Paradis à celui qui le dit avec conviction',
  'Beginning of Sayyid al-Istighfar - master of seeking forgiveness': 'Début de Sayyid al-Istighfar - le maître de la demande de pardon',
  "Powerful dua for seeking Allah's help and mercy": 'Invocation puissante pour demander l’aide et la miséricorde d’Allah',
  'Dua for guidance and righteousness': 'Invocation pour la guidance et la droiture',
  'Dua for gratitude and righteous deeds': 'Invocation pour la gratitude et les bonnes actions',
  'Saying it 100 times equals freeing 10 slaves, 100 good deeds written and 100 sins erased, protection from Shaytan all day': 'Le dire 100 fois équivaut à libérer 10 esclaves, 100 bonnes actions écrites et 100 péchés effacés, protection contre Satan toute la journée',
  'More beloved to the Prophet than all the world and what it contains': 'Plus aimé du Prophète que tout le monde et ce qu’il contient',
  'Relief from anxieties and debts': 'Soulagement des angoisses et des dettes',
  'Protection from harm until morning': 'Protection contre le mal jusqu’au matin',
  'Nothing will harm the one who says it three times in morning and evening': 'Rien ne nuira à celui qui le dit trois fois matin et soir',
  'Whoever recites it seven times morning and evening Allah will suffice him': 'Quiconque le récite sept fois matin et soir, Allah lui suffira',
  'Ease in tasks and removal of anxiety': 'Facilité dans les tâches et suppression de l’anxiété',
  "Dua for parents leading to Allah's mercy": 'Invocation pour les parents menant à la miséricorde d’Allah',
  'Protection from loss of blessings': 'Protection contre la perte des bienfaits'
};

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

function getRandomDhikr() {
  return dhikrCollection[Math.floor(Math.random() * dhikrCollection.length)];
}

async function loadDhikrSettings() {
  try {
    const { dhikrSettings } = await chrome.storage.local.get('dhikrSettings');
    if (dhikrSettings) {
      const notificationsEnabled = dhikrSettings.notificationsEnabled || false;
      const interval = dhikrSettings.interval || 60;
      const mode = dhikrSettings.mode || 'notification';
      
      document.getElementById('toggle-notifications').dataset.enabled = notificationsEnabled.toString();
      document.getElementById('toggle-notifications').textContent = notificationsEnabled ? t('notificationsOn') : t('notificationsOff');
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
  const suraSelect = document.getElementById('sura-select');
  const reciterInput = document.getElementById('reciter-input');
  const reciterDatalist = document.getElementById('reciter-list');

  try {
    const [suras, reciters] = await Promise.all([fetchSuras(), fetchReciters()]);
    populateSelect(suraSelect, suras, t('selectSura'), s => ({ value: s.id, text: `${s.id}. ${getSuraName(s)}` }));
    ALL_RECITERS = reciters;
    reciterDatalist.innerHTML = '';
    reciters.forEach(r => {
      const label = `${r.reciter_name} (${r.style}, ${r.bitrate || 128}kbps)`;
      RECITER_LABEL_TO_KEY[label] = r.id;
      const option = document.createElement('option');
      option.value = label;
      reciterDatalist.appendChild(option);
    });
  } catch (error) {
    console.error("Failed to setup Qur'an selectors:", error);
    suraSelect.innerHTML = '<option value="">Error</option>';
    reciterInput.placeholder = 'Error loading reciters';
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

async function fetchSuras(lang = CURRENT_LANG || 'en') {
  const response = await fetch(`https://api.quran.com/api/v4/chapters?language=${lang}`);
  if (!response.ok) throw new Error('Failed to fetch suras');
  const { chapters } = await response.json();
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
async function fetchIslamicNetworkReciters() {
  const slugs = [
    'ar.alafasy',
    'ar.husary',
    'ar.shuraym',
    'ar.tablawee'
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

// Aggregate loader ----------------------------------------------------------------
async function fetchReciters() {
  const combined = (await Promise.all([
    fetchQuranComReciters(),
    fetchMp3QuranReciters(),
    fetchIslamicNetworkReciters()
  ])).flat();

  // -----------------------------------------------
  // Deduplicate reciters across providers
  // -----------------------------------------------
  const dedupedMap = new Map();
  combined.forEach(r => {
    const key = `${r.reciter_name.toLowerCase()}|${(r.style || '').toLowerCase()}`;
    if (!dedupedMap.has(key)) {
      dedupedMap.set(key, { ...r, altIds: [] });
    } else {
      dedupedMap.get(key).altIds.push(r.id);
    }
  });

  const deduped = Array.from(dedupedMap.values());

  deduped.forEach(r => {
    RECITER_CATALOG[r.id] = r;
    (r.altIds || []).forEach(alt => (RECITER_CATALOG[alt] = r));
  });

  try {
    await chrome.storage.local.set({ reciterCache: { reciters: deduped, timestamp: Date.now() } });
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
}

async function playQuranAudio() {
  setUILoading(true);
  const suraId = document.getElementById('sura-select').value;
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
    
    availabilityStatus.innerHTML = '&#x2705; Playing...';
    availabilityStatus.style.color = 'green';
    updatePlayButtonUI(true, true, 0);
    lastKnownAudioState.isPlaying = true;
    startProgressTracking();
  } catch (error) {
    console.error('Audio playback failed:', error);
    availabilityStatus.innerHTML = '&#x274C; Reciter not available right now.';
    availabilityStatus.style.color = 'red';
    updatePlayButtonUI(false, true);
  } finally {
    setUILoading(false);
  }
}

async function getSuraAudioUrl(reciterKey, suraId) {
    let provider = 'qc';
    let rawId = reciterKey;
    if (reciterKey.includes(':')) {
        const parts = reciterKey.split(':');
        provider = parts[0];
        rawId = parts.slice(1).join(':');
    }

    // MP3Quran provider -----------------------------------------------------------
    if (provider === 'mp3') {
        const reciter = RECITER_CATALOG[reciterKey];
        if (!reciter) throw new Error('Reciter not found in catalogue');
        const suraStr = String(suraId).padStart(3, '0');
        return `${reciter.server}${suraStr}.mp3`;
    }

    // Islamic.network provider ----------------------------------------------------
    if (provider === 'islamic') {
        const reciter = RECITER_CATALOG[reciterKey];
        if (!reciter) throw new Error('Reciter not found in catalogue');
        return `https://cdn.islamic.network/quran/audio/128/${reciter.slug}/${suraId}.mp3`;
    }

    // Default: Quran.com ----------------------------------------------------------
    const reciterId = rawId;

    // Try to get full chapter audio first
    const chapterUrl = `https://api.quran.com/api/v4/chapter_recitations/${reciterId}/${suraId}`;
    console.log('Fetching chapter audio from:', chapterUrl);
    try {
        const chapterResponse = await fetch(chapterUrl);
        if (chapterResponse.ok) {
            const chapterData = await chapterResponse.json();
            if (chapterData.audio_file?.audio_url) {
                const audioUrl = chapterData.audio_file.audio_url;
                return audioUrl.startsWith('http') ? audioUrl : `https://verses.quran.com/${audioUrl}`;
            }
        }
    } catch (error) {
        console.log('Chapter audio not available, trying verse-by-verse approach:', error.message);
    }

    const versesUrl = `https://api.quran.com/api/v4/recitations/${reciterId}/by_chapter/${suraId}`;
    console.log('Fetching verse audio from:', versesUrl);
    const response = await fetch(versesUrl);
    if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    if (!data.audio_files || data.audio_files.length === 0) {
        throw new Error('No audio files found in API response.');
    }
    const firstAudio = data.audio_files[0];
    let audioUrl = firstAudio.url || firstAudio.audio_url;
    if (!audioUrl) throw new Error('Audio URL not found in API response.');
    if (audioUrl.startsWith('//')) {
        return `https:${audioUrl}`;
    } else if (audioUrl.startsWith('http')) {
        return audioUrl;
    } else {
        return `https://verses.quran.com/${audioUrl}`;
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
  autoplayButton.textContent = isEnabled ? t('autoplayOn') : t('autoplayOff');
}

function getNextSuraId(currentSuraId) {
  const currentId = parseInt(currentSuraId);
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
  
  document.getElementById('sura-select').value = nextSuraId;
  await saveUserSelections();
  
  updatePlayButtonUI(false, true, 0);
  document.getElementById('play-quran').textContent = t('play');
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
  const currentSuraId = document.getElementById('sura-select').value;
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
    playButton.textContent = t('playing');
    playButton.dataset.action = '';
    pauseButton.classList.remove('hidden');
    pauseButton.textContent = t('pause');
  } else {
    // Audio not playing (stopped or paused) --------------------------------
    playButton.classList.remove('hidden');
    playButton.disabled = !isEnabled;
    
    if (hasProgress && hasMatchingSelection) {
      playButton.textContent = `${t('resume')} (${formatTime(currentTime)})`;
      playButton.dataset.action = 'resume';
    } else {
      playButton.textContent = t('play');
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
            document.getElementById('play-quran').textContent = t('play');
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
            document.getElementById('play-quran').textContent = t('play');
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
  button.textContent = newState ? '🔄 Enabling...' : '🔄 Disabling...';
  
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
    button.textContent = newState ? t('notificationsOn') : t('notificationsOff');
    
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
    clearReciter: "✖ Clear",
    // New error messages
    errorNetwork: "Network connection issue. Please check your internet.",
    errorFormat: "Audio format not supported by your browser.",
    errorAutoplay: "Click the play button to start audio (browser autoplay policy).",
    errorTimeout: "Audio loading timed out. Please try again.",
    errorNotFound: "Audio not available for this reciter/surah combination.",
    errorGeneral: "Unable to play audio right now. Please try again.",
    errorLoadingData: "Failed to load content",
    errorOffline: "No internet connection",
    // Loading states
    loadingContent: "Loading",
    loadingComplete: "Content loaded successfully",
    loadingAudio: "Loading audio",
    resumingFrom: "Resuming from",
    resuming: "Resuming",
    pausedAt: "Paused at",
    paused: "Paused",
    resumeFailed: "Failed to resume audio",
    audioConnectionLost: "Audio connection lost. Try refreshing if playback stops working."
  },
  fr: {
    appTitle: "Compagnon du Coran et de la Sunnah",
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
    playing: "▶ En cours de lecture",
    reminderStyle: "Style de rappel :",
    modeNotification: "📣 Notification",
    modePopup: "🗔 Pop-up",
    reminderLabel: "Intervalle de rappel (secondes) :",
    invalidInterval: "Veuillez entrer une valeur entre 5 et 3600 secondes.",
    notificationError: "Une erreur s'est produite. Veuillez réessayer.",
    clearReciter: "✖ Effacer",
    // New error messages
    errorNetwork: "Problème de connexion réseau. Vérifiez votre connexion internet.",
    errorFormat: "Format audio non pris en charge par votre navigateur.",
    errorAutoplay: "Cliquez sur le bouton de lecture pour démarrer l'audio (politique de lecture automatique du navigateur).",
    errorTimeout: "Le chargement de l'audio a expiré. Veuillez réessayer.",
    errorNotFound: "Audio non disponible pour cette combinaison récitateur/sourate.",
    errorGeneral: "Impossible de lire l'audio en ce moment. Veuillez réessayer.",
    errorLoadingData: "Échec du chargement du contenu",
    errorOffline: "Aucune connexion internet",
    // Loading states
    loadingContent: "Chargement",
    loadingComplete: "Contenu chargé avec succès",
    loadingAudio: "Chargement de l'audio",
    resumingFrom: "Reprise à partir de",
    resuming: "Reprise",
    pausedAt: "Mis en pause à",
    paused: "En pause",
    resumeFailed: "Échec de la reprise audio",
    audioConnectionLost: "Connexion audio perdue. Essayez de rafraîchir si la lecture s'arrête."
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
  }
};

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
  if (playBtn && playBtn.dataset.action === 'play') playBtn.textContent = t('play');
  
  const pauseBtn = document.getElementById('pause-quran');
  if (pauseBtn) pauseBtn.textContent = t('pause');
  
  const autoplayBtn = document.getElementById('autoplay-toggle');
  if (autoplayBtn) {
    const on = autoplayBtn.dataset.autoplay === 'true';
    autoplayBtn.textContent = on ? t('autoplayOn') : t('autoplayOff');
  }

  const nextDhikrBtn = document.getElementById('next-dhikr');
  if (nextDhikrBtn) nextDhikrBtn.textContent = t('nextDhikr');
  const notifBtn = document.getElementById('toggle-notifications');
  if (notifBtn) {
    const en = notifBtn.dataset.enabled === 'true';
    notifBtn.textContent = en ? t('notificationsOn') : t('notificationsOff');
  }

  const loadingEl = document.getElementById('quran-loading');
  if (loadingEl) loadingEl.textContent = t('loading');

  const suraSelect = document.getElementById('sura-select');
  if (suraSelect && suraSelect.options.length > 0 && suraSelect.options[0].value === '') {
    suraSelect.options[0].textContent = t('selectSura');
  }

  const clearReciterBtn = document.getElementById('clear-reciter');
  if (clearReciterBtn) clearReciterBtn.textContent = t('clearReciter');

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
    const suraSelect = document.getElementById('sura-select');
    const currentVal = suraSelect.value;
    populateSelect(
      suraSelect,
      suras,
      t('selectSura'),
      s => ({ value: s.id, text: `${s.id}. ${getSuraName(s)}` })
    );
    if (currentVal) {
      suraSelect.value = currentVal;
    }
  }).catch(err => console.error('Failed to refresh suras for lang', CURRENT_LANG, err));
}
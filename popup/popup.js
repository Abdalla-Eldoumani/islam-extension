// Global progress tracking interval
let progressTrackingInterval = null;
let cdnInfo = {}; // To store the available reciters and their bitrates

// Keep a cache for the reciter-to-surah mapping
let reciterAudioDataCache = new Map();

document.addEventListener('DOMContentLoaded', async () => {
  await setupQuranSelectors();
  await Promise.all([loadHadith(), loadDhikr(), loadSavedAudioState()]);
  setupPlayButton();
});

async function loadSavedAudioState() {
  try {
    const result = await chrome.storage.local.get('audioState');
    if (result.audioState && result.audioState.suraId && result.audioState.reciterKey) {
      // Restore previous selections
      document.getElementById('sura-select').value = result.audioState.suraId;
      document.getElementById('reciter-select').value = result.audioState.reciterKey;
      
      // Enable play button since we have valid selections
      document.getElementById('play-quran').disabled = false;
      
      // Check current audio state from offscreen document
      try {
        const stateResponse = await chrome.runtime.sendMessage({ action: 'getAudioState' });
        if (stateResponse && stateResponse.success && stateResponse.state) {
          const state = stateResponse.state;
          
          if (state.audioUrl && (state.isPlaying || state.currentTime > 0)) {
            document.getElementById('play-quran').textContent = state.isPlaying ? '⏸ Playing' : '▶ Resume';
            document.getElementById('pause-quran').disabled = !state.isPlaying;
            document.getElementById('progress-container').style.display = 'block';
            
            // Update progress display
            if (state.duration > 0) {
              const progressPercent = (state.currentTime / state.duration) * 100;
              document.getElementById('progress-bar').value = progressPercent;
              document.getElementById('current-time').textContent = formatTime(state.currentTime);
              document.getElementById('total-time').textContent = formatTime(state.duration);
            }
            
            // Start progress tracking if audio is playing
            if (state.isPlaying) {
              startProgressTracking();
            }
          }
        }
      } catch (error) {
        console.log('No active audio session found');
      }
    }
  } catch (error) {
    console.error('Failed to load saved audio state:', error);
  }
}

async function loadHadith() {
  try {
    const response = await fetch('https://api.hadith.gading.dev/books/bukhari?range=1-300');
    const data = await response.json();
    const randomHadith = data.data.hadiths[Math.floor(Math.random() * data.data.hadiths.length)];
    document.getElementById('hadith-text').textContent = 
      randomHadith?.arab || randomHadith?.id || 'SubhanAllah - Glory be to Allah';
  } catch {
    document.getElementById('hadith-text').textContent = 'لَا إِلَٰهَ إِلَّا اللَّهُ - There is no god but Allah';
  }
}

async function loadDhikr() {
  try {
    const dhikrCollection = [
      { arabic: 'سُبْحَانَ اللَّهِ', english: 'Glory be to Allah (Subhan Allah)' },
      { arabic: 'الْحَمْدُ لِلَّهِ', english: 'Praise be to Allah (Alhamdulillah)' },
      { arabic: 'اللَّهُ أَكْبَرُ', english: 'Allah is the Greatest (Allahu Akbar)' },
      { arabic: 'لَا إِلَٰهَ إِلَّا اللَّهُ', english: 'There is no god but Allah (La ilaha illa Allah)' },
      { arabic: 'أَسْتَغْفِرُ اللَّهَ', english: 'I seek forgiveness from Allah (Astaghfirullah)' },
      { arabic: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ', english: 'Glory be to Allah and praise be to Him (Subhan Allah wa bihamdihi)' },
      { arabic: 'سُبْحَانَ اللَّهِ الْعَظِيمِ', english: 'Glory be to Allah the Magnificent (Subhan Allah al-Azeem)' },
      { arabic: 'سبحان الله وبحمده, سبحان الله العظيم', english: 'Glory be to Allah and praise be to Him and Glory be to Allah the Magnificent' },
      { arabic: 'لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ', english: 'There is no power except with Allah (La hawla wa la quwwata illa billah)' },
      { arabic: 'رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ', english: 'Our Lord, give us good in this world and good in the next world, and save us from the punishment of the Fire' },
      { arabic: 'رَبِّ اشْرَحْ لِي صَدْرِي وَيَسِّرْ لِي أَمْرِي', english: 'My Lord, expand my chest and ease my task for me' }
    ];
    const randomDhikr = dhikrCollection[Math.floor(Math.random() * dhikrCollection.length)];
    document.getElementById('dhikr-text').textContent = `${randomDhikr.arabic} - ${randomDhikr.english}`;
  } catch {
    document.getElementById('dhikr-text').textContent = 'سُبْحَانَ اللَّهِ - Glory be to Allah';
  }
}

async function setupQuranSelectors() {
  let suras = [];
  try {
    // This API is more reliable for metadata
    const response = await fetch('https://api.quran.com/api/v4/chapters?language=en');
    const data = await response.json();
    suras = data.chapters.map(sura => ({
      id: sura.id,
      name: sura.name_simple
    }));
    console.log(`Successfully fetched ${suras.length} surahs from quran.com.`);
  } catch (error) {
    console.error('Failed to fetch surah list from quran.com, using fallback.', error);
    // Fallback to a few surahs if API fails
    suras = [ { id: 1, name: 'Al-Fatihah' } ];
  }

  // Your preferred list of reciters
  const preferredReciterNames = [
    "Mishari Rashid al-`Afasy", "Maher Al Muaiqly", "Mahmud Khalil Al-Husary",
    "Mohamed Siddiq al-Minshawi", "Bandar Baleela", "Badr Al Turki", 
    "Yasser Ad-Dussary", "Ali Abdur-Rahman al-Huthaify", "Mohammad Ayyub", 
    "Mohamed Rifaat", "Abdel Basset Abdel Samad", "Abdur-Rahman as-Sudais"
  ];

  let reciters = [];
  try {
    console.log('Fetching reciters from quran.com API...');
    const response = await fetch('https://api.quran.com/api/v4/resources/recitations?language=en');
    const data = await response.json();

    // Filter the API results to match your preferred list
    reciters = data.recitations.filter(reciter => 
      preferredReciterNames.some(name => reciter.reciter_name.includes(name))
    );
    
    console.log(`Found ${reciters.length} matching preferred reciters.`);

  } catch (error) {
    console.error('Failed to fetch reciters from quran.com API:', error);
  }
  
  if (reciters.length === 0) {
    console.log('Using fallback reciter because API failed or no matches were found.');
    reciters = [{ id: 7, reciter_name: 'Mishari Rashid al-`Afasy' }]; // Fallback to a known working one
  }

  const suraSelect = document.getElementById('sura-select');
  const reciterSelect = document.getElementById('reciter-select');
  
  suraSelect.innerHTML = '<option value="">Select Sura...</option>'; // Clear previous options
  reciterSelect.innerHTML = '<option value="">Select Reciter...</option>'; // Clear previous options
  
  suras.forEach(sura => {
    const option = document.createElement('option');
    option.value = sura.id;
    option.textContent = `${sura.id}. ${sura.name}`;
    suraSelect.appendChild(option);
  });
  
  reciters.forEach(reciter => {
    const option = document.createElement('option');
    option.value = reciter.id;
    option.textContent = reciter.reciter_name;
    reciterSelect.appendChild(option);
  });
  
  [suraSelect, reciterSelect].forEach(select => {
    select.addEventListener('change', () => {
      const playButton = document.getElementById('play-quran');
      playButton.disabled = !suraSelect.value || !reciterSelect.value;
    });
  });
}

async function playQuranAudio(suraId, reciterId) {
  const loadingEl = document.getElementById('quran-loading');
  const playButton = document.getElementById('play-quran');
  const pauseButton = document.getElementById('pause-quran');
  
  try {
    loadingEl.style.display = 'block';
    playButton.disabled = true;

    console.log(`Requesting audio for Sura ${suraId}, Reciter ID ${reciterId}`);

    // Check cache first
    let audioUrl = reciterAudioDataCache.get(reciterId)?.get(suraId);

    if (!audioUrl) {
      console.log('Cache miss. Fetching audio data from API...');
      const response = await fetch(`https://api.quran.com/api/v4/recitations/${reciterId}/audio_files?chapter_number=${suraId}`);
      if (!response.ok) {
        throw new Error(`API returned status ${response.status}. This sura may not be available for the selected reciter.`);
      }
      const data = await response.json();
      audioUrl = data.audio_files[0]?.audio_url;

      // Update cache
      if (!reciterAudioDataCache.has(reciterId)) {
        reciterAudioDataCache.set(reciterId, new Map());
      }
      reciterAudioDataCache.get(reciterId).set(suraId, audioUrl);
    } else {
      console.log('Cache hit. Using stored audio URL.');
    }

    if (!audioUrl) {
      throw new Error(`No audio file found for this reciter/sura combination.`);
    }

    // The API returns a full URL, which we need to adjust for the correct CDN
    const correctedAudioUrl = `https://${audioUrl.startsWith('//') ? audioUrl.substring(2) : audioUrl}`;

    console.log(`Playing from URL: ${correctedAudioUrl}`);
    
    const bgResponse = await chrome.runtime.sendMessage({
      action: 'playAudio',
      audioUrl: correctedAudioUrl,
      suraId: suraId,
      reciterKey: reciterId // Using reciterId as the key now
    });
    
    console.log('Response from background script:', bgResponse);
    
    if (bgResponse && bgResponse.success) {
      await new Promise(resolve => setTimeout(resolve, 500)); 
      
      playButton.textContent = '⏸ Playing';
      playButton.disabled = false;
      pauseButton.disabled = false;
      pauseButton.style.display = 'block';
      document.getElementById('progress-container').style.display = 'block';
      
      startProgressTracking();
      console.log('Audio playback started successfully');
    } else {
      throw new Error(`Failed to start audio: ${bgResponse?.error || 'Unknown background error'}`);
    }
    
  } catch (error) {
    console.error('Audio playback failed:', error);
    alert(`Unable to play audio: ${error.message}`);
    playButton.textContent = '▶ Play';
    playButton.disabled = false;
  } finally {
    loadingEl.style.display = 'none';
  }
}

async function pauseQuranAudio() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'pauseAudio' });
    if (response && response.success) {
      document.getElementById('play-quran').textContent = '▶ Resume';
      document.getElementById('pause-quran').disabled = true;
    }
  } catch (error) {
    console.error('Failed to pause audio:', error);
  }
}

async function resumeQuranAudio() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'resumeAudio' });
    if (response && response.success) {
      document.getElementById('play-quran').textContent = '⏸ Playing';
      document.getElementById('pause-quran').disabled = false;
    }
  } catch (error) {
    console.error('Failed to resume audio:', error);
  }
}

async function seekAudio(percentage) {
  try {
    const stateResponse = await chrome.runtime.sendMessage({ action: 'getAudioState' });
    if (stateResponse && stateResponse.success && stateResponse.state.duration) {
      const seekTime = (percentage / 100) * stateResponse.state.duration;
      await chrome.runtime.sendMessage({ action: 'seekAudio', time: seekTime });
    }
  } catch (error) {
    console.error('Failed to seek audio:', error);
  }
}

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function startProgressTracking() {
  // Clear any existing interval
  if (progressTrackingInterval) {
    clearInterval(progressTrackingInterval);
  }
  
  // Update progress every second
  progressTrackingInterval = setInterval(async () => {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getAudioState' });
      if (response && response.success) {
        const { currentTime, duration, isPlaying } = response.state;
        
        if (duration > 0) {
          const progressPercent = (currentTime / duration) * 100;
          document.getElementById('progress-bar').value = progressPercent;
          document.getElementById('current-time').textContent = formatTime(currentTime);
          document.getElementById('total-time').textContent = formatTime(duration);
          
          // Update button states based on actual playing state
          const playButton = document.getElementById('play-quran');
          const pauseButton = document.getElementById('pause-quran');
          
          if (isPlaying) {
            playButton.textContent = '⏸ Playing';
            pauseButton.disabled = false;
          } else {
            playButton.textContent = '▶ Resume';
            pauseButton.disabled = true;
          }
        }
        
        // Clear interval if audio is not playing and ended
        if (!isPlaying && currentTime >= duration && duration > 0) {
          clearInterval(progressTrackingInterval);
          progressTrackingInterval = null;
          document.getElementById('play-quran').textContent = '▶ Play';
          document.getElementById('pause-quran').disabled = true;
        }
      }
    } catch (error) {
      console.error('Progress tracking error:', error);
      clearInterval(progressTrackingInterval);
      progressTrackingInterval = null;
    }
  }, 1000);
}

function setupPlayButton() {
  // Play/Resume button
  document.getElementById('play-quran').addEventListener('click', async () => {
    const buttonText = document.getElementById('play-quran').textContent;
    
    if (buttonText === '▶ Resume') {
      await resumeQuranAudio();
    } else {
      const suraId = document.getElementById('sura-select').value;
      const reciterId = document.getElementById('reciter-select').value;
      
      if (suraId && reciterId) {
        await playQuranAudio(suraId, reciterId);
      }
    }
  });
  
  // Pause button
  document.getElementById('pause-quran').addEventListener('click', pauseQuranAudio);
  
  // Progress bar seeking
  document.getElementById('progress-bar').addEventListener('change', (e) => {
    seekAudio(e.target.value);
  });
} 
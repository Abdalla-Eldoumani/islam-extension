// Global progress tracking interval
let progressTrackingInterval = null;
let cdnInfo = {}; // To store the available reciters and their bitrates

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
  const suras = [
    { id: 1, name: 'Al-Fatihah' }, { id: 2, name: 'Al-Baqarah' }, { id: 3, name: 'Ali \'Imran' },
    { id: 18, name: 'Al-Kahf' }, { id: 36, name: 'Ya-Sin' }, { id: 55, name: 'Ar-Rahman' },
    { id: 67, name: 'Al-Mulk' }, { id: 112, name: 'Al-Ikhlas' }, { id: 113, name: 'Al-Falaq' },
    { id: 114, name: 'An-Nas' }
  ];
  
  // Fetch reciters that have surah-by-surah audio from the CDN info file.
  let reciters = [];
  try {
    console.log('Fetching available surah reciters from CDN info...');
    const response = await fetch('https://raw.githubusercontent.com/islamic-network/cdn/master/info/cdn_surah_audio.json');
    cdnInfo = await response.json(); // Store for later use
    
    reciters = Object.keys(cdnInfo).map(identifier => {
      const reciterInfo = cdnInfo[identifier];
      return {
        id: identifier,
        name: reciterInfo.englishName || reciterInfo.name
      };
    });
    
    console.log(`Found ${reciters.length} surah reciters.`);

  } catch (error) {
    console.error('Failed to fetch reciters from CDN info:', error);
  }
  
  // Fallback to known working reciters if API fails or returns no reciters
  if (reciters.length === 0) {
    console.log('Using fallback reciters...');
    reciters = [
      { id: 'ar.alafasy', name: 'Mishary Rashid Alafasy' },
      { id: 'ar.abdulbasitmurattal', name: 'Abdul Basit Abdul Samad' },
      { id: 'ar.sudais', name: 'Abdurrahman As-Sudais' },
      { id: 'ar.husarymuallim', name: 'Mahmoud Khalil Al-Hussary (Teaching)' }
    ];
    // Populate cdnInfo with fallback data if it's empty
    if (Object.keys(cdnInfo).length === 0) {
        cdnInfo = {
            'ar.alafasy': { bitrates: ['128', '64'] },
            'ar.abdulbasitmurattal': { bitrates: ['192', '128', '64'] },
            'ar.sudais': { bitrates: ['128'] },
            'ar.husarymuallim': { bitrates: ['128'] }
        };
    }
  }

  const suraSelect = document.getElementById('sura-select');
  const reciterSelect = document.getElementById('reciter-select');
  
  suras.forEach(sura => {
    const option = document.createElement('option');
    option.value = sura.id;
    option.textContent = `${sura.id}. ${sura.name}`;
    suraSelect.appendChild(option);
  });
  
  reciters.forEach(reciter => {
    const option = document.createElement('option');
    option.value = reciter.id;
    option.textContent = reciter.name;
    reciterSelect.appendChild(option);
  });
  
  [suraSelect, reciterSelect].forEach(select => {
    select.addEventListener('change', () => {
      const playButton = document.getElementById('play-quran');
      playButton.disabled = !suraSelect.value || !reciterSelect.value;
    });
  });
}

async function playQuranAudio(suraId, reciterKey) {
  const loadingEl = document.getElementById('quran-loading');
  const playButton = document.getElementById('play-quran');
  const pauseButton = document.getElementById('pause-quran');
  
  try {
    loadingEl.style.display = 'block';
    playButton.disabled = true;
    
    console.log(`Starting playback: Sura ${suraId}, Reciter ${reciterKey}`);
    
    let availableBitrates = [128, 64, 192];
    if (cdnInfo[reciterKey] && cdnInfo[reciterKey].bitrates) {
      availableBitrates = cdnInfo[reciterKey].bitrates.map(b => parseInt(b));
      console.log(`Available bitrates for ${reciterKey} from cache:`, availableBitrates);
    } else {
      console.log(`Reciter ${reciterKey} not found in CDN info cache, using default bitrates.`);
    }
    
    let audioUrl = null;
    let workingBitrate = null;
    
    for (const bitrate of availableBitrates) {
      const testUrl = `https://cdn.islamic.network/quran/audio-surah/${bitrate}/${reciterKey}/${suraId}.mp3`;
      console.log(`Testing URL: ${testUrl}`);
      
      try {
        const testResponse = await fetch(testUrl, { method: 'HEAD' });
        console.log(`Response status for ${bitrate}kbps: ${testResponse.status}`);
        
        if (testResponse.ok) {
          audioUrl = testUrl;
          workingBitrate = bitrate;
          console.log(`Found working audio URL: ${audioUrl}`);
          break;
        }
      } catch (fetchError) {
        console.log(`Failed to test ${bitrate}kbps: ${fetchError.message}`);
      }
    }
    
    if (!audioUrl) {
      throw new Error(`The selected audio file is not available on the server (404). Please try a different reciter or sura.`);
    }
    
    console.log(`Using ${workingBitrate}kbps audio: ${audioUrl}`);
    
    console.log('Sending "playAudio" message to background script...');
    const response = await chrome.runtime.sendMessage({
      action: 'playAudio',
      audioUrl: audioUrl,
      suraId: suraId,
      reciterKey: reciterKey
    });
    
    console.log('Response from background script:', response);
    
    if (response && response.success) {
      await new Promise(resolve => setTimeout(resolve, 500)); // Give time for audio to start
      
      playButton.textContent = '⏸ Playing';
      playButton.disabled = false;
      pauseButton.disabled = false;
      pauseButton.style.display = 'block';
      document.getElementById('progress-container').style.display = 'block';
      
      startProgressTracking();
      console.log('Audio playback started successfully');
    } else {
      throw new Error(`Failed to start audio playback: ${response?.error || 'Unknown error from background script'}`);
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
      const reciterKey = document.getElementById('reciter-select').value;
      
      if (suraId && reciterKey) {
        await playQuranAudio(suraId, reciterKey);
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
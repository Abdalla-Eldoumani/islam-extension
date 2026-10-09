// Surah audio URL for a catalogue entry (see reciter-catalogue.js). Keys look
// like "qc:7", "mp3:228" or "islamic:ar.alafasy".

const CHAPTER_RECITATIONS = 'https://api.quran.com/api/v4/chapter_recitations';
const SURAH_AUDIO_BASE = 'https://cdn.islamic.network/quran/audio-surah';

// The manifests' media-src lists the same hosts. A URL from any API response
// must resolve to one of them before it reaches an audio element.
const ALLOWED_MEDIA_HOSTS = new Set(['download.quranicaudio.com', 'cdn.islamic.network']);

export function isAllowedAudioHost(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    return ALLOWED_MEDIA_HOSTS.has(u.hostname) || u.hostname.endsWith('.mp3quran.net');
  } catch (_) {
    return false;
  }
}

export function ensureAllowedAudioHost(url) {
  if (!isAllowedAudioHost(url)) {
    throw new Error('Audio source unavailable for this combination');
  }
  return url;
}

export function hasSurah(reciter, suraId) {
  const n = Number(suraId);
  if (!Number.isInteger(n) || n < 1 || n > 114) return false;
  return !reciter?.surahs || reciter.surahs.includes(n);
}

// The next surah this reciter has recorded, wrapping from 114 to 1.
export function getNextSuraId(currentSuraId, reciter = null) {
  let n = Number(currentSuraId);
  for (let i = 0; i < 114; i++) {
    n = n >= 114 ? 1 : n + 1;
    if (hasSurah(reciter, n)) return String(n);
  }
  return null;
}

export async function getSuraAudioUrl(reciter, suraId) {
  if (!reciter) throw new Error('Reciter not found in catalogue');
  if (!hasSurah(reciter, suraId)) throw new Error('Surah not recorded by this reciter');
  const n = Number(suraId);
  const [provider, ...rest] = reciter.id.split(':');
  const rawId = rest.join(':');

  if (provider === 'mp3') {
    return ensureAllowedAudioHost(`${reciter.server}${String(n).padStart(3, '0')}.mp3`);
  }
  if (provider === 'islamic') {
    return ensureAllowedAudioHost(`${SURAH_AUDIO_BASE}/${reciter.bitrate}/${rawId}/${n}.mp3`);
  }
  if (provider === 'qc') {
    const res = await fetch(`${CHAPTER_RECITATIONS}/${rawId}/${n}`);
    if (!res.ok) throw new Error(`Quran.com returned ${res.status}`);
    const audioUrl = (await res.json()).audio_file?.audio_url;
    return ensureAllowedAudioHost(audioUrl);
  }
  throw new Error(`Unknown provider: ${provider}`);
}

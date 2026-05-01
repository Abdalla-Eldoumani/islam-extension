// Surah audio URL resolution across the three providers we support:
// Quran.com (qc), MP3Quran (mp3), and Islamic.network (islamic).
// The reciter key carries provider + raw id like "qc:7" or "mp3:228" or
// "islamic:ar.alafasy". A bare numeric key defaults to Quran.com.

const QURAN_COM_API = 'https://api.quran.com/api/v4';
const VERSES_BASE = 'https://verses.quran.com';
const ISLAMIC_NETWORK_BASE = 'https://cdn.islamic.network/quran/audio/128';

export function parseReciterKey(reciterKey) {
  if (reciterKey.includes(':')) {
    const parts = reciterKey.split(':');
    return { provider: parts[0], rawId: parts.slice(1).join(':') };
  }
  return { provider: 'qc', rawId: reciterKey };
}

export function getNextSuraId(currentSuraId) {
  const id = parseInt(currentSuraId, 10);
  return id >= 114 ? '1' : String(id + 1);
}

// Caller passes a `resolveMp3Reciter(reciterKey, rawId)` returning the reciter
// object (or null). The popup resolves from its in-memory catalogue; the
// background resolves via API on each invocation.
export async function getSuraAudioUrl(reciterKey, suraId, { resolveMp3Reciter } = {}) {
  const { provider, rawId } = parseReciterKey(reciterKey);

  if (provider === 'mp3') {
    if (!resolveMp3Reciter) {
      throw new Error('mp3 provider requires resolveMp3Reciter');
    }
    const reciter = await resolveMp3Reciter(reciterKey, rawId);
    if (!reciter) throw new Error('Reciter not found in catalogue');
    const server = reciter.server || reciter.Server;
    if (!server) throw new Error('Reciter entry missing server URL');
    const base = server.endsWith('/') ? server : server + '/';
    const suraStr = String(suraId).padStart(3, '0');
    return `${base}${suraStr}.mp3`;
  }

  if (provider === 'islamic') {
    return `${ISLAMIC_NETWORK_BASE}/${rawId}/${suraId}.mp3`;
  }

  // Default: Quran.com. Try chapter recitations first, fall back to first
  // verse-by-verse audio file.
  const reciterId = rawId;
  const chapterUrl = `${QURAN_COM_API}/chapter_recitations/${reciterId}/${suraId}`;
  try {
    const chapterResponse = await fetch(chapterUrl);
    if (chapterResponse.ok) {
      const chapterData = await chapterResponse.json();
      if (chapterData.audio_file?.audio_url) {
        const audioUrl = chapterData.audio_file.audio_url;
        return audioUrl.startsWith('http') ? audioUrl : `${VERSES_BASE}/${audioUrl}`;
      }
    }
  } catch (_) {
    // fall through to verse-by-verse
  }

  const versesUrl = `${QURAN_COM_API}/recitations/${reciterId}/by_chapter/${suraId}`;
  const response = await fetch(versesUrl);
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
  }
  const data = await response.json();
  if (!data.audio_files || data.audio_files.length === 0) {
    throw new Error('No audio files found in API response.');
  }
  const firstAudio = data.audio_files[0];
  const audioUrl = firstAudio.url || firstAudio.audio_url;
  if (!audioUrl) throw new Error('Audio URL not found in API response.');
  if (audioUrl.startsWith('//')) return `https:${audioUrl}`;
  if (audioUrl.startsWith('http')) return audioUrl;
  return `${VERSES_BASE}/${audioUrl}`;
}

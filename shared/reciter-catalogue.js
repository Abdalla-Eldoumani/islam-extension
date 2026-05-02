// Reciter catalogue across four providers. The orchestrator returns a single
// deduplicated, sorted list. Caller is responsible for caching the result if
// desired (the popup writes to chrome.storage.local; the background fetches
// fresh as needed).

export async function fetchQuranComReciters() {
  const url = 'https://api.quran.com/api/v4/resources/recitations?per_page=500';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Quran.com recitations request failed');
  const { recitations } = await res.json();
  return recitations.map((r) => ({
    id: `qc:${r.id}`,
    reciter_name: r.reciter_name,
    style: r.style || 'Default',
    source: 'qurancom',
    qurancomId: r.id,
    bitrate: 128
  }));
}

export async function fetchMp3QuranReciters() {
  const url = 'https://www.mp3quran.net/api/_english.json';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.reciters)) return [];

    return data.reciters.map((r) => ({
      id: `mp3:${r.id}`,
      reciter_name: r.name,
      style: r.rewaya || 'Default',
      source: 'mp3quran',
      server: r.Server.endsWith('/') ? r.Server : r.Server + '/',
      bitrate: 128,
      mp3quranId: r.id
    }));
  } catch (err) {
    return [];
  }
}

export async function fetchIslamicNetworkReciters() {
  const slugs = ['ar.alafasy', 'ar.husary', 'ar.shuraym', 'ar.tablawee'];
  return slugs.map((slug) => {
    const prettyName = slug.split('.')[1].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      id: `islamic:${slug}`,
      reciter_name: prettyName,
      style: 'Default',
      source: 'islamic',
      slug,
      bitrate: 128
    };
  });
}

// Al-Quran Cloud curates audio editions, most pointing at cdn.islamic.network
// with the same slug-shaped identifier. The slug becomes the reciter
// identifier; getSuraAudioUrl already handles `islamic:<slug>` keys.
export async function fetchAlquranCloudReciters() {
  const url = 'https://api.alquran.cloud/v1/edition/format/audio';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json?.data)) return [];

    return json.data
      .filter((e) => e.format === 'audio' && typeof e.identifier === 'string')
      .map((e) => ({
        id: `islamic:${e.identifier}`,
        reciter_name: e.englishName || e.name || e.identifier,
        style: e.type === 'translation' ? 'Translation' : 'Default',
        source: 'alquran-cloud',
        slug: e.identifier,
        language: e.language || 'ar',
        bitrate: 128
      }));
  } catch (_) {
    return [];
  }
}

export async function fetchReciters() {
  const combined = (await Promise.all([
    fetchQuranComReciters(),
    fetchMp3QuranReciters(),
    fetchIslamicNetworkReciters()
  ])).flat();

  const dedupedMap = new Map();
  combined.forEach((r) => {
    const key = `${r.reciter_name.toLowerCase()}|${(r.style || '').toLowerCase()}`;
    if (!dedupedMap.has(key)) {
      dedupedMap.set(key, { ...r, altIds: [] });
    } else {
      dedupedMap.get(key).altIds.push(r.id);
    }
  });

  const deduped = Array.from(dedupedMap.values());
  return deduped.sort((a, b) => a.reciter_name.localeCompare(b.reciter_name));
}

// Reciter catalogue from three providers, limited to recordings of whole
// surahs. Each entry carries what audio-urls.js needs to build a URL, so no
// provider is asked again at play time except Quran.com.

import { browser } from './browser.js';

const QURAN_COM_RECITERS = 'https://api.quran.com/api/qdc/audio/reciters?locale=en';
const MP3QURAN_RECITERS = 'https://www.mp3quran.net/api/_english.json';
const ALQURAN_CLOUD_EDITIONS = 'https://api.alquran.cloud/v1/edition/format/audio';
// Directory listing of the CDN's audio-surah/<bitrate>/<edition>/<n>.mp3 files.
const SURAH_AUDIO_INDEX = 'https://cdn.islamic.network/quran/info/by-surah/info.json';

const CACHE_KEY = 'reciterCatalog';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// Quran.com's chapter-reciter list: these ids are the ones
// /chapter_recitations/{id}/{surah} accepts.
export async function fetchQuranComReciters() {
  const { reciters } = await getJson(QURAN_COM_RECITERS);
  return reciters.map((r) => ({
    id: `qc:${r.id}`,
    reciter_name: r.translated_name?.name || r.name,
    style: r.style?.name || '',
    source: 'qurancom'
  }));
}

// surahs is null when every surah is recorded, otherwise the sorted list.
export function parseSurahList(value) {
  const numbers = [...new Set(String(value || '').split(',').map(Number))]
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 114)
    .sort((a, b) => a - b);
  return numbers.length === 114 ? null : numbers;
}

export async function fetchMp3QuranReciters() {
  const data = await getJson(MP3QURAN_RECITERS);
  return (data.reciters || [])
    .filter((r) => typeof r.Server === 'string' && r.Server.startsWith('https://'))
    .map((r) => ({
      id: `mp3:${r.id}`,
      reciter_name: r.name,
      style: r.rewaya || '',
      source: 'mp3quran',
      server: r.Server.endsWith('/') ? r.Server : `${r.Server}/`,
      surahs: parseSurahList(r.suras)
    }))
    .filter((r) => r.surahs === null || r.surahs.length > 0);
}

// Maps edition identifier to bitrate for every edition with all 114 files,
// taking the highest bitrate when an edition is listed under several.
export function surahAudioBitrates(listing) {
  const root = Array.isArray(listing) ? listing.find((node) => node.type === 'directory') : null;
  const bitrates = new Map();
  for (const rate of root?.contents || []) {
    if (!/^\d+$/.test(rate.name)) continue;
    for (const edition of rate.contents || []) {
      const files = (edition.contents || []).filter((f) => /^\d+\.mp3$/.test(f.name));
      const bitrate = Number(rate.name);
      if (files.length === 114 && (bitrates.get(edition.name) || 0) < bitrate) bitrates.set(edition.name, bitrate);
    }
  }
  return bitrates;
}

// Al-Quran Cloud lists many verse-by-verse editions; only the ones the CDN
// serves as whole surahs are offered.
export async function fetchAlquranCloudReciters() {
  const [editions, listing] = await Promise.all([
    getJson(ALQURAN_CLOUD_EDITIONS),
    getJson(SURAH_AUDIO_INDEX)
  ]);
  const bitrates = surahAudioBitrates(listing);
  return (editions.data || [])
    .filter((e) => e.format === 'audio' && bitrates.has(e.identifier))
    .map((e) => ({
      id: `islamic:${e.identifier}`,
      reciter_name: e.englishName || e.identifier,
      style: '',
      source: 'alquran-cloud',
      bitrate: bitrates.get(e.identifier)
    }));
}

export async function fetchReciters() {
  // One failing provider must not empty the whole catalogue.
  const settled = await Promise.allSettled([
    fetchQuranComReciters(),
    fetchMp3QuranReciters(),
    fetchAlquranCloudReciters()
  ]);
  const deduped = new Map();
  for (const r of settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []))) {
    const key = `${r.reciter_name.toLowerCase()}|${r.style.toLowerCase()}`;
    if (deduped.has(key)) deduped.get(key).altIds.push(r.id);
    else deduped.set(key, { ...r, altIds: [] });
  }
  return [...deduped.values()].sort((a, b) => a.reciter_name.localeCompare(b.reciter_name));
}

// Shared by the popup and the background: a fresh cached copy when there is
// one, otherwise a new fetch. An empty result is never cached. With
// allowStale the background can resolve a reciter offline from an old copy.
export async function loadReciters({ allowStale = false } = {}) {
  const { [CACHE_KEY]: cached } = await browser.storage.local.get(CACHE_KEY);
  const usable = Array.isArray(cached?.reciters) && cached.reciters.length > 0;
  if (usable && (allowStale || Date.now() - cached.timestamp < CACHE_TTL_MS)) return cached.reciters;
  const reciters = await fetchReciters();
  if (reciters.length > 0) {
    await browser.storage.local.set({ [CACHE_KEY]: { reciters, timestamp: Date.now() } });
    return reciters;
  }
  return usable ? cached.reciters : [];
}

export function findReciter(reciters, key) {
  return reciters.find((r) => r.id === key || r.altIds?.includes(key)) || null;
}

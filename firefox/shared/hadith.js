// Hadith fetchers for the three locales. Caching, cache key choice, and
// language switching live in the caller (popup.js) since they touch
// chrome.storage.local. This module only knows how to fetch one random
// hadith and return its text. Religious content; do not modify the
// returned strings beyond the existing length-truncation step.

export const AR_BOOKS = [
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

export const EN_EDITIONS = [
  { edition: 'eng-bukhari', count: 6638 },
  { edition: 'eng-muslim', count: 4930 },
  { edition: 'eng-abudawud', count: 4419 },
  { edition: 'eng-nasai', count: 5364 },
  { edition: 'eng-ibnmajah', count: 4285 },
  { edition: 'eng-tirmidhi', count: 3625 },
  { edition: 'eng-malik', count: 1587 }
];

export const FR_EDITIONS = [
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

// Pinned to the @1 release tag today; Phase C item 1 swaps this for a commit
// SHA once we record the upstream commit we trust.
const JSDELIVR_HADITH_BASE = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions';
const HADEETHENC_BASE = 'https://hadeethenc.com/api/v1/hadeeths/one';
const GADING_BASE = 'https://api.hadith.gading.dev/books';

export async function fetchRandomArabicHadith() {
  const picked = AR_BOOKS[Math.floor(Math.random() * AR_BOOKS.length)];
  const rand = Math.floor(Math.random() * picked.available) + 1;
  const res = await fetch(`${GADING_BASE}/${picked.id}?range=${rand}-${rand}`);
  if (!res.ok) throw new Error('Hadith API failed');
  const data = await res.json();
  return data?.data?.hadiths?.[0]?.arab || data?.data?.hadiths?.[0]?.id || '';
}

export async function fetchRandomEnglishHadith() {
  for (let i = 0; i < 6; i++) {
    const pick = EN_EDITIONS[Math.floor(Math.random() * EN_EDITIONS.length)];
    const num = Math.floor(Math.random() * pick.count) + 1;
    const url = `${JSDELIVR_HADITH_BASE}/${pick.edition}/${num}.min.json`;
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
      const res = await fetch(`${HADEETHENC_BASE}/?language=en&id=${randomId}`);
      if (res.ok) {
        const data = await res.json();
        const txt = data?.hadeeth || data?.title;
        if (txt) return txt;
      }
    } catch (_) {}
  }

  return '';
}

// Pre-verified French citations used as the last-resort fallback if every
// network source fails. Religious content; do not modify.
const FRENCH_FALLBACK_HADITHS = [
  "Rapporté par 'Umar ibn Al-Khattab : J'ai entendu le Messager d'Allah (ﷺ) dire : « Les actions ne valent que par les intentions, et chacun n'obtient que ce qu'il a eu l'intention de faire... »",
  "Rapporté par 'A'ishah : Le Prophète (ﷺ) a dit : « Celui qui innove dans notre religion une chose qui n'en fait pas partie, cette chose sera rejetée. »",
  "Rapporté par Abu Hurairah : Le Messager d'Allah (ﷺ) a dit : « Un croyant fort est meilleur et plus aimé d'Allah qu'un croyant faible, bien qu'il y ait du bien dans les deux... »"
];

export async function fetchRandomFrenchHadith() {
  for (let i = 0; i < 6; i++) {
    const pick = FR_EDITIONS[Math.floor(Math.random() * FR_EDITIONS.length)];
    const num = Math.floor(Math.random() * pick.count) + 1;
    const url = `${JSDELIVR_HADITH_BASE}/${pick.edition}/${num}.min.json`;
    try {
      const res = await fetch(url, { cache: 'force-cache' });
      if (res.ok) {
        const data = await res.json();
        const text = data.hadiths?.[0]?.text || data.hadith?.french || data.french;
        if (text && text.trim()) {
          return text.length > 500 ? text.substring(0, 497) + '...' : text;
        }
      }
    } catch (_) {}
  }

  return FRENCH_FALLBACK_HADITHS[Math.floor(Math.random() * FRENCH_FALLBACK_HADITHS.length)];
}

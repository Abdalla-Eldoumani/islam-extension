// Random-hadith fetch + cache for the popup, across en/fr/ar. Religious
// content: the fetched hadith text and the upstream editions are read-only.
// This module moves the verses; it never authors, paraphrases, or translates
// them. The collection-name byline is transliterated bibliographic metadata
// derived from the edition slug, not religious text. SHA-pinned jsdelivr
// source (df57907) per SECURITY_AUDIT item 1.

import { browser } from './browser.js';

// Uniform truncation threshold. The popup reveals the full verified text in
// place; truncateHadith only shows less of it, never rewrites it.
const HADITH_TRUNCATE_AT = 800;

// Markup/length bound for any third-party hadith string before it reaches the
// DOM. Mirrors the inline Arabic guard the popup used; exported so every path
// (en/fr/ar, cache or live) validates identically.
const HADITH_MAX_LENGTH = 4096;

// Bibliographic metadata (collection names), not religious text. Keyed off the
// language-agnostic edition suffix so one map serves eng-/fra-/ara- prefixes.
// A slug with no entry here yields no byline — the run never invents a
// collection name. Covers exactly the editions the fetchers select.
export const HADITH_SOURCE_NAMES = {
  bukhari: 'Sahih al-Bukhari',
  muslim: 'Sahih Muslim',
  abudawud: 'Sunan Abi Dawud',
  nasai: "Sunan an-Nasa'i",
  ibnmajah: 'Sunan Ibn Majah',
  tirmidhi: 'Jami` at-Tirmidhi',
  malik: 'Muwatta Malik',
  nawawi: "Al-Arba'in an-Nawawiyyah",
  qudsi: 'Al-Ahadith al-Qudsiyyah',
  dehlawi: 'Al-Arba`in of Shah Wali Allah al-Dihlawi'
};

// Resolve an edition slug to its transliterated collection name, or null so
// the caller omits the byline. Derives the suffix from the last '-' segment
// ('eng-bukhari' -> 'bukhari'); a miss returns null and never guesses.
export function sourceNameForEdition(edition) {
  const suffix = String(edition || '').split('-').pop();
  return HADITH_SOURCE_NAMES[suffix] || null;
}

// Shorten already-fetched verified text for display. Returns the untouched
// full text alongside a word-boundary-cut short form with a trailing ellipsis.
// A string at-or-under the threshold (or any non-string) is returned as-is,
// with short === full. Never edits the source text.
export function truncateHadith(text) {
  if (typeof text !== 'string' || text.length <= HADITH_TRUNCATE_AT) {
    return { truncated: false, short: text, full: text };
  }
  let cut = text.lastIndexOf(' ', HADITH_TRUNCATE_AT);
  if (cut <= 0) cut = HADITH_TRUNCATE_AT;
  return { truncated: true, short: text.slice(0, cut).trimEnd() + '…', full: text };
}

// Cache-poison gate. Validates the stored entry's SHAPE only; it never reads
// or rewrites hadith wording. Accepts a legacy non-empty bare string (the old
// string[] cache) and a { text: 'non-empty' } object; rejects everything else
// so an in-place upgrade does not nuke an existing user cache.
export function isUsableHadithEntry(entry) {
  if (typeof entry === 'string') return entry.trim().length > 0;
  return !!entry && typeof entry.text === 'string' && entry.text.trim().length > 0;
}

// Reject markup-shaped or out-of-bounds third-party text before it renders.
// Accepts ordinary non-empty strings within the length bound. This is a
// structural guard, not a content judgement.
export function isSafeHadithText(text) {
  return typeof text === 'string'
    && text.length > 0
    && text.length <= HADITH_MAX_LENGTH
    && !/<script|<iframe|<object|<embed/i.test(text);
}

// --- Fetch + cache -------------------------------------------------------
//
// The fetch bodies below are moved verbatim from the two popup twins: the
// SHA-pinned jsdelivr URL, cache:'force-cache', the per-language edition
// lists, the hadeethenc.com English fallback, and the hardcoded French
// fallback strings are all read-only religious content and are carried over
// unchanged. The only intentional differences from the inline originals are:
//   1. each fetcher returns { text, edition } instead of a bare string so the
//      byline has the source the fetcher already selected; and
//   2. the old French-only 500-char cut is removed — truncation is now uniform
//      via truncateHadith in the popup render path.

// SHA-pinned source (df57907) — do NOT loosen to a moving tag/branch. A moving
// ref could let a compromised upstream serve altered hadith text.
const HADITH_PIN = 'df57907be35291c91ad6a6691180e22ca9920784';
const TARGET_CACHE_SIZE = 30;
const CACHE_KEY_EN = 'hadithCacheEn';
const CACHE_KEY_FR = 'hadithCacheFr';

function jsdelivrUrl(edition, num) {
  return `https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@${HADITH_PIN}/editions/${edition}/${num}.min.json`;
}

// Fetch a single random Arabic hadith. Returns { text, edition } or
// { text: '', edition: null } when every attempt fails. Arabic is fetched
// live and never cached.
export async function fetchRandomArabicHadith() {
  const AR_EDITIONS = [
    { edition: 'ara-bukhari', count: 6638 },
    { edition: 'ara-muslim', count: 4930 },
    { edition: 'ara-abudawud', count: 4419 },
    { edition: 'ara-nasai', count: 5364 },
    { edition: 'ara-ibnmajah', count: 4285 },
    { edition: 'ara-tirmidhi', count: 3625 },
    { edition: 'ara-malik', count: 1587 }
  ];

  for (let i = 0; i < 6; i++) {
    const pick = AR_EDITIONS[Math.floor(Math.random() * AR_EDITIONS.length)];
    const num = Math.floor(Math.random() * pick.count) + 1;
    const url = jsdelivrUrl(pick.edition, num);
    try {
      const res = await fetch(url, { cache: 'force-cache' });
      if (res.ok) {
        const data = await res.json();
        const text = data.hadiths?.[0]?.text;
        if (text) return { text, edition: pick.edition };
      }
    } catch (_) {}
  }

  return { text: '', edition: null };
}

// Fetch a single random English hadith. Tries the fast SHA-pinned jsdelivr
// editions first, then falls back to hadeethenc.com. Returns { text, edition }
// (edition is null for the hadeethenc fallback, which has no edition slug).
export async function fetchRandomEnglishHadith() {
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
    const url = jsdelivrUrl(pick.edition, num);
    try {
      const res = await fetch(url, { cache: 'force-cache' });
      if (res.ok) {
        const data = await res.json();
        const text = data.hadiths?.[0]?.text;
        if (text) return { text, edition: pick.edition };
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
        if (txt) return { text: txt, edition: null };
      }
    } catch (_) {}
  }

  return { text: '', edition: null };
}

// Fetch a single random French hadith. Tries the SHA-pinned jsdelivr editions,
// then a hardcoded French fallback. Returns { text, edition } (edition is null
// for the fallback strings, which carry no edition slug). The full untruncated
// text is returned — uniform truncation happens later via truncateHadith.
export async function fetchRandomFrenchHadith() {
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
    const url = jsdelivrUrl(pick.edition, num);
    try {
      const res = await fetch(url, { cache: 'force-cache' });
      if (res.ok) {
        const data = await res.json();
        const text = data.hadiths?.[0]?.text || data.hadith?.french || data.french;
        if (text && text.trim()) {
          return { text, edition: pick.edition };
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

  return { text: fallbackHadiths[Math.floor(Math.random() * fallbackHadiths.length)], edition: null };
}

// Normalize a cached entry (legacy bare string or { text, edition } object)
// into a { text, edition } pair. Legacy strings have no edition, so the byline
// is omitted for them — we never invent a collection name.
function readCacheEntry(entry) {
  if (typeof entry === 'string') return { text: entry, edition: null };
  return { text: entry.text, edition: entry.edition || null };
}

// Cached en/fr path: read the matching cache key, validate its shape, clear and
// refetch on corruption, serve the head entry, then asynchronously top the
// cache back up to TARGET_CACHE_SIZE. Returns { text, edition }.
async function getCachedHadith(cacheKey, fetcher) {
  let { [cacheKey]: cacheArr } = await browser.storage.local.get(cacheKey);

  // HADITH-04 cache-poison gate: a non-array, or any entry that fails the
  // shape check, is corrupt. Clear the whole key and fall through to a network
  // fetch instead of rendering a poisoned entry. Validation happens on read,
  // before the shifted entry is used.
  if (!Array.isArray(cacheArr) || cacheArr.some(e => !isUsableHadithEntry(e))) {
    await browser.storage.local.remove(cacheKey);
    cacheArr = [];
  }

  let result = null;
  let served = false;
  if (cacheArr.length > 0) {
    result = readCacheEntry(cacheArr.shift());
    // The shifted entry leaves the on-disk array stale, but we do NOT write
    // here. Exactly one writer owns the cache key per call (the refill block
    // below, or the single trim-only write if no refill is needed) so two
    // concurrent storage.local.set calls can never race on the same key.
    served = true;
  }

  if (!result || !result.text) {
    result = await fetcher();
  }

  // Single writer for the cache key. Refill from the already-shifted cacheArr
  // when it ran below threshold; otherwise persist the trimmed array once if we
  // served an entry. Either way the key is written at most once per call.
  if (cacheArr.length < TARGET_CACHE_SIZE - 5) {
    (async () => {
      try {
        const newOnes = [];
        // Keep fetching until the cache reaches TARGET_CACHE_SIZE or an attempt
        // yields no text. Counting successful pushes (not a fixed `needed`
        // derived up front) means a fetcher that returns empty mid-loop does
        // not leave the cache silently below target with a miscounted budget.
        let attempts = 0;
        const MAX_ATTEMPTS = TARGET_CACHE_SIZE * 2;
        while (cacheArr.length + newOnes.length < TARGET_CACHE_SIZE && attempts < MAX_ATTEMPTS) {
          attempts++;
          const h = await fetcher();
          if (h && h.text) newOnes.push(h);
          else break;
        }
        const updated = cacheArr.concat(newOnes);
        await browser.storage.local.set({ [cacheKey]: updated });
      } catch (err) {
        console.warn('Failed to refill hadith cache:', err);
      }
    })();
  } else if (served) {
    // No refill needed, but an entry was shifted: persist the trimmed array
    // exactly once. Not awaited to avoid UI delay; it is the only write.
    browser.storage.local.set({ [cacheKey]: cacheArr }).catch(console.error);
  }

  return result;
}

// Single entry point for the popup. Returns { text, source } where source is
// the transliterated collection name for the byline (null => omit). The popup
// owns the DOM writes and the localized error fallback; this module only
// returns data. Cache poisoning is an expected degrade (clear + refetch),
// never a throw.
export async function getHadithForLang(lang) {
  if (lang === 'ar') {
    const { text, edition } = await fetchRandomArabicHadith();
    const safe = isSafeHadithText(text) ? text : '';
    return { text: safe, source: sourceNameForEdition(edition) };
  }

  const cacheKey = lang === 'fr' ? CACHE_KEY_FR : CACHE_KEY_EN;
  const fetcher = lang === 'fr' ? fetchRandomFrenchHadith : fetchRandomEnglishHadith;
  const { text, edition } = await getCachedHadith(cacheKey, fetcher);
  // Validate the en/fr text identically to the Arabic branch above: an unsafe
  // or over-length string drives the popup's localized error fallback rather
  // than reaching the DOM. This is the "every path validates identically"
  // contract from the module header (markup/length guard, not content edit).
  const safe = isSafeHadithText(text) ? text : '';
  return { text: safe, source: sourceNameForEdition(edition) };
}

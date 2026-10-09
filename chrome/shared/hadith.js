// Random hadith from Sahih al-Bukhari and Sahih Muslim in the popup's
// language, read from the fawazahmed0/hadith-api dataset at one pinned
// commit. Religious content: the text is shown exactly as fetched.

import { browser } from './browser.js';

// A moving branch or tag could let a compromised upstream serve altered text.
const HADITH_PIN = 'df57907be35291c91ad6a6691180e22ca9920784';
const COLLECTIONS = ['bukhari', 'muslim'];
// Both editions number their entries 1 to 7563 in the dataset's own order.
const LAST_ENTRY = 7563;
const EDITION_PREFIX = { en: 'eng', fr: 'fra', ar: 'ara' };
const CACHE_KEYS = { en: 'hadithCacheEn', fr: 'hadithCacheFr', ar: 'hadithCacheAr' };
const TARGET_CACHE_SIZE = 30;
const MAX_ATTEMPTS = 8;
const HADITH_TRUNCATE_AT = 800;
const HADITH_MAX_LENGTH = 4096;

function editionUrl(edition, entry) {
  return `https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@${HADITH_PIN}/editions/${edition}/${entry}.min.json`;
}

// Cuts long text at a word boundary for display; the full text stays available.
export function truncateHadith(text) {
  if (typeof text !== 'string' || text.length <= HADITH_TRUNCATE_AT) {
    return { truncated: false, short: text, full: text };
  }
  let cut = text.lastIndexOf(' ', HADITH_TRUNCATE_AT);
  if (cut <= 0) cut = HADITH_TRUNCATE_AT;
  return { truncated: true, short: text.slice(0, cut).trimEnd() + '…', full: text };
}

// Structural guard on third-party text before it reaches the DOM.
export function isSafeHadithText(text) {
  return typeof text === 'string'
    && text.trim().length > 0
    && text.length <= HADITH_MAX_LENGTH
    && !/<script|<iframe|<object|<embed/i.test(text);
}

// sunnah.com numbers Bukhari as the dataset does. For Muslim it follows the
// dataset's arabicnumber: 408 stays 408 and 2708.01 becomes 2708a. Higher
// decimals are mostly chain-only follow-ups, and entries without an
// arabicnumber are the introduction, so both are skipped.
export function sunnahNumber(collection, entry) {
  if (collection === 'bukhari') {
    return Number.isInteger(entry?.hadithnumber) ? String(entry.hadithnumber) : null;
  }
  if (collection === 'muslim') {
    const match = /^(\d+)(\.01)?$/.exec(String(entry?.arabicnumber ?? ''));
    return match ? match[1] + (match[2] ? 'a' : '') : null;
  }
  return null;
}

// Cache entries come from storage, so their shape is checked on every read.
export function isUsableHadith(hadith) {
  return !!hadith
    && isSafeHadithText(hadith.text)
    && COLLECTIONS.includes(hadith.collection)
    && /^\d+a?$/.test(String(hadith.number));
}

export async function fetchRandomHadith(lang) {
  const prefix = EDITION_PREFIX[lang] || EDITION_PREFIX.en;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const collection = COLLECTIONS[Math.floor(Math.random() * COLLECTIONS.length)];
    const entryNumber = 1 + Math.floor(Math.random() * LAST_ENTRY);
    try {
      const res = await fetch(editionUrl(`${prefix}-${collection}`, entryNumber), { cache: 'force-cache' });
      if (!res.ok) continue;
      const entry = (await res.json()).hadiths?.[0];
      const hadith = { text: entry?.text, collection, number: sunnahNumber(collection, entry) };
      if (isUsableHadith(hadith)) return hadith;
    } catch (_) {
      // Network or parse failure: try another entry.
    }
  }
  return null;
}

async function readCache(key) {
  const stored = (await browser.storage.local.get(key))[key];
  return Array.isArray(stored) ? stored.filter(isUsableHadith) : [];
}

async function refillCache(key, lang, needed) {
  const fresh = [];
  for (let i = 0; i < needed; i++) {
    const hadith = await fetchRandomHadith(lang);
    if (!hadith) break;
    fresh.push(hadith);
  }
  const current = await readCache(key);
  await browser.storage.local.set({ [key]: current.concat(fresh).slice(0, TARGET_CACHE_SIZE) });
}

// Serves the next cached hadith (or a live one when the cache is empty) and
// tops the cache up in the background. Returns null when nothing loads.
export async function getHadith(lang) {
  const key = CACHE_KEYS[lang] || CACHE_KEYS.en;
  const cache = await readCache(key);
  const hadith = cache.shift() || await fetchRandomHadith(lang);
  await browser.storage.local.set({ [key]: cache });
  if (cache.length < TARGET_CACHE_SIZE - 5) {
    refillCache(key, lang, TARGET_CACHE_SIZE - cache.length).catch(() => {});
  }
  return hadith;
}

// Display label and link for a cited source: a sunnah.com hadith
// ({ collection, number }) or Qur'an verses ({ quran: '20:25-26' }).

import { translate } from './i18n.js';

const COLLECTION_KEYS = {
  bukhari: 'collectionBukhari',
  muslim: 'collectionMuslim',
  abudawud: 'collectionAbudawud',
  tirmidhi: 'collectionTirmidhi',
  ibnmajah: 'collectionIbnmajah'
};

export function sourceLabel(source, lang) {
  if (source.quran) return translate(lang, 'quranRef', { ref: source.quran });
  return `${translate(lang, COLLECTION_KEYS[source.collection])} ${source.number}`;
}

export function sourceUrl(source) {
  if (source.quran) return `https://quran.com/${source.quran.replace(':', '/')}`;
  return `https://sunnah.com/${source.collection}:${source.number}`;
}

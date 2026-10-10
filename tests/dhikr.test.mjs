import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dhikrCollection, randomDhikrIndex, virtueFor, SHAHADA } from '../shared/dhikr.js';
import { sourceLabel, sourceUrl } from '../shared/sources.js';

// Structure only: these tests never compare or reproduce the religious text.

const COLLECTIONS = ['bukhari', 'muslim', 'abudawud', 'tirmidhi', 'ibnmajah'];
const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;

test('every dhikr has arabic, transliteration and english text', () => {
  assert.ok(dhikrCollection.length > 0);
  dhikrCollection.forEach((d, i) => {
    assert.ok(nonEmpty(d.arabic), `entry ${i} arabic`);
    assert.ok(nonEmpty(d.transliteration), `entry ${i} transliteration`);
    assert.ok(nonEmpty(d.english), `entry ${i} english`);
  });
});

test('every dhikr names a hadith or a Qur\'an reference with its translation', () => {
  dhikrCollection.forEach((d, i) => {
    const s = d.source;
    if (s?.quran) {
      assert.match(s.quran, /^\d{1,3}:\d{1,3}(-\d{1,3})?$/, `entry ${i} quran ref`);
      assert.equal(s.translation, 'Saheeh International', `entry ${i} translation`);
    } else {
      assert.ok(COLLECTIONS.includes(s?.collection), `entry ${i} collection`);
      assert.match(String(s.number), /^\d+[a-z]?$/, `entry ${i} number`);
    }
  });
});

test('every source renders a label and a quran.com or sunnah.com link', () => {
  for (const d of dhikrCollection) {
    for (const lang of ['en', 'fr', 'ar']) assert.ok(nonEmpty(sourceLabel(d.source, lang)));
    assert.match(sourceUrl(d.source), /^https:\/\/(quran\.com\/\d+\/[\d-]+|sunnah\.com\/[a-z]+:\d+[a-z]?)$/);
  }
});

test('Qur\'an entries carry no virtue line', () => {
  for (const d of dhikrCollection.filter((x) => x.source.quran)) assert.equal(d.virtue, undefined);
});

test('every virtue line has English and Arabic text', () => {
  dhikrCollection.filter((d) => d.virtue).forEach((d) => {
    assert.ok(nonEmpty(d.virtue.en));
    assert.ok(nonEmpty(d.virtue.ar));
    if ('fr' in d.virtue) assert.ok(nonEmpty(d.virtue.fr));
  });
});

test('englishFromSunnah is a true flag and only hadith entries carry it', () => {
  for (const d of dhikrCollection.filter((x) => 'englishFromSunnah' in x)) {
    assert.equal(d.englishFromSunnah, true);
    assert.equal(d.source.quran, undefined);
  }
});

test('virtueFor picks the UI language and falls back to English', () => {
  const both = { virtue: { en: 'e', ar: 'a', fr: 'f', quoted: false } };
  const quoted = { virtue: { en: 'e', ar: 'a', quoted: true } };
  assert.deepEqual(virtueFor(both, 'ar'), { text: 'a', lang: 'ar', quoted: false });
  assert.deepEqual(virtueFor(both, 'fr'), { text: 'f', lang: 'fr', quoted: false });
  assert.deepEqual(virtueFor(quoted, 'fr'), { text: 'e', lang: 'en', quoted: true });
  assert.deepEqual(virtueFor(quoted, 'en'), { text: 'e', lang: 'en', quoted: true });
  assert.equal(virtueFor({}, 'en'), null);
});

test('randomDhikrIndex stays inside the collection', () => {
  for (let i = 0; i < 200; i++) {
    const n = randomDhikrIndex();
    assert.ok(Number.isInteger(n) && n >= 0 && n < dhikrCollection.length);
  }
});

test('the shahada fallback has all three languages', () => {
  for (const lang of ['ar', 'en', 'fr']) assert.ok(nonEmpty(SHAHADA[lang]));
});

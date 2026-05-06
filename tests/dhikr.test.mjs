import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dhikrCollection, getRandomDhikr, DHIKR_REWARD_AR, DHIKR_REWARD_FR } from '../shared/dhikr.js';

test('dhikrCollection is a non-empty array', () => {
  assert.ok(Array.isArray(dhikrCollection));
  assert.ok(dhikrCollection.length >= 10, `expected at least 10 dhikr entries, got ${dhikrCollection.length}`);
});

test('every dhikr entry carries arabic, transliteration, and english fields', () => {
  for (let i = 0; i < dhikrCollection.length; i++) {
    const d = dhikrCollection[i];
    assert.ok(typeof d.arabic === 'string' && d.arabic.length > 0,
      `entry ${i} missing arabic`);
    assert.ok(typeof d.transliteration === 'string' && d.transliteration.length > 0,
      `entry ${i} missing transliteration`);
    assert.ok(typeof d.english === 'string' && d.english.length > 0,
      `entry ${i} missing english`);
  }
});

test('getRandomDhikr returns a member of the collection', () => {
  for (let i = 0; i < 50; i++) {
    const d = getRandomDhikr();
    assert.ok(dhikrCollection.includes(d), 'getRandomDhikr returned a non-member');
  }
});

// The reward translations are religious content authored by the maintainer.
// The test does not assert full parity (the maintainer adds entries as the
// dhikr collection grows). It does report the current coverage so future
// regressions are visible.
test('reward-translation coverage is reported for visibility', () => {
  const rewards = new Set(dhikrCollection.map(d => d.reward).filter(Boolean));
  const missingAr = [];
  const missingFr = [];
  for (const r of rewards) {
    if (!DHIKR_REWARD_AR[r]) missingAr.push(r);
    if (!DHIKR_REWARD_FR[r]) missingFr.push(r);
  }
  // Soft assertion: the test passes but logs gaps so they show up in CI output.
  if (missingAr.length || missingFr.length) {
    console.log(`reward-translation coverage gaps — ar: ${missingAr.length}, fr: ${missingFr.length}`);
    if (missingAr.length) console.log('  ar gaps:', missingAr);
    if (missingFr.length) console.log('  fr gaps:', missingFr);
  }
  // Hard assertion: gaps may not exceed the documented baseline. If the count
  // grows, a new dhikr entry was added without its reward being translated.
  const AR_BASELINE = 6;
  const FR_BASELINE = 0;
  assert.ok(missingAr.length <= AR_BASELINE,
    `ar reward coverage regressed: ${missingAr.length} gaps, baseline ${AR_BASELINE}`);
  assert.ok(missingFr.length <= FR_BASELINE,
    `fr reward coverage regressed: ${missingFr.length} gaps, baseline ${FR_BASELINE}`);
});

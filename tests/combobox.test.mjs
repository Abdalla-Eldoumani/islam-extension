import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isArabicText } from '../shared/combobox.js';

// Religious-content test discipline: every fixture here is synthetic
// non-religious filler built from \u06xx escapes or plain Latin tokens. No
// real reciter name, surah name, dhikr, or Qur'an wording is reproduced.
// isArabicText is a pure Unicode-range predicate; we assert structural
// behaviour only, never the content of any name or verse.

// Synthetic Arabic-script token: three letters from the base Arabic block,
// chosen as arbitrary glyphs, not a word. بتث are isolated
// letters with no meaning as a sequence.
const ARABIC_TOKEN = 'بتث';

test('isArabicText returns true for a synthetic Arabic-script string', () => {
  assert.equal(isArabicText(ARABIC_TOKEN), true);
});

test('isArabicText returns true for a single Arabic letter', () => {
  assert.equal(isArabicText('ف'), true);
});

test('isArabicText returns false for a pure Latin string', () => {
  assert.equal(isArabicText('plain latin filler'), false);
});

test('isArabicText returns false for a digits-only string', () => {
  assert.equal(isArabicText('1234567890'), false);
});

test('isArabicText returns true for a mixed Latin+Arabic string', () => {
  // A Latin word concatenated with the synthetic Arabic token. Any Arabic
  // character anywhere in the string flips the predicate to true.
  assert.equal(isArabicText('reciter ' + ARABIC_TOKEN), true);
  assert.equal(isArabicText(ARABIC_TOKEN + ' 12'), true);
});

test('isArabicText returns false for empty / non-string input', () => {
  for (const bad of ['', null, undefined, 123, {}, []]) {
    assert.equal(isArabicText(bad), false);
  }
});

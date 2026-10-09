import { test } from 'node:test';
import assert from 'node:assert/strict';
import { truncateHadith, isSafeHadithText, sunnahNumber, isUsableHadith } from '../shared/hadith.js';

// Religious-content test discipline: every fixture here is synthetic
// non-religious filler. No real hadith wording is reproduced. The helpers
// under test are display/validation logic only; we assert structural
// invariants, never the content of any verse.

test('truncateHadith leaves a short string untouched', () => {
  const short = 'a short synthetic line';
  const result = truncateHadith(short);
  assert.equal(result.truncated, false);
  assert.equal(result.short, short);
  assert.equal(result.full, short);
  assert.equal(result.short, result.full);
});

test('truncateHadith does not truncate at exactly the 800 boundary', () => {
  const exactly800 = 'x'.repeat(800);
  const result = truncateHadith(exactly800);
  assert.equal(exactly800.length, 800);
  assert.equal(result.truncated, false);
  assert.equal(result.short, exactly800);
  assert.equal(result.full, exactly800);
});

test('truncateHadith truncates a long string on a word boundary with an ellipsis', () => {
  // 'x ' repeated 600 times = 1200 chars, well over the 800 threshold, with
  // spaces every other char so a word boundary always exists at/under 800.
  const long = 'x '.repeat(600);
  const result = truncateHadith(long);
  assert.equal(result.truncated, true);
  // full is the input, byte-for-byte unchanged
  assert.equal(result.full, long);
  // short ends with the ellipsis affordance
  assert.ok(result.short.endsWith('…'), 'short should end with an ellipsis');
  // the visible (pre-ellipsis) portion fits inside the threshold
  const visible = result.short.slice(0, -1);
  assert.ok(visible.length <= 800, 'visible portion should not exceed 800 chars');
  // word-boundary cut: trailing trim means it does not end on a space before the ellipsis
  assert.ok(!visible.endsWith(' '), 'cut should be trimmed at the word boundary');
});

test('truncateHadith does not split a word mid-token', () => {
  // A single long run of non-space chars then spaced words. The cut must land
  // on the last space at-or-before 800, never inside the leading token.
  const head = 'token'.repeat(100); // 500 chars, no spaces
  const tail = ' alpha beta gamma'.repeat(40); // spaced words past 800
  const long = head + tail;
  const result = truncateHadith(long);
  assert.equal(result.truncated, true);
  const visible = result.short.slice(0, -1);
  // the character at the cut position in the original must be a space (the cut
  // happened on a boundary), proving no mid-word split
  assert.equal(long[visible.length], ' ');
});

test('truncateHadith returns the not-truncated shape for non-string input', () => {
  for (const bad of [null, undefined, 123, {}, []]) {
    const result = truncateHadith(bad);
    assert.equal(result.truncated, false);
    assert.equal(result.short, bad);
    assert.equal(result.full, bad);
  }
});

test('sunnahNumber keeps Bukhari numbering as the dataset gives it', () => {
  assert.equal(sunnahNumber('bukhari', { hadithnumber: 6405 }), '6405');
  assert.equal(sunnahNumber('bukhari', { hadithnumber: 12.5 }), null);
  assert.equal(sunnahNumber('bukhari', {}), null);
});

test('sunnahNumber maps Muslim to the arabicnumber, with .01 as the a suffix', () => {
  assert.equal(sunnahNumber('muslim', { hadithnumber: 1, arabicnumber: 8 }), '8');
  assert.equal(sunnahNumber('muslim', { arabicnumber: 2708.01 }), '2708a');
  assert.equal(sunnahNumber('muslim', { arabicnumber: '2721.01' }), '2721a');
});

test('sunnahNumber skips Muslim entries it cannot map to one sunnah.com page', () => {
  assert.equal(sunnahNumber('muslim', { arabicnumber: 2708.02 }), null);
  assert.equal(sunnahNumber('muslim', {}), null);
  assert.equal(sunnahNumber('muslim', null), null);
  assert.equal(sunnahNumber('nasai', { hadithnumber: 1 }), null);
});

test('isUsableHadith accepts the cached shape', () => {
  assert.equal(isUsableHadith({ text: 'synthetic filler', collection: 'bukhari', number: '1' }), true);
  assert.equal(isUsableHadith({ text: 'synthetic filler', collection: 'muslim', number: '2708a' }), true);
});

test('isUsableHadith rejects other collections, bad numbers and unsafe text', () => {
  const ok = { text: 'synthetic filler', collection: 'bukhari', number: '1' };
  assert.equal(isUsableHadith({ ...ok, collection: 'tirmidhi' }), false);
  assert.equal(isUsableHadith({ ...ok, number: null }), false);
  assert.equal(isUsableHadith({ ...ok, number: '12.3' }), false);
  assert.equal(isUsableHadith({ ...ok, text: '   ' }), false);
  assert.equal(isUsableHadith({ ...ok, text: '<script>x</script>' }), false);
  assert.equal(isUsableHadith('synthetic filler'), false);
  assert.equal(isUsableHadith(null), false);
});

test('isSafeHadithText rejects markup-shaped strings (case-insensitive)', () => {
  assert.equal(isSafeHadithText('<script>doStuff()</script>'), false);
  assert.equal(isSafeHadithText('<SCRIPT>doStuff()</SCRIPT>'), false);
  assert.equal(isSafeHadithText('text with <iframe src=x>'), false);
  assert.equal(isSafeHadithText('text with <OBJECT data=x>'), false);
  assert.equal(isSafeHadithText('text with <embed src=x>'), false);
});

test('isSafeHadithText rejects empty, non-string, and over-length input', () => {
  assert.equal(isSafeHadithText(''), false);
  assert.equal(isSafeHadithText(null), false);
  assert.equal(isSafeHadithText(undefined), false);
  assert.equal(isSafeHadithText(123), false);
  assert.equal(isSafeHadithText('y'.repeat(4097)), false);
});

test('isSafeHadithText accepts ordinary synthetic text within bounds', () => {
  assert.equal(isSafeHadithText('an ordinary line of synthetic filler text'), true);
  assert.equal(isSafeHadithText('z'.repeat(4096)), true);
});

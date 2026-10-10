import { test } from 'node:test';
import assert from 'node:assert/strict';
import { truncateHadith, isSafeHadithText, sunnahNumber, isUsableHadith, splitNarrator, splitArabicRuns } from '../shared/hadith.js';

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

test('splitNarrator separates a narrator line glued to the text by a colon', () => {
  const text = 'Narrated Some Narrator:synthetic body line';
  const { narrator, body } = splitNarrator(text);
  assert.equal(narrator, 'Narrated Some Narrator:');
  assert.equal(body, 'synthetic body line');
  assert.equal(narrator + body, text, 'the two parts rejoin to the original text');
});

test('splitNarrator also splits "reported:" lines and keeps a leading quote in the body', () => {
  const { narrator, body } = splitNarrator('Some Narrator reported:"synthetic body line"');
  assert.equal(narrator, 'Some Narrator reported:');
  assert.equal(body, '"synthetic body line"');
});

test('splitNarrator leaves text alone when there is nothing to split', () => {
  const cases = [
    'synthetic text with no colon at all',
    'Narrated Some Narrator: already spaced',
    'a reference like 2:255 is not a narrator line',
    'he said "x:y" and left',
    'z'.repeat(300) + ':glued after a very long head'
  ];
  for (const text of cases) assert.deepEqual(splitNarrator(text), { narrator: '', body: text });
  assert.deepEqual(splitNarrator(null), { narrator: '', body: null });
});

test('splitArabicRuns marks Arabic-script runs and keeps every character', () => {
  const text = 'synthetic line (\u0643\u062A\u0627\u0628 \u0642\u0644\u0645) and more';
  const parts = splitArabicRuns(text);
  assert.deepEqual(parts.map((p) => p.arabic), [false, true, false]);
  assert.equal(parts[1].text, '\u0643\u062A\u0627\u0628 \u0642\u0644\u0645');
  assert.equal(parts.map((p) => p.text).join(''), text, 'the parts rejoin to the original text');
});

test('splitArabicRuns treats a presentation-form ligature as an Arabic run and passes plain text through', () => {
  assert.deepEqual(splitArabicRuns('name (\uFDFA) said'), [
    { text: 'name (', arabic: false },
    { text: '\uFDFA', arabic: true },
    { text: ') said', arabic: false }
  ]);
  assert.deepEqual(splitArabicRuns('plain synthetic text'), [{ text: 'plain synthetic text', arabic: false }]);
  assert.deepEqual(splitArabicRuns(''), []);
});

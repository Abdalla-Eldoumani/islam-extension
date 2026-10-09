import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSurahList, surahAudioBitrates, findReciter } from '../shared/reciter-catalogue.js';

const ALL = Array.from({ length: 114 }, (_, i) => i + 1);

test('parseSurahList returns null when all 114 surahs are listed', () => {
  assert.equal(parseSurahList(ALL.join(',')), null);
  assert.equal(parseSurahList([...ALL].reverse().join(',') + ',1'), null);
});

test('parseSurahList returns a sorted, de-duplicated partial list', () => {
  assert.deepEqual(parseSurahList('36,1,18,36'), [1, 18, 36]);
});

test('parseSurahList drops values outside 1 to 114', () => {
  assert.deepEqual(parseSurahList('0,1,115,x,,2.5,114'), [1, 114]);
  assert.deepEqual(parseSurahList(''), []);
  assert.deepEqual(parseSurahList(undefined), []);
});

function edition(name, count) {
  return {
    type: 'directory',
    name,
    contents: Array.from({ length: count }, (_, i) => ({ type: 'file', name: `${i + 1}.mp3` }))
  };
}

test('surahAudioBitrates keeps complete editions at their highest bitrate', () => {
  const listing = [
    {
      type: 'directory',
      name: '/audio-surah',
      contents: [
        { type: 'directory', name: '96', contents: [edition('ed.short', 114), edition('ed.full', 114)] },
        { type: 'directory', name: '128', contents: [edition('ed.full', 114), edition('ed.short', 113)] },
        { type: 'directory', name: 'notes', contents: [edition('ed.other', 114)] }
      ]
    },
    { type: 'report', directories: 4, files: 0 }
  ];
  const bitrates = surahAudioBitrates(listing);
  assert.equal(bitrates.get('ed.full'), 128);
  assert.equal(bitrates.get('ed.short'), 96);
  assert.equal(bitrates.has('ed.other'), false);
  assert.equal(bitrates.size, 2);
});

test('surahAudioBitrates returns an empty map for an unexpected listing', () => {
  for (const bad of [null, {}, [], [{ type: 'report' }]]) {
    assert.equal(surahAudioBitrates(bad).size, 0);
  }
});

test('findReciter matches the main id or a merged duplicate id', () => {
  const reciters = [
    { id: 'qc:7', altIds: ['mp3:5'] },
    { id: 'islamic:ed.full', altIds: [] }
  ];
  assert.equal(findReciter(reciters, 'qc:7'), reciters[0]);
  assert.equal(findReciter(reciters, 'mp3:5'), reciters[0]);
  assert.equal(findReciter(reciters, 'islamic:ed.full'), reciters[1]);
  assert.equal(findReciter(reciters, 'mp3:999'), null);
});

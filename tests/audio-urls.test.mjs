import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAllowedAudioHost,
  ensureAllowedAudioHost,
  hasSurah,
  getNextSuraId,
  getSuraAudioUrl
} from '../shared/audio-urls.js';

test('isAllowedAudioHost accepts the hosts in the manifests\' media-src', () => {
  assert.equal(isAllowedAudioHost('https://download.quranicaudio.com/qdc/x/murattal/114.mp3'), true);
  assert.equal(isAllowedAudioHost('https://cdn.islamic.network/quran/audio-surah/128/x/114.mp3'), true);
  assert.equal(isAllowedAudioHost('https://server8.mp3quran.net/x/114.mp3'), true);
  assert.equal(isAllowedAudioHost('https://cdn.mp3quran.net/audio/x/114.mp3'), true);
});

test('isAllowedAudioHost rejects other hosts, look-alikes and plain http', () => {
  assert.equal(isAllowedAudioHost('https://verses.quran.com/x/001.mp3'), false);
  assert.equal(isAllowedAudioHost('https://attacker.example.com/payload.mp3'), false);
  assert.equal(isAllowedAudioHost('https://cdn.islamic.network.example.com/1.mp3'), false);
  assert.equal(isAllowedAudioHost('https://mp3quran.net.example.com/001.mp3'), false);
  assert.equal(isAllowedAudioHost('http://server8.mp3quran.net/x/001.mp3'), false);
});

test('isAllowedAudioHost rejects malformed urls', () => {
  for (const bad of ['', 'not a url', null, undefined, 'javascript:alert(1)', 'data:audio/mp3;base64,AAA']) {
    assert.equal(isAllowedAudioHost(bad), false);
  }
});

test('ensureAllowedAudioHost throws on rejected hosts and passes accepted ones', () => {
  assert.throws(() => ensureAllowedAudioHost('https://attacker.example.com/'), /unavailable/);
  assert.throws(() => ensureAllowedAudioHost(undefined), /unavailable/);
  const url = 'https://cdn.islamic.network/quran/audio-surah/128/x/67.mp3';
  assert.equal(ensureAllowedAudioHost(url), url);
});

test('hasSurah treats a null list as complete and checks partial lists', () => {
  assert.equal(hasSurah({ surahs: null }, 114), true);
  assert.equal(hasSurah(null, '1'), true);
  assert.equal(hasSurah({ surahs: [1, 36] }, '36'), true);
  assert.equal(hasSurah({ surahs: [1, 36] }, 2), false);
  for (const bad of [0, 115, 1.5, 'x', undefined]) assert.equal(hasSurah(null, bad), false);
});

test('getNextSuraId increments and wraps from 114 to 1', () => {
  assert.equal(getNextSuraId('1'), '2');
  assert.equal(getNextSuraId('113'), '114');
  assert.equal(getNextSuraId('114'), '1');
  assert.equal(getNextSuraId(114), '1');
});

test('getNextSuraId skips surahs a partial reciter has not recorded', () => {
  const reciter = { surahs: [2, 18, 112] };
  assert.equal(getNextSuraId('2', reciter), '18');
  assert.equal(getNextSuraId('18', reciter), '112');
  assert.equal(getNextSuraId('112', reciter), '2');
  assert.equal(getNextSuraId('50', { surahs: [] }), null);
});

test('getSuraAudioUrl builds the MP3Quran file name from the server', async () => {
  const reciter = { id: 'mp3:1', server: 'https://server8.mp3quran.net/x/', surahs: null };
  assert.equal(await getSuraAudioUrl(reciter, '7'), 'https://server8.mp3quran.net/x/007.mp3');
});

test('getSuraAudioUrl uses the surah-level CDN path with the edition bitrate', async () => {
  const reciter = { id: 'islamic:ar.example', bitrate: 96 };
  assert.equal(
    await getSuraAudioUrl(reciter, 114),
    'https://cdn.islamic.network/quran/audio-surah/96/ar.example/114.mp3'
  );
});

test('getSuraAudioUrl asks Quran.com for the chapter recitation and checks the host', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(url);
    const audioUrl = url.endsWith('/114')
      ? 'https://download.quranicaudio.com/qdc/x/murattal/114.mp3'
      : 'https://elsewhere.example.com/1.mp3';
    return { ok: true, json: async () => ({ audio_file: { audio_url: audioUrl } }) };
  });
  const reciter = { id: 'qc:7' };
  assert.equal(await getSuraAudioUrl(reciter, 114), 'https://download.quranicaudio.com/qdc/x/murattal/114.mp3');
  assert.equal(calls[0], 'https://api.quran.com/api/v4/chapter_recitations/7/114');
  await assert.rejects(getSuraAudioUrl(reciter, 1), /unavailable/);
});

test('getSuraAudioUrl refuses an unrecorded surah and an unknown provider', async () => {
  await assert.rejects(getSuraAudioUrl({ id: 'mp3:1', server: 'https://s.mp3quran.net/', surahs: [1] }, 2), /not recorded/);
  await assert.rejects(getSuraAudioUrl({ id: 'other:1' }, 1), /Unknown provider/);
  await assert.rejects(getSuraAudioUrl(null, 1), /not found/);
});

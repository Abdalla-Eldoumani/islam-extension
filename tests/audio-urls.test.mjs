import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedAudioHost, ensureAllowedAudioHost, getNextSuraId } from '../shared/audio-urls.js';

test('isAllowedAudioHost accepts every host enumerated in the manifest media-src', () => {
  assert.equal(isAllowedAudioHost('https://verses.quran.com/Alafasy/mp3/001.mp3'), true);
  assert.equal(isAllowedAudioHost('https://cdn.islamic.network/quran/audio/128/ar.alafasy/1.mp3'), true);
  assert.equal(isAllowedAudioHost('https://mirrors.quranicaudio.com/muslim/abdulbasit/001.mp3'), true);
  assert.equal(isAllowedAudioHost('https://download.quranicaudio.com/qari/abdulbasit/001.mp3'), true);
  assert.equal(isAllowedAudioHost('https://www.mp3quran.net/api/quran_pages_v3/01.mp3'), true);
});

test('isAllowedAudioHost accepts subdomains of mp3quran.net', () => {
  assert.equal(isAllowedAudioHost('https://server8.mp3quran.net/afs/001.mp3'), true);
  assert.equal(isAllowedAudioHost('https://server10.mp3quran.net/abu_jbl/001.mp3'), true);
});

test('isAllowedAudioHost rejects off-allowlist hosts', () => {
  assert.equal(isAllowedAudioHost('https://attacker.example.com/payload.mp3'), false);
  assert.equal(isAllowedAudioHost('https://verses.quran.com.attacker.com/001.mp3'), false);
  assert.equal(isAllowedAudioHost('https://mp3quran.net.example.com/001.mp3'), false);
});

test('isAllowedAudioHost rejects malformed urls', () => {
  assert.equal(isAllowedAudioHost(''), false);
  assert.equal(isAllowedAudioHost('not a url'), false);
  assert.equal(isAllowedAudioHost(null), false);
  assert.equal(isAllowedAudioHost(undefined), false);
  assert.equal(isAllowedAudioHost('javascript:alert(1)'), false);
  assert.equal(isAllowedAudioHost('data:audio/mp3;base64,AAA'), false);
});

test('ensureAllowedAudioHost throws on rejected hosts', () => {
  assert.throws(() => ensureAllowedAudioHost('https://attacker.example.com/'), /unavailable/);
  assert.throws(() => ensureAllowedAudioHost(''), /unavailable/);
});

test('ensureAllowedAudioHost passes through accepted hosts', () => {
  const url = 'https://verses.quran.com/Alafasy/mp3/067.mp3';
  assert.equal(ensureAllowedAudioHost(url), url);
});

test('getNextSuraId wraps from 114 to 1', () => {
  assert.equal(getNextSuraId('114'), '1');
  assert.equal(getNextSuraId(114), '1');
});

test('getNextSuraId increments by one', () => {
  assert.equal(getNextSuraId('1'), '2');
  assert.equal(getNextSuraId('66'), '67');
  assert.equal(getNextSuraId('113'), '114');
});

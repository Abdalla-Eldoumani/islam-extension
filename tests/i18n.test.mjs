import { test } from 'node:test';
import assert from 'node:assert/strict';
import { I18N, t, translate, setCurrentLang, getCurrentLang, resolveLang } from '../shared/i18n.js';

test('English, French and Arabic share the same keys', () => {
  const en = Object.keys(I18N.en).sort();
  assert.deepEqual(Object.keys(I18N.fr).sort(), en);
  assert.deepEqual(Object.keys(I18N.ar).sort(), en);
});

test('every value is a non-empty string', () => {
  for (const [lang, table] of Object.entries(I18N)) {
    for (const [key, value] of Object.entries(table)) {
      assert.ok(typeof value === 'string' && value.trim().length > 0, `${lang}.${key}`);
    }
  }
});

test('placeholders survive in every locale', () => {
  const placeholders = (s) => (s.match(/\{\w+\}/g) || []).sort();
  for (const key of Object.keys(I18N.en)) {
    const expected = placeholders(I18N.en[key]);
    for (const lang of ['fr', 'ar']) {
      assert.deepEqual(placeholders(I18N[lang][key]), expected, `${lang}.${key}`);
    }
  }
});

test('translate substitutes values literally and falls back to English, then the key', () => {
  assert.equal(translate('en', 'playingBannerLabel', { surah: 'S', reciter: 'R $& $1' }), 'Playing: S · R $& $1');
  assert.equal(translate('xx', 'play'), 'Play');
  assert.equal(translate('en', 'some_unknown_key_xyz'), 'some_unknown_key_xyz');
});

test('t follows the current language and ignores unknown ones', () => {
  setCurrentLang('fr');
  assert.equal(t('play'), I18N.fr.play);
  setCurrentLang('ar');
  assert.equal(t('play'), I18N.ar.play);
  setCurrentLang('de');
  assert.equal(getCurrentLang(), 'ar');
  setCurrentLang('en');
  assert.equal(t('play'), 'Play');
});

test('resolveLang prefers the saved choice, then the browser language, then English', () => {
  assert.equal(resolveLang('ar', 'fr-CA'), 'ar');
  assert.equal(resolveLang(undefined, 'fr-CA'), 'fr');
  assert.equal(resolveLang('xx', 'ar-EG'), 'ar');
  assert.equal(resolveLang(null, 'de-DE'), 'en');
  assert.equal(resolveLang(null, undefined), 'en');
});

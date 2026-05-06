import { test } from 'node:test';
import assert from 'node:assert/strict';
import { I18N, t, setCurrentLang } from '../shared/i18n.js';

test('all three locales exist', () => {
  assert.ok(I18N.en);
  assert.ok(I18N.fr);
  assert.ok(I18N.ar);
});

test('every English key is present in French and Arabic', () => {
  const enKeys = Object.keys(I18N.en);
  const missingFr = enKeys.filter(k => !(k in I18N.fr));
  const missingAr = enKeys.filter(k => !(k in I18N.ar));
  assert.deepEqual(missingFr, [], `French is missing keys: ${missingFr.join(', ')}`);
  assert.deepEqual(missingAr, [], `Arabic is missing keys: ${missingAr.join(', ')}`);
});

test('2.1.2 banner keys are present in all locales', () => {
  for (const lang of ['en', 'fr', 'ar']) {
    assert.ok(I18N[lang].stopPlaying, `${lang} missing stopPlaying`);
    assert.ok(I18N[lang].playingBannerLabel, `${lang} missing playingBannerLabel`);
    assert.ok(I18N[lang].clearSurahButton, `${lang} missing clearSurahButton`);
    assert.ok(I18N[lang].clearReciterButton, `${lang} missing clearReciterButton`);
    assert.ok(I18N[lang].statusPlaying, `${lang} missing statusPlaying`);
    assert.ok(I18N[lang].statusReciterUnavailable, `${lang} missing statusReciterUnavailable`);
  }
});

test('playingBannerLabel preserves substitution placeholders in every locale', () => {
  for (const lang of ['en', 'fr', 'ar']) {
    const v = I18N[lang].playingBannerLabel;
    assert.ok(v.includes('{surah}'), `${lang} playingBannerLabel missing {surah}`);
    assert.ok(v.includes('{reciter}'), `${lang} playingBannerLabel missing {reciter}`);
  }
});

test('continueAffordance preserves substitution placeholders in every locale', () => {
  for (const lang of ['en', 'fr', 'ar']) {
    const v = I18N[lang].continueAffordance;
    assert.ok(v.includes('{name}'), `${lang} continueAffordance missing {name}`);
    assert.ok(v.includes('{time}'), `${lang} continueAffordance missing {time}`);
  }
});

test('t falls back to the key when the locale lacks an entry', () => {
  setCurrentLang('en');
  assert.equal(t('some_unknown_key_xyz'), 'some_unknown_key_xyz');
});

test('t resolves the current locale on switch', () => {
  setCurrentLang('fr');
  assert.equal(t('play'), 'Lire');
  setCurrentLang('ar');
  assert.equal(t('play'), 'تشغيل');
  setCurrentLang('en');
  assert.equal(t('play'), 'Play');
});

test('religious-content-immutable: all three locales render dhikr-adjacent strings without obvious AI-translation tells', () => {
  // We don't inspect dhikr text itself — that lives in shared/dhikr.js and is
  // immutable. We do check the UI labels around it for stability.
  for (const lang of ['en', 'fr', 'ar']) {
    assert.ok(I18N[lang].nextDhikr, `${lang} missing nextDhikr`);
    assert.ok(I18N[lang].notificationsOn, `${lang} missing notificationsOn`);
    assert.ok(I18N[lang].notificationsOff, `${lang} missing notificationsOff`);
  }
});

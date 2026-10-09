// The small reminder window opened by shared/reminders.js. The dhikr comes
// from the ?dhikr= index in the URL; the language is the popup's.

import { browser } from '../browser.js';
import { dhikrCollection } from '../dhikr.js';
import { LANG_STORAGE_KEY, resolveLang, translate } from '../i18n.js';
import { fillDhikr } from './dhikr-view.js';

const $ = (id) => document.getElementById(id);

async function show() {
  const { [LANG_STORAGE_KEY]: saved } = await browser.storage.local.get(LANG_STORAGE_KEY);
  const lang = resolveLang(saved, browser.i18n?.getUILanguage?.() || navigator.language);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.title = translate(lang, 'reminderTitle');
  $('reminder-title').textContent = translate(lang, 'reminderTitle');
  $('close-label').textContent = translate(lang, 'close');

  const index = Number(new URLSearchParams(location.search).get('dhikr'));
  const dhikr = Number.isInteger(index) ? dhikrCollection[index] : undefined;
  if (!dhikr) return;
  fillDhikr({
    arabic: $('dhikr-arabic'),
    translit: $('dhikr-translit'),
    meaning: $('dhikr-meaning'),
    virtue: $('dhikr-virtue'),
    source: $('dhikr-source')
  }, dhikr, lang);
}

$('close-button').addEventListener('click', () => window.close());
show();

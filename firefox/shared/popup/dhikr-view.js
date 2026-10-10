// Renders one dhikr and its source line. Used by the popup and by the
// reminder window so both show the same text the same way.

import { virtueFor } from '../dhikr.js';
import { translate } from '../i18n.js';
import { sourceLabel, sourceUrl } from '../sources.js';

function quote(text, lang) {
  return lang === 'ar' ? `«${text}»` : `“${text}”`;
}

export function fillSource(el, source, lang, extra) {
  const link = document.createElement('a');
  link.href = sourceUrl(source);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = sourceLabel(source, lang);
  el.replaceChildren(link);
  if (extra) el.append(` · ${extra}`);
  el.hidden = false;
}

// Longer texts step down in size so the full dua fits without a tall popup.
function sizeTier(text) {
  if (text.length > 200) return 'xl';
  if (text.length > 100) return 'l';
  return text.length > 40 ? 'm' : 's';
}

// els: { arabic, translit, meaning, virtue, source } elements.
export function fillDhikr(els, dhikr, lang) {
  const latin = lang !== 'ar';
  els.arabic.textContent = dhikr.arabic;
  els.arabic.dataset.size = sizeTier(dhikr.arabic);
  els.translit.hidden = !latin;
  els.translit.textContent = dhikr.transliteration;
  els.meaning.hidden = !latin;
  els.meaning.textContent = dhikr.english;

  const virtue = virtueFor(dhikr, lang);
  els.virtue.hidden = !virtue;
  if (virtue) {
    els.virtue.textContent = virtue.quoted ? quote(virtue.text, virtue.lang) : virtue.text;
    els.virtue.lang = virtue.lang;
    els.virtue.dir = virtue.lang === 'ar' ? 'rtl' : 'ltr';
  }
  let credit = null;
  if (latin && dhikr.source.translation) {
    credit = translate(lang, 'translationName', { name: dhikr.source.translation });
  } else if (latin && dhikr.englishFromSunnah) {
    credit = translate(lang, 'englishFrom');
  }
  fillSource(els.source, dhikr.source, lang, credit);
}

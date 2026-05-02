// Parchment-styled combobox controller. Owns open/close, filter, keyboard nav,
// ARIA, and outside-click handling. Does not own data: callers supply options
// via getOptions(). Religious-content rule: labels are rendered as-is via
// textContent; the filter normalises a comparison key only, never the display.

const ARABIC_RANGE = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
const ARABIC_TASHKEEL = /[ً-ْٰ]/g;
const TATWEEL = /ـ/g;

let openInstance = null;
let outsideClickRegistered = false;

function handleDocumentMouseDown(event) {
  if (!openInstance) return;
  const { inputEl, panelEl } = openInstance;
  if (!inputEl || !panelEl) return;
  if (inputEl.contains(event.target) || panelEl.contains(event.target)) return;
  openInstance.close();
}

function ensureOutsideClickListener() {
  if (outsideClickRegistered) return;
  document.addEventListener('mousedown', handleDocumentMouseDown);
  outsideClickRegistered = true;
}

function normaliseForCompare(s) {
  if (!s) return '';
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(ARABIC_TASHKEEL, '')
    .replace(TATWEEL, '')
    .toLowerCase()
    .trim();
}

function hasArabic(s) {
  return typeof s === 'string' && ARABIC_RANGE.test(s);
}

function matchesQuery(option, normQuery) {
  if (!normQuery) return true;
  if (normaliseForCompare(option.label).includes(normQuery)) return true;
  if (option.secondary && normaliseForCompare(option.secondary).includes(normQuery)) return true;
  if (option.id && normaliseForCompare(String(option.id)).includes(normQuery)) return true;
  return false;
}

export function createCombobox({ inputEl, panelEl, getOptions, onSelect, onClear, name }) {
  if (!inputEl || !panelEl) {
    throw new Error('createCombobox: inputEl and panelEl are required');
  }
  if (typeof getOptions !== 'function') {
    throw new Error('createCombobox: getOptions must be a function');
  }
  const instanceName = name || panelEl.id || 'combobox';

  inputEl.setAttribute('role', 'combobox');
  inputEl.setAttribute('aria-expanded', 'false');
  inputEl.setAttribute('aria-controls', panelEl.id || '');
  inputEl.setAttribute('aria-autocomplete', 'list');
  panelEl.setAttribute('role', 'listbox');

  let highlightedIndex = -1;
  let filtered = [];
  let selectedId = null;

  function optionElementId(id) {
    return `combobox-${instanceName}-option-${String(id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  }

  function renderPanel() {
    const query = normaliseForCompare(inputEl.value);
    const all = getOptions() || [];
    filtered = all.filter((o) => matchesQuery(o, query));

    panelEl.replaceChildren();
    filtered.forEach((option, index) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.id = optionElementId(option.id);
      li.className = 'combobox__option';
      li.dataset.optionId = String(option.id);
      if (hasArabic(option.label)) {
        li.setAttribute('lang', 'ar');
      }
      const labelSpan = document.createElement('span');
      labelSpan.className = 'combobox__option__label';
      labelSpan.textContent = option.label;
      li.appendChild(labelSpan);
      if (option.secondary) {
        const secondarySpan = document.createElement('span');
        secondarySpan.className = 'combobox__option__secondary';
        secondarySpan.textContent = option.secondary;
        li.appendChild(secondarySpan);
      }
      const isSelected = option.id === selectedId;
      li.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      if (index === highlightedIndex) {
        li.dataset.highlighted = 'true';
      }
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        commit(option);
      });
      panelEl.appendChild(li);
    });

    const activeId = highlightedIndex >= 0 && filtered[highlightedIndex]
      ? optionElementId(filtered[highlightedIndex].id)
      : '';
    inputEl.setAttribute('aria-activedescendant', activeId);
  }

  function open() {
    if (openInstance && openInstance !== api) {
      openInstance.close();
    }
    panelEl.hidden = false;
    inputEl.setAttribute('aria-expanded', 'true');
    openInstance = api;
    ensureOutsideClickListener();
    renderPanel();
    scrollHighlightedIntoView();
  }

  function close() {
    panelEl.hidden = true;
    inputEl.setAttribute('aria-expanded', 'false');
    highlightedIndex = -1;
    if (openInstance === api) openInstance = null;
  }

  function commit(option) {
    selectedId = option.id;
    inputEl.value = option.label;
    close();
    if (typeof onSelect === 'function') onSelect(option);
  }

  function moveHighlight(delta) {
    if (filtered.length === 0) return;
    if (highlightedIndex === -1) {
      highlightedIndex = delta > 0 ? 0 : filtered.length - 1;
    } else {
      highlightedIndex = (highlightedIndex + delta + filtered.length) % filtered.length;
    }
    renderPanel();
    scrollHighlightedIntoView();
  }

  function scrollHighlightedIntoView() {
    if (highlightedIndex < 0) return;
    const child = panelEl.children[highlightedIndex];
    if (child && typeof child.scrollIntoView === 'function') {
      child.scrollIntoView({ block: 'nearest' });
    }
  }

  function handleInput() {
    highlightedIndex = filtered.length > 0 ? 0 : -1;
    if (panelEl.hidden) open();
    else renderPanel();
  }

  function handleKeyDown(event) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (panelEl.hidden) open();
        else moveHighlight(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (panelEl.hidden) open();
        else moveHighlight(-1);
        break;
      case 'Enter':
        if (!panelEl.hidden && highlightedIndex >= 0 && filtered[highlightedIndex]) {
          event.preventDefault();
          commit(filtered[highlightedIndex]);
        }
        break;
      case 'Escape':
        if (!panelEl.hidden) {
          event.preventDefault();
          close();
        }
        break;
      case 'Tab':
        if (!panelEl.hidden) {
          if (highlightedIndex >= 0 && filtered[highlightedIndex]) {
            commit(filtered[highlightedIndex]);
          } else {
            close();
          }
        }
        break;
      default:
        break;
    }
  }

  function handleFocus() {
    if (panelEl.hidden) open();
  }

  function handleClick() {
    if (panelEl.hidden) open();
  }

  inputEl.addEventListener('input', handleInput);
  inputEl.addEventListener('keydown', handleKeyDown);
  inputEl.addEventListener('focus', handleFocus);
  inputEl.addEventListener('click', handleClick);

  const api = {
    inputEl,
    panelEl,
    setValue(id) {
      const all = getOptions() || [];
      const found = all.find((o) => o.id === id);
      if (!found) return false;
      selectedId = found.id;
      inputEl.value = found.label;
      return true;
    },
    clear() {
      selectedId = null;
      inputEl.value = '';
      if (!panelEl.hidden) renderPanel();
      if (typeof onClear === 'function') onClear();
    },
    refresh() {
      if (!panelEl.hidden) renderPanel();
    },
    open,
    close,
    destroy() {
      inputEl.removeEventListener('input', handleInput);
      inputEl.removeEventListener('keydown', handleKeyDown);
      inputEl.removeEventListener('focus', handleFocus);
      inputEl.removeEventListener('click', handleClick);
      close();
    }
  };

  return api;
}

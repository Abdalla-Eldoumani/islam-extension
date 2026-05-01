// Captures static popup screenshots for visual review. Stubs chrome.* APIs
// so the popup module loads without erroring; data-driven UI (reciter list,
// dhikr text, hadith) renders empty or with placeholders. The point is the
// chrome (typography, layout, colour) not the data.
//
// Usage: node scripts/capture-screenshots.mjs [chrome|firefox] [outDir]

import { chromium } from 'playwright';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const build = process.argv[2] || 'chrome';
const outDir = process.argv[3] || join(repoRoot, '.playwright-mcp', 'after');

const popupPath = `file:///${join(repoRoot, build, 'popup', 'index.html').replace(/\\/g, '/')}`;

await mkdir(outDir, { recursive: true });

const chromeStub = `
const _store = {
  uiLanguage: '__LANG__',
  userSelections: {},
  dhikrSettings: { enabled: false, intervalSeconds: 60, reminderMode: 'notification' },
  reciterCache: null,
  hadithCacheEn: [],
  hadithCacheFr: [],
  audioState: null
};
const chromeStub = {
  runtime: {
    sendMessage: () => Promise.resolve({ success: true }),
    onMessage: { addListener: () => {} },
    lastError: null,
    getURL: (p) => p,
    id: 'stub'
  },
  storage: {
    local: {
      get: (key) => Promise.resolve(typeof key === 'string'
        ? { [key]: _store[key] }
        : Array.isArray(key)
          ? Object.fromEntries(key.map(k => [k, _store[k]]))
          : Object.fromEntries(Object.keys(key).map(k => [k, _store[k] ?? key[k]]))
      ),
      set: (obj) => { Object.assign(_store, obj); return Promise.resolve(); }
    }
  },
  notifications: {
    create: () => Promise.resolve('stub'),
    clear: () => Promise.resolve(),
    getPermissionLevel: () => Promise.resolve('granted'),
    onClicked: { addListener: () => {} }
  },
  alarms: {
    create: () => {},
    clear: () => Promise.resolve(),
    onAlarm: { addListener: () => {} }
  },
  windows: { create: () => Promise.resolve({}) },
  i18n: { getUILanguage: () => '__LANG__' }
};
window.chrome = chromeStub;
window.browser = chromeStub;
`;

async function captureMode(name, opts) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 380, height: 520 },
    colorScheme: opts.colorScheme,
    locale: opts.locale
  });
  const page = await context.newPage();
  await page.addInitScript(chromeStub.replace(/__LANG__/g, opts.lang));
  await page.goto(popupPath);
  await page.waitForTimeout(800);
  if (opts.lang === 'ar') {
    await page.evaluate(() => {
      document.documentElement.lang = 'ar';
      document.body.dir = 'rtl';
    });
    await page.waitForTimeout(200);
  }
  const out = join(outDir, `${build}-${name}.png`);
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 380, height: 520 } });
  console.log(`saved ${out}`);
  await browser.close();
}

await captureMode('light', { colorScheme: 'light', locale: 'en-US', lang: 'en' });
await captureMode('dark', { colorScheme: 'dark', locale: 'en-US', lang: 'en' });
await captureMode('rtl', { colorScheme: 'light', locale: 'ar', lang: 'ar' });

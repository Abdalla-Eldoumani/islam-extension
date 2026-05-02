# Contributing

Pull requests welcome. Issues welcome. The rules below describe what gets merged.

## Setup

```bash
git clone https://github.com/Abdalla-Eldoumani/islam-extension.git
cd islam-extension
npm install
npm run sync
```

Load `chrome/` as an unpacked extension in `chrome://extensions` and `firefox/manifest.json` as a temporary add-on in `about:debugging`.

## The one rule that overrides everything

Religious content is read-only. The Arabic in the dhikr collection, every reward translation, every fetched hadith, and the Arabic UI strings are not edited, paraphrased, retranslated, summarised, or expanded by anyone working on the codebase, AI assistants included. UI chrome only — buttons, labels, error messages, docs.

If you spot something that looks off in religious text, open an issue and link to a primary source. Do not edit and submit. The maintainer reconciles religious content against verified collections (Sahih al-Bukhari, Sahih Muslim, the Quran.com Foundation API, and so on) outside the normal PR flow.

## Adding a reciter

Edit `shared/reciter-catalogue.js`. The four existing fetchers (`fetchQuranComReciters`, `fetchMp3QuranReciters`, `fetchAlquranCloudReciters`, `fetchIslamicNetworkReciters`) each return entries shaped like:

```js
{
  id: 'qc:7' | 'mp3:228' | 'islamic:ar.alafasy',  // <provider>:<rawId>
  reciter_name: 'Mishary Rashid Al-Afasy',
  style: 'Murattal',
  source: 'qurancom' | 'mp3quran' | 'islamic',
  bitrate: 128,
  // mp3 only: server, mp3quranId
  // islamic only: slug
}
```

To add an Islamic.network slug, append it to the `slugs` array in `fetchIslamicNetworkReciters`. To add a Quran.com or MP3Quran reciter, those providers' APIs already serve the catalogue; the deduplication logic merges duplicates.

After editing, run `npm run sync` and reload both builds. Smoke test: pick the new reciter, hit Play, listen to a surah end-to-end.

## Adding a provider

A new audio provider goes in three places:

1. A `fetchXxxReciters` function in `shared/reciter-catalogue.js` returning the entry shape above. Add it to the orchestrator `fetchReciters`.
2. A new media host in the manifest CSP `media-src` (and possibly `connect-src`) plus the allowlist in `shared/audio-urls.js#ALLOWED_MEDIA_HOSTS`. Provide a paragraph in `docs/SECURITY.md` describing the trust posture.
3. Coverage probe support in `shared/reciter-coverage.js#buildProbeUrls` if the provider's URL pattern differs from the existing ones.

The probe can be run once locally to confirm a fresh provider works:

```
node scripts/probe-reciter-coverage.mjs
```

It prints `complete` / `limited` / other for every reciter. Use `--json` to dump a machine-readable map.

## Adding a language

Religious-content translation is out of scope for the codebase (see the rule above). UI translation is welcome. Edit `shared/i18n.js`:

```js
export const I18N = {
  en: { ... },
  fr: { ... },
  ar: { ... },
  pt: { /* your new locale */ }
};
```

Every key in `en` must exist in the new locale. RTL locales (Hebrew, Persian, Urdu) need a manual review of `applyLanguage()` in `popup.js` to ensure direction toggling is correct.

If you want a hadith fetcher for the new locale (English and French exist today), edit `shared/hadith.js`. The jsdelivr-hosted hadith-api source supports many languages; the editions array enumerates them.

After editing, run `npm run sync` and test all three popup cards in the new locale.

## Atomic commits

One file per commit by default. One logical change per commit. Lowercase imperative subjects under 72 characters. No emoji. No trailers (no `Co-authored-by: Claude`, no `Generated-by`). No PR-style summaries in the commit body.

Examples that match the existing log:

```
extract dhikr collection to shared module
replace inner-html writes with safe text and node ops in chrome popup
auto-dismiss chrome dhikr notifications after 60 seconds
drop google fonts link from chrome popup
```

If your commit message needs the word "and", split it.

## Branch and PR workflow

1. Branch from `main`: `git switch -c short-descriptive-name`.
2. Commit atomically as you go. Push the branch.
3. Open a PR. Describe the change in the body, not the title. Link any issue it closes.
4. The maintainer reviews. CI runs `web-ext lint` against both builds and `npm run check-sync`.
5. Squash-merge or merge-commit, depending on whether the branch is already atomic. The maintainer decides.

Force-push only on your own feature branch and only when rebasing on `main`. Never force-push to `main` directly.

## Coding conventions

- Vanilla JavaScript ES2020+. No transpiler.
- Vanilla CSS. No preprocessor.
- Match the surrounding style. The codebase uses 2-space indentation, single quotes, semicolons.
- Use `textContent` and `replaceChildren`, never `innerHTML`. The CSP forbids inline scripts and inline styles; do not work around it.
- Use the `browser` namespace via `import { browser } from '../shared/browser.js'` so the same code runs on Chrome and Firefox.
- Comments explain why, not what. If a comment restates the line below it in English, delete it.

## Voice for documentation

Plain prose. No marketing voice. No buzzwords ("leveraging", "robust", "seamless", "cutting-edge", "showcasing"). No em-dashes. No "delve". If a sentence reads as if a model wrote it, rewrite it as if a person wrote it.

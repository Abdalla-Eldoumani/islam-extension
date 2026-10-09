# Contributing

Pull requests and issues are welcome. The rules below describe what gets merged.

## Setup

```bash
git clone https://github.com/Abdalla-Eldoumani/islam-extension.git
cd islam-extension
npm ci
npm run sync
git config core.hooksPath .githooks
```

Hooks are not installed automatically. `git config core.hooksPath .githooks` points git at the committed hook, which runs the sync check and rejects a commit whose `chrome/shared/` or `firefox/shared/` differs from `shared/`.

Load `chrome/` as an unpacked extension in `chrome://extensions`, and `firefox/manifest.json` as a temporary add-on in `about:debugging`.

## Checks

```bash
npm run check-sync     # shared/ copies match
npm test               # unit tests for the shared modules
npm run lint:chrome    # web-ext lint on the Chrome build
npm run lint:firefox   # web-ext lint on the Firefox build
npm run build:chrome   # chrome-build.zip, without Markdown files
npm run build:firefox  # firefox-build.zip
```

CI runs the first four on every push to `main` and every pull request.

## The rule that overrides everything

Religious content is read-only. The Qur'an text and its translation, the hadith Arabic and its English, the virtue lines, and every fetched hadith are not edited, paraphrased, retranslated, summarised or expanded in a pull request.

If something in religious text looks wrong, open an issue that names the entry and links to the primary source (sunnah.com for hadith, quran.com for verses). The maintainer checks it against the source and makes the change.

Each dhikr in `shared/dhikr.js` carries its source. A new entry needs one too: a hadith as `{ collection, number }` using sunnah.com's numbering, or verses as `{ quran: '20:25-26', translation: 'Saheeh International' }` with the exact text from the Quran.com API. A virtue line is added only with a source graded sahih or hasan.

## Adding a reciter

Reciters come from the providers' own lists, so a reciter one of them publishes appears without code changes. Entries with the same name and style are merged.

## Adding a provider

A new audio provider touches three places:

1. A `fetchXxxReciters` function in `shared/reciter-catalogue.js` returning entries shaped like the others (`id: '<provider>:<rawId>'`, `reciter_name`, `style`, `source`, and whatever the URL needs), added to `fetchReciters`.
2. A branch in `getSuraAudioUrl` in `shared/audio-urls.js` that builds a whole-surah URL. Only providers that serve whole surahs fit the player.
3. The media host in `ALLOWED_MEDIA_HOSTS` in `shared/audio-urls.js` and in both manifests' `media-src`, plus the API host in `host_permissions` (Firefox: `permissions`) and `connect-src`. Describe the host in `docs/PRIVACY.md` and `docs/SECURITY.md`.

Then run `npm run sync`, reload both builds, and play the first and last surah with a reciter from the new provider.

## Adding a language

UI translation is welcome; translating religious content is out of scope (see above). In `shared/i18n.js`, add a table with every key the `en` table has, and keep every `{placeholder}`. `npm test` checks both. Then add the language to the `<select>` in `shared/popup/index.html`.

The popup sets `lang` and `dir` on the root element from the language. For a right-to-left language other than Arabic, extend the `dir` choice in `renderStaticText()` in `shared/popup/popup.js` and in `shared/popup/reminder.js`. The layout uses logical CSS properties, so it mirrors without new rules.

Hadith exist only in the languages the dataset has for both collections. A new language without them falls back to English hadith.

## Commits

- One file per commit. A file under `shared/` is committed together with its two copies, and `package.json` together with `package-lock.json`.
- Lowercase, imperative subject, at most 72 characters. No trailers. No body unless it carries a reason the subject cannot.

Examples from the log:

```
move hadith fetching and caching into the shared module
add a pre-commit guard for shared file drift
```

## Branches and pull requests

1. Branch from `main`: `git switch -c short-descriptive-name`.
2. Commit as you go and push the branch.
3. Open a pull request that says what changed and why, and link the issue it closes.
4. CI must pass. The maintainer reviews and merges.

Force-push only your own feature branch, and never `main`.

## Code

- JavaScript ES2020 and later, plain CSS, no transpiler or preprocessor.
- Match the surrounding style: 2-space indentation, single quotes, semicolons.
- Write to the DOM with `textContent` and `replaceChildren`, never `innerHTML`. The CSP forbids inline scripts and styles; do not work around it.
- Use the API namespace from `shared/browser.js` (`import { browser } from '../browser.js'` inside `shared/popup/`) so one file runs in both browsers.
- Use logical CSS properties (`margin-inline-start`, `inset-inline-end`) so right-to-left needs no extra rules.
- Comments explain why, not what.

## Writing docs

Plain sentences. No marketing tone, no em dashes. Every number or name in a doc must match the code or data it describes.

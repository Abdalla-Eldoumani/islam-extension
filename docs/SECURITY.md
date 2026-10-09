# Security

This document covers the trust boundaries, the checks on third-party data, the content security policy, and how to report a vulnerability.

## Reporting a vulnerability

Email the maintainer at the address on the Chrome Web Store listing, or open a GitHub issue marked `security` for anything already public. Please do not post details of an unpatched vulnerability in a public issue. Expect an answer within 7 days.

## Threat model

The extension runs in the popup, the reminder window, a background context (the Chrome service worker or the Firefox background page) and, on Chrome, an offscreen document that holds the audio element. It has no content scripts and no `<all_urls>` access. What it has to treat with care:

- Responses from the third-party services it calls.
- Values read back from its own storage, which earlier versions wrote in other shapes.
- Its own pages' DOM, where an `innerHTML` write would be a risk.

## Third-party services

| Service | Used for | How its data is treated |
| --- | --- | --- |
| `api.quran.com` | Surah names, the Quran.com reciter list, recitation file addresses. | Untrusted. Every file address must pass the media host allowlist before it reaches an audio element. |
| `www.mp3quran.net` | The MP3Quran reciter list. | Untrusted. Only reciters whose server address is https are listed, and their files must pass the allowlist. |
| `api.alquran.cloud`, `cdn.islamic.network` | Audio editions and the directory of whole-surah files. | Untrusted. Only editions found in the CDN directory with all 114 files are listed, and the built address must pass the allowlist. |
| `cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@df57907be35291c91ad6a6691180e22ca9920784` | Hadith in English, French and Arabic. | Pinned to one commit so the text cannot change under the extension. Every hadith is checked before it is shown or cached (below). To move the pin, change `HADITH_PIN` in `shared/hadith.js` and this table. |

## Checks on third-party data

### Hadith

`shared/hadith.js` keeps a hadith only when:

- the text is a non-empty string of at most 4096 characters,
- it contains none of `<script`, `<iframe`, `<object` or `<embed` (in any case),
- the collection is Sahih al-Bukhari or Sahih Muslim, and the number maps to one sunnah.com page.

A rejected entry is skipped and another is tried, up to eight times. Cached entries are checked again every time they are read. If nothing passes, the popup shows the shahada, labelled as such, and says the hadith could not load.

### Audio addresses

`shared/audio-urls.js` allows only https addresses on `download.quranicaudio.com`, `cdn.islamic.network` or a host ending in `.mp3quran.net`. The popup checks the address before sending it, and the player in the offscreen document or Firefox background page checks it again before setting it as the source. Anything else fails with "Audio source unavailable for this combination", which the popup reports as the reciter being unavailable.

### Messages

The popup's commands go to the background with `runtime.sendMessage`, which only the extension's own pages can use. On Chrome, the offscreen document answers only messages marked for it, and the service worker accepts playback reports only from the offscreen document's URL.

### Rendering

All text reaches the DOM through `textContent` and `replaceChildren`. No page uses `innerHTML`, `eval` or inline event handlers.

## Content security policy

Both manifests declare:

```
default-src 'self';
style-src 'self';
font-src 'self';
media-src https://download.quranicaudio.com https://cdn.islamic.network https://*.mp3quran.net;
connect-src 'self' https://api.quran.com https://api.alquran.cloud https://cdn.islamic.network https://www.mp3quran.net https://cdn.jsdelivr.net;
object-src 'none';
```

There is no `'unsafe-inline'`, no `'unsafe-eval'` and no `data:` source. Scripts and styles load only from the extension package.

## Packaged resources

The fonts (Amiri, Cormorant Garamond and Plus Jakarta Sans, about 315 KB of WOFF2) ship in `assets/fonts/` with their SIL Open Font License texts, so no font service is contacted. Nothing else is loaded from the network at startup, so subresource integrity does not apply. The hadith responses are dynamic; the commit pin and the checks above stand in for it.

## Development dependencies

The only dependency is `web-ext`, used for linting and packaging; nothing from `node_modules` ships in the extension. `package-lock.json` pins the tree, and `overrides` lifts `shell-quote` to a fixed release. `npm audit` still reports `node-forge` (GHSA-86w9-cpqp-85rv) through `web-ext`'s Android debugging dependency: no fixed `node-forge` release exists yet, and the advisory concerns RSA signature verification, which the lint and build commands do not perform.

## Known limits

- The hadith and surah-list requests are not rate limited; reopening the popup quickly repeats them.
- `storage.local` holds well under 1 MB in normal use.
- The Firefox build stays on Manifest V2 until Firefox can keep extension audio playing under Manifest V3; see `MV3_MIGRATION.md`.

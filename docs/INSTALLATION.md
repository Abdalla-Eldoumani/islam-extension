# Installation

## Chrome (Chrome Web Store)

The published version lives at the [Chrome Web Store listing](https://chromewebstore.google.com/detail/quran-sunnah-companion/okkohadnmodfaienacdlfaledjblcbka). Click "Add to Chrome" and pin the extension from the toolbar's puzzle-piece icon.

## Chrome (manual, unpacked)

Use this when you want to run a local fork or test changes before they ship.

1. Clone or download the repository.
2. Run `npm install` and `npm run sync` so `chrome/shared/` is populated.
3. Open `chrome://extensions`.
4. Toggle **Developer mode** in the top right.
5. Click **Load unpacked** and select the `chrome/` directory.
6. The extension appears in the toolbar.

## Firefox (temporary, for development)

This is the standard development workflow on Firefox. The temporary load disappears when you close Firefox.

1. Run `npm install` and `npm run sync`.
2. Open `about:debugging`.
3. Click **This Firefox** in the left sidebar.
4. Click **Load Temporary Add-on**.
5. Select `firefox/manifest.json`.

## Firefox (permanent, signed XPI)

For long-term installation you need a signed XPI. The Mozilla Add-ons review process produces this.

1. Submit the unpacked `firefox/` directory to [addons.mozilla.org](https://addons.mozilla.org/) for self-distribution or listed distribution.
2. After review, Mozilla returns a signed XPI.
3. Install the XPI from `about:addons` -> gear icon -> **Install Add-on From File**.

If you do not want to wait for review, run unsigned add-ons by switching to Firefox Developer Edition or Nightly and setting `xpinstall.signatures.required` to `false` in `about:config`.

## Microsoft Edge

Edge is Chromium-based. Use the Chrome unpacked instructions and load the `chrome/` directory at `edge://extensions`. All features work identically.

## Brave

Same as Chrome. Note that Brave's shields can block third-party requests. If hadith fails to load, open the shields panel for the extension and allow the listed CDNs (or disable shields for the extension's host).

## Other Chromium browsers

Vivaldi, Opera, Arc, etc. all accept the unpacked `chrome/` build via their `extensions://` page. Behaviour is identical to Chrome.

## Updating after manual install

Run `npm run sync` after pulling changes. Then click the reload button in `chrome://extensions` (or remove and re-load the temporary add-on in Firefox).

## Verifying the install

After loading, click the toolbar icon. The popup should open with three sections: Qur'an, Hadith, Dhikr. The first time you open it, the reciter list takes a few seconds to populate while it fetches from three providers.

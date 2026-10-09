# Installation

## Chrome Web Store

The published version is on the [Chrome Web Store](https://chromewebstore.google.com/detail/quran-sunnah-companion/okkohadnmodfaienacdlfaledjblcbka). Click **Add to Chrome**, then pin the extension from the puzzle-piece menu in the toolbar.

## Chrome, unpacked

Use this to run a local copy or test changes before they ship.

1. Clone or download the repository.
2. If you changed anything in `shared/`, run `npm ci` and `npm run sync` so `chrome/shared/` matches.
3. Open `chrome://extensions` and turn on **Developer mode**.
4. Click **Load unpacked** and select the `chrome/` directory.

## Firefox, temporary

The usual way to run the repository version. The add-on is removed when Firefox closes.

1. If you changed anything in `shared/`, run `npm ci` and `npm run sync`.
2. Open `about:debugging` and choose **This Firefox**.
3. Click **Load Temporary Add-on** and select `firefox/manifest.json`.

## Firefox, permanent

Release and Beta versions of Firefox install only add-ons signed by Mozilla. To get a signed file, submit the package from `npm run build:firefox` to [addons.mozilla.org](https://addons.mozilla.org/developers/), listed or for self-distribution, and install the signed XPI it returns from `about:addons` (gear menu, **Install Add-on From File**).

Firefox ESR, Developer Edition and Nightly can run unsigned add-ons after `xpinstall.signatures.required` is set to `false` in `about:config`.

## Microsoft Edge, Brave and other Chromium browsers

Load the `chrome/` directory as an unpacked extension from the browser's extensions page (`edge://extensions` in Edge). Brave's Shields can block the extension's requests; if surahs, reciters or hadith do not load, allow the hosts listed in `PRIVACY.md`.

## Updating a manual install

After pulling changes, run `npm run sync`, then press the reload button on the extensions page, or remove and load the temporary add-on again in Firefox.

## Checking the install

Click the toolbar icon. The popup opens with three sections: Qur'an, Hadith and Dhikr. The first time, the reciter list takes a few seconds while the three catalogues load; after that it is cached for six hours.

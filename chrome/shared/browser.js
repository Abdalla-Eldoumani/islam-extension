// Cross-browser API namespace. Firefox exposes the WebExtensions API on
// `browser`. Chrome exposes the same shape on `chrome`, with promise support
// since Chrome 113. Both popup contexts and the MV3 service worker / MV2
// background page can use this same import.

const _g = globalThis;
export const browser = (typeof _g.browser !== 'undefined' && _g.browser?.runtime)
  ? _g.browser
  : _g.chrome;

export const isFirefox = (typeof _g.browser !== 'undefined' && _g.browser?.runtime)
  && !(_g.chrome && _g.chrome.offscreen);

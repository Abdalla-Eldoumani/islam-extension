# Firefox Manifest V3 migration

The Firefox build runs on Manifest V2 with a persistent background page. This document tracks why we have not migrated to MV3 yet and what changes when we do.

## Why MV2 today

Audio playback in Manifest V3 requires either an offscreen document (Chrome only) or a service worker that owns long-lived audio. Chrome ships the offscreen API. Firefox does not. Firefox MV3 service workers terminate after idle, the same as Chrome MV3 service workers, but Firefox has no equivalent of the offscreen document.

Until Firefox ships an offscreen API or extends event-page semantics for media playback, an MV3 Firefox build cannot reliably keep audio playing after the popup closes.

Mozilla has signalled MV2 will be supported through at least 2027. The 2027 horizon is far enough that a careful migration plan is appropriate, not an emergency.

## What changes on migration

When Firefox ships the missing pieces, the migration is largely a manifest swap plus background-page restructuring.

- `firefox/manifest.json` — bump to `manifest_version: 3`. Replace `background.page` with the equivalent of `background.service_worker` and the appropriate offscreen permission.
- `firefox/background/background.html` and `background.js` — restructure as a service worker that creates an offscreen document on first audio message, the same pattern Chrome already uses.
- `firefox/offscreen/` — restore the offscreen document we removed during code consolidation. The structure mirrors `chrome/offscreen/` exactly; ideally `shared/` grows an offscreen module to remove the new duplication.
- `permissions` — add `offscreen` if Firefox names the API the same way Chrome does.
- `browser_action` — rename to `action` (MV3 convention).
- `web_accessible_resources` — switch from the array form to the object form (MV3 requirement).
- Host permissions — move from the `permissions` array to a separate `host_permissions` array (MV3 requirement).

The audio path, message contracts, and storage schema do not change. The popup, the dhikr scheduler, the reciter catalogue, and the hadith fetchers all stay as they are.

## Risks

- **Audio API parity** — the Firefox offscreen-equivalent API may differ enough that `shared/browser.js` needs more polyfilling than today.
- **Persistent background loss** — MV2's `persistent: true` means the script never dies. MV3 service workers always die. Any code that assumed long-lived module state moves to `chrome.storage.local`.
- **Audio state restoration** — when the worker dies mid-playback, the offscreen document keeps audio alive but the worker loses its in-memory state. The current Chrome build already handles this; Firefox will need the same handling.

## Tracking

This document is the single source of truth for the migration plan. When Firefox ships the missing piece, edit this file with the date, the API name, and the migration commit hash so future contributors know where to look.

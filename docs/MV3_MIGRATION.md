# Firefox Manifest V3 migration

The Firefox build uses Manifest V2 with a persistent background page. This note records why, and what a Manifest V3 Firefox build would need.

## Why Manifest V2 today

Recitation has to keep playing after the popup closes, so some extension context must hold the audio element for as long as a surah plays.

- Chrome's Manifest V3 uses service workers, which have no DOM and stop when idle. Chrome provides the offscreen document to hold audio; the Chrome build uses it.
- Firefox's Manifest V3 runs background scripts as event pages: DOM pages that Firefox unloads when they are idle. Firefox has no offscreen document. An event page holding an audio element is not guaranteed to stay loaded while it plays, so the build would need a way to keep playback alive.

A Manifest V2 background page with `persistent: true` stays loaded, and the Firefox build plays audio there.

In its [March 2024 update](https://blog.mozilla.org/addons/2024/03/13/manifest-v3-manifest-v2-march-2024-update/), Mozilla said Firefox has no plans to deprecate Manifest V2 and will support it for the foreseeable future, with at least 12 months' notice if that changes.

## What would change

- `firefox/manifest.json`: `manifest_version: 3`; `background.scripts` for the event page; host entries moved from `permissions` to `host_permissions`; `browser_action` renamed to `action`; the CSP moved under `content_security_policy.extension_pages`.
- `firefox/background/background.js`: no module-level state that must outlive an unload. Reminders and stored playback state already live in storage and alarms (`shared/reminders.js`, `shared/playback.js`), so they carry over; the open question is only the audio element.
- The popup, the reminder window, the reciter catalogue and the hadith module stay as they are.

## Risks

- **Playback stopping when the event page unloads**: the main reason not to migrate yet. Test a full long surah with the popup closed before shipping.
- **Resume after an unload**: `getAudioState` already falls back to the stored state when no player holds a track, and `resumeAudio` restarts from it, which is the same path Chrome uses when its offscreen document closes.

## Tracking

When Firefox offers a way to keep extension audio playing under Manifest V3, record the date, the API and the migration commit here.

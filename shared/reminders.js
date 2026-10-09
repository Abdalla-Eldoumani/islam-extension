// Dhikr reminders for both builds. The schedule, the settings and the
// reminder on screen all live in alarms and storage, so a Chrome service
// worker can be stopped between reminders without losing anything.

import { browser } from './browser.js';
import { dhikrCollection, randomDhikrIndex, virtueFor } from './dhikr.js';
import { LANG_STORAGE_KEY, resolveLang, translate } from './i18n.js';
import { sourceLabel } from './sources.js';

export const MIN_INTERVAL_SECONDS = 30;
export const MAX_INTERVAL_SECONDS = 3600;
export const REMINDER_MODES = ['notification', 'popup'];

const SETTINGS_KEY = 'dhikrSettings';
const SHOWN_KEY = 'shownReminder';
const REMINDER_ALARM = 'dhikr-reminder';
const DISMISS_ALARM = 'dhikr-dismiss';
const NOTIFICATION_ID = 'dhikr-reminder';
const DISMISS_AFTER_MINUTES = 1;
const DEFAULTS = { notificationsEnabled: false, interval: 60, mode: 'notification' };

// Firefox accepts only type, title, message and iconUrl in a notification.
const isFirefox = typeof browser?.runtime?.getBrowserInfo === 'function';

export function isValidInterval(seconds) {
  return Number.isInteger(seconds) && seconds >= MIN_INTERVAL_SECONDS && seconds <= MAX_INTERVAL_SECONDS;
}

export async function getReminderSettings() {
  const { [SETTINGS_KEY]: saved } = await browser.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULTS, ...saved };
}

async function notificationsBlocked() {
  if (typeof browser.notifications.getPermissionLevel !== 'function') return false;
  return (await browser.notifications.getPermissionLevel()) === 'denied';
}

function schedule(seconds) {
  const minutes = seconds / 60;
  return browser.alarms.create(REMINDER_ALARM, { delayInMinutes: minutes, periodInMinutes: minutes });
}

// Validates and stores the popup's settings, then starts, moves or stops the
// schedule. A mode change alone needs no new alarm: the mode is read when the
// alarm fires.
export async function applyReminderSettings(next) {
  const settings = {
    notificationsEnabled: next?.notificationsEnabled === true,
    interval: next?.interval,
    mode: next?.mode
  };
  if (!isValidInterval(settings.interval) || !REMINDER_MODES.includes(settings.mode)) {
    throw new Error('invalid-settings');
  }
  if (settings.notificationsEnabled && settings.mode === 'notification' && await notificationsBlocked()) {
    throw new Error('notifications-blocked');
  }
  const previous = await getReminderSettings();
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
  if (!settings.notificationsEnabled) {
    await browser.alarms.clear(REMINDER_ALARM);
    await dismissReminder();
  } else if (!previous.notificationsEnabled || previous.interval !== settings.interval
      || !(await browser.alarms.get(REMINDER_ALARM))) {
    await schedule(settings.interval);
  }
  return settings;
}

// On browser start and on install or update: bring back a schedule that
// should exist and clear a reminder left over from the last session.
export async function restoreReminders() {
  await dismissReminder();
  const settings = await getReminderSettings();
  if (!settings.notificationsEnabled) {
    await browser.alarms.clear(REMINDER_ALARM);
  } else if (!(await browser.alarms.get(REMINDER_ALARM)) && isValidInterval(settings.interval)) {
    await schedule(settings.interval);
  }
}

export async function handleReminderAlarm(alarm) {
  if (alarm.name === REMINDER_ALARM) await showReminder();
  else if (alarm.name === DISMISS_ALARM) await dismissReminder();
}

async function uiLanguage() {
  const { [LANG_STORAGE_KEY]: saved } = await browser.storage.local.get(LANG_STORAGE_KEY);
  return resolveLang(saved, browser.i18n?.getUILanguage?.());
}

function notificationOptions(dhikr, lang) {
  const lines = [dhikr.arabic];
  if (lang !== 'ar') lines.push(dhikr.english);
  const virtue = virtueFor(dhikr, lang);
  if (virtue) lines.push(virtue.text);
  lines.push(sourceLabel(dhikr.source, lang));
  const options = {
    type: 'basic',
    iconUrl: browser.runtime.getURL('assets/icon128.png'),
    title: translate(lang, 'reminderTitle'),
    message: lines.join('\n')
  };
  if (!isFirefox) {
    options.requireInteraction = true;
    options.priority = 2;
  }
  return options;
}

async function showReminder() {
  const settings = await getReminderSettings();
  if (!settings.notificationsEnabled) {
    await browser.alarms.clear(REMINDER_ALARM);
    return;
  }
  await dismissReminder();
  const index = randomDhikrIndex();
  let shown;
  if (settings.mode === 'popup') {
    const win = await browser.windows.create({
      url: browser.runtime.getURL(`shared/popup/reminder.html?dhikr=${index}`),
      type: 'popup',
      width: 440,
      height: 520
    });
    shown = { windowId: win.id };
  } else {
    const lang = await uiLanguage();
    await browser.notifications.create(NOTIFICATION_ID, notificationOptions(dhikrCollection[index], lang));
    shown = { notificationId: NOTIFICATION_ID };
  }
  await browser.storage.local.set({ [SHOWN_KEY]: shown });
  await browser.alarms.create(DISMISS_ALARM, { delayInMinutes: DISMISS_AFTER_MINUTES });
}

async function dismissReminder() {
  const { [SHOWN_KEY]: shown } = await browser.storage.local.get(SHOWN_KEY);
  await browser.alarms.clear(DISMISS_ALARM);
  if (!shown) return;
  await browser.storage.local.remove(SHOWN_KEY);
  // Either may already be gone if the user closed it.
  if (shown.notificationId) await browser.notifications.clear(shown.notificationId).catch(() => {});
  if (shown.windowId != null) await browser.windows.remove(shown.windowId).catch(() => {});
}

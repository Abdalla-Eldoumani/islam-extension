import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// A small in-memory stand-in for the extension APIs the scheduler uses. It is
// installed before the module loads because browser.js picks its namespace
// at import time.
const state = { storage: new Map(), alarms: new Map(), notifications: new Set(), windows: new Set(), nextWindow: 1 };
globalThis.chrome = {
  runtime: { getURL: (path) => `chrome-extension://test/${path}` },
  i18n: { getUILanguage: () => 'en-US' },
  storage: {
    local: {
      async get(key) { return state.storage.has(key) ? { [key]: structuredClone(state.storage.get(key)) } : {}; },
      async set(items) { for (const [k, v] of Object.entries(items)) state.storage.set(k, structuredClone(v)); },
      async remove(key) { state.storage.delete(key); }
    }
  },
  alarms: {
    async create(name, info) { state.alarms.set(name, info); },
    async clear(name) { return state.alarms.delete(name); },
    async get(name) { return state.alarms.has(name) ? { name, ...state.alarms.get(name) } : undefined; }
  },
  notifications: {
    async getPermissionLevel() { return 'granted'; },
    async create(id) { state.notifications.add(id); return id; },
    async clear(id) { return state.notifications.delete(id); }
  },
  windows: {
    async create() { const id = state.nextWindow++; state.windows.add(id); return { id }; },
    async remove(id) { if (!state.windows.delete(id)) throw new Error('No window'); }
  }
};

const {
  isValidInterval,
  applyReminderSettings,
  getReminderSettings,
  restoreReminders,
  handleReminderAlarm
} = await import('../shared/reminders.js');

beforeEach(() => {
  state.storage.clear();
  state.alarms.clear();
  state.notifications.clear();
  state.windows.clear();
});

test('isValidInterval accepts whole seconds from 30 to 3600', () => {
  for (const ok of [30, 60, 900, 3600]) assert.equal(isValidInterval(ok), true);
  for (const bad of [29, 3601, 0, -5, 45.5, '60', NaN, null, undefined]) assert.equal(isValidInterval(bad), false);
});

test('enabling stores the settings and schedules an alarm at the interval', async () => {
  await applyReminderSettings({ notificationsEnabled: true, interval: 30, mode: 'popup' });
  assert.deepEqual(await getReminderSettings(), { notificationsEnabled: true, interval: 30, mode: 'popup' });
  assert.deepEqual(state.alarms.get('dhikr-reminder'), { delayInMinutes: 0.5, periodInMinutes: 0.5 });
});

test('changing only the mode keeps the running schedule', async () => {
  await applyReminderSettings({ notificationsEnabled: true, interval: 300, mode: 'notification' });
  state.alarms.set('dhikr-reminder', { marker: 'original' });
  await applyReminderSettings({ notificationsEnabled: true, interval: 300, mode: 'popup' });
  assert.deepEqual(state.alarms.get('dhikr-reminder'), { marker: 'original' });
  assert.equal((await getReminderSettings()).mode, 'popup');
});

test('invalid settings are refused and nothing is stored', async () => {
  await assert.rejects(applyReminderSettings({ notificationsEnabled: true, interval: 5, mode: 'popup' }), /invalid-settings/);
  await assert.rejects(applyReminderSettings({ notificationsEnabled: true, interval: 60, mode: 'banner' }), /invalid-settings/);
  assert.equal(state.storage.has('dhikrSettings'), false);
  assert.equal(state.alarms.size, 0);
});

test('a reminder window opens on the alarm and closes on the dismiss alarm', async () => {
  await applyReminderSettings({ notificationsEnabled: true, interval: 60, mode: 'popup' });
  await handleReminderAlarm({ name: 'dhikr-reminder' });
  assert.equal(state.windows.size, 1);
  assert.ok(state.alarms.has('dhikr-dismiss'));
  await handleReminderAlarm({ name: 'dhikr-dismiss' });
  assert.equal(state.windows.size, 0);
  assert.equal(state.storage.has('shownReminder'), false);
});

test('a notification replaces the previous one and turning reminders off clears it', async () => {
  await applyReminderSettings({ notificationsEnabled: true, interval: 60, mode: 'notification' });
  await handleReminderAlarm({ name: 'dhikr-reminder' });
  await handleReminderAlarm({ name: 'dhikr-reminder' });
  assert.deepEqual([...state.notifications], ['dhikr-reminder']);
  await applyReminderSettings({ notificationsEnabled: false, interval: 60, mode: 'notification' });
  assert.equal(state.notifications.size, 0);
  assert.equal(state.alarms.has('dhikr-reminder'), false);
});

test('restoreReminders brings back a missing schedule and shows nothing', async () => {
  state.storage.set('dhikrSettings', { notificationsEnabled: true, interval: 900, mode: 'notification' });
  await restoreReminders();
  assert.deepEqual(state.alarms.get('dhikr-reminder'), { delayInMinutes: 15, periodInMinutes: 15 });
  assert.equal(state.notifications.size, 0);
  assert.equal(state.windows.size, 0);
});

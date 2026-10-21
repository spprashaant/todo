// The Android app (Capacitor): reminders as local notifications (each on a notification channel made for
// the sound chosen in the Reminder Sound panel, sounds.js), the back button and the launcher shortcuts.
// In a browser `isNative()` is false, `initNative()` returns at once and nothing here runs, so the web app
// is exactly as before. The pure parts (desiredReminders, diffReminders, reminderId, channelFor,
// channelSpec, handleBack) are plain functions so they can be checked outside the phone.
import { state, ui, subscribe, getTodo, contextTitle } from './store.js';
import * as router from './router.js';
import * as composer from './composer.js';
import * as quickfind from './quickfind.js';
import * as detail from './detail.js';
import * as when from './when.js';
import * as account from './account.js';
import * as sounds from './sounds.js';
import { reminderSound, soundInfo, onSoundChange } from './sounds.js';
import { canRemind, isTime } from './when.js';
import { isDate, iso } from './dates.js';

export const CHANNEL_ID = 'todos_reminders';
export const MAX_REMINDERS = 50;
const ASKED_NOTIFY_KEY = 'todos-native-asked-notifications';
const ASKED_EXACT_KEY = 'todos-native-asked-exact-alarms';
const RECONCILE_DELAY = 400;

/** True inside the Android app. Capacitor's bridge defines window.Capacitor before any page script runs. */
export const isNative = () => !!window.Capacitor?.isNativePlatform?.();

// ---------- reminders: pure ----------

/** A stable positive 31-bit notification id for a to-do id (FNV-1a), never 0. */
export function reminderId(todoId) {
  let h = 0x811c9dc5;
  const s = String(todoId);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 1) || 1;
}

/** The moment a reminder fires: "HH:MM" on a "YYYY-MM-DD" day, local time. */
export function reminderAt(day, hm) {
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = hm.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

/**
 * The notification channel a sound's reminders go on. Android fixes a channel's sound when the channel is
 * created, so each choice has a channel of its own: the original `todos_reminders` for the phone's default
 * sound, `todos_reminders_<key>` for the others. An unknown sound is Default.
 */
export const channelFor = sound => { const k = soundInfo(sound).key; return k === 'default' ? CHANNEL_ID : `${CHANNEL_ID}_${k}`; };

/**
 * What createChannel() is given for a sound. Silent is Android's own silent notification (importance 2:
 * shown, no sound, no vibration). The others alert (importance 4), with the bundled file from res/raw as
 * the channel's sound or, for Default, none named, which leaves the phone's notification sound.
 */
export function channelSpec(sound) {
  const s = soundInfo(sound), silent = s.key === 'silent';
  return {
    id: channelFor(s.key), name: 'Reminders', description: 'Reminders you set on to-dos',
    importance: silent ? 2 : 4, visibility: 1, vibration: !silent,
    ...(s.file ? { sound: s.file } : {}),
  };
}

/**
 * The notifications the phone should hold right now: one per open to-do that has a reminder on a day
 * (Today, This Evening or a date; Someday and no-date can't carry one), at a time still ahead of `now`.
 * Today and This Evening fire today, so a to-do left in Today reminds again tomorrow at the same time.
 * Nearest first, at most MAX_REMINDERS. Returns [{ id, todoId, title, body, at }].
 */
export function desiredReminders(todos, now = new Date()) {
  const today = iso(now);
  const out = [];
  for (const t of todos || []) {
    if (!t || t.completed) continue;
    if (!canRemind(t.when) || !isTime(t.reminder)) continue;
    const at = reminderAt(isDate(t.when) ? t.when : today, t.reminder);
    if (!(at.getTime() > now.getTime())) continue;
    out.push({ id: reminderId(t.id), todoId: t.id, title: t.title || 'To-Do', body: contextTitle(t) || 'Reminder', at });
  }
  out.sort((a, b) => a.at - b.at || (a.todoId < b.todoId ? -1 : a.todoId > b.todoId ? 1 : 0));
  return out.slice(0, MAX_REMINDERS);
}

/** What `getPending()` gave back for one of ours: its time as scheduled (kept in `extra`, the plugin's own `at` is a string whose form varies). */
function pendingAt(p) {
  const ms = p.extra?.at;
  if (typeof ms === 'number') return ms;
  const d = p.schedule?.at ? new Date(p.schedule.at) : null;
  return d && !Number.isNaN(d.getTime()) ? d.getTime() : NaN;
}

/**
 * Compares the phone's pending notifications with what is wanted. Pending ones of ours (they carry
 * `extra.todoId`) that are no longer wanted, or whose time, title or body changed, are cancelled; wanted
 * ones that are missing or changed are scheduled. Other apps' notifications don't exist here, and
 * anything pending without `extra.todoId` is left alone. With `exact` given, a pending reminder that was
 * scheduled the other way (inexact while exact alarms were off, or the reverse) is re-scheduled too. With
 * `sound` given, one scheduled for another sound (so on another channel: `extra.sound`; a reminder from
 * before there was a choice is on the default channel) is re-scheduled as well.
 * Returns { cancel: [id], schedule: [desired] }.
 */
export function diffReminders(pending, desired, exact, sound) {
  const want = new Map(desired.map(d => [d.id, d]));
  const wantSound = sound === undefined ? undefined : soundInfo(sound).key;
  const cancel = [], keep = new Set();
  for (const p of pending || []) {
    if (!p || p.extra?.todoId == null) continue;
    const d = want.get(p.id);
    const sameExact = exact === undefined || p.extra.exact === undefined || p.extra.exact === !!exact;
    const sameSound = wantSound === undefined || (p.extra.sound ?? 'default') === wantSound;
    const same = d && sameExact && sameSound && pendingAt(p) === d.at.getTime() && p.title === d.title && p.body === d.body && p.extra.todoId === d.todoId;
    if (same) keep.add(p.id);
    else cancel.push(p.id);
  }
  return { cancel, schedule: desired.filter(d => !keep.has(d.id)) };
}

/**
 * The plugin's shape of one wanted reminder. `exact` says whether the phone lets this app set exact alarms
 * (Android 12+): with it the alarm fires at the minute; without it Android may deliver it minutes late.
 * It is passed explicitly because the plugin, left to its default (exact), opens the "Alarms & reminders"
 * settings screen from inside every schedule() call it can't honour, and reconcile() runs on every change.
 * `sound` is the chosen reminder sound: on Android 8+ the channel's (channelFor) is what plays, and the
 * file named in `sound` is what Android 7 plays (it has no channels; silent.wav keeps Silent silent there).
 */
export function toNotification(d, exact = true, sound = 'default') {
  const s = soundInfo(sound);
  return {
    id: d.id,
    title: d.title,
    body: d.body,
    schedule: { at: d.at, allowWhileIdle: true },
    channelId: channelFor(s.key),
    ...(s.key === 'default' ? {} : { sound: s.file || 'silent.wav' }),
    isExactNotification: !!exact,
    extra: { todoId: d.todoId, at: d.at.getTime(), exact: !!exact, sound: s.key },
  };
}

// ---------- back button: pure ----------

/**
 * One press of the Android back button: closes the topmost thing and says what it did. The caller
 * minimises the app on 'minimize'. Order: Quick Find, the When picker, a card menu, the Sync panel, the
 * Reminder Sound panel, the open to-do card, the composer, then (phone layout) back to the lists home,
 * then out of the app.
 */
export function handleBack() {
  if (quickfind.isOpen()) { quickfind.close(); return 'quickfind'; }
  if (when.isOpen()) { when.close(); return 'when'; }
  if (detail.menuOpen()) { detail.closeMenu(); return 'menu'; }
  if (account.isOpen()) { account.close(); return 'sync'; }
  if (sounds.isOpen()) { sounds.close(); return 'sounds'; }
  if (detail.isOpen()) { detail.close(); return 'detail'; }
  if (ui.composing) { composer.close(); return 'composer'; }
  if (ui.layout === 'phone' && router.parse().view !== 'lists') { router.go('#/lists'); return 'lists'; }
  return 'minimize';
}

// ---------- launch URLs: pure ----------

/** "dev.coderlog.todos://new" -> "new"; anything else -> null. */
export function launchAction(url) {
  const m = /^dev\.coderlog\.todos:\/\/([a-z]+)\/?(?:[?#].*)?$/i.exec(String(url || '').trim());
  const a = m && m[1].toLowerCase();
  return a === 'new' || a === 'today' || a === 'search' ? a : null;
}

/** Runs `fn` once the app has drawn `hash` (a hashchange is async; the screen is drawn in its handler). */
function afterRoute(hash, fn) {
  const next = () => requestAnimationFrame(() => requestAnimationFrame(fn));
  const same = location.hash === hash || (hash === '#/' && (location.hash === '' || location.hash === '#'));
  if (same) return next();
  window.addEventListener('hashchange', next, { once: true });
  router.go(hash);
}

/** What a shortcut does, in the running app. */
export function runLaunchAction(action) {
  if (action === 'new') {
    afterRoute('#/today', () => { if (ui.editingId) detail.close(); composer.open(); });
  } else if (action === 'today') {
    router.go('#/today');
  } else if (action === 'search') {
    quickfind.open({ route: router.parse() });
  }
}

/** A tapped reminder: Today, with the to-do's card open if it is still there and still open. */
export function openReminder(todoId) {
  afterRoute('#/today', () => {
    const t = todoId != null ? getTodo(String(todoId)) : null;
    if (t && !t.completed) detail.open(t.id);
  });
}

// ---------- native only ----------
let LN = null, App = null;
let reconcileTimer = 0, reconciling = null, reconcileAgain = false;
let channelReady = null; // the sound whose channel this run of the app has created (see ensureChannel)
let lastUrl = '', lastUrlAt = 0;

/**
 * Starts the native glue. Returns immediately in a browser. On the phone it loads the vendored Capacitor
 * runtime, registers the two plugins, reconciles the reminders now (which makes the chosen sound's
 * notification channel), on every store change (debounced), on a change of sound and on resume, and wires
 * the back button, notification taps and the launcher shortcuts. Nothing here throws into the app: every
 * failure is logged and swallowed.
 */
export async function initNative() {
  if (!isNative()) return;
  try {
    const { registerPlugin } = await import('../vendor/capacitor-core.mjs');
    LN = registerPlugin('LocalNotifications');
    App = registerPlugin('App');
  } catch (err) {
    console.warn('native: Capacitor runtime unavailable', err);
    LN = App = null;
    return;
  }
  App.addListener('backButton', () => { if (handleBack() === 'minimize') App.minimizeApp().catch(() => {}); }).catch(() => {});
  App.addListener('resume', () => reconcile()).catch(() => {});
  App.addListener('appUrlOpen', ({ url }) => handleUrl(url)).catch(() => {});
  LN.addListener('localNotificationActionPerformed', e => openReminder(e?.notification?.extra?.todoId)).catch(() => {});

  // the shortcut the app was started from (a warm start reaches appUrlOpen instead; both are handled once)
  App.getLaunchUrl().then(r => { if (r?.url) handleUrl(r.url); }).catch(() => {});

  subscribe(() => {
    clearTimeout(reconcileTimer);
    reconcileTimer = setTimeout(() => reconcile(), RECONCILE_DELAY);
  });
  onSoundChange(() => reconcile()); // the pending reminders move to the new sound's channel
  reconcile();
}

function handleUrl(url) {
  const action = launchAction(url);
  if (!action) return;
  const now = Date.now();
  if (url === lastUrl && now - lastUrlAt < 2000) return; // a cold start reports the launch URL twice
  lastUrl = url; lastUrlAt = now;
  runLaunchAction(action);
}

/**
 * Notification permission (Android 13+), asked for once, the first time there is something to remind
 * about; a refusal is respected and never asked about again (the system settings can turn it on later).
 * Returns whether we may schedule.
 */
async function ensurePermission() {
  let { display } = await LN.checkPermissions();
  if (display !== 'granted' && !localStorage.getItem(ASKED_NOTIFY_KEY)) {
    localStorage.setItem(ASKED_NOTIFY_KEY, '1');
    ({ display } = await LN.requestPermissions());
  }
  return display === 'granted';
}

/**
 * Whether the app may set exact alarms (Android 12+; always on older phones). The manifest asks for
 * USE_EXACT_ALARM, which Android 13+ grants outright, so this is normally true; on Android 12 the user can
 * switch it off under "Alarms & reminders", and the one time that is seen the settings screen is offered.
 * Reminders are still scheduled either way (inexact when it is off), so nothing here ever loops.
 */
async function exactAllowed() {
  try {
    let { exact_alarm } = await LN.checkExactNotificationSetting();
    if (exact_alarm !== 'granted' && !localStorage.getItem(ASKED_EXACT_KEY)) {
      localStorage.setItem(ASKED_EXACT_KEY, '1');
      ({ exact_alarm } = await LN.changeExactNotificationSetting());
    }
    return exact_alarm === 'granted';
  } catch (err) {
    console.warn('native: exact alarm setting', err);
    return false;
  }
}

/**
 * Makes sure the channel for `sound` exists, once per run of the app and per sound (channelSpec; Android
 * ignores a second creation with the same id, apart from an importance it may lower). True when it was
 * created now: the caller then prunes the other channels once the reminders are on this one. A phone
 * without channels (Android 7) has nothing to create.
 */
async function ensureChannel(sound) {
  if (channelReady === sound) return false;
  try {
    await LN.createChannel(channelSpec(sound));
  } catch (err) {
    if (err?.code !== 'UNAVAILABLE') { console.warn('native: createChannel', err); return false; }
  }
  channelReady = sound;
  return true;
}

/**
 * Deletes our channels other than `keep`, so the phone's notification settings list one "Reminders" and
 * not one per sound ever chosen. Android keeps a deleted channel's settings and restores them if the
 * channel comes back (that sound chosen again), so nothing set there is lost. Deleting a channel also
 * clears a reminder of its that is still showing; the pending ones were moved first, so none is left on it.
 */
async function pruneChannels(keep) {
  try {
    const { channels } = await LN.listChannels();
    for (const c of channels || []) {
      if (c?.id && c.id !== keep && c.id.startsWith(CHANNEL_ID)) await LN.deleteChannel({ id: c.id });
    }
  } catch (err) {
    if (err?.code !== 'UNAVAILABLE') console.warn('native: channels', err);
  }
}

/**
 * Makes the phone's pending notifications match desiredReminders(), on the channel of the chosen sound.
 * Runs one at a time; a call during a run queues one more run after it, so the last change always wins.
 */
export function reconcile() {
  if (!LN) return Promise.resolve();
  if (reconciling) { reconcileAgain = true; return reconciling; }
  reconciling = (async () => {
    try {
      const sound = reminderSound();
      const desired = desiredReminders(state.todos, new Date());
      const pending = (await LN.getPending()).notifications || [];
      const fresh = await ensureChannel(sound);
      if (!desired.length || await ensurePermission()) {
        const exact = desired.length ? await exactAllowed() : true;
        const { cancel, schedule } = diffReminders(pending, desired, exact, sound);
        if (cancel.length) await LN.cancel({ notifications: cancel.map(id => ({ id })) });
        if (schedule.length) {
          const r = await LN.schedule({ notifications: schedule.map(d => toNotification(d, exact, sound)) });
          if (r?.warning) console.warn('native: schedule', r.warning);
        }
      }
      if (fresh) await pruneChannels(channelFor(sound));
    } catch (err) {
      console.warn('native: reconcile', err);
    } finally {
      reconciling = null;
      if (reconcileAgain) { reconcileAgain = false; reconcile(); }
    }
  })();
  return reconciling;
}

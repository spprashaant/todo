// Plain Node check of the Android app's reminder maths (app/js/native.js): desiredReminders,
// diffReminders, reminderId, the channel per reminder sound (channelFor, channelSpec) and the sound choice
// itself (app/js/sounds.js) with its bundled files. No browser, no phone. Prints NATIVE GREEN / NATIVE RED.
//   node scripts/native-check.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The app's modules expect a window (store.js listens for other tabs' changes at load). A stub is enough.
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
const mem = new Map(); // a localStorage that remembers, for the sound choice
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };

const native = await import('../app/js/native.js');
const store = await import('../app/js/store.js');
const sounds = await import('../app/js/sounds.js');
const { desiredReminders, diffReminders, reminderId, reminderAt, toNotification, launchAction, channelFor, channelSpec, MAX_REMINDERS, CHANNEL_ID } = native;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const NOW = new Date(2026, 9, 16, 9, 0, 0); // Fri 16 Oct 2026 09:00 local
const todo = (id, extra = {}) => ({
  id, title: `Todo ${id}`, completed: false, completedAt: null, notes: '', checklist: [], when: null, deadline: null,
  tags: [], project: null, area: null, heading: null, createdAt: null, repeat: null, series: null, nextId: null, ...extra,
});
const ids = rs => rs.map(r => r.todoId);
const results = [];
const check = (name, fn) => { try { fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name, String(e.message || e).split('\n')[0]]); } };

check('completed, someday, no-date and no-reminder to-dos are excluded', () => {
  const rs = desiredReminders([
    todo('done', { when: 'today', reminder: '18:00', completed: true }),
    todo('someday', { when: 'someday', reminder: '18:00' }),
    todo('nodate', { when: null, reminder: '18:00' }),
    todo('notime', { when: 'today', reminder: null }),
    todo('badtime', { when: 'today', reminder: '25:00' }),
    todo('ok', { when: 'today', reminder: '18:00' }),
  ], NOW);
  assert.deepEqual(ids(rs), ['ok']);
});

check('past times are excluded, the current minute too', () => {
  const rs = desiredReminders([
    todo('past', { when: 'today', reminder: '08:59' }),
    todo('now', { when: 'today', reminder: '09:00' }),
    todo('next', { when: 'today', reminder: '09:01' }),
    todo('yesterday', { when: '2026-10-15', reminder: '23:00' }),
    todo('tomorrow', { when: '2026-10-17', reminder: '00:00' }),
  ], NOW);
  assert.deepEqual(ids(rs), ['next', 'tomorrow']);
});

check('today and evening fire today at the reminder time, local time', () => {
  const rs = desiredReminders([todo('t', { when: 'today', reminder: '18:30' }), todo('e', { when: 'evening', reminder: '21:05' })], NOW);
  assert.deepEqual(ids(rs), ['t', 'e']);
  assert.equal(rs[0].at.getTime(), new Date(2026, 9, 16, 18, 30).getTime());
  assert.equal(rs[1].at.getTime(), new Date(2026, 9, 16, 21, 5).getTime());
  assert.equal(reminderAt('2026-10-16', '18:30').getHours(), 18);
});

check('a dated to-do fires on its date', () => {
  const rs = desiredReminders([todo('d', { when: '2026-12-24', reminder: '07:15' })], NOW);
  assert.equal(rs[0].at.getTime(), new Date(2026, 11, 24, 7, 15).getTime());
});

check('nearest first, capped at MAX_REMINDERS', () => {
  const many = [];
  for (let i = 0; i < 70; i++) many.push(todo(`m${i}`, { when: `2026-11-${String(1 + (i % 28)).padStart(2, '0')}`, reminder: `${String(10 + (i % 12)).padStart(2, '0')}:00` }));
  const rs = desiredReminders(many, NOW);
  assert.equal(rs.length, MAX_REMINDERS);
  for (let i = 1; i < rs.length; i++) assert.ok(rs[i - 1].at <= rs[i].at, 'sorted');
  const all = desiredReminders(many.slice(0, 10), NOW);
  assert.equal(all.length, 10);
});

check('ids are stable, positive, 31-bit and distinct for different to-dos', () => {
  const a = reminderId('t_abc123'), b = reminderId('t_abc124');
  assert.equal(a, reminderId('t_abc123'));
  assert.notEqual(a, b);
  for (const id of [a, b, reminderId(''), reminderId('x')]) { assert.ok(Number.isInteger(id) && id > 0 && id < 2 ** 31, String(id)); }
  const rs = desiredReminders([todo('t_abc123', { when: 'today', reminder: '18:00' })], NOW);
  assert.equal(rs[0].id, a);
});

check('title is the to-do title; body is its project (or area) or "Reminder"', () => {
  store.state.lists = { areas: [{ id: 'a1', title: 'Home' }], projects: [{ id: 'p1', title: 'House', area: 'a1', headings: [] }], tags: [] };
  const rs = desiredReminders([
    todo('p', { title: 'Fix sink', when: 'today', reminder: '18:00', project: 'p1' }),
    todo('a', { title: 'Water plants', when: 'today', reminder: '18:01', area: 'a1' }),
    todo('n', { title: 'Call mom', when: 'today', reminder: '18:02' }),
  ], NOW);
  assert.deepEqual(rs.map(r => [r.title, r.body]), [['Fix sink', 'House'], ['Water plants', 'Home'], ['Call mom', 'Reminder']]);
  store.state.lists = { areas: [], projects: [], tags: [] };
});

check('completing a repeating to-do cancels its reminder and schedules the next occurrence', () => {
  // before: the open occurrence, due today at 18:00
  const before = [todo('occ1', { title: 'Clean room', when: 'today', reminder: '18:00', repeat: { kind: 'daily', every: 1 }, series: 's1' })];
  const wantBefore = desiredReminders(before, NOW);
  // the phone holds exactly that
  const pending = wantBefore.map(d => ({ ...toNotification(d), schedule: { at: d.at.toISOString() } }));
  // after: the store ticked occ1 off and created occ2 for tomorrow, same time
  const after = [
    { ...before[0], completed: true, completedAt: NOW.toISOString(), nextId: 'occ2' },
    todo('occ2', { title: 'Clean room', when: '2026-10-17', reminder: '18:00', repeat: { kind: 'daily', every: 1 }, series: 's1' }),
  ];
  const wantAfter = desiredReminders(after, NOW);
  assert.deepEqual(ids(wantAfter), ['occ2']);
  const diff = diffReminders(pending, wantAfter);
  assert.deepEqual(diff.cancel, [reminderId('occ1')]);
  assert.deepEqual(ids(diff.schedule), ['occ2']);
  assert.equal(diff.schedule[0].at.getTime(), new Date(2026, 9, 17, 18, 0).getTime());
  // unticking takes it back: occ2 gone, occ1 open again
  const diffBack = diffReminders(wantAfter.map(toNotification), desiredReminders(before, NOW));
  assert.deepEqual(diffBack.cancel, [reminderId('occ2')]);
  assert.deepEqual(ids(diffBack.schedule), ['occ1']);
});

check('reconcile leaves unchanged reminders alone and reschedules changed ones', () => {
  const want = desiredReminders([todo('a', { when: 'today', reminder: '18:00' }), todo('b', { when: 'today', reminder: '19:00' })], NOW);
  const same = diffReminders(want.map(toNotification), want);
  assert.deepEqual(same, { cancel: [], schedule: [] });
  // b moved to 20:00 and was retitled
  const want2 = desiredReminders([todo('a', { when: 'today', reminder: '18:00' }), todo('b', { title: 'B2', when: 'today', reminder: '20:00' })], NOW);
  const d2 = diffReminders(want.map(toNotification), want2);
  assert.deepEqual(d2.cancel, [reminderId('b')]);
  assert.deepEqual(ids(d2.schedule), ['b']);
  // a pending one without extra.todoId (not ours) is never cancelled; one of ours with no to-do is
  const d3 = diffReminders([{ id: 7, title: 'x', body: 'y' }, toNotification(want[0]), { id: 99, title: 'gone', body: '', extra: { todoId: 'zzz', at: 1 } }], want2);
  assert.deepEqual(d3.cancel, [99]);
  assert.deepEqual(ids(d3.schedule), ['b']);
  // the plugin's own `at` is used when extra.at is missing, and an unreadable one counts as changed
  const p = toNotification(want[0]); delete p.extra.at; p.schedule = { at: want[0].at.toISOString() };
  assert.deepEqual(diffReminders([p], want).cancel, []);
  p.schedule = { at: 'Thu Oct 16 18:00:00 XYZ 2026' };
  assert.deepEqual(diffReminders([p], want).cancel, [reminderId('a')]);
});

check('notification shape: channel, exact-while-idle, extra.todoId', () => {
  const [d] = desiredReminders([todo('a', { when: 'today', reminder: '18:00' })], NOW);
  const n = toNotification(d);
  assert.equal(n.channelId, 'todos_reminders');
  assert.equal(n.schedule.allowWhileIdle, true);
  assert.equal(n.isExactNotification, true);
  assert.ok(n.schedule.at instanceof Date);
  assert.deepEqual(n.extra, { todoId: 'a', at: d.at.getTime(), exact: true, sound: 'default' });
  // exact alarms off: scheduled inexact (the plugin must never be left to ask for the setting itself)
  const i = toNotification(d, false);
  assert.equal(i.isExactNotification, false);
  assert.equal(i.extra.exact, false);
});

check('a reminder scheduled inexact is re-scheduled once exact alarms are allowed, and the reverse', () => {
  const want = desiredReminders([todo('a', { when: 'today', reminder: '18:00' })], NOW);
  const inexact = want.map(d => toNotification(d, false)), exact = want.map(d => toNotification(d, true));
  assert.deepEqual(diffReminders(inexact, want, true), { cancel: [reminderId('a')], schedule: want });
  assert.deepEqual(diffReminders(exact, want, false), { cancel: [reminderId('a')], schedule: want });
  assert.deepEqual(diffReminders(exact, want, true), { cancel: [], schedule: [] });
  assert.deepEqual(diffReminders(inexact, want, false), { cancel: [], schedule: [] });
  // without the flag (older pending entries, or a caller that doesn't care) the way it was scheduled is not compared
  assert.deepEqual(diffReminders(inexact, want), { cancel: [], schedule: [] });
  const old = exact.map(n => ({ ...n, extra: { todoId: n.extra.todoId, at: n.extra.at } }));
  assert.deepEqual(diffReminders(old, want, false), { cancel: [], schedule: [] });
});

check('each sound has a channel of its own; Default keeps the original one; an unknown sound is Default', () => {
  assert.equal(channelFor('default'), 'todos_reminders');
  assert.equal(channelFor(undefined), 'todos_reminders');
  assert.equal(channelFor('nope'), 'todos_reminders');
  assert.equal(channelFor('chime'), 'todos_reminders_chime');
  assert.equal(channelFor('silent'), 'todos_reminders_silent');
  const ids = sounds.SOUNDS.map(s => channelFor(s.key));
  assert.equal(new Set(ids).size, ids.length, 'distinct');
  for (const id of ids) assert.ok(id.startsWith(CHANNEL_ID), id);
});

check('channel specs: a tone alerts with its file, Default with the phone\'s own sound, Silent is Android\'s silent', () => {
  const d = channelSpec('default');
  assert.deepEqual(d, { id: 'todos_reminders', name: 'Reminders', description: 'Reminders you set on to-dos', importance: 4, visibility: 1, vibration: true });
  assert.deepEqual(channelSpec('chime'), { ...d, id: 'todos_reminders_chime', sound: 'chime.wav' });
  assert.deepEqual(channelSpec('silent'), { ...d, id: 'todos_reminders_silent', importance: 2, vibration: false });
  assert.deepEqual(channelSpec('bogus'), d);
});

check('notification shape with a sound: its channel, the file for Android 7, extra.sound', () => {
  const [d] = desiredReminders([todo('a', { when: 'today', reminder: '18:00' })], NOW);
  const n = toNotification(d, true, 'chime');
  assert.equal(n.channelId, 'todos_reminders_chime');
  assert.equal(n.sound, 'chime.wav');
  assert.deepEqual(n.extra, { todoId: 'a', at: d.at.getTime(), exact: true, sound: 'chime' });
  const s = toNotification(d, false, 'silent');
  assert.equal(s.channelId, 'todos_reminders_silent');
  assert.equal(s.sound, 'silent.wav');
  assert.equal(s.isExactNotification, false);
  const def = toNotification(d, true, 'default');
  assert.equal(def.channelId, 'todos_reminders');
  assert.equal('sound' in def, false);
  assert.equal(def.extra.sound, 'default');
  assert.deepEqual(toNotification(d, true, 'bogus'), def);
});

check('changing the sound re-schedules every pending reminder onto the new channel; the same sound leaves them alone', () => {
  const want = desiredReminders([todo('a', { when: 'today', reminder: '18:00' }), todo('b', { when: 'today', reminder: '19:00' })], NOW);
  const both = [reminderId('a'), reminderId('b')];
  const onDefault = want.map(d => toNotification(d, true, 'default'));
  assert.deepEqual(diffReminders(onDefault, want, true, 'chime'), { cancel: both, schedule: want });
  assert.deepEqual(diffReminders(onDefault, want, true, 'default'), { cancel: [], schedule: [] });
  const onChime = want.map(d => toNotification(d, true, 'chime'));
  assert.deepEqual(diffReminders(onChime, want, true, 'chime'), { cancel: [], schedule: [] });
  assert.deepEqual(diffReminders(onChime, want, true, 'default'), { cancel: both, schedule: want });
  assert.deepEqual(diffReminders(onChime, want, true, 'silent'), { cancel: both, schedule: want });
  // a reminder from before there was a choice (no extra.sound) is on the default channel
  const old = onDefault.map(n => ({ ...n, extra: { todoId: n.extra.todoId, at: n.extra.at, exact: true } }));
  assert.deepEqual(diffReminders(old, want, true, 'default'), { cancel: [], schedule: [] });
  assert.deepEqual(diffReminders(old, want, true, 'pulse'), { cancel: both, schedule: want });
  // without a sound given the channel is not compared; an unknown sound counts as Default
  assert.deepEqual(diffReminders(onChime, want, true), { cancel: [], schedule: [] });
  assert.deepEqual(diffReminders(onDefault, want, true, 'bogus'), { cancel: [], schedule: [] });
  // the sound and the exact flag are compared together
  assert.deepEqual(diffReminders(onChime, want, false, 'chime'), { cancel: both, schedule: want });
});

check('the choice: Default when unset or unknown, saved per device, listeners told once per change', () => {
  const { SOUNDS, soundInfo, reminderSound, setReminderSound, onSoundChange } = sounds;
  assert.equal(reminderSound(), 'default');
  assert.equal(soundInfo('nope').key, 'default');
  assert.equal(soundInfo(null).key, 'default');
  assert.equal(soundInfo('glass').file, 'glass.wav');
  const seen = [];
  const off = onSoundChange(k => seen.push(k));
  setReminderSound('marimba');
  assert.equal(reminderSound(), 'marimba');
  assert.equal(localStorage.getItem('todos-reminder-sound'), 'marimba');
  setReminderSound('marimba'); // no change: nobody told
  setReminderSound('bogus'); // unknown: Default, stored as nothing
  assert.equal(reminderSound(), 'default');
  assert.equal(localStorage.getItem('todos-reminder-sound'), null);
  assert.deepEqual(seen, ['marimba', 'default']);
  off();
  setReminderSound('pulse');
  assert.deepEqual(seen, ['marimba', 'default']);
  setReminderSound('default');
  assert.equal(SOUNDS[0].key, 'default');
  assert.equal(SOUNDS[SOUNDS.length - 1].key, 'silent');
  assert.equal(new Set(SOUNDS.map(s => s.key)).size, SOUNDS.length, 'distinct keys');
  for (const s of SOUNDS) assert.ok(s.label && (s.file || s.note), s.key);
});

check('every bundled sound is in app/sounds and in res/raw, the same bytes, 16-bit mono PCM, with a raw-safe name', () => {
  const files = sounds.SOUNDS.filter(s => s.file).map(s => s.file);
  assert.ok(files.length >= 3, 'tones to choose from');
  for (const f of [...files, 'silent.wav']) {
    assert.match(f, /^[a-z][a-z0-9_]*\.wav$/, `${f}: an Android raw resource name (lowercase letters, digits, underscores)`);
    const raw = readFileSync(path.join(ROOT, 'android/app/src/main/res/raw', f));
    assert.equal(raw.toString('latin1', 0, 4), 'RIFF', f);
    assert.equal(raw.toString('latin1', 8, 12), 'WAVE', f);
    assert.equal(raw.readUInt16LE(20), 1, `${f}: PCM`);
    assert.equal(raw.readUInt16LE(22), 1, `${f}: mono`);
    assert.equal(raw.readUInt16LE(34), 16, `${f}: 16-bit`);
    assert.equal(raw.readUInt32LE(40), raw.length - 44, `${f}: data length`);
    if (f === 'silent.wav') continue; // res/raw only: nothing to preview
    const web = readFileSync(path.join(ROOT, 'app/sounds', f));
    assert.ok(web.equals(raw), `${f}: the two copies differ (run npm run android:sounds)`);
    assert.ok(raw.length < 200_000, `${f}: small`);
  }
  for (const s of sounds.SOUNDS) if (s.file) assert.equal(s.file, `${s.key}.wav`, 'the file is named after the key');
});

check('launcher shortcut URLs', () => {
  assert.equal(launchAction('dev.coderlog.todos://new'), 'new');
  assert.equal(launchAction('dev.coderlog.todos://today/'), 'today');
  assert.equal(launchAction('DEV.coderlog.todos://search?x=1'), 'search');
  assert.equal(launchAction('dev.coderlog.todos://other'), null);
  assert.equal(launchAction('https://example.com/new'), null);
  assert.equal(launchAction(undefined), null);
});

for (const r of results) console.log(r.join('  '));
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(`${results.length - failed}/${results.length} passed`);
console.log('NATIVE ' + (failed ? 'RED' : 'GREEN'));
process.exit(failed ? 1 : 0);

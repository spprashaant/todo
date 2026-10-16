// Plain Node check of the Android app's reminder maths (app/js/native.js): desiredReminders,
// diffReminders and reminderId. No browser, no phone. Prints NATIVE GREEN / NATIVE RED.
//   node scripts/native-check.mjs
import assert from 'node:assert/strict';

// The app's modules expect a window (store.js listens for other tabs' changes at load). A stub is enough.
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const native = await import('../app/js/native.js');
const store = await import('../app/js/store.js');
const { desiredReminders, diffReminders, reminderId, reminderAt, toNotification, launchAction, MAX_REMINDERS } = native;

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
  assert.ok(n.schedule.at instanceof Date);
  assert.deepEqual(n.extra, { todoId: 'a', at: d.at.getTime() });
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

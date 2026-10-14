// Behaviour check for repeating to-dos: the measurable half of the recurrence gauntlet.
//   node tools/recur-check.mjs [--only <substring>] [--who <name>]
// Drives the real app in Chromium (clock frozen, storage seeded) through the same controls a person
// uses: row checkboxes, the card's checkbox, Complete All, Clear completed, delete. After every
// step it checks the series invariant: a repeating to-do never has more than one open occurrence,
// and completing one never loses the series. Prints RECUR GREEN / RECUR RED, writes gauntlet/recur.json.
// Needs the app server (node tools/serve.mjs); starts it when it isn't running.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.APP_BASE || 'http://localhost:5173') + '/app/';
const argv = process.argv.slice(2);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
const who = argv.includes('--who') ? argv[argv.indexOf('--who') + 1] : 'manual';

// Tuesday 10 March 2026, 9:00 in New York. Every date below is relative to this.
const NOW = '2026-03-10T09:00:00-04:00';
const at = day => `${day}T09:00:00-04:00`;

const LISTS = {
  areas: [{ id: 'a_home', title: 'Home' }],
  projects: [{ id: 'p_house', title: 'House', area: 'a_home', notes: '', headings: [{ id: 'h_weekly', title: 'Weekly' }] }],
  tags: ['Home', 'Errand'],
};
const todo = (id, title, extra = {}) => ({
  id, title, completed: false, completedAt: null, notes: '', checklist: [], when: null, deadline: null, tags: [],
  project: null, area: null, heading: null, createdAt: '2026-03-01T12:00:00.000Z', ...extra,
});
const every = (n, unit, mode = 'completion', more = {}) => ({ mode, every: n, unit, ...more });

async function ensureServer() {
  const up = async () => { try { return (await fetch(BASE)).ok; } catch { return false; } };
  if (await up()) return;
  spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs')], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 50 && !(await up()); i++) await new Promise(r => setTimeout(r, 200));
}

// ---------- harness ----------
let browser;
const PHONE = { width: 390, height: 844 };
// touch: a phone-like context (touch screen, mobile viewport handling); rows are then ticked with a tap
async function openApp({ todos, route = '#/', now = NOW, lists = LISTS, viewport = { width: 1200, height: 800 }, touch = false }) {
  const context = await browser.newContext({ viewport, locale: 'en-US', timezoneId: 'America/New_York', serviceWorkers: 'block', ...(touch ? { hasTouch: true, isMobile: true } : {}) });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.clock.setFixedTime(new Date(now));
  await context.addInitScript(seed => {
    if (localStorage.getItem('__recur_seeded')) return; // once per context, so a second tab shares storage
    localStorage.clear();
    localStorage.setItem('things-todos', JSON.stringify(seed.todos));
    localStorage.setItem('things-lists', JSON.stringify(seed.lists));
    localStorage.setItem('__recur_seeded', '1');
  }, { todos, lists });
  await page.goto(BASE + route, { waitUntil: 'networkidle' });
  await page.waitForTimeout(150);
  const app = {
    page, context, errors,
    async go(r) { await page.goto(BASE + r, { waitUntil: 'networkidle' }); await page.waitForTimeout(150); },
    async setDay(day) { await page.clock.setFixedTime(new Date(at(day))); await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(150); },
    async reload() { await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(150); },
    all: () => page.evaluate(() => JSON.parse(localStorage.getItem('things-todos') || '[]')),
    row(title, { completed } = {}) {
      let rows = page.locator('.todo-list > li').filter({ has: page.locator('label', { hasText: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) });
      if (completed === true) rows = rows.and(page.locator('li.completed'));
      if (completed === false) rows = rows.and(page.locator('li:not(.completed)'));
      return rows;
    },
    async toggle(title, opts) {
      const r = app.row(title, opts).first();
      await r.waitFor({ state: 'visible', timeout: 3000 });
      if (touch) await r.locator('.toggle').tap(); else await r.locator('.toggle').click();
      await page.waitForTimeout(250);
      await invariant(app);
    },
    async destroy(title, opts) {
      const r = app.row(title, opts).first();
      await r.waitFor({ state: 'visible', timeout: 3000 });
      await r.hover();
      await r.locator('.destroy').click({ force: true });
      await page.waitForTimeout(250);
      await invariant(app);
    },
    async close() { await context.close(); },
    /** A second tab on the same storage. */
    async newTab(r = route) {
      const p2 = await context.newPage();
      p2.on('pageerror', e => errors.push('tab 2: ' + String(e)));
      await p2.goto(BASE + r, { waitUntil: 'networkidle' });
      await p2.waitForTimeout(150);
      return p2;
    },
  };
  await invariant(app);
  return app;
}

class Fail extends Error {}
const expect = (cond, msg) => { if (!cond) throw new Fail(msg); };
const eq = (a, b, what) => expect(JSON.stringify(a) === JSON.stringify(b), `${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

/** Every step: storage stays TodoMVC-valid, and no title has two open occurrences that both repeat. */
async function invariant(app) {
  const shape = await app.page.evaluate(() => {
    const bad = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      let v; try { v = JSON.parse(localStorage.getItem(k)); } catch { continue; }
      if (Array.isArray(v) && k !== 'things-todos') bad.push(k);
    }
    const lists = JSON.parse(localStorage.getItem('things-lists') || '{}');
    return { bad, listsIsArray: Array.isArray(lists) };
  });
  expect(!shape.bad.length, `localStorage holds another JSON array: ${shape.bad.join(', ')}`);
  expect(!shape.listsIsArray, 'things-lists became an array');
  const all = await app.all();
  const open = new Map();
  for (const t of all) {
    if (t.completed || !t.repeat) continue;
    open.set(t.title, (open.get(t.title) || 0) + 1);
  }
  for (const [title, n] of open) expect(n <= 1, `"${title}" has ${n} open repeating occurrences (duplicated)`);
  expect(!app.errors.length, `page errors: ${app.errors.slice(0, 2).join(' | ')}`);
}

const byTitle = async (app, title) => (await app.all()).filter(t => t.title === title);
async function series(app, title) {
  const all = await byTitle(app, title);
  return { all, open: all.filter(t => !t.completed), done: all.filter(t => t.completed) };
}
/** The one open occurrence of `title`, checked to be scheduled on `day` and still repeating. */
async function nextIs(app, title, day, { total } = {}) {
  const s = await series(app, title);
  expect(s.open.length === 1, `"${title}": expected exactly 1 open occurrence, found ${s.open.length} (${s.all.length} in total)`);
  eq(s.open[0].when, day, `"${title}" next occurrence date`);
  expect(!!s.open[0].repeat, `"${title}": the next occurrence lost its repeat rule`);
  if (total != null) expect(s.all.length === total, `"${title}": expected ${total} to-dos in total, found ${s.all.length}`);
  return s.open[0];
}

// ---------- scenarios ----------
const scenarios = [];
const it = (name, fn) => scenarios.push({ name, fn });

it('after completion, every day: ticking it off creates exactly one to-do for tomorrow', async () => {
  const app = await openApp({ route: '#/today', todos: [todo('t1', 'Clean room', { when: 'today', repeat: every(1, 'day') })] });
  await app.toggle('Clean room');
  const s = await series(app, 'Clean room');
  expect(s.done.length === 1 && s.done[0].id === 't1', 'the ticked-off to-do should be the one marked completed');
  await nextIs(app, 'Clean room', '2026-03-11', { total: 2 });
  expect(await app.row('Clean room', { completed: true }).isVisible(), 'the completed occurrence should stay in Today, checked, until cleared');
  expect(!(await app.row('Clean room', { completed: false }).count()), 'tomorrow\'s occurrence should not show in Today');
  await app.go('#/upcoming');
  expect(await app.row('Clean room', { completed: false }).first().isVisible(), 'the next occurrence should show in Upcoming');
  await app.reload();
  await nextIs(app, 'Clean room', '2026-03-11', { total: 2 });
  await app.close();
});

it('after completion counts from the day you finish, not the old date (5 days overdue, every 2 days)', async () => {
  const app = await openApp({ route: '#/today', todos: [todo('t1', 'Clean room', { when: '2026-03-05', repeat: every(2, 'day') })] });
  await app.toggle('Clean room');
  await nextIs(app, 'Clean room', '2026-03-12', { total: 2 });
  await app.close();
});

it('nothing piles up while time passes: 10 days untouched is still one to-do', async () => {
  const app = await openApp({ route: '#/today', todos: [todo('t1', 'Clean room', { when: '2026-03-10', repeat: every(1, 'day') })] });
  await app.setDay('2026-03-15');
  await app.setDay('2026-03-20');
  const s = await series(app, 'Clean room');
  expect(s.all.length === 1, `expected 1 to-do after 10 days, found ${s.all.length}`);
  expect(await app.row('Clean room').first().isVisible(), 'the overdue occurrence should still show in Today');
  await app.toggle('Clean room');
  await nextIs(app, 'Clean room', '2026-03-21', { total: 2 });
  await app.close();
});

it('unticking takes the new occurrence back; re-ticking never duplicates (3 cycles)', async () => {
  const app = await openApp({ route: '#/today', todos: [todo('t1', 'Clean room', { when: 'today', repeat: every(1, 'day') })] });
  for (let i = 0; i < 3; i++) {
    await app.toggle('Clean room', { completed: false });
    await nextIs(app, 'Clean room', '2026-03-11', { total: 2 });
    await app.toggle('Clean room', { completed: true });
    const s = await series(app, 'Clean room');
    expect(s.all.length === 1, `cycle ${i + 1}: after unticking, expected only the original, found ${s.all.length} to-dos`);
    expect(!s.all[0].completed && !!s.all[0].repeat, `cycle ${i + 1}: the original should be open again and still repeat`);
  }
  await app.close();
});

it('the open card\'s checkbox behaves exactly like the row\'s', async () => {
  const app = await openApp({ route: '#/today', todos: [todo('t1', 'Clean room', { when: 'today', repeat: every(3, 'day') })] });
  await app.row('Clean room').first().locator('label').dblclick();
  await app.page.waitForTimeout(250);
  await app.page.locator('li.editing .card-toggle').click();
  await app.page.waitForTimeout(250);
  await invariant(app);
  await app.page.keyboard.press('Escape');
  await app.page.waitForTimeout(200);
  await nextIs(app, 'Clean room', '2026-03-13', { total: 2 });
  await app.close();
});

it('deleting the open occurrence stops the series, and nothing respawns', async () => {
  const app = await openApp({ route: '#/today', todos: [todo('t1', 'Clean room', { when: 'today', repeat: every(1, 'day') })] });
  await app.toggle('Clean room');
  await app.go('#/upcoming');
  await app.destroy('Clean room', { completed: false });
  let s = await series(app, 'Clean room');
  expect(s.open.length === 0 && s.all.length === 1, `after deleting the next occurrence expected only the completed one, found ${s.all.length} (${s.open.length} open)`);
  await app.setDay('2026-03-12');
  s = await series(app, 'Clean room');
  expect(s.all.length === 1, `a deleted series came back: ${s.all.length} to-dos`);
  await app.close();
});

it('Clear completed removes the finished occurrence and keeps the next one', async () => {
  const app = await openApp({ route: '#/today', todos: [todo('t1', 'Clean room', { when: 'today', repeat: every(1, 'day') }), todo('t2', 'Call mom', { when: 'today' })] });
  await app.toggle('Clean room');
  await app.page.locator('.clear-completed').click();
  await app.page.waitForTimeout(250);
  await invariant(app);
  await nextIs(app, 'Clean room', '2026-03-11', { total: 1 });
  await app.close();
});

it('Complete All spawns one next occurrence per repeating to-do, and un-checking takes them back', async () => {
  const app = await openApp({ route: '#/', todos: [
    todo('t1', 'Buy milk'),
    todo('t2', 'Water plants', { repeat: every(3, 'day') }),
    todo('t3', 'Clean room', { repeat: every(1, 'day') }),
  ] });
  await app.page.locator('input.toggle-all').check({ force: true });
  await app.page.waitForTimeout(250);
  await invariant(app);
  await nextIs(app, 'Water plants', '2026-03-13', { total: 2 });
  await nextIs(app, 'Clean room', '2026-03-11', { total: 2 });
  expect((await app.all()).length === 5, 'expected 3 completed + 2 next occurrences');
  expect(await app.page.locator('input.toggle-all').isChecked(), 'Complete All should read as checked: every Inbox to-do is completed');
  expect(await app.page.locator('.todo-list > li').count() === 3, 'the Inbox should still list exactly its 3 (completed) to-dos');
  await app.page.locator('input.toggle-all').uncheck({ force: true });
  await app.page.waitForTimeout(250);
  await invariant(app);
  const all = await app.all();
  expect(all.length === 3 && all.every(t => !t.completed), `after un-checking Complete All expected the 3 originals open, found ${all.length} (${all.filter(t => t.completed).length} completed)`);
  await app.close();
});

it('the next occurrence carries notes, tags, list, heading, reminder; resets the checklist; shifts the deadline', async () => {
  const app = await openApp({ route: '#/project/p_house', todos: [todo('t1', 'Clean room', {
    when: '2026-03-10', deadline: '2026-03-12', reminder: '18:00', notes: 'Vacuum under the bed', tags: ['Home'],
    project: 'p_house', heading: 'h_weekly',
    checklist: [{ id: 'c1', title: 'Desk', completed: true }, { id: 'c2', title: 'Floor', completed: false }],
    repeat: every(1, 'week'),
  })] });
  await app.toggle('Clean room');
  const n = await nextIs(app, 'Clean room', '2026-03-17', { total: 2 });
  eq(n.deadline, '2026-03-19', 'deadline keeps its 2-day lead');
  eq(n.reminder, '18:00', 'reminder time');
  eq(n.notes, 'Vacuum under the bed', 'notes');
  eq(n.tags, ['Home'], 'tags');
  eq([n.project, n.area, n.heading], ['p_house', null, 'h_weekly'], 'project / area / heading');
  eq(n.checklist.map(c => [c.title, c.completed]), [['Desk', false], ['Floor', false]], 'checklist (reset)');
  const done = (await series(app, 'Clean room')).done[0];
  eq(done.checklist.map(c => c.completed), [true, false], 'the completed occurrence keeps its own checklist');
  expect(await app.row('Clean room', { completed: false }).first().isVisible(), 'the next occurrence should show under the same heading in the project');
  await app.close();
});

it('on schedule, weekly on Mon and Thu: follows the weekdays', async () => {
  const app = await openApp({ route: '#/today', todos: [todo('t1', 'Take out bins', { when: '2026-03-09', repeat: every(1, 'week', 'schedule', { weekdays: [1, 4] }) })] });
  await app.toggle('Take out bins');
  await nextIs(app, 'Take out bins', '2026-03-12', { total: 2 });
  await app.go('#/upcoming');
  await app.toggle('Take out bins', { completed: false }); // done early, on Tuesday
  await nextIs(app, 'Take out bins', '2026-03-16', { total: 3 });
  await app.close();
});

it('on schedule, finished late: skips the missed dates instead of creating overdue ones', async () => {
  const app = await openApp({ route: '#/today', todos: [
    todo('t1', 'Water plants', { when: '2026-03-01', repeat: every(1, 'day', 'schedule') }),
    todo('t2', 'Pay rent', { when: '2026-02-15', repeat: every(1, 'month', 'schedule', { monthly: { day: 15 } }) }),
  ] });
  await app.toggle('Water plants');
  await nextIs(app, 'Water plants', '2026-03-11', { total: 2 });
  await app.toggle('Pay rent');
  await nextIs(app, 'Pay rent', '2026-03-15', { total: 2 });
  await app.close();
});

it('monthly on the 31st: Feb 28, then back to Mar 31', async () => {
  const app = await openApp({ route: '#/today', now: at('2026-01-31'), todos: [todo('t1', 'Backup photos', { when: '2026-01-31', repeat: every(1, 'month', 'schedule', { monthly: { day: 31 } }) })] });
  await app.toggle('Backup photos');
  await nextIs(app, 'Backup photos', '2026-02-28', { total: 2 });
  await app.setDay('2026-02-28');
  await app.toggle('Backup photos', { completed: false });
  await nextIs(app, 'Backup photos', '2026-03-31', { total: 3 });
  await app.close();
});

it('monthly on the 2nd Tuesday, and every 2 weeks keeps its phase', async () => {
  const app = await openApp({ route: '#/today', todos: [
    todo('t1', 'Book club', { when: '2026-03-10', repeat: every(1, 'month', 'schedule', { monthly: { nth: 2, weekday: 2 } }) }),
    todo('t2', 'Payroll', { when: '2026-03-06', repeat: every(2, 'week', 'schedule', { weekdays: [5] }) }),
  ] });
  await app.toggle('Book club');
  await nextIs(app, 'Book club', '2026-04-14', { total: 2 });
  await app.toggle('Payroll');
  await nextIs(app, 'Payroll', '2026-03-20', { total: 2 });
  await app.close();
});

it('after completion, monthly and yearly clamp to the end of short months', async () => {
  const app = await openApp({ route: '#/today', now: at('2026-01-31'), todos: [
    todo('t1', 'Change filter', { when: 'today', repeat: every(1, 'month') }),
    todo('t2', 'Renew licence', { when: 'today', repeat: every(1, 'year') }),
  ] });
  await app.toggle('Change filter');
  await nextIs(app, 'Change filter', '2026-02-28', { total: 2 });
  await app.toggle('Renew licence');
  await nextIs(app, 'Renew licence', '2027-01-31', { total: 2 });
  await app.close();
});

it('ends after 3 times: the third completion creates nothing', async () => {
  const app = await openApp({ route: '#/upcoming', todos: [todo('t1', 'Physio exercises', { when: '2026-03-11', repeat: every(1, 'day', 'completion', { ends: { after: 3 } }) })] });
  await app.toggle('Physio exercises', { completed: false });
  await nextIs(app, 'Physio exercises', '2026-03-11', { total: 2 });
  await app.toggle('Physio exercises', { completed: false });
  await nextIs(app, 'Physio exercises', '2026-03-11', { total: 3 });
  await app.toggle('Physio exercises', { completed: false });
  const s = await series(app, 'Physio exercises');
  expect(s.all.length === 3 && s.open.length === 0, `expected 3 completed and none open, found ${s.all.length} (${s.open.length} open)`);
  await app.close();
});

it('ends on a date: no occurrence after it', async () => {
  const app = await openApp({ route: '#/today', todos: [todo('t1', 'Take antibiotics', { when: '2026-03-10', repeat: every(1, 'day', 'schedule', { ends: { on: '2026-03-12' } }) })] });
  await app.toggle('Take antibiotics');
  await nextIs(app, 'Take antibiotics', '2026-03-11', { total: 2 });
  await app.go('#/upcoming');
  await app.toggle('Take antibiotics', { completed: false });
  await nextIs(app, 'Take antibiotics', '2026-03-12', { total: 3 });
  await app.toggle('Take antibiotics', { completed: false });
  const s = await series(app, 'Take antibiotics');
  expect(s.all.length === 3 && s.open.length === 0, `expected the series to end on Mar 12, found ${s.all.length} (${s.open.length} open)`);
  await app.close();
});

it('reopening an old occurrence from the Logbook does not fork the series', async () => {
  const app = await openApp({ route: '#/today', todos: [todo('t1', 'Clean room', { when: 'today', repeat: every(1, 'day') })] });
  await app.toggle('Clean room');                       // t1 done -> next for Mar 11
  await app.go('#/upcoming');
  await app.toggle('Clean room', { completed: false }); // done early -> next for Mar 11 (after completion counts from today)
  await nextIs(app, 'Clean room', '2026-03-11', { total: 3 });
  await app.go('#/logbook');
  // the first occurrence: its own next occurrence is already finished, so unticking it can't undo a spawn
  await app.page.locator('.todo-list > li.completed[data-id="t1"] .toggle').click();
  await app.page.waitForTimeout(250);
  await invariant(app);
  const s = await series(app, 'Clean room');
  expect(s.all.length === 3, `reopening an old occurrence should not create or delete to-dos (found ${s.all.length})`);
  expect(s.open.filter(t => t.repeat).length === 1, 'exactly one open occurrence should carry the repeat rule');
  await app.close();
});

it('the Logbook lists every finished occurrence', async () => {
  const app = await openApp({ route: '#/today', todos: [todo('t1', 'Clean room', { when: 'today', repeat: every(1, 'day') })] });
  await app.toggle('Clean room');
  await app.setDay('2026-03-11');
  await app.toggle('Clean room', { completed: false });
  await app.go('#/logbook');
  const n = await app.row('Clean room', { completed: true }).count();
  expect(n === 2, `expected 2 finished occurrences in the Logbook, found ${n}`);
  await nextIs(app, 'Clean room', '2026-03-12', { total: 3 });
  await app.close();
});

it('a to-do without a repeat rule never spawns anything', async () => {
  const app = await openApp({ route: '#/today', todos: [todo('t1', 'Call mom', { when: 'today' }), todo('t2', 'Pay rent', { when: 'today', repeat: null })] });
  await app.toggle('Call mom');
  await app.toggle('Pay rent');
  expect((await app.all()).length === 2, 'completing plain to-dos created new ones');
  await app.close();
});

// ---------- regressions: breaks the adversarial testers confirmed ----------

it('setting a repeat in the When picker, then ticking it off, creates the next one', async () => {
  const app = await openApp({ route: '#/today', todos: [todo('t1', 'Clean room', { when: 'today' })] });
  const p = app.page;
  await app.row('Clean room').first().locator('label').dblclick();
  await p.waitForTimeout(250);
  await p.locator('li.editing [data-action=when]').first().click();
  await p.waitForTimeout(250);
  await p.locator('[data-shot=when] [data-action=repeat]').click();
  await p.waitForTimeout(200);
  await p.locator('[data-shot=repeat] [data-action=repeat-type]').click();
  await p.waitForTimeout(200);
  await p.locator('[data-shot=repeat-kinds] [data-k=after]').click();
  await p.waitForTimeout(200);
  await p.locator('[data-shot=repeat] [data-rp=unit]').click();
  await p.waitForTimeout(200);
  await p.locator('.rp-menu .rp-mi', { hasText: /^days?$/ }).click();
  await p.waitForTimeout(200);
  const every = p.locator('[data-shot=repeat] [data-rp=every]');
  await every.fill('2');
  await every.press('Enter');
  await p.waitForTimeout(200);
  for (let i = 0; i < 3 && await p.locator('li.editing').count(); i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(200); }
  const t = (await app.all())[0];
  eq(t.repeat && [t.repeat.mode, t.repeat.every, t.repeat.unit], ['completion', 2, 'day'], 'the rule saved from the picker');
  await app.toggle('Clean room');
  await nextIs(app, 'Clean room', '2026-03-12', { total: 2 });
  await app.close();
});

it('renaming in the open card, then ticking the card\'s checkbox, carries the new title (also in Active)', async () => {
  for (const route of ['#/today', '#/today/active']) {
    const app = await openApp({ route, todos: [todo('t1', 'Clean room', { when: 'today', repeat: every(1, 'day') })] });
    const p = app.page;
    await app.row('Clean room').first().locator('label').dblclick();
    await p.waitForTimeout(250);
    await p.locator('li.editing .edit').fill('Clean room and desk');
    await p.locator('li.editing .card-toggle').click();
    await p.waitForTimeout(250);
    for (let i = 0; i < 2 && await p.locator('li.editing').count(); i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(200); }
    await invariant(app);
    const all = await app.all();
    expect(all.length === 2 && all.every(t => t.title === 'Clean room and desk'), `${route}: expected both occurrences titled "Clean room and desk", got ${JSON.stringify(all.map(t => [t.title, t.completed]))}`);
    await app.close();
  }
});

it('an ended series stays ended: reopening its first occurrence and re-ticking it adds nothing', async () => {
  const app = await openApp({ route: '#/upcoming', todos: [todo('t1', 'Physio exercises', { when: '2026-03-11', repeat: every(1, 'day', 'completion', { ends: { after: 3 } }) })] });
  for (let i = 0; i < 3; i++) await app.toggle('Physio exercises', { completed: false });
  await app.go('#/logbook');
  await app.page.locator('.todo-list > li.completed[data-id="t1"] .toggle').click();
  await app.page.waitForTimeout(250);
  await invariant(app);
  await app.go('#/upcoming'); // reopened, it leaves the Logbook for its own date
  await app.page.locator('.todo-list > li[data-id="t1"] .toggle').click();
  await app.page.waitForTimeout(250);
  await invariant(app);
  const s = await series(app, 'Physio exercises');
  expect(s.all.length === 3 && s.open.length === 0, `expected the ended series to stay at 3 finished to-dos, found ${s.all.length} (${s.open.length} open)`);
  await app.close();
});

it('a rename made in another tab survives closing this tab\'s untouched card', async () => {
  const app = await openApp({ route: '#/today', todos: [todo('t1', 'Pay rent', { when: 'today', repeat: every(1, 'month', 'schedule', { monthly: { day: 10 } }) })] });
  await app.row('Pay rent').first().locator('label').dblclick();
  await app.page.waitForTimeout(250);
  const b = await app.newTab('#/today');
  await b.locator('.todo-list > li[data-id="t1"] label').dblclick();
  await b.waitForTimeout(250);
  await b.locator('li.editing .edit').fill('Pay rent to landlord');
  await b.keyboard.press('Enter');
  await b.waitForTimeout(300);
  await app.page.keyboard.press('Escape');
  await app.page.waitForTimeout(300);
  await invariant(app);
  eq((await app.all())[0].title, 'Pay rent to landlord', 'title after tab A closed its card');
  await app.close();
});

it('Complete All works with a row selected, and un-checking it with a row selected takes the next ones back', async () => {
  const app = await openApp({ route: '#/', todos: [todo('t1', 'Buy milk'), todo('t2', 'Water plants', { repeat: every(3, 'day') })] });
  const p = app.page;
  await app.row('Buy milk').first().locator('label').click();
  await p.waitForTimeout(150);
  await p.locator('label.tool[for=toggle-all]').click();
  await p.waitForTimeout(250);
  await invariant(app);
  await nextIs(app, 'Water plants', '2026-03-13', { total: 2 });
  expect((await app.all()).find(t => t.id === 't1').completed, 'Complete All with a row selected should complete "Buy milk"');
  await app.row('Buy milk').first().locator('label').click();
  await p.waitForTimeout(150);
  await p.locator('label.tool[for=toggle-all]').click();
  await p.waitForTimeout(250);
  await invariant(app);
  const all = await app.all();
  expect(all.length === 2 && all.every(t => !t.completed), `un-checking Complete All with a row selected should reopen both and take the next one back, got ${JSON.stringify(all.map(t => [t.title, t.completed]))}`);
  await app.close();
});

it('a When picker left open in another tab never writes its stale rule over a change made elsewhere', async () => {
  const app = await openApp({ route: '#/today', todos: [todo('t1', 'Take out bins', { when: '2026-03-09', repeat: every(1, 'week', 'schedule', { weekdays: [1, 4] }) })] });
  const p = app.page;
  await app.row('Take out bins').first().locator('label').dblclick();
  await p.waitForTimeout(250);
  await p.locator('li.editing [data-action=when]').first().click();
  await p.waitForTimeout(300);
  // another tab (or device sync) sets an end on the rule
  const b = await app.newTab('#/today');
  await b.evaluate(() => {
    const all = JSON.parse(localStorage.getItem('things-todos'));
    all[0].repeat = { ...all[0].repeat, ends: { after: 12 } };
    localStorage.setItem('things-todos', JSON.stringify(all));
  });
  await p.waitForTimeout(300);
  await p.locator('[data-shot=repeat] .rp-day[data-d="5"]').click();
  await p.waitForTimeout(250);
  for (let i = 0; i < 3 && await p.locator('li.editing').count(); i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(200); }
  await invariant(app);
  const r = (await app.all())[0].repeat;
  eq(r && [r.weekdays, r.ends], [[1, 4, 5], { after: 12 }], 'rule after tab A added Friday');
  await app.close();
});

it('on the phone, More > When… opens on the date another tab just set, and a reminder or weekday added there keeps that date', async () => {
  for (const change of ['Add Reminder', 'Thu']) {
    const app = await openApp({ route: '#/project/p_house', viewport: PHONE, touch: true, todos: [todo('t1', 'Take out bins', { when: '2026-03-10', project: 'p_house', repeat: every(1, 'week', 'schedule') })] });
    const p = app.page;
    // tab A: tap the row (its card opens), tap More in the card's bar, and leave the menu open
    await p.locator('.todo-list > li[data-id="t1"] label').tap();
    await p.waitForTimeout(400);
    await p.locator('#detail-bar [data-bar=more]').tap();
    await p.waitForTimeout(300);
    // tab B: the same to-do's card, its When chip, Friday 13 March
    const b = await app.newTab('#/project/p_house');
    await b.locator('.todo-list > li[data-id="t1"] label').tap();
    await b.waitForTimeout(400);
    await b.locator('li.editing [data-action=when]').first().tap();
    await b.waitForTimeout(400);
    await b.locator('[data-shot=when] .cal-day[data-v="2026-03-13"]').tap();
    await b.waitForTimeout(300);
    eq((await app.all())[0].when, '2026-03-13', `${change}: date after tab B picked Friday`);
    // tab A (its storage event has arrived): More > When…
    await p.bringToFront();
    await p.waitForTimeout(300);
    await p.locator('.menu .menu-item', { hasText: 'When' }).tap();
    await p.waitForTimeout(400);
    const current = await p.locator('[data-shot=when] .current').evaluateAll(els => els.map(e => e.dataset.v));
    const daysOn = await p.locator('[data-shot=repeat] .rp-day.on').evaluateAll(els => els.map(e => Number(e.dataset.d)));
    if (change === 'Add Reminder') await p.locator('[data-shot=when] [data-kind=reminder]').tap();
    else await p.locator('[data-shot=repeat] .rp-day[data-d="4"]').tap();
    await p.waitForTimeout(400);
    await p.locator('[data-shot=when] .wh-cancel').tap();
    await p.waitForTimeout(300);
    await invariant(app);
    const t = (await app.all())[0];
    eq(t.when, '2026-03-13', `${change}: date after tab A's picker (tab B's Friday must not be written over)`);
    if (change === 'Add Reminder') {
      eq(t.reminder, '10:00', 'reminder added in tab A');
      eq(t.repeat && [t.repeat.mode, t.repeat.every, t.repeat.unit, t.repeat.weekdays ?? null], ['schedule', 1, 'week', null], 'rule after adding a reminder');
    } else eq(t.repeat && t.repeat.weekdays, [4, 5], 'weekdays after tab A added Thursday to the Friday rule');
    eq(current, ['2026-03-13'], `${change}: the day tab A's picker marked as current`);
    eq(daysOn, [5], `${change}: the weekday tab A's Repeats section showed on`);
    if (change === 'Thu') {
      await app.setDay('2026-03-13');
      await app.toggle('Take out bins');
      await nextIs(app, 'Take out bins', '2026-03-19', { total: 2 });
    }
    await app.close();
  }
});

it('Cmd/Ctrl+K in the open card\'s title completes it with the typed title, and the Escape after it keeps that title', async () => {
  for (const key of ['Meta+k', 'Control+k']) {
    const app = await openApp({ route: '#/today', todos: [todo('t1', 'Clean room', { when: 'today', repeat: every(1, 'day') })] });
    const p = app.page;
    const brief = all => JSON.stringify(all.map(t => [t.title, t.completed, t.when]));
    await app.row('Clean room').first().locator('label').dblclick(); // the card opens with the caret at the end of the title
    await p.waitForTimeout(300);
    await p.keyboard.type(' and desk', { delay: 20 });
    await p.waitForTimeout(100);
    await p.keyboard.press(key);
    await p.waitForTimeout(300);
    await invariant(app);
    let all = await app.all();
    expect(all.length === 2 && all.find(t => t.id === 't1')?.completed && all.every(t => t.title === 'Clean room and desk'),
      `${key} in the card: expected t1 completed plus a next occurrence, both "Clean room and desk", got ${brief(all)}`);
    await nextIs(app, 'Clean room and desk', '2026-03-11', { total: 2 });
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    await invariant(app);
    all = await app.all();
    expect(all.length === 2 && all.find(t => t.id === 't1')?.completed && all.every(t => t.title === 'Clean room and desk'),
      `${key}, then Escape: completing from the card committed the typed title, so Escape must keep it; got ${brief(all)}`);
    await app.close();
  }
});

it('on the phone When sheet a rule change turns Cancel into Done, so a sheet that still says Cancel has changed nothing', async () => {
  const rule = every(1, 'week', 'schedule', { weekdays: [2, 5], ends: { after: 10 } });
  const view = r => r ? [r.mode, r.every, r.unit, r.weekdays ?? null, r.ends ?? null] : null;
  for (const change of ['Stop Repeating', 'Thu']) {
    const app = await openApp({ route: '#/project/p_house', viewport: PHONE, touch: true, todos: [todo('t1', 'Take out bins', { when: '2026-03-10', project: 'p_house', repeat: rule })] });
    const p = app.page;
    const btn = p.locator('.when-head .wh-cancel');
    await p.locator('.todo-list > li[data-id="t1"] label').tap(); // its card opens
    await p.waitForTimeout(400);
    await p.locator('li.editing .chip-repeat').tap(); // the When? sheet, with its Repeats section
    await p.waitForTimeout(400);
    eq((await btn.innerText()).trim(), 'Cancel', `${change}: the sheet's button before any change`);
    await p.locator(change === 'Stop Repeating' ? '[data-shot=repeat] [data-rp=off]' : '[data-shot=repeat] .rp-day[data-d="4"]').tap();
    await p.waitForTimeout(300);
    const label = (await btn.innerText()).trim();
    const saved = (await app.all())[0].repeat;
    expect(!(label === 'Cancel' && JSON.stringify(view(saved)) !== JSON.stringify(view(rule))),
      `${change}: the sheet still says Cancel, yet it has already saved repeat=${JSON.stringify(saved)} over the Tue/Fri rule (ends after 10)`);
    const want = change === 'Stop Repeating' ? null : { ...rule, weekdays: [2, 4, 5] };
    eq(view(saved), view(want), `${change}: the rule, saved as it changed`);
    eq(label, 'Done', `${change}: the sheet's button once the change is saved`);
    await btn.tap();
    await p.waitForTimeout(300);
    await invariant(app);
    eq(view((await app.all())[0].repeat), view(want), `${change}: the rule after closing the sheet`);
    // close the card, then tick the row
    await p.locator('.lh-title').tap();
    await p.waitForTimeout(400);
    await app.reload();
    await app.toggle('Take out bins');
    if (change === 'Thu') await nextIs(app, 'Take out bins', '2026-03-12', { total: 2 });
    else {
      const s = await series(app, 'Take out bins');
      expect(s.all.length === 1 && s.done.length === 1, `after Stop Repeating was saved, ticking should create nothing, found ${s.all.length} (${s.open.length} open)`);
    }
    await app.close();
  }
});

it('a second Complete All from the project\'s own menus (header and heading) never completes the next occurrence', async () => {
  for (const menu of ['list', 'heading']) {
    const heading = menu === 'heading' ? 'h_weekly' : null;
    const app = await openApp({ route: '#/project/p_house', todos: [
      todo('t1', 'Water plants', { project: 'p_house', heading, when: '2026-03-10', repeat: every(1, 'week', 'schedule', { ends: { after: 4 } }) }),
      todo('t2', 'Fix door', { project: 'p_house', heading }),
    ] });
    const p = app.page;
    const where = menu === 'list' ? 'the header\'s List actions > Complete All' : 'the Weekly heading\'s menu > Complete All';
    const brief = all => JSON.stringify(all.map(t => [t.title, t.when, t.completed]));
    const completeAll = async () => {
      await p.locator(`[data-menu="${menu}"]`).first().click();
      await p.waitForTimeout(200);
      await p.getByRole('menuitem', { name: 'Complete All', exact: true }).click();
      await p.waitForTimeout(300);
      await invariant(app);
    };
    await completeAll();
    const next = await nextIs(app, 'Water plants', '2026-03-17', { total: 2 });
    let all = await app.all();
    expect(all.filter(t => t.completed).map(t => t.id).sort().join() === 't1,t2', `${where} should complete t1 and t2, got ${brief(all)}`);
    expect(await p.locator('#toggle-all').isChecked(), `after ${where} the toolbar's Complete All should read as checked`);
    await completeAll();
    all = await app.all();
    const mar17 = all.find(t => t.id === next.id);
    expect(!mar17?.completed, `a second click on ${where} completed the Mar 17 occurrence the person never did: ${brief(all)}`);
    expect(!all.some(t => t.title === 'Water plants' && t.when > '2026-03-17'), `a second click on ${where} created an occurrence past Mar 17: ${brief(all)}`);
    // it either flips back like the toolbar (both reopen, Mar 17 is taken back) or leaves things as the first click did
    const flipped = all.length === 2 && all.every(t => !t.completed) && !!all.find(t => t.id === 't1').repeat;
    const kept = all.length === 3 && mar17 && !mar17.completed && all.filter(t => t.completed).length === 2;
    expect(flipped || kept, `after a second click on ${where}, expected either both reopened with Mar 17 taken back, or t1 and t2 still done with Mar 17 open: ${brief(all)}`);
    await app.close();
  }
});

/**
 * Complete All on a House page left open from Tuesday evening to Wednesday 08:00, with no reload (t1 "Water
 * plants" repeats daily from Tue, t2 "Fix door" is a one-off). `completeAll` does the person's clicks and
 * returns what the box read just before the last one. On Wednesday the click must flip that state, whichever
 * it is: a page that followed the new day reads unchecked, and Complete All completes Wed's occurrence; a page
 * still showing last night's checked box un-checks it, so t1 and Fix door reopen and Wed's occurrence is
 * taken back (what the same click does on Tuesday evening).
 */
async function overnightCompleteAll(app, completeAll, where) {
  const p = app.page;
  const brief = all => JSON.stringify(all.map(t => [t.title, t.when, t.completed, t.repeat ? 'repeats' : 'one-off']));
  expect(!(await completeAll()), `${where} on Tue evening: the box should read unchecked before anything is done`);
  const wed = await nextIs(app, 'Water plants', '2026-03-11', { total: 2 });
  let all = await app.all();
  expect(all.filter(t => t.completed).map(t => t.id).sort().join() === 't1,t2', `${where} on Tue evening should complete t1 and Fix door, got ${brief(all)}`);
  expect(await p.locator('#toggle-all').isChecked(), `after ${where} on Tue evening the box should read checked`);
  // the page stays open overnight: Wednesday 08:00, no reload, no other input
  await p.clock.setFixedTime(new Date('2026-03-11T08:00:00-04:00'));
  await p.waitForTimeout(500);
  const saw = await completeAll();
  all = await app.all();
  const boxAfter = await p.locator('#toggle-all').isChecked();
  if (saw) {
    expect(!all.find(t => t.id === wed.id)?.completed && !all.some(t => t.when === '2026-03-12'),
      `at Wed 08:00 the box read checked, yet ${where} completed Wed's "Water plants" (which nobody did) and created Thu's: ${brief(all)}`);
    expect(all.length === 2 && all.every(t => !t.completed) && !!all.find(t => t.id === 't1')?.repeat,
      `at Wed 08:00 the box read checked, so ${where} must un-check it: reopen t1 (still repeating) and Fix door and take Wed's occurrence back; got ${brief(all)}`);
    expect(!boxAfter, `after un-checking with ${where} the box should read unchecked`);
  } else {
    // the page followed the new day: Wed's occurrence is open work like any other, so Complete All completes it
    expect(['t1', 't2', wed.id].every(id => all.find(t => t.id === id)?.completed),
      `at Wed 08:00 the box read unchecked, so ${where} must complete Wed's occurrence and keep t1 and Fix door done; got ${brief(all)}`);
    await nextIs(app, 'Water plants', '2026-03-12', { total: 3 });
    expect(boxAfter, `after completing all with ${where} on Wednesday the box should read checked`);
  }
}

it('past midnight on an open page, Complete All (toolbar, phone list menu) flips the state its box shows: a checked box un-checks, never completing the new day\'s occurrence', async () => {
  for (const where of ['the toolbar\'s Complete All', 'the phone list menu\'s Complete All']) {
    const phone = where.includes('phone');
    const app = await openApp({ route: '#/project/p_house', now: '2026-03-10T22:00:00-04:00', ...(phone ? { viewport: PHONE, touch: true } : {}), todos: [
      todo('t1', 'Water plants', { project: 'p_house', when: '2026-03-10', repeat: every(1, 'day') }),
      todo('t2', 'Fix door', { project: 'p_house' }),
    ] });
    const p = app.page;
    const completeAll = async () => {
      let saw;
      if (phone) {
        await p.locator('[data-tool=list-menu]').tap();
        await p.waitForTimeout(300);
        saw = await p.locator('#toggle-all').isChecked();
        await p.locator('.menu label.menu-item', { hasText: 'Complete All' }).tap();
      } else {
        saw = await p.locator('#toggle-all').isChecked();
        await p.locator('label.tool[for=toggle-all]').click();
      }
      await p.waitForTimeout(400);
      await invariant(app);
      return saw;
    };
    await overnightCompleteAll(app, completeAll, where);
    await app.close();
  }
});

it('switching a Feb 28 occurrence of a monthly rule to Yearly in the When picker keeps Feb 28: the next one is Feb 28, 2028, not Feb 29', async () => {
  const app = await openApp({ route: '#/today', now: '2027-01-31T09:00:00-05:00', todos: [todo('t1', 'Renew parking permit', { when: '2027-01-31', repeat: every(1, 'month', 'schedule') })] });
  const p = app.page;
  await app.toggle('Renew parking permit'); // Jan 31 -> Feb 28 (clamped; the monthly series still aims for the 31st)
  await nextIs(app, 'Renew parking permit', '2027-02-28', { total: 2 });
  // Feb 28, 2027: open that occurrence's card, its repeat chip (the When picker, on Monthly), the list of kinds, Yearly
  await p.clock.setFixedTime(new Date('2027-02-28T09:00:00-05:00'));
  await app.reload();
  await app.row('Renew parking permit', { completed: false }).first().locator('label').dblclick();
  await p.waitForTimeout(250);
  await p.locator('li.editing .chip-repeat').click();
  await p.waitForTimeout(250);
  await p.locator('[data-shot=repeat] [data-action=repeat-type]').click();
  await p.waitForTimeout(200);
  await p.locator('[data-shot=repeat-kinds] [data-k=yearly]').click();
  await p.waitForTimeout(250);
  const section = (await p.locator('[data-shot=repeat]').first().innerText()).replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 2; i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(150); }
  await invariant(app);
  const r = (await series(app, 'Renew parking permit')).open[0]?.repeat;
  eq(r && [r.mode, r.every, r.unit], ['schedule', 1, 'year'], 'the rule saved when Yearly was chosen');
  await app.toggle('Renew parking permit', { completed: false }); // ticked off on its day, Feb 28, 2027
  await nextIs(app, 'Renew parking permit', '2028-02-28', { total: 3 });
  expect(!/Feb 29/.test(section), `with Yearly chosen on Feb 28, the Repeats section should not promise Feb 29: "${section}"`);
  await app.close();
});

it('overnight on an open project, Complete All from the box or the project menu flips what the box shows (on schedule)', async () => {
  for (const where of ['the Complete All box', 'the project header\'s List actions > Complete All']) {
    const menu = where.includes('header');
    const app = await openApp({ route: '#/project/p_house', now: '2026-03-10T21:00:00-04:00',
      lists: { ...LISTS, projects: [{ ...LISTS.projects[0], headings: [] }], tags: [] },
      todos: [
        todo('t1', 'Water plants', { project: 'p_house', when: '2026-03-10', repeat: every(1, 'day', 'schedule') }),
        todo('t2', 'Fix door', { project: 'p_house' }),
      ] });
    const p = app.page;
    const completeAll = async () => {
      let saw;
      if (menu) {
        await p.locator('[data-menu="list"]').first().click();
        await p.waitForTimeout(200);
        saw = await p.locator('#toggle-all').isChecked();
        await p.getByRole('menuitem', { name: 'Complete All', exact: true }).click();
      } else {
        saw = await p.locator('#toggle-all').isChecked();
        await p.locator('.toolbar label[for="toggle-all"]').click();
      }
      await p.waitForTimeout(300);
      await invariant(app);
      return saw;
    };
    await overnightCompleteAll(app, completeAll, where);
    await app.close();
  }
});

/**
 * A House page left open from Tuesday 21:00 to Wednesday 08:00 with no reload. At Tue 21:00 the person ticks
 * t1 "Water plants" (repeats daily) with its row box, so its Wed occurrence W exists, and Complete All reads
 * unchecked because t2 "Fix door" is still open. At Wed 08:00 `completeAll` does the clicks that finish Fix
 * door. "Its date is still to come" is judged on the day on screen: while the page still shows Tuesday (W
 * dated "Mar 11"), W counts as done with t1, so the click completes Fix door and leaves W alone (what the same
 * click does on Tue evening). Only a page that has already followed the new day shows W as today's open work,
 * and then Complete All completes it.
 */
async function overnightUncheckedCompleteAll(app, completeAll, where) {
  const p = app.page;
  const brief = all => JSON.stringify(all.map(t => [t.title, t.when, t.completed, t.completedAt]));
  await app.toggle('Water plants'); // Tue 21:00, the row box
  const w = await nextIs(app, 'Water plants', '2026-03-11', { total: 2 });
  expect((await app.all()).find(t => t.id === 't1')?.completed, 'ticking t1\'s row on Tue evening should complete it');
  expect(!(await p.locator('#toggle-all').isChecked()), 'on Tue evening, with Fix door still open, the box should read unchecked');
  // the page stays open overnight: Wednesday 08:00, no reload, no other input
  await p.clock.setFixedTime(new Date('2026-03-11T08:00:00-04:00'));
  await p.waitForTimeout(500);
  const wRow = (await p.locator(`.todo-list > li[data-id="${w.id}"]`).innerText()).replace(/\s+/g, ' ').trim();
  const stillTue = /Mar 11/.test(wRow);
  const saw = await completeAll();
  const all = await app.all();
  const byId = id => all.find(t => t.id === id);
  expect(byId('t1')?.completed && byId('t2')?.completed, `at Wed 08:00 ${where} should leave t1 done and complete Fix door, got ${brief(all)}`);
  if (stillTue) {
    expect(!byId(w.id)?.completed && !all.some(t => t.when === '2026-03-12'),
      `at Wed 08:00 the page still showed Tuesday (W's row "${wRow}", box read ${saw ? 'checked' : 'unchecked'}), where W's date is still to come, yet ${where} completed W (a watering nobody did) and created Mar 12's: ${brief(all)}`);
    await nextIs(app, 'Water plants', '2026-03-11', { total: 2 });
  } else {
    // the page followed the new day: W is today's open work like any other, so Complete All completes it
    expect(byId(w.id)?.completed, `at Wed 08:00 the page showed Wednesday (W's row "${wRow}"), so ${where} must complete W; got ${brief(all)}`);
    await nextIs(app, 'Water plants', '2026-03-12', { total: 3 });
  }
}

it('left open overnight with Complete All reading unchecked, a click completes Fix door and leaves the next occurrence still shown as tomorrow\'s alone (after completion)', async () => {
  const lists = { ...LISTS, projects: [{ ...LISTS.projects[0], headings: [] }], tags: [] };
  for (const where of ['the toolbar\'s Complete All', 'the project header\'s List actions > Complete All', 'the phone list menu\'s Complete All']) {
    const phone = where.includes('phone'), menu = where.includes('header');
    const app = await openApp({ route: '#/project/p_house', now: '2026-03-10T21:00:00-04:00', lists, ...(phone ? { viewport: PHONE, touch: true } : {}), todos: [
      todo('t1', 'Water plants', { project: 'p_house', when: '2026-03-10', repeat: every(1, 'day') }),
      todo('t2', 'Fix door', { project: 'p_house' }),
    ] });
    const p = app.page;
    const completeAll = async () => {
      let saw;
      if (phone) {
        await p.locator('[data-tool=list-menu]').tap();
        await p.waitForTimeout(300);
        saw = await p.locator('#toggle-all').isChecked();
        await p.locator('.menu label.menu-item', { hasText: 'Complete All' }).tap();
      } else if (menu) {
        await p.locator('[data-menu="list"]').first().click();
        await p.waitForTimeout(200);
        saw = await p.locator('#toggle-all').isChecked();
        await p.getByRole('menuitem', { name: 'Complete All', exact: true }).click();
      } else {
        saw = await p.locator('#toggle-all').isChecked();
        await p.locator('label.tool[for=toggle-all]').click();
      }
      await p.waitForTimeout(500);
      await invariant(app);
      return saw;
    };
    await overnightUncheckedCompleteAll(app, completeAll, where);
    await app.close();
  }
});

it('on schedule, a Complete All that reads unchecked past midnight (Fix door still open) never completes the occurrence the screen still dates tomorrow: box, project menu, phone list menu', async () => {
  const lists = { ...LISTS, tags: [] };
  for (const where of ['the toolbar box', 'the project header\'s List actions > Complete All', 'the phone list menu\'s Complete All']) {
    const phone = where.includes('phone'), menu = where.includes('header');
    const app = await openApp({ route: '#/project/p_house', now: '2026-03-10T21:00:00-04:00', lists, ...(phone ? { viewport: PHONE, touch: true } : {}), todos: [
      todo('t1', 'Water plants', { project: 'p_house', when: '2026-03-10', repeat: every(1, 'day', 'schedule') }),
      todo('t2', 'Fix door', { project: 'p_house' }),
    ] });
    const p = app.page;
    const completeAll = async () => {
      const saw = await p.locator('#toggle-all').isChecked();
      if (phone) {
        await p.locator('.tb-more').tap();
        await p.waitForTimeout(200);
        await p.locator('.menu label.menu-item[for=toggle-all]').tap();
      } else if (menu) {
        await p.locator('.lh-more').click();
        await p.waitForTimeout(200);
        await p.locator('.menu .menu-item', { hasText: 'Complete All' }).click();
      } else await p.locator('label.tool[for=toggle-all]').click();
      await p.waitForTimeout(400);
      await invariant(app);
      return saw;
    };
    await overnightUncheckedCompleteAll(app, completeAll, where);
    await app.close();
  }
});

it('a Monthly rule set on the 31st: the When picker rings the dates the series falls on (Apr 30, May 31, Jun 30, Jul 31 ...), and its clamped Apr 30 occurrence still reads as the 31st', async () => {
  const app = await openApp({ route: '#/project/p_house', todos: [todo('t1', 'Pay rent', { when: '2026-03-31', project: 'p_house' })] });
  const p = app.page;
  const falls = ['2026-04-30', '2026-05-31', '2026-06-30', '2026-07-31', '2026-08-31', '2026-09-30', '2026-10-31']; // contract: 31 keeps its anchor
  const problems = [];
  // Mar 10: open the card, its When chip, turn repeating on, then the list of kinds > Monthly
  await app.row('Pay rent').first().locator('label').dblclick();
  await p.waitForTimeout(300);
  await p.locator('li.editing .chip-when').click();
  await p.waitForTimeout(250);
  await p.locator('[data-shot=when] [data-action=repeat]').click();
  await p.waitForTimeout(200);
  await p.locator('[data-shot=repeat] [data-action=repeat-type]').click();
  await p.waitForTimeout(150);
  await p.locator('[data-shot=repeat-kinds] [data-k=monthly]').click();
  await p.waitForTimeout(200);
  const r = (await app.all())[0].repeat;
  eq(r && [r.mode, r.every, r.unit, r.monthly ?? null], ['schedule', 1, 'month', null], 'the rule saved when Monthly was chosen');
  const onDay = (await p.locator('[data-shot=repeat] [data-rp=day] .rp-val').innerText()).trim();
  // page the calendar forward with its Later arrow until Oct 31 has shown, collecting the rings
  const rings = new Set();
  let shownUntil = '';
  for (let i = 0; i < 16 && shownUntil < '2026-10-31'; i++) {
    for (const v of await p.locator('[data-shot=when] .cal-day.rp-next').evaluateAll(els => els.map(e => e.dataset.v))) rings.add(v);
    const days = await p.locator('[data-shot=when] .cal-day[data-v]').evaluateAll(els => els.map(e => e.dataset.v).filter(v => /^\d{4}-\d\d-\d\d$/.test(v)));
    if (days.length && days[days.length - 1] > shownUntil) shownUntil = days[days.length - 1];
    await p.locator('[data-shot=when] .cal-next').click();
    await p.waitForTimeout(100);
  }
  const ringed = [...rings].filter(v => v <= '2026-10-31').sort();
  if (JSON.stringify(ringed) !== JSON.stringify(falls)) {
    problems.push(`with "On day: ${onDay}" the calendar rings ${ringed.filter(v => !falls.includes(v)).join(', ') || 'no wrong day'}, where the series never falls,` +
      ` and misses ${falls.filter(v => !ringed.includes(v)).join(', ') || 'none'}, where it does`);
  }
  for (let i = 0; i < 2 && await p.locator('li.editing').count(); i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(200); }
  await invariant(app);
  // tick each occurrence on its own day: the engine creates the dates the rule falls on
  let day = '2026-03-31';
  for (const [i, want] of falls.entries()) {
    await app.setDay(day);
    await app.toggle('Pay rent', { completed: false });
    const next = await nextIs(app, 'Pay rent', want, { total: i + 2 });
    day = next.when;
    if (i === 0) {
      // the clamped Apr 30 occurrence (anchorDay 31): what its row, card chip and picker say about the rule
      const row = await app.row('Pay rent', { completed: false }).first().locator('.row-icon-repeat').getAttribute('aria-label');
      await app.row('Pay rent', { completed: false }).first().locator('label').dblclick();
      await p.waitForTimeout(300);
      const chip = await p.locator('li.editing .chip-repeat').first().getAttribute('aria-label');
      await p.locator('li.editing .chip-repeat').first().click();
      await p.waitForTimeout(250);
      const onDay2 = (await p.locator('[data-shot=repeat] [data-rp=day] .rp-val').innerText()).trim();
      const note = (await p.locator('[data-shot=repeat] .rp-note').innerText()).replace(/\s+/g, ' ').trim();
      const says30 = [['row', row], ['card chip', chip], ['picker\'s On day', onDay2]].filter(([, text]) => /\b30th\b/.test(text || ''));
      if (says30.length) problems.push(`on the clamped Apr 30 occurrence (anchorDay ${next.anchorDay}) ${says30.map(([what, text]) => `the ${what} reads "${text}"`).join(', ')}, while its note says "${note}"`);
      for (let k = 0; k < 2 && await p.locator('li.editing').count(); k++) { await p.keyboard.press('Escape'); await p.waitForTimeout(200); }
      await invariant(app);
    }
  }
  expect(!problems.length, problems.join(' | '));
  await app.close();
});

it('turning Repeat on from the open card\'s When chip keeps the When picker inside the window: every kind, Ends and Stop Repeating stay in reach of the pointer, and so does the picker reopened from that chip', async () => {
  const viewport = { width: 1200, height: 800 }, H = viewport.height;
  const app = await openApp({ route: '#/today', viewport, lists: { areas: [], projects: [], tags: [] }, todos: [
    todo('t1', 'Call mom', { when: 'today' }), todo('t2', 'Buy milk', { when: 'today' }), todo('t3', 'Book dentist', { when: 'today' }),
    todo('t4', 'Water plants', { when: 'evening' }),
  ] });
  const p = app.page;
  const problems = [];
  const span = sel => p.locator(sel).first().evaluate(e => { const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; });
  const rule = async () => (await app.all()).find(t => t.id === 't4').repeat;
  // what a mouse user can reach: on screen (or scrolled to inside the picker) and not covered by anything
  const reach = sel => p.locator(sel).first().click({ trial: true, timeout: 1000 }).then(() => true, () => false);
  /** One look at the picker: it must lie inside the window, with each of `controls` in the pointer's reach. */
  const look = async (when, controls) => {
    const [top, bottom] = await span('.when-pop');
    const out = [];
    for (const [what, sel] of controls) if (!(await reach(sel))) out.push(`${what} ${(await span(sel)).join('..')}`);
    if (top < 0 || bottom > H || out.length) problems.push(`${when}: picker at y ${top}..${bottom}${out.length ? `, out of reach: ${out.join(', ')}` : ''}`);
    return out.length === 0;
  };
  // open the card of "Water plants" (This Evening), click its When chip, then Repeat in the picker
  await app.row('Water plants').first().locator('label').dblclick();
  await p.waitForTimeout(300);
  await p.locator('li.editing .chip-when').click();
  await p.waitForTimeout(300);
  await p.locator('[data-shot=when] [data-action=repeat]').click();
  await p.waitForTimeout(300);
  expect(!!(await rule()), 'Repeat in the When picker should turn repeating on');
  await look('after Repeat', [['Ends', '[data-shot=repeat] [data-rp=ends]'], ['Stop Repeating', '[data-shot=repeat] [data-rp=off]']]);
  // the kind button: the list of kinds, then After Completion with the pointer
  await p.locator('[data-shot=repeat] [data-action=repeat-type]').click();
  await p.waitForTimeout(300);
  const kinds = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly', custom: 'Custom', after: 'After Completion' };
  await look('list of kinds open', Object.entries(kinds).map(([k, label]) => [label, `[data-shot=repeat-kinds] [data-k=${k}]`]));
  if (await reach('[data-shot=repeat-kinds] [data-k=after]')) {
    await p.locator('[data-shot=repeat-kinds] [data-k=after]').click({ timeout: 2000 });
    await p.waitForTimeout(300);
    const r = await rule();
    if (r?.mode !== 'completion') problems.push(`a click on After Completion saved ${JSON.stringify(r)}`);
  }
  // close the picker, then reopen it from the card's When chip
  for (let i = 0; i < 3 && await p.locator('.when-pop').count(); i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(150); }
  await p.locator('li.editing .chip-when').click();
  await p.waitForTimeout(300);
  await look('reopened from the When chip', [['its search field', '.when-pop .when-input'], ['Stop Repeating', '[data-shot=repeat] [data-rp=off]']]);
  expect(!problems.length, `in the ${viewport.width}x${H} window, ${problems.join(' | ')}`);
  for (let i = 0; i < 4 && await p.locator('.when-pop, li.editing').count(); i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(200); }
  await invariant(app);
  // ticked off today, the After Completion rule makes the next one `every` units from today
  const r = await rule();
  eq(r && r.mode, 'completion', 'the rule after picking After Completion');
  const next = new Date(Date.UTC(2026, 2, 10));
  if (r.unit === 'day' || r.unit === 'week') next.setUTCDate(next.getUTCDate() + r.every * (r.unit === 'week' ? 7 : 1));
  else if (r.unit === 'month') next.setUTCMonth(next.getUTCMonth() + r.every);
  else next.setUTCFullYear(next.getUTCFullYear() + r.every);
  await app.toggle('Water plants');
  await nextIs(app, 'Water plants', next.toISOString().slice(0, 10), { total: 2 });
  await app.close();
});

it('in the When picker\'s Repeats section, a number cleared and retyped after using another control saves what was typed (every 3 weeks, not 32; ends after 3, not 310)', async () => {
  const problems = [];
  for (const field of ['every', 'count']) {
    const title = field === 'every' ? 'Water plants' : 'Physio exercises';
    const repeat = field === 'every' ? every(2, 'day') : every(1, 'week', 'schedule', { weekdays: [2], ends: { after: 10 } });
    const app = await openApp({ route: '#/project/p_house', todos: [todo('t1', title, { project: 'p_house', when: '2026-03-10', repeat })] });
    const p = app.page;
    // open the card, then its repeat chip: the When picker on the Repeats section
    await app.row(title).first().locator('label').dblclick();
    await p.waitForTimeout(250);
    await p.locator('li.editing .chip-repeat').click();
    await p.waitForTimeout(250);
    const f = p.locator(`[data-shot=repeat] [data-rp=${field}]`);
    if (field === 'every') {
      // clear the 2, pick "weeks" from the unit menu, type 3
      await f.click();
      await f.press('End');
      await f.press('Backspace');
      await p.locator('[data-shot=repeat] [data-rp=unit]').click();
      await p.waitForTimeout(150);
      await p.locator('.rp-menu .rp-mi', { hasText: /^weeks?$/ }).click();
      await p.waitForTimeout(250);
    } else {
      // clear the 10 from its start, also on Friday, type 3
      await f.click({ position: { x: 2, y: 5 } });
      await f.press('Delete');
      await f.press('Delete');
      await p.locator('[data-shot=repeat] [data-rp=wd][data-d="5"]').click();
      await p.waitForTimeout(250);
    }
    await p.keyboard.type('3');
    await p.waitForTimeout(250);
    const shown = await f.inputValue();
    const note = (await p.locator('[data-shot=repeat] .rp-note').innerText()).replace(/\s+/g, ' ').trim();
    for (let i = 0; i < 3 && await p.locator('li.editing').count(); i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(150); }
    await invariant(app);
    const r = (await app.all())[0].repeat;
    const [steps, got, want] = field === 'every'
      ? ['cleared the 2, picked weeks, typed 3', r && [r.mode, r.every, r.unit], ['completion', 3, 'week']]
      : ['Tue weekly, ends after 10: cleared the 10, ticked Fri, typed 3', r && [r.weekdays, r.ends], [[2, 5], { after: 3 }]];
    if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${steps}: saved ${JSON.stringify(got)}, not ${JSON.stringify(want)} (field "${shown}", note "${note}")`);
    else if (field === 'every') {
      await app.toggle(title);
      await nextIs(app, title, '2026-03-31', { total: 2 });
    }
    await app.close();
  }
  expect(!problems.length, problems.join(' | '));
});

it('in Upcoming the open card of a repeating to-do stays open while its row moves (Cmd+K and Cmd+K again, a new date from its When chip): what is typed next stays in the card, and a cleared title never deletes the series', async () => {
  // Upcoming files rows in date sections, so these steps move the card's row to another place in the list
  // (a section above it comes and goes, or it changes section) while the to-do never leaves the list. The
  // project view is the control: there the same steps keep the card open.
  const problems = [];
  const where = p => p.evaluate(() => {
    const a = document.activeElement;
    return {
      open: document.querySelectorAll('li.editing').length === 1,
      focus: a ? a.tagName.toLowerCase() + (a.classList.length ? '.' + a.classList[0] : '') : '',
      quickFind: document.querySelector('[data-shot="quickfind"] input')?.value || '',
      composer: document.querySelector('.new-todo')?.value || '',
    };
  });
  const lostTo = w => `card ${w.open ? 'open' : 'closed'} (focus ${w.focus}` + (w.quickFind ? `, Quick Find "${w.quickFind}"` : '') + (w.composer ? `, new to-do "${w.composer}"` : '') + ')';
  const t1Of = async app => (await app.all()).find(t => t.id === 't1');
  for (const route of ['#/upcoming', '#/project/p_house']) {
    const view = route.slice(2);
    // 1. the repeat engine: Cmd+K in the notes finishes it early, the next one lands on Tue Mar 17 (a section
    //    above it); Cmd+K again takes that back; the person keeps writing the note
    {
      const app = await openApp({ route, todos: [
        todo('t0', 'Dentist', { when: '2026-03-13', project: 'p_house' }),
        todo('t1', 'Change water filter', { when: '2026-03-20', project: 'p_house', repeat: every(1, 'week') }),
      ] });
      const p = app.page;
      await app.row('Change water filter').first().locator('label').dblclick();
      await p.waitForTimeout(300);
      await p.locator('li.editing .card-notes').click();
      await p.keyboard.type('Used the spare cartridge');
      await p.waitForTimeout(100);
      await p.keyboard.press('Meta+k');
      await p.waitForTimeout(300);
      await invariant(app);
      expect((await t1Of(app))?.completed, `${route}: Cmd+K in the card's notes should complete "Change water filter"`);
      await nextIs(app, 'Change water filter', '2026-03-17', { total: 2 });
      const afterDone = await where(p);
      if (!afterDone.open || afterDone.focus !== 'textarea.card-notes') problems.push(`${view} Cmd+K: ${lostTo(afterDone)}, not open with focus in its notes`);
      await p.keyboard.press('Meta+k');
      await p.waitForTimeout(300);
      await invariant(app);
      const s = await series(app, 'Change water filter');
      expect(s.all.length === 1 && s.open.length === 1 && s.open[0].id === 't1', `${route}: Cmd+K again should reopen t1 and take Mar 17 back, found ${JSON.stringify(s.all.map(t => [t.id, t.when, t.completed]))}`);
      await p.keyboard.type('Next-time-buy-two');
      await p.waitForTimeout(250);
      await invariant(app);
      const w = await where(p), t1 = await t1Of(app);
      if (!w.open || t1?.notes !== 'Used the spare cartridgeNext-time-buy-two') problems.push(`${view} Cmd+K twice, typed: ${lostTo(w)}, notes "${t1?.notes}"`);
      await app.close();
    }
    // 2. a new date from the card's When chip ("mon" = Mar 16, another section), typing the title on
    {
      const app = await openApp({ route, todos: [
        todo('t0', 'Dentist', { when: '2026-03-13', project: 'p_house' }),
        todo('t1', 'Water plants', { when: '2026-03-12', project: 'p_house', notes: 'balcony', repeat: every(1, 'week', 'schedule') }),
      ] });
      const p = app.page;
      await app.row('Water plants').first().locator('label').dblclick(); // the caret lands at the end of the title
      await p.waitForTimeout(300);
      await p.keyboard.type(' and ferns');
      await p.waitForTimeout(100);
      await p.locator('li.editing .chip-when').click();
      await p.waitForTimeout(300);
      await p.keyboard.type('mon');
      await p.keyboard.press('Enter');
      await p.waitForTimeout(300);
      await p.keyboard.type(' on the balcony');
      await p.waitForTimeout(250);
      await invariant(app);
      const w = await where(p), t1 = await t1Of(app);
      eq(t1?.when, '2026-03-16', `${route}: date picked from the When chip ("mon")`);
      if (!w.open || t1?.title !== 'Water plants and ferns on the balcony') problems.push(`${view} new date, typed: ${lostTo(w)}, title "${t1?.title}"`);
      await app.close();
    }
    // 3. the title cleared to retype it, a new date from the When chip, the new title typed
    {
      const app = await openApp({ route, todos: [
        todo('t0', 'Dentist', { when: '2026-03-13', project: 'p_house' }),
        todo('t1', 'Water plants', { when: '2026-03-12', project: 'p_house', notes: 'balcony ferns, 1 litre each', checklist: [{ id: 'c1', title: 'Fern', completed: false }], repeat: every(1, 'week', 'schedule') }),
      ] });
      const p = app.page;
      await app.row('Water plants').first().locator('label').dblclick();
      await p.waitForTimeout(300);
      await p.keyboard.press('ControlOrMeta+a'); // select the whole title
      await p.keyboard.press('Backspace');
      await p.waitForTimeout(100);
      await p.locator('li.editing .chip-when').click();
      await p.waitForTimeout(300);
      await p.keyboard.type('mon');
      await p.keyboard.press('Enter');
      await p.waitForTimeout(400);
      await invariant(app);
      const kept = await t1Of(app);
      if (!kept) problems.push(`${view} title cleared, new date: ${lostTo(await where(p))}, t1 deleted with its notes, checklist and rule`);
      else {
        await p.keyboard.type('Water the ferns');
        await p.waitForTimeout(250);
        await invariant(app);
        const w = await where(p), t1 = await t1Of(app);
        const got = t1 && [t1.title, t1.when, t1.notes, t1.checklist.map(c => c.title), !!t1.repeat];
        if (!w.open || JSON.stringify(got) !== JSON.stringify(['Water the ferns', '2026-03-16', 'balcony ferns, 1 litre each', ['Fern'], true])) problems.push(`${view} title cleared, new date, typed: ${lostTo(w)}, t1 ${JSON.stringify(got)}`);
      }
      await app.close();
    }
  }
  expect(!problems.length, problems.join(' | '));
});

// ---------- run ----------
await ensureServer();
browser = await chromium.launch();
const results = [];
for (const s of scenarios) {
  if (only && !s.name.includes(only)) continue;
  try { await s.fn(); results.push({ name: s.name, ok: true }); }
  catch (e) {
    const msg = String(e.message || e);
    // Playwright puts the locator that timed out on a later line; keep it
    const loc = (msg.match(/waiting for (locator\([^\n]*)/) || [])[1];
    results.push({ name: s.name, ok: false, error: (msg.split('\n')[0] + (loc ? ` — ${loc}` : '')).slice(0, 400) });
  }
}
await browser.close();
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '\n      ' + r.error}`);
const passing = results.filter(r => r.ok).length;
const green = passing === results.length && results.length > 0;
if (!only) fs.writeFileSync(path.join(ROOT, 'gauntlet/recur.json'), JSON.stringify({ green, passing, total: results.length, failed: results.filter(r => !r.ok), by: who, at: new Date().toISOString() }, null, 2));
console.log(`${passing}/${results.length} passing`);
console.log('RECUR ' + (green ? 'GREEN' : 'RED'));
process.exit(green ? 0 : 1);

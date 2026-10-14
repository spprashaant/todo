// Behaviour check for cloud sync (app/js/sync.js).
//   node tools/sync-check.mjs [--only <substring>]
// Runs the real app in Chromium as two "devices" (separate browser contexts, so separate localStorage)
// against a stand-in for Supabase: the page's Supabase client module is swapped for a small fake that
// forwards each call to an in-memory `items` table here. The table follows the real one's rules: rows
// belong to one account, a deletion is a row marked deleted, the server stamps updated_at, an update older
// than the stored row is skipped (the items_touch trigger), and keys come back in jsonb's order. Nothing
// reaches the real project and no real credentials are used. Prints SYNC GREEN / SYNC RED.
// Needs the app server (node tools/serve.mjs); starts it when it isn't running.
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.APP_BASE || 'http://localhost:5173') + '/app/';
const argv = process.argv.slice(2);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;

const EMAIL = 'me@example.test', PASSWORD = 'test-password-1', USER = '00000000-0000-4000-8000-000000000001';
const LISTS = {
  areas: [{ id: 'a_home', title: 'Home' }],
  projects: [{ id: 'p_house', title: 'House', area: 'a_home', notes: '', headings: [{ id: 'h_w', title: 'Weekly' }] }],
  tags: ['Home', 'Errand'],
};
const EMPTY = { areas: [], projects: [], tags: [] };
const todo = (id, title, extra = {}) => ({
  id, title, completed: false, completedAt: null, notes: '', checklist: [], when: null, deadline: null, tags: [],
  project: null, area: null, heading: null, createdAt: '2026-09-20T12:00:00.000Z', ...extra,
});
const SEED = [
  todo('t_1', 'Buy milk'),
  todo('t_2', 'Call mom', { when: 'today' }),
  todo('t_3', 'Fix sink', { project: 'p_house', heading: 'h_w', tags: ['Home'] }),
];

async function ensureServer() {
  const up = async () => { try { return (await fetch(BASE)).ok; } catch { return false; } };
  if (await up()) return;
  spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs')], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 50 && !(await up()); i++) await new Promise(r => setTimeout(r, 200));
}

// ---------- the stand-in server ----------
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/** jsonb's key order (shorter keys first), so the app can't rely on getting its own key order back. */
const jsonb = v => Array.isArray(v) ? v.map(jsonb)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort((a, b) => a.length - b.length || cmp(a, b)).map(k => [k, jsonb(v[k])]))
  : v;

class Server {
  constructor() { this.rows = new Map(); this.last = 0; this.offline = new Set(); this.pages = new Set(); this.writes = []; this.calls = 0; }
  now() { this.last = Math.max(this.last + 1, Date.now()); return new Date(this.last).toISOString(); }
  handle(device, a) {
    this.calls++;
    if (this.offline.has(device)) return { error: 'TypeError: Failed to fetch' };
    if (a.op === 'signin') return a.email === EMAIL && a.password === PASSWORD ? { user: { id: USER, email: EMAIL } } : { error: 'Invalid login credentials' };
    if (!a.uid) return { error: 'permission denied for table items' };
    if (a.op === 'select') {
      let rows = [...this.rows.values()].filter(r => r.user_id === a.uid);
      for (const [op, col, v] of a.q.filters) if (op === 'gt') rows = rows.filter(r => Date.parse(r[col]) > Date.parse(v));
      rows.sort((x, y) => cmp(x.updated_at, y.updated_at) || cmp(x.kind, y.kind) || cmp(x.id, y.id));
      const [from, to] = a.q.range || [0, rows.length - 1];
      return { data: rows.slice(from, to + 1).map(r => ({ kind: r.kind, id: r.id, data: jsonb(r.data), position: r.position, deleted: r.deleted, modified_at: r.modified_at, updated_at: r.updated_at })) };
    }
    if (a.op === 'upsert') {
      if (a.q.rows.some(r => r.user_id !== a.uid)) return { error: 'new row violates row-level security policy for table "items"' };
      const written = [];
      for (const row of a.q.rows) {
        const k = `${row.user_id}|${row.kind}|${row.id}`;
        const old = this.rows.get(k);
        if (old && row.modified_at < old.modified_at) continue; // the items_touch trigger: an older edit is skipped
        this.rows.set(k, { ...row, updated_at: this.now() });
        written.push(`${row.kind}:${row.id}`);
      }
      this.writes.push({ device, written });
      setTimeout(() => this.broadcast(device), 20);
      return { data: null };
    }
    return { error: 'unknown op ' + a.op };
  }
  broadcast() {
    for (const p of this.pages) if (!p.isClosed()) p.evaluate(() => window.__fakeRealtime?.()).catch(() => {});
  }
  row(kind, id) { return this.rows.get(`${USER}|${kind}|${id}`); }
  live(kind) { return [...this.rows.values()].filter(r => r.kind === kind && !r.deleted).sort((a, b) => a.position - b.position).map(r => r.id); }
}

// The Supabase client, as far as sync.js uses it, backed by window.__fakeDb (the server above).
const FAKE_CLIENT = `
export function createClient(url, key, opts) {
  const storageKey = opts.auth.storageKey;
  const call = a => window.__fakeDb(a).then(r => r || {}, () => ({ error: 'TypeError: Failed to fetch' }));
  let session = null;
  try { session = JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch {}
  const listeners = new Set();
  const tell = ev => listeners.forEach(fn => fn(ev, session));
  const channels = new Set();
  window.__fakeRealtime = () => { for (const ch of channels) for (const cb of ch.cbs) cb({}); };
  return {
    auth: {
      onAuthStateChange(fn) { listeners.add(fn); setTimeout(() => fn('INITIAL_SESSION', session)); return { data: { subscription: { unsubscribe: () => listeners.delete(fn) } } }; },
      async signInWithPassword({ email, password }) {
        const r = await call({ op: 'signin', email, password });
        if (r.error) return { data: { user: null, session: null }, error: { message: r.error } };
        session = { user: r.user };
        localStorage.setItem(storageKey, JSON.stringify(session));
        tell('SIGNED_IN');
        return { data: { user: r.user, session }, error: null };
      },
      async signOut() { session = null; localStorage.removeItem(storageKey); tell('SIGNED_OUT'); return { error: null }; },
    },
    from(table) {
      const q = { table, filters: [], orders: [], range: null, op: 'select', rows: null };
      const b = {
        select() { q.op = 'select'; return b; },
        gt(col, v) { q.filters.push(['gt', col, v]); return b; },
        order(col) { q.orders.push(col); return b; },
        range(from, to) { q.range = [from, to]; return b; },
        upsert(rows, o) { q.op = 'upsert'; q.rows = rows; q.onConflict = o && o.onConflict; return b; },
        then(ok, no) {
          return call({ op: q.op, uid: session && session.user.id, q: JSON.parse(JSON.stringify(q)) })
            .then(r => (r.error ? { data: null, error: { message: r.error } } : { data: r.data ?? null, error: null }))
            .then(ok, no);
        },
      };
      return b;
    },
    channel() {
      const ch = { cbs: [], on(type, filter, cb) { ch.cbs.push(cb); return ch; }, subscribe(cb) { channels.add(ch); setTimeout(() => cb && cb('SUBSCRIBED')); return ch; } };
      return ch;
    },
    removeChannel(ch) { channels.delete(ch); return Promise.resolve('ok'); },
  };
}`;

// ---------- devices ----------
let browser, server;

async function device(name, { todos = [], lists = EMPTY, viewport = { width: 1200, height: 800 } } = {}) {
  const context = await browser.newContext({ viewport, locale: 'en-US', serviceWorkers: 'block' });
  const d = { name, context, pages: [], errors: [], requests: [] };
  context.on('request', r => d.requests.push(r.url()));
  await context.route('**/vendor/supabase.mjs', r => r.fulfill({ contentType: 'text/javascript', body: FAKE_CLIENT }));
  await context.exposeFunction('__fakeDb', a => server.handle(name, a));
  await context.addInitScript(seed => {
    if (localStorage.getItem('__sync_seeded')) return; // once per device, so a second tab shares its storage
    localStorage.clear();
    localStorage.setItem('things-todos', JSON.stringify(seed.todos));
    localStorage.setItem('things-lists', JSON.stringify(seed.lists));
    localStorage.setItem('__sync_seeded', '1');
  }, { todos, lists });
  d.open = async (route = '#/') => {
    const page = await context.newPage();
    page.on('pageerror', e => d.errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') d.errors.push('console: ' + m.text()); });
    await page.goto(BASE + route, { waitUntil: 'networkidle' });
    server.pages.add(page);
    d.pages.push(page);
    return page;
  };
  d.page = await d.open();
  // the app's own (normalised) copy, after catching up with what its storage holds
  d.data = (p = d.page) => p.evaluate(async () => { const s = await import('/app/js/store.js'); s.refresh(); return JSON.parse(JSON.stringify(s.state)); });
  d.todo = async (id, p) => (await d.data(p)).todos.find(t => t.id === id) || null;
  d.ids = async p => (await d.data(p)).todos.map(t => t.id);
  d.phase = (p = d.page) => p.evaluate(async () => (await import('/app/js/sync.js')).status.phase);
  d.openPanel = async (p = d.page) => {
    await p.locator('[data-sb=settings]').click();
    await p.locator('.menu-item', { hasText: 'Sync…' }).click();
    await p.locator('.acct').waitFor();
  };
  d.signIn = async (p = d.page, password = PASSWORD) => {
    await d.openPanel(p);
    await p.locator('.acct-field[name=email]').fill(EMAIL);
    await p.locator('.acct-field[name=password]').fill(password);
    await p.locator('.acct-btn.primary').click();
    if (password !== PASSWORD) return;
    await p.locator('.acct-status[data-phase=synced]').waitFor({ timeout: 6000 });
    await p.locator('[data-acct=close]').click();
  };
  d.goOffline = async () => { server.offline.add(name); await context.setOffline(true); };
  d.goOnline = async () => { server.offline.delete(name); await context.setOffline(false); };
  d.close = () => context.close();
  return d;
}

/** Run `fn(store, arg)` in the page, with the app's own store module. `fn` must not use anything outside itself. */
const withStore = (page, fn, arg) => page.evaluate(async ([src, arg]) => {
  const s = await import('/app/js/store.js');
  return (0, eval)('(' + src + ')')(s, arg);
}, [fn.toString(), arg]);

async function eventually(fn, what, ms = 6000) {
  const end = Date.now() + ms;
  let last;
  for (;;) {
    try { last = await fn(); if (last === true) return; } catch (e) { last = String(e.message || e); }
    if (Date.now() > end) throw new Error(`${what}${last !== false && last !== undefined ? ` (last: ${typeof last === 'string' ? last : JSON.stringify(last)})` : ''}`);
    await new Promise(r => setTimeout(r, 100));
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function expect(ok, msg) { if (!ok) throw new Error(msg); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Two signed-in devices in step: A started with `todos`/`lists`, B started empty. */
async function pair(todos = SEED, lists = LISTS) {
  const a = await device('A', { todos, lists });
  await a.signIn();
  const b = await device('B');
  await b.signIn();
  const want = todos.map(t => t.id);
  await eventually(async () => same(await b.ids(), want) || await b.ids(), 'B never caught up with A');
  return [a, b];
}

// ---------- scenarios ----------
const scenarios = [];
const scenario = (name, fn) => scenarios.push({ name, fn });

scenario('signed out: sync stays off, sends nothing and stores nothing extra', async () => {
  const a = await device('A', { todos: SEED, lists: LISTS });
  await a.page.locator('.new-todo').fill('Walk the dog');
  await a.page.keyboard.press('Enter');
  await sleep(1200);
  const keys = await a.page.evaluate(() => Object.keys(localStorage).sort());
  const extra = keys.filter(k => !['things-todos', 'things-lists', 'things-sidebar', '__sync_seeded'].includes(k));
  expect(server.calls === 0, `server was called ${server.calls} times`);
  expect(!a.requests.some(u => u.includes('supabase')), 'the Supabase client was loaded');
  expect(!extra.length, `extra keys stored: ${extra}`);
  expect((await a.ids()).length === 4, 'the new to-do was not saved');
  expect(!a.errors.length, a.errors.join(' | '));
  await a.close();
});

scenario('a wrong password says so and stays signed out', async () => {
  const a = await device('A', { todos: SEED, lists: LISTS });
  await a.signIn(a.page, 'nope');
  await eventually(async () => /don’t match/.test(await a.page.locator('.acct-error').textContent()), 'no error shown');
  expect(await a.phase() === 'off', 'not signed out');
  expect(server.rows.size === 0, 'rows were written');
  await a.close();
});

scenario('first sign-in uploads this device’s to-dos, areas, projects and tags', async () => {
  const a = await device('A', { todos: SEED, lists: LISTS });
  await a.signIn();
  await eventually(() => same(server.live('todo'), ['t_1', 't_2', 't_3']) || server.live('todo'), 'to-dos not uploaded in order');
  expect(same(server.live('area'), ['a_home']) && same(server.live('project'), ['p_house']) && same(server.live('tag'), ['Home', 'Errand']), 'lists not uploaded');
  const t3 = await a.todo('t_3');
  expect(same(jsonb(server.row('todo', 't_3').data), jsonb(t3)), 'stored to-do differs from the device’s');
  expect(!a.errors.length, a.errors.join(' | '));
  await a.close();
});

scenario('a second device gets everything, in the same order', async () => {
  const [a, b] = await pair();
  const da = await a.data(), db = await b.data();
  expect(same(jsonb(da.todos), jsonb(db.todos)), 'to-dos differ');
  expect(same(jsonb(da.lists), jsonb(db.lists)), `lists differ: ${JSON.stringify(db.lists)}`);
  await b.page.goto(BASE + '#/project/p_house');
  await b.page.locator('.todo-list li', { hasText: 'Fix sink' }).waitFor({ timeout: 3000 });
  expect(!a.errors.length && !b.errors.length, [...a.errors, ...b.errors].join(' | '));
  await a.close(); await b.close();
});

scenario('an edit on one device shows on the other within seconds', async () => {
  const [a, b] = await pair();
  await withStore(a.page, (s) => s.updateTodo('t_1', { title: 'Buy oat milk', notes: 'the barista one' }));
  await eventually(async () => (await b.todo('t_1'))?.title === 'Buy oat milk', 'B never got the edit', 4000);
  await b.page.locator('.todo-list li', { hasText: 'Buy oat milk' }).waitFor({ timeout: 2000 });
  await a.close(); await b.close();
});

scenario('moving one to-do sends only that one, and the order matches', async () => {
  const [a, b] = await pair();
  const before = server.writes.length;
  await withStore(a.page, (s) => s.moveTodo('t_3', 't_1'));
  await eventually(async () => same(await b.ids(), ['t_3', 't_1', 't_2']) || await b.ids(), 'B order differs');
  const sent = server.writes.slice(before).filter(w => w.device === 'A').flatMap(w => w.written);
  expect(same(sent, ['todo:t_3']), `A sent ${JSON.stringify(sent)}`);
  await a.close(); await b.close();
});

scenario('completing a repeating to-do: its next one appears on the other device, right after it', async () => {
  const rep = todo('t_r', 'Water plants', { when: 'today', repeat: { mode: 'completion', every: 1, unit: 'day' } });
  const [a, b] = await pair([...SEED, rep]);
  const before = server.writes.length;
  await withStore(a.page, (s) => s.setCompleted(['t_r'], true));
  await eventually(async () => {
    const ts = (await b.data()).todos;
    const i = ts.findIndex(t => t.id === 't_r');
    const next = ts[i + 1];
    return (i >= 0 && ts[i].completed && !!next && next.series === 't_r' && !next.completed && !!next.repeat) || JSON.stringify(ts.map(t => t.id));
  }, 'B lacks the next occurrence after the finished one');
  const open = (await b.data()).todos.filter(t => t.series === 't_r' && !t.completed);
  expect(open.length === 1, `${open.length} open occurrences on B`);
  const sent = server.writes.slice(before).filter(w => w.device === 'A').flatMap(w => w.written);
  expect(sent.length === 2 && sent.includes('todo:t_r'), `A sent ${JSON.stringify(sent)}`);
  // B unticks it: the unedited next occurrence is taken back on both
  await withStore(b.page, (s) => s.setCompleted(['t_r'], false));
  await eventually(async () => (await a.data()).todos.filter(t => t.series === 't_r' || t.id === 't_r').length === 1, 'A still has the taken-back occurrence');
  await a.close(); await b.close();
});

scenario('deleting reaches the other device', async () => {
  const [a, b] = await pair();
  await withStore(b.page, (s) => s.removeTodo('t_2'));
  await eventually(async () => !(await a.todo('t_2')), 'A still has it');
  expect(server.row('todo', 't_2').deleted === true, 'no deletion row');
  await a.page.reload({ waitUntil: 'networkidle' });
  await sleep(800);
  expect(!(await a.todo('t_2')), 'it came back after a reload');
  await a.close(); await b.close();
});

scenario('removing a project removes it and its to-dos everywhere', async () => {
  const [a, b] = await pair();
  await withStore(a.page, (s) => s.removeProject('p_house'));
  await eventually(async () => { const d = await b.data(); return (!d.lists.projects.length && !d.todos.some(t => t.id === 't_3')) || JSON.stringify(d.lists.projects); }, 'B still has the project or its to-do');
  await a.close(); await b.close();
});

scenario('new areas, projects, headings and tags sync', async () => {
  const [a, b] = await pair();
  await withStore(a.page, (s) => {
    const ar = s.addArea({ title: 'Work' });
    const p = s.addProject({ title: 'Launch', area: ar.id });
    s.addHeading(p.id, 'Week 1');
    s.ensureTag('Urgent');
    s.addTodo({ title: 'Book venue', project: p.id, tags: ['Urgent'] });
  });
  await eventually(async () => {
    const d = await b.data();
    const p = d.lists.projects.find(x => x.title === 'Launch');
    return (!!p && p.headings[0]?.title === 'Week 1' && d.lists.areas.some(x => x.title === 'Work' && x.id === p.area) && d.lists.tags.includes('Urgent') && d.todos.some(t => t.title === 'Book venue' && t.project === p.id)) || JSON.stringify(d.lists);
  }, 'B lacks the new lists');
  await a.close(); await b.close();
});

scenario('edited on both while one was offline: the later edit wins, on both', async () => {
  const [a, b] = await pair();
  // A first, B (offline) later: B's wins
  await b.goOffline();
  await withStore(a.page, (s) => s.updateTodo('t_1', { title: 'From A' }));
  await eventually(() => server.row('todo', 't_1').data.title === 'From A', 'A’s edit never reached the server');
  await sleep(700);
  await withStore(b.page, (s) => s.updateTodo('t_1', { title: 'From B, later' }));
  await sleep(900);
  expect(await b.phase() === 'offline', `B shows ${await b.phase()}`);
  await b.goOnline();
  await eventually(async () => (await a.todo('t_1'))?.title === 'From B, later' && (await b.todo('t_1'))?.title === 'From B, later', 'the later edit (B’s) did not win on both');
  // B (offline) first, A later: A's wins
  await b.goOffline();
  await withStore(b.page, (s) => s.updateTodo('t_2', { title: 'From B, earlier' }));
  await sleep(1200);
  await withStore(a.page, (s) => s.updateTodo('t_2', { title: 'From A, later' }));
  await eventually(() => server.row('todo', 't_2').data.title === 'From A, later', 'A’s edit never reached the server');
  await b.goOnline();
  await eventually(async () => (await a.todo('t_2'))?.title === 'From A, later' && (await b.todo('t_2'))?.title === 'From A, later', 'the later edit (A’s) did not win on both');
  await a.close(); await b.close();
});

scenario('offline changes to different to-dos all survive, including new ones', async () => {
  const [a, b] = await pair();
  await b.goOffline();
  await withStore(b.page, (s) => { s.updateTodo('t_1', { notes: 'two litres' }); s.addTodo({ title: 'Added on B' }); s.removeTodo('t_2'); });
  await withStore(a.page, (s) => { s.updateTodo('t_3', { title: 'Fix the sink' }); s.addTodo({ title: 'Added on A' }); });
  await sleep(800);
  await b.goOnline();
  const want = d => d.todos.find(t => t.id === 't_1')?.notes === 'two litres' && d.todos.find(t => t.id === 't_3')?.title === 'Fix the sink'
    && d.todos.some(t => t.title === 'Added on B') && d.todos.some(t => t.title === 'Added on A') && !d.todos.some(t => t.id === 't_2');
  await eventually(async () => want(await a.data()) && want(await b.data()), 'a change was lost');
  expect(same(await a.ids(), await b.ids()), 'orders differ');
  await a.close(); await b.close();
});

scenario('once in step, the devices stop sending (no echo loop)', async () => {
  const [a, b] = await pair();
  await withStore(a.page, (s) => s.updateTodo('t_1', { title: 'Quiet now' }));
  await eventually(async () => (await b.todo('t_1'))?.title === 'Quiet now', 'B never got the edit');
  await sleep(1000);
  const writes = server.writes.length, calls = server.calls;
  await sleep(2500);
  expect(server.writes.length === writes, `${server.writes.length - writes} more writes while idle`);
  expect(server.calls - calls <= 2, `${server.calls - calls} more calls while idle`);
  await a.close(); await b.close();
});

scenario('two tabs on one device: a change is sent once', async () => {
  const [a, b] = await pair();
  const a2 = await a.open('#/today');
  await eventually(async () => (await a2.evaluate(async () => (await import('/app/js/sync.js')).status.phase)) === 'synced', 'second tab not syncing');
  const before = server.writes.length;
  await withStore(a.page, (s) => s.updateTodo('t_2', { title: 'Call mom back' }));
  await eventually(async () => (await b.todo('t_2'))?.title === 'Call mom back', 'B never got the edit');
  await sleep(1500);
  const sends = server.writes.slice(before).filter(w => w.written.includes('todo:t_2'));
  expect(sends.length === 1, `sent ${sends.length} times`);
  await a2.locator('.todo-list li', { hasText: 'Call mom back' }).waitFor({ timeout: 2000 });
  await a.close(); await b.close();
});

scenario('a reopened app stays signed in and catches up', async () => {
  const [a, b] = await pair();
  await b.page.close();
  await withStore(a.page, (s) => s.updateTodo('t_1', { title: 'Changed while B was closed' }));
  await eventually(() => server.row('todo', 't_1').data.title === 'Changed while B was closed', 'A never sent it');
  const p = await b.open();
  await eventually(async () => (await b.todo('t_1', p))?.title === 'Changed while B was closed', 'B did not catch up on opening');
  await a.close(); await b.close();
});

scenario('signing out keeps this device’s to-dos and stops syncing; signing in again catches up', async () => {
  const [a, b] = await pair();
  await b.openPanel();
  await b.page.locator('[data-acct=signout]').click();
  await b.page.locator('.acct-form').waitFor();
  await b.page.locator('[data-acct=close]').click();
  expect((await b.ids()).length === 3, 'B lost its to-dos');
  await withStore(a.page, (s) => s.updateTodo('t_1', { title: 'After B left' }));
  await sleep(1500);
  expect((await b.todo('t_1'))?.title === 'Buy milk', 'B still syncing after signing out');
  await b.signIn();
  await eventually(async () => (await b.todo('t_1'))?.title === 'After B left', 'B did not catch up after signing in again');
  expect(same(await a.ids(), await b.ids()), 'orders differ');
  expect(server.live('todo').length === 3, `server has ${server.live('todo').length} live to-dos`);
  await a.close(); await b.close();
});

scenario('phone: Sync… is in the list menu and the panel fits the screen', async () => {
  const a = await device('A', { todos: SEED, lists: LISTS, viewport: { width: 390, height: 844 } });
  await a.page.goto(BASE + '#/today');
  await a.page.locator('[data-tool=list-menu]').click();
  await a.page.locator('.menu-item', { hasText: 'Sync…' }).click();
  const box = await a.page.locator('.acct').boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844, `panel box ${JSON.stringify(box)}`);
  await a.close();
});

scenario('positions: moving or inserting keeps the others’ positions and stays in order', async () => {
  const a = await device('A');
  const bad = await a.page.evaluate(async () => {
    const { positions } = await import('/app/js/sync.js');
    const out = [];
    let seed = 7;
    const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    for (let run = 0; run < 400; run++) {
      const n = 1 + rnd(30);
      let known = Array.from({ length: n }, (_, i) => i + 1);
      const moves = rnd(4);
      for (let m = 0; m < moves; m++) { const [x] = known.splice(rnd(known.length), 1); known.splice(rnd(known.length + 1), 0, x); }
      for (let m = rnd(3); m > 0; m--) known.splice(rnd(known.length + 1), 0, undefined);
      const pos = positions(known);
      if (pos.some((p, i) => i && !(p > pos[i - 1]))) out.push(['not increasing', known, pos]);
      const kept = pos.filter((p, i) => p === known[i]).length;
      if (known.filter(v => v != null).length - kept > moves) out.push(['moved more than needed', known, pos]);
    }
    // many inserts at one spot still give increasing positions
    let known = [1, 2];
    for (let i = 0; i < 80; i++) { const pos = positions([known[0], undefined, ...known.slice(1)]); known = pos; }
    if (known.some((p, i) => i && !(p > known[i - 1]))) out.push(['crowded', known.slice(0, 5)]);
    return out.slice(0, 3);
  });
  expect(!bad.length, JSON.stringify(bad));
  await a.close();
});

// ---------- run ----------
await ensureServer();
browser = await chromium.launch();
const results = [];
for (const s of scenarios) {
  if (only && !s.name.includes(only)) continue;
  server = new Server();
  try { await s.fn(); results.push({ name: s.name, ok: true }); }
  catch (e) { results.push({ name: s.name, ok: false, error: String(e.message || e).split('\n')[0].slice(0, 400) }); }
  for (const c of browser.contexts()) await c.close().catch(() => {});
}
await browser.close();
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '\n      ' + r.error}`);
const passing = results.filter(r => r.ok).length;
const green = passing === results.length && results.length > 0;
console.log(`${passing}/${results.length} passing`);
console.log('SYNC ' + (green ? 'GREEN' : 'RED'));
process.exit(green ? 0 : 1);

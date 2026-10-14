// Cloud sync with Supabase (shared). The browser copy in localStorage stays the app's own store: the
// TodoMVC suite reads it, and the app works offline from it. Once signed in, every to-do, area, project and
// tag is also a row of the `items` table, and changes flow both ways:
// - after a change here, the rows that differ from what the server last had are sent;
// - the server announces changes (Realtime), and this device pulls the rows changed since it last looked.
// An item changed on two devices before either synced keeps the later edit (and the server refuses an
// update older than the one it holds). A deletion is a row marked deleted, so it reaches every device.
// Signed out, or with no config, nothing here runs and nothing extra is stored.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { state, refresh, replaceData, subscribe } from './store.js';

const configured = !!(SUPABASE_URL && SUPABASE_KEY);
const AUTH_KEY = 'things-auth';               // the Supabase session (its client writes it)
const metaKey = uid => `things-sync-${uid}`;  // { base, dirty, cursor } for that account on this device
const PAGE = 1000;                            // the most rows the server returns at once
const OVERLAP = 60e3;                         // a pull looks back this far past the last change it saw

/** What the Sync panel shows. */
export const status = {
  configured,
  user: null,        // { id, email } while signed in
  phase: 'off',      // 'off' | 'syncing' | 'synced' | 'offline' | 'error'
  error: '',
  lastSynced: null,  // Date of the last complete sync
};
const watchers = new Set();
export function watch(fn) { watchers.add(fn); return () => watchers.delete(fn); }
function set(patch) { Object.assign(status, patch); for (const fn of watchers) fn(status); }

// ---------- client and session ----------
let client = null, clientP = null;
function getClient() {
  return clientP ||= import('../vendor/supabase.mjs').then(({ createClient }) => {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { storageKey: AUTH_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    // (deferred: the client holds its auth lock while this runs, so no Supabase calls from inside it)
    client.auth.onAuthStateChange((event, session) => setTimeout(() => (session?.user ? begin(session.user) : end())));
    return client;
  });
}

/** At startup: resume syncing when this device is signed in. The Supabase client loads only then. */
export function start() {
  if (!configured) return;
  let signedIn = false;
  try { signedIn = !!localStorage.getItem(AUTH_KEY); } catch {}
  if (signedIn) getClient().catch(() => set({ phase: 'error', error: 'Sync could not load.' }));
}

export async function signIn(email, password) {
  const c = await getClient();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  begin(data.user);
}

/** Signs out this device only. Its to-dos stay here; signing in again carries on from where it was. */
export async function signOut() {
  if (!client) return;
  await client.auth.signOut({ scope: 'local' });
  end();
}

export function syncNow() { schedule(0); }

let off = [];
function begin(user) {
  if (status.user?.id === user.id) return;
  if (status.user) end();
  set({ user: { id: user.id, email: user.email || '' }, phase: 'syncing', error: '' });
  const unsubscribe = subscribe(() => { if (!applying) schedule(); });
  const channel = client.channel(`items-${user.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: `user_id=eq.${user.id}` }, () => schedule(150))
    .subscribe(s => { if (s === 'SUBSCRIBED') schedule(0); });
  const wake = () => { if (!document.hidden) schedule(0); };
  addEventListener('online', wake);
  document.addEventListener('visibilitychange', wake);
  off = [
    unsubscribe,
    () => client.removeChannel(channel),
    () => removeEventListener('online', wake),
    () => document.removeEventListener('visibilitychange', wake),
  ];
  schedule(0);
}

function end() {
  if (!status.user) return;
  for (const f of off) f();
  off = [];
  clearTimeout(timer);
  set({ user: null, phase: 'off', error: '', lastSynced: null });
}

// ---------- running a sync ----------
let timer = 0, running = false, again = false, applying = false;

/** Sync in `ms` (a burst of changes, like typing, goes as one). */
function schedule(ms = 400) {
  if (!status.user) return;
  clearTimeout(timer);
  timer = setTimeout(run, ms);
}

async function run() {
  if (running) { again = true; return; }
  running = true;
  try {
    // one tab at a time: they share this device's copy and its sync record
    await (navigator.locks ? navigator.locks.request('things-sync', cycle) : cycle());
  } finally {
    running = false;
    if (again) { again = false; schedule(0); }
  }
}

async function cycle() {
  const user = status.user;
  if (!user) return;
  const key = metaKey(user.id);
  // 1. note what changed here, and when, even with no network: the time decides a conflict
  const meta = readMeta(key);
  refresh();
  noteDirty(meta, snapshot(meta.base));
  writeMeta(key, meta);
  if (!navigator.onLine) { set({ phase: 'offline' }); return; }
  set({ phase: 'syncing' });
  try {
    // 2. what changed on the server since this device last looked
    const rows = await pull(meta.cursor);
    if (status.user !== user) return;
    // 3. merge it in. No awaits from here to the write, so nothing can change the data in between.
    refresh();
    const local = snapshot(meta.base);
    noteDirty(meta, local);
    if (merge(meta, local, rows)) apply(local);
    for (const r of rows) meta.cursor = Math.max(meta.cursor, Date.parse(r.updated_at) || 0);
    writeMeta(key, meta);
    // 4. send what changed here
    const out = outgoing(meta, local, user.id);
    if (out.length) {
      await push(out);
      if (status.user !== user) return;
      for (const r of out) {
        const k = `${r.kind}:${r.id}`;
        meta.base[k] = { j: r.deleted ? null : canon(r.data), p: r.position, d: r.deleted };
        delete meta.dirty[k];
      }
      writeMeta(key, meta);
    }
    set({ phase: 'synced', error: '', lastSynced: new Date() });
  } catch (e) {
    const msg = e?.message || String(e);
    const offline = !navigator.onLine || /fetch|network|load failed/i.test(msg);
    set({ phase: offline ? 'offline' : 'error', error: offline ? '' : msg });
    schedule(30e3);
  }
}

async function pull(cursor) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let q = client.from('items').select('kind,id,data,position,deleted,modified_at,updated_at');
    if (cursor) q = q.gt('updated_at', new Date(cursor - OVERLAP).toISOString());
    const { data, error } = await q.order('updated_at').order('kind').order('id').range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

async function push(rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await client.from('items').upsert(rows.slice(i, i + 500), { onConflict: 'user_id,kind,id' });
    if (error) throw error;
  }
}

// ---------- the sync record ----------
// base:   "kind:id" -> { j: canonical JSON (null once deleted), p: position, d: deleted }, the server's copy
//         as this device last saw it
// dirty:  "kind:id" -> when this device first changed it since then (ms)
// cursor: the newest server change this device has seen (ms)
function readMeta(key) {
  try {
    const m = JSON.parse(localStorage.getItem(key) || 'null');
    if (m && typeof m === 'object') return { base: m.base || {}, dirty: m.dirty || {}, cursor: +m.cursor || 0 };
  } catch {}
  return { base: {}, dirty: {}, cursor: 0 };
}
function writeMeta(key, meta) { try { localStorage.setItem(key, JSON.stringify(meta)); } catch {} }

/** JSON with keys sorted and undefined left out, so equal items compare equal (the server reorders keys). */
function canon(v) {
  return JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(Object.keys(x).sort().map(n => [n, x[n]]))
    : x));
}

const KINDS = [
  ['todo', () => state.todos, t => t.id],
  ['area', () => state.lists.areas, a => a.id],
  ['project', () => state.lists.projects, p => p.id],
  ['tag', () => state.lists.tags, t => t],
];

/** Everything on this device: "kind:id" -> { kind, id, data, json, pos }. */
function snapshot(base) {
  const out = new Map();
  for (const [kind, list, idOf] of KINDS) {
    const items = list();
    const pos = positions(items.map(x => { const b = base[`${kind}:${idOf(x)}`]; return b && !b.d ? b.p : undefined; }));
    items.forEach((data, i) => {
      const id = String(idOf(data));
      out.set(`${kind}:${id}`, { kind, id, data, json: canon(data), pos: pos[i] });
    });
  }
  return out;
}

/**
 * Positions for a list in its order here, given the position each item had on the server (`known`, or
 * undefined for a new one). The longest run of items still in their server order keeps its positions, and
 * the rest get new ones between their neighbours, so moving or inserting one item changes only that one.
 */
export function positions(known) {
  const n = known.length;
  const tails = [], tailAt = [], prev = new Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const v = known[i];
    if (v == null) continue;
    let lo = 0, hi = tails.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (tails[m] < v) lo = m + 1; else hi = m; }
    tails[lo] = v; tailAt[lo] = i; prev[i] = lo ? tailAt[lo - 1] : -1;
  }
  const pos = new Array(n);
  for (let i = tails.length ? tailAt[tails.length - 1] : -1; i >= 0; i = prev[i]) pos[i] = known[i];
  for (let i = 0; i < n;) {
    if (pos[i] != null) { i++; continue; }
    let j = i;
    while (j < n && pos[j] == null) j++;
    const lo = i > 0 ? pos[i - 1] : null, hi = j < n ? pos[j] : null, k = j - i;
    for (let x = 0; x < k; x++) {
      pos[i + x] = lo == null && hi == null ? x + 1
        : lo == null ? hi - (k - x)
        : hi == null ? lo + x + 1
        : lo + (hi - lo) * (x + 1) / (k + 1);
    }
    i = j;
  }
  // after very many inserts at one spot two positions can no longer be told apart: number them afresh
  for (let x = 1; x < n; x++) if (!(pos[x] - pos[x - 1] > 1e-9)) return known.map((_, i) => i + 1);
  return pos;
}

/** Mark what differs from the server's copy as changed here (keeping the time it first did). */
function noteDirty(meta, local) {
  const now = Date.now();
  for (const [k, it] of local) {
    const b = meta.base[k];
    if (b && !b.d && b.j === it.json && b.p === it.pos) delete meta.dirty[k];
    else meta.dirty[k] ??= now;
  }
  for (const [k, b] of Object.entries(meta.base)) if (!b.d && !local.has(k)) meta.dirty[k] ??= now; // deleted here
  // made and removed again before it was ever sent: nothing to send
  for (const k of Object.keys(meta.dirty)) if (!local.has(k) && !(meta.base[k] && !meta.base[k].d)) delete meta.dirty[k];
}

/** Bring the server's changes into `local`. Returns whether anything here changed. */
function merge(meta, local, rows) {
  let changed = false;
  for (const r of rows) {
    const k = `${r.kind}:${r.id}`;
    const j = r.deleted ? null : canon(r.data);
    const b = meta.base[k];
    if (b && b.j === j && b.p === r.position && !!b.d === r.deleted) continue; // seen already (often this device's own)
    meta.base[k] = { j, p: r.position, d: r.deleted };
    const mine = meta.dirty[k];
    if (mine != null && mine >= Date.parse(r.modified_at)) continue; // changed here later: this device's edit is sent
    delete meta.dirty[k];
    if (r.deleted) { if (local.delete(k)) changed = true; continue; }
    local.set(k, { kind: r.kind, id: r.id, data: r.data, json: j, pos: r.position });
    changed = true;
  }
  return changed;
}

function apply(local) {
  const by = { todo: [], area: [], project: [], tag: [] };
  for (const it of local.values()) by[it.kind]?.push(it);
  // (two devices that each added one at the end while apart give them the same position: the id decides,
  // so every device puts them in the same order, and the next sync gives them positions of their own)
  const ordered = kind => by[kind].sort((a, b) => a.pos - b.pos || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(it => it.data);
  applying = true;
  try {
    replaceData(ordered('todo'), { ...state.lists, areas: ordered('area'), projects: ordered('project'), tags: ordered('tag') });
  } finally {
    applying = false;
  }
}

function outgoing(meta, local, userId) {
  return Object.entries(meta.dirty).map(([k, at]) => {
    const modified_at = new Date(at).toISOString();
    const it = local.get(k);
    // (a copy: the store edits its objects in place, and what is recorded as sent must be what was sent)
    if (it) return { user_id: userId, kind: it.kind, id: it.id, data: JSON.parse(it.json), position: it.pos, deleted: false, modified_at };
    const i = k.indexOf(':');
    return { user_id: userId, kind: k.slice(0, i), id: k.slice(i + 1), data: null, position: meta.base[k]?.p ?? 0, deleted: true, modified_at };
  });
}

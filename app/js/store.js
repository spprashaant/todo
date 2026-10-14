// State, persistence and every mutation (shared).
// localStorage["things-todos"]  JSON array of to-dos (written synchronously on every change)
// localStorage["things-lists"]  JSON object { areas, projects, tags } (never an array)
import { isDate, todayISO, whenIsToday, whenIsFuture, iso, parseISO, addDays, dayDiff } from './dates.js';
import { normRepeat, nextOccurrence, phaseOf } from './recur.js';

const TODOS_KEY = 'things-todos';
const LISTS_KEY = 'things-lists';

export const state = {
  todos: [],
  lists: { areas: [], projects: [], tags: [] },
};

/** Transient UI state. Never persisted. */
export const ui = {
  editingId: null,     // to-do whose card is open
  selected: null,      // selected to-do id (single selection)
  composing: false,    // new to-do card open
  draft: null,         // { notes, when, tags, deadline, checklist } for the composer
  layout: 'desktop',   // 'desktop' | 'phone'
  shownDay: null,      // the day ("YYYY-MM-DD") the screen was last drawn for (view.render); see toggleAll
};

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
let batching = 0, pending = false;
export function emit() {
  if (batching) { pending = true; return; }
  for (const fn of listeners) fn();
}
export function batch(fn) {
  batching++;
  try { fn(); } finally { batching--; if (!batching && pending) { pending = false; emit(); } }
}

export const uid = (p = 't') => `${p}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;

// ---------- normalisation ----------
const str = v => (typeof v === 'string' ? v : v == null ? '' : String(v));

function normTodo(t) {
  const checklist = Array.isArray(t.checklist) ? t.checklist.filter(Boolean).map(c => ({
    id: c.id || uid('c'), title: str(c.title), completed: !!c.completed,
  })) : [];
  let when = t.when ?? null;
  if (!(when === null || when === 'today' || when === 'evening' || when === 'someday' || isDate(when))) when = null;
  return {
    ...t,
    id: t.id != null ? String(t.id) : uid(),
    title: str(t.title),
    completed: !!t.completed,
    completedAt: t.completedAt ?? null,
    notes: str(t.notes),
    checklist,
    when,
    deadline: isDate(t.deadline) ? t.deadline : null,
    tags: Array.isArray(t.tags) ? t.tags.map(str).filter(Boolean) : [],
    project: t.project ?? null,
    area: t.area ?? null,
    heading: t.heading ?? null,
    createdAt: t.createdAt ?? null,
    ...normRepeatFields(t),
  };
}

/** The repeat engine's fields (CONTRACT "Repeating to-dos"); invalid engine bookkeeping is dropped. */
function normRepeatFields(t) {
  const out = {
    repeat: normRepeat(t.repeat),
    series: t.series != null && t.series !== '' ? String(t.series) : null,
    nextId: t.nextId != null && t.nextId !== '' ? String(t.nextId) : null,
    occurrence: Number.isInteger(t.occurrence) && t.occurrence >= 1 ? t.occurrence : undefined,
    anchorDay: Number.isInteger(t.anchorDay) && t.anchorDay >= 29 && t.anchorDay <= 31 ? t.anchorDay : undefined,
    spawnKey: typeof t.spawnKey === 'string' ? t.spawnKey : undefined,
  };
  return out;
}

function normLists(o) {
  const l = (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
  return {
    ...l,
    areas: Array.isArray(l.areas) ? l.areas.filter(Boolean).map(a => ({ ...a, id: String(a.id), title: str(a.title) })) : [],
    projects: Array.isArray(l.projects) ? l.projects.filter(Boolean).map(p => ({
      ...p, id: String(p.id), title: str(p.title), area: p.area ?? null, notes: str(p.notes),
      headings: Array.isArray(p.headings) ? p.headings.filter(Boolean).map(h => ({ ...h, id: String(h.id), title: str(h.title) })) : [],
    })) : [],
    tags: Array.isArray(l.tags) ? l.tags.map(str).filter(Boolean) : [],
  };
}

// ---------- persistence ----------
// The stored text this tab last read or wrote. Anything else in storage was written by another tab since.
let seenTodos = null, seenLists = null;
const readRaw = key => { try { return localStorage.getItem(key); } catch { return null; } };

export function load() {
  let todos = [];
  const raw = readRaw(TODOS_KEY), rawLists = readRaw(LISTS_KEY);
  try {
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) todos = arr.filter(t => t && typeof t === 'object').map(normTodo);
  } catch { todos = []; }
  let lists;
  try { lists = normLists(JSON.parse(rawLists || 'null')); } catch { lists = normLists(null); }
  state.todos = todos;
  state.lists = lists;
  seenTodos = raw;
  seenLists = rawLists;
  // another tab deleted the to-do this one has open or selected: nothing is left to show or act on
  if (ui.editingId && !getTodo(ui.editingId)) ui.editingId = null;
  if (ui.selected && !getTodo(ui.selected)) ui.selected = null;
}

function saveTodos() { const s = JSON.stringify(state.todos); localStorage.setItem(TODOS_KEY, s); seenTodos = s; }
function saveLists() { const s = JSON.stringify(state.lists); localStorage.setItem(LISTS_KEY, s); seenLists = s; }

/**
 * Every change starts from what is stored: when another tab has written since this one last read (its
 * storage event may not have arrived yet), reload first. A stale tab then never writes its old copy over
 * the other tab's work, and never completes or reopens a to-do from an outdated state.
 */
function fresh() {
  if (readRaw(TODOS_KEY) === seenTodos && readRaw(LISTS_KEY) === seenLists) return;
  load();
  emit();
}
/** Catch up with another tab's writes now (before deciding what to write back), not when its event arrives. */
export const refresh = fresh;

/** Replace every to-do and list with `todos` and `lists` (cloud sync bringing in another device's changes). */
export function replaceData(todos, lists) {
  state.todos = todos.filter(t => t && typeof t === 'object').map(normTodo);
  state.lists = normLists(lists);
  if (ui.editingId && !getTodo(ui.editingId)) ui.editingId = null;
  if (ui.selected && !getTodo(ui.selected)) ui.selected = null;
  saveTodos();
  saveLists();
  emit();
}

// another tab changed the data
window.addEventListener('storage', e => {
  if (e.key === TODOS_KEY || e.key === LISTS_KEY || e.key === null) { load(); emit(); }
});

// ---------- lookups ----------
export const getTodo = id => state.todos.find(t => t.id === id) || null;
export const getProject = id => state.lists.projects.find(p => p.id === id) || null;
export const getArea = id => state.lists.areas.find(a => a.id === id) || null;

/** Project or area name shown under a row's title. */
export function contextTitle(t) {
  if (t.project) { const p = getProject(t.project); if (p) return p.title; }
  if (t.area) { const a = getArea(t.area); if (a) return a.title; }
  return '';
}

export function projectProgress(id) {
  const items = state.todos.filter(t => t.project === id);
  if (!items.length) return 0;
  return items.filter(t => t.completed).length / items.length;
}

// ---------- membership ----------
export const inInbox = t => !t.when && !t.project && !t.area;
export const inToday = t => whenIsToday(t.when) || (!!t.deadline && t.deadline <= todayISO() && t.when !== 'someday');
export const inUpcoming = t => whenIsFuture(t.when);
export const inSomeday = t => t.when === 'someday';
/** Anytime: everything that is available now and has been filed (not Inbox, not Someday, not later). */
export const inAnytime = t => !inInbox(t) && t.when !== 'someday' && !whenIsFuture(t.when);

export function passesFilter(t, filter) {
  if (filter === 'active') return !t.completed;
  if (filter === 'completed') return t.completed;
  return true;
}

export function counts() {
  const active = state.todos.filter(t => !t.completed);
  const today = active.filter(inToday);
  return {
    inbox: active.filter(inInbox).length,
    today: today.length,
    due: today.filter(t => t.deadline && t.deadline <= todayISO()).length,
  };
}

// ---------- to-do mutations ----------
export function addTodo(fields) {
  fresh();
  const t = normTodo({
    id: uid(), title: '', completed: false, completedAt: null, notes: '', checklist: [],
    when: null, deadline: null, tags: [], project: null, area: null, heading: null,
    createdAt: new Date().toISOString(),
    ...fields,
  });
  state.todos.push(t);
  saveTodos();
  emit();
  return t;
}

export function updateTodo(id, patch) {
  fresh();
  const t = getTodo(id);
  if (!t) return;
  applyPatch(t, patch);
  saveTodos();
  emit();
}

export function toggleTodo(id, completed) {
  // it flips the way the person saw it, even when another tab's write reaches this one first (fresh)
  const seen = getTodo(id);
  if (completed == null && seen) completed = !seen.completed;
  fresh();
  const t = getTodo(id);
  if (!t) return;
  // the second click of a double-click that lands on another to-do than the first one did: see clicks
  if (clicks > 1 && id !== lastToggled) { emit(); return; }
  lastToggled = id;
  updateTodo(id, { completed: completed ?? !t.completed });
}

// A double-click (or double-tap) on a box acts on that one to-do. Where finished to-dos are hidden (the
// Active filter) a repeating to-do's next occurrence takes its place under the pointer, so the second
// click of the pair lands on that one, and would complete a day nobody has done and make yet another
// (and in the Completed filter the next finished one moves up and would be reopened too). The browser
// counts the clicks of a pair (`detail`), and a pair is at one spot, so a second click that reaches a
// different to-do than the first did only moved with the list: it changes nothing (the box is redrawn).
// Clicks the browser counts as separate each count, however quick.
let clicks = 0, lastToggled = null;
window.addEventListener('click', e => { clicks = e.detail || 0; setTimeout(() => { clicks = 0; }); }, true);

/**
 * A row's delete button. Like a box, a double-click on it acts on that one to-do: the next occurrence of a
 * repeating to-do sits right after the finished one, so it moves up under the pointer, and the second
 * click of the pair would delete it too (ending the series). A second click that reaches a different
 * to-do than the first did changes nothing (see clicks).
 */
export function destroyTodo(id) {
  if (clicks > 1 && id !== lastToggled) return;
  lastToggled = id;
  removeTodo(id);
}

export function removeTodo(id) {
  fresh();
  const i = state.todos.findIndex(t => t.id === id);
  if (i < 0) return;
  state.todos.splice(i, 1);
  if (ui.editingId === id) ui.editingId = null;
  if (ui.selected === id) ui.selected = null;
  saveTodos();
  emit();
}

/**
 * Complete or reopen several at once. `day` is the day "still to come" is judged on when completing (today
 * by default; Complete All passes the day that was on screen, see toggleAll).
 */
export function setCompleted(ids, completed, day = todayISO()) {
  fresh();
  const set = new Set(ids);
  const now = new Date().toISOString();
  // a snapshot: completing inserts next occurrences, and reopening can take one back
  const items = state.todos.filter(t => set.has(t.id));
  // completing several at once leaves alone a next occurrence one of them already created while its date is
  // still to come on `day` (it counts with that one, see allCompleted), so Complete All never completes an
  // occurrence the person hasn't done yet, nor one the screen still shows as a coming day's
  const ahead = completed ? spawnedAhead(items, day) : new Set();
  // reopening several at once never takes back one that is itself being reopened (whatever the order)
  const reopening = new Set(items.filter(t => t.completed).map(t => t.id));
  for (const t of items) {
    if (getTodo(t.id) !== t || ahead.has(t.id)) continue;
    if (completed) complete(t, now); else reopen(t, reopening);
  }
  saveTodos();
  emit();
}

/**
 * The open occurrences in `items` that completing another of them created (its nextId) and whose day is
 * still to come (after `day`, today by default). Once its day comes, a next occurrence is a to-do to do
 * like any other.
 */
function spawnedAhead(items, day = todayISO()) {
  const spawned = new Set(items.filter(t => t.completed && t.nextId).map(t => t.nextId));
  return new Set(items.filter(t => !t.completed && spawned.has(t.id) && isDate(t.when) && t.when > day).map(t => t.id));
}

/**
 * Complete All's checked state: every to-do in `items` is completed. An open occurrence that completing
 * one of them created counts with that one while its day is still to come, so after Complete All in a
 * list the next occurrences stay in (a project, Upcoming) it still reads checked: un-checking takes them
 * back, and a second click can't complete them too. When its day comes it is open work again, so
 * Complete All completes it instead of reopening the one before it. `day` is the day it is judged on
 * (today by default; toggleAll passes the day that was on screen).
 */
export function allCompleted(items, day = todayISO()) {
  const ahead = spawnedAhead(items, day);
  return items.length > 0 && items.every(t => t.completed || ahead.has(t.id));
}

// The day on screen. A page left open past midnight shows yesterday's list until it is drawn again (the
// view redraws when the day changes, but a click can come first), and something can redraw during a press
// (a card closing as focus leaves it). So a press remembers the day that was on screen when it began, and
// Complete All flips the state drawn for that day: a box that read checked un-checks, whatever the clock
// says now, instead of completing a new day's occurrence nobody did.
let press = null;
const pressStart = () => { press = { day: ui.shownDay, at: performance.now() }; };
window.addEventListener('pointerdown', pressStart, true);
window.addEventListener('keydown', pressStart, true);
/** The day the person was looking at: the one on screen when the current press began, or the one drawn last. */
function seenDay() {
  if (press?.day && performance.now() - press.at < 10000) return press.day;
  return ui.shownDay || todayISO();
}

/**
 * Complete All, whichever control it comes from (the toolbar box and the phone list menu that clicks it,
 * a project's or a heading's own menu): it flips the state the person saw for `items` (allCompleted on the
 * day that was on screen), so a second click reopens them and takes the next occurrences back, and never
 * completes those too. Both the direction and what completing leaves alone are judged on that one day: on
 * a page still showing yesterday, a next occurrence dated today is still "tomorrow's" on screen, so
 * completing all leaves it alone (it counts with the one before it) instead of logging a day nobody did.
 * Returns the new state.
 */
export function toggleAll(items) {
  const day = seenDay();
  const completed = !allCompleted(items, day);
  setCompleted(items.map(t => t.id), completed, day);
  return completed;
}

export function removeTodos(ids) {
  fresh();
  const set = new Set(ids);
  state.todos = state.todos.filter(t => !set.has(t.id));
  if (set.has(ui.editingId)) ui.editingId = null;
  if (set.has(ui.selected)) ui.selected = null;
  saveTodos();
  emit();
}

/** Clear completed: removes those of `ids` that are still completed (another tab may have reopened one since). */
export function clearCompleted(ids) {
  fresh();
  const set = new Set(ids);
  removeTodos(state.todos.filter(t => set.has(t.id) && t.completed).map(t => t.id));
}

/** Move `id` so it sits just before `beforeId` (or at the end) in the global order. */
export function moveTodo(id, beforeId, patch) {
  fresh();
  const i = state.todos.findIndex(t => t.id === id);
  if (i < 0) return;
  const [t] = state.todos.splice(i, 1);
  const j = beforeId ? state.todos.findIndex(x => x.id === beforeId) : -1;
  if (j < 0) state.todos.push(t); else state.todos.splice(j, 0, t);
  if (patch) applyPatch(t, patch);
  saveTodos();
  emit();
}

// ---------- repeating to-dos (CONTRACT "Repeating to-dos") ----------
// Only completion creates occurrences: complete() adds the next one right after the finished one,
// reopen() takes it back while it is still open and unedited. Loading, time passing and rendering
// never create anything. A series never has two open occurrences that repeat.

/** Apply an edit to a to-do, routing `completed` and `repeat` through the engine. */
function applyPatch(t, patch) {
  const { completed, ...rest } = patch || {};
  if ('repeat' in rest) { setRepeat(t, normRepeat(rest.repeat)); delete rest.repeat; }
  if ('when' in rest && rest.when !== t.when) delete t.anchorDay;
  Object.assign(t, rest);
  if (patch && 'completed' in patch) {
    if (completed) complete(t, new Date().toISOString()); else reopen(t);
  }
}

/**
 * Turning repeat on starts a new series: the count starts again at 1, and a to-do that already belonged
 * to a series gets a fresh one, so the old series' occurrences never count towards the new rule's end
 * and there is never a second open repeating to-do in one series.
 * Changing the rule itself (anything but its end or a picker's hints) drops `anchorDay`: the day the old
 * rule aimed for (Feb 28 standing for the 31st of a monthly series) means nothing to the new one, which
 * takes its day from the date, as the picker and the row say (Yearly on Feb 28 stays on Feb 28).
 */
function setRepeat(t, rule) {
  const was = t.repeat ? normRepeat(t.repeat) : null;
  t.repeat = rule;
  if (!rule) return;
  if (was) { if (phaseOf(was) !== phaseOf(rule)) delete t.anchorDay; return; }
  delete t.occurrence;
  delete t.anchorDay;
  if (t.series) t.series = uid('s');
}

/** Another open, repeating occurrence of `series` (other than `exceptId`). */
const openRepeating = (series, exceptId) =>
  !!series && state.todos.some(x => x.series === series && x.id !== exceptId && !x.completed && x.repeat);

const ENGINE_FIELDS = new Set(['id', 'completed', 'completedAt', 'createdAt', 'series', 'nextId', 'occurrence', 'anchorDay', 'spawnKey']);
/** Fingerprint of everything a person can edit on a to-do. Empty values count as missing. */
function contentKey(t) {
  const parts = [];
  for (const k of Object.keys(t).sort()) {
    if (ENGINE_FIELDS.has(k)) continue;
    let v = t[k];
    if (k === 'checklist' && Array.isArray(v)) v = v.map(c => [str(c?.title), !!c?.completed]);
    if (v == null || v === '' || v === false || (Array.isArray(v) && !v.length)) continue;
    parts.push([k, v]);
  }
  const s = JSON.stringify(parts);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36) + s.length.toString(36);
}

/** Mark `t` done; when it repeats, create its next occurrence (exactly one) right after it. */
function complete(t, now) {
  if (t.completed) return;
  t.completed = true;
  t.completedAt = t.completedAt || now;
  t.nextId = null;
  const rule = normRepeat(t.repeat);
  if (!rule) return;
  t.series = t.series || t.id;
  if (openRepeating(t.series, t.id)) return;
  const today = todayISO();
  const occurrence = t.occurrence || 1;
  const following = nextOccurrence(rule, t.when, today, occurrence, t.anchorDay);
  if (!following) return; // the series has ended
  const { when } = following;
  const n = JSON.parse(JSON.stringify(t));
  delete n.anchorDay;
  delete n.spawnKey;
  Object.assign(n, {
    id: uid(), completed: false, completedAt: null, createdAt: now,
    when, deadline: nextDeadline(t, when, today),
    checklist: t.checklist.map(c => ({ id: uid('c'), title: c.title, completed: false })),
    series: t.series, nextId: null, occurrence: occurrence + 1,
  });
  if (following.anchorDay) n.anchorDay = following.anchorDay;
  const next = normTodo(n);
  next.spawnKey = contentKey(next);
  state.todos.splice(state.todos.indexOf(t) + 1, 0, next);
  t.nextId = next.id;
}

/**
 * The next occurrence's deadline keeps the finished one's lead over its date (or over today when it has
 * no date). It is never on or before today: a new occurrence never starts out overdue.
 */
function nextDeadline(t, when, today) {
  if (!isDate(t.deadline)) return null;
  let lead = dayDiff(parseISO(isDate(t.when) ? t.when : today), parseISO(t.deadline));
  if (!isDate(t.when)) lead = Math.max(0, lead);
  const d = iso(addDays(parseISO(when), lead));
  return d > today ? d : when;
}

/**
 * Reopen `t`, taking back the occurrence its completion created while that one is open and unedited (and
 * isn't itself being reopened in the same go: `keep`). `t` carries its rule again only when that puts it
 * back at the head of its series: its next occurrence was taken back, or its completion created none and
 * no other open occurrence repeats. Otherwise the series has moved on without it (its next occurrence was
 * completed, edited, stopped repeating or deleted), so it comes back as a one-off, and ticking it again
 * creates nothing: a series never forks, never duplicates an occurrence and never runs past its end.
 */
function reopen(t, keep = null) {
  if (!t.completed) return;
  t.completed = false;
  t.completedAt = null;
  const nextId = t.nextId;
  t.nextId = null;
  const next = nextId ? getTodo(nextId) : null;
  const takeBack = !!next && next !== t && !next.completed && !keep?.has(next.id) && !!next.spawnKey && next.spawnKey === contentKey(next);
  if (takeBack) drop(next.id);
  if (t.repeat && ((nextId && !takeBack) || openRepeating(t.series, t.id))) t.repeat = null; // comes back as a one-off
}

function drop(id) {
  const i = state.todos.findIndex(t => t.id === id);
  if (i < 0) return;
  state.todos.splice(i, 1);
  if (ui.editingId === id) ui.editingId = null;
  if (ui.selected === id) ui.selected = null;
}

// checklist
export function addChecklistItem(todoId, title = '', afterId = null) {
  fresh();
  const t = getTodo(todoId);
  if (!t) return null;
  const item = { id: uid('c'), title, completed: false };
  const i = afterId ? t.checklist.findIndex(c => c.id === afterId) : -1;
  if (i < 0) t.checklist.push(item); else t.checklist.splice(i + 1, 0, item);
  saveTodos();
  emit();
  return item;
}
export function updateChecklistItem(todoId, itemId, patch) {
  fresh();
  const t = getTodo(todoId);
  const c = t?.checklist.find(x => x.id === itemId);
  if (!c) return;
  Object.assign(c, patch);
  saveTodos();
  emit();
}
export function removeChecklistItem(todoId, itemId) {
  fresh();
  const t = getTodo(todoId);
  if (!t) return;
  t.checklist = t.checklist.filter(c => c.id !== itemId);
  saveTodos();
  emit();
}

// ---------- lists ----------
export function addProject(fields = {}) {
  fresh();
  const p = { id: uid('p'), title: '', area: null, notes: '', headings: [], ...fields };
  state.lists.projects.push(p);
  saveLists();
  emit();
  return p;
}
export function updateProject(id, patch) {
  fresh();
  const p = getProject(id);
  if (!p) return;
  Object.assign(p, patch);
  saveLists();
  emit();
}
export function removeProject(id) {
  fresh();
  state.lists.projects = state.lists.projects.filter(p => p.id !== id);
  state.todos = state.todos.filter(t => t.project !== id);
  saveLists();
  saveTodos();
  emit();
}
export function addArea(fields = {}) {
  fresh();
  const a = { id: uid('a'), title: '', ...fields };
  state.lists.areas.push(a);
  saveLists();
  emit();
  return a;
}
export function updateArea(id, patch) {
  fresh();
  const a = getArea(id);
  if (!a) return;
  Object.assign(a, patch);
  saveLists();
  emit();
}
export function addHeading(projectId, title = 'New Heading') {
  fresh();
  const p = getProject(projectId);
  if (!p) return null;
  const h = { id: uid('h'), title };
  p.headings.push(h);
  saveLists();
  emit();
  return h;
}
export function updateHeading(projectId, headingId, patch) {
  fresh();
  const h = getProject(projectId)?.headings.find(x => x.id === headingId);
  if (!h) return;
  Object.assign(h, patch);
  saveLists();
  emit();
}
export function removeHeading(projectId, headingId) {
  fresh();
  const p = getProject(projectId);
  if (!p) return;
  p.headings = p.headings.filter(h => h.id !== headingId);
  for (const t of state.todos) {
    if (t.project !== projectId || t.heading !== headingId) continue;
    // not a person's edit: a next occurrence that was unedited stays unedited (unticking can still take it back)
    const unedited = !!t.spawnKey && t.spawnKey === contentKey(t);
    t.heading = null;
    if (unedited) t.spawnKey = contentKey(t);
  }
  saveLists();
  saveTodos();
  emit();
}
export function ensureTag(tag) {
  fresh();
  if (!tag || state.lists.tags.includes(tag)) return;
  state.lists.tags.push(tag);
  saveLists();
}

// ---------- ui ----------
export function setUI(patch) {
  Object.assign(ui, patch);
  emit();
}

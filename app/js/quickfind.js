// Quick Find (piece: quickfind). Search lists and to-dos; arrow keys + Enter to jump.
import { icon, viewIcon, pie } from './icons.js';
import { state, counts, projectProgress, getProject, getArea, contextTitle, inInbox, inToday, inUpcoming, inSomeday, setUI } from './store.js';
import { go, baseHref, listHref } from './router.js';

/** Things' Quick Find magnifier: a large thin ring with a short handle (the shared search icon is smaller and heavier). */
const glass = cls => `<svg class="qf-glass ${cls || ''}" viewBox="0 0 16 16" aria-hidden="true" focusable="false">` +
  `<circle cx="6.9" cy="6.9" r="5.9" fill="none" stroke="currentColor" stroke-width="1.3"/>` +
  `<path d="M11.15 11.15l3.15 3.15" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"/></svg>`;
/** Checkmark for the current list: a short leg and a tall, steep long leg. */
const CHECK = `<svg viewBox="0 0 12.5 11.3" aria-hidden="true" focusable="false"><path d="M.95 5.85l4.2 4.45 6.4-9.35" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let cur = null;

export function isOpen() { return !!cur; }
export function close() { if (cur) { const c = cur; cur = null; c.cleanup(); } }

const BUILTIN = [
  { view: 'inbox', title: 'Inbox' }, { view: 'today', title: 'Today' }, { view: 'upcoming', title: 'Upcoming' },
  { view: 'anytime', title: 'Anytime' }, { view: 'someday', title: 'Someday' }, { view: 'logbook', title: 'Logbook' },
];

function matches(text, q) {
  const t = String(text || '').toLowerCase();
  if (!t) return 0;
  if (t.startsWith(q)) return 4;
  if (t.split(/[\s\-–—/]+/).some(w => w.startsWith(q))) return 3;
  if (t.includes(q)) return 2;
  return fuzzyEnd(t, q) >= 0 ? 1 : 0;
}

/** Fuzzy match: every typed letter in order ("to" finds "Throw Party for Eve"). Returns where the match ends, or -1. */
function fuzzyEnd(t, q) {
  let i = 0;
  for (let k = 0; k < t.length; k++) if (t[k] === q[i] && ++i === q.length) return k;
  return -1;
}

/** Results for a query: { lists: [...], todos: [...] } */
export function search(query, route) {
  const q = query.trim().toLowerCase();
  if (!q) return { lists: [], todos: [], more: 0 };
  const c = counts();
  const lists = [];
  for (const b of BUILTIN) {
    const s = matches(b.title, q);
    if (s) lists.push({ kind: b.view, title: b.title, href: listHref(b.view), score: s + 0.5, badge: b.view === 'today' ? c.due : 0, count: b.view === 'today' ? c.today : b.view === 'inbox' ? c.inbox : 0, current: route.view === b.view });
  }
  for (const a of state.lists.areas) {
    const s = matches(a.title, q);
    if (s) lists.push({ kind: 'area', id: a.id, title: a.title, href: listHref('area', a.id), score: s, current: route.view === 'area' && route.id === a.id });
  }
  for (const p of state.lists.projects) {
    const s = matches(p.title, q);
    if (s) lists.push({ kind: 'project', id: p.id, title: p.title, href: listHref('project', p.id), score: s, current: route.view === 'project' && route.id === p.id });
  }
  for (const tag of state.lists.tags) {
    const s = matches(tag, q);
    if (s) lists.push({ kind: 'tag', title: tag, score: s - 0.5 });
  }
  // best tier first; within a tier, the tighter (earlier-ending) match first, then list order
  lists.forEach((l, i) => { l.order = i; l.end = fuzzyEnd(l.title.toLowerCase(), q); });
  lists.sort((a, b) => (Math.floor(b.score) - Math.floor(a.score)) || (a.end - b.end) || (a.order - b.order));
  const scored = state.todos.map(t => {
    const s = matches(t.title, q);
    return { t, s: s >= 2 ? s : (t.notes && t.notes.toLowerCase().includes(q) ? 0.5 : 0) || (t.tags.some(x => x.toLowerCase().startsWith(q)) ? 0.4 : 0) };
  });
  const all = scored.filter(x => x.s).sort((a, b) => (a.t.completed - b.t.completed) || ((b.s >= 2) - (a.s >= 2)));
  return { lists: lists.slice(0, 7), todos: all.slice(0, 3).map(x => x.t), more: Math.max(0, all.length - 3), allTodos: all.map(x => x.t) };
}

function homeOf(t) {
  if (t.project && getProject(t.project)) return baseHref('project', t.project);
  if (t.area && getArea(t.area)) return baseHref('area', t.area);
  if (inInbox(t)) return '#/';
  if (t.completed) return '#/logbook';
  if (inToday(t)) return '#/today';
  if (inUpcoming(t)) return '#/upcoming';
  if (inSomeday(t)) return '#/someday';
  return '#/anytime';
}

function listIcon(r) {
  if (r.kind === 'project') return pie(projectProgress(r.id), { size: 14, stroke: 1.05, gap: 1.1 });
  if (r.kind === 'area') return icon('area');
  if (r.kind === 'tag') return icon('tag');
  return viewIcon(r.kind);
}

/** open({ query, route, onTag(tag) }) */
export function open({ query = '', route, returnFocus } = {}) {
  close();
  const phone = matchMedia('(max-width: 699px)').matches;
  const layer = document.getElementById('layer');
  const scrim = document.createElement('div');
  scrim.className = 'scrim qf-scrim' + (phone ? ' dark' : '');
  const pop = document.createElement('div');
  pop.className = 'qf-pop' + (phone ? ' sheet' : '');
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Quick Find');
  pop.innerHTML =
    `<div class="qf-frame"><div class="qf-panel" data-shot="quickfind">` +
      `<div class="qf-top">` +
        `<div class="qf-field"><span class="qf-icon">${glass()}</span>` +
        `<span class="qf-edit"><input class="qf-input" type="text" role="searchbox" inputmode="search" placeholder="Quick Find" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Quick Find" aria-autocomplete="list" enterkeyhint="go">` +
        `<span class="qf-mirror" aria-hidden="true"></span><i class="qf-caret" aria-hidden="true" hidden></i></span>` +
        `<button class="qf-clear" type="button" aria-label="Clear" hidden>${icon('close')}</button></div>` +
        (phone ? `<button class="qf-cancel" type="button">Cancel</button>` : '') +
      `</div>` +
      `<div class="qf-body" role="listbox" aria-label="Results"></div>` +
    `</div></div>`;
  layer.append(scrim, pop);
  const input = pop.querySelector('.qf-input');
  const body = pop.querySelector('.qf-body');
  const clearBtn = pop.querySelector('.qf-clear');
  const caret = pop.querySelector('.qf-caret');
  const mirror = pop.querySelector('.qf-mirror');
  let blinkTimer = 0;

  // Things draws a thick blue insertion bar; a native caret cannot be styled that way, so draw our own
  // and keep the native one transparent. It hides whenever there is a real selection range.
  // The bar is positioned with `left`, not a transform: laid-out boxes are snapped to whole device
  // pixels when painted, so it stays a crisp bar at any zoom instead of a blur across 3-4 pixel columns.
  const barLeft = parseFloat(getComputedStyle(caret).left) || 0;
  function placeCaret() {
    const s0 = input.selectionStart, s1 = input.selectionEnd;
    if (!cur || document.activeElement !== input || s0 == null || s0 !== s1) { caret.hidden = true; return; }
    mirror.textContent = input.value.slice(0, s0);
    const x = Math.max(0, Math.min(input.clientWidth, mirror.getBoundingClientRect().width - input.scrollLeft));
    caret.style.left = `${(barLeft + x).toFixed(3)}px`;
    caret.hidden = false;
    caret.classList.remove('blink');
    clearTimeout(blinkTimer);
    blinkTimer = setTimeout(() => caret.classList.add('blink'), 530);
  }
  const queueCaret = () => requestAnimationFrame(placeCaret);
  const onSelectionChange = () => { if (document.activeElement === input) queueCaret(); };
  let active = 0;
  let expanded = false;
  let results = [];

  function render() {
    const q = input.value;
    clearBtn.hidden = !q;
    if (!q.trim()) {
      results = [];
      input.removeAttribute('aria-activedescendant');
      body.innerHTML = `<div class="qf-hint">Quickly switch lists, find to-dos, search for tags…</div>`;
      return;
    }
    const r = search(q, route);
    const todos = expanded ? r.allTodos.slice(0, 40) : r.todos;
    results = [
      ...r.lists.map(l => ({ type: 'list', ...l })),
      ...todos.map(t => ({ type: 'todo', t })),
      ...(!expanded ? [{ type: 'more' }] : []),
    ];
    if (!results.length) { body.innerHTML = `<div class="qf-hint">No Results</div>`; return; }
    if (active >= results.length) active = results.length - 1;
    let h = '';
    let sep = false;
    results.forEach((x, i) => {
      if (x.type !== 'list' && !sep && r.lists.length) { h += `<div class="qf-sep"></div>`; sep = true; }
      const cls = `qf-row${i === active ? ' active' : ''}`;
      const aria = `role="option" aria-selected="${i === active}" id="qf-opt-${i}"`;
      if (x.type === 'list') {
        h += `<button class="${cls} qf-list qf-${x.kind}" type="button" tabindex="-1" ${aria} data-i="${i}"><span class="qf-ic">${listIcon(x)}</span><span class="qf-title">${esc(x.title)}</span>` +
          (x.badge ? `<span class="qf-badge">${x.badge}</span>` : '') + (x.count ? `<span class="qf-count">${x.count}</span>` : '') +
          (x.current ? `<span class="qf-check" aria-label="current list">${CHECK}</span>` : '') + `</button>`;
      } else if (x.type === 'todo') {
        const sub = contextTitle(x.t);
        h += `<button class="${cls} qf-todo${x.t.completed ? ' done' : ''}" type="button" tabindex="-1" ${aria} data-i="${i}" title="${esc(sub)}"><span class="qf-ic"><span class="qf-box"></span></span><span class="qf-title">${esc(x.t.title)}</span>` +
          (expanded && sub ? `<span class="qf-sub">${esc(sub)}</span>` : '') + `</button>`;
      } else {
        h += `<button class="${cls} qf-more" type="button" tabindex="-1" ${aria} data-i="${i}"><span class="qf-ic">${glass()}</span><span class="qf-title">Continue Search</span></button>`;
      }
    });
    body.innerHTML = h;
    input.setAttribute('aria-activedescendant', `qf-opt-${active}`);
  }

  function choose(i) {
    const x = results[i];
    if (!x) return;
    if (x.type === 'more') { expanded = true; render(); input.focus(); return; }
    close();
    if (x.type === 'list') {
      if (x.kind === 'tag') return;
      go(x.href);
    } else {
      go(homeOf(x.t));
      setUI({ selected: x.t.id, editingId: null });
      requestAnimationFrame(() => document.querySelector(`.todo-list > li[data-id="${CSS.escape(x.t.id)}"]`)?.scrollIntoView({ block: 'nearest' }));
    }
  }

  input.addEventListener('input', () => { active = 0; expanded = false; render(); placeCaret(); });
  for (const ev of ['focus', 'blur', 'select', 'scroll', 'keyup', 'pointerup']) input.addEventListener(ev, queueCaret);
  document.addEventListener('selectionchange', onSelectionChange);
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!results.length) return;
      active = e.key === 'ArrowDown' ? Math.min(results.length - 1, active + 1) : Math.max(0, active - 1);
      render();
      body.querySelector('.qf-row.active')?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else queueCaret();
  });
  body.addEventListener('mousedown', e => e.preventDefault());
  body.addEventListener('click', e => { const b = e.target.closest('.qf-row'); if (b) choose(Number(b.dataset.i)); });
  body.addEventListener('mousemove', e => {
    const b = e.target.closest('.qf-row');
    if (b && Number(b.dataset.i) !== active) {
      active = Number(b.dataset.i);
      body.querySelectorAll('.qf-row').forEach(r => { r.classList.toggle('active', r === b); r.setAttribute('aria-selected', String(r === b)); });
      input.setAttribute('aria-activedescendant', `qf-opt-${active}`);
    }
  });
  clearBtn.addEventListener('mousedown', e => e.preventDefault());
  clearBtn.addEventListener('click', () => { input.value = ''; render(); input.focus(); });
  pop.querySelector('.qf-cancel')?.addEventListener('click', () => close());
  scrim.addEventListener('pointerdown', e => { e.preventDefault(); close(); });

  input.value = query;
  render();
  cur = {
    cleanup() {
      clearTimeout(blinkTimer);
      document.removeEventListener('selectionchange', onSelectionChange);
      scrim.remove();
      pop.remove();
      if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
    },
  };
  input.focus({ preventScroll: true });
  const n = input.value.length;
  input.setSelectionRange(n, n);
  placeCaret();
  return pop;
}

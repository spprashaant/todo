// To-do rows and list groups (piece: today / rows).
// Renders groups of rows into the `.main` section with keyed reconciliation, so an <li>
// keeps its identity (and focus) across renders. Each <li> follows the TodoMVC contract:
//   input.toggle, label (title only), button.destroy, input.edit (inside the card, visible only while editing)
import { icon, pie } from './icons.js';
import { contextTitle, inToday, getProject, getArea, projectProgress } from './store.js';
import { isDate, whenIsFuture, fmtShort, fmtDeadline, parseISO, DAYS, daysFromToday } from './dates.js';
import * as detail from './detail.js';
import * as project from './project.js';
import { listHref } from './router.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Row glyphs, drawn on Things' 1pt grid (1 viewBox unit = 1pt on desktop) so strokes land on whole pixels.
const glyph = (vb, body, cls = '') => `<svg class="ico${cls ? ' ' + cls : ''}" viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;
const G = {
  // A page with a folded corner. The corner is cut on a short diagonal and the fold is drawn as a
  // lighter L set just outside the cut, so the dog-ear keeps an open white triangle instead of
  // closing up into a blot at small sizes. iOS draws a larger page with a smaller fold, so each
  // layout gets its own drawing (1 unit = 1pt on the Mac, 1 CSS px on the phone) and rows.css
  // shows one.
  notes:
    glyph('0 0 8 11',
      `<g fill="none" stroke="currentColor" stroke-linejoin="round">` +
      `<path d="M4.25.5H1.6A1.1 1.1 0 0 0 .5 1.6v7.8a1.1 1.1 0 0 0 1.1 1.1h4.8a1.1 1.1 0 0 0 1.1-1.1V3.75"/>` +
      `<path d="M4.15.5 7.5 3.85" stroke-width=".9" stroke-linecap="round"/>` +
      `<path d="M3.6.6v3.8h3.8" stroke-width=".8"/></g>`, 'g-mac') +
    glyph('0 0 9.1 12',
      `<g fill="none" stroke="currentColor" stroke-linejoin="round">` +
      `<path d="M5.3.6H1.9A1.3 1.3 0 0 0 .6 1.9v8.2a1.3 1.3 0 0 0 1.3 1.3h5.3a1.3 1.3 0 0 0 1.3-1.3V3.8" stroke-width="1.2"/>` +
      `<path d="M5.2.6 8.5 3.9" stroke-linecap="round"/>` +
      `<path d="M4.58.65v3.8h3.87" stroke-width=".9"/></g>`, 'g-ios'),
  // Three ring bullets and three short rules. Each ring keeps an open eye (1.2pt across inside a 1pt
  // stroke) so all three read as the same outlined bullet, and the rules are a touch heavier than a
  // hairline so they read as even bars rather than a dotted line. On iOS the bullets are heavier
  // rings on a tighter 4px pitch, set closer to their rules.
  checklist:
    glyph('0 0 9 11',
      `<g fill="none" stroke="currentColor"><circle cx="1.5" cy="1.5" r="1.1"/><circle cx="1.5" cy="5.5" r="1.1"/><circle cx="1.5" cy="9.5" r="1.1"/>` +
      `<path d="M4.2 1.5H9M4.2 5.5H9M4.2 9.5H9" stroke-width="1.2"/></g>`, 'g-mac') +
    glyph('0 0 10.3 12',
      `<g fill="none" stroke="currentColor"><g stroke-width="1.2"><circle cx="1.95" cy="2.3" r="1.05"/><circle cx="1.95" cy="6.3" r="1.05"/><circle cx="1.95" cy="10.3" r="1.05"/></g>` +
      `<path d="M4.2 2.3h5.9M4.2 6.3h5.9M4.2 10.3h5.9" stroke-width="1.05"/></g>`, 'g-ios'),
  // Repeats: Apple's repeat loop (two arrows chasing round a rounded rectangle), the card's repeat
  // marker (detail.js) redrawn a size smaller for the row, its runs on whole pixels.
  repeat: glyph('0 0 14 12',
    `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M1.5 6.5V5A2.5 2.5 0 0 1 4 2.5h7.5M9.2.2l2.3 2.3-2.3 2.3"/>` +
    `<path d="M12.5 5.5V7A2.5 2.5 0 0 1 10 9.5H2.5m2.3-2.3-2.3 2.3 2.3 2.3"/></g>`),
  // a free-standing pole with a swallow-tailed pennant beside it. iOS draws a thinner pole, a wider
  // gap and a deeper notch than the Mac, so both are drawn and rows.css shows one per layout.
  flag: glyph('0 0 11 11',
    `<g class="flag-mac" fill="currentColor"><rect y=".5" width="1" height="11" rx=".35"/><path d="M2 1h9L9 4l2 3H2z"/></g>` +
    `<g class="flag-ios" fill="currentColor"><rect x=".48" y=".27" width=".96" height="10.46" rx=".35"/><path d="M2.37 .79h9.03L9.35 3.6l2.05 2.82H2.37z"/></g>`),
  // thin outlined crescent: outer r 13.5 about (14,14) minus an inner circle. The Mac and iOS
  // moons differ, so both are drawn and rows.css shows one per layout. The Mac cut-out (r 12.3
  // about (19.3,8.7)) leaves a slim ~10pt body with fine tips, measured off Things' heading moon.
  moon: glyph('0 0 28 28',
    `<g fill="#83a6d7" stroke="#6d91c5" stroke-width="1.2" stroke-linejoin="round">` +
    `<path class="moon-mac" d="M9.47 1.28A13.5 13.5 0 1 0 26.72 18.53A12.31 12.31 0 0 1 9.47 1.28z"/>` +
    `<path class="moon-ios" d="M8.97 1.47A13.5 13.5 0 1 0 26.77 18.37A13.3 13.3 0 0 1 8.97 1.47z"/></g>`),
};

const rowCache = new Map();   // todo id -> li
const groupCache = new Map(); // group key -> section

function createRow(id) {
  const li = document.createElement('li');
  li.dataset.id = id;
  li.innerHTML =
    `<div class="view">` +
      `<input class="toggle" type="checkbox" aria-label="Complete to-do">` +
      `<div class="row-main">` +
        `<div class="row-line"><span class="row-pre"></span><label></label><span class="row-post"></span></div>` +
        `<div class="row-sub"></div>` +
      `</div>` +
      `<span class="row-deadline"></span>` +
      `<button class="destroy" type="button" aria-label="Delete to-do" title="Delete">${icon('close-small')}</button>` +
    `</div>` +
    `<div class="card">` +
      `<div class="card-head">` +
        `<input class="card-toggle" type="checkbox" tabindex="-1" aria-label="Complete to-do">` +
        `<input class="edit" autocomplete="off" spellcheck="false" placeholder="New To-Do" aria-label="Title">` +
      `</div>` +
      `<div class="card-body"></div>` +
    `</div>`;
  return li;
}

function setHTML(el, html) { if (el.__html !== html) { el.innerHTML = html; el.__html = html; } }

function preHTML(t, opts) {
  let h = '';
  if (opts.badge && isDate(t.when) && whenIsFuture(t.when)) h += `<span class="row-date">${esc(fmtShort(t.when))}</span>`;
  if (opts.star && !t.completed) {
    if (t.when === 'evening') h += `<span class="row-glyph row-moon" title="This Evening">${G.moon}</span>`;
    else if (inToday(t)) h += `<span class="row-glyph row-star" title="Today">${icon('star')}</span>`;
  }
  return h;
}

function postHTML(t) {
  let h = '';
  // an open to-do that repeats; a finished occurrence has handed its rule on to the next one
  if (t.repeat && !t.completed) { const r = detail.repeatLabel(t.repeat, t.when, t.anchorDay); if (r) h += `<span class="row-icon row-icon-repeat" title="Repeats: ${esc(r)}" aria-label="Repeats: ${esc(r)}" role="img">${G.repeat}</span>`; }
  if (t.notes && t.notes.trim()) h += `<span class="row-icon row-icon-notes" title="Notes">${G.notes}</span>`;
  if (t.checklist && t.checklist.length) h += `<span class="row-icon row-icon-cl" title="Checklist">${G.checklist}</span>`;
  if (t.tags && t.tags.length) h += `<span class="row-icon row-icon-tag" title="${esc(t.tags.join(', '))}">${icon('tag')}</span>`;
  for (const tag of t.tags || []) h += `<span class="row-tag">${esc(tag)}</span>`;
  return h;
}

function deadlineHTML(t) {
  if (!t.deadline || t.completed) return '';
  const d = fmtDeadline(t.deadline);
  return `<span class="dl ${d.due ? 'due' : ''}">${G.flag}<span>${esc(d.text)}</span></span>`;
}

/** Update an li in place from its to-do. */
export function updateRow(li, t, opts, ctx) {
  const editing = ctx.editingId === t.id;
  const sub = opts.sub ? contextTitle(t) : '';
  li.className = [
    t.completed ? 'completed' : '',
    editing ? 'editing' : '',
    ctx.selected === t.id && !editing ? 'selected' : '',
    sub ? 'has-sub' : '',
  ].filter(Boolean).join(' ');
  const toggle = li.querySelector('.toggle');
  if (toggle.checked !== t.completed) toggle.checked = t.completed;
  const label = li.querySelector('label');
  if (label.textContent !== t.title) label.textContent = t.title;
  setHTML(li.querySelector('.row-pre'), preHTML(t, opts));
  setHTML(li.querySelector('.row-post'), postHTML(t));
  const subEl = li.querySelector('.row-sub');
  if (subEl.textContent !== sub) subEl.textContent = sub;
  setHTML(li.querySelector('.row-deadline'), deadlineHTML(t));
  if (editing) detail.sync(li, t, ctx);
  else {
    detail.release(li);
    const edit = li.querySelector('.edit');
    if (edit.value !== t.title) edit.value = t.title;
  }
}

/**
 * Move `el` to just before `ref` in `parent`. Where the browser can (moveBefore), the moved row or section
 * keeps its focus, a field's selection and its animations; elsewhere renderGroups puts the focus back.
 */
export function place(parent, el, ref) {
  if (parent.moveBefore && el.isConnected && parent.isConnected) {
    try { parent.moveBefore(el, ref); return; } catch { /* not movable in place: an ordinary move */ }
  }
  parent.insertBefore(el, ref);
}

/**
 * Place `children` into `parent` in order, touching the DOM only where the order differs. The child that
 * holds focus (the row with the open card, a section whose heading is being renamed) stays where it is and
 * the others move around it, so a row or section coming or going above it never takes the focus away (a
 * moved node loses it). Other nodes are removed, those `drop(node)` allows (by default all).
 */
export function reconcile(parent, children, drop = () => true) {
  const want = new Set(children);
  for (const n of [...parent.childNodes]) if (!want.has(n) && drop(n)) parent.removeChild(n);
  const a = document.activeElement;
  const pin = a && a !== document.body && parent.contains(a) ? children.findIndex(el => el.parentNode === parent && el.contains(a)) : -1;
  if (pin < 0) {
    let cur = parent.firstChild;
    for (const el of children) {
      if (cur === el) { cur = cur.nextSibling; continue; }
      place(parent, el, cur);
    }
    return;
  }
  for (let i = pin - 1; i >= 0; i--) if (children[i].nextSibling !== children[i + 1]) place(parent, children[i], children[i + 1]);
  for (let i = pin + 1; i < children.length; i++) if (children[i - 1].nextSibling !== children[i]) place(parent, children[i], children[i - 1].nextSibling);
}

/**
 * What has focus in the list, put back if a render takes it away: a row that changes section is moved
 * between lists (only a browser with moveBefore keeps focus through that), and an open card redraws its
 * chips. So the card never closes because its row moved while its to-do stays in the list, and what is
 * typed next still goes into it. Focus that went somewhere else on purpose is left alone, and so is a
 * card that closed.
 */
function holdFocus(container) {
  const el = document.activeElement;
  if (!el || el === document.body || !container.contains(el)) return () => {};
  const li = el.closest('.todo-list > li');
  const inCard = !!el.closest('.card');
  let sel = null;
  try { if (typeof el.selectionStart === 'number') sel = [el.selectionStart, el.selectionEnd, el.selectionDirection]; } catch { /* no selection */ }
  const scroll = [el.scrollTop, el.scrollLeft];
  return () => {
    const now = document.activeElement;
    if (now === el || (now && now !== document.body)) return;
    let target = el;
    if (!el.isConnected) {
      // redrawn (a card's chip): the same control in the same card, else the card's title
      if (!li?.isConnected || !li.classList.contains('editing') || !inCard) return;
      const attr = ['action', 'act'].find(k => el.dataset[k]);
      const same = el.tagName.toLowerCase() + [...el.classList].map(c => '.' + CSS.escape(c)).join('') + (attr ? `[data-${attr}="${CSS.escape(el.dataset[attr])}"]` : '');
      target = (attr && li.querySelector(same)) || li.querySelector('.edit');
    } else if (!container.contains(el) || (inCard && !li?.classList.contains('editing'))) return;
    target.focus({ preventScroll: true });
    if (target !== el) return;
    if (sel) try { el.setSelectionRange(sel[0], sel[1], sel[2] || 'none'); } catch { /* not a text field */ }
    [el.scrollTop, el.scrollLeft] = scroll;
  };
}

/** Whether the open card's row is in sight in the list (null: no open card on the page). */
function inSight(li) {
  const s = li?.isConnected && li.classList.contains('editing') && li.closest('.scroller');
  if (!s) return null;
  const r = li.getBoundingClientRect(), v = s.getBoundingClientRect();
  return r.bottom > v.top && r.top < v.bottom;
}

// ---------- group headings ----------
function groupHeadHTML(g, ctx) {
  switch (g.kind) {
    case 'evening':
      return `<div class="group-head gh-evening"><span class="gh-moon">${G.moon}</span><span class="gh-title">${esc(g.title)}</span></div>`;
    case 'heading':
      return project.headingHTML(g, ctx);
    case 'date': {
      const n = daysFromToday(g.date);
      const d = parseISO(g.date);
      const label = n === 1 ? 'Tomorrow' : DAYS[d.getDay()];
      return `<div class="group-head gh-date"><span class="gh-num">${d.getDate()}</span><span class="gh-day">${label}</span></div>`;
    }
    case 'month':
    case 'logday':
      return `<div class="group-head gh-month"><span class="gh-title">${esc(g.title)}</span></div>`;
    case 'list': {
      const isArea = g.list.type === 'area';
      const ic = isArea ? icon('area') : pie(projectProgress(g.list.id), { size: 15, stroke: 1.3, gap: 1.5 });
      return `<a class="group-head gh-list" href="${listHref(g.list.type, g.list.id)}"><span class="gh-icon">${ic}</span><span class="gh-title">${esc(g.title)}</span></a>`;
    }
    default:
      return '';
  }
}

/**
 * Render groups into `container`.
 * groups: [{ key, kind, title?, todos: [...], ... }]
 * opts: { sub, star, badge }
 * ctx: { editingId, selected, route, layout }
 */
export function renderGroups(container, groups, opts, ctx) {
  const restoreFocus = holdFocus(container);
  const openLi = ctx.editingId ? rowCache.get(ctx.editingId) : null;
  const sawOpen = inSight(openLi);
  const sections = [];
  const plan = [];
  const seenRows = new Set();
  groups.forEach((g, gi) => {
    const keep = gi === 0 || g.todos.length || g.kind === 'heading';
    if (!keep) return;
    let sec = groupCache.get(g.key);
    if (!sec) {
      sec = document.createElement('section');
      sec.innerHTML = `<div class="group-head-slot"></div><ul class="todo-list"></ul>`;
      groupCache.set(g.key, sec);
    }
    sec.className = `group g-${g.kind}${g.todos.length ? '' : ' empty'}`;
    sec.dataset.key = g.key;
    const slot = sec.firstElementChild;
    if (!slot.contains(document.activeElement)) setHTML(slot, groupHeadHTML(g, ctx));
    const ul = sec.lastElementChild;
    const lis = g.todos.map(t => {
      let li = rowCache.get(t.id);
      if (!li) { li = createRow(t.id); rowCache.set(t.id, li); }
      seenRows.add(t.id);
      updateRow(li, t, opts, ctx);
      return li;
    });
    plan.push([ul, lis]);
    sections.push(sec);
  });
  // Sections first, so a row moving to a new section moves into one on the page. A section on its way out
  // stays until then if it holds the focused row: that row may be moving to another section. A row leaves
  // its old list only by moving to its new one.
  const placed = new Set(plan.flatMap(([, lis]) => lis));
  reconcile(container, sections, n => !n.contains(document.activeElement));
  for (const [ul, lis] of plan) reconcile(ul, lis, n => !placed.has(n));
  reconcile(container, sections);
  restoreFocus();
  // the open card that was in sight stays in sight when its row moves (to another section, say)
  if (sawOpen && inSight(openLi) === false) openLi.scrollIntoView({ block: 'nearest' });
  for (const [id, li] of rowCache) if (!seenRows.has(id)) { detail.release(li); rowCache.delete(id); }
  for (const [key, sec] of groupCache) if (!sec.isConnected) groupCache.delete(key);
}

/**
 * Row interactions, delegated on the groups container.
 * api: { toggle(id, done), destroy(id), select(id), open(id), isPhone() }
 */
export function bind(container, api) {
  const rowOf = el => el.closest('.todo-list > li');
  container.addEventListener('change', e => {
    if (!e.target.classList.contains('toggle')) return;
    const li = rowOf(e.target);
    if (li) api.toggle(li.dataset.id, e.target.checked);
  });
  container.addEventListener('click', e => {
    const li = rowOf(e.target);
    if (!li || li.classList.contains('editing')) return;
    if (e.target.closest('.destroy')) { api.destroy(li.dataset.id); return; }
    if (e.target.closest('.toggle') || !e.target.closest('.view')) return;
    if (api.isPhone()) api.open(li.dataset.id);
    else api.select(li.dataset.id);
  });
  container.addEventListener('dblclick', e => {
    const li = rowOf(e.target);
    if (!li || li.classList.contains('editing')) return;
    if (e.target.closest('.toggle, .destroy') || !e.target.closest('.view')) return;
    window.getSelection()?.removeAllRanges();
    api.open(li.dataset.id);
  });
}

/** Visible to-do ids in display order (for keyboard selection). */
export function visibleIds(container) {
  return [...container.querySelectorAll('.todo-list > li')].map(li => li.dataset.id);
}

export function rowEl(id) { return rowCache.get(id) || null; }

export { esc };

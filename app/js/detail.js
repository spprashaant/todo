// The open to-do card (piece: detail). The card lives inside the to-do's own <li>, which gets
// class "editing"; input.edit is the card's title field. Double-click a row to open it.
import { icon, pie } from './icons.js';
import {
  state, ui, getTodo, updateTodo, removeTodo, setUI, batch, toggleTodo,
  addChecklistItem, updateChecklistItem, removeChecklistItem, ensureTag, projectProgress, refresh,
} from './store.js';
import { isDate, fmtRelative, fmtWeekdayDate, daysFromToday, todayISO } from './dates.js';
import { describe as describeRepeat } from './recur.js';
import * as when from './when.js';
import { mirrorFontSize } from './caret.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mounted = new WeakMap(); // li -> { id, original }
let openedAt = -Infinity;

// ---------- the card's action glyphs ----------
// Things draws these on one 18-unit grid with a hairline (1 unit) stroke: a wide calendar with a
// rule under the top edge and a 3×3 grid of dashes, a tag with a punched (filled) hole, and a flag
// whose pole stands free of the pennant.
/** Path through `pts` with each corner rounded by the matching radius. */
function roundedPath(pts, radii) {
  const n = pts.length;
  let d = '';
  for (let i = 0; i < n; i++) {
    const [px, py] = pts[(i - 1 + n) % n], [x, y] = pts[i], [nx, ny] = pts[(i + 1) % n];
    const r = radii[i];
    const l1 = Math.hypot(px - x, py - y), l2 = Math.hypot(nx - x, ny - y);
    const a = [x + (px - x) * r / l1, y + (py - y) * r / l1], b = [x + (nx - x) * r / l2, y + (ny - y) * r / l2];
    d += `${i ? 'L' : 'M'}${a[0].toFixed(2)} ${a[1].toFixed(2)}Q${x} ${y} ${b[0].toFixed(2)} ${b[1].toFixed(2)}`;
  }
  return d + 'Z';
}
const glyph = body => `<svg class="ico card-ico" viewBox="0 0 18 18" aria-hidden="true" focusable="false">${body}</svg>`;
const dashes = [7.9, 10.2, 12.5].flatMap(y => [5.2, 9, 12.8].map(x => `<rect x="${x - .8}" y="${y - .45}" width="1.6" height=".9" rx=".3"/>`)).join('');
const CARD_ICONS = {
  when: glyph(`<rect x=".9" y="1.7" width="16.2" height="14.6" rx="2.9" fill="none" stroke="currentColor"/>` +
    `<path d="M2.7 4.8h12.6" stroke="currentColor"/><g fill="currentColor">${dashes}</g>`),
  tags: glyph(`<path d="${roundedPath([[1.8, 1.8], [8.3, 1.8], [16.2, 9.7], [9.7, 16.2], [1.8, 8.3]], [1.9, 1.3, 1.7, 1.7, 1.3])}" fill="none" stroke="currentColor" stroke-linejoin="round"/>` +
    `<circle cx="5.05" cy="5.05" r="1" fill="currentColor"/>`),
  checklist: glyph(`<g fill="none" stroke="currentColor"><circle cx="3.4" cy="4" r="1.6"/><circle cx="3.4" cy="9" r="1.6"/><circle cx="3.4" cy="14" r="1.6"/></g>` +
    `<path d="M7.4 4h9M7.4 9h9M7.4 14h9" stroke="currentColor" stroke-linecap="round"/>`),
  deadline: glyph(`<path d="M3 2.3v13.4" stroke="currentColor" stroke-linecap="round"/>` +
    `<path d="M5.5 2.7h10l-3.1 3 3.1 3h-10z" fill="none" stroke="currentColor" stroke-linejoin="round"/>`),
};
const rowOf = id => document.querySelector(`.todo-list > li[data-id="${CSS.escape(id)}"]`);

// ---------- open / close ----------
export function open(id) {
  if (ui.editingId === id) return;
  if (ui.editingId) close();
  openedAt = performance.now();
  batch(() => setUI({ editingId: id, selected: id, composing: false }));
}

export function close({ cancel = false } = {}) {
  const id = ui.editingId;
  if (!id) return;
  refresh(); // another tab's latest edit reaches the card (sync) before it decides what to write back
  const li = rowOf(id);
  const st = li && mounted.get(li);
  const t = getTodo(id);
  batch(() => {
    if (t && li) {
      const edit = li.querySelector('.edit');
      if (cancel) {
        // the title is saved as it is typed (saveTitle), so cancelling writes the old one back; only this
        // card's own typing is taken back, never a title another tab saved since
        const title = st && t.title === st.shown ? st.original : t.title;
        edit.value = title;
        if (title !== t.title) updateTodo(id, { title });
      } else {
        const title = edit.value.trim();
        if (!title) { setUI({ editingId: null }); removeTodo(id); return; }
        // only a title typed in this card is written: an untouched card never writes back a stale one
        if (title !== t.title && (!st || title !== st.shown)) updateTodo(id, { title });
      }
    }
    setUI({ editingId: null, selected: t ? id : null });
  });
  when.close();
}

/**
 * Save the card's title as it is typed, like its notes, so whatever acts on the to-do while the card
 * is open (its checkbox, More > Complete, Cmd/Ctrl+K, a move, another tab) has the title on screen.
 * Completing a repeating to-do copies it into the next occurrence. An empty title waits for close().
 */
function saveTitle(li) {
  const t = getTodo(li.dataset.id);
  const title = li.querySelector('.edit').value.trim();
  const st = mounted.get(li);
  if (t && title && title !== t.title) { if (st) st.shown = title; updateTodo(t.id, { title }); }
}

/**
 * Put a stored value into a card field. With focus, the insertion point stays on the same text: at the
 * end if it was at the end, otherwise before or after whatever changed.
 */
function setField(el, value) {
  const old = el.value, focused = document.activeElement === el, a = el.selectionStart, b = el.selectionEnd;
  el.value = value;
  if (!focused) return;
  let p = 0, s = 0;
  while (p < old.length && p < value.length && old[p] === value[p]) p++;
  while (s < old.length - p && s < value.length - p && old[old.length - 1 - s] === value[value.length - 1 - s]) s++;
  const map = i => i >= old.length ? value.length : i <= p ? i : i >= old.length - s ? value.length - (old.length - i) : value.length - s;
  try { el.setSelectionRange(map(a), map(b)); } catch {}
}

export function isOpen() { return !!ui.editingId; }

// ---------- building the card ----------
function mount(li, t) {
  const body = li.querySelector('.card-body');
  body.innerHTML =
    `<textarea class="card-notes" rows="1" placeholder="Notes" spellcheck="false" aria-label="Notes"></textarea>` +
    `<div class="card-checklist" role="list"></div>` +
    `<div class="card-tags"></div>` +
    `<div class="card-foot"><div class="card-chips"></div><div class="card-actions"></div></div>`;
  const edit = li.querySelector('.edit');
  edit.value = t.title;
  // shown: the stored title the field last matched (on open, when saved as typed, or from another tab)
  const st = { id: t.id, original: t.title, shown: t.title, done: t.completed, notes: t.notes };
  mounted.set(li, st);
  li.setAttribute('data-shot', 'detail');
  queueMicrotask(() => {
    if (ui.editingId !== t.id) return;
    // With a mouse the title takes focus, ready to type. On a touch screen the card opens without
    // raising the keyboard, as Things does on iPhone; tapping a field starts editing it.
    if (!touchOnly()) {
      edit.focus({ preventScroll: true });
      const n = edit.value.length;
      try { edit.setSelectionRange(n, n); } catch {}
    }
    const scroller = li.closest('.scroller');
    if (scroller) {
      // Keep the whole card in view, clear of the phone's floating action bar.
      // (measured on the li, less its padding: the card itself is mid scale-in animation)
      const lr = li.getBoundingClientRect(), ls = getComputedStyle(li), s = scroller.getBoundingClientRect();
      const r = { top: lr.top + parseFloat(ls.paddingTop), bottom: lr.bottom - parseFloat(ls.paddingBottom) };
      const bar = document.getElementById('detail-bar');
      const limit = Math.min(s.bottom - 24, bar ? bar.getBoundingClientRect().top - 32 : Infinity);
      if (r.bottom > limit) scroller.scrollTop += Math.max(0, Math.min(r.bottom - limit, r.top - s.top - 20));
      else if (r.top < s.top) scroller.scrollTop -= s.top - r.top + 20;
    }
  });
  return st;
}

/** Called by rows.js on every render while this li is editing. */
export function sync(li, t, ctx) {
  let st = mounted.get(li);
  if (!st || st.id !== t.id) st = mount(li, t);
  // completing or reopening commits the title (a next occurrence may already carry it): Escape no longer reverts it
  if (st.done !== t.completed) { st.done = t.completed; st.original = t.title; }
  // Another tab changed the title or notes: show its version wherever nothing typed here is unsaved, so
  // closing (or Escape) never writes the old text back over it.
  if (t.title !== st.shown) {
    const edit = li.querySelector('.edit');
    if (edit.value.trim() === st.shown) setField(edit, t.title);
    st.shown = st.original = t.title;
  }
  const toggle = li.querySelector('.card-toggle');
  if (toggle.checked !== t.completed) toggle.checked = t.completed;
  const notes = li.querySelector('.card-notes');
  if (notes.value !== t.notes && (document.activeElement !== notes || notes.value === st.notes)) setField(notes, t.notes);
  st.notes = t.notes;
  autosize(notes);
  renderChecklist(li, t);
  renderTags(li, t);
  renderFoot(li, t, ctx);
  queueCaret();
}

/** Called by rows.js when the li is no longer editing (or is dropped). */
export function release(li) {
  if (!mounted.has(li)) return;
  mounted.delete(li);
  li.removeAttribute('data-shot');
  li.querySelector('.card-body').innerHTML = '';
  li.querySelector('.card-caret')?.remove();
  li.querySelector('.card')?.classList.remove('has-caret');
}

const touchOnly = () => matchMedia('(hover: none) and (pointer: coarse)').matches;

// ---------- insertion point ----------
// Things' insertion point is the Mac one: a 2px accent-blue bar, where browsers draw a 1px
// hairline. The card's fields hide the native caret and one bar per card follows whichever field
// has focus. A hidden mirror of that field's text up to the caret gives the position; the bar
// blinks with CSS and holds steady while you type.
const CARET_FIELDS = '.edit, .card-notes, .cl-input';
const MIRRORED = ['boxSizing', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontStretch', 'fontVariant',
  'fontFeatureSettings', 'fontVariationSettings', 'fontKerning', 'fontOpticalSizing', 'letterSpacing', 'wordSpacing',
  'textTransform', 'textIndent', 'lineHeight', 'tabSize', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom'];
let caretRaf = 0, windowFocused = true;
const queueCaret = () => { if (!caretRaf) caretRaf = requestAnimationFrame(placeCaret); };
const snap = v => Math.round(v * devicePixelRatio) / devicePixelRatio;

function placeCaret() {
  caretRaf = 0;
  const li = ui.editingId && rowOf(ui.editingId);
  const card = li && mounted.has(li) && li.querySelector('.card');
  if (!card) return;
  let bar = card.querySelector(':scope > .card-caret');
  if (!bar) {
    bar = document.createElement('span');
    bar.className = 'card-caret';
    bar.setAttribute('aria-hidden', 'true');
    card.append(bar);
    card.classList.add('has-caret');
  }
  const f = document.activeElement;
  const on = windowFocused && f && card.contains(f) && f.matches(CARET_FIELDS) && f.selectionStart === f.selectionEnd;
  bar.classList.toggle('on', !!on);
  if (!on) return;
  const cs = getComputedStyle(f);
  const multiline = f.tagName === 'TEXTAREA';
  const mirror = document.createElement('div');
  mirror.className = 'card-caret-mirror';
  for (const p of MIRRORED) mirror.style[p] = cs[p];
  mirror.style.fontSize = mirrorFontSize(f, cs) + 'px'; // as wide as the field draws it (Android scales only page text)
  mirror.style.whiteSpace = multiline ? 'pre-wrap' : 'pre';
  mirror.style.width = multiline ? f.clientWidth + 'px' : 'auto';
  mirror.textContent = f.value.slice(0, f.selectionStart);
  // the mark carries the rest of the word, so a word wrapped in the field wraps in the mirror too
  const mark = document.createElement('span');
  mark.textContent = f.value.slice(f.selectionStart).match(/^\S*/)[0] || '\u200b';
  mirror.append(mark);
  card.append(mirror);
  const fr = f.getBoundingClientRect(), cr = card.getBoundingClientRect();
  const x = fr.left - cr.left + f.clientLeft + mark.offsetLeft - f.scrollLeft;
  // single-line fields centre their line in the box; the notes flow from the top
  const mid = fr.top - cr.top + f.clientTop + (multiline ? mark.offsetTop + mark.offsetHeight / 2 - f.scrollTop : f.clientHeight / 2);
  mirror.remove();
  const h = Math.round(parseFloat(cs.fontSize) * 1.08);
  bar.style.height = h + 'px';
  bar.style.width = Math.max(1, Math.round(2 * devicePixelRatio)) / devicePixelRatio + 'px'; // whole device pixels, so it stays crisp
  // snap in page space: the card itself may sit on a fractional device pixel
  bar.style.transform = `translate(${snap(cr.left + x) - cr.left}px, ${snap(cr.top + mid - h / 2) - cr.top}px)`;
  bar.style.animation = 'none';
  void bar.offsetWidth; // restart the blink so the bar stays solid while typing
  bar.style.animation = '';
}

function autosize(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}

function renderChecklist(li, t) {
  const box = li.querySelector('.card-checklist');
  box.classList.toggle('has-items', t.checklist.length > 0);
  const existing = new Map([...box.children].map(el => [el.dataset.cid, el]));
  const els = t.checklist.map(c => {
    let el = existing.get(c.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'cl-item';
      el.dataset.cid = c.id;
      el.setAttribute('role', 'listitem');
      el.innerHTML = `<button class="cl-check" type="button" aria-label="Complete item"></button>` +
        `<input class="cl-input" autocomplete="off" spellcheck="false" aria-label="Checklist item">` +
        `<span class="cl-handle" aria-hidden="true">${icon('handle')}</span>`;
    }
    el.classList.toggle('done', c.completed);
    const input = el.querySelector('.cl-input');
    if (input.value !== c.title && (document.activeElement !== input || input.value === input.__shown)) setField(input, c.title);
    input.__shown = c.title;
    return el;
  });
  // the item being typed in stays put and the others move around it (a moved field loses focus, and the card with it)
  const keep = new Set(els);
  for (const el of [...box.children]) if (!keep.has(el)) el.remove();
  const pin = els.findIndex(el => el.parentNode === box && el.contains(document.activeElement));
  if (pin < 0) {
    let cur = box.firstChild;
    for (const el of els) { if (cur === el) { cur = cur.nextSibling; continue; } box.insertBefore(el, cur); }
    return;
  }
  for (let i = pin - 1; i >= 0; i--) if (els[i].nextSibling !== els[i + 1]) box.insertBefore(els[i], els[i + 1]);
  for (let i = pin + 1; i < els.length; i++) if (els[i - 1].nextSibling !== els[i]) box.insertBefore(els[i], els[i - 1].nextSibling);
}

function renderTags(li, t) {
  const box = li.querySelector('.card-tags');
  const html = t.tags.map(tag => `<button class="card-tag" type="button" data-act="tags">${esc(tag)}</button>`).join('');
  if (box.__html !== html) { box.innerHTML = html; box.__html = html; }
  box.classList.toggle('has-items', t.tags.length > 0);
}

export function whenChipHTML(value, reminder = null) {
  if (!value) return '';
  let ic, label;
  if (value === 'today' || (isDate(value) && daysFromToday(value) <= 0)) { ic = icon('star'); label = 'Today'; }
  else if (value === 'evening') { ic = icon('moon'); label = 'This Evening'; }
  else if (value === 'someday') { ic = icon('box-small'); label = 'Someday'; }
  else { ic = icon('calendar-color'); label = fmtRelative(value); }
  label += when.reminderSuffix(value, reminder);
  return `<button class="chip chip-when" type="button" data-action="when" title="When">${ic}<span>${esc(label)}</span></button>` +
    `<button class="chip-clear" type="button" data-act="clear-when" aria-label="Clear date">${icon('close-small')}</button>`;
}

export function deadlineChipHTML(value) {
  if (!value) return '';
  const due = daysFromToday(value) <= 0;
  const label = daysFromToday(value) === 0 ? 'today' : fmtWeekdayDate(value);
  return `<button class="chip chip-deadline ${due ? 'due' : ''}" type="button" data-act="deadline" title="Deadline">${icon('flag')}<span>Deadline: ${esc(label)}</span></button>` +
    `<button class="chip-clear" type="button" data-act="clear-deadline" aria-label="Clear deadline">${icon('close-small')}</button>`;
}

// ---------- the repeat marker ----------
// A to-do that repeats says so beside its date, in words: Apple's repeat loop (two arrows chasing
// round a rounded rectangle, the mark Reminders and Calendar use) on the same hairline grid as the
// card's other glyphs, then the rule itself, so the card answers "when" and "how often" at a glance.
export const REPEAT_GLYPH = `<svg class="ico repeat-ico" viewBox="0 0 16 14" aria-hidden="true" focusable="false">` +
  `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">` +
  `<path d="M1.5 7.5v-2a3 3 0 0 1 3-3h9M11 0l2.5 2.5L11 5"/>` +
  `<path d="M14.5 6.5v2a3 3 0 0 1-3 3h-9M5 9l-2.5 2.5L5 14"/></g></svg>`;

/**
 * The rule in a few words: "Every Monday", "Every 2 weeks on Mon and Thu", "Every month on the 31st",
 * "7 days after completion". `whenValue` is the occurrence's `when`: its date fills in what the rule
 * leaves to the date (a weekly rule without weekdays repeats on that date's weekday). `anchorDay` is the
 * to-do's own: a clamped Apr 30 occurrence of a monthly series on the 31st still reads "on the 31st".
 */
export function repeatLabel(rule, whenValue, anchorDay = null) {
  const date = isDate(whenValue) ? whenValue : (whenValue === 'today' || whenValue === 'evening') ? todayISO() : null;
  return describeRepeat(rule, { date, anchorDay }).replace(/^Every week on /, 'Every ');
}

/** The card's repeat chip: opens the When picker (where the rule is edited); its × stops repeating. */
export function repeatChipHTML(rule, whenValue, anchorDay = null) {
  const label = rule ? repeatLabel(rule, whenValue, anchorDay) : '';
  if (!label) return '';
  return `<button class="chip chip-repeat" type="button" data-action="when" title="Repeats: ${esc(label)}" aria-label="Repeats: ${esc(label)}">${REPEAT_GLYPH}<span>${esc(label)}</span></button>` +
    `<button class="chip-clear" type="button" data-act="clear-repeat" aria-label="Stop repeating" title="Stop repeating">${icon('close-small')}</button>`;
}

function renderFoot(li, t) {
  const chips = li.querySelector('.card-chips');
  const chipHTML = (t.when ? `<span class="chip-wrap">${whenChipHTML(t.when, t.reminder)}</span>` : '') +
    // an open to-do's rule; a finished occurrence has handed it on to the next one
    (t.repeat && !t.completed ? `<span class="chip-wrap chip-wrap-repeat">${repeatChipHTML(t.repeat, t.when, t.anchorDay)}</span>` : '') +
    (t.deadline ? `<span class="chip-wrap">${deadlineChipHTML(t.deadline)}</span>` : '');
  if (chips.__html !== chipHTML) { chips.innerHTML = chipHTML; chips.__html = chipHTML; }
  const acts = [];
  if (!t.when) acts.push(`<button class="card-act" type="button" data-action="when" title="When" aria-label="When">${CARD_ICONS.when}</button>`);
  if (!t.tags.length) acts.push(`<button class="card-act" type="button" data-act="tags" title="Tags" aria-label="Tags">${CARD_ICONS.tags}</button>`);
  if (!t.checklist.length) acts.push(`<button class="card-act" type="button" data-act="checklist" title="Checklist" aria-label="Checklist">${CARD_ICONS.checklist}</button>`);
  if (!t.deadline) acts.push(`<button class="card-act" type="button" data-act="deadline" title="Deadline" aria-label="Deadline">${CARD_ICONS.deadline}</button>`);
  const actHTML = acts.join('');
  const box = li.querySelector('.card-actions');
  if (box.__html !== actHTML) { box.innerHTML = actHTML; box.__html = actHTML; }
}

// ---------- menus shared with the composer ----------
function layer() { return document.getElementById('layer'); }

function placeNear(el, anchor, { align = 'start', gap = 6 } = {}) {
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  let x = align === 'end' ? r.right - w : r.left;
  let y = r.bottom + gap;
  if (y + h > innerHeight - 8) y = Math.max(8, r.top - h - gap);
  x = Math.max(8, Math.min(x, innerWidth - w - 8));
  el.style.left = x + 'px';
  el.style.top = y + 'px';
}

let menuCleanup = null;
export function closeMenu() { if (menuCleanup) { const f = menuCleanup; menuCleanup = null; f(); } }
export function menuOpen() { return !!menuCleanup; }

/**
 * A small light menu. items: [{ label, icon?, run(), checked?, sep? } | { input: placeholder, run(text) }]
 */
export function openMenu(anchor, items, { align = 'start', returnFocus } = {}) {
  closeMenu();
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = items.map((it, i) => {
    if (it.sep) return `<div class="menu-sep"></div>`;
    if (it.input) return `<input class="menu-input" data-i="${i}" placeholder="${esc(it.input)}" autocomplete="off" spellcheck="false">`;
    if (it.html) return it.html;
    return `<button class="menu-item" type="button" role="menuitem" data-i="${i}">${it.checked ? icon('check') : it.icon || '<span class="menu-sp"></span>'}<span>${esc(it.label)}</span></button>`;
  }).join('');
  layer().append(scrim, menu);
  placeNear(menu, anchor, { align });
  const done = () => { scrim.remove(); menu.remove(); document.removeEventListener('keydown', onKey, true); if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true }); };
  menuCleanup = done;
  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); }
    const btns = [...menu.querySelectorAll('.menu-item')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const i = btns.indexOf(document.activeElement);
      const n = e.key === 'ArrowDown' ? (i + 1) % btns.length : (i - 1 + btns.length) % btns.length;
      btns[n]?.focus();
    }
  };
  document.addEventListener('keydown', onKey, true);
  scrim.addEventListener('pointerdown', e => { e.preventDefault(); closeMenu(); });
  menu.addEventListener('mousedown', e => { if (!e.target.closest('input')) e.preventDefault(); });
  menu.addEventListener('click', e => {
    const b = e.target.closest('.menu-item');
    if (!b) return;
    const it = items[Number(b.dataset.i)];
    // an { html } item (e.g. the Complete All label): let its own click act first, then close
    if (!it) { setTimeout(closeMenu); return; }
    if (!it.keepOpen) closeMenu();
    it.run?.();
  });
  const input = menu.querySelector('.menu-input');
  if (input) {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const v = input.value.trim();
        const it = items[Number(input.dataset.i)];
        closeMenu();
        if (v) it.run(v);
      }
    });
    input.focus();
  } else {
    menu.querySelector('.menu-item')?.focus({ preventScroll: true });
  }
  return menu;
}

/** Tag picker: toggles tags on a to-do (or on a draft via onChange(next, { tag, on })). */
export function openTagMenu(anchor, current, onChange, opts = {}) {
  const tags = [...new Set([...state.lists.tags, ...current])];
  const items = tags.map(tag => ({
    label: tag, checked: current.includes(tag),
    run: () => { const on = !current.includes(tag); onChange(on ? [...current, tag] : current.filter(x => x !== tag), { tag, on }); },
  }));
  if (items.length) items.push({ sep: true });
  items.push({ input: 'New Tag', run: v => { ensureTag(v); onChange(current.includes(v) ? current : [...current, v], { tag: v, on: true }); } });
  return openMenu(anchor, items, opts);
}

/**
 * A to-do's tag menu changes only the tag picked, on the tags stored now: a menu left open never writes
 * its older copy of the tags over ones changed elsewhere (another tab) since it opened.
 */
function toggleTag(id, { tag, on }) {
  refresh();
  const cur = getTodo(id)?.tags;
  if (!cur || cur.includes(tag) === on) return;
  updateTodo(id, { tags: on ? [...cur, tag] : cur.filter(x => x !== tag) });
}

/** Move a to-do to Inbox, an area or a project. */
export function openMoveMenu(anchor, id, opts = {}) {
  const t = getTodo(id);
  if (!t) return;
  const { projects, areas } = state.lists;
  const items = [{ label: 'Inbox', icon: icon('inbox'), checked: !t.project && !t.area && !t.when, run: () => updateTodo(id, { project: null, area: null, heading: null, when: null }) }];
  const loose = projects.filter(p => !p.area || !areas.some(a => a.id === p.area));
  for (const p of loose) items.push({ label: p.title, icon: pie(projectProgress(p.id), { size: 14, stroke: 1.2, gap: 1.3 }), checked: t.project === p.id, run: () => updateTodo(id, { project: p.id, area: null, heading: null }) });
  for (const a of areas) {
    items.push({ sep: true });
    items.push({ label: a.title, icon: icon('area'), checked: !t.project && t.area === a.id, run: () => updateTodo(id, { project: null, area: a.id, heading: null }) });
    for (const p of projects.filter(p => p.area === a.id)) items.push({ label: p.title, indent: true, icon: pie(projectProgress(p.id), { size: 14, stroke: 1.2, gap: 1.3 }), checked: t.project === p.id, run: () => updateTodo(id, { project: p.id, area: null, heading: null }) });
  }
  return openMenu(anchor, items, opts);
}

// ---------- events (delegated on the groups container) ----------
export function bind(container) {
  // Keep focus inside the card when clicking its chrome.
  container.addEventListener('mousedown', e => {
    const card = e.target.closest('li.editing .card');
    if (!card) return;
    // The rest of the double-click (or double-tap) that opened the card must not land in it. On a
    // phone a single tap opens the card, so the second press would select a word of the title.
    if (e.detail > 1 && performance.now() - openedAt < 600) { e.preventDefault(); return; }
    // (its checkbox too: it ticks without taking the focus, so typing goes on where the caret was)
    if (!e.target.closest('input, textarea') || e.target.classList.contains('card-toggle')) e.preventDefault();
  });

  container.addEventListener('keydown', e => {
    const li = e.target.closest('li.editing');
    if (!li) return;
    const id = li.dataset.id;
    // Cmd/Ctrl+K completes (or reopens) the open to-do from anywhere in its card, the title, notes and
    // checklist included, as its checkbox does: the title on screen goes with it (a next occurrence
    // copies it) and is committed, so a later Escape keeps it. It flips the way the card showed it.
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      e.stopPropagation(); // the page's own Cmd/Ctrl+K (view.js) must not flip it back
      if (e.repeat || when.isOpen() || menuOpen()) return; // a held key flips it once
      const shown = li.querySelector('.card-toggle')?.checked;
      saveTitle(li);
      toggleTodo(id, typeof shown === 'boolean' ? !shown : undefined);
      return;
    }
    if (e.target.classList.contains('edit')) {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); close(); }
      else if (e.key === 'Escape') { e.preventDefault(); close({ cancel: true }); }
      else if (e.key === 'ArrowDown') { const n = li.querySelector('.card-notes'); if (n) { e.preventDefault(); n.focus(); } }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); close(); return; }
    if (e.target.classList.contains('cl-input')) {
      const item = e.target.closest('.cl-item');
      const cid = item.dataset.cid;
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        const n = addChecklistItem(id, '', cid);
        if (n) focusChecklist(li, n.id);
      } else if (e.key === 'Backspace' && e.target.value === '') {
        e.preventDefault();
        const prev = item.previousElementSibling;
        removeChecklistItem(id, cid);
        if (prev) focusChecklist(li, prev.dataset.cid, true); else li.querySelector('.card-notes')?.focus();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const sib = e.key === 'ArrowUp' ? item.previousElementSibling : item.nextElementSibling;
        if (sib) { e.preventDefault(); focusChecklist(li, sib.dataset.cid, true); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); li.querySelector('.card-notes')?.focus(); }
      }
    }
  });

  container.addEventListener('input', e => {
    const li = e.target.closest('li.editing');
    if (!li) return;
    const id = li.dataset.id;
    if (e.target.classList.contains('card-notes')) { autosize(e.target); updateTodo(id, { notes: e.target.value }); }
    else if (e.target.classList.contains('cl-input')) updateChecklistItem(id, e.target.closest('.cl-item').dataset.cid, { title: e.target.value });
    else if (e.target.classList.contains('edit') && !e.isComposing) saveTitle(li);
  });
  container.addEventListener('compositionend', e => {
    const li = e.target.closest('li.editing');
    if (li && e.target.classList.contains('edit')) saveTitle(li);
  });

  container.addEventListener('change', e => {
    if (!e.target.classList.contains('card-toggle')) return;
    const li = e.target.closest('li.editing');
    if (li) { saveTitle(li); toggleTodo(li.dataset.id, e.target.checked); }
  });

  container.addEventListener('click', e => {
    const li = e.target.closest('li.editing');
    if (!li) return;
    const id = li.dataset.id;
    const t = getTodo(id);
    if (!t) return;
    const edit = li.querySelector('.edit');
    const b = e.target.closest('button');
    if (!b) return;
    if (b.classList.contains('cl-check')) {
      const cid = b.closest('.cl-item').dataset.cid;
      const c = t.checklist.find(x => x.id === cid);
      if (c) updateChecklistItem(id, cid, { completed: !c.completed });
      return;
    }
    if (b.dataset.action === 'when') {
      // a rule or reminder saved in the picker redraws the chips: it keeps to the chip that replaced this one
      const same = b.classList.contains('chip-repeat') ? '.chip-repeat' : b.classList.contains('chip-when') ? '.chip-when' : '.card-act[data-action="when"]';
      const reanchor = () => document.querySelector(`li.editing[data-id="${CSS.escape(id)}"] ${same}`);
      when.open({ anchor: b, reanchor, value: t.when, reminder: t.reminder ?? null, repeatFor: id, onPick: (v, r) => updateTodo(id, { when: v, reminder: r }), returnFocus: edit });
      return;
    }
    switch (b.dataset.act) {
      case 'tags': openTagMenu(b, t.tags, (next, change) => toggleTag(id, change), { returnFocus: edit, align: 'end' }); break;
      case 'checklist': { const n = addChecklistItem(id, ''); if (n) focusChecklist(li, n.id); break; }
      case 'deadline': when.open({ anchor: b, value: t.deadline, mode: 'deadline', todo: id, onPick: v => updateTodo(id, { deadline: v }), returnFocus: edit }); break;
      case 'clear-when': updateTodo(id, { when: null, reminder: null }); edit.focus(); break;
      case 'clear-deadline': updateTodo(id, { deadline: null }); edit.focus(); break;
      case 'clear-repeat': updateTodo(id, { repeat: null }); edit.focus(); break;
    }
  });

  // keep the insertion point on the caret
  for (const ev of ['focusin', 'focusout', 'input', 'keydown', 'keyup', 'mouseup', 'select']) container.addEventListener(ev, queueCaret);
  container.addEventListener('scroll', queueCaret, true);
  container.addEventListener('animationend', queueCaret);
  document.addEventListener('selectionchange', () => { if (ui.editingId) queueCaret(); });
  // a new width rewraps the notes, so refit their height before placing the caret
  addEventListener('resize', () => {
    if (!ui.editingId) return;
    const notes = rowOf(ui.editingId)?.querySelector('.card-notes');
    if (notes) autosize(notes);
    queueCaret();
  });
  addEventListener('blur', () => { windowFocused = false; queueCaret(); });
  addEventListener('focus', () => { windowFocused = true; queueCaret(); });

  // A tap outside the card closes it. On a touch screen the card may be open with nothing
  // focused, and the card collapsing moves the list under the finger, so that tap only closes,
  // like Things. (With a mouse, focus leaving the card closes it; see focusout below.)
  document.addEventListener('pointerdown', e => {
    if (!ui.editingId) return;
    // On a phone one tap opens the card, so a double-tap's second press (which can land just
    // above the card, now that it has lifted) is part of opening it, not a tap outside.
    if (performance.now() - openedAt < 500 && matchMedia('(max-width: 699px)').matches) return;
    const li = rowOf(ui.editingId);
    if (!li || li.contains(e.target) || e.target.closest('#layer, #detail-bar')) return;
    if (when.isOpen() || menuOpen()) return;
    const touch = e.pointerType !== 'mouse';
    if (!touch && li.contains(document.activeElement)) return;
    close();
    if (touch) swallowNextClick();
  }, true);

  // Leaving the card (focus goes elsewhere) saves and closes it, like Things.
  container.addEventListener('focusout', e => {
    const li = e.target.closest('li.editing');
    if (!li) return;
    const id = li.dataset.id;
    setTimeout(() => {
      if (ui.editingId !== id) return;
      const a = document.activeElement;
      if (a && (li.contains(a) || a.closest('#layer'))) return;
      if (when.isOpen() || menuOpen()) return;
      close();
    }, 0);
  });
}

function swallowNextClick() {
  const stop = e => { e.stopPropagation(); e.preventDefault(); done(); };
  const done = () => { clearTimeout(timer); document.removeEventListener('click', stop, true); };
  const timer = setTimeout(done, 600);
  document.addEventListener('click', stop, true);
}

function focusChecklist(li, cid, end = false) {
  queueMicrotask(() => {
    const input = li.querySelector(`.cl-item[data-cid="${CSS.escape(cid)}"] .cl-input`);
    if (!input) return;
    input.focus();
    if (end) { const n = input.value.length; input.setSelectionRange(n, n); }
  });
}

/** Phone: the floating action bar under an open card (Move, Delete, More). */
export function renderPhoneBar(ctx) {
  let bar = document.getElementById('detail-bar');
  const show = ctx.layout === 'phone' && ui.editingId;
  if (!show) { bar?.remove(); return; }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'detail-bar';
    bar.className = 'detail-bar';
    bar.innerHTML =
      `<button type="button" data-bar="move">${icon('arrow-right')}<span>Move</span></button>` +
      `<button type="button" data-bar="delete" aria-label="Delete">${icon('trashcan')}</button>` +
      `<button type="button" data-bar="more" aria-label="More">${icon('dots')}</button>`;
    bar.addEventListener('mousedown', e => e.preventDefault());
    bar.addEventListener('click', e => {
      const b = e.target.closest('button');
      const id = ui.editingId;
      if (!b || !id) return;
      const edit = rowOf(id)?.querySelector('.edit');
      if (b.dataset.bar === 'delete') { setUI({ editingId: null }); removeTodo(id); }
      else if (b.dataset.bar === 'move') openMoveMenu(b, id, { returnFocus: edit });
      else if (b.dataset.bar === 'more') {
        const t = getTodo(id);
        openMenu(b, [
          // the pickers open on the to-do as it is when tapped (it may have changed in another tab since More)
          { label: 'When…', icon: icon('calendar'), run: () => when.open({ anchor: b, reminder: null, repeatFor: id, onPick: (v, r) => updateTodo(id, { when: v, reminder: r }), returnFocus: edit }) },
          { label: 'Deadline…', icon: icon('flag-outline'), run: () => when.open({ anchor: b, mode: 'deadline', todo: id, onPick: v => updateTodo(id, { deadline: v }), returnFocus: edit }) },
          // does what it says, even if the to-do changed (in another tab) while the menu was open
          { label: t.completed ? 'Mark as Open' : 'Complete', icon: icon('check'), run: () => { const li = rowOf(id); if (li) saveTitle(li); toggleTodo(id, !t.completed); } },
        ], { align: 'end', returnFocus: edit });
      }
    });
    document.body.append(bar);
  }
}


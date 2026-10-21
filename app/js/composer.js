// New to-do composer (piece: composer).
// At rest it is a quiet "New To-Do" line at the end of the list (desktop). It opens into a lifted
// card (title, notes, when / tags / checklist / deadline) when clicked, typed into, or from the
// + in the toolbar (desktop) or the floating + (phone). Enter adds to the bottom of the current list.
import { icon } from './icons.js';
import { ui, addTodo, setUI, uid } from './store.js';
import * as when from './when.js';
import { whenChipHTML, deadlineChipHTML, repeatChipHTML, openTagMenu, menuOpen } from './detail.js';
import { mirrorFontSize } from './caret.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let root, input, notes, getCtx;
let draft = freshDraft();

function freshDraft() { return { notes: '', when: undefined, reminder: null, repeat: null, tags: [], deadline: null, checklist: [] }; }

export function mount(el, ctxGetter) {
  root = el;
  getCtx = ctxGetter;
  root.innerHTML =
    `<div class="composer-card">` +
      `<div class="card-head">` +
        `<span class="composer-check" aria-hidden="true"></span>` +
        `<input class="new-todo" placeholder="New To-Do" autocomplete="off" spellcheck="false" aria-label="New to-do" enterkeyhint="done">` +
      `</div>` +
      `<div class="composer-body">` +
        `<textarea class="composer-notes" rows="1" placeholder="Notes" spellcheck="false" aria-label="Notes"></textarea>` +
        `<div class="card-checklist"></div>` +
        `<div class="card-tags"></div>` +
        `<div class="card-foot"><div class="card-chips"></div><div class="card-actions"></div></div>` +
      `</div>` +
    `</div>`;
  input = root.querySelector('.new-todo');
  notes = root.querySelector('.composer-notes');
  carets.push(caretBar(input), caretBar(notes));

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      const added = commit();
      if (added) {
        setOpen(false);
        if (getCtx().layout === 'phone') input.blur();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      discard();
      if (getCtx().layout === 'phone') input.blur();
    } else if (e.key === 'ArrowDown' && ui.composing) {
      e.preventDefault();
      notes.focus();
    }
  });
  input.addEventListener('input', () => { if (input.value && !ui.composing) setOpen(true); });
  root.addEventListener('pointerdown', e => {
    if (!ui.composing && e.target.closest('.composer-card')) setOpen(true);
  });
  root.addEventListener('mousedown', e => {
    if (ui.composing && !e.target.closest('input, textarea')) e.preventDefault();
  });

  notes.addEventListener('input', () => { draft.notes = notes.value; autosize(notes); });
  notes.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); input.focus(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); if (commit()) setOpen(false); }
  });

  root.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const ctx = getCtx();
    switch (b.dataset.act) {
      case 'when':
        openWhen(b);
        break;
      case 'deadline':
        when.open({ anchor: b, value: draft.deadline, mode: 'deadline', onPick: v => { draft.deadline = v; update(getCtx()); }, returnFocus: input });
        break;
      case 'tags':
        openTagMenu(b, draft.tags, next => { draft.tags = next; update(getCtx()); }, { returnFocus: input, align: 'end' });
        break;
      case 'checklist':
        draft.checklist.push({ id: uid('c'), title: '', completed: false });
        update(ctx);
        focusChecklist(draft.checklist[draft.checklist.length - 1].id);
        break;
      case 'clear-when': draft.when = null; draft.reminder = null; update(ctx); input.focus(); break;
      case 'clear-deadline': draft.deadline = null; update(ctx); input.focus(); break;
      case 'clear-repeat': draft.repeat = null; update(ctx); input.focus(); break;
    }
  });
  // "When" chip uses data-action in the card; in the composer it is re-labelled to data-act
  root.addEventListener('click', e => {
    const chip = e.target.closest('.chip-when, .chip-repeat');
    if (chip) openWhen(chip);
  });

  root.addEventListener('input', e => {
    if (!e.target.classList.contains('cl-input')) return;
    const c = draft.checklist.find(x => x.id === e.target.closest('.cl-item').dataset.cid);
    if (c) c.title = e.target.value;
  });
  root.addEventListener('keydown', e => {
    if (!e.target.classList.contains('cl-input')) return;
    const item = e.target.closest('.cl-item');
    const i = draft.checklist.findIndex(x => x.id === item.dataset.cid);
    if (e.key === 'Enter') {
      e.preventDefault();
      const c = { id: uid('c'), title: '', completed: false };
      draft.checklist.splice(i + 1, 0, c);
      update(getCtx());
      focusChecklist(c.id);
    } else if (e.key === 'Backspace' && !e.target.value) {
      e.preventDefault();
      draft.checklist.splice(i, 1);
      update(getCtx());
      const prev = draft.checklist[i - 1];
      if (prev) focusChecklist(prev.id); else notes.focus();
    } else if (e.key === 'Escape') { e.preventDefault(); input.focus(); }
  });

  // Clicking away saves a titled draft and closes the card, like Things.
  root.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!ui.composing) return;
      const a = document.activeElement;
      if (a && (root.contains(a) || a.closest('#layer'))) return;
      if (when.isOpen() || menuOpen()) return;
      commit();
      setOpen(false);
    }, 0);
  });
}

// ---------- insertion point ----------
// Things draws a 2px blue insertion bar where browsers draw a 1px hairline, so the title and notes
// fields hide the native caret and get this bar instead. A mirror of the field's text up to the
// selection gives its position; it blinks with CSS and holds steady while you type.
const carets = [];
const MIRRORED = ['boxSizing', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontStretch', 'fontVariant',
  'fontFeatureSettings', 'fontVariationSettings', 'fontKerning', 'fontOpticalSizing', 'letterSpacing', 'wordSpacing',
  'textTransform', 'textIndent', 'lineHeight', 'tabSize', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom'];
const CAP_HEIGHT = 0.7; // cap height in ems: SF, Segoe UI and Roboto all sit at .70-.71

function caretBar(field) {
  const host = field.parentElement;
  const bar = document.createElement('span');
  bar.className = 'caret-bar';
  bar.setAttribute('aria-hidden', 'true');
  const mirror = document.createElement('div');
  mirror.className = 'caret-mirror';
  mirror.setAttribute('aria-hidden', 'true');
  host.append(bar, mirror);
  field.classList.add('has-caret-bar');
  const multiline = field.tagName === 'TEXTAREA';
  let raf = 0, restart = false, windowFocused = true;

  function place() {
    raf = 0;
    const on = windowFocused && document.activeElement === field && field.selectionStart === field.selectionEnd && field.offsetParent !== null;
    bar.classList.toggle('on', on);
    if (!on) return;
    const cs = getComputedStyle(field);
    for (const p of MIRRORED) mirror.style[p] = cs[p];
    mirror.style.fontSize = mirrorFontSize(field, cs) + 'px'; // as wide as the field draws it (Android scales only page text)
    mirror.style.whiteSpace = multiline ? 'pre-wrap' : 'pre';
    mirror.style.width = multiline ? field.clientWidth + 'px' : 'auto';
    mirror.textContent = field.value.slice(0, field.selectionStart);
    const mark = document.createElement('span');
    mark.textContent = '​';
    mirror.append(mark);
    const probe = document.createElement('span');
    probe.className = 'caret-probe';
    mirror.append(probe);
    const fs = parseFloat(cs.fontSize);
    // Metrics come from CSS: --caret-size is the bar's height in ems, and --caret-center says what
    // it is centred on: "line" (the line box, the Mac look) or "caps" (the cap-height band from
    // baseline to cap line, the iOS look, so the bar hangs evenly above the caps and below the baseline).
    const dpr = devicePixelRatio || 1;
    const h = Math.round(fs * (parseFloat(cs.getPropertyValue('--caret-size')) || 1.29) * dpr) / dpr;
    const caps = cs.getPropertyValue('--caret-center').trim() === 'caps';
    const top = field.offsetTop + field.clientTop - (multiline ? field.scrollTop : 0);
    let mid;
    if (caps) {
      // the probe sits on the baseline; a single-line input centres its one line (the mirror, which
      // has the same padding) in the field
      const lineTop = multiline ? 0 : (field.clientHeight - mirror.clientHeight) / 2;
      mid = top + lineTop + probe.offsetTop - fs * CAP_HEIGHT / 2;
    } else {
      // single-line inputs centre their line in the box; textareas flow from the top
      mid = multiline ? top + mark.offsetTop + mark.offsetHeight / 2 : top + field.clientHeight / 2;
    }
    const left = field.offsetLeft + field.clientLeft;
    const x = left + mark.offsetLeft - field.scrollLeft;
    if (x < left - 1 || x > left + field.clientWidth + 2) { bar.classList.remove('on'); return; } // scrolled out of view
    // The bar starts just before the insertion point and runs past it, so it clears the last glyph's
    // ink instead of fusing with it. It is snapped to device pixels in the scrolling content's own
    // space, where the text is rasterised, so its ends stay as crisp as the glyphs beside it.
    const at = host.getBoundingClientRect(), sc = host.closest('.scroller');
    const sr = sc ? sc.getBoundingClientRect() : { left: 0, top: 0 };
    const ox = at.left - sr.left + (sc ? sc.scrollLeft : 0), oy = at.top - sr.top + (sc ? sc.scrollTop : 0);
    const snap = (v, o) => Math.round((o + v) * dpr) / dpr - o;
    bar.style.height = h + 'px';
    bar.style.transform = `translate(${snap(x - .5, ox)}px, ${snap(mid - h / 2, oy)}px)`;
    if (restart) { bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; restart = false; }
  }
  const schedule = (poke = true) => { if (poke) restart = true; if (!raf) raf = requestAnimationFrame(place); };
  for (const ev of ['focus', 'blur', 'input', 'keydown', 'keyup', 'pointerup', 'select', 'scroll']) field.addEventListener(ev, () => schedule());
  document.addEventListener('selectionchange', () => { if (document.activeElement === field) schedule(); });
  addEventListener('blur', () => { windowFocused = false; schedule(false); });
  addEventListener('focus', () => { windowFocused = true; schedule(); });
  addEventListener('resize', () => schedule(false));
  return schedule;
}

function focusChecklist(cid) {
  requestAnimationFrame(() => root.querySelector(`.cl-item[data-cid="${CSS.escape(cid)}"] .cl-input`)?.focus());
}

function autosize(ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }

// The When picker for the draft, with its Repeats section and Add Reminder: the rule and the reminder
// stay in the draft until the to-do is added. Chips redrawn as either changes are found again, so the
// picker keeps to its anchor (a reminder added from the When button puts the draft in Today, and the
// When chip takes the button's place).
function openWhen(anchor) {
  const same = anchor.classList.contains('chip-repeat') ? '.chip-repeat' : anchor.classList.contains('chip-when') ? '.chip-when' : '.card-act[data-act="when"]';
  when.open({
    anchor, reanchor: () => root.querySelector(same) || root.querySelector('.chip-when'), value: effectiveWhen(getCtx()),
    reminder: draft.reminder,
    onPick: (v, r) => { draft.when = v; draft.reminder = r; update(getCtx()); },
    repeatDraft: { get: () => draft.repeat, set: r => { draft.repeat = r; update(getCtx()); } },
    returnFocus: input,
  });
}

function effectiveWhen(ctx) {
  if (draft.when !== undefined) return draft.when;
  return ctx.model?.newFields?.when ?? null;
}

function commit() {
  const ctx = getCtx();
  const title = input.value.trim();
  if (!title || !ctx.model.newFields) return false;
  const fields = { ...ctx.model.newFields };
  if (draft.when !== undefined) fields.when = draft.when;
  addTodo({
    ...fields,
    title,
    notes: draft.notes.trim(),
    reminder: when.canRemind(fields.when) && when.isTime(draft.reminder) ? draft.reminder : null,
    repeat: draft.repeat,
    tags: draft.tags.slice(),
    deadline: draft.deadline,
    checklist: draft.checklist.filter(c => c.title.trim()).map(c => ({ ...c, title: c.title.trim() })),
  });
  input.value = '';
  resetDraft();
  return true;
}

function resetDraft() {
  draft = freshDraft();
  notes.value = '';
  autosize(notes);
}

function discard() {
  input.value = '';
  resetDraft();
  setOpen(false);
}

function setOpen(v) {
  if (ui.composing === v) { update(getCtx()); return; }
  if (v && ui.editingId) {
    // close an open card first
    document.querySelector('li.editing .edit')?.blur();
  }
  setUI({ composing: v, ...(v ? { editingId: null } : {}) });
}

/** Closes the card the way clicking away does: a titled draft is added, an empty one is kept for next time. */
export function close() {
  if (!ui.composing) return;
  commit();
  setOpen(false);
  if (getCtx().layout === 'phone') input.blur();
}

/** The + buttons: open the card and focus the title. */
export function open() {
  const ctx = getCtx();
  if (!ctx.model.newFields) return false;
  setOpen(true);
  input.focus({ preventScroll: true });
  requestAnimationFrame(() => {
    const scroller = root.closest('.scroller');
    if (!scroller) return;
    const r = root.getBoundingClientRect(), s = scroller.getBoundingClientRect();
    const phone = getCtx().layout === 'phone';
    // keep the card comfortably in view (on phone, in the upper part of the screen, above the keyboard)
    const want = phone ? s.top + s.height * 0.22 : null;
    if (phone && (r.top > s.top + s.height * 0.45 || r.top < s.top)) scroller.scrollTop += r.top - want;
    else if (r.bottom > s.bottom - 16) scroller.scrollTop += r.bottom - s.bottom + 40;
    else if (r.top < s.top) scroller.scrollTop -= s.top - r.top + 20;
  });
  return true;
}

export function focusQuietly() {
  if (!input || ui.composing) return;
  input.focus({ preventScroll: true });
}

export function isResting(el) { return el === input && !ui.composing && !input.value; }
export function inputEl() { return input; }

/** Sync with the current view. */
export function update(ctx) {
  if (!root) return;
  syncCarets();
  const available = !!ctx.model.newFields;
  const open = ui.composing && available;
  root.classList.toggle('open', open);
  root.classList.toggle('unavailable', !available);
  root.classList.toggle('rest', !open);
  const body = root.querySelector('.composer-body');
  if (!open) return;
  // chips
  const w = effectiveWhen(ctx);
  let chips = '';
  if (w) chips += `<span class="chip-wrap">${whenChipHTML(w, draft.reminder).replace('data-action="when"', 'data-act="when-chip"')}</span>`;
  if (draft.repeat) chips += `<span class="chip-wrap chip-wrap-repeat">${repeatChipHTML(draft.repeat, w)}</span>`;
  if (draft.deadline) chips += `<span class="chip-wrap">${deadlineChipHTML(draft.deadline)}</span>`;
  const chipBox = body.querySelector('.card-chips');
  if (chipBox.__html !== chips) { chipBox.innerHTML = chips; chipBox.__html = chips; }
  // tags
  const tagBox = body.querySelector('.card-tags');
  const tags = draft.tags.map(t => `<button class="card-tag" type="button" data-act="tags">${esc(t)}</button>`).join('');
  if (tagBox.__html !== tags) { tagBox.innerHTML = tags; tagBox.__html = tags; }
  tagBox.classList.toggle('has-items', draft.tags.length > 0);
  // checklist
  const cl = body.querySelector('.card-checklist');
  cl.classList.toggle('has-items', draft.checklist.length > 0);
  const want = draft.checklist.map(c => c.id).join(',');
  if (cl.__ids !== want) {
    cl.innerHTML = draft.checklist.map(c => `<div class="cl-item" data-cid="${esc(c.id)}"><span class="cl-check"></span><input class="cl-input" value="${esc(c.title)}" autocomplete="off" spellcheck="false" aria-label="Checklist item"><span class="cl-handle">${icon('handle')}</span></div>`).join('');
    cl.__ids = want;
  }
  // actions
  const acts = [];
  if (!w) acts.push(`<button class="card-act" type="button" data-act="when" title="When" aria-label="When">${icon(ctx.layout === 'phone' ? 'act-when-phone' : 'act-when')}</button>`);
  if (!draft.tags.length) acts.push(`<button class="card-act" type="button" data-act="tags" title="Tags" aria-label="Tags">${icon('act-tags')}</button>`);
  if (!draft.checklist.length) acts.push(`<button class="card-act" type="button" data-act="checklist" title="Checklist" aria-label="Checklist">${icon(ctx.layout === 'phone' ? 'act-checklist-phone' : 'act-checklist')}</button>`);
  if (!draft.deadline) acts.push(`<button class="card-act" type="button" data-act="deadline" title="Deadline" aria-label="Deadline">${icon('act-deadline')}</button>`);
  const actBox = body.querySelector('.card-actions');
  const html = acts.join('');
  if (actBox.__html !== html) { actBox.innerHTML = html; actBox.__html = html; }
}

/** Re-place the insertion bars after anything that moves the fields (open, close, layout). */
function syncCarets() { for (const s of carets) s(false); }

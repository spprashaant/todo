// Repeat controls (piece: repeat-picker): the Repeats section of the When picker and its list of
// repeat kinds. Asana's model: a "Repeats [kind]" row, then the fields for that kind (weekdays,
// monthly day or nth weekday, the interval after completion), turned on and off from the picker.
// Hooks (CONTRACT "Repeating to-dos"): [data-action="repeat"], [data-action="repeat-type"],
// data-shot="repeat" (the section), data-shot="repeat-kinds" (the open list of kinds).
// Rule wording and date math come from recur.js; the rule is saved with updateTodo(id, { repeat }), or
// handed to a draft's owner for a to-do not added yet.
import { getTodo, updateTodo, refresh, subscribe } from './store.js';
import { normRepeat, nextDate, nextOccurrence, aimedDay, phaseOf } from './recur.js';
import { isDate, iso, parseISO, todayISO, addMonths, DAYS, DAYS_SHORT, MONTHS_SHORT } from './dates.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Dark-surface glyphs, drawn to sit with the When picker's own set.
const svgI = (vb, body, cls = '') => `<svg class="ico ${cls}" viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;
export const REPEAT_GLYPH = (cls = '') => svgI('0 0 24 24',
  `<path d="M3.6 11.2V9.8a3.7 3.7 0 0 1 3.7-3.7h12M16.2 2.9l3.2 3.2-3.2 3.2M20.4 12.8v1.4a3.7 3.7 0 0 1-3.7 3.7h-12M7.8 21.1l-3.2-3.2 3.2-3.2" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>`, `rp-glyph ${cls}`);
const CHEV = () => svgI('0 0 10 6', `<path d="M1.2 1.1 5 4.8l3.8-3.7" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/>`, 'rp-chev');
const CHECK = () => svgI('0 0 12 10', `<path d="M1.3 5.3 4.4 8.4 10.7 1.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`, 'rp-check');
const CROSS = () => svgI('0 0 10 10', `<path d="M1.2 1.2l7.6 7.6M8.8 1.2l-7.6 7.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>`, 'rp-x');

// ---------- the kinds ----------
// Daily..Yearly and Custom repeat on a calendar; After Completion counts from the day it's checked off.
export const KINDS = [
  { k: 'daily', label: 'Daily' },
  { k: 'weekly', label: 'Weekly' },
  { k: 'monthly', label: 'Monthly' },
  { k: 'yearly', label: 'Yearly' },
  { k: 'custom', label: 'Custom' },
  { sep: true },
  { k: 'after', label: 'After Completion' },
];
const KIND_LABEL = Object.fromEntries(KINDS.filter(x => x.k).map(x => [x.k, x.label]));
const UNIT_OF = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' };

/** The kind a rule reads as: every 1 day/week/month/year is Daily..Yearly, other intervals are Custom. */
export function kindOf(rule) {
  const r = normRepeat(rule);
  if (!r) return null;
  if (r.mode === 'completion') return 'after';
  if (r.every > 1) return 'custom';
  return { day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly' }[r.unit];
}

/** The rule a kind starts from, keeping whatever of the previous rule still applies. */
function ruleFor(kind, prev) {
  const p = normRepeat(prev);
  const keep = p?.ends ? { ends: p.ends } : {};
  const same = unit => p && p.mode === 'schedule' && p.unit === unit;
  const extras = unit => ({
    ...(unit === 'week' && same('week') && p.weekdays ? { weekdays: p.weekdays } : {}),
    ...(unit === 'month' && same('month') && p.monthly ? { monthly: p.monthly } : {}),
  });
  if (kind === 'after') return { mode: 'completion', every: p?.every || 1, unit: p?.unit || 'week', ...keep };
  if (kind === 'custom') {
    const unit = p?.unit || 'week';
    return { mode: 'schedule', every: p && p.every > 1 ? p.every : 2, unit, ...extras(unit), ...keep };
  }
  const unit = UNIT_OF[kind] || 'week';
  return { mode: 'schedule', every: 1, unit, ...extras(unit), ...keep };
}

// ---------- wording ----------
const UNIT_WORD = n => ({ day: n === 1 ? 'day' : 'days', week: n === 1 ? 'week' : 'weeks', month: n === 1 ? 'month' : 'months', year: n === 1 ? 'year' : 'years' });
const NTH_LABEL = { 1: 'First', 2: 'Second', 3: 'Third', 4: 'Fourth', '-1': 'Last' };
const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
// Day 31 clamps to every month's end (CONTRACT), so it reads as the last day.
const dayLabel = d => d >= 31 ? 'Last day' : ord(d);
const fmtLong = v => { const d = parseISO(v); const s = `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`; return d.getFullYear() === new Date().getFullYear() ? s : `${s}, ${d.getFullYear()}`; };
const fmtDay = v => { const d = parseISO(v); const s = `${DAYS_SHORT[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`; return d.getFullYear() === new Date().getFullYear() ? s : `${s}, ${d.getFullYear()}`; };

/**
 * controller({ id, draft, getWhen, onLayout, onToggle, onGone, onSave }): the Repeats section for to-do `id`,
 * or for `draft` ({ get(), set(rule) }), the rule of a to-do not added yet (the composer's), kept by its caller.
 *   getWhen()   the picker's current When value (the rule's anchor date comes from it)
 *   onLayout()  the section changed size (the picker re-places itself)
 *   onToggle()  repeating was turned on or off (the picker re-renders its footer)
 *   onGone()    the to-do was deleted (in another tab): there is nothing left to edit
 *   onSave()    a change made here was saved (the phone sheet's Cancel becomes Done: nothing is undone)
 * The section shows the stored rule and follows it when it changes elsewhere (another tab, or sync).
 * Every change starts from the rule stored now and changes only what was pressed, so a section left
 * open never writes its older copy of the rule over a change made since, and never brings back a rule
 * that was stopped elsewhere.
 */
export function controller({ id, draft, getWhen, onLayout, onToggle, onGone, onSave }) {
  // where the rule lives: a stored to-do (followed across tabs), or a draft only its caller holds
  const src = draft
    ? { get: () => ({ repeat: draft.get() }), set: r => draft.set(r), refresh() {}, subscribe: () => () => {} }
    : { get: () => getTodo(id), set: r => updateTodo(id, { repeat: r }), refresh, subscribe };
  let rule = normRepeat(src.get()?.repeat);
  let kind = kindOf(rule);
  let kindsOpen = false; // the list of kinds, shown in place of the fields
  let byKeyboard = false; // the last press came from the keyboard (focus follows it)
  const el = document.createElement('section');
  el.className = 'rp';
  el.dataset.shot = 'repeat';
  el.setAttribute('aria-label', 'Repeat');

  const anchorISO = () => { const w = getWhen(); return isDate(w) ? w : todayISO(); };
  const anchor = () => parseISO(anchorISO());
  // The day of the month the date stands for under `r`: a clamped Apr 30 occurrence of a monthly series on
  // the 31st stands for the 31st (its anchorDay). Only the stored rule's phase has that anchor: a rule this
  // would switch to takes its day from the date (store.setRepeat drops anchorDay then).
  const aimed = r => {
    const t = src.get();
    return aimedDay(r, anchorISO(), t && rule && phaseOf(r) === phaseOf(rule) ? t.anchorDay : null) ?? anchor().getDate();
  };

  /** Store the rule shown. Every change made in the section commits as it's made, like a reminder does. */
  function commit() { src.set(rule); onSave?.(); }

  // `rule` is the rule as stored the last time this section looked; save() is only ever handed a rule
  // made from it just after catchUp(), so it changes only the field that was pressed or typed.
  function save(next, { quiet = false } = {}) {
    const was = !!rule;
    rule = normRepeat(next);
    if (!rule) kind = null;
    else if (!fits(kind, rule)) kind = kindOf(rule);
    commit();
    if (was !== !!rule) { render(); onToggle?.(byKeyboard); return; }
    if (quiet) patch(); else render();
  }

  // ----- following the stored rule -----
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // the kind shown still reads the rule (Custom stays Custom while its interval is typed down to 1)
  const fits = (k, r) => !!k && !!r && (k === kindOf(r) || (k === 'custom' && r.mode === 'schedule'));
  /** Show the stored rule when it differs from the one shown (changed, stopped or started elsewhere). */
  function sync() {
    const t = src.get();
    if (!t) { closeMenu(); onGone?.(); return; }
    const stored = normRepeat(t.repeat);
    if (same(stored, rule)) return;
    const was = !!rule;
    rule = stored;
    closeMenu(); // its choices were for the old rule
    if (!rule) { kind = null; kindsOpen = false; document.removeEventListener('keydown', onListKey, true); }
    else if (!fits(kind, rule)) kind = kindOf(rule);
    render();
    if (was !== !!rule) onToggle?.(false);
  }
  /** Before any change: catch up with storage now (another tab's write may not have arrived yet). */
  function catchUp() { src.refresh(); sync(); return !!rule && !!src.get(); }
  /** One change to the rule as stored now: `fn(rule)` returns the new rule, or undefined for none. */
  function edit(fn, opts) {
    if (!catchUp()) return false;
    const next = fn(rule);
    if (next === undefined) return false;
    save(next, opts);
    return true;
  }
  const unsubscribe = src.subscribe(sync);

  // ----- markup -----
  const pop = (key, label, { cls = '', attrs = '', dim = false } = {}) =>
    `<button class="rp-pop${cls ? ' ' + cls : ''}${dim ? ' dim' : ''}" type="button" data-rp="${key}" aria-haspopup="menu" aria-expanded="false" ${attrs}>` +
    `<span class="rp-val">${esc(label)}</span>${CHEV()}</button>`;
  const num = (key, value, label) =>
    `<input class="rp-num" data-rp="${key}" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" autocomplete="off" value="${value}" aria-label="${label}">`;
  const row = (label, body, cls = '') => `<div class="rp-row${cls ? ' ' + cls : ''}"><span class="rp-label">${label}</span><span class="rp-ctl">${body}</span></div>`;

  function weekdaysHTML() {
    const on = rule.weekdays || [anchor().getDay()];
    return `<div class="rp-days" role="group" aria-label="On these days">` +
      DAYS_SHORT.map((d, i) => `<button class="rp-day${on.includes(i) ? ' on' : ''}" type="button" data-rp="wd" data-d="${i}" aria-pressed="${on.includes(i)}" aria-label="${DAYS[i]}">${d}</button>`).join('') +
      `</div>`;
  }

  // Monthly: "On the [Last] [Friday]" or "On the [29th]" day; the unchosen one shows the date's own values.
  function monthlyVals(r = rule) {
    const a = anchor(), d = a.getDate();
    const n = Math.ceil(d / 7);
    const m = r.monthly || {};
    const byNth = m.nth != null;
    return {
      byNth,
      nth: byNth ? m.nth : (n > 4 ? -1 : n),
      weekday: byNth ? m.weekday : a.getDay(),
      day: !byNth && m.day ? m.day : aimed(r),
    };
  }
  function monthlyHTML() {
    const v = monthlyVals();
    const radio = (key, on, label) =>
      `<button class="rp-radio${on ? ' on' : ''}" type="button" role="radio" aria-checked="${on}" data-rp="${key}"><span class="rp-dot"></span><span class="rp-label">${label}</span></button>`;
    return `<div class="rp-month" role="radiogroup" aria-label="Day of the month">` +
      `<div class="rp-row rp-mrow">${radio('by-nth', v.byNth, 'On the')}<span class="rp-ctl">` +
        pop('nth', NTH_LABEL[v.nth], { dim: !v.byNth, attrs: 'aria-label="Which week"' }) +
        pop('weekday', DAYS[v.weekday], { dim: !v.byNth, attrs: 'aria-label="Weekday"' }) + `</span></div>` +
      `<div class="rp-row rp-mrow">${radio('by-day', !v.byNth, 'On day')}<span class="rp-ctl">` +
        pop('day', dayLabel(v.day), { dim: v.byNth, attrs: 'aria-label="Day of the month"' }) + `</span></div>` +
      `</div>`;
  }

  function intervalHTML() {
    const u = UNIT_WORD(rule.every)[rule.unit];
    return row('Every', num('every', rule.every, 'Interval') + pop('unit', u, { cls: 'rp-unit', attrs: 'aria-label="Unit"' }));
  }

  function endsHTML() {
    const e = rule.ends;
    const which = e?.after ? 'After' : e?.on ? 'On' : 'Never';
    let extra = '';
    if (e?.after) extra = num('count', e.after, 'Number of times') + `<span class="rp-word" data-rp-times>${e.after === 1 ? 'time' : 'times'}</span>`;
    else if (e?.on) {
      // the date reads as text; the native date picker (hidden under it) does the choosing
      extra = `<span class="rp-datewrap"><button class="rp-well" type="button" data-rp="ends-date" aria-label="Last date: ${esc(fmtLong(e.on))}">${esc(fmtLong(e.on))}</button>` +
        `<input class="rp-date" data-rp="ends-on" type="date" value="${e.on}" min="${anchorISO()}" tabindex="-1" aria-hidden="true" required></span>`;
    }
    return row('Ends', pop('ends', which, { attrs: 'aria-label="Ends"' }) + extra, 'rp-ends');
  }

  // Each kind in the list says what it would do for this to-do ("Fridays", "The 29th", "7 days").
  function kindDetail(k) {
    const r = normRepeat(ruleFor(k, rule));
    const a = anchor();
    const units = n => `${n} ${UNIT_WORD(n)[r.unit]}`;
    switch (k) {
      case 'daily': return 'Every day';
      case 'weekly': {
        const d = r.weekdays || [a.getDay()];
        if (d.length === 1) return `${DAYS[d[0]]}s`;
        if (d.join() === '1,2,3,4,5') return 'Weekdays';
        return d.length > 3 ? `${d.length} days a week` : d.map(i => DAYS_SHORT[i]).join(', ');
      }
      case 'monthly': {
        const m = r.monthly;
        if (m?.nth) return `${NTH_LABEL[m.nth]} ${DAYS[m.weekday]}`;
        const day = m?.day || aimed(r);
        return day >= 31 ? 'Last day' : `The ${ord(day)}`;
      }
      case 'yearly': return `${MONTHS_SHORT[a.getMonth()]} ${aimed(r)}`;
      case 'custom': return `Every ${units(r.every)}`;
      case 'after': return units(r.every);
    }
    return '';
  }
  function kindsHTML() {
    return `<div class="rp-kinds" role="listbox" aria-label="Repeat" data-shot="repeat-kinds">` +
      KINDS.map(x => x.sep ? `<div class="rp-ksep" role="separator"></div>` :
        `<button class="rp-kopt${x.k === kind ? ' current' : ''}" type="button" role="option" aria-selected="${x.k === kind}" data-rp="pick" data-k="${x.k}">` +
        `<span class="rp-ico">${x.k === kind ? CHECK() : ''}</span><span class="rp-klabel">${esc(x.label)}</span>` +
        `<span class="rp-kdetail">${esc(kindDetail(x.k))}</span></button>`).join('') +
      `</div>`;
  }

  function noteText() {
    const t = src.get();
    const next = nextDate(rule, getWhen(), todayISO(), t?.occurrence || 1, t?.anchorDay);
    if (!next) return 'This is the last one';
    return rule.mode === 'completion' ? `Done today? Next: <b>${fmtDay(next)}</b>` : `Next: <b>${fmtDay(next)}</b>`;
  }

  function render() {
    if (!rule) { el.innerHTML = ''; return; }
    const act = el.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = act?.dataset.rp ? `[data-rp="${act.dataset.rp}"]${act.dataset.d ? `[data-d="${act.dataset.d}"]` : ''}${act.dataset.k ? `[data-k="${act.dataset.k}"]` : ''}` : null;
    const sel = act && 'selectionStart' in act ? [act.selectionStart, act.selectionEnd] : null;
    // A number being typed stays as typed: one cleared (or 0) to retype isn't a number yet, so it was never
    // saved, and redrawing (another control used meanwhile, a change made elsewhere) must not put the old
    // number back under the caret, where the next digit would join it (2 cleared, then 3 typed: 32).
    const typing = act?.classList.contains('rp-num') ? { key: act.dataset.rp, text: act.value } : null;
    let fields = '';
    if (kind === 'after') fields = intervalHTML();
    else if (kind === 'custom') fields = intervalHTML() + (rule.unit === 'week' ? weekdaysHTML() : rule.unit === 'month' ? monthlyHTML() : '');
    else if (kind === 'weekly') fields = weekdaysHTML();
    else if (kind === 'monthly') fields = monthlyHTML();
    el.dataset.kind = kind;
    el.classList.toggle('choosing', kindsOpen);
    el.innerHTML =
      `<div class="rp-row rp-head"><span class="rp-ico">${REPEAT_GLYPH()}</span><span class="rp-label">Repeat</span>` +
        `<span class="rp-ctl">${pop('kind', KIND_LABEL[kind], { cls: 'rp-kind', attrs: `data-action="repeat-type" aria-label="Repeat: ${esc(KIND_LABEL[kind])}"` })}</span></div>` +
      (kindsOpen ? kindsHTML() :
        `<div class="rp-fields">${fields}${endsHTML()}</div>` +
        `<p class="rp-note" aria-live="polite">${noteText()}</p>` +
        `<button class="rp-off" type="button" data-rp="off"><span class="rp-ico">${CROSS()}</span><span class="rp-label">Stop Repeating</span></button>`);
    const kb = el.querySelector('[data-rp="kind"]');
    kb.setAttribute('aria-haspopup', 'listbox');
    if (kindsOpen) kb.setAttribute('aria-expanded', 'true');
    if (act) {
      const f = focusKey && el.querySelector(focusKey);
      if (f) {
        if (typing && f.dataset.rp === typing.key) {
          const n = parseInt(typing.text, 10), saved = typing.key === 'every' ? rule.every : rule.ends?.after;
          if (!(n >= 1) || n === saved) f.value = typing.text;
        }
        f.focus({ preventScroll: true });
        if (sel && typeof f.setSelectionRange === 'function') try { f.setSelectionRange(sel[0], sel[1]); } catch { /* date inputs */ }
      } else {
        // the focused control went with the change (a count when Ends turns Never): focus stays in the
        // section, on its kind, so Escape and Tab still work
        el.querySelector('[data-rp="kind"]')?.focus({ preventScroll: true });
      }
    }
    onLayout?.();
  }

  // While a number is being typed, only the words that depend on it change.
  function patch() {
    const u = el.querySelector('[data-rp="unit"] .rp-val');
    if (u) u.textContent = UNIT_WORD(rule.every)[rule.unit];
    const times = el.querySelector('[data-rp-times]');
    if (times && rule.ends?.after) times.textContent = rule.ends.after === 1 ? 'time' : 'times';
    const note = el.querySelector('.rp-note');
    if (note) note.innerHTML = noteText();
  }

  // ----- menus -----
  // Opened from the keyboard, focus goes to the current kind; opened with the pointer, focus stays
  // where it was (the picker's search field) and the list still takes the arrows and Escape.
  function setKindsOpen(open, { keyboard = false } = {}) {
    closeMenu();
    const hadFocus = el.contains(document.activeElement);
    kindsOpen = open;
    render();
    document.removeEventListener('keydown', onListKey, true);
    if (open) {
      document.addEventListener('keydown', onListKey, true);
      if (keyboard) el.querySelector('.rp-kopt.current')?.focus({ preventScroll: true });
      // in a scrolling sheet (or a popover on a window too short for it), bring the whole list into view
      const box = el.closest('.when-panel');
      if (el.closest('.sheet') || (box && box.scrollHeight > box.clientHeight + 1)) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else if (hadFocus || keyboard) el.querySelector('[data-rp="kind"]')?.focus({ preventScroll: true });
  }
  function onListKey(e) {
    if (!kindsOpen || !el.isConnected) return;
    const all = [...el.querySelectorAll('.rp-kopt')];
    const at = all.indexOf(document.activeElement);
    const go = i => { e.preventDefault(); e.stopPropagation(); all[Math.max(0, Math.min(all.length - 1, i))]?.focus({ preventScroll: true }); };
    switch (e.key) {
      case 'Escape': e.preventDefault(); e.stopPropagation(); setKindsOpen(false, { keyboard: at >= 0 }); break;
      case 'ArrowDown': go(at < 0 ? all.findIndex(b => b.classList.contains('current')) : at + 1); break;
      case 'ArrowUp': go(at < 0 ? all.findIndex(b => b.classList.contains('current')) : at - 1); break;
      case 'Home': if (at >= 0) go(0); break;
      case 'End': if (at >= 0) go(all.length - 1); break;
      case 'Enter': if (at < 0) { e.preventDefault(); e.stopPropagation(); setKindsOpen(false); } break;
    }
  }
  function unitMenu(b) {
    const words = UNIT_WORD(rule.every);
    openMenu(b, ['day', 'week', 'month', 'year'].map(u => ({ v: u, label: words[u], checked: u === rule.unit })), u => edit(r => {
      if (u === r.unit) return;
      const next = { ...r, unit: u };
      delete next.weekdays; delete next.monthly;
      return next;
    }), { label: 'Unit' });
  }
  function nthMenu(b) {
    const v = monthlyVals();
    openMenu(b, [1, 2, 3, 4, -1].map(n => ({ v: n, label: NTH_LABEL[n], checked: v.byNth && n === v.nth })), n => {
      edit(r => ({ ...r, monthly: { nth: n, weekday: monthlyVals(r).weekday } }));
    }, { label: 'Which week' });
  }
  function weekdayMenu(b) {
    const v = monthlyVals();
    openMenu(b, DAYS.map((d, i) => ({ v: i, label: d, checked: v.byNth && i === v.weekday })), i => {
      edit(r => ({ ...r, monthly: { nth: monthlyVals(r).nth, weekday: i } }));
    }, { label: 'Weekday' });
  }
  function dayMenu(b) {
    const v = monthlyVals();
    const items = [];
    for (let d = 1; d <= 30; d++) items.push({ v: d, label: String(d), checked: !v.byNth && d === v.day, aria: ord(d) });
    items.push({ v: 31, label: 'Last', checked: !v.byNth && v.day >= 31, aria: 'Last day of the month', cls: 'wide' });
    openMenu(b, items, d => edit(r => ({ ...r, monthly: { day: d } })), { grid: 7, label: 'Day of the month' });
  }
  function endsMenu(b) {
    const e = rule.ends;
    const cur = e?.after ? 'after' : e?.on ? 'on' : 'never';
    openMenu(b, [
      { v: 'never', label: 'Never', checked: cur === 'never' },
      { v: 'after', label: 'After a Number of Times', checked: cur === 'after' },
      { v: 'on', label: 'On a Date', checked: cur === 'on' },
    ], v => {
      const changed = edit(r => {
        if (v === (r.ends?.after ? 'after' : r.ends?.on ? 'on' : 'never')) return;
        const next = { ...r };
        if (v === 'never') delete next.ends;
        else if (v === 'after') next.ends = { after: 10 };
        else next.ends = { on: iso(addMonths(anchor(), 3)) };
        return next;
      });
      if (!changed) return;
      const f = el.querySelector(v === 'after' ? '[data-rp="count"]' : v === 'on' ? '[data-rp="ends-on"]' : null);
      if (f && v === 'after') { f.focus({ preventScroll: true }); f.select(); }
      if (f && v === 'on') try { f.showPicker(); } catch { /* the date still reads and can be changed from its button */ }
    }, { label: 'Ends' });
  }

  // ----- events -----
  el.addEventListener('mousedown', e => {
    // keep the picker's own focus (its search field) unless a field is being clicked into
    if (!e.target.closest('input')) e.preventDefault();
  });
  el.addEventListener('click', e => {
    const hit = e.target.closest('button[data-rp]');
    if (!hit || !rule) return;
    const k = hit.dataset.rp;
    byKeyboard = e.detail === 0;
    // catch up first: a change made elsewhere redraws the section, and a control it took away does nothing
    const key = `[data-rp="${k}"]${hit.dataset.d ? `[data-d="${hit.dataset.d}"]` : ''}${hit.dataset.k ? `[data-k="${hit.dataset.k}"]` : ''}`;
    if (!catchUp()) return;
    const b = hit.isConnected ? hit : el.querySelector(key);
    if (!b) return;
    const reopen = key => el.querySelector(`[data-rp="${key}"]`) || b;
    switch (k) {
      case 'kind': setKindsOpen(!kindsOpen, { keyboard: e.detail === 0 }); break;
      case 'pick': {
        const k = b.dataset.k;
        const keyboard = e.detail === 0;
        if (k !== kind) { kind = k; rule = normRepeat(ruleFor(k, rule)); commit(); }
        setKindsOpen(false, { keyboard });
        break;
      }
      case 'unit': unitMenu(b); break;
      case 'ends': endsMenu(b); break;
      case 'off': save(null); break;
      case 'ends-date': {
        const f = el.querySelector('[data-rp="ends-on"]');
        if (!f) break;
        try { f.showPicker(); } catch { f.focus(); f.click(); }
        break;
      }
      case 'wd': {
        const d = Number(b.dataset.d);
        const on = new Set(rule.weekdays || [anchor().getDay()]);
        if (on.has(d)) { if (on.size === 1) return; on.delete(d); } else on.add(d);
        save({ ...rule, weekdays: [...on].sort((x, y) => x - y) });
        break;
      }
      case 'by-nth': case 'by-day': {
        const v = monthlyVals();
        if ((k === 'by-nth') === v.byNth) return;
        save({ ...rule, monthly: k === 'by-nth' ? { nth: v.nth, weekday: v.weekday } : { day: v.day } });
        break;
      }
      case 'nth': case 'weekday': case 'day': {
        // a greyed-out control picks its option first, then offers its choices
        const v = monthlyVals();
        const wantNth = k !== 'day';
        if (wantNth !== v.byNth) save({ ...rule, monthly: wantNth ? { nth: v.nth, weekday: v.weekday } : { day: v.day } });
        const a = reopen(k);
        if (k === 'nth') nthMenu(a); else if (k === 'weekday') weekdayMenu(a); else dayMenu(a);
        break;
      }
    }
  });

  // number fields: digits only, arrows step, blank or 0 snaps back on leaving
  const clampNum = (v, hi) => Math.max(1, Math.min(hi, v));
  /** Save a typed number into the stored rule. The field shows it even when a change made elsewhere redrew it. */
  function setNum(f, n, text = String(n)) {
    const key = f.dataset.rp;
    if (!catchUp()) return;
    const g = el.querySelector(`[data-rp="${key}"]`);
    if (!g) return; // the field went with a change made elsewhere
    if (g.value !== text) g.value = text;
    if (key === 'every') save({ ...rule, every: n }, { quiet: true });
    else if (key === 'count') save({ ...rule, ends: { after: n } }, { quiet: true });
  }
  /** The field shows the saved number again (blank or 0 isn't one). */
  function snapNum(f) {
    if (!rule) return;
    const cur = f.dataset.rp === 'every' ? rule.every : rule.ends?.after;
    if (String(cur) !== f.value) f.value = cur ?? '';
  }
  el.addEventListener('input', e => {
    const f = e.target.closest('.rp-num');
    if (!f) return;
    const digits = f.value.replace(/\D/g, '').slice(0, 3);
    if (digits !== f.value) f.value = digits;
    const n = parseInt(digits, 10);
    if (n >= 1) setNum(f, n, digits);
  });
  el.addEventListener('keydown', e => {
    if (!kindsOpen && e.target.closest('[data-rp="kind"]') && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setKindsOpen(true, { keyboard: true }); return; }
    const f = e.target.closest('.rp-num');
    if (f && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const hi = f.dataset.rp === 'count' ? 999 : 999;
      const n = clampNum((parseInt(f.value, 10) || 0) + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1), hi);
      f.value = n;
      setNum(f, n);
      return;
    }
    // Enter commits (the number is saved as it's typed): the field shows the saved number, selected, and
    // keeps focus, so Escape still closes the picker and Tab moves on
    if (f && e.key === 'Enter') { e.preventDefault(); snapNum(f); f.select(); }
  });
  el.addEventListener('focusout', e => {
    const f = e.target.closest('.rp-num');
    if (f) snapNum(f);
  });
  el.addEventListener('change', e => {
    const f = e.target.closest('.rp-date');
    if (!f || !isDate(f.value)) return;
    const on = f.value;
    // (only while Ends is still On a Date: a change made elsewhere may have taken the date away)
    edit(r => r.ends?.on ? { ...r, ends: { on } } : undefined);
  });

  function turnOn(keyboard = false) {
    byKeyboard = keyboard;
    src.refresh();
    sync();
    if (rule || !src.get()) return; // turned on (the section shows it now) or deleted elsewhere
    kind = 'weekly';
    save(ruleFor('weekly', null));
  }

  /** The footer button that turns repeating on (none while it's on). */
  function buttonHTML() {
    if (rule) return '';
    return `<button class="when-opt when-rep" type="button" data-kind="repeat" data-action="repeat" aria-label="Repeat" title="Set to repeat">` +
      `<span class="wo-icon">${REPEAT_GLYPH()}</span><span class="wo-label">Repeat</span></button>`;
  }

  render();
  return {
    el,
    get on() { return !!rule; },
    buttonHTML,
    turnOn,
    render,
    focus() { el.querySelector('[data-rp="kind"]')?.focus({ preventScroll: true }); },
    /**
     * The coming occurrences up to `until` ("YYYY-MM-DD"), for the calendar to preview: the dates a
     * schedule falls on after this one, or the date the next one would get if this one is done today.
     * Each step is what completing the one before on its own day creates (recur.nextOccurrence), carrying
     * its anchorDay on, so the rings are the dates the series really falls on (Mar 31 monthly: Apr 30,
     * May 31, Jun 30 ...). `max` bounds the work for a page far ahead.
     */
    upcoming(until, max = 4000) {
      if (!rule || !isDate(until)) return [];
      const t = src.get();
      let occ = t?.occurrence || 1;
      let n = nextOccurrence(rule, getWhen(), todayISO(), occ, t?.anchorDay);
      if (rule.mode === 'completion') return n && n.when <= until ? [n.when] : [];
      const out = [];
      while (n && n.when <= until && out.length < max) { out.push(n.when); occ++; n = nextOccurrence(rule, n.when, n.when, occ, n.anchorDay); }
      return out;
    },
    destroy() { unsubscribe(); closeMenu(); kindsOpen = false; document.removeEventListener('keydown', onListKey, true); },
  };
}

// ---------- a small dark menu (the list of kinds, units, weekdays, ...) ----------
let menuClose = null;
export function closeMenu() { if (menuClose) { const f = menuClose; menuClose = null; f(); } }
export const menuIsOpen = () => !!menuClose;

/**
 * Opens a list over `anchor`, macOS pop-up style: the checked item sits on the button, so the
 * current choice stays under the pointer. items: [{ v, label, checked, aria?, cls? } | { sep: true }].
 * { grid: n } lays the items out n to a row (days of the month) and drops the grid below the button.
 */
function openMenu(anchor, items, onPick, { shot = '', grid = 0, label = '' } = {}) {
  closeMenu();
  const layer = document.getElementById('layer');
  const phone = matchMedia('(max-width: 699px)').matches;
  const scrim = document.createElement('div');
  scrim.className = 'rp-menu-scrim';
  const m = document.createElement('div');
  m.className = 'rp-menu' + (grid ? ' grid' : '') + (phone ? ' phone' : '');
  m.setAttribute('role', 'menu');
  if (label) m.setAttribute('aria-label', label);
  if (shot) m.dataset.shot = shot;
  if (grid) m.style.setProperty('--cols', grid);
  m.innerHTML = items.map((it, i) => it.sep
    ? `<div class="rp-msep" role="separator"></div>`
    : `<button class="rp-mi${it.cls ? ' ' + it.cls : ''}${it.checked ? ' checked' : ''}" type="button" role="menuitemradio" aria-checked="${!!it.checked}" data-i="${i}"${it.aria ? ` aria-label="${esc(it.aria)}"` : ''}>` +
      (grid ? '' : `<span class="rp-mck">${it.checked ? CHECK() : ''}</span>`) + `<span class="rp-mt">${esc(it.label)}</span></button>`).join('');
  layer.append(scrim, m);
  anchor.setAttribute('aria-expanded', 'true');

  // place it
  const r = anchor.getBoundingClientRect();
  const mr = m.getBoundingClientRect();
  const btns = [...m.querySelectorAll('.rp-mi')];
  const cur = btns.find(b => b.classList.contains('checked')) || btns[0];
  let x, y;
  if (grid) {
    x = r.right - mr.width + 6;
    y = r.bottom + 4;
    if (y + mr.height > innerHeight - 4) y = r.top - mr.height - 4;
  } else {
    const cr = cur.getBoundingClientRect(), tr = cur.querySelector('.rp-mt').getBoundingClientRect();
    const vr = (anchor.querySelector('.rp-val') || anchor).getBoundingClientRect();
    x = vr.left - (tr.left - mr.left);
    y = r.top + r.height / 2 - (cr.top - mr.top + cr.height / 2);
  }
  x = Math.max(4, Math.min(x, innerWidth - mr.width - 4));
  y = Math.max(4, Math.min(y, innerHeight - mr.height - 4));
  m.style.left = Math.round(x) + 'px';
  m.style.top = Math.round(y) + 'px';

  let active = btns.indexOf(cur);
  const mark = () => btns.forEach((b, i) => b.classList.toggle('active', i === active));
  const focusActive = () => { mark(); btns[active]?.focus({ preventScroll: true }); };
  const hadFocus = document.activeElement;
  const keyboard = hadFocus === anchor;
  if (keyboard) focusActive(); else mark();

  const done = (refocus) => {
    scrim.remove(); m.remove();
    document.removeEventListener('keydown', onKey, true);
    anchor.setAttribute('aria-expanded', 'false');
    if (refocus && anchor.isConnected) anchor.focus({ preventScroll: true });
    else if (hadFocus && hadFocus.isConnected && hadFocus !== anchor) hadFocus.focus({ preventScroll: true });
  };
  menuClose = () => done(false);
  const pick = i => { const it = items[Number(btns[i].dataset.i)]; const wasKey = document.activeElement && m.contains(document.activeElement); menuClose = null; done(wasKey); onPick(it.v); };

  const onKey = e => {
    const n = btns.length;
    const step = d => { e.preventDefault(); e.stopPropagation(); active = (active + d + n) % n; focusActive(); };
    switch (e.key) {
      case 'Escape': e.preventDefault(); e.stopPropagation(); menuClose = null; done(true); break;
      case 'Tab': menuClose = null; done(true); e.preventDefault(); e.stopPropagation(); break;
      case 'ArrowDown': step(grid ? grid : 1); break;
      case 'ArrowUp': step(grid ? -grid : -1); break;
      case 'ArrowRight': if (grid) step(1); break;
      case 'ArrowLeft': if (grid) step(-1); break;
      case 'Home': e.preventDefault(); e.stopPropagation(); active = 0; focusActive(); break;
      case 'End': e.preventDefault(); e.stopPropagation(); active = n - 1; focusActive(); break;
      case 'Enter': case ' ': e.preventDefault(); e.stopPropagation(); if (active >= 0) pick(active); break;
      default: {
        // type-ahead: jump to the first item starting with the letter
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
          const i = btns.findIndex(b => b.textContent.trim().toLowerCase().startsWith(e.key.toLowerCase()));
          if (i >= 0) { e.preventDefault(); e.stopPropagation(); active = i; focusActive(); }
        }
      }
    }
  };
  document.addEventListener('keydown', onKey, true);
  scrim.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); closeMenu(); });
  m.addEventListener('mousedown', e => e.preventDefault());
  m.addEventListener('mousemove', e => {
    const b = e.target.closest('.rp-mi');
    const i = btns.indexOf(b);
    if (b && i !== active) { active = i; mark(); }
  });
  m.addEventListener('click', e => {
    const b = e.target.closest('.rp-mi');
    if (b) pick(btns.indexOf(b));
  });
  return m;
}

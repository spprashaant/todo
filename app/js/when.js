// The When picker (piece: when). A dark popover on desktop, a sheet on phone.
// Today, This Evening, a calendar grid, Someday, and typed natural-language suggestions
// ("in 3" -> in 3 days / weeks / months, "fri", "tom", "jun 8", ...).
import { parseWhen, calendarWeeks, startOfToday, iso, addDays, DAYS_SHORT, MONTHS_SHORT, todayISO, isDate } from './dates.js';
import * as repeat from './repeat.js';
import { getTodo, subscribe, refresh } from './store.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let cur = null;

export function isOpen() { return !!cur; }
export function close() { if (cur) { const c = cur; cur = null; c.cleanup(); } }

// The picker is always dark, so it draws its own dark-surface glyphs (Things' popover set):
// an outlined calendar with a see-through body, a paler crescent, a textured Someday box.
const svgI = (vb, body, cls = '') => `<svg class="ico ${cls}" viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;
const f2 = n => +n.toFixed(2);
function starPath(cx = 12, cy = 12.6, R = 10.4, r = 4.75) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r : R;
    pts.push(`${f2(cx + rad * Math.cos(a))} ${f2(cy + rad * Math.sin(a))}`);
  }
  return `M${pts.join(' L')}Z`;
}
/** Crescent = disc (x1,y1,r1) minus disc (x2,y2,r2). */
function crescentPath(x1, y1, r1, x2, y2, r2) {
  const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy);
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d), h = Math.sqrt(r1 * r1 - a * a);
  const mx = x1 + a * dx / d, my = y1 + a * dy / d;
  const p = [mx + h * dy / d, my - h * dx / d], q = [mx - h * dy / d, my + h * dx / d];
  return `M${f2(p[0])} ${f2(p[1])}A${r1} ${r1} 0 1 0 ${f2(q[0])} ${f2(q[1])}A${r2} ${r2} 0 0 1 ${f2(p[0])} ${f2(p[1])}Z`;
}
const STAR = starPath();
// Fitted to Things' crescent: a wide bite that leaves both horns long, sitting a unit above centre
// so it rides level with the cap height beside its label, as the star does.
const MOON = crescentPath(12.14, 10.83, 9.69, 16.16, 7, 8.38);
const dots = (xs, ys, w = .9) => xs.flatMap(x => ys.map(y => `M${x} ${y}h${w}v${w}h-${w}z`)).join('');
const WI = {
  star: () => svgI('0 0 24 24', `<path d="${STAR}" fill="#fdd116" stroke="#fdd116" stroke-width="2.4" stroke-linejoin="round"/>`, 'wi-star'),
  starGrey: () => svgI('0 0 24 24', `<path d="${STAR}" fill="currentColor" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>`, 'wi-star'),
  moon: () => svgI('0 0 24 24', `<path d="${MOON}" fill="#92aede"/>`, 'wi-moon'),
  box: () => svgI('0 0 24 24',
    `<rect x="1.9" y="3.7" width="20.2" height="4.3" rx=".8" fill="#d7c793"/>` +
    `<path d="M2.7 9h18.6v10.5a.9.9 0 0 1-.9.9H3.6a.9.9 0 0 1-.9-.9z" fill="#d7c793"/>` +
    `<path d="M2.25 4.05h19.5v3.6H2.25zM3.05 9.35h17.9v10.7H3.05z" fill="none" stroke="#e9dfb9" stroke-width=".5" opacity=".7"/>` +
    `<path d="${dots([3.6, 5.7, 7.8, 9.9, 12, 14.1, 16.2, 18.3, 20.4], [4.6, 6.5], .7)}${dots([4.2, 6.3, 16.9, 19], [11.1], .7)}${dots([4.2, 6.3, 8.4, 10.5, 12.6, 14.7, 16.8, 18.9], [13.9, 16, 18.1], .7)}" fill="#bea44e"/>` +
    `<rect x="8.8" y="10.7" width="6.4" height="1.9" rx=".7" fill="#23272e"/>`, 'wi-box'),
  cal: () => svgI('0 0 15 13',
    `<rect x=".6" y=".6" width="13.8" height="11.8" rx="2.3" fill="none" stroke="currentColor" stroke-width="1.2"/>` +
    `<path fill-rule="evenodd" d="M0 2.9A2.9 2.9 0 0 1 2.9 0h9.2A2.9 2.9 0 0 1 15 2.9v1.1H0z` +
      `M2.85 2.05a.6.6 0 1 0 1.2 0a.6.6 0 1 0-1.2 0zM10.95 2.05a.6.6 0 1 0 1.2 0a.6.6 0 1 0-1.2 0z" fill="currentColor"/>` +
    `<path class="wi-cal-dots" d="M3.2 5.9h2M6.5 5.9h2M9.8 5.9h2M3.2 7.95h2M6.5 7.95h2M9.8 7.95h2M3.2 10h2M6.5 10h2M9.8 10h2" stroke="currentColor" stroke-width="1.05" opacity=".8"/>`, 'wi-cal'),
  clear: () => svgI('0 0 10 10', `<path d="M1.2 1.2l7.6 7.6M8.8 1.2l-7.6 7.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>`, 'wi-x'),
  search: () => svgI('0 0 13 13', `<circle cx="5.35" cy="5.35" r="4.72" fill="none" stroke="currentColor" stroke-width="1.28"/><path d="M8.75 8.75l3.65 3.65" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>`, 'wi-search'),
  chevron: () => svgI('0 0 12 18', `<path d="M3 2.4 9.5 9.2 3 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`, 'wi-chev'),
  plus: () => svgI('0 0 24 24', `<path d="M12 3.7v16.6M3.7 12h16.6" stroke="currentColor" stroke-width="1.55"/>`, 'wi-plus'),
  bell: () => svgI('0 0 24 24',
    `<path d="M12 3.2c-3.3 0-5.6 2.5-5.6 5.9v3.8L4.6 16.1c-.3.5 0 1 .6 1h13.6c.6 0 .9-.5.6-1l-1.8-3.2V9.1c0-3.4-2.3-5.9-5.6-5.9z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<path d="M9.6 19.2a2.45 2.45 0 0 0 4.8 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`, 'wi-bell'),
};
const OPT_ICON = { today: WI.star, evening: WI.moon, someday: WI.box, date: WI.cal, clear: WI.clear };

// A reminder is a time of day ("HH:MM") on a to-do that is scheduled for a day: Today, This
// Evening or a date. Someday and "no date" can't carry one, as in Things.
export const canRemind = v => v === 'today' || v === 'evening' || isDate(v);
const isTime = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
/** "18:05" -> "6:05 PM". */
export function fmtTime(hm) {
  const [h, m] = hm.split(':').map(Number);
  return `${(h % 12) || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
/** The label a to-do's reminder adds after its When ("at 6:00 PM"), or '' when it has none. */
export const reminderSuffix = (whenV, reminder) => canRemind(whenV) && isTime(reminder) ? ` at ${fmtTime(reminder)}` : '';
/** The next whole hour from now, the time a new reminder starts at. */
function nextHour() { return `${String((new Date().getHours() + 1) % 24).padStart(2, '0')}:00`; }

/**
 * open({ anchor, value, mode: 'when'|'deadline', onPick(value, reminder), reminder, returnFocus })
 * value/onPick use the stored form: "today" | "evening" | "someday" | "YYYY-MM-DD" | null
 * Pass `reminder` ("HH:MM" or null) to offer "Add Reminder": onPick then also gets the reminder
 * that goes with the picked day (null for Someday/clear). Setting or removing a reminder commits
 * right away (a reminder with no day puts the to-do in Today) and keeps the picker open.
 * Pass `repeatFor` (a to-do id) to offer the Repeats section (repeat.js), which saves as it changes.
 * The picker then follows that to-do: a date, reminder or rule changed elsewhere (another tab) shows
 * here, a reminder set here goes with the date stored now, and the picker closes if the to-do is deleted.
 * Pass `repeatDraft` ({ get(), set(rule) }) instead for a to-do not added yet (the composer): the Repeats
 * section edits the caller's draft rule and the picker follows nothing.
 * Pass `todo` (a to-do id) for the same following without the Repeats section (a Deadline picker).
 * A picker that follows a to-do opens on the to-do as it is now, never on the caller's copy of it (a menu
 * opened before another tab's change may hand over an older date).
 * The desktop popover always lies inside the window, whatever it grows to. A caller that redraws `anchor`
 * while the picker is open (the card's chips change as a rule or reminder is saved) passes `reanchor()` to
 * find its replacement; without one, the picker keeps to where the anchor last was.
 */
export function open({ anchor, reanchor, value = null, mode = 'when', onPick, returnFocus, align = 'start', reminder, repeatFor, repeatDraft, todo } = {}) {
  close();
  const phone = matchMedia('(max-width: 699px)').matches;
  const layer = document.getElementById('layer');
  const deadline = mode === 'deadline';
  const followId = repeatFor || todo || null;
  const field = deadline ? 'deadline' : 'when';
  if (followId) {
    const t = getTodo(followId);
    if (!t) return null; // deleted (in another tab): nothing to pick a date for
    value = t[field] ?? null;
    if (reminder !== undefined) reminder = t.reminder ?? null;
  }
  const remindable = !deadline && reminder !== undefined;
  let rem = remindable && canRemind(value) && isTime(reminder) ? reminder : null;
  // repeat: the Repeats section below the footer, or a Repeat button in the footer while it's off
  const rep = !deadline && (repeatFor || repeatDraft) ? repeat.controller({
    id: repeatFor, draft: repeatFor ? null : repeatDraft, getWhen: () => value,
    onLayout: () => { if (cur) { markRepeats(); position(); } },
    onGone: () => close(),
    onSave: () => committed(),
    onToggle: keyboard => {
      render();
      position();
      // from the keyboard, focus moves to the control that replaced the one pressed; otherwise
      // it stays put, or returns to the picker if what held it has gone
      const a = document.activeElement;
      if (keyboard) rep.on ? rep.focus() : body.querySelector('.when-rep')?.focus({ preventScroll: true });
      else if (!a || a === document.body || !pop.contains(a)) (input || pop.querySelector('.when-panel')).focus({ preventScroll: true });
      if (phone && rep.on) rep.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
  }) : null;

  const scrim = document.createElement('div');
  scrim.className = 'scrim' + (phone ? ' dark when-scrim' : '');
  const pop = document.createElement('div');
  pop.className = 'when-pop' + (phone ? ' sheet' : '');
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', deadline ? 'Deadline' : 'When');
  pop.innerHTML =
    `<div class="when-panel" tabindex="-1" data-shot="when">` +
      (phone
        ? `<div class="when-head"><span class="wh-title">${deadline ? 'Deadline' : 'When?'}</span><button class="wh-cancel" type="button">Cancel</button></div>`
        : `<div class="when-field"><span class="wf-icon">${WI.search()}</span><span class="wf-box"><input class="when-input" placeholder="${deadline ? 'Deadline' : 'When'}" autocomplete="off" spellcheck="false" aria-label="${deadline ? 'Deadline' : 'When'}"><span class="wf-measure" aria-hidden="true"></span><span class="wf-caret" aria-hidden="true" hidden></span></span><button class="wf-clear" type="button" aria-label="Clear" hidden>${WI.clear()}</button></div>`) +
      `<div class="when-body"></div>` +
    `</div>`;
  layer.append(scrim, pop);

  const body = pop.querySelector('.when-body');
  const input = pop.querySelector('.when-input');
  const clearBtn = pop.querySelector('.wf-clear');
  let page = 0;
  let active = -1;
  let query = '';

  const todayV = deadline ? todayISO() : 'today';
  const isCurrent = v => v != null && (v === value || (v === 'today' && value && isDate(value) && value <= todayISO() && !deadline));

  function optHTML(kind, label, v, detail = '') {
    return `<button class="when-opt${isCurrent(v) ? ' current' : ''}" type="button" data-v="${v === null ? '' : esc(v)}" data-kind="${kind}">` +
      `<span class="wo-icon">${(OPT_ICON[kind] || OPT_ICON.date)()}</span><span class="wo-label">${esc(label)}</span>` +
      (detail ? `<span class="wo-detail">${esc(detail)}</span>` : '') + `</button>`;
  }

  function reminderHTML() {
    const repBtn = rep ? rep.buttonHTML() : '';
    const foot = repBtn ? 'when-list when-foot has-rep' : 'when-list when-foot';
    if (!remindable) return repBtn ? `<div class="${foot}">${repBtn}</div>` : '';
    if (!rem) {
      return `<div class="${foot}"><button class="when-opt when-rem" type="button" data-kind="reminder">` +
        `<span class="wo-icon">${WI.plus()}</span><span class="wo-label">Add Reminder</span></button>${repBtn}</div>`;
    }
    return `<div class="${foot}"><div class="when-rem-set">` +
      `<span class="wo-icon">${WI.bell()}</span>` +
      `<label class="rem-field"><span class="rem-text">${fmtTime(rem)}</span>` +
      `<input class="rem-time" type="time" value="${rem}" required aria-label="Reminder time"></label>` +
      `<button class="rem-clear" type="button" aria-label="Remove reminder">${WI.clear()}</button>` +
      `</div>${repBtn}</div>`;
  }

  function calendarHTML() {
    const t0 = startOfToday();
    const weeks = calendarWeeks(addDays(t0, page * 21), 4);
    const head = weeks[0].map(d => `<span>${DAYS_SHORT[d.getDay()]}</span>`).join('');
    const cells = [];
    weeks.forEach((w, wi) => w.forEach((d, di) => {
      const v = iso(d);
      const last = wi === 3 && di === 6;
      const first = wi === 0 && di === 0 && page > 0;
      if (last) { cells.push(`<button class="cal-nav cal-next" type="button" aria-label="Later">${WI.chevron()}</button>`); return; }
      if (first) { cells.push(`<button class="cal-nav cal-prev" type="button" aria-label="Earlier">${WI.chevron()}</button>`); return; }
      if (d < t0) { cells.push(`<span class="cal-blank"></span>`); return; }
      if (v === todayISO()) {
        cells.push(`<button class="cal-day is-today${isCurrent(todayV) ? ' current' : ''}" type="button" data-v="${todayV}" aria-label="Today">${WI.starGrey()}</button>`);
        return;
      }
      const m = d.getDate() === 1 ? `<span class="cal-m">${MONTHS_SHORT[d.getMonth()]}</span>` : '';
      cells.push(`<button class="cal-day${m ? ' has-m' : ''}${isCurrent(v) ? ' current' : ''}" type="button" data-v="${v}">${m}<span class="cal-n">${d.getDate()}</span></button>`);
    }));
    return `<div class="when-cal"><div class="cal-head">${head}</div><div class="cal-grid">${cells.join('')}</div></div>`;
  }

  function render() {
    let h = '';
    if (query) {
      const sugg = parseWhen(query, { allowSpecial: !deadline });
      h = sugg.length
        ? `<div class="when-list sugg">${sugg.map(s => optHTML(s.kind, s.label, s.value, s.detail)).join('')}</div>`
        : `<div class="when-empty">No matches</div>`;
      active = sugg.length ? 0 : -1;
    } else {
      const top = deadline ? '' : optHTML('today', 'Today', 'today') + optHTML('evening', 'This Evening', 'evening');
      const bottom = deadline ? '' : optHTML('someday', 'Someday', 'someday');
      const clear = value ? optHTML('clear', deadline ? 'Remove Deadline' : 'Clear', null) : '';
      h = `<div class="when-list">${top}</div>${calendarHTML()}<div class="when-list">${bottom}${clear}</div>${reminderHTML()}`;
      active = -1;
    }
    if (!query && rep?.on && rep.el.parentNode === body) {
      // redraw around the Repeats section, never through it: a field being typed in there keeps its
      // focus, caret and text (a number cleared to retype isn't put back) when the date changes
      while (body.firstChild !== rep.el) body.firstChild.remove();
      while (rep.el.nextSibling) rep.el.nextSibling.remove();
      rep.el.insertAdjacentHTML('beforebegin', h);
    } else {
      body.innerHTML = h;
      if (!query && rep?.on) body.append(rep.el);
    }
    markRepeats();
    markActive();
  }

  // A repeating to-do's coming dates show on the calendar as rings, as its rule changes.
  function markRepeats() {
    if (!rep || !body) return;
    const days = [...body.querySelectorAll('.cal-day[data-v]')].filter(b => isDate(b.dataset.v));
    const next = new Set(rep.on && days.length ? rep.upcoming(days[days.length - 1].dataset.v) : []);
    for (const b of days) b.classList.toggle('rp-next', next.has(b.dataset.v));
  }

  // The to-do's date and reminder as stored: another tab's change shows here (keeping focus where it is).
  const follows = !!followId;
  function follow() {
    if (!pop.isConnected) return;
    const t = getTodo(followId);
    if (!t) { close(); return; }
    const v = t[field] ?? null;
    const r = remindable && canRemind(v) && isTime(t.reminder) ? t.reminder : null;
    if (v === value && r === rem) return;
    value = v;
    rem = r;
    const a = document.activeElement;
    const sel = a && pop.contains(a) && typeof a.selectionStart === 'number' ? [a.selectionStart, a.selectionEnd] : null;
    render();
    position();
    if (a && a.isConnected && pop.contains(a) && document.activeElement !== a) {
      a.focus({ preventScroll: true });
      if (sel) try { a.setSelectionRange(sel[0], sel[1]); } catch { /* not a text field */ }
    } else if (!pop.contains(document.activeElement)) (input || pop.querySelector('.when-panel')).focus({ preventScroll: true });
    rep?.render(); // its "Next:" note counts from the date
  }
  const unfollow = follows ? subscribe(follow) : null;

  function opts() { return [...body.querySelectorAll('.when-opt')]; }
  function markActive() { opts().forEach((o, i) => o.classList.toggle('active', i === active)); }

  function pick(v) {
    const cb = onPick;
    v = v === '' ? null : v;
    if (follows) refresh(); // the reminder stored now goes with the picked day (another tab's write may not have arrived)
    close();
    if (remindable) cb?.(v, canRemind(v) ? rem : null);
    else cb?.(v);
  }

  // Reminders and repeat rules commit as they change, so the sheet's Cancel becomes Done: a sheet that
  // still offers Cancel has changed nothing.
  function committed() {
    const btn = pop.querySelector('.wh-cancel');
    if (btn) btn.textContent = 'Done';
  }
  function commitReminder() {
    if (follows) { const r = rem; refresh(); rem = r; } // the date stored now, not the one this opened with
    if (!canRemind(value)) value = 'today';
    onPick?.(value, rem);
    committed();
    for (const b of body.querySelectorAll('.when-opt[data-v], .cal-day')) b.classList.toggle('current', isCurrent(b.dataset.v));
  }
  function addReminder() {
    rem = nextHour();
    commitReminder();
    render();
    const t = body.querySelector('.rem-time');
    t?.focus({ preventScroll: true });
    if (phone) try { t?.showPicker?.(); } catch { /* not allowed here: the field is still tappable */ }
  }
  function removeReminder() {
    rem = null;
    commitReminder();
    render();
    body.querySelector('.when-rem')?.focus({ preventScroll: true });
  }
  function activate(b) {
    if (b.dataset.kind === 'reminder') addReminder();
    else if (b.dataset.kind === 'repeat') rep?.turnOn(document.activeElement === b);
    else pick(b.dataset.v);
  }

  // Where the anchor is now. Redrawn under the picker, it's found again (`reanchor`); failing that the
  // picker keeps to its last place, so it never stops following its own size.
  let lastRect = null;
  function anchorRect() {
    if (!anchor.isConnected) { const a = reanchor?.(); if (a && a.isConnected) anchor = a; }
    if (anchor.isConnected) lastRect = anchor.getBoundingClientRect();
    return lastRect;
  }
  // Decide above/below once (with the full menu), then keep that edge pinned while typing. Whatever it
  // grows to (the Repeats section, its list of kinds) the whole picker stays inside the window: it slides
  // over its anchor rather than off an edge, and a panel taller than the window scrolls (repeat.css).
  let above = null;
  function position() {
    if (phone || !pop.isConnected) return;
    const r = anchorRect();
    if (!r) return;
    const w = pop.offsetWidth, h = pop.offsetHeight;
    // Whole CSS pixels, so the panel's edges and every row inside it sit on the same pixel
    // grid as the window (a fractional offset smears each edge across two device pixels).
    let x = align === 'end' ? r.right - w + 14 : r.left - 14;
    x = Math.round(Math.max(4, Math.min(x, innerWidth - w - 4)));
    pop.style.left = x + 'px';
    if (above === null) above = r.bottom - 6 + h > innerHeight - 4 && r.top > innerHeight - r.bottom;
    if (above) {
      pop.style.top = '';
      pop.style.bottom = Math.round(Math.max(4, Math.min(innerHeight - r.top - 6, innerHeight - h - 4))) + 'px';
      pop.style.transformOrigin = 'bottom left';
    } else {
      pop.style.bottom = '';
      pop.style.top = Math.round(Math.max(4, Math.min(r.bottom - 6, innerHeight - h - 4))) + 'px';
    }
  }

  body.addEventListener('mousedown', e => { if (!e.target.closest('.rem-field, .rp input')) e.preventDefault(); });
  body.addEventListener('click', e => {
    const nav = e.target.closest('.cal-nav');
    if (nav) {
      const next = nav.classList.contains('cal-next'), had = document.activeElement === nav;
      page = Math.max(0, page + (next ? 1 : -1));
      render();
      // pressed from the keyboard: focus stays on the arrow (or the picker), never drops out of it
      if (had) (body.querySelector(next ? '.cal-next' : '.cal-prev') || body.querySelector('.cal-nav') || input || pop.querySelector('.when-panel')).focus({ preventScroll: true });
      return;
    }
    if (e.target.closest('.rem-clear')) { removeReminder(); return; }
    const b = e.target.closest('.when-opt, .cal-day');
    if (b) activate(b);
  });
  body.addEventListener('change', e => {
    const t = e.target.closest('.rem-time');
    if (!t) return;
    if (!isTime(t.value)) return; // mid-edit; the × removes a reminder
    rem = t.value;
    t.previousElementSibling.textContent = fmtTime(rem);
    commitReminder();
    if (!t.isConnected) render(); // redrawn for a change made elsewhere meanwhile
  });
  body.addEventListener('mousemove', e => {
    const b = e.target.closest('.when-opt');
    if (!b) return;
    const i = opts().indexOf(b);
    if (i !== active) { active = i; markActive(); }
  });
  pop.querySelector('.wh-cancel')?.addEventListener('click', () => close());
  scrim.addEventListener('pointerdown', e => { e.preventDefault(); close(); });

  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.target.closest?.('.rp')) return; // the Repeats section's own fields and buttons take their keys
    if (e.target.closest?.('.rem-time') && e.key !== 'Enter') return; // the time field steps its own digits
    const list = opts();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); e.stopPropagation();
      if (!list.length) return;
      active = e.key === 'ArrowDown' ? (active + 1) % list.length : (active <= 0 ? list.length - 1 : active - 1);
      markActive();
      list[active].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault(); e.stopPropagation();
      if (e.target.closest?.('.rem-time')) { close(); return; }
      // a button reached with Tab (an option, a day, Repeat) takes Enter as a press, as Space does
      const focused = e.target !== input && e.target.closest?.('button');
      if (focused && pop.contains(focused)) { focused.click(); return; }
      const b = list[active] || (query ? list[0] : null);
      if (b) activate(b);
    }
  };
  pop.addEventListener('keydown', onKey);
  // Escape closes the picker even when focus has ended up outside it (on the page body), so the keyboard
  // is never stuck behind an open picker
  const onStrayKey = e => { if (e.key === 'Escape' && !e.defaultPrevented && !pop.contains(e.target)) { e.preventDefault(); close(); } };
  document.addEventListener('keydown', onStrayKey);

  // A Mac-style insertion point: 2px wide, accent blue, taller than the text. The native caret
  // is 1px and can't be widened, so the field hides it and draws this one where it would be.
  const caret = pop.querySelector('.wf-caret');
  const measure = pop.querySelector('.wf-measure');
  let caretRaf = 0;
  function placeCaret() {
    caretRaf = 0;
    if (!input || !input.isConnected) return;
    const collapsed = input.selectionStart === input.selectionEnd;
    if (document.activeElement !== input || !collapsed) { caret.hidden = true; return; }
    measure.textContent = input.value.slice(0, input.selectionStart ?? input.value.length);
    const x = measure.getBoundingClientRect().width - input.scrollLeft;
    caret.hidden = x < -1 || x > input.clientWidth + 1;
    // AppKit draws the bar a hair left of the advance; keep it off the field's left edge.
    const cx = Math.max(0, x - 1.1);
    caret.style.transform = `translateX(${Math.round(cx * devicePixelRatio) / devicePixelRatio}px)`;
    caret.style.animation = 'none';
    void caret.offsetWidth; // restart the blink so the caret stays solid while typing
    caret.style.animation = '';
  }
  const queueCaret = () => { if (!caretRaf) caretRaf = requestAnimationFrame(placeCaret); };

  if (input) {
    input.addEventListener('input', () => {
      query = input.value.trim();
      clearBtn.hidden = !input.value;
      render();
      position();
      placeCaret();
    });
    for (const ev of ['focus', 'blur', 'keydown', 'keyup', 'pointerdown', 'pointerup', 'select', 'scroll']) input.addEventListener(ev, queueCaret);
    document.addEventListener('selectionchange', queueCaret);
    clearBtn.addEventListener('mousedown', e => e.preventDefault());
    clearBtn.addEventListener('click', () => { input.value = ''; query = ''; clearBtn.hidden = true; render(); position(); input.focus(); placeCaret(); });
  }

  render();
  position();
  requestAnimationFrame(position);
  (input || pop.querySelector('.when-panel')).focus({ preventScroll: true });

  const onResize = () => position();
  window.addEventListener('resize', onResize);
  // re-placed whenever it changes size, whatever changed it (a rule saved, the list of kinds, another tab)
  const sized = typeof ResizeObserver === 'function' ? new ResizeObserver(() => position()) : null;
  sized?.observe(pop);
  if (input) placeCaret();
  cur = {
    cleanup() {
      unfollow?.();
      sized?.disconnect();
      document.removeEventListener('keydown', onStrayKey);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('selectionchange', queueCaret);
      rep?.destroy();
      cancelAnimationFrame(caretRaf);
      scrim.remove();
      pop.remove();
      if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
    },
  };
  // catch up now, once placed: another tab's write may not have reached this one yet (follow() shows it)
  if (follows) refresh();
  return cur ? pop : null;
}

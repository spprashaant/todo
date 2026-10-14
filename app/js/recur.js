// Repeat rules (shared): the pure date math behind repeating to-dos. No state, no DOM.
// A rule is the `repeat` object described in gauntlet/CONTRACT.md ("Repeating to-dos"):
//   { mode: 'completion'|'schedule', every, unit: 'day'|'week'|'month'|'year',
//     weekdays?, monthly?: { day } | { nth, weekday }, ends?: { after } | { on } }
import { isDate, iso, parseISO, addDays, dayDiff } from './dates.js';

export const UNITS = ['day', 'week', 'month', 'year'];

const int = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null; };

const RULE_KEYS = new Set(['mode', 'every', 'unit', 'weekdays', 'monthly', 'ends']);

/** A clean copy of a rule, or null when it isn't one. Keys outside the data model are kept as they are. */
export function normRepeat(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const mode = r.mode === 'schedule' ? 'schedule' : 'completion';
  const unit = UNITS.includes(r.unit) ? r.unit : 'day';
  const out = { mode, every: int(r.every, 1, 999) || 1, unit };
  if (mode === 'schedule' && unit === 'week' && Array.isArray(r.weekdays)) {
    const w = [...new Set(r.weekdays.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
    if (w.length) out.weekdays = w;
  }
  if (mode === 'schedule' && unit === 'month' && r.monthly && typeof r.monthly === 'object') {
    const m = r.monthly;
    if (m.nth != null && m.weekday != null) {
      const nth = Number(m.nth) === -1 ? -1 : int(m.nth, 1, 4), weekday = int(m.weekday, 0, 6);
      if (nth && weekday != null) out.monthly = { nth, weekday };
    } else if (m.day != null) {
      const day = int(m.day, 1, 31);
      if (day) out.monthly = { day };
    }
  }
  if (r.ends && typeof r.ends === 'object') {
    if (r.ends.after != null && int(r.ends.after, 1, 9999)) out.ends = { after: int(r.ends.after, 1, 9999) };
    else if (isDate(r.ends.on)) out.ends = { on: r.ends.on };
  }
  for (const k of Object.keys(r)) if (!RULE_KEYS.has(k) && r[k] !== undefined) out[k] = r[k];
  return out;
}

const lastDay = (y, m) => new Date(y, m + 1, 0).getDate();
/** Day `d` of month `m` (0-based, may overflow into other years), clamped to the month's length. */
const dayIn = (y, m, d) => { const f = new Date(y, m, 1); return new Date(f.getFullYear(), f.getMonth(), Math.min(d, lastDay(f.getFullYear(), f.getMonth()))); };
/** The nth (1..4, or -1 = last) `weekday` of a month. */
function nthWeekday(y, m, nth, weekday) {
  const f = new Date(y, m, 1);
  y = f.getFullYear(); m = f.getMonth();
  if (nth === -1) {
    const last = new Date(y, m, lastDay(y, m));
    return addDays(last, -((last.getDay() - weekday + 7) % 7));
  }
  return new Date(y, m, 1 + ((weekday - f.getDay() + 7) % 7) + (nth - 1) * 7);
}
const weekStart = d => addDays(d, -d.getDay());
const monthIndex = d => d.getFullYear() * 12 + d.getMonth();

/** `n` units after `d`; months and years clamp to the end of short months (Jan 31 + 1 month = Feb 28). */
export function addUnits(d, n, unit) {
  switch (unit) {
    case 'week': return addDays(d, 7 * n);
    case 'month': return dayIn(d.getFullYear(), d.getMonth() + n, d.getDate());
    case 'year': return dayIn(d.getFullYear() + n, d.getMonth(), d.getDate());
    default: return addDays(d, n);
  }
}

/**
 * The date ("YYYY-MM-DD") of the occurrence that follows one, or null when the rule has ended.
 *   rule      the repeat rule
 *   when      the finished occurrence's `when` (its date anchors a schedule; anything else anchors on `today`)
 *   today     the completion day, "YYYY-MM-DD"
 *   occurrence  1-based position of the finished occurrence in its series (for ends.after)
 *   anchorDay   optional day of the month (29..31) the series aims for when the occurrence's date was
 *               clamped to a short month's end (see anchorDayFor); ignored when it doesn't apply
 * Completion mode: `every` units after `today`. Schedule mode: the first date of the rule strictly after
 * both the occurrence's date and today, keeping the phase of the occurrence's date.
 */
export function nextDate(rule, when, today, occurrence = 1, anchorDay = null) {
  const r = normRepeat(rule);
  if (!r || !isDate(today)) return null;
  if (r.ends?.after && occurrence + 1 > r.ends.after) return null;
  const t = parseISO(today);
  let next;
  if (r.mode === 'completion') {
    next = addUnits(t, r.every, r.unit);
  } else {
    const anchor = isDate(when) ? parseISO(when) : t;
    const after = dayDiff(anchor, t) > 0 ? t : anchor; // strictly after both
    next = scheduleAfter(r, anchor, after, intendedDay(r, anchor, anchorDay));
  }
  if (!next) return null;
  const v = iso(next);
  if (r.ends?.on && v > r.ends.on) return null;
  return v;
}

/**
 * The day of the month a schedule anchored on `anchor` aims for: the anchor's own day, or `anchorDay`
 * when the anchor sits on the last day of a short month that this kind of rule clamped it to: a monthly
 * rule without `monthly` (Feb 28 standing for the 31st), or a yearly one, which only ever clamps Feb 29 to
 * Feb 28. Any other anchorDay (left over from another rule) is ignored, so Yearly on Feb 28 stays Feb 28.
 */
function intendedDay(r, anchor, anchorDay) {
  const d = anchor.getDate(), a = Number(anchorDay);
  if (r.mode !== 'schedule' || !Number.isInteger(a) || a <= d || a > 31 || d !== lastDay(anchor.getFullYear(), anchor.getMonth())) return d;
  if (r.unit === 'year') return anchor.getMonth() === 1 && a === 29 ? a : d;
  return r.unit === 'month' && !r.monthly ? a : d;
}

/**
 * For schedule rules whose day of the month comes from the occurrence's date (monthly without `monthly`,
 * and yearly): the day the following occurrences aim for, so a clamped date (Jan 31 -> Feb 28, or
 * Feb 29 -> Feb 28) doesn't drift the series. Null for rules that don't need it.
 */
export function anchorDayFor(rule, when, today, anchorDay = null) {
  const r = normRepeat(rule);
  if (!r || r.mode !== 'schedule' || !(r.unit === 'year' || (r.unit === 'month' && !r.monthly))) return null;
  const anchor = isDate(when) ? parseISO(when) : isDate(today) ? parseISO(today) : null;
  return anchor ? intendedDay(r, anchor, anchorDay) : null;
}

/**
 * The occurrence that follows one: `{ when, anchorDay }`, or null when the rule has ended. `anchorDay` is
 * the day the series aims for when the new date was clamped short of it (Jan 31 -> Feb 28 gives 31), else
 * null. This is what completing creates (store.js), and what a preview steps through (repeat.js): each
 * step carries its own anchorDay on to the next, so Mar 31 monthly runs Apr 30, May 31, Jun 30, Jul 31.
 */
export function nextOccurrence(rule, when, today, occurrence = 1, anchorDay = null) {
  const next = nextDate(rule, when, today, occurrence, anchorDay);
  if (!next) return null;
  const day = anchorDayFor(rule, when, today, anchorDay);
  return { when: next, anchorDay: day && day > parseISO(next).getDate() ? day : null };
}

/**
 * The day of the month the occurrence dated `when` stands for under `rule`: its own day, or its
 * `anchorDay` where that applies (an Apr 30 occurrence of a monthly series on the 31st stands for the
 * 31st). Null when `when` isn't a date. Wording and pickers use it, so they say what the series does.
 */
export function aimedDay(rule, when, anchorDay = null) {
  const r = normRepeat(rule);
  if (!isDate(when)) return null;
  const d = parseISO(when);
  return r ? intendedDay(r, d, anchorDay) : d.getDate();
}

/** What sets a rule's dates: everything but its end and the keys a picker keeps for itself. */
export const phaseOf = rule => { const r = normRepeat(rule); return r ? JSON.stringify([r.mode, r.every, r.unit, r.weekdays || null, r.monthly || null]) : ''; };

/** First date of a schedule rule, phased on `anchor`, that falls strictly after `after`. */
function scheduleAfter(r, anchor, after, day = anchor.getDate()) {
  const k = r.every;
  switch (r.unit) {
    case 'day': {
      const n = Math.floor(dayDiff(anchor, after) / k) + 1;
      return addDays(anchor, Math.max(1, n) * k);
    }
    case 'week': {
      const days = r.weekdays || [anchor.getDay()];
      const w0 = weekStart(anchor);
      for (let i = 1; i <= 7 * k + 7; i++) {
        const d = addDays(after, i);
        const weeks = Math.round(dayDiff(w0, weekStart(d)) / 7);
        if (weeks >= 0 && weeks % k === 0 && days.includes(d.getDay())) return d;
      }
      return null;
    }
    case 'month': {
      const m0 = monthIndex(anchor);
      const pick = mi => {
        const y = Math.floor(mi / 12), m = mi % 12;
        if (r.monthly?.nth) return nthWeekday(y, m, r.monthly.nth, r.monthly.weekday);
        return dayIn(y, m, r.monthly?.day || day);
      };
      let i = Math.max(0, Math.floor((monthIndex(after) - m0) / k) - 1);
      for (let guard = 0; guard < 60; guard++, i++) {
        const d = pick(m0 + i * k);
        if (dayDiff(after, d) > 0) return d;
      }
      return null;
    }
    case 'year': {
      let i = Math.max(0, after.getFullYear() - anchor.getFullYear() - k);
      i -= i % k;
      for (let guard = 0; guard < 60; guard++, i += k) {
        const d = dayIn(anchor.getFullYear() + i, anchor.getMonth(), day);
        if (dayDiff(after, d) > 0) return d;
      }
      return null;
    }
  }
  return null;
}

// ---------- wording ----------
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const NTH = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', '-1': 'last' };
export const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
const plural = (n, unit) => n === 1 ? unit : `${n} ${unit}s`;
const list = xs => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/**
 * Plain-English rule: "Every day", "Every 2 weeks on Mon and Thu", "Every month on the second Tuesday",
 * "3 days after completion". `date` (the occurrence's "YYYY-MM-DD") fills in defaults the rule leaves out.
 * { ends: true } appends the end ("…, 3 times" / "…, until Mar 12"). `anchorDay` is the occurrence's own
 * (see aimedDay): a clamped Apr 30 occurrence of a monthly series on the 31st reads "on the 31st".
 */
export function describe(rule, { date = null, ends = true, anchorDay = null } = {}) {
  const r = normRepeat(rule);
  if (!r) return '';
  const d = isDate(date) ? parseISO(date) : null;
  const day = d ? intendedDay(r, d, anchorDay) : null;
  let s;
  if (r.mode === 'completion') {
    s = `${r.every} ${r.unit}${r.every === 1 ? '' : 's'} after completion`;
  } else {
    s = r.every === 1 ? `Every ${r.unit}` : `Every ${plural(r.every, r.unit)}`;
    if (r.unit === 'week') {
      const days = r.weekdays || (d ? [d.getDay()] : null);
      if (days && r.every === 1 && days.join() === '1,2,3,4,5') s = 'Every weekday';
      else if (days && days.length === 7 && r.every === 1) s = 'Every day';
      else if (days) s += ` on ${list(days.map(i => (days.length > 2 ? DAY_SHORT : DAY_NAMES)[i]))}`;
    } else if (r.unit === 'month') {
      if (r.monthly?.nth) s += ` on the ${NTH[r.monthly.nth]} ${DAY_NAMES[r.monthly.weekday]}`;
      else if (r.monthly?.day || d) s += ` on the ${ordinal(r.monthly?.day || day)}`;
    } else if (r.unit === 'year' && d) {
      s += ` on ${MONTH_NAMES[d.getMonth()]} ${day}`;
    }
  }
  if (ends && r.ends?.after) s += `, ${r.ends.after} time${r.ends.after === 1 ? '' : 's'}`;
  if (ends && r.ends?.on) { const e = parseISO(r.ends.on); s += `, until ${MONTH_NAMES[e.getMonth()].slice(0, 3)} ${e.getDate()}`; }
  return s;
}

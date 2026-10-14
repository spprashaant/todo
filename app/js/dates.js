// Date helpers (shared). All dates are local calendar days as "YYYY-MM-DD" strings.
// "Today" is always new Date() in local time; nothing is hard-coded.

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = n => String(n).padStart(2, '0');

export const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function iso(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

export function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }

export function todayISO() { return iso(new Date()); }

export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d, n) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); return x; }

export function addMonths(d, n) {
  const first = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(d.getDate(), last));
}

/** Whole calendar days from a to b (b - a), DST-safe. */
export function dayDiff(a, b) {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 864e5);
}

export function daysFromToday(isoStr) { return dayDiff(startOfToday(), parseISO(isoStr)); }

/** A `when` value that lands in Today (today, this evening, or a date on or before today). */
export function whenIsToday(when) {
  return when === 'today' || when === 'evening' || (isDate(when) && when <= todayISO());
}
export function whenIsFuture(when) { return isDate(when) && when > todayISO(); }

/** "May 25" (adds the year when it is not this year). */
export function fmtShort(isoStr) {
  const d = parseISO(isoStr);
  const s = `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === new Date().getFullYear() ? s : `${s}, ${d.getFullYear()}`;
}

/** "Thu, Jun 8" */
export function fmtWeekdayDate(isoStr) {
  const d = parseISO(isoStr);
  const s = `${DAYS_SHORT[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === new Date().getFullYear() ? s : `${s}, ${d.getFullYear()}`;
}

/** Relative day label used in chips: Today, Tomorrow, Friday, Thu, Jun 8. */
export function fmtRelative(isoStr) {
  const n = daysFromToday(isoStr);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return DAYS[parseISO(isoStr).getDay()];
  return fmtWeekdayDate(isoStr);
}

/** Right-hand detail for date suggestions: "Sun" within a week, else "Thu, Jun 8". */
export function fmtSuggestionDetail(isoStr) {
  const n = daysFromToday(isoStr);
  if (n >= 0 && n < 7) return DAYS_SHORT[parseISO(isoStr).getDay()];
  return fmtWeekdayDate(isoStr);
}

/** Deadline text for rows: "today" (due), "2 days ago" (due), "3 days left", "Jun 8". */
export function fmtDeadline(isoStr) {
  const n = daysFromToday(isoStr);
  if (n === 0) return { text: 'today', due: true };
  if (n < 0) return { text: n === -1 ? 'yesterday' : `${-n} days ago`, due: true };
  if (n === 1) return { text: 'tomorrow', due: false };
  if (n < 7) return { text: `${n} days left`, due: false };
  return { text: fmtShort(isoStr), due: false };
}

/** Weeks for a calendar grid, starting at the week that contains `from` (Sunday first). */
export function calendarWeeks(from, weeks) {
  const start = addDays(from, -from.getDay());
  const out = [];
  for (let w = 0; w < weeks; w++) {
    const row = [];
    for (let i = 0; i < 7; i++) row.push(addDays(start, w * 7 + i));
    out.push(row);
  }
  return out;
}

// ---------- natural-language "When" suggestions ----------

const WEEKDAY_KEYS = DAYS.map(d => d.toLowerCase());
const MONTH_KEYS = MONTHS.map(m => m.toLowerCase());

function nextWeekday(dow, { strictlyAfterToday = true, skipWeek = false } = {}) {
  const t = startOfToday();
  let n = (dow - t.getDay() + 7) % 7;
  if (n === 0 && strictlyAfterToday) n = 7;
  if (skipWeek) n += 7;
  return addDays(t, n);
}

function dateSuggestion(label, d, extra = {}) {
  const v = iso(d);
  return { kind: 'date', label, value: v, detail: fmtSuggestionDetail(v), ...extra };
}

function prefixOf(q, word, min = 1) { return q.length >= min && word.startsWith(q); }

/**
 * Parse a typed "When" query into suggestions.
 * Each suggestion: { kind: 'today'|'evening'|'someday'|'clear'|'date', label, value, detail }
 * value is what gets stored in `when` ("today", "evening", "someday", null or "YYYY-MM-DD").
 */
export function parseWhen(input, { allowSpecial = true } = {}) {
  const q = String(input || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!q) return [];
  const t = startOfToday();
  const out = [];
  const seen = new Set();
  const push = s => { const k = s.kind + ':' + s.value; if (!seen.has(k)) { seen.add(k); out.push(s); } };

  // keywords
  if (allowSpecial) {
    if (prefixOf(q, 'today') || prefixOf(q, 'now', 2)) push({ kind: 'today', label: 'Today', value: 'today', detail: '' });
    if (prefixOf(q, 'this evening', 2) || prefixOf(q, 'evening') || prefixOf(q, 'tonight', 3)) push({ kind: 'evening', label: 'This Evening', value: 'evening', detail: '' });
  } else if (prefixOf(q, 'today')) {
    push(dateSuggestion('Today', t));
  }
  if (prefixOf(q, 'tomorrow', 2) || q === 'tmr' || q === 'tmrw') push(dateSuggestion('Tomorrow', addDays(t, 1)));
  if (allowSpecial && prefixOf(q, 'someday', 2)) push({ kind: 'someday', label: 'Someday', value: 'someday', detail: '' });
  if (allowSpecial && (prefixOf(q, 'anytime', 2) || prefixOf(q, 'no date', 2) || q === 'none')) push({ kind: 'clear', label: 'No Date', value: null, detail: '' });

  // weekdays: "fri", "friday", "next fri"
  let m = q.match(/^(next |this )?([a-z]+)$/);
  if (m) {
    const word = m[2];
    const isNext = m[1] === 'next ';
    WEEKDAY_KEYS.forEach((k, dow) => {
      if (word.length >= 2 && k.startsWith(word)) {
        push(dateSuggestion(isNext ? `Next ${DAYS[dow]}` : DAYS[dow], nextWeekday(dow, { skipWeek: isNext })));
      }
    });
  }

  // relative words
  if (prefixOf(q, 'next week', 3)) push(dateSuggestion('Next Week', nextWeekday(1)));
  if (prefixOf(q, 'next month', 6)) push(dateSuggestion('Next Month', new Date(t.getFullYear(), t.getMonth() + 1, 1)));
  if (prefixOf(q, 'weekend', 2) || prefixOf(q, 'this weekend', 6)) push(dateSuggestion('This Weekend', t.getDay() === 6 ? t : nextWeekday(6)));
  if (prefixOf(q, 'next year', 6)) push(dateSuggestion('Next Year', new Date(t.getFullYear() + 1, 0, 1)));

  // "in 3", "in 3 d", "in 3 weeks", "3", "3d", "2w", "4m"
  m = q.match(/^(?:in )?(\d{1,3})(?: ?(d|da|day|days|w|we|wee|week|weeks|m|mo|mon|month|months|y|ye|yea|year|years))?$/);
  if (m) {
    const n = Number(m[1]);
    const unit = m[2] ? m[2][0] : '';
    const plural = (w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    if (n > 0) {
      if (!unit || unit === 'd') push(dateSuggestion(`in ${plural('day')}`, addDays(t, n)));
      if (!unit || unit === 'w') push(dateSuggestion(`in ${plural('week')}`, addDays(t, n * 7)));
      if (!unit || unit === 'm') push(dateSuggestion(`in ${plural('month')}`, addMonths(t, n)));
      if (unit === 'y') push(dateSuggestion(`in ${plural('year')}`, new Date(t.getFullYear() + n, t.getMonth(), t.getDate())));
    }
    // a bare day-of-month number: the next time that date comes around
    if (!unit && !q.startsWith('in') && n >= 1 && n <= 31) {
      let d = new Date(t.getFullYear(), t.getMonth(), n);
      if (d.getMonth() !== t.getMonth() || d < t) d = new Date(t.getFullYear(), t.getMonth() + 1, n);
      if (d.getDate() === n) push(dateSuggestion(`${MONTHS_SHORT[d.getMonth()]} ${n}`, d));
    }
  }

  // month names: "jun", "june 8", "jun 8 2027", "8 jun"
  m = q.match(/^([a-z]+)\.?(?: (\d{1,2}))?(?:,? (\d{4}))?$/) || null;
  const m2 = q.match(/^(\d{1,2}) ([a-z]+)\.?(?: (\d{4}))?$/);
  const monthQ = m ? { word: m[1], day: m[2], year: m[3] } : m2 ? { word: m2[2], day: m2[1], year: m2[3] } : null;
  if (monthQ && monthQ.word.length >= 3) {
    MONTH_KEYS.forEach((k, mi) => {
      if (!k.startsWith(monthQ.word)) return;
      const day = monthQ.day ? Number(monthQ.day) : 1;
      let y = monthQ.year ? Number(monthQ.year) : t.getFullYear();
      let d = new Date(y, mi, day);
      if (!monthQ.year && d < t) d = new Date(y + 1, mi, day);
      if (d.getDate() !== day) return;
      push(dateSuggestion(monthQ.day ? `${MONTHS[mi]} ${day}` : MONTHS[mi], d));
    });
  }

  // numeric dates: 6/8, 6/8/2027, 2027-06-08
  m = q.match(/^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?$/);
  if (m) {
    const mo = Number(m[1]) - 1, day = Number(m[2]);
    let y = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : t.getFullYear();
    let d = new Date(y, mo, day);
    if (!m[3] && d < t) d = new Date(y + 1, mo, day);
    if (d.getMonth() === mo && d.getDate() === day) push(dateSuggestion(`${MONTHS[mo]} ${day}`, d));
  }
  m = q.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!isNaN(d)) push(dateSuggestion(fmtWeekdayDate(iso(d)), d));
  }

  return out.slice(0, 8);
}

// Inline SVG icon set (shared). Every icon returns an SVG string; size with CSS or the `size` option.

const svg = (vb, body, { size, cls = '', title } = {}) =>
  `<svg class="ico ${cls}" viewBox="${vb}" ${size ? `width="${size}" height="${size}"` : ''} aria-hidden="${title ? 'false' : 'true'}" focusable="false">${title ? `<title>${title}</title>` : ''}${body}</svg>`;

/** Rounded 5-point star path centred in a 24 box. */
function starPath(cx = 12, cy = 12.6, R = 10.4, r = 4.75) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rad = i % 2 ? r : R;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)} ${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join(' L')}Z`;
}
const STAR = starPath();

const ICONS = {
  // ---- list icons (colour) ----
  inbox: o => svg('0 0 16 16',
    `<rect x="1" y="1" width="14" height="14" rx="3.1" fill="#1b9ef3"/>` +
    `<path d="M3.1 3.4h9.8v4.5h-2.3v4.2H5.5V7.9H3.1z" fill="#fff" stroke="#fff" stroke-width=".5" stroke-linejoin="round"/>`, o),
  today: o => svg('0 0 24 24',
    `<path d="${STAR}" fill="#fdcb2e" stroke="#fdcb2e" stroke-width="2.4" stroke-linejoin="round"/>` +
    `<path d="${STAR}" fill="none" stroke="#f0b400" stroke-opacity=".35" stroke-width=".6" stroke-linejoin="round"/>`, o),
  upcoming: o => svg('0 0 16 16',
    `<rect x="1.2" y="1.6" width="13.6" height="13" rx="2.6" fill="#f5336b"/>` +
    `<rect x="2.5" y="5" width="11" height="8.3" rx="1" fill="#fff"/>` +
    `<circle cx="4.7" cy="3.3" r=".62" fill="#fff"/><circle cx="11.3" cy="3.3" r=".62" fill="#fff"/>` +
    `<g fill="#f5336b" opacity=".4"><rect x="4.1" y="6.7" width="1.9" height="1.1" rx=".3"/><rect x="7.05" y="6.7" width="1.9" height="1.1" rx=".3"/><rect x="10" y="6.7" width="1.9" height="1.1" rx=".3"/>` +
    `<rect x="4.1" y="8.75" width="1.9" height="1.1" rx=".3"/><rect x="7.05" y="8.75" width="1.9" height="1.1" rx=".3"/><rect x="10" y="8.75" width="1.9" height="1.1" rx=".3"/>` +
    `<rect x="4.1" y="10.8" width="1.9" height="1.1" rx=".3"/><rect x="7.05" y="10.8" width="1.9" height="1.1" rx=".3"/><rect x="10" y="10.8" width="1.9" height="1.1" rx=".3"/></g>`, o),
  anytime: o => svg('0 0 16 16',
    `<path d="M1.3 11 8 14.5l6.7-3.5" fill="none" stroke="#2f9c90" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M1.3 8.1 8 11.6l6.7-3.5" fill="none" stroke="#3aa99c" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M8 1.2 14.9 4.8 8 8.5 1.1 4.8z" fill="#2f9c90" stroke="#2f9c90" stroke-width=".8" stroke-linejoin="round"/>`, o),
  someday: o => svg('0 0 16 16',
    `<rect x="1" y="2" width="14" height="3.7" rx=".9" fill="#d3bf76"/>` +
    `<path d="M2.1 6.6h11.8v6.9a1.3 1.3 0 0 1-1.3 1.3H3.4a1.3 1.3 0 0 1-1.3-1.3z" fill="#c9b36a"/>` +
    `<rect x="5.6" y="8.3" width="4.8" height="1.5" rx=".75" fill="#fff"/>`, o),
  logbook: o => svg('0 0 16 16',
    `<rect x="3.5" y=".6" width="11" height="14.3" rx="1.9" fill="#3aa653"/>` +
    `<rect x="4.3" y="1.4" width="9.4" height="12.7" rx="1.2" fill="#e8f5eb"/>` +
    `<rect x="1.7" y="2.3" width="10.5" height="13.2" rx="1.7" fill="#4dbb66"/>` +
    `<path d="M4.6 9.2l1.9 1.9 3.4-3.9" fill="none" stroke="#fff" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/>`, o),
  trash: o => svg('0 0 16 16',
    `<path d="M2.5 3.2h11l-1.1 10.6a1.5 1.5 0 0 1-1.5 1.3H5.1a1.5 1.5 0 0 1-1.5-1.3z" fill="#c3c6cb"/><rect x="2" y="2" width="12" height="2.2" rx="1.1" fill="#b3b7bd"/>`, o),
  area: o => svg('0 0 16 16',
    `<path d="M8 1.1l6.3 3.5v6.8L8 14.9l-6.3-3.5V4.6z" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>` +
    `<path d="M1.7 4.6 8 8.4l6.3-3.8" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>`, o),

  // ---- inline glyphs ----
  star: o => svg('0 0 24 24', `<path d="${STAR}" fill="#f5c219" stroke="#f5c219" stroke-width="2.4" stroke-linejoin="round"/>`, o),
  'star-grey': o => svg('0 0 24 24', `<path d="${STAR}" fill="currentColor" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>`, o),
  moon: o => svg('0 0 16 16', `<path d="M9.6 1.6A6.6 6.6 0 1 0 14.5 11a5.5 5.5 0 0 1-4.9-9.4z" fill="#7396c8"/>`, o),
  flag: o => svg('0 0 12 14', `<path d="M1.6 1v12.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M2.3 1.4h8.4L8.6 4.5l2.1 3.1H2.3z" fill="currentColor"/>`, o),
  'flag-outline': o => svg('0 0 18 18', `<path d="M3.5 1.8v14.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M4.1 2.6h10.6l-2.6 3.8 2.6 3.8H4.1" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>`, o),
  calendar: o => svg('0 0 18 18',
    `<rect x="1.6" y="2.6" width="14.8" height="13" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.25"/>` +
    `<path d="M1.6 6.2h14.8" stroke="currentColor" stroke-width="1.25"/>` +
    `<g fill="currentColor"><rect x="4.3" y="8.2" width="2" height="1.4" rx=".3"/><rect x="8" y="8.2" width="2" height="1.4" rx=".3"/><rect x="11.7" y="8.2" width="2" height="1.4" rx=".3"/>` +
    `<rect x="4.3" y="11.4" width="2" height="1.4" rx=".3"/><rect x="8" y="11.4" width="2" height="1.4" rx=".3"/><rect x="11.7" y="11.4" width="2" height="1.4" rx=".3"/></g>`, o),
  'calendar-color': o => svg('0 0 16 16',
    `<rect x="1.2" y="1.8" width="13.6" height="12.6" rx="2.4" fill="#f5336b"/>` +
    `<rect x="2.5" y="5" width="11" height="8.1" rx="1" fill="#fff"/>` +
    `<g fill="#f5336b" opacity=".85"><rect x="4" y="6.5" width="2" height="1.3" rx=".3"/><rect x="7" y="6.5" width="2" height="1.3" rx=".3"/><rect x="10" y="6.5" width="2" height="1.3" rx=".3"/>` +
    `<rect x="4" y="8.7" width="2" height="1.3" rx=".3"/><rect x="7" y="8.7" width="2" height="1.3" rx=".3"/><rect x="10" y="8.7" width="2" height="1.3" rx=".3"/>` +
    `<rect x="4" y="10.9" width="2" height="1.3" rx=".3"/><rect x="7" y="10.9" width="2" height="1.3" rx=".3"/></g>`, o),
  tag: o => svg('0 0 18 18',
    `<path d="M2.2 3.4v4.3c0 .5.2.9.5 1.2l6.9 6.9c.6.6 1.5.6 2.1 0l4-4c.6-.6.6-1.5 0-2.1L8.8 2.8c-.3-.3-.7-.5-1.2-.5H3.4c-.7 0-1.2.5-1.2 1.1z" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>` +
    `<circle cx="5.4" cy="5.5" r="1.25" fill="none" stroke="currentColor" stroke-width="1.1"/>`, o),
  checklist: o => svg('0 0 18 18',
    `<g fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="3.6" cy="4" r="1.5"/><circle cx="3.6" cy="9" r="1.5"/><circle cx="3.6" cy="14" r="1.5"/></g>` +
    `<g stroke="currentColor" stroke-width="1.25" stroke-linecap="round"><path d="M7.6 4h8.4M7.6 9h8.4M7.6 14h8.4"/></g>`, o),
  // ---- card action bar (new to-do card; drawn on a 16 grid = 1 unit per CSS px at 16px, Things' metrics) ----
  'act-when': o => svg('0 0 16 16',
    `<rect x=".5" y="1.5" width="15" height="13" rx="2.6" fill="none" stroke="currentColor"/>` +
    `<path d="M1.6 4.45H14.4" stroke="currentColor" stroke-width=".85"/>` +
    `<g fill="currentColor"><rect x="3.5" y="7" width="1.5" height="1"/><rect x="7.25" y="7" width="1.5" height="1"/><rect x="11" y="7" width="1.5" height="1"/>` +
    `<rect x="3.5" y="9" width="1.5" height="1"/><rect x="7.25" y="9" width="1.5" height="1"/><rect x="11" y="9" width="1.5" height="1"/>` +
    `<rect x="3.5" y="11" width="1.5" height="1"/><rect x="7.25" y="11" width="1.5" height="1"/><rect x="11" y="11" width="1.5" height="1"/></g>`, o),
  // iOS proportions: a slimmer header rule and a tighter grid of dash-like day marks
  'act-when-phone': o => svg('0 0 16 16',
    `<rect x=".5" y="1.5" width="15" height="13" rx="2.6" fill="none" stroke="currentColor"/>` +
    `<path d="M1.4 4.5H14.6" stroke="currentColor" stroke-width=".7"/>` +
    `<g fill="currentColor"><rect x="3.75" y="6.55" width="1.8" height=".7"/><rect x="7.1" y="6.55" width="1.8" height=".7"/><rect x="10.45" y="6.55" width="1.8" height=".7"/>` +
    `<rect x="3.75" y="8.9" width="1.8" height=".7"/><rect x="7.1" y="8.9" width="1.8" height=".7"/><rect x="10.45" y="8.9" width="1.8" height=".7"/>` +
    `<rect x="3.75" y="11.25" width="1.8" height=".7"/><rect x="7.1" y="11.25" width="1.8" height=".7"/><rect x="10.45" y="11.25" width="1.8" height=".7"/></g>`, o),
  'act-tags': o => svg('0 0 16 16',
    `<path d="M3 1.5H7.05Q8.25 1.5 9.1 2.35L13.875 7.125Q15.625 8.875 13.875 10.625L10.625 13.875Q8.875 15.625 7.125 13.875L2.35 9.1Q1.5 8.25 1.5 7.05V3Q1.5 1.5 3 1.5Z" fill="none" stroke="currentColor" stroke-linejoin="round"/>` +
    `<circle cx="4.5" cy="4.5" r=".95" fill="currentColor"/>`, o),
  'act-checklist': o => svg('0 0 16 16',
    `<g fill="none" stroke="currentColor"><circle cx="4" cy="3" r="1.5"/><circle cx="4" cy="8" r="1.5"/><circle cx="4" cy="13" r="1.5"/></g>` +
    `<path d="M7 3.5h6M7 8.5h6M7 13.5h6" stroke="currentColor"/>`, o),
  // iOS proportions: the same bullets with longer rules, as Things draws it on iPhone
  'act-checklist-phone': o => svg('0 0 16 16',
    `<g fill="none" stroke="currentColor"><circle cx="3" cy="3" r="1.5"/><circle cx="3" cy="8" r="1.5"/><circle cx="3" cy="13" r="1.5"/></g>` +
    `<path d="M6.25 3.5H14M6.25 8.5H14M6.25 13.5H14" stroke="currentColor"/>`, o),
  'act-deadline': o => svg('0 0 16 16',
    `<path d="M2 1.5v13" stroke="currentColor"/>` +
    `<path d="M4 2.5h10l-2.5 3 2.5 3H4z" fill="none" stroke="currentColor" stroke-linejoin="round"/>`, o),
  notes: o => svg('0 0 10 12', `<path d="M1.3 1.2c0-.3.2-.5.5-.5h4.3l2.6 2.7v7.4c0 .3-.2.5-.5.5H1.8c-.3 0-.5-.2-.5-.5z" fill="none" stroke="currentColor" stroke-width=".95" stroke-linejoin="round"/><path d="M6 .8v2.8h2.7" fill="none" stroke="currentColor" stroke-width=".95" stroke-linejoin="round"/>`, o),
  'checklist-glyph': o => svg('0 0 12 12',
    `<g fill="none" stroke="currentColor" stroke-width=".9"><circle cx="2" cy="2.2" r="1.1"/><circle cx="2" cy="6" r="1.1"/><circle cx="2" cy="9.8" r="1.1"/></g>` +
    `<path d="M4.8 2.2h6.4M4.8 6h6.4M4.8 9.8h6.4" stroke="currentColor" stroke-width=".95" stroke-linecap="round"/>`, o),
  bell: o => svg('0 0 12 12', `<path d="M6 1.2a3.2 3.2 0 0 0-3.2 3.2v2.5L1.7 8.6h8.6L9.2 6.9V4.4A3.2 3.2 0 0 0 6 1.2z" fill="currentColor"/><path d="M4.8 9.6a1.2 1.2 0 0 0 2.4 0" fill="currentColor"/>`, o),
  dots: o => svg('0 0 20 6', `<circle cx="3" cy="3" r="1.85" fill="currentColor"/><circle cx="10" cy="3" r="1.85" fill="currentColor"/><circle cx="17" cy="3" r="1.85" fill="currentColor"/>`, o),
  plus: o => svg('0 0 18 18', `<path d="M9 2.4v13.2M2.4 9h13.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`, o),
  'plus-bold': o => svg('0 0 24 24', `<path d="M12 3.5v17M3.5 12h17" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>`, o),
  search: o => svg('0 0 18 18', `<circle cx="7.6" cy="7.6" r="5.3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M11.5 11.5l4.6 4.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>`, o),
  'arrow-right': o => svg('0 0 18 18', `<path d="M2.6 9h12.2M10.2 4.3 14.9 9l-4.7 4.7" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`, o),
  'heading-plus': o => svg('0 0 20 18', `<path d="M2 4.2c0-1 .8-1.8 1.8-1.8h9.3c.5 0 1 .2 1.3.6l3.4 4.7c.4.6.4 1.4 0 2l-3.4 4.7c-.3.4-.8.6-1.3.6H3.8c-1 0-1.8-.8-1.8-1.8z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M9.3 5.8v6.4M6.1 9h6.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>`, o),
  'chevron-left': o => svg('0 0 12 20', `<path d="M10 1.5 2 10l8 8.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>`, o),
  'chevron-right': o => svg('0 0 10 16', `<path d="M2.5 1.8 8.3 8l-5.8 6.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`, o),
  'chevron-down': o => svg('0 0 16 10', `<path d="M1.8 2 8 8l6.2-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`, o),
  'circle-chevron': o => svg('0 0 32 32', `<circle cx="16" cy="16" r="14.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9.6 13.2 16 19.4l6.4-6.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`, o),
  cloud: o => svg('0 0 16 16', `<path d="M4.5 13.1H11.8A2.8 2.8 0 0 0 12.2 7.5A4 4 0 0 0 4.6 6.9A3.1 3.1 0 0 0 4.5 13.1Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>`, o),
  close: o => svg('0 0 16 16', `<path d="M3.3 3.3l9.4 9.4M12.7 3.3l-9.4 9.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`, o),
  'close-small': o => svg('0 0 10 10', `<path d="M2 2l6 6M8 2 2 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`, o),
  sliders: o => svg('0 0 20 18',
    `<g stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M1.5 3.5h17M1.5 9h17M1.5 14.5h17"/></g>` +
    `<g fill="#f6f6f8" stroke="currentColor" stroke-width="1.2"><circle cx="13" cy="3.5" r="2"/><circle cx="6.5" cy="9" r="2"/><circle cx="11" cy="14.5" r="2"/></g>`, o),
  check: o => svg('0 0 16 16', `<path d="M2.8 8.6l3.3 3.3 7.2-7.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`, o),
  handle: o => svg('0 0 16 10', `<path d="M1.5 1.5h13M1.5 5h13M1.5 8.5h13" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>`, o),
  'box-small': o => svg('0 0 16 16', `<rect x="1" y="2" width="14" height="3.7" rx=".9" fill="#d3bf76"/><path d="M2.1 6.6h11.8v6.9a1.3 1.3 0 0 1-1.3 1.3H3.4a1.3 1.3 0 0 1-1.3-1.3z" fill="#c9b36a"/><rect x="5.6" y="8.3" width="4.8" height="1.5" rx=".75" fill="#fff"/>`, o),
  'checkbox-empty': o => svg('0 0 16 16', `<rect x="1.5" y="1.5" width="13" height="13" rx="3.2" fill="#fff" stroke="currentColor" stroke-width="1.3"/>`, o),
  'check-all': o => svg('0 0 18 18', `<rect x="1.8" y="1.8" width="14.4" height="14.4" rx="3.4" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5.3 9.3l2.5 2.5 5-5.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`, o),
  trashcan: o => svg('0 0 18 18', `<path d="M3.2 4.6h11.6M7 4.4V2.8h4v1.6M4.6 4.6l.8 10.4c.1.8.7 1.4 1.5 1.4h4.2c.8 0 1.4-.6 1.5-1.4l.8-10.4" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/>`, o),
};

export function icon(name, opts = {}) {
  const f = ICONS[name];
  return f ? f(opts) : '';
}

/** List icon for a built-in view. */
export function viewIcon(view, opts) {
  return icon({ inbox: 'inbox', today: 'today', upcoming: 'upcoming', anytime: 'anytime', someday: 'someday', logbook: 'logbook', lists: 'inbox' }[view] || 'inbox', opts);
}

/**
 * Progress pie: a ring with a wedge inside. `p` is 0..1.
 * opts: { size, stroke, gap, color, cls }
 */
export function pie(p, { size = 16, stroke = 1.3, gap = 1.6, color = 'currentColor', cls = '', dashed = false } = {}) {
  const c = size / 2;
  const r = c - stroke / 2;
  const ri = r - stroke / 2 - gap;
  let wedge = '';
  const v = Math.max(0, Math.min(1, p || 0));
  if (v >= 0.999) wedge = `<circle cx="${c}" cy="${c}" r="${ri.toFixed(2)}" fill="${color}"/>`;
  else if (v > 0.001) {
    const a = v * 2 * Math.PI - Math.PI / 2;
    const x = (c + ri * Math.cos(a)).toFixed(2), y = (c + ri * Math.sin(a)).toFixed(2);
    wedge = `<path d="M${c} ${c}V${(c - ri).toFixed(2)}A${ri.toFixed(2)} ${ri.toFixed(2)} 0 ${v > 0.5 ? 1 : 0} 1 ${x} ${y}Z" fill="${color}"/>`;
  }
  const ring = `<circle cx="${c}" cy="${c}" r="${r.toFixed(2)}" fill="none" stroke="${color}" stroke-width="${stroke}"${dashed ? ` stroke-dasharray="2 1.6"` : ''}/>`;
  return `<svg class="ico pie ${cls}" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">${ring}${wedge}</svg>`;
}

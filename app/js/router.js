// Hash routing (shared).
//   #/  #/all  #/completed                          Inbox (a bare route is Active; #/active is accepted too)
//   #/today[/all|/completed]  (upcoming, anytime, someday likewise)
//   #/logbook[/active|/completed]                   the Logbook is the one list whose bare route is All
//   #/project/<id>[/filter]  #/area/<id>[/filter]
//   #/lists                                          phone home (desktop: sidebar + Inbox, no selection)

export const FILTERS = ['active', 'all', 'completed']; // pill order; Active is the first and default pill
const SIMPLE = ['today', 'upcoming', 'anytime', 'someday', 'logbook', 'lists', 'inbox'];

/** The filter a list shows when its route names none: Active everywhere, All in the Logbook (it holds only finished to-dos). */
export const defaultFilter = view => view === 'logbook' ? 'all' : 'active';

export function parse(hash = location.hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(p => decodeURIComponent(p));
  let view = 'inbox', id = null, filter = null;
  const f = p => FILTERS.includes(p) ? p : null;
  if (!parts.length) { /* inbox */ }
  else if (f(parts[0])) filter = parts[0];
  else if (SIMPLE.includes(parts[0])) { view = parts[0]; filter = f(parts[1]); }
  else if (parts[0] === 'project' || parts[0] === 'area') { view = parts[0]; id = parts[1] || null; filter = f(parts[2]); }
  return { view, id, filter: filter || defaultFilter(view) };
}

/** Base hash of a list, without filter: the list under its default filter. */
export function baseHref(view, id) {
  if (view === 'inbox') return '#/';
  if (view === 'project' || view === 'area') return `#/${view}/${encodeURIComponent(id)}`;
  return `#/${view}`;
}

/** Hash that opens a list from the sidebar, Quick Find or a group heading: its default filter (Active; All for the Logbook). */
export function listHref(view, id) {
  return baseHref(view, id);
}

/** Hash for a filter link of the current list. The default filter is the bare route; the others add a segment
 *  (the Inbox and #/lists use #/, #/all, #/completed). */
export function filterHref(route, filter) {
  const bare = filter === defaultFilter(route.view);
  if (route.view === 'inbox' || route.view === 'lists') return bare ? '#/' : `#/${filter}`;
  const base = baseHref(route.view, route.id);
  return bare ? base : `${base}/${filter}`;
}

export function go(hash) {
  if (location.hash === hash || (hash === '#/' && (location.hash === '' || location.hash === '#'))) return;
  location.hash = hash;
}

export function onChange(fn) { window.addEventListener('hashchange', fn); }

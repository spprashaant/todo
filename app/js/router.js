// Hash routing (shared).
//   #/  #/active  #/completed                       Inbox
//   #/today[/active|/completed]  (upcoming, anytime, someday, logbook likewise)
//   #/project/<id>[/filter]  #/area/<id>[/filter]
//   #/lists                                          phone home (desktop: sidebar + Inbox, no selection)

export const FILTERS = ['active', 'all', 'completed']; // pill order; Active is the first and default pill
const SIMPLE = ['today', 'upcoming', 'anytime', 'someday', 'logbook', 'lists', 'inbox'];

export function parse(hash = location.hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(p => decodeURIComponent(p));
  let view = 'inbox', id = null, filter = 'all';
  const f = p => (p === 'active' || p === 'completed') ? p : 'all';
  if (!parts.length) { /* inbox */ }
  else if (parts[0] === 'active' || parts[0] === 'completed') filter = parts[0];
  else if (SIMPLE.includes(parts[0])) { view = parts[0]; filter = f(parts[1]); }
  else if (parts[0] === 'project' || parts[0] === 'area') { view = parts[0]; id = parts[1] || null; filter = f(parts[2]); }
  return { view, id, filter };
}

/** Base hash of a list, without filter. */
export function baseHref(view, id) {
  if (view === 'inbox') return '#/';
  if (view === 'project' || view === 'area') return `#/${view}/${encodeURIComponent(id)}`;
  return `#/${view}`;
}

/** Hash that opens a list from the sidebar, Quick Find or a group heading: its Active filter. The Logbook
 *  holds only finished to-dos, so it opens under All. (`#/` and the other bare routes stay All, see above.) */
export function listHref(view, id) {
  if (view === 'logbook' || view === 'lists') return baseHref(view, id);
  return filterHref({ view, id }, 'active');
}

/** Hash for a filter link of the current list. The Inbox (and #/lists) use #/, #/active, #/completed. */
export function filterHref(route, filter) {
  if (route.view === 'inbox' || route.view === 'lists') return filter === 'all' ? '#/' : `#/${filter}`;
  const base = baseHref(route.view, route.id);
  return filter === 'all' ? base : `${base}/${filter}`;
}

export function go(hash) {
  if (location.hash === hash || (hash === '#/' && (location.hash === '' || location.hash === '#'))) return;
  location.hash = hash;
}

export function onChange(fn) { window.addEventListener('hashchange', fn); }

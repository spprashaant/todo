// Sidebar on desktop; the lists home screen (#/lists) on phone (piece: sidebar).
import { icon, viewIcon, pie } from './icons.js';
import { state, counts, projectProgress, getArea, addProject, addArea } from './store.js';
import { go, listHref } from './router.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Collapsed areas (a view preference, like Things' disclosure chevrons). Kept apart from the to-do data.
const PREFS_KEY = 'things-sidebar';
const collapsed = new Set();
try {
  const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
  if (p && Array.isArray(p.collapsed)) p.collapsed.forEach(id => collapsed.add(String(id)));
} catch {}
function saveCollapsed() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ collapsed: [...collapsed] })); } catch {}
}

function item({ href, key, ic, title, cls = '', badge = 0, count = 0, selected }) {
  return `<a class="sb-item ${cls}${selected === key ? ' selected' : ''}" href="${href}" data-key="${esc(key)}">` +
    `<span class="sb-icon">${ic}</span><span class="sb-title">${esc(title)}</span>` +
    (badge ? `<span class="sb-badge">${badge}</span>` : '') +
    (count ? `<span class="sb-count">${count}</span>` : '') +
  `</a>`;
}

function selectedKey(route) {
  if (route.view === 'lists') return null;
  if (route.view === 'project' || route.view === 'area') return `${route.view}:${route.id}`;
  return route.view;
}

function discloseHTML(id, title, isCollapsed) {
  return `<button class="sb-disclose" type="button" data-sb-toggle="${esc(id)}" aria-expanded="${!isCollapsed}" ` +
    `aria-label="${isCollapsed ? 'Show' : 'Hide'} projects in ${esc(title)}">${icon('chevron-down')}</button>`;
}

export function navHTML(route, ctx) {
  const c = counts();
  const sel = selectedKey(route);
  const phone = ctx.layout === 'phone';
  const pieOpts = phone ? { size: 18, stroke: 1.3, gap: 1.25 } : { size: 15, stroke: 1.25, gap: 1.45 };
  let h = '';
  h += `<div class="sb-group">${item({ href: listHref('inbox'), key: 'inbox', ic: viewIcon('inbox'), title: 'Inbox', count: c.inbox, selected: sel })}</div>`;
  h += `<div class="sb-group">` +
    item({ href: listHref('today'), key: 'today', ic: viewIcon('today'), title: 'Today', badge: c.due, count: c.today, selected: sel }) +
    item({ href: listHref('upcoming'), key: 'upcoming', ic: viewIcon('upcoming'), title: 'Upcoming', selected: sel }) +
    item({ href: listHref('anytime'), key: 'anytime', ic: viewIcon('anytime'), title: 'Anytime', selected: sel }) +
    item({ href: listHref('someday'), key: 'someday', ic: viewIcon('someday'), title: 'Someday', selected: sel }) +
    `</div>`;
  h += `<div class="sb-group">${item({ href: '#/logbook', key: 'logbook', ic: viewIcon('logbook'), title: 'Logbook', selected: sel })}</div>`;

  const { projects, areas } = state.lists;
  const projectItem = p => item({ href: listHref('project', p.id), key: `project:${p.id}`, cls: 'sb-project', ic: pie(projectProgress(p.id), pieOpts), title: p.title || 'New Project', selected: sel });
  const loose = projects.filter(p => !p.area || !getArea(p.area));
  if (loose.length) h += `<div class="sb-group sb-lists">${loose.map(projectItem).join('')}</div>`;
  for (const a of areas) {
    const title = a.title || 'New Area';
    const mine = projects.filter(p => p.area === a.id);
    const shut = collapsed.has(a.id) && mine.length > 0;
    h += `<div class="sb-group sb-lists${shut ? ' collapsed' : ''}" data-area="${esc(a.id)}">` +
      `<div class="sb-area-row">` +
        item({ href: listHref('area', a.id), key: `area:${a.id}`, cls: 'sb-area', ic: icon('area'), title, selected: sel }) +
        (mine.length ? discloseHTML(a.id, title, shut) : '') +
      `</div>` +
      `<div class="sb-area-projects">${mine.map(projectItem).join('')}</div>` +
      `</div>`;
  }
  return h;
}

export function render(els, route, ctx) {
  const html = navHTML(route, ctx);
  if (els.nav.__html !== html) { els.nav.innerHTML = html; els.nav.__html = html; }
  const foot = `<button class="sb-new" type="button" data-sb="new-list">${icon('plus')}<span>New List</span></button>` +
    `<button class="sb-settings" type="button" data-sb="settings" aria-label="Settings" title="Settings">${icon('sliders')}</button>`;
  if (els.foot.__html !== foot) { els.foot.innerHTML = foot; els.foot.__html = foot; }
  // Phone lists home: a Quick Find field at the top.
  const showSearch = ctx.layout === 'phone' && route.view === 'lists';
  const search = showSearch ? `<button class="sb-search" type="button" data-action="quickfind">${icon('search')}<span>Quick Find</span></button>` : '';
  if (els.search.__html !== search) { els.search.innerHTML = search; els.search.__html = search; }
}

/** api: { openMenu(anchor, items, opts), quickfind(), focusTitle(), sync(), sounds() (null in a browser: the Android app's Reminder Sound panel) } */
export function bind(els, api) {
  els.nav.addEventListener('click', e => {
    const b = e.target.closest('[data-sb-toggle]');
    if (!b) return;
    e.preventDefault();
    const id = b.dataset.sbToggle;
    const shut = !collapsed.has(id);
    if (shut) collapsed.add(id); else collapsed.delete(id);
    saveCollapsed();
    // Flip it in place; the next render produces the same markup from the saved state.
    const group = b.closest('.sb-group');
    group?.classList.toggle('collapsed', shut);
    b.setAttribute('aria-expanded', String(!shut));
    const title = group?.querySelector('.sb-area .sb-title')?.textContent || '';
    b.setAttribute('aria-label', `${shut ? 'Show' : 'Hide'} projects in ${title}`);
    els.nav.__html = null;
  });
  els.foot.addEventListener('click', e => {
    const b = e.target.closest('[data-sb]');
    if (!b) return;
    if (b.dataset.sb === 'new-list') {
      api.openMenu(b, [
        { label: 'New Project', icon: pie(0, { size: 14, stroke: 1.2 }), run: () => { const p = addProject({ title: 'New Project' }); go(`#/project/${encodeURIComponent(p.id)}`); api.focusTitle(); } },
        { label: 'New Area', icon: icon('area'), run: () => { const a = addArea({ title: 'New Area' }); go(`#/area/${encodeURIComponent(a.id)}`); api.focusTitle(); } },
      ], { above: true });
    } else if (b.dataset.sb === 'settings') {
      const items = [
        { label: 'Quick Find', icon: icon('search'), run: () => api.quickfind() },
        { label: 'Logbook', icon: icon('logbook'), run: () => go('#/logbook') },
        { sep: true },
        { label: 'Sync…', icon: icon('cloud'), run: () => api.sync() },
      ];
      if (api.sounds) items.push({ label: 'Reminder Sound…', icon: icon('bell'), run: () => api.sounds() });
      api.openMenu(b, items, { align: 'end' });
    }
  });
}

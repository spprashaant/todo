// Top-level render (shared): builds the view model for the current route and composes the pieces.
import * as store from './store.js';
import { state, ui } from './store.js';
import * as router from './router.js';
import { icon, viewIcon, pie } from './icons.js';
import { todayISO, daysFromToday, parseISO, iso, MONTHS, DAYS, addDays, startOfToday } from './dates.js';
import * as rows from './rows.js';
import * as project from './project.js';
import * as sidebar from './sidebar.js';
import * as detail from './detail.js';
import * as composer from './composer.js';
import * as quickfind from './quickfind.js';
import * as when from './when.js';
import * as account from './account.js';
import * as sounds from './sounds.js';
import { isNative } from './native.js';

const $ = id => document.getElementById(id);
const phoneMQ = matchMedia('(max-width: 699px)');
let route = router.parse();
let model = null;
let els = {};

export const currentRoute = () => route;
export const currentModel = () => model;
const ctx = () => ({ route, model, layout: ui.layout, editingId: ui.editingId, selected: ui.selected });

// ---------- view model ----------
const byWhen = (a, b) => (a.when < b.when ? -1 : a.when > b.when ? 1 : 0);

function groupByLists(items, vis) {
  const groups = [];
  const { projects, areas } = state.lists;
  const projectIds = new Set(projects.map(p => p.id));
  const areaIds = new Set(areas.map(a => a.id));
  const loose = items.filter(t => !(t.project && projectIds.has(t.project)) && !(t.area && areaIds.has(t.area)));
  groups.push({ key: 'loose', kind: 'plain', todos: loose.filter(vis) });
  const projectGroup = p => ({ key: 'lp:' + p.id, kind: 'list', title: p.title, list: { type: 'project', id: p.id }, todos: items.filter(t => t.project === p.id && vis(t)) });
  for (const p of projects.filter(p => !p.area || !areaIds.has(p.area))) groups.push(projectGroup(p));
  for (const a of areas) {
    groups.push({ key: 'la:' + a.id, kind: 'list', title: a.title, list: { type: 'area', id: a.id }, todos: items.filter(t => !(t.project && projectIds.has(t.project)) && t.area === a.id && vis(t)) });
    for (const p of projects.filter(p => p.area === a.id)) groups.push(projectGroup(p));
  }
  return groups;
}

export function buildModel(r) {
  const all = state.todos;
  const vis = t => store.passesFilter(t, r.filter);
  const m = { view: r.view, id: r.id, title: '', items: [], groups: [], opts: {}, newFields: {}, notes: '' };
  switch (r.view) {
    case 'today': {
      m.title = 'Today';
      m.items = all.filter(store.inToday);
      const ev = t => t.when === 'evening';
      m.groups = [
        { key: 'today', kind: 'plain', todos: m.items.filter(t => !ev(t) && vis(t)) },
        { key: 'evening', kind: 'evening', title: 'This Evening', todos: m.items.filter(t => ev(t) && vis(t)) },
      ];
      m.opts = { sub: true, star: false, badge: false };
      m.newFields = { when: 'today' };
      break;
    }
    case 'upcoming': {
      m.title = 'Upcoming';
      m.items = all.filter(store.inUpcoming).slice().sort(byWhen);
      const groups = new Map();
      for (const t of m.items) {
        const n = daysFromToday(t.when);
        const d = parseISO(t.when);
        let key, g;
        if (n <= 7) { key = 'd:' + t.when; g = { key, kind: 'date', date: t.when, todos: [] }; }
        else {
          key = 'm:' + t.when.slice(0, 7);
          const sameYear = d.getFullYear() === new Date().getFullYear();
          g = { key, kind: 'month', title: MONTHS[d.getMonth()] + (sameYear ? '' : ' ' + d.getFullYear()), todos: [] };
        }
        if (!groups.has(key)) groups.set(key, g);
        if (vis(t)) groups.get(key).todos.push(t);
      }
      m.groups = [{ key: 'up-lead', kind: 'plain', todos: [] }, ...groups.values()];
      m.opts = { sub: true, star: false, badge: false };
      m.newFields = { when: iso(addDays(startOfToday(), 1)) };
      break;
    }
    case 'anytime': {
      m.title = 'Anytime';
      m.items = all.filter(store.inAnytime);
      m.groups = groupByLists(m.items, vis);
      m.opts = { sub: false, star: true, badge: true };
      m.newFields = {};
      break;
    }
    case 'someday': {
      m.title = 'Someday';
      m.items = all.filter(store.inSomeday);
      m.groups = groupByLists(m.items, vis);
      m.opts = { sub: false, star: false, badge: false };
      m.newFields = { when: 'someday' };
      break;
    }
    case 'logbook': {
      m.title = 'Logbook';
      m.items = all.filter(t => t.completed).slice().sort((a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')));
      const groups = new Map();
      for (const t of m.items) {
        const d = t.completedAt ? new Date(t.completedAt) : null;
        let key = 'lg:older', title = 'Earlier';
        if (d && !isNaN(d)) {
          const n = -daysFromToday(iso(d));
          if (n <= 0) { key = 'lg:today'; title = 'Today'; }
          else if (n === 1) { key = 'lg:yesterday'; title = 'Yesterday'; }
          else if (n < 7) { key = 'lg:' + iso(d); title = DAYS[d.getDay()]; }
          else { key = 'lg:' + iso(d).slice(0, 7); title = MONTHS[d.getMonth()] + (d.getFullYear() === new Date().getFullYear() ? '' : ' ' + d.getFullYear()); }
        }
        if (!groups.has(key)) groups.set(key, { key, kind: 'logday', title, todos: [] });
        if (vis(t)) groups.get(key).todos.push(t);
      }
      m.groups = [{ key: 'lg-lead', kind: 'plain', todos: [] }, ...groups.values()];
      m.opts = { sub: true, star: false, badge: false };
      m.newFields = null;
      break;
    }
    case 'project': {
      const p = store.getProject(r.id);
      m.title = p ? (p.title || 'New Project') : 'Not Found';
      m.notes = p?.notes || '';
      m.items = p ? all.filter(t => t.project === p.id) : [];
      const hs = p ? p.headings : [];
      const hIds = new Set(hs.map(h => h.id));
      m.groups = [
        { key: 'main', kind: 'plain', todos: m.items.filter(t => !hIds.has(t.heading) && vis(t)) },
        ...hs.map(h => ({ key: 'h:' + h.id, kind: 'heading', title: h.title, heading: h, todos: m.items.filter(t => t.heading === h.id && vis(t)) })),
      ];
      m.opts = { sub: false, star: true, badge: true };
      m.newFields = p ? { project: p.id } : null;
      break;
    }
    case 'area': {
      const a = store.getArea(r.id);
      m.title = a ? (a.title || 'New Area') : 'Not Found';
      m.area = a;
      m.items = a ? all.filter(t => t.area === a.id && !t.project) : [];
      m.groups = [{ key: 'main', kind: 'plain', todos: m.items.filter(vis) }];
      m.opts = { sub: false, star: true, badge: true };
      m.newFields = a ? { area: a.id } : null;
      break;
    }
    default: { // inbox and #/lists
      m.view = r.view === 'lists' ? 'inbox' : r.view;
      m.title = 'Inbox';
      m.items = all.filter(store.inInbox);
      m.groups = [{ key: 'main', kind: 'plain', todos: m.items.filter(vis) }];
      m.opts = { sub: false, star: false, badge: true };
      m.newFields = {};
    }
  }
  // Under All, open to-dos come first in each section and finished ones sink to its bottom, in list order.
  if (r.filter === 'all') for (const g of m.groups) g.todos = [...g.todos.filter(t => !t.completed), ...g.todos.filter(t => t.completed)];
  return m;
}

// ---------- chrome ----------
function toolbarHTML(r) {
  const sel = !!ui.selected && !!store.getTodo(ui.selected);
  const inProject = r.view === 'project' && store.getProject(r.id);
  return `<div class="tools">` +
    `<button class="tool" type="button" data-action="new-todo" title="New To-Do" aria-label="New To-Do">${icon('plus')}</button>` +
    (inProject ? `<button class="tool" type="button" data-tool="heading" title="New Heading" aria-label="New Heading">${icon('heading-plus')}</button>` : '') +
    `<label class="tool" for="toggle-all" title="Complete All" aria-label="Complete All">${icon('check-all')}</label>` +
    `<button class="tool${sel ? '' : ' off'}" type="button" data-tool="when" title="When" aria-label="When">${icon('calendar')}</button>` +
    `<button class="tool${sel ? '' : ' off'}" type="button" data-tool="move" title="Move" aria-label="Move">${icon('arrow-right')}</button>` +
    `<button class="tool" type="button" data-action="quickfind" title="Quick Find" aria-label="Quick Find">${icon('search')}</button>` +
  `</div>`;
}

function topbarHTML(r, m) {
  const titleIcon = r.view === 'project' ? pie(store.projectProgress(r.id), { size: 18, stroke: 1.6, gap: 1.6, color: 'var(--blue)' }) : r.view === 'area' ? icon('area') : viewIcon(m.view);
  return `<a class="tb-btn tb-back" href="#/lists" aria-label="Lists">${icon('chevron-left', { size: 20 })}</a>` +
    `<div class="tb-title">${titleIcon}<span>${rows.esc(m.title)}</span></div>` +
    `<div class="tb-right">` +
      `<button class="tb-btn tb-search" type="button" data-action="quickfind" aria-label="Quick Find">${icon('search', { size: 20 })}</button>` +
      `<button class="tb-btn tb-more" type="button" data-tool="list-menu" aria-label="List actions">${icon('circle-chevron', { size: 30 })}</button>` +
    `</div>`;
}

function footerEl() {
  let f = document.querySelector('.footer');
  if (!f) {
    f = document.createElement('footer');
    f.className = 'footer';
    f.innerHTML = `<span class="todo-count"></span><button class="clear-completed" type="button">Clear completed</button>`;
    f.querySelector('.clear-completed').addEventListener('click', () => {
      const ids = model.items.filter(t => t.completed).map(t => t.id);
      store.clearCompleted(ids);
    });
  }
  return f;
}

function fab() {
  let b = document.querySelector('.fab');
  if (!b) {
    b = document.createElement('button');
    b.type = 'button';
    b.className = 'fab';
    b.setAttribute('data-action', 'new-todo');
    b.setAttribute('aria-label', 'New To-Do');
    b.innerHTML = icon('plus-bold');
  }
  return b;
}

// ---------- render ----------
let lastRouteKey = '';
let shownIds = new Set();
export function render() {
  ui.shownDay = todayISO(); // the day this drawing is for (Complete All flips what was drawn; see store.toggleAll)
  model = buildModel(route);
  // A to-do that leaves the list on screen (completed or reopened out of a filter, moved, or changed in
  // another tab) takes its open card with it, and a selection the person can no longer see, so no key
  // (Backspace, Cmd/Ctrl+K) acts on a to-do that isn't there to see.
  const shown = new Set(model.groups.flatMap(g => g.todos.map(t => t.id)));
  if (ui.editingId && !shown.has(ui.editingId)) {
    if (ui.selected === ui.editingId) ui.selected = null;
    ui.editingId = null;
  }
  if (ui.selected && shownIds.has(ui.selected) && !shown.has(ui.selected)) ui.selected = null;
  shownIds = shown;
  const c = ctx();
  const phone = ui.layout === 'phone';
  const routeKey = route.view + '|' + route.id + '|' + route.filter;

  els.app.classList.toggle('at-lists', route.view === 'lists');
  els.app.classList.toggle('is-phone', phone);
  els.app.dataset.view = model.view;

  sidebar.render(els.sb, route, c);
  project.renderHeader(els.header, model, route, c);

  // area view: its projects above the to-dos
  let ap = document.getElementById('area-projects');
  const apHTML = route.view === 'area' && model.area ? project.areaProjectsHTML(model.area) : '';
  if (apHTML) {
    if (!ap) { ap = document.createElement('div'); ap.id = 'area-projects'; els.listBody.insertBefore(ap, els.main); }
    if (ap.__html !== apHTML) { ap.innerHTML = apHTML; ap.__html = apHTML; }
  } else ap?.remove();

  rows.renderGroups(els.groups, model.groups, model.opts, c);

  // TodoMVC: .main and .footer only when the list has to-dos
  const total = model.items.length;
  els.main.style.display = total ? '' : 'none';
  const f = footerEl();
  const target = phone ? els.listBody : els.toolbar;
  if (f.parentElement !== target) target.append(f);
  f.style.display = total ? '' : 'none';
  const active = model.items.filter(t => !t.completed).length;
  const countText = `<strong>${active}</strong> ${active === 1 ? 'item' : 'items'} left`;
  const countEl = f.querySelector('.todo-count');
  if (countEl.innerHTML !== countText) countEl.innerHTML = countText;
  const anyDone = model.items.some(t => t.completed);
  f.querySelector('.clear-completed').style.display = anyDone ? '' : 'none';
  els.toggleAll.checked = store.allCompleted(model.items);

  // empty state
  const empty = !total && !ui.composing && !(route.view === 'area' && apHTML);
  els.empty.classList.toggle('show', empty);
  if (empty) {
    const ic = route.view === 'project' ? pie(0, { size: 84, stroke: 5, color: '#000' }) : route.view === 'area' ? icon('area') : viewIcon(model.view);
    if (els.empty.__view !== model.view + route.id) { els.empty.innerHTML = ic; els.empty.__view = model.view + route.id; }
  }

  // chrome per layout
  if (!phone) {
    const tb = toolbarHTML(route);
    let tools = els.toolbar.querySelector('.tools');
    if (!tools || tools.__html !== tb) {
      tools?.remove();
      els.toolbar.insertAdjacentHTML('afterbegin', tb);
      tools = els.toolbar.querySelector('.tools');
      tools.__html = tb;
    }
    document.querySelector('.fab')?.remove();
    if (els.topbar.innerHTML) { els.topbar.innerHTML = ''; els.topbar.__html = ''; }
  } else {
    els.toolbar.querySelector('.tools')?.remove();
    const tb = route.view === 'lists' ? '' : topbarHTML(route, model);
    if (els.topbar.__html !== tb) { els.topbar.innerHTML = tb; els.topbar.__html = tb; }
    const b = fab();
    if (!b.isConnected) document.body.append(b);
    b.hidden = !!ui.editingId || !!ui.composing;
  }

  composer.update(c);
  detail.renderPhoneBar(c);

  const dim = !!ui.editingId || !!ui.composing;
  els.content.classList.toggle('dim', dim);
  els.content.classList.toggle('editing', !!ui.editingId);
  els.content.classList.toggle('composing', !!ui.composing);

  if (routeKey !== lastRouteKey) {
    if (lastRouteKey && route.view + route.id !== lastRouteKey.split('|').slice(0, 2).join('')) els.scroller.scrollTop = 0;
    lastRouteKey = routeKey;
    document.title = route.view === 'lists' ? 'Todos' : `${model.title} – Todos`;
  }
}

// ---------- selection & keyboard ----------
function select(id) {
  if (ui.editingId && ui.editingId !== id) detail.close();
  store.setUI({ selected: id });
}

function moveSelection(delta) {
  const ids = rows.visibleIds(els.groups);
  if (!ids.length) return;
  let i = ids.indexOf(ui.selected);
  i = i < 0 ? (delta > 0 ? 0 : ids.length - 1) : Math.max(0, Math.min(ids.length - 1, i + delta));
  store.setUI({ selected: ids[i] });
  rows.rowEl(ids[i])?.scrollIntoView({ block: 'nearest' });
}

const isText = el => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'button', 'radio'].includes(el.type)) || el.isContentEditable);

function openWhenFor(id, anchor) {
  const t = store.getTodo(id);
  if (!t) return;
  when.open({ anchor: anchor || rows.rowEl(id) || els.toolbar, value: t.when, reminder: t.reminder ?? null, repeatFor: id, onPick: (v, r) => store.updateTodo(id, { when: v, reminder: r }) });
}

function onKeydown(e) {
  const mod = e.metaKey || e.ctrlKey;
  const k = e.key;
  if (mod && !e.shiftKey && !e.altKey && k.toLowerCase() === 'f') {
    e.preventDefault();
    if (!quickfind.isOpen()) quickfind.open({ route, returnFocus: document.activeElement });
    return;
  }
  if (quickfind.isOpen() || when.isOpen() || detail.menuOpen()) return;
  const target = e.target;
  const resting = composer.isResting(target);
  if (isText(target) && !resting) return;
  // a focused button (a card chip, an action icon) takes its own Enter and Space
  if ((k === 'Enter' || k === ' ') && !mod && target?.closest?.('button')) return;

  if (k === '/' && !mod) { e.preventDefault(); quickfind.open({ route, returnFocus: resting ? target : null }); return; }
  if (k === 'Escape') {
    if (ui.editingId) { e.preventDefault(); detail.close(); }
    else if (ui.selected) { store.setUI({ selected: null }); }
    return;
  }
  if (k === 'ArrowDown' || k === 'ArrowUp') {
    e.preventDefault();
    if (resting) target.blur();
    moveSelection(k === 'ArrowDown' ? 1 : -1);
    return;
  }
  if (resting) return;
  const sel = ui.selected && store.getTodo(ui.selected) ? ui.selected : null;
  if (k === 'Enter' && sel && !mod) { e.preventDefault(); detail.open(sel); return; }
  if (k === ' ' && !mod) { e.preventDefault(); composer.open(); return; }
  if ((k === 'Backspace' || k === 'Delete') && sel && !mod) { e.preventDefault(); moveSelection(1); if (ui.selected === sel) store.setUI({ selected: null }); store.removeTodo(sel); return; }
  if (mod && k.toLowerCase() === 'k' && (ui.editingId || sel)) {
    // an open card is the to-do Cmd/Ctrl+K acts on (the card handles it itself while it has focus)
    e.preventDefault();
    if (!e.repeat) store.toggleTodo(ui.editingId && store.getTodo(ui.editingId) ? ui.editingId : sel); // a held key flips it once
    return;
  }
  if (mod && k.toLowerCase() === 's' && sel) { e.preventDefault(); openWhenFor(sel); return; }
  if (mod && k.toLowerCase() === 'e' && sel) { e.preventDefault(); store.updateTodo(sel, { when: 'evening' }); return; }
  if ((e.altKey || (e.ctrlKey && !e.metaKey)) && /^Digit[1-6]$/.test(e.code)) {
    e.preventDefault();
    router.go(['#/', '#/today', '#/upcoming', '#/anytime', '#/someday', '#/logbook'][Number(e.code.slice(5)) - 1]);
    return;
  }
  // type-to-find, like Things
  if (!mod && !e.altKey && k.length === 1 && /\S/.test(k) && !isText(target)) {
    e.preventDefault();
    quickfind.open({ route, query: k });
  }
}

// ---------- init ----------
export function init() {
  els = {
    app: $('app'), content: $('content'), scroller: $('scroller'), header: $('list-header'), listBody: $('list-body'),
    main: $('main'), groups: $('groups'), toggleAll: $('toggle-all'), toolbar: $('toolbar'), topbar: $('topbar'),
    empty: $('empty-state'),
    sb: { nav: $('sidebar-nav'), foot: $('sidebar-foot'), search: $('sidebar-search') },
  };
  store.load();
  ui.layout = phoneMQ.matches ? 'phone' : 'desktop';

  composer.mount($('composer'), ctx);
  rows.bind(els.groups, {
    toggle: (id, done) => store.toggleTodo(id, done),
    destroy: id => store.destroyTodo(id), // (a double-click deletes only the to-do under its first click)
    select,
    open: id => detail.open(id),
    isPhone: () => ui.layout === 'phone',
  });
  detail.bind(els.groups);
  project.bind(els.header, els.groups, { route: () => route, openMenu: (a, items, o) => detail.openMenu(a, items, o) });
  sidebar.bind(els.sb, {
    openMenu: (a, items, o) => detail.openMenu(a, items, o),
    quickfind: () => quickfind.open({ route }),
    sync: () => account.open(),
    sounds: isNative() ? () => sounds.open() : null, // reminders ring in the Android app alone
    // Callers usually navigate first; the header is re-rendered on the (async) hashchange, so focus after it.
    focusTitle: () => {
      const focus = () => requestAnimationFrame(() => { const t = els.header.querySelector('.lh-title'); if (t) { t.focus(); document.getSelection().selectAllChildren(t); } });
      window.addEventListener('hashchange', focus, { once: true });
      setTimeout(focus, 150);
    },
  });

  // Complete All flips the state the person saw (store.toggleAll: the state drawn for the day on screen when
  // the press began), never the box's own state at change time: something that re-renders during the click
  // (the label's click on the box bubbles through the list) writes the old state back before `change` fires.
  // (store.toggleAll is every Complete All's action: a project's and a heading's menus use it too)
  els.toggleAll.addEventListener('change', () => {
    store.toggleAll(model.items);
    els.toggleAll.checked = store.allCompleted(model.items); // (the model the re-render just built)
  });

  // actions by attribute, wherever they live
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-action], [data-tool]');
    if (!a) return;
    const act = a.dataset.action || a.dataset.tool;
    if (act === 'new-todo') {
      if (route.view === 'lists' && ui.layout === 'phone') router.go('#/');
      if (ui.editingId) detail.close();
      if (!composer.open()) { router.go('#/'); requestAnimationFrame(() => composer.open()); }
    } else if (act === 'quickfind') {
      quickfind.open({ route });
    } else if (act === 'heading' && route.view === 'project') {
      const h = store.addHeading(route.id);
      requestAnimationFrame(() => {
        const t = els.groups.querySelector(`[data-heading="${CSS.escape(h.id)}"] .gh-title`);
        if (t) { t.focus(); document.getSelection().selectAllChildren(t); }
      });
    } else if (act === 'when' && a.dataset.tool && ui.selected) {
      openWhenFor(ui.selected, a);
    } else if (act === 'move' && ui.selected) {
      detail.openMoveMenu(a, ui.selected);
    } else if (act === 'list-menu') {
      const items = [
        { html: `<label class="menu-item" for="toggle-all">${icon('check-all')}<span>Complete All</span></label>` },
        { label: 'Clear Completed', icon: icon('trashcan'), run: () => store.clearCompleted(model.items.filter(t => t.completed).map(t => t.id)) },
        { sep: true },
        { label: 'Show Active', checked: route.filter === 'active', run: () => router.go(router.filterHref(route, 'active')) },
        { label: 'Show All', checked: route.filter === 'all', run: () => router.go(router.filterHref(route, 'all')) },
        { label: 'Show Completed', checked: route.filter === 'completed', run: () => router.go(router.filterHref(route, 'completed')) },
        { sep: true },
        { label: 'Sync…', icon: icon('cloud'), run: () => account.open() },
      ];
      if (isNative()) items.push({ label: 'Reminder Sound…', icon: icon('bell'), run: () => sounds.open() });
      if (route.view === 'project') items.splice(2, 0, { label: 'Add Heading', icon: icon('heading-plus'), run: () => store.addHeading(route.id) });
      detail.openMenu(a, items, { align: 'end' });
    }
  });

  // deselect when clicking empty space in the list
  els.scroller.addEventListener('click', e => {
    // (Complete All's label clicks the hidden box in the list: that is not a click on empty space)
    if (ui.selected && !e.target.closest('.todo-list > li, .composer, .list-header a, button, [contenteditable], .toggle-all')) store.setUI({ selected: null });
  });
  els.scroller.addEventListener('scroll', () => {
    els.topbar.classList.toggle('scrolled', els.scroller.scrollTop > 60);
  }, { passive: true });

  document.addEventListener('keydown', onKeydown);
  router.onChange(() => {
    const prev = route;
    route = router.parse();
    if (prev.view !== route.view || prev.id !== route.id) {
      if (ui.editingId) detail.close();
      quickfind.close();
      when.close();
      detail.closeMenu();
      ui.selected = null;
      if (ui.composing) ui.composing = false;
    }
    render();
  });
  phoneMQ.addEventListener('change', () => { ui.layout = phoneMQ.matches ? 'phone' : 'desktop'; render(); });
  store.subscribe(render);

  // A new day redraws the screen with nothing else happening (Today, Upcoming, date badges, the Complete
  // All box): at midnight (a timer that also fires on waking from sleep), and when the page is shown again.
  // Not when that would close an open card (its to-do leaving Today or Upcoming mid-sentence): its next
  // change or closing draws the new day, and until then Complete All still flips what is on screen.
  const followDay = () => {
    if (ui.shownDay === todayISO()) return;
    if (ui.editingId && !buildModel(route).groups.some(g => g.todos.some(t => t.id === ui.editingId))) return;
    render();
  };
  let midnight = 0;
  const armMidnight = () => {
    clearTimeout(midnight);
    const next = startOfToday(); next.setDate(next.getDate() + 1);
    midnight = setTimeout(() => { followDay(); armMidnight(); }, Math.max(1000, next - new Date() + 500));
  };
  armMidnight();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { followDay(); armMidnight(); } });
  addEventListener('pageshow', () => { followDay(); armMidnight(); });

  render();

  // Focus the new to-do field on load where there is a fine pointer (desktop). Never on touch.
  if (matchMedia('(pointer: fine)').matches && ui.layout === 'desktop') composer.focusQuietly();
}

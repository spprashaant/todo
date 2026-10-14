// List header (icon, title, notes, filter pills) for every view, and the project page's
// heading sections (piece: project).
import { icon, viewIcon, pie } from './icons.js';
import { state, getProject, getArea, projectProgress, updateProject, updateArea, updateHeading, removeHeading, addHeading, removeProject, toggleAll } from './store.js';
import { filterHref, listHref, FILTERS, go } from './router.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FILTER_LABEL = { all: 'All', active: 'Active', completed: 'Completed' };

function titleIcon(model, phone) {
  if (model.view === 'project') return pie(projectProgress(model.id), { size: phone ? 24 : 22, stroke: phone ? 2 : 2, gap: phone ? 1.5 : 1.55, color: 'var(--blue)', cls: 'lh-pie' });
  if (model.view === 'area') return icon('area', { cls: 'lh-area' });
  return viewIcon(model.view);
}

/** Header markup for the current view. */
export function headerHTML(model, route, ctx) {
  const phone = ctx.layout === 'phone';
  const editable = model.view === 'project' || model.view === 'area';
  const more = editable ? `<button class="lh-more" type="button" data-menu="list" aria-label="List actions" title="List actions">${icon('dots')}</button>` : '';
  const notes = model.view === 'project' && model.notes
    ? `<div class="lh-notes" contenteditable="plaintext-only" spellcheck="false" data-edit="notes">${esc(model.notes)}</div>` : '';
  const pills = model.items.length
    ? `<ul class="filters">${FILTERS.map(f => `<li><a class="pill${route.filter === f ? ' selected' : ''}" href="${filterHref(route, f)}">${FILTER_LABEL[f]}</a></li>`).join('')}</ul>`
    : '';
  return `<div class="lh-row lh-${model.view}">` +
      `<span class="lh-icon">${titleIcon(model, phone)}</span>` +
      `<h2 class="lh-title"${editable ? ` contenteditable="plaintext-only" spellcheck="false" data-edit="title"` : ''}>${esc(model.title)}</h2>` +
      more +
    `</div>` + notes + pills;
}

let lastKey = '';
export function renderHeader(el, model, route, ctx) {
  const html = headerHTML(model, route, ctx);
  const key = route.view + '|' + route.id;
  const a = document.activeElement;
  if (a && el.contains(a) && a.closest('[data-edit]') && key === lastKey) return; // don't clobber an inline rename
  const hadFocus = a && el.contains(a) ? a.getAttribute('href') : null;
  lastKey = key;
  if (el.__html !== html) {
    el.innerHTML = html;
    el.__html = html;
    if (hadFocus) el.querySelector(`a[href="${CSS.escape(hadFocus)}"]`)?.focus({ preventScroll: true });
  }
  el.className = `list-header lh-view-${model.view}`;
}

/** Blue project heading with rule and a "…" button. */
export function headingHTML(g) {
  return `<div class="group-head gh-heading" data-heading="${esc(g.heading.id)}">` +
    `<span class="gh-title" contenteditable="plaintext-only" spellcheck="false" data-edit="heading">${esc(g.title)}</span>` +
    `<button class="gh-more" type="button" data-menu="heading" aria-label="Heading actions">${icon('dots')}</button>` +
  `</div>`;
}

/** Projects listed inside an area view. */
export function areaProjectsHTML(area) {
  const projects = state.lists.projects.filter(p => p.area === area.id);
  if (!projects.length) return '';
  return `<ul class="area-projects">${projects.map(p =>
    `<li><a class="ap-row" href="${listHref('project', p.id)}"><span class="ap-pie">${pie(projectProgress(p.id), { size: 14, stroke: 1.3, gap: 1.4 })}</span><span class="ap-title">${esc(p.title || 'New Project')}</span></a></li>`).join('')}</ul>`;
}

/**
 * Header + heading interactions (inline rename, menus).
 * api: { route(), openMenu(anchor, items), itemsInView() }
 */
export function bind(headerEl, groupsEl, api) {
  const commitEdit = el => {
    const r = api.route();
    const v = el.textContent.replace(/\s+/g, ' ').trim();
    if (el.dataset.edit === 'title') {
      if (r.view === 'project') updateProject(r.id, { title: v || 'New Project' });
      if (r.view === 'area') updateArea(r.id, { title: v || 'New Area' });
    } else if (el.dataset.edit === 'notes' && r.view === 'project') {
      updateProject(r.id, { notes: el.innerText.trim() });
    } else if (el.dataset.edit === 'heading' && r.view === 'project') {
      const hid = el.closest('[data-heading]').dataset.heading;
      updateHeading(r.id, hid, { title: v || 'Untitled' });
    }
  };
  for (const root of [headerEl, groupsEl]) {
    root.addEventListener('keydown', e => {
      const el = e.target.closest('[data-edit]');
      if (!el) return;
      if ((e.key === 'Enter' && (el.dataset.edit !== 'notes' || e.metaKey || e.ctrlKey)) || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        el.blur();
      }
    });
    root.addEventListener('focusout', e => { const el = e.target.closest?.('[data-edit]'); if (el) commitEdit(el); });
  }

  headerEl.addEventListener('click', e => {
    const b = e.target.closest('[data-menu="list"]');
    if (!b) return;
    const r = api.route();
    const items = [];
    if (r.view === 'project') {
      const p = getProject(r.id);
      items.push({ label: 'Add Notes', icon: icon('notes'), run: () => { updateProject(r.id, { notes: p.notes || ' ' }); requestAnimationFrame(() => { const n = headerEl.querySelector('.lh-notes'); if (n) { n.focus(); document.getSelection().selectAllChildren(n); } }); } });
      items.push({ label: 'Add Heading', icon: icon('heading-plus'), run: () => addHeading(r.id) });
      items.push({ label: 'Complete All', icon: icon('check-all'), run: () => toggleAll(state.todos.filter(t => t.project === r.id)) }); // like the toolbar's: it flips
      items.push({ sep: true });
      items.push({ label: 'Delete Project', icon: icon('trashcan'), run: () => { removeProject(r.id); go('#/'); } });
    } else {
      items.push({ label: 'Rename', icon: icon('area'), run: () => { const t = headerEl.querySelector('.lh-title'); t.focus(); document.getSelection().selectAllChildren(t); } });
    }
    api.openMenu(b, items);
  });

  groupsEl.addEventListener('click', e => {
    const b = e.target.closest('[data-menu="heading"]');
    if (!b) return;
    const r = api.route();
    const hid = b.closest('[data-heading]').dataset.heading;
    api.openMenu(b, [
      { label: 'Rename', icon: icon('heading-plus'), run: () => { const t = b.parentElement.querySelector('.gh-title'); t.focus(); document.getSelection().selectAllChildren(t); } },
      { label: 'Complete All', icon: icon('check-all'), run: () => toggleAll(state.todos.filter(t => t.project === r.id && t.heading === hid)) }, // flips, for the heading's to-dos
      { sep: true },
      { label: 'Delete Heading', icon: icon('trashcan'), run: () => removeHeading(r.id, hid) },
    ], { align: 'end' });
  });
}

export { getArea };

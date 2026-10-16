import { chromium } from 'playwright';
const BASE = 'http://localhost:5173/app/';
const results = [];
const check = async (name, fn) => { try { const r = await fn(); results.push(['PASS', name, r ?? '']); } catch (e) { results.push(['FAIL', name, String(e).split('\n')[0].slice(0, 220)]); } };
const browser = await chromium.launch();

// ---------- desktop ----------
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => m.type() === 'error' && errors.push('console: ' + m.text()));
await page.goto(BASE); await page.waitForLoadState('networkidle');
const todos = () => page.evaluate(() => JSON.parse(localStorage.getItem('things-todos') || '[]'));

await check('empty start, h1 Todos visible, composer focused', async () => {
  if (!(await page.locator('h1', { hasText: /^todos$/i }).isVisible())) throw new Error('h1 not visible');
  const f = await page.evaluate(() => document.activeElement?.className);
  if (!String(f).includes('new-todo')) throw new Error('focused: ' + f);
});
await check('add 3 to Inbox, complete one, persists on reload; Active by default, All on #/all', async () => {
  for (const t of ['Buy milk', 'Call mom', 'Pay rent']) { await page.locator('.new-todo').fill(t); await page.keyboard.press('Enter'); }
  await page.locator('.todo-list li').nth(1).locator('.toggle').click(); // under Active the row leaves the list at once
  await page.reload(); await page.waitForLoadState('networkidle');
  const sel = await page.locator('.filters a.selected').textContent();
  if (sel !== 'Active') throw new Error('selected pill: ' + sel);
  const a = await page.locator('.todo-list li').count();
  if (a !== 2) throw new Error(`active shows ${a}`);
  await page.goto(BASE + '#/all'); await page.waitForTimeout(200);
  const n = await page.locator('.todo-list li').count(), c = await page.locator('.todo-list li.completed').count();
  if (n !== 3 || c !== 1) throw new Error(`n=${n} completed=${c}`);
  await page.goto(BASE + '#/'); await page.waitForTimeout(200);
  return `3 items, 1 completed; Active shows 2`;
});
await check('Today view: composer adds with when=today; sidebar count', async () => {
  await page.goto(BASE + '#/today'); await page.waitForTimeout(300);
  const nt = page.locator('.new-todo');
  if (!(await nt.isVisible())) { await page.locator('[data-action=new-todo]:visible').first().click(); await page.waitForTimeout(200); }
  await page.locator('.new-todo').fill('Water plants'); await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
  const t = (await todos()).find(x => x.title === 'Water plants');
  if (!t) throw new Error('not saved'); if (t.when !== 'today') throw new Error('when=' + t.when);
  if (!(await page.locator('.todo-list li', { hasText: 'Water plants' }).isVisible())) throw new Error('not shown in Today');
  return 'when=today';
});
await check('When picker: schedule "in 3" moves it out of Today into Upcoming', async () => {
  await page.locator('.todo-list li label', { hasText: 'Water plants' }).dblclick(); await page.waitForTimeout(250);
  await page.locator('[data-shot=detail] [data-action=when]').first().click(); await page.waitForTimeout(250);
  const inp = page.locator('[data-shot=when] input:visible');
  if (await inp.count()) { await inp.first().pressSequentially('in 3'); await page.waitForTimeout(150); await page.keyboard.press('Enter'); }
  else { await page.locator('[data-shot=when] .cal-grid button:not([disabled])').nth(5).click(); }
  await page.waitForTimeout(250); await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  const t = (await todos()).find(x => x.title === 'Water plants');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.when || '')) throw new Error('when=' + t.when);
  await page.goto(BASE + '#/upcoming'); await page.waitForTimeout(300);
  if (!(await page.locator('text=Water plants').first().isVisible())) throw new Error('not in Upcoming');
  return 'when=' + t.when;
});
await check('Quick Find: "/" then type then Enter navigates to list', async () => {
  await page.goto(BASE + '#/'); await page.waitForTimeout(200);
  await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('/'); await page.waitForTimeout(250);
  if (!(await page.locator('[data-shot=quickfind]').isVisible())) throw new Error('panel not open');
  await page.keyboard.type('Upcom'); await page.waitForTimeout(200); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  return 'hash=' + (await page.evaluate(() => location.hash));
});
await check('New List → New Project creates and opens a project', async () => {
  await page.locator('[data-sb=new-list]').click(); await page.waitForTimeout(200);
  await page.locator('text=New Project').first().click(); await page.waitForTimeout(300);
  const h = await page.evaluate(() => location.hash);
  if (!h.startsWith('#/project/')) throw new Error('hash=' + h);
  await page.keyboard.type(' Alpha'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  await page.locator('.new-todo:visible, [data-action=new-todo]:visible').first().click().catch(() => {});
  await page.locator('.new-todo').fill('Draft plan'); await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
  const t = (await todos()).find(x => x.title === 'Draft plan');
  if (!t?.project) throw new Error('todo has no project');
  const lists = await page.evaluate(() => JSON.parse(localStorage.getItem('things-lists')));
  return 'project title=' + lists.projects.find(p => p.id === t.project)?.title;
});
await check('Logbook lists completed', async () => {
  await page.goto(BASE + '#/logbook'); await page.waitForTimeout(250);
  if (!(await page.locator('text=Call mom').first().isVisible())) throw new Error('Call mom missing');
});
await check('no page errors (desktop)', async () => { if (errors.length) throw new Error(errors.slice(0, 3).join(' | ')); });

// ---------- PWA ----------
const pctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2.6 });
const pp = await pctx.newPage();
const perr = []; pp.on('pageerror', e => perr.push(String(e)));
await pp.goto(BASE); await pp.waitForLoadState('networkidle');
await check('PWA: manifest fields + icons reachable', async () => {
  const href = await pp.evaluate(() => document.querySelector('link[rel=manifest]')?.href);
  const m = await (await fetch(href)).json();
  for (const k of ['name', 'short_name', 'start_url', 'display', 'icons']) if (!m[k]) throw new Error('missing ' + k);
  for (const ic of m.icons) { const r = await fetch(new URL(ic.src, href)); if (!r.ok) throw new Error('icon ' + ic.src); }
  return `${m.display}, ${m.icons.length} icons`;
});
await check('PWA: service worker controls page and app works offline', async () => {
  await pp.evaluate(() => navigator.serviceWorker.ready); await pp.reload(); await pp.waitForLoadState('networkidle');
  const ctl = await pp.evaluate(() => !!navigator.serviceWorker.controller);
  if (!ctl) throw new Error('no controller');
  await pctx.setOffline(true); await pp.reload(); await pp.waitForTimeout(500);
  const ok = await pp.locator('[data-shot=app]').count();
  await pctx.setOffline(false);
  if (!ok) throw new Error('offline reload failed');
  return 'offline OK';
});
await check('Phone: lists home, FAB adds a to-do, no autofocus', async () => {
  const f = await pp.evaluate(() => document.activeElement?.className || '');
  if (String(f).includes('new-todo')) throw new Error('autofocused on touch');
  await pp.goto(BASE + '#/lists'); await pp.waitForTimeout(250);
  if (!(await pp.locator('[data-shot=sidebar]').isVisible())) throw new Error('lists home not visible');
  await pp.locator('text=Inbox').first().click(); await pp.waitForTimeout(300);
  await pp.locator('[data-action=new-todo]:visible').first().click(); await pp.waitForTimeout(300);
  await pp.locator('.new-todo').fill('Phone task'); await pp.keyboard.press('Enter'); await pp.keyboard.press('Escape'); await pp.waitForTimeout(300);
  if (!(await pp.locator('.todo-list li', { hasText: 'Phone task' }).isVisible())) throw new Error('not listed');
  return 'hash=' + (await pp.evaluate(() => location.hash));
});
await check('no page errors (phone)', async () => { if (perr.length) throw new Error(perr.slice(0, 3).join(' | ')); });

// installability via CDP
await check('Chrome installability errors (CDP)', async () => {
  const cdp = await pctx.newCDPSession(pp);
  const r = await cdp.send('Page.getInstallabilityErrors');
  if (r.installabilityErrors.length) throw new Error(JSON.stringify(r.installabilityErrors));
  return 'none';
});
await browser.close();
for (const [s, n, d] of results) console.log(`${s}  ${n}${d ? '  — ' + d : ''}`);

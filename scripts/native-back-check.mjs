// Browser check of the Android back button's order (handleBack in app/js/native.js), of native.js
// loading cleanly in a browser (no console errors, initNative() a no-op) and of the Reminder Sound panel
// (app/js/sounds.js). Runs the real app in Chromium at phone and desktop sizes. Needs the app server (node tools/serve.mjs); starts it when it isn't running.
//   node scripts/native-back-check.mjs
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.APP_BASE || 'http://localhost:5173') + '/app/';

async function ensureServer() {
  const up = async () => { try { return (await fetch(BASE)).ok; } catch { return false; } };
  if (await up()) return;
  spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs')], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 50; i++) { if (await up()) return; await new Promise(r => setTimeout(r, 200)); }
  throw new Error('app server did not start');
}

const SEED = [{
  id: 't1', title: 'Call mom', completed: false, completedAt: null, notes: '', checklist: [], when: 'today', deadline: null,
  tags: [], project: null, area: null, heading: null, createdAt: '2026-10-01T12:00:00.000Z',
}];

const results = [];
const check = async (name, fn) => { try { const r = await fn(); results.push(['PASS', name, r ?? '']); } catch (e) { results.push(['FAIL', name, String(e.message || e).split('\n')[0].slice(0, 240)]); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

await ensureServer();
const browser = await chromium.launch();

async function openApp(viewport) {
  const ctx = await browser.newContext({ viewport, hasTouch: viewport.width < 700 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript(seed => localStorage.setItem('things-todos', JSON.stringify(seed)), SEED);
  await page.goto(BASE + '#/today/active');
  await page.waitForLoadState('networkidle');
  // every module below is the running app's own instance (same URL, same module map)
  const back = () => page.evaluate(async () => (await import('./js/native.js')).handleBack());
  const state = () => page.evaluate(async () => {
    const [qf, when, detail, account, sounds, store, router] = await Promise.all(['quickfind', 'when', 'detail', 'account', 'sounds', 'store', 'router'].map(m => import(`./js/${m}.js`)));
    return { quickfind: qf.isOpen(), when: when.isOpen(), menu: detail.menuOpen(), sync: account.isOpen(), sounds: sounds.isOpen(), detail: detail.isOpen(), composer: store.ui.composing, layout: store.ui.layout, view: router.parse().view, hash: location.hash };
  });
  return { ctx, page, errors, back, state };
}

// ---------- phone ----------
{
  const { ctx, page, errors, back, state } = await openApp({ width: 390, height: 844 });

  await check('native.js loads in a browser: not native, initNative() resolves, no console errors', async () => {
    const r = await page.evaluate(async () => { const n = await import('./js/native.js'); await n.initNative(); return { native: n.isNative(), typeofBack: typeof n.handleBack }; });
    if (r.native) throw new Error('isNative() true in a browser');
    if (r.typeofBack !== 'function') throw new Error('handleBack missing');
    if (errors.length) throw new Error(errors.join(' | '));
  });

  await check('1. Quick Find closes first, the open card stays', async () => {
    await page.evaluate(async () => { (await import('./js/detail.js')).open('t1'); });
    await sleep(150);
    await page.evaluate(async () => { const [qf, router] = await Promise.all([import('./js/quickfind.js'), import('./js/router.js')]); qf.open({ route: router.parse() }); });
    await sleep(150);
    const before = await state();
    if (!before.quickfind || !before.detail) throw new Error('setup: ' + JSON.stringify(before));
    const did = await back();
    const after = await state();
    if (did !== 'quickfind' || after.quickfind || !after.detail) throw new Error(`${did} ${JSON.stringify(after)}`);
  });

  await check('2. the When picker closes next, the card stays', async () => {
    await page.locator('[data-shot=detail] [data-action=when]').first().click();
    await sleep(250);
    const before = await state();
    if (!before.when) throw new Error('setup: ' + JSON.stringify(before));
    const did = await back();
    const after = await state();
    if (did !== 'when' || after.when || !after.detail) throw new Error(`${did} ${JSON.stringify(after)}`);
  });

  await check('3. a card menu closes next', async () => {
    await page.evaluate(async () => { const d = await import('./js/detail.js'); d.openMenu(document.querySelector('[data-shot=detail]') || document.body, [{ label: 'Nothing', run() {} }]); });
    await sleep(150);
    const before = await state();
    if (!before.menu) throw new Error('setup: ' + JSON.stringify(before));
    const did = await back();
    const after = await state();
    if (did !== 'menu' || after.menu || !after.detail) throw new Error(`${did} ${JSON.stringify(after)}`);
  });

  await check('4. the Sync panel closes next', async () => {
    await page.evaluate(async () => { (await import('./js/account.js')).open(); });
    await sleep(150);
    const before = await state();
    if (!before.sync) throw new Error('setup: ' + JSON.stringify(before));
    const did = await back();
    const after = await state();
    if (did !== 'sync' || after.sync || !after.detail) throw new Error(`${did} ${JSON.stringify(after)}`);
  });

  await check('5. the Reminder Sound panel closes next, the card stays', async () => {
    await page.evaluate(async () => { (await import('./js/sounds.js')).open(); });
    await sleep(150);
    const before = await state();
    if (!before.sounds || !before.detail) throw new Error('setup: ' + JSON.stringify(before));
    const did = await back();
    const after = await state();
    if (did !== 'sounds' || after.sounds || !after.detail) throw new Error(`${did} ${JSON.stringify(after)}`);
  });

  await check('6. the open card closes next', async () => {
    const did = await back();
    await sleep(100);
    const after = await state();
    if (did !== 'detail' || after.detail) throw new Error(`${did} ${JSON.stringify(after)}`);
  });

  await check('7. the composer closes next and keeps a titled draft', async () => {
    await page.evaluate(async () => { (await import('./js/composer.js')).open(); });
    await sleep(150);
    await page.locator('.new-todo').fill('Buy milk');
    const before = await state();
    if (!before.composer) throw new Error('setup: ' + JSON.stringify(before));
    const did = await back();
    await sleep(100);
    const after = await state();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('things-todos') || '[]').some(t => t.title === 'Buy milk' && t.when === 'today'));
    if (did !== 'composer' || after.composer || !saved) throw new Error(`${did} saved=${saved} ${JSON.stringify(after)}`);
  });

  await check('8. on phone, back from a list goes to the lists home', async () => {
    const before = await state();
    if (before.layout !== 'phone' || before.view !== 'today') throw new Error('setup: ' + JSON.stringify(before));
    const did = await back();
    await page.waitForFunction(() => location.hash === '#/lists');
    const after = await state();
    if (did !== 'lists' || after.view !== 'lists') throw new Error(`${did} ${JSON.stringify(after)}`);
  });

  await check('9. on the lists home, back leaves the app (minimize)', async () => {
    const did = await back();
    if (did !== 'minimize') throw new Error(did);
  });

  await check('the Reminder Sound panel: a tap picks a sound, marks it and saves it; Done closes', async () => {
    await page.evaluate(async () => { (await import('./js/sounds.js')).open(); });
    await page.locator('.snd-opt[data-sound="marimba"]').click();
    await sleep(100);
    const r = await page.evaluate(async () => {
      const s = await import('./js/sounds.js');
      return { chosen: s.reminderSound(), stored: localStorage.getItem('todos-reminder-sound'), checked: [...document.querySelectorAll('.snd-opt[aria-checked="true"]')].map(b => b.dataset.sound), open: s.isOpen() };
    });
    if (r.chosen !== 'marimba' || r.stored !== 'marimba' || r.checked.join() !== 'marimba' || !r.open) throw new Error(JSON.stringify(r));
    await page.locator('.snd-btn[data-snd="close"]').click();
    await sleep(100);
    if (await page.evaluate(async () => (await import('./js/sounds.js')).isOpen())) throw new Error('still open after Done');
  });

  await check('in a browser the list menu does not offer Reminder Sound (reminders ring in the Android app alone)', async () => {
    await page.evaluate(async () => { (await import('./js/router.js')).go('#/today'); });
    await page.locator('[data-tool="list-menu"]').click();
    await sleep(150);
    const labels = await page.evaluate(() => [...document.querySelectorAll('.menu-item')].map(b => b.textContent.trim()));
    await page.keyboard.press('Escape');
    if (!labels.includes('Sync…') || labels.some(l => /Reminder Sound/.test(l))) throw new Error(labels.join(' | ') || 'no menu');
  });

  await check('phone run had no page or console errors', async () => { if (errors.length) throw new Error(errors.join(' | ')); });
  await ctx.close();
}

// ---------- desktop ----------
{
  const { ctx, page, errors, back, state } = await openApp({ width: 1280, height: 800 });
  await check('desktop: with nothing open, back minimizes (no lists step)', async () => {
    const s = await state();
    if (s.layout !== 'desktop' || s.view !== 'today') throw new Error('setup: ' + JSON.stringify(s));
    const did = await back();
    if (did !== 'minimize') throw new Error(did);
    if ((await state()).view !== 'today') throw new Error('navigated away');
  });
  await check('desktop: an open card closes before minimizing', async () => {
    await page.evaluate(async () => { (await import('./js/detail.js')).open('t1'); });
    await sleep(150);
    const did = await back();
    if (did !== 'detail') throw new Error(did);
    if ((await back()) !== 'minimize') throw new Error('second press');
  });
  await check('desktop: in a browser the settings menu does not offer Reminder Sound', async () => {
    await page.locator('.sb-settings').click();
    await sleep(150);
    const labels = await page.evaluate(() => [...document.querySelectorAll('.menu-item')].map(b => b.textContent.trim()));
    await page.keyboard.press('Escape');
    if (!labels.includes('Sync…') || labels.some(l => /Reminder Sound/.test(l))) throw new Error(labels.join(' | ') || 'no menu');
  });
  await check('desktop run had no page or console errors', async () => { if (errors.length) throw new Error(errors.join(' | ')); });
  await ctx.close();
}

// ---------- the Android app's menus: the bridge faked (window.Capacitor is defined before any script, as on the phone) ----------
for (const [size, viewport, menu] of [['phone', { width: 390, height: 844 }, '[data-tool="list-menu"]'], ['desktop', { width: 1280, height: 800 }, '.sb-settings']]) {
  const ctx = await browser.newContext({ viewport, hasTouch: size === 'phone' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript(seed => {
    localStorage.setItem('things-todos', JSON.stringify(seed));
    window.androidBridge = { postMessage() {} };
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {} };
  }, SEED);
  await page.goto(BASE + '#/today/active');
  await page.waitForLoadState('networkidle');
  await check(`${size}, as the Android app: the menu offers Reminder Sound…, which opens the panel`, async () => {
    if (!(await page.evaluate(async () => (await import('./js/native.js')).isNative()))) throw new Error('isNative() false with the bridge faked');
    await page.locator(menu).click();
    await sleep(150);
    const item = page.locator('.menu-item', { hasText: 'Reminder Sound…' });
    if (!(await item.count())) throw new Error('no Reminder Sound… in the menu');
    await item.click();
    await sleep(150);
    if (!(await page.evaluate(async () => (await import('./js/sounds.js')).isOpen()))) throw new Error('the panel did not open');
    await page.keyboard.press('Escape');
    await sleep(100);
    if (await page.evaluate(async () => (await import('./js/sounds.js')).isOpen())) throw new Error('Escape did not close it');
  });
  await check(`${size}, as the Android app: no page or console errors (the plugins are missing, which only warns)`, async () => { if (errors.length) throw new Error(errors.join(' | ')); });
  await ctx.close();
}

await browser.close();
for (const r of results) console.log(r.join('  '));
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(`${results.length - failed}/${results.length} passed`);
console.log('BACK ' + (failed ? 'RED' : 'GREEN'));
process.exit(failed ? 1 : 0);

// Screenshot our app in the exact state described by a piece's shot recipe (gauntlet/pieces.json).
//   node tools/shoot.mjs <pieceId> [--size <shot>] [--compare]
// A piece's shots are keyed "desktop" and "phone", or by state ("after", "weekly", ...). A shot runs as a
// touch phone when its key is "phone" or its recipe says "device": "phone".
// Writes gauntlet/<piece>/ours-<shot>.png (+ compare-<shot>.png = labelled ours|bar side-by-side with --compare).
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.APP_BASE || 'http://localhost:5173';

export const isPhone = (key, shot) => key === 'phone' || shot?.device === 'phone';
export const shotKeys = piece => Object.keys(piece.shots || {});

export function loadPiece(id) {
  const all = JSON.parse(fs.readFileSync(path.join(ROOT, 'gauntlet/pieces.json'), 'utf8'));
  const piece = all.pieces.find(p => p.id === id);
  if (!piece) throw new Error(`unknown piece ${id}; known: ${all.pieces.map(p => p.id).join(', ')}`);
  return piece;
}

async function ensureServer() {
  const up = async () => { try { await fetch(BASE + '/app/'); return true; } catch { return false; } };
  if (await up()) return;
  spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs')], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 50 && !(await up()); i++) await new Promise(r => setTimeout(r, 200));
}

async function runAction(page, a) {
  if (a.click) await page.locator(a.click).first().click();
  else if (a.dblclick) await page.locator(a.dblclick).first().dblclick();
  else if (a.hover) await page.locator(a.hover).first().hover();
  else if (a.focus) await page.locator(a.focus).first().focus();
  else if (a.fill) await page.locator(a.fill[0]).first().fill(a.fill[1]);
  else if (a.type) await page.locator(a.type[0]).first().pressSequentially(a.type[1], { delay: 20 });
  else if (a.press) await page.keyboard.press(a.press);
  else if (a.eval) await page.evaluate(a.eval);
  else if (a.wait) await page.waitForTimeout(a.wait);
  else throw new Error('unknown action ' + JSON.stringify(a));
}

export async function shoot(pieceId, sizes, { compare = false } = {}) {
  await ensureServer();
  const piece = loadPiece(pieceId);
  const outDir = path.join(ROOT, 'gauntlet', pieceId);
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const results = {};
  try {
    for (const size of sizes) {
      const shot = piece.shots?.[size];
      if (!shot) throw new Error(`piece ${pieceId} has no ${size} shot recipe`);
      const context = await browser.newContext({
        viewport: shot.viewport, deviceScaleFactor: shot.dsf || 2,
        isMobile: isPhone(size, shot), hasTouch: isPhone(size, shot),
        colorScheme: shot.colorScheme || 'light', serviceWorkers: 'block', locale: 'en-US',
        timezoneId: 'America/New_York',
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      if (shot.now) await page.clock.setFixedTime(new Date(shot.now));
      const seed = shot.seed ? JSON.parse(fs.readFileSync(path.join(ROOT, shot.seed), 'utf8')) : null;
      await context.addInitScript(seed => {
        if (sessionStorage.getItem('__seeded')) return;
        localStorage.clear();
        if (seed) for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, JSON.stringify(v));
        sessionStorage.setItem('__seeded', '1');
      }, seed);
      await page.goto(`${BASE}/app/${shot.route || ''}`, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      for (const a of shot.actions || []) await runAction(page, a);
      await page.waitForTimeout(shot.settle ?? 800);
      const out = path.join(outDir, `ours-${size}.png`);
      const cap = shot.capture || { viewport: true };
      if (cap.selectors) {
        // the union of several elements (e.g. a section and the list it opened), plus optional padding
        const boxes = [];
        for (const sel of cap.selectors) {
          const loc = page.locator(sel).first();
          await loc.waitFor({ state: 'visible', timeout: 5000 });
          boxes.push(await loc.boundingBox());
        }
        const vp = page.viewportSize(), pad = cap.pad || 0;
        const x = Math.max(0, Math.min(...boxes.map(b => b.x)) - pad), y = Math.max(0, Math.min(...boxes.map(b => b.y)) - pad);
        const r = Math.min(vp.width, Math.max(...boxes.map(b => b.x + b.width)) + pad), btm = Math.min(vp.height, Math.max(...boxes.map(b => b.y + b.height)) + pad);
        await page.screenshot({ path: out, clip: { x, y, width: r - x, height: btm - y }, animations: 'disabled' });
      } else if (cap.selector) {
        const loc = page.locator(cap.selector).first();
        await loc.waitFor({ state: 'visible', timeout: 5000 });
        if (cap.pad) {
          const b = await loc.boundingBox();
          const vp = page.viewportSize();
          const x = Math.max(0, b.x - cap.pad), y = Math.max(0, b.y - cap.pad);
          const clip = { x, y, width: Math.min(vp.width - x, b.width + cap.pad * 2), height: Math.min(vp.height - y, b.height + cap.pad * 2) };
          await page.screenshot({ path: out, clip, animations: 'disabled' });
        } else {
          await loc.screenshot({ path: out, animations: 'disabled' });
        }
      } else if (cap.clip) {
        await page.screenshot({ path: out, clip: cap.clip, animations: 'disabled' });
      } else {
        await page.screenshot({ path: out, animations: 'disabled', fullPage: !!cap.fullPage });
      }
      if (compare) {
        execFileSync('python3', [path.join(ROOT, 'tools/img.py'), 'compare', out, path.join(ROOT, shot.ref), path.join(outDir, `compare-${size}.png`), piece.bar || 'Things']);
      }
      results[size] = { out, errors };
      if (errors.length) console.error(`[${size}] page errors:\n  ` + errors.join('\n  '));
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [id, ...rest] = process.argv.slice(2);
  const sizeArg = rest.includes('--size') ? [rest[rest.indexOf('--size') + 1]] : shotKeys(loadPiece(id));
  const res = await shoot(id, sizeArg, { compare: rest.includes('--compare') });
  for (const [s, r] of Object.entries(res)) console.log(`${s}: ${path.relative(ROOT, r.out)}${rest.includes('--compare') ? `  (compare: gauntlet/${id}/compare-${s}.png)` : ''}`);
}

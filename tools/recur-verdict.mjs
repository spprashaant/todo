// Record an adversarial critic's verdict on the repeat engine (the behaviour piece, recur-engine).
//   node tools/recur-verdict.mjs <round> --critic <i> --of <n> --broken yes|no --gap "<repro + expected vs actual>" [--why "<one line>"]
// The round is won only when tools/recur-check.mjs is green (gauntlet/recur.json, run after the
// builder finished) and no critic on the panel broke the engine.
import fs from 'node:fs';
import path from 'node:path';
import { updateStatus } from './status.mjs';
import { ROOT } from './shoot.mjs';

const ID = 'recur-engine';
const [roundArg, ...rest] = process.argv.slice(2);
const round = Number(roundArg);
const arg = k => (rest.includes(k) ? rest[rest.indexOf(k) + 1] : undefined);
const broken = arg('--broken');
if (!round || !['yes', 'no'].includes(broken)) {
  console.error('usage: node tools/recur-verdict.mjs <round> --critic <i> --of <n> --broken yes|no --gap "..." [--why "..."]');
  process.exit(2);
}
const critic = Number(arg('--critic') || 1), of = Number(arg('--of') || 1);
const dir = path.join(ROOT, 'gauntlet', ID, `r${round}`);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, `verdict-${critic}.json`), JSON.stringify({ critic, broken: broken === 'yes', gap: arg('--gap') || '', why: arg('--why') || '', at: new Date().toISOString() }, null, 2));
const votes = fs.readdirSync(dir).filter(f => /^verdict-\d+\.json$/.test(f)).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
const done = votes.length >= of;
let check = null;
try { check = JSON.parse(fs.readFileSync(path.join(ROOT, 'gauntlet/recur.json'), 'utf8')); } catch {}
const breaks = votes.filter(v => v.broken);
const won = { behaviour: !!check?.green && !breaks.length };
const gap = [
  ...(check?.green ? [] : [`recur-check is RED (${check ? `${check.passing}/${check.total}` : 'not run'}): ${(check?.failed || []).map(f => `${f.name}: ${f.error}`).join('  /  ')}`]),
  ...breaks.map(v => `critic ${v.critic}: ${v.gap}`),
].join('  ·  ');
updateStatus(ID, st => {
  st.round = round;
  const r = st.rounds.find(r => r.round === round) || (st.rounds.push({ round }), st.rounds[st.rounds.length - 1]);
  r.votes = votes.map(v => ({ critic: v.critic, behaviour: !v.broken, why: v.why }));
  r.panel = of;
  r.check = check ? { green: check.green, passing: check.passing, total: check.total } : null;
  if (done) {
    st.state = won.behaviour ? 'won' : 'building';
    Object.assign(r, { won, gap, why: votes.map(v => v.why).filter(Boolean).join('  /  '), judgedAt: new Date().toISOString() });
  }
}, done
  ? `${ID} r${round}: check ${check ? `${check.passing}/${check.total}` : 'not run'}, ${breaks.length}/${of} critics broke it → ${won.behaviour ? 'OURS HOLDS' : 'not yet'}${won.behaviour ? '' : ' — ' + gap.slice(0, 400)}`
  : undefined);
console.log('recorded');

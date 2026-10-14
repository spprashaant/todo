// Record a critic's blind verdict. The critic never sees which label is ours; this script resolves it.
//   node tools/verdict.mjs <pieceId> <round> --critic <i> --of <n> --desktop A|B --phone A|B --gap-desktop "<loser's biggest gap>" --gap-phone "<loser's biggest gap>" [--why "<one line>"]
// Pieces with other shots take --<shot> A|B and --gap-<shot> for each shot in their recipe.
// With a panel of n critics, a size counts as ours only when a strict majority of the n picked ours.
import fs from 'node:fs';
import path from 'node:path';
import { updateStatus } from './status.mjs';
import { ROOT, loadPiece } from './shoot.mjs';

const [id, roundArg, ...rest] = process.argv.slice(2);
const round = Number(roundArg);
const arg = k => (rest.includes(k) ? rest[rest.indexOf(k) + 1] : undefined);
const key = JSON.parse(fs.readFileSync(path.join(ROOT, 'gauntlet/.keys', `${id}-r${round}.json`), 'utf8'));
const sizes = Object.keys(key); // the shots this piece is judged on: desktop/phone, or named states
const pick = Object.fromEntries(sizes.map(s => [s, arg('--' + s)]));
if (sizes.some(s => !['A', 'B'].includes(pick[s]))) {
  console.error(`usage: node tools/verdict.mjs <pieceId> <round> ${sizes.map(s => `--${s} A|B --gap-${s} "..."`).join(' ')} [--why "..."]`);
  process.exit(2);
}
const barName = loadPiece(id).bar || 'Things';
const critic = Number(arg('--critic') || 1), of = Number(arg('--of') || 1);
const gaps = Object.fromEntries(sizes.map(s => [s, arg('--gap-' + s) || ''])), why = arg('--why') || '';
const dir = path.join(ROOT, 'gauntlet', id, `r${round}`);
fs.writeFileSync(path.join(dir, `verdict-${critic}.json`), JSON.stringify({ critic, pick, gaps, why, at: new Date().toISOString() }, null, 2));
const votes = fs.readdirSync(dir).filter(f => /^verdict-\d+\.json$/.test(f)).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
const oursVotes = s => votes.filter(v => v.pick[s] === key[s]).length;
const done = votes.length >= of;
const won = Object.fromEntries(sizes.map(s => [s, oursVotes(s) * 2 > of]));
// The gaps to fix come from critics who picked Things at a size ours lost.
const gap = sizes.filter(s => !won[s])
  .map(s => `${s}: ` + votes.filter(v => v.pick[s] !== key[s]).map(v => v.gaps[s]).join('  /  ')).join('  ·  ');
const both = sizes.every(s => won[s]);
updateStatus(id, st => {
  st.round = round;
  const r = st.rounds.find(r => r.round === round) || (st.rounds.push({ round }), st.rounds[st.rounds.length - 1]);
  r.key = key; r.votes = votes.map(v => ({ critic: v.critic, ...Object.fromEntries(sizes.map(s => [s, v.pick[s] === key[s]])), why: v.why }));
  r.panel = of;
  if (done) {
    st.state = both ? 'won' : 'building';
    Object.assign(r, { pick: votes[0].pick, won, gap, why: votes.map(v => v.why).filter(Boolean).join('  /  '), judgedAt: new Date().toISOString() });
  }
}, done
  ? `${id} r${round}: panel of ${of} — ${sizes.map(s => `${s} ${oursVotes(s)}/${of} for ours`).join(', ')} → ${both ? 'OURS WINS' : `${barName} holds`}${both ? '' : ' — gap: ' + gap}`
  : undefined);
console.log('recorded');

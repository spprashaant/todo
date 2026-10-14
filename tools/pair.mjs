// Prepare a blind A/B pair for a piece's round: fresh screenshots of ours, then ours and the bar are
// re-encoded through the same pipeline and randomly assigned to A/B per size. The key is kept in
// gauntlet/.keys (never shown to critics).
//   node tools/pair.mjs <pieceId> <round> [--note "what the builder changed"]
// Prints: PAIR_KEY {"desktop":"A|B","phone":"A|B"}   (the label that is OURS, per shot in the recipe)
import fs from 'node:fs';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { shoot, loadPiece, shotKeys, ROOT } from './shoot.mjs';
import { updateStatus } from './status.mjs';

const [id, roundArg, ...rest] = process.argv.slice(2);
const round = Number(roundArg);
if (!id || !round) { console.error('usage: node tools/pair.mjs <pieceId> <round> [--note "..."]'); process.exit(2); }
const note = rest.includes('--note') ? rest[rest.indexOf('--note') + 1] : '';
const piece = loadPiece(id);
const sizes = shotKeys(piece);
const shots = await shoot(id, sizes);

const dir = path.join(ROOT, 'gauntlet', id, `r${round}`);
fs.mkdirSync(dir, { recursive: true });
const key = {};
for (const size of sizes) {
  const oursLabel = randomInt(2) ? 'A' : 'B';
  const refLabel = oursLabel === 'A' ? 'B' : 'A';
  key[size] = oursLabel;
  const dsf = String(piece.shots[size].dsf || 2);
  const norm = (src, label) => execFileSync('python3', [path.join(ROOT, 'tools/img.py'), 'equalize', src, path.join(dir, `${size}-${label}.png`), dsf]);
  norm(shots[size].out, oursLabel);
  norm(path.join(ROOT, piece.shots[size].ref), refLabel);
}
fs.mkdirSync(path.join(ROOT, 'gauntlet/.keys'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'gauntlet/.keys', `${id}-r${round}.json`), JSON.stringify(key));
updateStatus(id, s => {
  s.state = 'judging';
  s.round = round;
  const r = s.rounds.find(r => r.round === round) || (s.rounds.push({ round }), s.rounds[s.rounds.length - 1]);
  r.note = note;
  r.pairedAt = new Date().toISOString();
  r.pageErrors = Object.values(shots).flatMap(x => x.errors);
}, `${id} r${round}: pair ready for the critic${note ? ' — ' + note : ''}`);
console.log(`pair written to gauntlet/${id}/r${round}/{${sizes.join(',')}}-{A,B}.png`);
console.log('PAIR_KEY ' + JSON.stringify(key));

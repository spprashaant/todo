// Per-piece status files feeding the live progress page. One writer per piece at a time (builder then critic).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function updateStatus(id, fn, event) {
  const file = path.join(ROOT, 'gauntlet', id, 'status.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let s = { piece: id, state: 'building', round: 0, rounds: [] };
  try { s = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  fn(s);
  s.updatedAt = new Date().toISOString();
  fs.writeFileSync(file + '.tmp', JSON.stringify(s, null, 2));
  fs.renameSync(file + '.tmp', file);
  if (event) fs.appendFileSync(path.join(ROOT, 'gauntlet/events.jsonl'), JSON.stringify({ at: s.updatedAt, piece: id, text: event }) + '\n');
  return s;
}

// CLI: node tools/status.mjs <pieceId> building "<what I'm working on>"
if (import.meta.url === `file://${process.argv[1]}`) {
  const [id, state, text = ''] = process.argv.slice(2);
  updateStatus(id, s => { s.state = state; if (text) s.working = text; }, text ? `${id}: ${text}` : undefined);
  console.log('ok');
}

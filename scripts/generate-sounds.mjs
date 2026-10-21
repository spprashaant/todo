// Synthesises the bundled reminder sounds (plain Node, no dependencies, no samples) and writes each one twice:
//   app/sounds/<name>.wav                    the copy the Reminder Sound panel plays as a preview
//   android/app/src/main/res/raw/<name>.wav  the copy a notification channel is created with (what Android plays)
// plus res/raw/silent.wav, the per-notification sound of the Silent choice on Android 7 (no channels there).
// 16-bit PCM mono at 22.05 kHz, peak-normalised, faded out, so nothing clicks. The two copies must stay the
// same: app/js/sounds.js names the files, and scripts/native-check.mjs checks both copies exist and match.
// Run: npm run android:sounds
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'app', 'sounds');
const RAW = path.join(ROOT, 'android', 'app', 'src', 'main', 'res', 'raw');

const RATE = 22050;
const TAU = Math.PI * 2;
const samples = s => Math.round(s * RATE);
const ramp = x => (x >= 1 ? 1 : x <= 0 ? 0 : 0.5 - 0.5 * Math.cos(Math.PI * x)); // raised cosine, 0 to 1

/** Adds one struck sine: frequency f (Hz), peak amplitude amp, exponential decay time tau (s), from `start` (s). */
function partial(buf, { f, amp, tau, start = 0, attack = 0.003 }) {
  const s0 = samples(start);
  for (let i = s0; i < buf.length; i++) {
    const t = (i - s0) / RATE;
    const env = ramp(t / attack) * Math.exp(-t / tau);
    if (t > attack && env < 1e-4) break;
    buf[i] += amp * env * Math.sin(TAU * f * t);
  }
}

/** A struck note on a fundamental f0: partials are [ratio, amplitude, decay time]. */
const strike = (buf, start, f0, partials, amp = 1, attack) =>
  partials.forEach(([r, a, tau]) => partial(buf, { f: f0 * r, amp: a * amp, tau, start, attack }));

/** A gated note (raised-cosine attack and release, held in between), for soft electronic blips. */
function blip(buf, { f, amp = 1, start, dur, attack = 0.012, release = 0.035, partials = [[1, 1], [2, 0.22], [3, 0.06]] }) {
  const s0 = samples(start), n = samples(dur);
  for (let i = 0; i < n && s0 + i < buf.length; i++) {
    const t = i / RATE;
    const env = ramp(t / attack) * ramp((dur - t) / release);
    let v = 0;
    for (const [r, a] of partials) v += a * Math.sin(TAU * f * r * t);
    buf[s0 + i] += amp * env * v;
  }
}

// Partial sets. Ratios above 1 that aren't whole numbers are what make metal and wood sound struck, not synthesised.
const TUBULAR = [[1, 1, 0.6], [2, 0.5, 0.4], [3, 0.3, 0.3], [4.2, 0.15, 0.2], [5.4, 0.08, 0.15]]; // a tubular bell
const GLOCK = [[1, 1, 0.5], [2, 0.2, 0.4], [2.76, 0.35, 0.25], [5.4, 0.15, 0.12]]; // a glockenspiel bar
const WOOD = [[1, 1, 0.22], [4, 0.35, 0.1], [10, 0.12, 0.05]]; // a marimba bar (tuned 1:4:10)
const GLASS = [[1, 1, 0.8], [1.0029, 0.8, 0.8], [2, 0.35, 0.5], [2.0058, 0.25, 0.5], [3, 0.1, 0.3]]; // detuned pairs beat about 4 times a second

/** name -> [length in seconds, how it is played]. The names are the files; sounds.js lists them. */
const SOUNDS = {
  chime: [1.5, buf => { strike(buf, 0, 1046.5, TUBULAR, 1); strike(buf, 0.22, 1568, TUBULAR, 0.85); }], // C6 then G6
  ding: [1.1, buf => strike(buf, 0, 1318.5, GLOCK, 1)], // E6, one bar
  glass: [1.5, buf => strike(buf, 0, 1396.9, GLASS, 1, 0.006)], // F6, shimmering
  marimba: [0.9, buf => { strike(buf, 0, 523.25, WOOD, 1, 0.0015); strike(buf, 0.16, 659.25, WOOD, 0.95, 0.0015); strike(buf, 0.32, 784, WOOD, 1, 0.0015); }], // C5 E5 G5
  pulse: [0.6, buf => { blip(buf, { f: 880, start: 0, dur: 0.11 }); blip(buf, { f: 880, start: 0.2, dur: 0.11 }); }], // two soft taps on A5
};

// The peak each file is scaled to. Pulse holds its two notes, so it is denser than a struck one and would
// sound louder at the same peak; this evens the loudness out (about -8 dBFS over the loudest 100 ms each).
const PEAK = { pulse: 0.62 };

/** Scales to the peak, fades the last 30 ms to silence and starts from zero. */
function finish(buf, peak = 0.9) {
  let max = 0;
  for (const v of buf) max = Math.max(max, Math.abs(v));
  const g = max ? peak / max : 0, fade = samples(0.03);
  for (let i = 0; i < buf.length; i++) {
    const left = buf.length - 1 - i;
    buf[i] *= g * (left < fade ? ramp(left / fade) : 1);
  }
  buf[0] = 0;
  return buf;
}

/** Float samples in [-1, 1] -> a RIFF/WAVE file, PCM 16-bit mono. */
function wav(buf) {
  const data = Buffer.alloc(buf.length * 2);
  for (let i = 0; i < buf.length; i++) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(buf[i] * 32767))), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

const stats = buf => {
  let peak = 0, sum = 0;
  for (const v of buf) { peak = Math.max(peak, Math.abs(v)); sum += v * v; }
  const db = x => (x > 0 ? (20 * Math.log10(x)).toFixed(1) : '-inf');
  return `peak ${db(peak)} dBFS  rms ${db(Math.sqrt(sum / buf.length))} dBFS`;
};

mkdirSync(WEB, { recursive: true });
mkdirSync(RAW, { recursive: true });
for (const [name, [length, play]] of Object.entries(SOUNDS)) {
  const buf = new Float64Array(samples(length));
  play(buf);
  const file = wav(finish(buf, PEAK[name] ?? 0.9));
  writeFileSync(path.join(WEB, `${name}.wav`), file);
  writeFileSync(path.join(RAW, `${name}.wav`), file);
  console.log(`${name.padEnd(8)} ${length.toFixed(2)} s  ${String(file.length).padStart(6)} bytes  ${stats(buf)}`);
}
const silent = wav(new Float64Array(samples(0.25)));
writeFileSync(path.join(RAW, 'silent.wav'), silent);
console.log(`${'silent'.padEnd(8)} 0.25 s  ${String(silent.length).padStart(6)} bytes  (res/raw only: Android 7 plays it for Silent)`);
console.log(`written to ${path.relative(ROOT, WEB)}/ and ${path.relative(ROOT, RAW)}/`);

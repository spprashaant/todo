// The Reminder Sound panel and the choice behind it: what a reminder plays on this phone. It is for the
// Android app (the browser fires no reminders, so only the phone's menus offer it). The choice is a thing
// of the phone it plays on, kept in localStorage and never synced. native.js reads it (reminderSound,
// onSoundChange) and schedules every reminder on a notification channel made for that sound. SOUNDS and
// soundInfo are pure, and scripts/native-check.mjs checks them against the files.
import { icon } from './icons.js';

const KEY = 'todos-reminder-sound';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * The choices, in the order shown. A `file` is a bundled sound kept twice: app/sounds/<file> (the preview
 * here) and android/app/src/main/res/raw/<file> (what the notification channel plays), both written by
 * scripts/generate-sounds.mjs. 'default' is the phone's own notification sound; 'silent' is Android's
 * silent notification: shown, with no sound or vibration.
 */
export const SOUNDS = [
  { key: 'default', label: 'Default', note: 'Your phone’s notification sound' },
  { key: 'chime', label: 'Chime', file: 'chime.wav' },
  { key: 'ding', label: 'Ding', file: 'ding.wav' },
  { key: 'glass', label: 'Glass', file: 'glass.wav' },
  { key: 'marimba', label: 'Marimba', file: 'marimba.wav' },
  { key: 'pulse', label: 'Pulse', file: 'pulse.wav' },
  { key: 'silent', label: 'Silent', note: 'No sound or vibration. Reminders still appear in your notifications.' },
];

/** The choice for a key; an unknown or missing key is Default. */
export const soundInfo = key => SOUNDS.find(s => s.key === key) || SOUNDS[0];

/** The key of the sound chosen on this device. */
export function reminderSound() {
  try { return soundInfo(localStorage.getItem(KEY)).key; } catch { return SOUNDS[0].key; }
}

const listeners = new Set();
/** Calls fn(key) after the choice changes. Returns the unsubscribe. */
export function onSoundChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Saves the choice (an unknown key means Default) and tells the listeners when it changed. */
export function setReminderSound(key) {
  const next = soundInfo(key).key;
  if (next === reminderSound()) return;
  try { if (next === SOUNDS[0].key) localStorage.removeItem(KEY); else localStorage.setItem(KEY, next); } catch {}
  for (const fn of listeners) fn(next);
}

// ---------- preview ----------
let player = null;

/** Plays a bundled sound once, as a tap in the panel does. Default and Silent have nothing to play. */
export function preview(key) {
  const s = soundInfo(key);
  stopPreview();
  if (!s.file) return;
  try {
    player = new Audio(new URL(`../sounds/${s.file}`, import.meta.url).href);
    player.play().catch(() => {});
  } catch {}
}

function stopPreview() {
  try { player?.pause(); } catch {}
  player = null;
}

// ---------- the panel ----------
let scrim = null, panel = null, returnFocus = null;

export function isOpen() { return !!scrim; }

export function open() {
  if (scrim) return;
  returnFocus = document.activeElement;
  scrim = document.createElement('div');
  scrim.className = 'snd-scrim';
  panel = document.createElement('div');
  panel.className = 'snd';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'snd-title');
  scrim.append(panel);
  document.getElementById('layer').append(scrim);
  draw();
  scrim.addEventListener('pointerdown', e => { if (e.target === scrim) { e.preventDefault(); close(); } });
  panel.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey, true);
  panel.querySelector('.snd-opt[aria-checked="true"]')?.focus({ preventScroll: true });
}

export function close() {
  if (!scrim) return;
  stopPreview();
  document.removeEventListener('keydown', onKey, true);
  scrim.remove();
  scrim = panel = null;
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
}

function draw() {
  const cur = reminderSound();
  panel.innerHTML = `<h2 class="snd-title" id="snd-title">Reminder Sound</h2>` +
    `<p class="snd-lead">What a reminder plays on this phone. Tap one to hear it.</p>` +
    `<div class="snd-list" role="radiogroup" aria-labelledby="snd-title">` +
    SOUNDS.map(s =>
      `<button class="snd-opt" type="button" role="radio" aria-checked="${s.key === cur}" tabindex="${s.key === cur ? 0 : -1}" data-sound="${s.key}">` +
        `<span class="snd-text"><span class="snd-name">${esc(s.label)}</span>${s.note ? `<span class="snd-note">${esc(s.note)}</span>` : ''}</span>` +
        `<span class="snd-mark">${icon('check')}</span>` +
      `</button>`).join('') +
    `</div>` +
    `<div class="snd-actions"><button class="snd-btn primary" type="button" data-snd="close">Done</button></div>`;
}

/** Picks a sound: saved at once (so the panel needs no Cancel), marked in place and played. */
function choose(key, focus) {
  setReminderSound(key);
  const cur = reminderSound();
  for (const b of panel.querySelectorAll('.snd-opt')) {
    const on = b.dataset.sound === cur;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
    if (on && focus) b.focus({ preventScroll: true });
  }
  preview(cur);
}

function onClick(e) {
  const opt = e.target.closest('.snd-opt');
  if (opt) { choose(opt.dataset.sound); return; }
  if (e.target.closest('[data-snd="close"]')) close();
}

function onKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target.closest?.('.snd-opt')) {
    e.preventDefault();
    const i = SOUNDS.findIndex(s => s.key === reminderSound());
    choose(SOUNDS[(i + (e.key === 'ArrowDown' ? 1 : SOUNDS.length - 1)) % SOUNDS.length].key, true);
  }
  e.stopPropagation(); // the list's shortcuts (Backspace, Cmd/Ctrl+K…) are not for this panel
}

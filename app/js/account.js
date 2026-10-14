// The Sync panel: sign in so the to-dos are the same on every device, and see how syncing is going
// (piece: account). The syncing itself is sync.js.
import { status, watch, signIn, signOut, syncNow } from './sync.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let scrim = null, panel = null, unwatch = null, shown = '', returnFocus = null;

export function open() {
  if (scrim) return;
  returnFocus = document.activeElement;
  scrim = document.createElement('div');
  scrim.className = 'acct-scrim';
  panel = document.createElement('div');
  panel.className = 'acct';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'acct-title');
  scrim.append(panel);
  document.getElementById('layer').append(scrim);
  shown = '';
  draw();
  unwatch = watch(draw);
  scrim.addEventListener('pointerdown', e => { if (e.target === scrim) { e.preventDefault(); close(); } });
  panel.addEventListener('click', onClick);
  panel.addEventListener('submit', onSubmit);
  document.addEventListener('keydown', onKey, true);
  (panel.querySelector('input') || panel.querySelector('.acct-btn.primary'))?.focus();
}

export function close() {
  if (!scrim) return;
  unwatch?.();
  document.removeEventListener('keydown', onKey, true);
  scrim.remove();
  scrim = panel = unwatch = null;
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
}

function onKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
  e.stopPropagation(); // the list's shortcuts (Backspace, Cmd/Ctrl+K…) are not for this panel
}

function draw() {
  if (!panel) return;
  const view = !status.configured ? 'unset' : status.user ? 'in' : 'out';
  // the sign-in form is drawn once, so a status change never wipes what is being typed
  if (view === 'out' && shown === 'out') return;
  shown = view;
  const title = `<h2 class="acct-title" id="acct-title">Sync</h2>`;
  if (view === 'unset') {
    panel.innerHTML = title + `<p class="acct-lead">Sync isn’t set up in this copy of the app.</p>` +
      `<div class="acct-actions"><button class="acct-btn primary" type="button" data-acct="close">Done</button></div>`;
  } else if (view === 'out') {
    panel.innerHTML = title +
      `<p class="acct-lead">Sign in to keep your to-dos the same on all your devices.</p>` +
      `<form class="acct-form" novalidate>` +
        `<input class="acct-field" type="email" name="email" autocomplete="username" placeholder="Email" required>` +
        `<input class="acct-field" type="password" name="password" autocomplete="current-password" placeholder="Password" required>` +
        `<p class="acct-error" role="alert"></p>` +
        `<div class="acct-actions">` +
          `<button class="acct-btn" type="button" data-acct="close">Cancel</button>` +
          `<button class="acct-btn primary" type="submit">Sign In</button>` +
        `</div>` +
      `</form>`;
  } else {
    panel.innerHTML = title +
      `<p class="acct-status" data-phase="${status.phase}"><span class="acct-dot"></span><span>${esc(phaseText())}</span></p>` +
      `<p class="acct-lead">Signed in as <b>${esc(status.user.email)}</b>. Changes here appear on your other devices within a few seconds.</p>` +
      `<div class="acct-actions">` +
        `<button class="acct-btn" type="button" data-acct="signout">Sign Out</button>` +
        `<button class="acct-btn" type="button" data-acct="sync"${status.phase === 'syncing' ? ' disabled' : ''}>Sync Now</button>` +
        `<button class="acct-btn primary" type="button" data-acct="close">Done</button>` +
      `</div>`;
  }
}

function phaseText() {
  const at = status.lastSynced ? status.lastSynced.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  switch (status.phase) {
    case 'syncing': return 'Syncing…';
    case 'synced': return at ? `Up to date, synced at ${at}` : 'Up to date';
    case 'offline': return 'Offline. Your changes will sync when you’re back online.';
    case 'error': return `Couldn’t sync: ${status.error}`;
    default: return '';
  }
}

function onClick(e) {
  const b = e.target.closest('[data-acct]');
  if (!b) return;
  const act = b.dataset.acct;
  if (act === 'close') close();
  else if (act === 'sync') syncNow();
  else if (act === 'signout') {
    b.disabled = true;
    signOut().catch(() => {}).finally(() => { if (b.isConnected) b.disabled = false; });
  }
}

async function onSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const email = form.email.value.trim(), password = form.password.value;
  const err = form.querySelector('.acct-error');
  if (!email || !password) { err.textContent = 'Enter your email and password.'; return; }
  const btn = form.querySelector('[type=submit]');
  btn.disabled = true;
  err.textContent = '';
  try {
    await signIn(email, password);
  } catch (x) {
    const msg = x?.message || '';
    err.textContent = /invalid login/i.test(msg) ? 'That email and password don’t match.'
      : /fetch|network|load failed/i.test(msg) ? 'Can’t reach the sync server. Check your connection.'
      : msg || 'Couldn’t sign in.';
    if (btn.isConnected) btn.disabled = false;
  }
}

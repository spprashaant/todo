// Boot + service worker registration (shared).
import { init } from './view.js';
import { start as startSync } from './sync.js';
import { isNative, initNative } from './native.js';

init();
startSync();
initNative().catch(err => console.warn('native: init', err));

if ('serviceWorker' in navigator) {
  if (isNative()) {
    // The Android app ships its own copy of app/ inside the APK: a cached shell must never shadow a newer install.
    navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
  } else if (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
    });
  }
}

// Regenerates the Android launcher icons (adaptive + round + legacy) and splash screens from the web app's
// own icons with @capacitor/assets:
//   icon-foreground  <- app/icons/icon-maskable-512.png (its glyph sits in the maskable safe zone)
//   icon-background  <- solid white
//   icon-only        <- app/icons/icon-512.png (legacy and round launchers)
//   splash           <- app/icons/icon-512.png centred on white
// The sources are upscaled to the sizes the tool wants (1024 / 2732). Run: npm run android:assets
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'node_modules', '@capacitor', 'assets', 'package.json'));
const sharp = require('sharp'); // the image library @capacitor/assets itself uses
const WORK = '.cap-assets'; // relative: @capacitor/assets joins --assetPath to the project root
const work = path.join(ROOT, WORK);
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const src = f => path.join(ROOT, 'app', 'icons', f);
await sharp(src('icon-maskable-512.png')).resize(1024, 1024).png().toFile(path.join(work, 'icon-foreground.png'));
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: WHITE } }).png().toFile(path.join(work, 'icon-background.png'));
await sharp(src('icon-512.png')).resize(1024, 1024).png().toFile(path.join(work, 'icon-only.png'));
const logo = await sharp(src('icon-512.png')).resize(640, 640).png().toBuffer();
await sharp({ create: { width: 2732, height: 2732, channels: 4, background: WHITE } })
  .composite([{ input: logo, gravity: 'centre' }]).png().toFile(path.join(work, 'splash.png'));
try {
  execFileSync(process.execPath, [path.join(ROOT, 'node_modules', '@capacitor', 'assets', 'bin', 'capacitor-assets'), 'generate', '--android',
    '--androidProject', 'android', '--assetPath', WORK, '--iconBackgroundColor', '#ffffff', '--iconBackgroundColorDark', '#ffffff',
    '--splashBackgroundColor', '#ffffff', '--splashBackgroundColorDark', '#ffffff'], { cwd: ROOT, stdio: 'inherit' });
} finally {
  rmSync(work, { recursive: true, force: true });
}
console.log('Android icons and splash screens written under android/app/src/main/res/');

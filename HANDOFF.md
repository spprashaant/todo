# Handoff: Todos app vs Things gauntlet

Updated 2026-09-27. Project root is `/Users/pr/Desktop/dev/Todo`. It is a git repo. `vendor/` (the TodoMVC clone for the suite) is git-ignored: on a fresh clone, run `bash tools/setup-suite.sh` once before `tools/suite.sh`.

## Active first (added 2026-10-08)

Every list now opens under **Active**, and the pills read Active, All, Completed. Under All, open to-dos come first in each section and finished ones sink to its bottom.

- `router.listHref(view, id)` is the hash that opens a list: its bare route, which is Active (the Logbook's is All). The sidebar, Quick Find's list results, an area's project list and the list headings in Anytime and Someday use it. All is the explicit `/all` segment (`#/all`, `#/today/all`). The installed app's `start_url` is `./#/active`, a synonym of `#/`. Active by default departs from TodoMVC's spec (it expects `#/` to show All and the All pill highlighted at start), so `tools/suite.sh` has failures by design since this change: the tests that complete an item and expect to still see it, and the highlighted-filter one.
- The bare routes (`#/`, `#/today`, …) still mean All, because the TodoMVC spec visits `#/` and expects All selected with finished to-dos visible. A plain browser visit to the root URL therefore still lands on Inbox under All.
- The sort lives at the end of `buildModel()` in `app/js/view.js`. Rows are cached by id and moved, not rebuilt, so a ticked row slides down without losing its card or focus.
- `tools/patch-spec.sh` now re-aliases the persistence test's rows by text after reload (the official spec's aliases pointed at specific to-dos), since by index the finished one is no longer first.

## Cloud sync with Supabase (added 2026-09-27)

To-dos now sync across devices through Supabase. It's for the owner only for now.

- **The project** is "Todo" (ref `smkrwmwylgakjmluulma`, region ap-south-1) in the owner's free-tier org. The Supabase connector is connected in Claude, so tables, SQL and advisors can be reached from a session.
- **How it works:** the browser copy in localStorage stays the app's store, because the TodoMVC suite reads it and the app works offline from it. Once signed in, each to-do, area, project and tag is also one row of `public.items`, and changes flow both ways. Realtime announces changes, so another device updates within a second or two.
  - A conflict goes to the later edit.
  - Moving an item re-sends only that item.
  - Deletions are rows marked deleted.
  - The rules are in `gauntlet/CONTRACT.md` under "Cloud sync".
- **Sign-in:** email and password, from Settings (sliders) → Sync… on desktop, or the list menu (⌄) → Sync… on phone. There is no sign-up in the app, because the account is created in the Supabase dashboard. Signed out, the app behaves exactly as before and loads nothing.
- **Code:**
  - `app/js/sync.js`: the engine.
  - `app/js/account.js` and `app/css/account.css`: the panel.
  - `app/js/config.js`: the URL and publishable key. The key is public by design, and row level security protects the data.
  - `app/vendor/supabase.mjs`: supabase-js 2.117.2 as an ES module.
  - `store.replaceData()`: the store's one new entry point.
  - `supabase/migrations/`: the schema as applied.
- **Checks:** `node tools/sync-check.mjs` must print `SYNC GREEN`. It runs 18 scenarios, with two devices against an in-memory stand-in for the table that follows the same rules. It never touches the real project. Real sign-in wasn't tested by Claude, because that needs the owner's password.
- **Moving to a deployed copy:** localStorage is per address. A copy deployed to HTTPS (needed for the Android install) starts empty, and signing in there pulls everything down.
- **Free tier:** Supabase pauses a free project after about a week without use. The app keeps working offline, and sync shows an error until the project is restored from the dashboard.
- **Not done yet:** sign-up and password reset in the app, and a sync indicator outside the panel.

## Repeating to-dos (added 2026-09-27, judged against Asana)

The app now has repeating to-dos, modelled on Asana's recurring tasks and drawn in the Things look. The key option is **After Completion**. For example, "Clean room, every 1 day after completion" creates the next to-do only when you tick the current one off, dated from the day you finished, so nothing piles up. It also offers:

- Daily, Weekly (weekday toggles), Monthly (day N, or the nth or last weekday), Yearly, and Custom (every N days, weeks, months or years).
- An end condition: never, after N times, or on a date.
- Stop Repeating.
- A "Next: …" preview.

**Where it lives:**
- The controls are a Repeats section inside the When picker, reached from the "↻ Repeat" footer entry.
- A repeating to-do shows "↻ Every Monday" (or its own rule) on its card and a marker on its row.

**Code:**
- `app/js/recur.js`: the date math and wording.
- `app/js/repeat.js` and `app/css/repeat.css`: the controls.
- `app/js/store.js`: the engine. It covers every completion path: row and card checkbox, Cmd/Ctrl+K, Complete All, the phone menu, delete and Clear completed.

**The rules** are in `gauntlet/CONTRACT.md` under "Repeating to-dos".
- Unticking takes the new occurrence back if it's still unedited.
- A series never has two open repeating occurrences.
- A schedule finished late skips the missed dates.

**How it was judged:** three pieces, all won.
- **`repeat-picker`**: 5 shots (after completion, weekly, monthly, the kinds list, phone) against Asana's date picker. Won round 1 at 3/3 on every shot, and 3/3 on every shot again in the final re-judge.
- **`repeat-marker`**: the open card against Asana's task detail. Won 3/3 twice.
- **`recur-engine`**: judged by `node tools/recur-check.mjs`, which must print `RECUR GREEN`. It drives the real UI through 38 scenarios, 25 of them regressions for breaks the testers confirmed. On top of that, each round 3 adversarial testers attack it, and every break they claim is re-checked by a separate verifier. It won in round 11, after confirmed breaks per round went 3, 2, 2, 1, 2, 1, 3, 3, 2, 1, 0. Many of the breaks were older app bugs the feature exposed, for example:
  - Complete All doing the opposite when a row was selected.
  - A stale When picker in a second tab overwriting changes.
  - The open card closing when its row moved in Upcoming.

**The Asana bar** is in `bar/asana/`, with `NOTES.md` giving sources, labels and documented behaviour.
- It is from the official Help Center, the "What's New in Asana, September 2023" video and a staff forum post.
- Asana has no official image of its after-completion panel or of its mobile repeat UI. Those two crops are real Asana screenshots posted by users on forum.asana.com, marked unofficial.
- The crops are `bar/crops/repeat-*.png`.

**Harness changes:**
- A piece's `shots` can be named states (`after`, `weekly`, …), not just `desktop` and `phone`. `"device": "phone"` marks a touch shot.
- `capture.selectors` shoots the union of several elements.
- `"bar": "Asana"` labels the comparison.
- `pair.mjs`, `verdict.mjs`, `shoot.mjs`, `img.py` and the progress page follow these changes.
- `tools/recur-verdict.mjs` records engine testers' verdicts.
- `tools/recur-workflow.js` is the Workflow script. It runs:
  - visual pieces as a builder, then 3 blind critics;
  - the engine as a builder, then 3 testers, each confirmed break verified and then turned into a regression scenario.

  Its args are `{rounds, scratch?, pieces:[{id,title,judge,owns,shots|kind:'behaviour',round,gap?,key?,history?,pendingBreaks?}]}`.

**Decisions to revisit:**
- Late schedules skip missed dates. Asana instead computes the next date from the old one.
- Reopening an old occurrence after the series has moved on brings it back as a one-off.
- Reminders on repeating to-dos still fire no notifications (known gap 1).

## Goal and status

The goal was a todo app that runs in the browser on Mac and Windows and installs on Android as a PWA. It is judged two ways:

1. **Blind design comparison.** Our screenshots are compared against real Things screenshots in a builder/critic loop until the critics pick ours.
2. **TodoMVC.** The official TodoMVC Cypress suite must pass.

Status: **done and converged.** On 2026-09-27, after the repeating to-dos feature landed, a final pass re-judged the finished build blind without changing it, and every piece won again:

| Piece | Desktop votes for ours | Phone votes for ours |
|---|---|---|
| today | 3/3 | 3/3 |
| project | 3/3 | 3/3 |
| sidebar | 2/3 | 3/3 |
| detail | 3/3 | 2/3 |
| when | 3/3 | 3/3 |
| quickfind | 3/3 | 3/3 |
| composer | 3/3 | 3/3 |

The recurrence pieces (vs Asana) are in the section above.

The suite is green (see the caveat below), `node tools/recur-check.mjs` passes 38/38, and `node tools/smoke.mjs` passes 13/13.

## Run it

- **App server:** `node tools/serve.mjs` serves the app at http://localhost:5173/app/ and the live progress page at http://localhost:5173/progress/. In the desktop app, `preview_start` with the name `todo` from `.claude/launch.json` does the same.
- **Test suite:** `bash tools/suite.sh <who>` starts TodoMVC's own test server on :8000 when needed. It runs `vendor/todomvc` with `examples/todo` symlinked to `../../../app`, and prints `SUITE GREEN` or `SUITE RED`.
- **Smoke test:** `node tools/smoke.mjs` checks the app's functional flows, the PWA, offline use and Chrome's installability check. It needs the app server running.
- **Sync check:** `node tools/sync-check.mjs` prints `SYNC GREEN` or `SYNC RED` (see "Cloud sync" above).
- **Android install:** it needs HTTPS, so deploy `app/` to a static host. Localhost only works on the same device.

## TodoMVC caveat

100% on the unmodified spec is impossible for any app that persists to localStorage. Under Cypress 15.14.2, two harness bugs fail 3 tests and skip 2:
- `spy.reset` no longer exists.
- The persistence test reuses an element alias across `cy.reload()`.

TodoMVC's own `knockoutjs` example fails identically. That was verified in this session.

`tools/patch-spec.sh` generates `vendor/todomvc/cypress/e2e-patched/spec.cy.js`, which fixes only those two lines. `suite.sh` runs both specs. Green means the official spec has no failures beyond those 3 and the patched spec passes 29/29. The current result is official 24/29 and patched 29/29.

## App (`app/`, about 4.8k lines)

Plain HTML, CSS and ES modules, with no build step and no network dependencies. `gauntlet/CONTRACT.md` is the source of truth for:
- file layout and per-piece ownership (`app/css/<piece>.css`, `app/js/<piece>.js`), plus the shared files (`store.js`, `router.js`, `view.js`, `icons.js`, `base.css`, `index.html`)
- the TodoMVC DOM contract
- the data model (`localStorage["things-todos"]` array, `["things-lists"]` object)
- the routes (`#/` Inbox, `#/today`, `#/upcoming`, `#/anytime`, `#/someday`, `#/logbook`, `#/project/<id>`, `#/area/<id>`, `#/lists` phone home, each with an optional `/active`, `/all` or `/completed` suffix; a bare route is Active, except the Logbook's, which is All)
- the `data-shot` screenshot hooks and PWA requirements

Features: sidebar and phone lists home, Today with This Evening, projects with headings, tags, date badges and progress pies, the open to-do card (notes, checklist, when, tags, deadline), the When picker (calendar, natural-language "in 3", Someday, Add Reminder), Quick Find (`/` or Cmd/Ctrl+F), a composer card (toolbar + on desktop, floating + on phone), the Logbook, and a network-first service worker with offline shell.

## Gauntlet harness

- **References:** `bar/` holds the real Things screenshots and mp4s from culturedcode.com. `bar/crops/<piece>-<size>.png` are the cleaned comparison crops, and `bar/frames/` holds video frames used by the composer piece.
- **`gauntlet/pieces.json`** lists the 7 pieces. Each has a `shots.desktop` and `shots.phone` recipe: ref crop, seed, frozen `now`, route, viewport and dsf, actions, and capture selector.
- **`gauntlet/seeds/<piece>-<size>.json`** holds localStorage seeds that reproduce each Things crop's content.
- **Tools:**
  - `tools/shoot.mjs <piece> [--compare]` takes Playwright screenshots of ours. `--compare` also writes a labelled ours|Things image to `gauntlet/<piece>/compare-*.png`.
  - `tools/pair.mjs <piece> <round>` writes the blind A/B pair to `gauntlet/<piece>/r<N>/`. Both images go through `img.py equalize` (downscale to about 1.25x, JPEG q75, upscale back) so image crispness can't decide the pick. The answer key goes to `gauntlet/.keys/`, and the script prints `PAIR_KEY`.
  - `tools/verdict.mjs <piece> <round> --critic i --of 3 ...` records a critic's pick and computes the majority from the hidden key.
  - `tools/status.mjs` writes per-piece `status.json` and the `events.jsonl` feed that the progress page reads.
- **`tools/gauntlet-workflow.js`** is the Workflow script. For each piece, one builder agent works on it, then a panel of 3 fresh critics judges it. Each critic is given a different lens. A size is won only with at least 2 of 3 votes for ours, and the piece is won only with both sizes won and the suite green.
  - Args are `{rounds, pieces:[{id,title,judge,owns,round,gap?,key?,history?}]}`.
  - Passing `key` (from a `pair.mjs` you ran first) makes that round judge-first, with no builder.
  - Pass a piece's `title`, `judge` and `owns` from pieces.json.
- **Next round numbers:** today 10, project 6, sidebar 6, detail 8, when 8, quickfind 7, composer 11, repeat-picker 3, repeat-marker 3, recur-engine 12.

## Rules that matter

- Never edit `bar/`, `gauntlet/pieces.json`, seeds, `tools/` or `vendor/` from a builder. Fix the app instead.
- No test or critic hacks: no screen-reader-only h1, no Cypress detection, and no styling that applies only during screenshots.
- Several builders run concurrently, so edits to shared files must be small and re-read first.
- Critics may open only their four A/B images, never the keys, `bar/` or the app.
- The loop exits only on winning or on the user stopping it, never after a fixed round count.

## Known gaps and possible next steps

1. **Reminders** are stored (`reminder` field) but fire no notifications.
2. **No calendar events.** Things' calendar block is cropped out of the references.
3. **Missing Someday-project state.** Things' dashed Someday-project pie can't be expressed in our data model.
4. **The "Todos" h1** is a small label at the top of the desktop sidebar, because the TodoMVC spec needs it visible at 890px.
5. **Phone sidebar reference** is the iPad sidebar, because `bar/` has no iPhone lists screen.
6. **Desktop captures are wider** than Things' narrow marketing windows.
7. **Unjudged views:** Upcoming, Anytime, Someday, Logbook, empty states, dark mode and motion are built but have no pieces in the gauntlet. Adding a piece means a crop in `bar/crops`, a seed, and a recipe in pieces.json, then running the workflow.

## Android app (Capacitor) (added 2026-10-16)

The web app in `app/` is also an Android app: Capacitor 8 wraps it in a WebView with `app/` bundled inside the APK (no server, no PWA install needed). App id `dev.coderlog.todos`, name "Todos". `capacitor.config.json` is the config (JSON, not TS: the repo is `"type": "module"` with no TypeScript). The generated `android/` project is committed; `cap sync` regenerates the git-ignored parts of it (`app/src/main/assets/public`, the plugin lists, `capacitor-cordova-android-plugins/`). Nothing was tested on a device by Claude: the checklist at the end of the PR that added this is what still needs a phone.

**Build and run**
- `npm run android:debug` = `npx cap sync android && cd android && ./gradlew assembleDebug`. The APK lands in `android/app/build/outputs/apk/debug/app-debug.apk`. It needs a JDK 21 and the Android SDK (`ANDROID_HOME`, or `android/local.properties` written by Android Studio). `npm run cap:open` opens the project in Android Studio; `npm run cap:sync` only copies `app/` in.
- After any change to `app/`, run `cap sync` (or the npm scripts above) before building: the APK holds a copy.
- `npm run android:assets` (`scripts/generate-assets.mjs`) regenerates the launcher icons (adaptive, round and legacy) and the splash screens from `app/icons/icon-maskable-512.png` and `icon-512.png` on white, with `@capacitor/assets`. Only needed when the web icons change.
- `android/app/src/main/res/drawable/ic_stat_todos.xml` is the notification's status-bar icon (white check mark); `capacitor.config.json` names it with the brand blue.

**The native glue is `app/js/native.js`.** In a browser `isNative()` is false, `initNative()` returns at once and nothing else runs, so the web app behaves as before. On the phone (`app.js` calls `initNative()` after `startSync()`):
- `app/vendor/capacitor-core.mjs` is `@capacitor/core`'s `dist/index.js` (self-contained ESM, MIT, licence next to it), loaded with a dynamic import on native only. There is no bundler, so it is vendored like supabase-js. **After bumping `@capacitor/core`, run `npm run vendor:capacitor`** to re-copy it.
- The service worker is unregistered on native, never registered: a cached shell must not shadow a newly installed APK. (`sw.js` lists `native.js` and `sounds.js` in its shell; its `VERSION` is `todos-v6`.)
- **Reminders** (known gap 1 is closed on Android only; the browser still fires nothing): the stored `reminder` ("HH:MM") on an open to-do that is in Today, This Evening or on a date becomes a local notification, scheduled with an exact alarm (`allowWhileIdle`) on channel `todos_reminders`. It's a reconcile, not event tracking: `desiredReminders(todos, now)` (pure) lists what should be pending (future times only, nearest first, at most 50, id = a stable 31-bit hash of the to-do id, title = the to-do, body = its project/area or "Reminder"); `reconcile()` compares that with the plugin's `getPending()` and cancels/schedules the difference. It runs on start, 400 ms after any store change (sync pulls included) and on app resume. Repeating to-dos need nothing special: the store makes the next occurrence a new to-do.
  - Permissions: the first time there is something to remind about, the notification permission (Android 13+) is asked for once; a refusal is kept and never asked about again (turn it on in the system settings). Exact alarms (Android 12+) are a settings screen the app sends you to once (remembered in localStorage).
  - Tapping a reminder opens Today with that to-do's card, if it still exists and is still open.
  - Known behaviours: `'today'` is sticky, so an open to-do left in Today reminds again the next day at the same time. A reminder set on another device is scheduled on the phone the next time the app opens or resumes (sync pulls then reconcile), not before. A reminder never fires while the app is only cached in the browser.
- **Reminder sound** (added 2026-10-21): the list menu (⌄) on the phone, and the Settings (sliders) menu where the sidebar shows, offer **Reminder Sound…**: a panel (`app/js/sounds.js`, `app/css/sounds.css`, drawn like the Sync panel) with Default (the phone's notification sound), five bundled tones (Chime, Ding, Glass, Marimba, Pulse) and Silent. A tap picks a sound and plays it; the choice is saved at once, per device (`localStorage["todos-reminder-sound"]`, never synced, missing means Default). The browser never offers it, since it fires no reminders (the menus check `isNative()`).
  - Android fixes a channel's sound when the channel is created, so each choice has a channel of its own: `todos_reminders` (Default, the original channel) and `todos_reminders_<key>` (`channelFor()`, `channelSpec()` in `native.js`). Silent is a channel of importance 2, Android's own silent notification: in the shade, no sound, no vibration. `reconcile()` creates the chosen sound's channel (once per run of the app and per sound), schedules on it, re-schedules every pending reminder when the choice changes (`diffReminders()` compares `extra.sound`; a reminder from before this feature counts as Default) and then deletes the other `todos_reminders*` channels, so the phone's notification settings list one "Reminders". Android remembers a deleted channel's settings and restores them when that sound is chosen again.
  - The tones are synthesised by `scripts/generate-sounds.mjs` (`npm run android:sounds`; plain Node, no samples, no dependencies): 16-bit mono WAV at 22.05 kHz, about 1 s each, written to `app/sounds/` (the panel's preview) and `android/app/src/main/res/raw/` (the channel's sound: `res/raw` is the only place the plugin takes a channel sound from). The two copies must match, and `native-check` checks that they do. `res/raw/silent.wav` is what Android 7 (no channels) plays for Silent: there the notification's own `sound` field decides, and `toNotification()` fills it for every choice but Default.
- **Back button** (`handleBack()`, pure, testable in a browser): closes the topmost thing in this order: Quick Find, the When picker, a card menu, the Sync panel, the Reminder Sound panel, the open to-do card, the composer (which saves a titled draft, like clicking away), then on phone layout back to `#/lists`, then `App.minimizeApp()`. `account.isOpen()`, `sounds.isOpen()` and `composer.close()` were added for it.
- **Launcher shortcuts** (`android/app/src/main/res/xml/shortcuts.xml`): New To-Do, Today, Quick Find open `dev.coderlog.todos://new|today|search`; `native.js` reads `App.getLaunchUrl()` and `appUrlOpen` (a cold start reports the URL on both, handled once).

**Checks:** `npm run native:check` = `node scripts/native-check.mjs` (plain Node: desiredReminders, the diff, ids, the repeating before/after, the channel per sound, the sound choice and its files in both places; prints `NATIVE GREEN`) and `node scripts/native-back-check.mjs` (Playwright: the back order at phone and desktop sizes, that `native.js` loads in a browser without console errors, the Reminder Sound panel, and the menus both in a browser and with the Capacitor bridge faked; prints `BACK GREEN`, starts the app server itself). The existing checks (`recur-check`, `sync-check`, `smoke`, the suite) are unchanged.

**Signing and release**
- `scripts/generate-keystore.sh` (run once, on your machine) makes `release.keystore` (RSA 4096, 10000 days, alias `todos`) at the repo root, `release.keystore.base64.txt`, and `android/keystore.properties`; all three are git-ignored. It prompts for the passwords, prints the four `gh secret set` commands (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`) and ends with the reminder to back the key and passwords up outside the repo. Lose them and the published app can never be updated.
- `android/app/build.gradle` reads the signing values from the env (`ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`) or from `android/keystore.properties`, and signs the release build type only when all four are present, so debug and Android Studio builds need no key. `versionCode` comes from env `VERSION_CODE` (default 1) and `versionName` from `VERSION_NAME` (default `0.1.0`).
- **CI, `.github/workflows/android.yml`** (the PR that added this could only push it as `.github/workflows-pending/android.yml`: the Claude GitHub App has no `workflows` permission. Move it with `git mv .github/workflows-pending/android.yml .github/workflows/android.yml` and commit; nothing else changes.)**:** on every PR and on pushes to `main`, the `debug` job runs `assembleDebug` and uploads `app-debug.apk` (no secrets: this is the build check). On a `v*` tag or a manual run, the `release` job checks the four secrets exist (fails with a message naming the missing one), decodes the keystore into `$RUNNER_TEMP`, builds `assembleRelease bundleRelease` with `VERSION_CODE` = the run number and `VERSION_NAME` = the tag without `v` (or the manual input), uploads `todos-<version>.apk/.aab`, and on a tag attaches them to a GitHub Release. Setup: Node 22 with the npm cache, Temurin 21, `gradle/actions/setup-gradle`, `npm ci`, `npx cap sync android`; the Android SDK is preinstalled on `ubuntu-latest`.
- Don't add `USE_EXACT_ALARM`: Play restricts it to alarm and calendar apps. The plugin's manifest already declares `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM` and `RECEIVE_BOOT_COMPLETED` (it reschedules after a reboot).

**Known limits**
- Email/password sign-in only, as on the web; no OAuth or deep-link sign-in.
- Reminders depend on the exact-alarm setting and on the maker's battery settings; a phone that kills background alarms will miss them. The browser copy still fires nothing.
- **Exact timing.** The manifest asks for `USE_EXACT_ALARM` (granted outright on Android 13+, no settings trip; Google Play reserves it for apps whose core is alarms, reminders or calendar events, which reminders are here) and `SCHEDULE_EXACT_ALARM` with `maxSdkVersion 32` (Android 12, granted on install, revocable under "Alarms & reminders"). `reconcile()` reads `checkExactNotificationSetting()` and passes the answer as `isExactNotification` on every notification it schedules: exact when allowed, inexact (Android may be minutes late) when not. That flag matters: the plugin (8.3) defaults it to exact and, when exact alarms are off, opens the settings screen from inside every `schedule()` call, and `reconcile()` runs on every store change and resume, which looped the screen. The settings screen is offered once, the first time exact alarms are seen off. A reminder scheduled the other way is re-scheduled when the setting changes (`extra.exact`, compared by `diffReminders` when it is given the current setting).
- Today and This Evening reminders are scheduled one day at a time: tomorrow's is created by the next reconcile after midnight (a resume or a store change). An app not opened for days reminds only for the last day it was opened on; dated to-dos are scheduled ahead regardless.
- **Reminder sound.** Silent is a low-importance channel (Android's own silent: shown, no sound, no vibration); Android 7 has no channels, so there it is a silent sound file on the notification and the default vibration stays. Changing the sound deletes the previous channel, which also dismisses a reminder of its that is still showing in the shade. Picking any system sound in the app, or a link from the panel to the channel's settings page, would need a native plugin (the plugin only takes a `res/raw` file as a channel sound); the channel's sound can still be changed by hand under Android's notification settings for Todos, and Android keeps that change for as long as the choice stays.
- The WebView is the system one (Chromium); very old WebViews (< v140) handle `viewport-fit=cover` through Capacitor's `insetsHandling` default (`css`), which also fills `--safe-area-inset-*`.
- Gradle needs Google's Maven, so a sandbox without it can't build; CI can.

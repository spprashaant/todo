# Build contract

The goal is a todo app that runs in the browser on Mac and Windows and installs on Android as a PWA. It is judged two ways:

1. **Blind A/B against Things.** Things' own marketing screenshots are in `bar/`. For each piece in `gauntlet/pieces.json`, a separate critic with fresh context sees our screenshot and the Things crop, with labels stripped, at desktop and at phone size, and picks the better one. A piece is done only when the critic picks ours at both sizes.
2. **The official TodoMVC test suite.** `bash tools/suite.sh <who>` runs the unmodified `vendor/todomvc/cypress/e2e/spec.cy.js` against our app, then runs a copy that fixes only two harness bugs. Under Cypress 15 those bugs fail 3 tests for every app that persists to localStorage, including TodoMVC's own knockoutjs reference app. The run is green when the unmodified spec shows no failures beyond those 3 and the patched copy passes 29/29. It prints `SUITE GREEN` or `SUITE RED`.

## Stack and layout (decided, do not change)

Plain HTML, CSS and ES modules. No framework, no build step, no CDN or other network dependency. The one exception is cloud sync (see "Cloud sync"): it is optional, stays off until the person signs in, and its client is a local copy in `app/vendor/`. The app lives in `app/` and must work from any base path, so use relative URLs only. It is served at `http://localhost:5173/app/` (`node tools/serve.mjs`) and, for the suite, at `http://localhost:8000/examples/todo/` through a symlink.

```
app/index.html            shell markup (shared)
app/manifest.webmanifest  PWA manifest (shared)
app/sw.js                 service worker, network-first (shared)
app/icons/                app icons (shared)
app/css/base.css          design tokens, reset, typography, app shell layout (shared)
app/css/<piece>.css       one file per piece: rows, project, sidebar, detail, when, quickfind, composer
app/js/app.js             boot + service worker registration (shared)
app/js/store.js           state, persistence, all mutations (shared)
app/js/router.js          hash routing (shared)
app/js/dates.js           date helpers (shared)
app/js/view.js            top-level render that composes the piece modules (shared)
app/js/icons.js           inline SVG icon set (shared)
app/js/<piece>.js         one module per piece: rows, project, sidebar, detail, when, quickfind, composer
app/js/config.js          Supabase project URL and publishable key (shared)
app/js/sync.js            cloud sync engine, no UI (shared)
app/js/account.js         the Sync panel; its styles are app/css/account.css
app/vendor/supabase.mjs   @supabase/supabase-js UMD build plus one export line (do not edit)
supabase/migrations/      the database schema, as applied to the Supabase project
```

Each piece in `gauntlet/pieces.json` owns its CSS and JS file. Phone rules for a piece go in that piece's own file as media queries.

## Rules for every builder

- Several builders work at the same time. Edit your own piece's files freely. For shared files, re-read right before each edit, make small surgical edits, never rewrite a whole shared file and never revert someone else's change. Only touch another piece's files when there is no other way, and keep that edit minimal.
- Never edit `bar/`, `gauntlet/pieces.json`, `gauntlet/seeds/`, `tools/`, or `vendor/`. If a shot recipe cannot be satisfied, fix the app. If the recipe itself is wrong, say so in your result.
- No hacks to satisfy tests or critics. That means no screen-reader-only `h1`, no detecting Cypress or Playwright, and no styling that only applies during screenshots.
- Before you finish, `bash tools/suite.sh <your-piece-id>` must print `SUITE GREEN`. If a failure is clearly in code another builder is changing right now, re-run once before digging in.
- Look at your work: `node tools/shoot.mjs <piece> --compare` writes `gauntlet/<piece>/compare-{desktop,phone}.png` with ours and Things side by side, labelled. Read those images. Compare pixel sizes, spacing, weights, colours, glyphs and alignment against the real thing, not against a memory of it.

## TodoMVC DOM contract (from the spec, exact)

The suite runs at a viewport of 890×660 and starts every test with empty localStorage at `/examples/todo/` (empty hash).

- An `h1` whose whole text is `Todos` (any case) must be genuinely visible at 890×660.
- `input.new-todo` must be visible in the default view even with zero to-dos, and focused on load when the pointer is fine (desktop). Enter adds the trimmed title to the bottom of the current list and clears the field. Empty input is ignored. On touch devices do not autofocus.
- `.main` wraps the list. It is not visible when there are no to-dos at all, and visible otherwise.
- `ul.todo-list > li`, one per visible to-do. `li.completed` when done and `li.editing` while editing.
- Inside each `li`:
  - `input.toggle[type=checkbox]`. It must be visible and clickable without `force`, so use a styled real checkbox (`appearance:none`).
  - A `label` with the title. Double-clicking it starts editing.
  - `button.destroy`.
  - `input.edit`, whose value is the title. It is only visible while editing.
- Editing: Enter saves the trimmed title, and an empty title deletes the to-do. Blur saves. Escape cancels and restores the old title. While a `li` is editing, its `.toggle` and `label` are not visible.
- `input.toggle-all[type=checkbox]`: checking it completes all, and unchecking it un-completes all. Its checked state tracks "every to-do completed". The spec uses `force`, so it may be visually hidden, but it must work and be reachable from the UI, for example via a `<label for>` in a menu.
- `.footer` is not visible when there are no to-dos, and visible otherwise. It contains `span.todo-count` with the number of active to-dos (for example "2 items left").
- `.filters li a` with the texts `Active`, `All` and `Completed`, in that order, linking to `#/`, `#/all` and `#/completed` in the Inbox (other lists use their own prefix, see Routes). The current one has `a.selected`. The back button must work.
- `button.clear-completed` contains the text `Clear completed` and is visible only when at least one to-do is completed.
- Persistence: localStorage key `things-todos` holds a JSON array of to-dos with at least `title` and `completed`. Write it synchronously on every change, with no debounce. Store nothing else as a JSON array.
- With empty storage the app starts with nothing. No sample data, ever.

## Data model

`localStorage["things-todos"]` is an array of:

```json
{
  "id": "t_abc", "title": "Borrow Sarah’s travel guide", "completed": false, "completedAt": null,
  "notes": "", "checklist": [{ "id": "c1", "title": "London from June 3", "completed": false }],
  "when": null, "deadline": null, "tags": [],
  "project": null, "area": null, "heading": null,
  "createdAt": "2026-09-26T09:00:00.000Z"
}
```

- `when` is `null`, `"today"`, `"evening"` (today, in the This Evening section), `"someday"`, or `"YYYY-MM-DD"`. A date on or before today counts as today.
- `deadline` is `null` or `"YYYY-MM-DD"`.
- `project` is a project id. `area` is an area id, used for to-dos directly in an area. `heading` is a heading id inside the project.
- Every field except `id`, `title` and `completed` is optional. Treat a missing field as its empty value.

`localStorage["things-lists"]` is a JSON object, never an array:

```json
{
  "areas":    [{ "id": "a_work", "title": "Work" }],
  "projects": [{ "id": "p_pres", "title": "Prepare Presentation", "area": "a_work", "notes": "…",
                 "headings": [{ "id": "h_slides", "title": "Slides and notes" }] }],
  "tags":     ["Important", "Diane"]
}
```

A project's progress pie is its completed to-dos divided by its total to-dos. Array order is display order.

"Today" is `new Date()` in local time. The screenshot harness freezes the clock, so never hard-code dates.

## Repeating to-dos

The bar for this feature is Asana's recurring tasks (`bar/asana/`, with `NOTES.md`), above all its option that creates the next task a chosen interval after the current one is completed. The look stays Things. `node tools/recur-check.mjs` is the behaviour check. It must print `RECUR GREEN`, and so must `tools/suite.sh`.

A to-do repeats when it has a `repeat` object. A missing or `null` `repeat` means it doesn't repeat.

```json
{ "mode": "completion", "every": 2, "unit": "day" }
{ "mode": "schedule", "every": 1, "unit": "week", "weekdays": [1, 4] }
{ "mode": "schedule", "every": 1, "unit": "month", "monthly": { "day": 31 } }
{ "mode": "schedule", "every": 1, "unit": "month", "monthly": { "nth": 2, "weekday": 2 } }
{ "mode": "completion", "every": 1, "unit": "day", "ends": { "after": 3 } }
{ "mode": "schedule", "every": 1, "unit": "day", "ends": { "on": "2026-03-12" } }
```

- `every` is a whole number of at least 1. `unit` is `"day"`, `"week"`, `"month"` or `"year"`.
- **`mode: "completion"`** is the after-completion rule. The next occurrence falls `every` units after the day the current one is completed. Its old date doesn't matter, so nothing piles up. It ignores `weekdays` and `monthly`.
- **`mode: "schedule"`** is a fixed calendar. It takes its phase from the occurrence's own date (`when`, or the completion day when `when` isn't a date).
  - Weekly uses `weekdays` (0 is Sunday). When they're missing, it uses the date's weekday.
  - Monthly uses `monthly.day` (1 to 31, clamped in short months, with the anchor kept, so 31 gives Jan 31, Feb 28, Mar 31) or `monthly.nth` (1 to 4, or -1 for last) plus `weekday`. When both are missing, it uses the date's day.
  - Yearly keeps the month and day, and Feb 29 clamps.
  - The next date is the first date of the rule that comes strictly after both the occurrence's date and today. Finishing late skips the missed dates and never creates an overdue occurrence.
- Month and year steps in completion mode clamp to the end of short months.
- `ends.after` is the total number of occurrences in the series, counting the first. `ends.on` is the last date an occurrence may fall on. With neither, the series never ends.
- `series` is an id shared by every occurrence of one repeating to-do. `nextId`, on a completed occurrence, is the id of the occurrence its completion created. Anything else the engine needs is its own choice. Document it here.
- Engine fields (all optional, written only by `store.js`; everything else must leave them alone):
  - `series` is given on first completion (the to-do's own id) when it's missing. A completed occurrence keeps its `repeat`, so unticking can restore it. Reopening clears `nextId`.
  - `occurrence` is the 1-based position in the series, used by `ends.after`. Missing means 1. Turning repeat on for a to-do that didn't repeat starts a new series: the count starts again at 1, and a to-do that already had a `series` gets a fresh one. So the old series' occurrences never count towards the new rule's end, and turning repeat on never makes a second open repeating occurrence in one series.
  - `anchorDay` (29 to 31) is set on a next occurrence whose date was clamped by a monthly rule without `monthly` or by a yearly rule. For example, Jan 31 gives Feb 28 with `anchorDay: 31`, so the one after is Mar 31, and Feb 29 comes back in leap years. It only counts while the date is still that month's last day and only for the kind of rule that made it (a yearly rule only ever uses 29 on Feb 28). Changing `when` drops it, and so does changing the rule itself (anything but its `ends`): the new rule takes its day from the date, so a Feb 28 occurrence of a monthly series switched to Yearly stays on Feb 28.
  - `spawnKey` is a fingerprint of the next occurrence's editable fields when the engine created it: every field except `id`, `completed`, `completedAt`, `createdAt` and these engine fields, with empty values counted as missing and checklist items compared by title and tick. "Unedited" means the fingerprint still matches. Only an open occurrence with a matching `spawnKey` is taken back. Deleting a heading isn't a person's edit: an unedited occurrence under it stays unedited.
- The next occurrence is inserted right after the completed one in the array, so it lands in the same list and heading. It is a copy of every other field, with a new `id`, `createdAt`, `when`, deadline and checklist item ids.
- Deadline lead is `deadline − when`, or `deadline − completion day` (never less than 0) when `when` isn't a date. If the moved deadline would fall on or before today, it becomes the next date itself, so a new occurrence never starts out overdue.
- `normRepeat` keeps any keys of a rule that the data model doesn't define, so a picker can store its own hints.

Behaviour (all in `store.js`, through every completion path: the row checkbox, the card checkbox, Complete All, Cmd/Ctrl+K and the phone menu):
- Completing an open repeating to-do creates exactly one next occurrence, a new to-do with:
  - `when` set to the next date (a `"YYYY-MM-DD"` string)
  - the same title, notes, tags, project, area, heading, reminder time and `repeat`
  - the checklist copied with every item unticked
  - the deadline moved so it keeps the same lead over `when`

  The completed occurrence stays where it was, checked and dimmed, and shows in the Logbook.
- Unticking a completed occurrence takes back the occurrence it created, as long as that one is still open and unedited. The reopened one carries the rule again only when that puts it back at the head of its series: its next occurrence was taken back, or its completion created none (the series had ended there) and no other open occurrence repeats. Otherwise the series has moved on without it (its next occurrence was completed, edited, stopped repeating or deleted), so it comes back as a one-off without the rule, and ticking it again creates nothing. So a series never has two open repeating occurrences, never has two of the same occurrence, and never runs past `ends` or comes back after it has ended.
- Reopening several at once (un-checking Complete All) never takes back an occurrence that is itself being reopened, so the order of the list doesn't matter.
- A double-click (or double-tap) on a box, or on a row's delete button, acts on that one to-do. Where finished to-dos are hidden (Active) the next occurrence takes the finished one's place under the pointer (and in Completed the next finished one moves up, and after a delete the next row does, often the next occurrence), so a second click of the pair (the browser's own click count, `detail` 2 or more) that reaches a different to-do than the first one did changes nothing, and that box is drawn as it was. A second click on the same to-do flips it back, like any checkbox. Clicks the browser counts as separate each count, however quick.
- Only completion creates occurrences. Time passing, loading, reloading and viewing never do.
- Deleting the open occurrence ends the series. Clear completed removes only finished occurrences.
- Complete All reads as checked when every to-do in the list is completed, counting an open occurrence that completing one of them created (its `nextId`) with that one while its date is still to come (`store.allCompleted`). Completing all leaves such an occurrence alone, since it already counts as done with the one before it. Once its day comes it is open work like any other: the box reads unchecked and Complete All completes it, instead of reopening the one before it. So after Complete All in a list that keeps the next occurrences (a project, an area, Upcoming) un-checking it takes them back, and a second click doesn't complete them too. A click on any Complete All (the toolbar, the phone list menu, the box itself, a project's own menu, a heading's menu for that heading's to-dos) flips the state the person saw (`store.toggleAll`), whatever else the click does (it may deselect a row). "Its date is still to come" is judged on the day on screen: the view redraws when the day changes (at midnight, and when the page is shown again), records the day it drew in `ui.shownDay`, and a press remembers the day that was on screen when it began. So on a page left open past midnight whose box still reads checked, the click un-checks it (reopening and taking the next occurrences back), and never completes the new day's occurrence.
- The open card saves its title as it is typed, like its notes, so every completion path from the card (its checkbox, More > Complete, Cmd/Ctrl+K) copies the title on screen into the next occurrence, and a typed title makes a next occurrence "edited". Escape in the title still restores the old one, unless completing or reopening from the card has already committed it.
- Cmd/Ctrl+K in the open card works wherever its focus is (title, notes, checklist, its buttons, or nothing focused on a phone) and acts on the card's to-do, like its checkbox. A card or selection whose to-do leaves the list on screen (a filter hides it once completed or reopened, it moves, another tab changes it) closes or is dropped with it, so no key acts on a to-do the person can no longer see. A card whose to-do stays in the list stays open when its row moves (to another date section or list group, or because a section above it comes or goes, the day changes or another tab edits it), with the focus and caret where they were and the card in sight, so what is typed next still goes into it. Clicking the card's checkbox leaves the focus where it was.
- Several tabs share one storage. Every change in `store.js` first re-reads storage when another tab has written since, so a tab whose storage event hasn't arrived yet never writes its stale copy over the other tab's work, and never completes or reopens from an outdated state (a toggle such as Cmd/Ctrl+K still flips the way the person saw it). An open card shows another tab's new title, notes and checklist text wherever nothing typed in it is unsaved, and closing it (or Escape) only ever writes back what was typed in that card. An open When picker follows its to-do the same way: another tab's date, reminder and rule show in it, each change made in it applies only what was changed there to the to-do as stored now (so it never writes back an older rule, and never restarts a rule stopped elsewhere), and it closes when the to-do is deleted. Clear completed removes only what is still completed.

UI:
- Following Asana, the repeat controls live in the When picker (desktop popover and phone sheet), with the Things look.
  - A Repeats section shows the current kind and the fields for that kind, such as the interval after completion, weekday toggles, and monthly nth weekday or day.
  - When the to-do already repeats, the picker opens with this section showing its rule.
  - When it doesn't, `[data-action="repeat"]` in the picker turns repeating on.
  - Every kind the data model can express must be reachable. There must be a way to stop repeating.
  - Rule and reminder changes commit as they're made. On the phone sheet, Cancel becomes Done as soon as a change made in it is saved, so a sheet that still says Cancel has changed nothing.
- Hooks for shot recipes:
  - `data-shot="repeat"` is the Repeats section.
  - `[data-action="repeat-type"]` inside it opens the list of repeat kinds.
  - `data-shot="repeat-kinds"` is that open list.
- A to-do that repeats says so wherever it shows: its row, its open card, and its When chip.
- The 7 Things pieces above are all won. They will be re-judged after this feature, so nothing here may cost any of them.

## Cloud sync

Signed in (Settings menu → Sync… on desktop, the list menu → Sync… on phone), the to-dos sync through Supabase. `node tools/sync-check.mjs` is the behaviour check. It runs two devices against a stand-in server and must print `SYNC GREEN`.

- localStorage stays the app's own store, exactly as above. The suite reads it, and the app works offline from it. Sync is a layer on top of it: `store.replaceData()` is its only way in.
- Each to-do, area, project and tag is one row of `public.items`, keyed `(user_id, kind, id)`. `data` is the item as stored here, and `position` orders it within its kind. A deletion is a row with `deleted = true`. Row level security limits every row to its owner, and `anon` has no access.
- Moving or inserting an item gives only that item a new position, between its neighbours. Ties go by id.
- A conflict goes to the later edit (`modified_at`, the device's clock). The server skips an update older than the row it holds.
- Signed out, sync loads nothing, sends nothing and stores nothing extra. Signed in, it adds `things-auth` (the session) and `things-sync-<user id>` (what the server last had and what changed here), both JSON objects.

## Views and routes

- Inbox is the default view. It holds to-dos with no `when`, no `project` and no `area`. Its routes are `#/` (Active), `#/all` and `#/completed`; `#/active` is accepted as a synonym of `#/`. New to-dos typed in the Inbox go to the Inbox.
- The other views are `#/today`, `#/upcoming`, `#/anytime`, `#/someday`, `#/logbook`, `#/project/<id>` and `#/area/<id>`. Each takes an optional filter suffix, `/active`, `/all` or `/completed`. Their filter links point at the same list, for example `#/today/all`.
- A bare route (`#/`, `#/today`, …) shows Active: every list opens under Active, wherever it is opened from (the sidebar, Quick Find, an area's project list, the list headings in Anytime and Someday, the keyboard shortcuts, the app's start). All is an explicit `/all` segment (`#/all`, `#/today/all`, `#/project/<id>/all`). The Logbook holds only finished to-dos, so it is the one list whose bare route is All (`#/logbook`; `#/logbook/active` and `#/logbook/completed` exist). This departs from TodoMVC, whose spec expects `#/` to show All: its tests that complete an item and expect to still see it, and the one expecting All to be highlighted at start, fail by design since the switch to Active by default.
- `#/lists` is the phone home screen, the sidebar shown full-screen. On desktop it shows the sidebar selection-free next to Inbox content.
- Today shows today's to-dos, overdue dated ones and today-deadline ones, then a "This Evening" section. Each row carries its project or area name as a subtitle.
- A project view shows a header (pie, title, more button, notes), then the filter pills, to-dos without a heading, then one section per heading.
- Composer placement: new to-dos typed in Today get `when:"today"`, and in a project they get `project:<id>`.
- Under "All", open to-dos come first in each section and completed ones, checked and dimmed, sink to the bottom of their section in list order. Clear completed removes them. The Logbook lists completed to-dos.
- Filters use the Things pill style under the list header. Active, All and Completed replace Things' tag pills; Active comes first and is what every list opens under.

## Responsive and PWA

- Desktop is 900px and wider: a sidebar and a content pane. Phone is under 700px: one column, a top bar with a back chevron to `#/lists`, a floating blue + button (bottom right) that opens the composer, and safe-area insets. Between those two widths, use judgement.
- The PWA must be installable on Android Chrome. That needs `manifest.webmanifest` with name "Todos", `short_name`, `start_url: "./"`, `scope: "./"`, `display: "standalone"`, theme and background colours, and PNG icons at 192 and 512 plus a maskable 512. It also needs `sw.js` registered from `app.js` (network-first, with the app shell cached for offline), `<meta name="theme-color">`, `apple-touch-icon`, and `viewport-fit=cover`.

## Screenshot hooks

Shot recipes capture elements by these attributes. Keep them on the right elements:

| attribute | element |
|---|---|
| `data-shot="app"` | app root |
| `data-shot="sidebar"` | desktop sidebar; on phone, the `#/lists` home screen root |
| `data-shot="content"` | the content pane (desktop right side, phone the whole screen below any system UI) |
| `data-shot="header"` | the list header (icon, title, notes, filters) |
| `data-shot="list-body"` | everything below the header: rows, headings, sections |
| `data-shot="detail"` | the open to-do card (the `li.editing`) |
| `data-shot="when"` | the When picker popover or sheet |
| `data-shot="quickfind"` | the Quick Find panel |
| `data-shot="composer"` | the composer while it is open |

Open states must be reachable by real UI actions, because recipes click and type:

- Double-clicking a `.todo-list li label` opens that to-do's detail card.
- Inside an open card, `[data-action="when"]` opens the When picker for it.
- `[data-action="quickfind"]` opens Quick Find, and so does typing `/` or Cmd/Ctrl+F.
- `[data-action="new-todo"]` (the toolbar + on desktop, the floating + on phone) opens or focuses the composer.

export const meta = {
  name: 'recurrence-gauntlet',
  description: 'Repeating to-dos vs Asana: per piece a builder, then a blind 3-critic panel (UI) or 3 adversarial testers with verified breaks (engine); loop until ours wins',
  phases: [{ title: 'Gauntlet', detail: 'build → judge, looping per piece' }],
}

const ROOT = '/Users/pr/Desktop/dev/Todo'
const SCRATCH = args.scratch || '/tmp/recur-gauntlet' // testers' and verifiers' scripts go here
const PW = `${ROOT}/node_modules/playwright/index.mjs`
const K = args.rounds || 3
const PANEL = 3

const VIS_LENSES = [
  'Look first at clarity: how fast a person understands what is set and what each control will do.',
  'Look first at typography, spacing, alignment and vertical rhythm.',
  'Look first at iconography, colour, contrast, affordances and the finish of small details.',
]
const ENGINE_LENSES = [
  'Completion paths and undo: the row checkbox, the open card checkbox, Cmd/Ctrl+K on a selected row, Complete All and un-checking it, the phone card bar More menu, the Logbook, fast repeated clicks, and complete/untick/re-complete sequences in every order and across different lists.',
  'Dates: every mode and unit, every N, weekdays, nth and last weekday, month ends, leap years, the March and November DST changes, year boundaries, ends after N and ends on a date, finishing early, on time and very late, and to-dos whose when is today, this evening, someday or empty, with and without a deadline and a reminder.',
  "Data integrity: reloads, a second tab changing the same storage, editing an occurrence or its rule mid-series, moving it to another project or heading, deleting occurrences, Clear completed, and whether anything a person typed is ever lost or duplicated. Also compare with Asana's documented behaviour in bar/asana/NOTES.md: where ours treats the user clearly worse, that is a break.",
]

const others = p => args.pieces.filter(o => o.id !== p.id).map(o => `${o.id} (${o.owns.join(', ')})`).join('; ')

const keySchema = shots => ({ type: 'object', properties: Object.fromEntries(shots.map(s => [s, { type: 'string', enum: ['A', 'B'] }])), required: shots })
const BUILD = shots => ({
  type: 'object',
  properties: { key: keySchema(shots), suiteGreen: { type: 'boolean' }, suiteLine: { type: 'string' }, recurLine: { type: 'string' }, summary: { type: 'string' } },
  required: ['key', 'suiteGreen', 'summary'],
})
const VERDICT = shots => ({
  type: 'object',
  properties: { ...Object.fromEntries(shots.flatMap(s => [[s, { type: 'string', enum: ['A', 'B'] }], ['gap_' + s, { type: 'string' }]])), why: { type: 'string' } },
  required: shots.flatMap(s => [s, 'gap_' + s]),
})
const ENGINE_BUILD = {
  type: 'object',
  properties: { checkGreen: { type: 'boolean' }, checkLine: { type: 'string' }, suiteGreen: { type: 'boolean' }, suiteLine: { type: 'string' }, summary: { type: 'string' } },
  required: ['checkGreen', 'suiteGreen', 'summary'],
}
const ATTACK = {
  type: 'object',
  properties: { checkGreen: { type: 'boolean' }, checkLine: { type: 'string' }, broken: { type: 'boolean' }, gap: { type: 'string' }, repro: { type: 'string' }, why: { type: 'string' } },
  required: ['checkGreen', 'broken', 'gap'],
}
const CONFIRM = { type: 'object', properties: { confirmed: { type: 'boolean' }, reason: { type: 'string' } }, required: ['confirmed', 'reason'] }
const REGRESS = { type: 'object', properties: { added: { type: 'array', items: { type: 'string' } }, failingNow: { type: 'array', items: { type: 'string' } }, checkLine: { type: 'string' }, notes: { type: 'string' } }, required: ['added', 'checkLine'] }

const histText = history => history.slice(-4).map(h =>
  `- round ${h.round}: ${Object.entries(h.won).map(([s, w]) => `${s} ${w ? 'ours won' : 'Asana won'}`).join(', ')}. Gap then: ${h.gap || '(none)'}`).join('\n')

function builderPrompt(p, round, gap, history) {
  const hist = histText(history)
  return `You are the builder for one piece of a new feature in the Todos web app at ${ROOT}: repeating to-dos. This is round ${round} of a gauntlet against Asana's real recurring-task UI. A panel of 3 separate harsh critics, each with fresh context, compares your result against Asana's blind (labels stripped), one pair per shot: ${p.shots.join(', ')}. Both images in a pair first go through the same lossy pipeline, so only design decisions can win, never rendering crispness. The piece is done only when a majority of the panel picks ours on every shot.

Piece: ${p.id}, "${p.title}". The critics judge: ${p.judge}
You own: ${p.owns.join('; ')}.
Read first: gauntlet/CONTRACT.md (the whole file, and above all "Repeating to-dos"), bar/asana/NOTES.md (what Asana offers and how it behaves), and this piece's recipe in gauntlet/pieces.json ("shots": the exact seed, clock, route, clicks and capture each critic image comes from; "refs": the full Asana source images).

The look stays Things. This app already beat the real Things app blind on 7 pieces, and your work must look like it belongs in it: study how app/js/when.js and app/css/when.css draw the When picker, and app/css/detail.css and app/css/rows.css. Take Asana's capabilities and clarity, not its styling. Nothing you do may cost those 7 pieces; they will be re-judged against Things after this feature. If you change a screen one of them captures (the When picker is piece "when", the open card "detail", rows "today" and "project"), run node tools/shoot.mjs <that piece> --compare before and after your change and make sure it did not get worse.

Other builders are working at the same time: ${others(p)}. Follow the contract's shared-file etiquette: re-read right before each edit, small surgical edits, never revert someone else's change.

${gap
    ? `The last blind verdict went against us. These are the gaps named by the critics who picked Asana (they say "the loser", which was ours). Where critics agree, that is the priority:\n${gap}`
    : `No verdict yet. Build the piece, then close the biggest differences between ours and Asana's on every shot.`}
${hist ? `\nEarlier rounds (do not regress what they fixed):\n${hist}\n` : ''}
Work like this:
1. Run \`node tools/status.mjs ${p.id} building "<one line: what you are doing>"\`.
2. Run \`node tools/shoot.mjs ${p.id} --compare\` and study gauntlet/${p.id}/compare-<shot>.png for every shot, plus the full Asana images in "refs". Crop and zoom with \`python3 tools/img.py crop\`. Measure sizes, gaps, weights and colours rather than eyeballing them.
3. Build and fix at the root. Make it real for people, not just for the shots: every kind the data model can express is reachable, repeating can be turned off, it works by keyboard, on the phone sheet and on desktop, and the rule is saved with updateTodo(id, { repeat }). Keep the app honest and general: never special-case the seed content. No screenshot-only styling, no test detection.
4. Repeat shoot, look, fix until you would pick ours yourself on every shot, looking with a hostile eye.
5. Run \`bash tools/suite.sh ${p.id}\`. It must print SUITE GREEN. If a failure is clearly in another builder's in-flight work, wait a minute and re-run once. Also run \`node tools/recur-check.mjs --who ${p.id}\` and report its last line. The repeat engine in store.js belongs to the recur-engine builder, so don't write engine code, but don't break scenarios that pass.
6. Run \`node tools/pair.mjs ${p.id} ${round} --note "<one line: what you changed>"\`. It prints a line \`PAIR_KEY {...}\`.

Return "key" exactly as printed in PAIR_KEY, "suiteGreen" (whether suite.sh printed SUITE GREEN), "suiteLine" (the SUITE line), "recurLine" (the RECUR line) and "summary" (at most 2 sentences on what you changed).`
}

function criticPrompt(p, round, idx) {
  const d = `${ROOT}/gauntlet/${p.id}/r${round}`
  const pairs = p.shots.map(s => `- "${s}": ${d}/${s}-A.png and ${d}/${s}-B.png`).join('\n')
  const flags = p.shots.map(s => `--${s} <A|B> --gap-${s} "<gap>"`).join(' ')
  return `You are a harsh product-design critic. Praise is useless here. Your only job is to decide which of two UIs is better, and to say what most holds the loser back.

Each pair below shows the same kind of UI, in the same state, with near-identical content, from two different apps. They are labelled only A and B. Component: ${p.title}. What matters: ${p.judge}

${pairs}

Both images in each pair went through the same lossy pipeline: downscaled, JPEG-compressed and scaled back up. Softness, compression ringing and resolution say nothing about the design, so ignore rendering fidelity completely. A mouse cursor visible in an image is a screen-recording artefact: ignore it. One app may be light and the other dark; neither is better for that. Judge only design decisions: what was drawn, at what size, weight, colour and position, and how clearly it communicates. ${VIS_LENSES[idx % VIS_LENSES.length]} Then weigh everything.

Open every image with the Read tool. Crop and zoom with \`python3 ${ROOT}/tools/img.py crop SRC DST x y w h\` into /tmp if details are small. Open nothing else: no other files under gauntlet/, not bar/, not the app, not a browser. Do not try to work out which app is which. Judge only what is in front of you.

For each pair, pick A or B: the one a top-tier product designer would rather ship. Judge clarity (can you tell at a glance what is set and what each control does), typography (size, weight, hierarchy), spacing and rhythm, alignment, iconography, colour and contrast, affordances, density, and the polish of details such as strokes, radii and rendering. Also judge whether it looks native and intentional. Differences in image dimensions, cropping or exact label wording are not quality, unless the wording is unclear. No ties: if they are close, pick the one with fewer or smaller flaws.

Then, for each pair, name the single biggest thing that makes the losing image worse than the winner. Make it concrete and fixable: what it is, where it is, and what the winner does instead, with approximate pixel sizes or colours. Refer to the images as "the loser" and "the winner", never by letter.

Record the verdict with:
node ${ROOT}/tools/verdict.mjs ${p.id} ${round} --critic ${idx + 1} --of ${PANEL} ${flags} --why "<one line on the deciding factor>"
It prints only "recorded". Then return the same fields: for each pair its pick under the pair's name and its gap under "gap_<name>", plus "why".`
}

function engineBuilderPrompt(p, round, gap, history) {
  const hist = history.slice(-4).map(h => `- round ${h.round}: ${h.won.behaviour ? 'held' : 'broken'}. Gap then: ${h.gap || '(none)'}`).join('\n')
  return `You are the builder for the repeat engine of the Todos web app at ${ROOT}, in round ${round} of a gauntlet. Repeating to-dos are a new feature; the bar is Asana's recurring tasks, above all the option that creates the next task a chosen interval after the current one is completed, so a chore like "Clean room" never piles up.

Read first: gauntlet/CONTRACT.md (all of it, and above all "Repeating to-dos": the data model, the date rules and the behaviour you must implement), bar/asana/NOTES.md (Asana's documented behaviour), tools/recur-check.mjs (the scenarios that judge you), app/js/recur.js (the date math: normRepeat, nextDate, describe) and app/js/store.js.

You own the repeat parts of app/js/store.js and all of app/js/recur.js (fix it if you find a bug). store.js is shared: other builders are working at the same time (${others(p)}), so re-read before each edit and keep edits small and surgical. Never edit tools/, bar/, gauntlet/pieces.json or gauntlet/seeds/.

Implement the behaviour in store.js so every completion path gets it: the row checkbox and the card checkbox (toggleTodo/updateTodo), Complete All and un-checking it (setCompleted), Cmd/Ctrl+K and the phone card menu, deletes (removeTodo/removeTodos) and Clear completed. Persist synchronously as today; keep normTodo carrying and normalising repeat, series and nextId; document any other field you add in the contract's "Repeating to-dos" section. The TodoMVC suite must stay green.

How you are judged: \`node tools/recur-check.mjs\` must print RECUR GREEN, and then 3 adversarial testers with fresh context will attack the engine through the real UI with their own scripts. Any confirmed break (a violated contract rule, a duplicated or lost occurrence, a lost edit, a page error, or behaviour clearly worse for the user than Asana's documented behaviour) sends you another round.

${gap ? `The last round was broken. Fix these at the root, and look for the whole class of bug each one belongs to:\n${gap}` : 'No verdict yet.'}
${hist ? `\nEarlier rounds:\n${hist}\n` : ''}
Work like this:
1. Run \`node tools/status.mjs ${p.id} building "<one line: what you are doing>"\`.
2. Implement or fix. Then run \`node tools/recur-check.mjs --who ${p.id}\` and fix until it prints RECUR GREEN. Then attack your own work the way a hostile tester would, and fix what you find.
3. Run \`bash tools/suite.sh ${p.id}\`. It must print SUITE GREEN. If a failure is clearly in another builder's in-flight work, wait a minute and re-run once.
Return checkGreen, checkLine (the RECUR line), suiteGreen, suiteLine (the SUITE line) and summary (at most 3 sentences).`
}

function attackPrompt(p, round, idx) {
  const dir = `${SCRATCH}/recur-r${round}-c${idx + 1}`
  return `You are a harsh adversarial tester. Praise is useless. Your job is to break the repeat engine of a todo web app, and to prove it.

The app runs at http://localhost:5173/app/ (if it is down, start it with \`node ${ROOT}/tools/serve.mjs &\`). The behaviour it must follow is the "Repeating to-dos" section of ${ROOT}/gauntlet/CONTRACT.md. The bar is Asana's recurring tasks, documented in ${ROOT}/bar/asana/NOTES.md.

1. From ${ROOT}, run \`node tools/recur-check.mjs --who attacker-${idx + 1}-r${round}\` and note its last lines.
2. Then attack. Your lens: ${ENGINE_LENSES[idx % ENGINE_LENSES.length]}
   Write Playwright scripts in ${dir}/ and run them with node. Import it as \`import { chromium } from '${PW}'\`. Read tools/recur-check.mjs for the harness pattern: a frozen clock (page.clock.setFixedTime), seeded localStorage (things-todos, things-lists), and the same clicks and keys a person uses. Inspect localStorage and the DOM after every step. Never edit anything under ${ROOT}.
3. A break is one of these: a rule in the contract section violated; an occurrence duplicated or lost; something the user typed lost; a page error; or behaviour clearly worse for the user than Asana's documented behaviour. These are not breaks: design preferences, wording, and choices the contract makes on purpose (for example, a schedule skips missed dates instead of creating overdue ones).
4. If you find one, reproduce it twice from a clean start. Report the single most serious break: the seed, the exact steps, what should happen (quote the contract line or Asana's behaviour) and what did happen (storage or DOM). Save the script that reproduces it and give its path.

Record the verdict with:
node ${ROOT}/tools/recur-verdict.mjs ${round} --critic ${idx + 1} --of ${PANEL} --broken <yes|no> --gap "<the break: seed, steps, expected, actual; or 'none found' with what you tried>" --why "<one line>"
Then return checkGreen (whether recur-check printed RECUR GREEN), checkLine, broken, gap, repro (the script path, or ''), why.`
}

function confirmPrompt(round, idx, v) {
  return `A tester claims to have broken the repeat engine of the todo web app at ${ROOT} (served at http://localhost:5173/app/). Your job is to verify the claim independently and skeptically.

The claim: ${v.gap}
Their reproduction script: ${v.repro || '(none given)'}

Rules it is judged against: the "Repeating to-dos" section of ${ROOT}/gauntlet/CONTRACT.md, and Asana's documented behaviour in ${ROOT}/bar/asana/NOTES.md. It counts only if it is a real violation of a contract rule, a duplicated or lost occurrence, lost user input, a page error, or behaviour clearly worse for the user than Asana's documented behaviour. Design preferences, wording, and choices the contract makes on purpose do not count.

Reproduce it yourself from a clean start: run their script if there is one, and read it critically, because a script can be wrong (a bad selector, a click on the wrong row, a wrong expectation, a clock that is not frozen). If it does not reproduce, or it is not a real break by the rules above, it is not confirmed. If you cannot tell, say not confirmed. Playwright imports as \`import { chromium } from '${PW}'\`; write any scripts under ${SCRATCH}/confirm-r${round}-c${idx + 1}/. Never edit anything under ${ROOT}.

If it is NOT confirmed, overwrite the tester's verdict with:
node ${ROOT}/tools/recur-verdict.mjs ${round} --critic ${idx + 1} --of ${PANEL} --broken no --gap "discarded on verification: <reason>" --why "claim did not hold up"
If it IS confirmed, leave the verdict as it is.
Return confirmed and reason (one or two sentences; when confirmed, restate the break precisely so a builder can fix it).`
}

async function runVisual(p) {
  let round = p.round || 1
  let gap = p.gap || null
  let key = p.key || null
  const history = [...(p.history || [])]
  for (let i = 0; i < K; i++) {
    let b = { key, suiteGreen: true, suiteLine: 'pre-paired', summary: 'no change: re-judging the current build' }
    if (!key) {
      b = await agent(builderPrompt(p, round, gap, history), { label: `build ${p.id} r${round}`, phase: 'Gauntlet', schema: BUILD(p.shots) })
      if (!b) return { id: p.id, won: false, round, gap, history, stopped: 'builder failed' }
    }
    key = null
    const votes = (await parallel([0, 1, 2].map(idx => () =>
      agent(criticPrompt(p, round, idx), { label: `critic ${idx + 1}/3 ${p.id} r${round}`, phase: 'Gauntlet', schema: VERDICT(p.shots) })))).filter(Boolean)
    if (votes.length < 2) return { id: p.id, won: false, round, gap, history, stopped: 'critics failed' }
    const ours = s => votes.filter(v => v[s] === b.key[s]).length
    const won = Object.fromEntries(p.shots.map(s => [s, ours(s) * 2 > PANEL]))
    const lost = p.shots.filter(s => !won[s])
    gap = lost.map(s => `${s.toUpperCase()}:\n` + votes.filter(v => v[s] !== b.key[s]).map((v, j) => `  critic ${j + 1}: ${v['gap_' + s]}`).join('\n')).join('\n')
    history.push({ round, won, votes: Object.fromEntries(p.shots.map(s => [s, ours(s)])), gap, builder: b.summary, suite: b.suiteLine || String(b.suiteGreen) })
    log(`${p.id} r${round}: ${p.shots.map(s => `${s} ${ours(s)}/3`).join(', ')} for ours${b.suiteGreen ? '' : ' (suite RED)'}`)
    if (!lost.length && b.suiteGreen) return { id: p.id, won: true, round, history }
    if (!lost.length) gap = 'The panel picked ours on every shot, but the TodoMVC suite was not green. Make tools/suite.sh print SUITE GREEN without regressing the design.'
    round++
  }
  return { id: p.id, won: false, round, gap, history }
}

function regressPrompt(breaks) {
  return `You maintain ${ROOT}/tools/recur-check.mjs, the behaviour check for the repeat engine of the Todos web app at ${ROOT} (served at http://localhost:5173/app/). You are not the builder and not a tester: your job is to make sure a confirmed break can never come back unnoticed.

Adversarial testers confirmed these breaks, and an independent verifier reproduced each one:
${breaks.map((b, i) => `${i + 1}. ${b}`).join('\n\n')}

For each break, add one scenario, it('<plain-English name of the correct behaviour>', ...), to tools/recur-check.mjs in the "regressions" section just above "// ---------- run ----------". Each scenario drives the real UI the way a person would, as the tester's repro script does: same seed, same clicks and keys, same viewport and device (openApp takes viewport; use a phone-sized viewport and touch where the break is on the phone). It asserts the correct behaviour from the "Repeating to-dos" section of gauntlet/CONTRACT.md, not the broken one. Use the existing helpers: openApp, app.toggle, app.destroy, app.go, app.setDay, app.newTab, series, nextIs, invariant, eq, expect. Keep it deterministic: frozen clock, short fixed waits like the other scenarios, no randomness. If a helper needs a small extension (for example touch support for a phone context), make it without changing what existing scenarios assert.

Then run each new scenario with \`node tools/recur-check.mjs --only "<a unique part of its name>"\` from ${ROOT}. On the current build it should FAIL, for the reason the break describes. If it passes, first make sure the scenario really reproduces the tester's steps; keep it only if it does, and say so in notes. Finally run the whole check once with \`node tools/recur-check.mjs --who regressions\`.

Edit only tools/recur-check.mjs. Never touch the app, bar/, gauntlet/ or other tools. Return added (the new scenario names), failingNow (the scenario names that fail in the full run), checkLine (the "N/M passing" line) and notes (anything the builder should know, such as a break you could not turn into a reliable scenario).`
}

async function runEngine(p) {
  let round = p.round || 1
  let gap = p.gap || null
  const history = [...(p.history || [])]
  // Breaks confirmed before this run become scenarios first, so the builder starts from a red check.
  if (p.pendingBreaks && p.pendingBreaks.length) {
    const r = await agent(regressPrompt(p.pendingBreaks), { label: `regressions before ${p.id} r${round}`, phase: 'Gauntlet', schema: REGRESS })
    if (r) gap = `${gap || ''}\n\ntools/recur-check.mjs gained scenarios for these confirmed breaks: ${r.added.join('; ')}. Now: ${r.checkLine}; failing: ${(r.failingNow || []).join('; ') || 'none'}.${r.notes ? ' Notes: ' + r.notes : ''}`
  }
  for (let i = 0; i < K; i++) {
    const b = await agent(engineBuilderPrompt(p, round, gap, history), { label: `build ${p.id} r${round}`, phase: 'Gauntlet', schema: ENGINE_BUILD })
    if (!b) return { id: p.id, won: false, round, gap, history, stopped: 'builder failed' }
    const results = await parallel([0, 1, 2].map(idx => () =>
      agent(attackPrompt(p, round, idx), { label: `attack ${idx + 1}/3 ${p.id} r${round}`, phase: 'Gauntlet', schema: ATTACK })
        .then(async v => {
          if (!v || !v.broken) return v && { ...v, idx }
          const c = await agent(confirmPrompt(round, idx, v), { label: `verify break ${idx + 1} ${p.id} r${round}`, phase: 'Gauntlet', schema: CONFIRM })
          return { ...v, idx, broken: !!(c && c.confirmed), gap: c && c.confirmed ? c.reason + ' | tester: ' + v.gap : v.gap, discarded: !(c && c.confirmed) }
        })))
    const vs = results.filter(Boolean)
    if (vs.length < 2) return { id: p.id, won: false, round, gap, history, stopped: 'testers failed' }
    const checkGreen = !!b.checkGreen && vs.every(v => v.checkGreen)
    const breaks = vs.filter(v => v.broken)
    const held = checkGreen && !breaks.length
    gap = [
      ...(checkGreen ? [] : [`recur-check was not green for everyone: builder "${b.checkLine || b.checkGreen}", testers ${vs.map(v => `"${v.checkLine || v.checkGreen}"`).join(', ')}. Run it and fix every failing scenario.`]),
      ...breaks.map(v => `tester ${v.idx + 1}: ${v.gap}${v.repro ? ` (repro script: ${v.repro})` : ''}`),
    ].join('\n')
    history.push({ round, won: { behaviour: held }, gap, builder: b.summary, suite: b.suiteLine || String(b.suiteGreen), discarded: vs.filter(v => v.discarded).length })
    log(`${p.id} r${round}: check ${checkGreen ? 'GREEN' : 'RED'}, ${breaks.length} confirmed break(s), ${vs.filter(v => v.discarded).length} claim(s) discarded${b.suiteGreen ? '' : ' (suite RED)'}`)
    if (held && b.suiteGreen) return { id: p.id, won: true, round, history }
    if (held) gap = 'The engine held, but the TodoMVC suite was not green. Make tools/suite.sh print SUITE GREEN.'
    if (breaks.length) {
      const r = await agent(regressPrompt(breaks.map(v => `${v.gap}${v.repro ? ` (repro script: ${v.repro})` : ''}`)), { label: `regressions after ${p.id} r${round}`, phase: 'Gauntlet', schema: REGRESS })
      if (r) gap += `\n\ntools/recur-check.mjs now has scenarios for these breaks: ${r.added.join('; ')}. Now: ${r.checkLine}; failing: ${(r.failingNow || []).join('; ') || 'none'}.${r.notes ? ' Notes: ' + r.notes : ''} Make every scenario pass.`
    }
    round++
  }
  return { id: p.id, won: false, round, gap, history }
}

const results = await pipeline(args.pieces, p => p.kind === 'behaviour' ? runEngine(p) : runVisual(p))
return results
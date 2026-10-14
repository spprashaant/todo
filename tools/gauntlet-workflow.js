export const meta = {
  name: 'things-gauntlet',
  description: 'Per piece: builder improves toward Things, a panel of 3 fresh harsh critics judges blind A/B at desktop+phone; repeat until a majority picks ours',
  phases: [{ title: 'Gauntlet', detail: 'build → blind 3-critic panel, looping per piece' }],
}

const ROOT = '/Users/pr/Desktop/dev/Todo'
const K = args.rounds || 3
const PANEL = 3
const LENSES = [
  'Look first at typography and hierarchy.',
  'Look first at spacing, alignment and rhythm.',
  'Look first at iconography, colour and the finish of small details.',
]

const BUILD = {
  type: 'object',
  properties: {
    key: {
      type: 'object',
      properties: { desktop: { type: 'string', enum: ['A', 'B'] }, phone: { type: 'string', enum: ['A', 'B'] } },
      required: ['desktop', 'phone'],
    },
    suiteGreen: { type: 'boolean' },
    suiteLine: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['key', 'suiteGreen', 'summary'],
}

const VERDICT = {
  type: 'object',
  properties: {
    desktop: { type: 'string', enum: ['A', 'B'] },
    phone: { type: 'string', enum: ['A', 'B'] },
    gapDesktop: { type: 'string' },
    gapPhone: { type: 'string' },
    why: { type: 'string' },
  },
  required: ['desktop', 'phone', 'gapDesktop', 'gapPhone'],
}

function builderPrompt(p, round, gap, history) {
  const hist = history.slice(-4).map(h =>
    `- round ${h.round}: desktop ${h.won.desktop ? 'ours won' : 'Things won'}, phone ${h.won.phone ? 'ours won' : 'Things won'}. Gap then: ${h.gap || '(none)'}`).join('\n')
  return `You are the builder for one piece of the Todos web app at ${ROOT}, in round ${round} of a gauntlet against the real Things app. A panel of 3 separate harsh critics, each with fresh context, will compare your result against Things blind (labels stripped) at desktop and phone size. Both images first go through the same lossy pipeline (downscaled, JPEG, upscaled), so only design decisions can win, never rendering crispness. The piece is done only when a majority of the panel picks ours at both sizes.

Piece: ${p.id}, "${p.title}". The critic judges: ${p.judge}
You own ${p.owns.join(' and ')}. Read gauntlet/CONTRACT.md first; it has the rules for working alongside other builders who are editing the app right now, the shared-file etiquette, the TodoMVC contract and the no-hacks rule. Then read this piece's "shots" recipe in gauntlet/pieces.json, which defines the exact state, seed data and capture region the critic sees.

${gap
    ? `The last blind verdict went against us. These are the gaps named by the critics who picked Things (they say "the loser", which was ours). Where critics agree, that is the priority:\n${gap}`
    : `No verdict yet. Find and close the biggest differences between ours and Things for this piece.`}
${hist ? `\nEarlier rounds (do not regress what they fixed):\n${hist}\n` : ''}
Work like this:
1. Run \`node tools/status.mjs ${p.id} building "<one line: what you are fixing>"\`.
2. Run \`node tools/shoot.mjs ${p.id} --compare\`, then study gauntlet/${p.id}/compare-desktop.png and compare-phone.png, plus the full-size Things crops named in the recipe's "ref". Crop and zoom with \`python3 tools/img.py crop\` when details are small. Measure pixel sizes, gaps, stroke widths, colours and alignment rather than eyeballing them.
3. Fix the named gap at its root. Then fix everything else in this piece that is visibly worse than Things at either size, because the critic needs only one clear flaw to pick Things again. Keep the app honest and general: fix the design, never special-case the seed content.
4. Repeat shoot → look → fix until you would pick ours yourself at both sizes, looking at them with a hostile eye.
5. Run \`bash tools/suite.sh ${p.id}\`. It must print SUITE GREEN. If a failure is clearly in another builder's in-flight work, wait a minute and re-run once.
6. Run \`node tools/pair.mjs ${p.id} ${round} --note "<one line: what you changed>"\`. It prints a line \`PAIR_KEY {...}\`.

Return "key" exactly as printed in PAIR_KEY, "suiteGreen" (whether suite.sh printed SUITE GREEN), "suiteLine" (the SUITE line), and "summary" (at most 2 sentences on what you changed).`
}

function criticPrompt(p, round, idx) {
  const d = `${ROOT}/gauntlet/${p.id}/r${round}`
  return `You are a harsh product-design critic. Praise is useless here. Your only job is to decide which of two UIs is better, and to say what most holds the loser back.

Each pair below shows the same UI component, in the same state, with the same content, from two different apps. They are labelled only A and B. Component: ${p.title}. What matters: ${p.judge}

Desktop pair: ${d}/desktop-A.png and ${d}/desktop-B.png
Phone pair: ${d}/phone-A.png and ${d}/phone-B.png

Both images in each pair went through the same lossy pipeline: downscaled, JPEG-compressed and scaled back up. Softness, compression ringing, dithering, anti-aliasing and resolution say nothing about the design, so ignore rendering fidelity completely. Judge only design decisions: what was drawn, at what size, weight, colour and position. ${LENSES[idx % LENSES.length]} Then weigh everything.

Open all four images with the Read tool. Crop and zoom with \`python3 ${ROOT}/tools/img.py crop SRC DST x y w h\` into /tmp if details are small. Open nothing else: no other files under gauntlet/, not bar/, not the app, not a browser. Do not try to work out which app is which. Judge only what is in front of you.

For each size, pick A or B: the one a top-tier product designer would rather ship. Judge craft: typography (size, weight, tracking, hierarchy), spacing and vertical rhythm, alignment, iconography, colour and contrast, affordances, density, and the polish of details such as strokes, radii, shadows and rendering. Also judge whether it looks native and intentional. Differences in image dimensions, cropping or label wording are not quality. No ties: if they are close, pick the one with fewer or smaller flaws.

Then, for each size, name the single biggest thing that makes the losing image worse than the winner. Make it concrete and fixable: what it is, where it is, and what the winner does instead, with approximate pixel sizes or colours. Refer to the images as "the loser" and "the winner", never by letter.

Record the verdict with:
node ${ROOT}/tools/verdict.mjs ${p.id} ${round} --critic ${idx + 1} --of ${PANEL} --desktop <A|B> --phone <A|B> --gap-desktop "<gap>" --gap-phone "<gap>" --why "<one line on the deciding factor>"
It prints only "recorded". Then return the same fields: desktop, phone, gapDesktop, gapPhone, why.`
}

const results = await pipeline(args.pieces, async p => {
  let round = p.round || 1
  let gap = p.gap || null
  let key = p.key || null          // a pair already prepared for this round: judge it before building
  const history = [...(p.history || [])]
  for (let i = 0; i < K; i++) {
    let b = { key, suiteGreen: true, suiteLine: 'pre-paired', summary: 'no change: re-judging the current build' }
    if (!key) {
      b = await agent(builderPrompt(p, round, gap, history), { label: `build ${p.id} r${round}`, phase: 'Gauntlet', schema: BUILD })
      if (!b) return { id: p.id, won: false, round, gap, history, stopped: 'builder failed' }
    }
    key = null
    const votes = (await parallel([0, 1, 2].map(idx => () =>
      agent(criticPrompt(p, round, idx), { label: `critic ${idx + 1}/3 ${p.id} r${round}`, phase: 'Gauntlet', schema: VERDICT })))).filter(Boolean)
    if (votes.length < 2) return { id: p.id, won: false, round, gap, history, stopped: 'critics failed' }
    const ours = s => votes.filter(v => v[s] === b.key[s]).length
    const won = { desktop: ours('desktop') * 2 > PANEL, phone: ours('phone') * 2 > PANEL }
    const lost = ['desktop', 'phone'].filter(s => !won[s])
    gap = lost.map(s => `${s.toUpperCase()}:\n` + votes.filter(v => v[s] !== b.key[s])
      .map((v, j) => `  critic ${j + 1}: ${s === 'desktop' ? v.gapDesktop : v.gapPhone}`).join('\n')).join('\n')
    history.push({ round, won, votes: { desktop: ours('desktop'), phone: ours('phone') }, gap, builder: b.summary, suite: b.suiteLine || String(b.suiteGreen) })
    log(`${p.id} r${round}: desktop ${ours('desktop')}/3 for ours, phone ${ours('phone')}/3 for ours${b.suiteGreen ? '' : ' (suite RED)'}`)
    if (!lost.length && b.suiteGreen) return { id: p.id, won: true, round, history }
    if (!lost.length) gap = 'The panel picked ours at both sizes, but the TodoMVC suite was not green. Make tools/suite.sh print SUITE GREEN without regressing the design.'
    round++
  }
  return { id: p.id, won: false, round, gap, history }
})
return results

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CAKE_TIERS, MAX_CAKES, cakesFor, nextTier } from '../src/systems/Cakes.ts'
import { startingLives } from '../src/systems/Difficulty.ts'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')
const code = (p: string): string => src(p)
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

const RULES = read('rules')
const ART = read('art')

/* ---------------------------------------------------------- the arithmetic */

test('a level pays nothing for a loss and one for a clear', () => {
  // The first tier is "cleared the level at all", so there is no tier a defeat
  // can reach. Banner Points paid out on a loss ON PURPOSE — depth is progress
  // and a defeat that banks nothing ends the session — and cakes deliberately
  // do not: a participation cake on every node would say nothing about any of
  // them.
  assert.equal(cakesFor(false, 20, 20), 0, 'a lost run paid out')
  assert.equal(cakesFor(false, 0, 20), 0)
  assert.equal(cakesFor(true, 0, 20), 1, 'clearing with nothing left paid nothing')
  assert.equal(cakesFor(true, 1, 20), 1)
})

test('the thresholds are a share of what the run started with, not a count', () => {
  /*
   * THE LOAD-BEARING TEST IN THIS FILE.
   *
   * Difficulty scales starting lives — 40 on Lazy Dad Mode, 20 on normal, 10
   * on Try Hard. An absolute threshold of "10 lives left" would pay THREE
   * cakes for an untouched Try Hard run and TWO for exactly the same
   * performance on normal, which is the setting quietly deciding the score.
   *
   * So the same PERFORMANCE pays the same on all three, and it is checked on
   * the real numbers each mode produces rather than on round ones.
   */
  for (const mode of ['lazy-dad', 'normal', 'try-hard']) {
    const start = startingLives(RULES.startingLives, mode)
    assert.equal(cakesFor(true, start, start), 3, `${mode}: an untouched clear did not pay 3`)
    assert.equal(cakesFor(true, Math.ceil(start / 2), start), 2, `${mode}: half the lives did not pay 2`)
    assert.equal(cakesFor(true, 1, start), 1, `${mode}: a one-life clear did not pay 1`)
  }
  // And the modes agree with each other on the same fraction, which is the
  // property that sentence is really making.
  const lazy = startingLives(RULES.startingLives, 'lazy-dad')
  const hard = startingLives(RULES.startingLives, 'try-hard')
  assert.equal(cakesFor(true, lazy * 0.75, lazy), cakesFor(true, hard * 0.75, hard))
  assert.equal(cakesFor(true, lazy * 0.25, lazy), cakesFor(true, hard * 0.25, hard))
})

test('the boundary is inclusive, and three means untouched', () => {
  // Exactly half pays two, a hair under pays one. A player who finished on
  // exactly ten of twenty should get the tier the panel told them about.
  assert.equal(cakesFor(true, 10, 20), 2)
  assert.equal(cakesFor(true, 9, 20), 1)
  // Three is the whole keep and nothing less. 19 of 20 is a leak.
  assert.equal(cakesFor(true, 20, 20), 3)
  assert.equal(cakesFor(true, 19, 20), 2)
})

test('nothing pays more than the maximum, and nothing divides by zero', () => {
  assert.equal(cakesFor(true, 999, 20), MAX_CAKES)
  assert.equal(MAX_CAKES, 3)
  // A run that somehow started with no lives cannot have a meaningful
  // fraction, so it falls to the bottom tier rather than dividing by zero and
  // passing every threshold on an Infinity. It still CLEARED the level, so the
  // bottom tier is one cake and not none. Unreachable through the game —
  // Difficulty floors starting lives at 1 — but `cakesFor` is also handed
  // numbers off a save.
  assert.equal(cakesFor(true, 5, 0), 1)
  assert.equal(cakesFor(true, -3, 20), 1)
})

test('the tiers are declared whole and ordered easiest first', () => {
  // `cakesFor` reads them top down and keeps the LAST one met, so an
  // out-of-order list would award the wrong count with nothing failing.
  const raw = read('cakes')
  assert.equal(raw.max, MAX_CAKES)
  assert.equal(CAKE_TIERS.length, MAX_CAKES, 'there is not one tier per cake')
  for (let i = 0; i < CAKE_TIERS.length; i++) {
    const t = CAKE_TIERS[i]!
    assert.equal(t.cakes, i + 1, 'the tiers do not count up from one')
    assert.ok(t.why && t.why.length > 0, `tier ${t.cakes} does not say what it is for`)
    if (i > 0) {
      assert.ok(t.livesFraction > CAKE_TIERS[i - 1]!.livesFraction,
        `tier ${t.cakes} does not ask for more than the one below it`)
    }
  }
  assert.equal(CAKE_TIERS[0]!.livesFraction, 0, 'the first tier is not "cleared it at all"')
  assert.equal(CAKE_TIERS[CAKE_TIERS.length - 1]!.livesFraction, 1,
    'the top tier is not a flawless clear')
  assert.equal(nextTier(1)?.cakes, 2)
  assert.equal(nextTier(MAX_CAKES), null, 'there is a tier above the maximum')
})

/* ---------------------------------------------------------------- the save */

test('the best count per level is kept with the difficulty it was set on', () => {
  const save = code('systems/Save.ts')
  assert.match(save, /cakes: Record<string, CakeRecord>/, 'the save cannot remember a cake')
  assert.match(save, /difficultyId: string/, 'a record does not say what it was earned on')
  assert.match(save, /export function recordCakes/, 'nothing can bank a cake')
  // BETTER OVERWRITES, WORSE DOES NOT, and equal does not either — re-writing
  // an equal count would rewrite the difficulty id and quietly demote a Try
  // Hard three to whatever was last played on.
  assert.match(save, /if \(levelId === '' \|\| earned <= had\) return had/,
    'a worse or equal result can overwrite the record')
  // CAKES EARNED ON ANY DIFFICULTY COUNT. The comparison is on the count and
  // never on the mode: ranking modes here would mean a Lazy Dad three silently
  // refusing to record, which is the save disagreeing with the screen that
  // just congratulated the player.
  const rec = /export function recordCakes[\s\S]*?\n\}/.exec(save)![0]
  assert.ok(!/lazy-dad|try-hard|normal|DIFFICULT/.test(rec),
    'recordCakes ranks the difficulties, so a cake earned on one mode may not count')
})

test('a save from before cakes existed arrives empty rather than guessing', () => {
  // There is no migration and there cannot be: an older save knows which
  // levels were beaten and nothing whatever about how many lives were left, so
  // any reconstruction would put a number on a node the player never earned.
  const save = code('systems/Save.ts')
  const from = /function cakesFrom[\s\S]*?\n\}/.exec(save)![0]
  assert.ok(!/MIGRATION_ORDER|runsCleared|clearedLevels/.test(from),
    'the cake records are derived from something that cannot know them')
  assert.match(from, /if \(n <= 0\) continue/, 'a zero or junk count is kept as a record')
})

/* --------------------------------------------------------------- the asset */

test('there is ONE cake asset and the unearned state is built at runtime', () => {
  /*
   * The mistake this exists to prevent has already been made once, with the
   * placeholder ability icons: the word LOCKED was painted into the picture,
   * so a button that HAD become available still read as locked and no draw
   * call could contradict it. Baked-in state is a lie the code cannot correct.
   */
  assert.equal(ART.ui.cake, 'ui-cake')
  assert.equal(ART.files['ui-cake'], 'ui/ui_cake.webp')
  const cakeFiles = Object.keys(ART.files).filter((k) => /cake/i.test(k))
  assert.deepEqual(cakeFiles, ['ui-cake'],
    'there is more than one cake asset; the unearned state belongs in code')
  // SOURCE INK, NOT THE CANVAS. `fitInBox` divides by these, so a canvas
  // figure draws every cake small and fits a 0.943:1 shape as a square.
  const r = ART.render['ui-cake']
  assert.equal(r.contentWidth, 926, 'run `python3 tools/measure_art.py` and copy the ink extents')
  assert.equal(r.contentHeight, 982)
  assert.ok(r.contentWidth !== 1024 && r.contentHeight !== 1024, 'the canvas size was copied in')
})

test('an unearned cake is made paler, never darker', () => {
  /*
   * THE ONE THING THAT MUST NOT BE "TIDIED" INTO THE EXISTING RECIPE.
   *
   * `SWITCHED_OFF` pulls a picture towards a dark grey, which is right for an
   * icon on a lit HUD plate. The cake's frosting is already dark chocolate and
   * it is drawn straight onto a near-black panel, so the same treatment makes
   * an unearned cake invisible rather than faint — and a player who cannot see
   * the empty slots cannot count them.
   */
  const d = src('systems/Desaturate.ts')
  const un = /export const UNEARNED: GreyRecipe = \{([^}]*)\}/.exec(d)
  assert.ok(un, 'the unearned recipe is gone')
  const mid = Number(/mid: ([\d.]+)/.exec(un[1]!)![1])
  const contrast = Number(/contrast: ([\d.]+)/.exec(un[1]!)![1])
  const alpha = Number(/alpha: ([\d.]+)/.exec(un[1]!)![1])

  // LIGHTER THAN MID GREY, and lighter than the recipe it is not.
  assert.ok(mid > 128, `an unearned cake is pulled to ${mid}, which is darker than mid grey`)
  const off = /export const SWITCHED_OFF: GreyRecipe = \{([^}]*)\}/.exec(d)![1]!
  assert.ok(mid > Number(/mid: ([\d.]+)/.exec(off)![1]),
    'the unearned recipe is darker than the switched-off one')
  // FLATTENED, so the dark frosting and the light icing land on one tone.
  assert.ok(contrast > 0 && contrast <= 0.5,
    `contrast ${contrast} keeps too much of a picture that is mostly dark`)
  // And faded, which is what separates it from an earned one at a glance.
  assert.ok(alpha > 0 && alpha < 1, `alpha ${alpha} does not fade it`)

  // Every value the recipe can produce is lighter than the source pixel it
  // came from, for every dark pixel — which is the claim "never darker".
  for (let l = 0; l <= 128; l++) {
    const v = mid + (l - 128) * contrast
    assert.ok(v > l, `a source luma of ${l} comes out at ${v.toFixed(1)}, which is darker`)
  }

  // A SEPARATE TEXTURE KEY. One key for two recipes would hand back whichever
  // was built first, so a cake could arrive greyed the HUD's way.
  assert.match(d, /suffix: '-unearned'/, 'the two recipes share a texture key')
})

/* -------------------------------------------------------------- the screens */

test('cakes are drawn in one place and shown in both', () => {
  // A second copy of "three slots, earned in colour, the rest pale" is a
  // second copy that drifts, and the player only ever sees one screen at a
  // time so they could never report the disagreement.
  const row = src('ui/CakeRow.ts')
  assert.match(row, /export function cakeRow/, 'the shared row is gone')
  assert.match(row, /ensureGrey\(scene, key, UNEARNED\)/,
    'the row does not build the unearned state from the same texture')
  assert.match(row, /fitInBox\(img, key, opts\.size\)/,
    'the cakes are sized by their canvas rather than by their ink')

  for (const f of ['ui/Dialog.ts', 'scenes/WorldMapScene.ts']) {
    assert.match(code(f), /cakeRow\(/, `${f} does not draw cakes`)
  }
  // The map does NOT animate: the scene is rebuilt on restart and a pop each
  // time would read as the count changing rather than as a record.
  const map = /private drawCakes\([\s\S]*?\n  \}/.exec(code('scenes/WorldMapScene.ts'))![0]
  assert.ok(!/animate/.test(map), 'a map node pops its cakes every time it is redrawn')
})

test('every built level shows its slots, earned or not, and they gate nothing', () => {
  const map = code('scenes/WorldMapScene.ts')
  // ON EVERY BUILT NODE, not only on the ones that have paid out. Three pale
  // cakes on an untouched level are what makes going back for them an idea a
  // player can have at all.
  assert.match(map, /if \(node\.level\) this\.drawCakes\(node\)/,
    'cakes are drawn on some nodes and not others')
  const draw = /private drawCakes\([\s\S]*?\n  \}/.exec(map)![0]
  assert.ok(!/state|locked|cleared|open/.test(draw),
    'the cake row is conditioned on the node state, so unplayed levels hide their slots')

  // AND THEY GATE NOTHING. What opens a level is `unlockedBy`.
  const levels = code('systems/Levels.ts')
  assert.ok(!/cake/i.test(levels), 'the unlock model has learned about cakes')
  const unlock = /export function isLevelUnlocked[\s\S]*?\n\}/.exec(levels)![0]
  assert.match(unlock, /def\.unlockedBy/, 'a level is not opened by its prerequisite')
})

test('the harness measures the unearned recipe off the texture, not off a picture', () => {
  // "Never darker" is a claim about PIXELS and a screenshot cannot settle it:
  // a cake that has vanished into a dark panel and a cake that was never drawn
  // look identical. The scenario samples both textures and compares their mean
  // luma, which is the only form of this check that can fail for the right
  // reason. Cited here for the same reason `screenspace.test.ts` cites the
  // scrim scenario: a source assertion is worth making only while the thing
  // that measures it is still there to run.
  const harness = readFileSync(url('../tools/harness/index.html'), 'utf8')
  assert.match(harness, /scenario === 'cakes'/, 'the cakes scenario is gone')
  assert.match(harness, /the unearned cake is DARKER than the earned one/,
    'the scenario no longer fails when the unearned cake comes out darker')
  assert.match(harness, /DES\.ensureGrey\(G, 'ui-cake', DES\.UNEARNED\)/,
    'the scenario no longer builds the unearned texture it claims to measure')
})

test('the cake sizes are tuned in JSON, and the map is not drawn at 24', () => {
  const P = read('presentation').cakes
  assert.ok(P.nodeSize >= 32,
    `a map node cake at ${P.nodeSize} design units is too small to count at a glance`)
  assert.ok(P.panelSize > P.nodeSize, 'the victory panel does not show them larger than the map')
  assert.ok(P.gapFraction > 0 && P.gapFraction < 1)
  // Three of them plus their gaps have to fit ACROSS THE NODE'S PICTURE, or
  // the row hangs off both sides of the level it belongs to.
  const width = 3 * P.nodeSize + 2 * P.nodeSize * P.gapFraction
  assert.ok(width <= read('presentation').worldMap.node.width,
    `three cakes come to ${width.toFixed(0)} units across a ${read('presentation').worldMap.node.width}-unit node`)
  // NOTHING HARDCODES THEM, checked on the cake code alone rather than on
  // whole files — Dialog.ts's choice cards legitimately carry a 96, and a
  // sweep over the file would fail on it and teach the next reader to delete
  // this check rather than to narrow it.
  const blocks = [
    src('ui/CakeRow.ts'),
    /if \(opts\.cakes\) \{[\s\S]*?\n    \}/.exec(src('ui/Dialog.ts'))![0],
    /private drawCakes\([\s\S]*?\n  \}/.exec(src('scenes/WorldMapScene.ts'))![0],
  ]
  for (const b of blocks) {
    const body = b.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    for (const n of [P.panelSize, P.nodeSize, P.nodeDrop, P.gapFraction]) {
      assert.ok(!new RegExp(`(?<![\\w.])${String(n).replace('.', '\\.')}(?![\\w.])`).test(body),
        `a cake size is written into the code as ${n} instead of read from presentation.json`)
    }
  }
})

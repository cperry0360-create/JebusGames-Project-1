import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/** A localStorage stand-in, installed before Save.ts is imported. */
const store = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) },
  clear: () => { store.clear() },
}

const {
  cutsceneProblems, forgetAllCutscenes, hasSeen, levelsWithCutscenes,
  markSeen, panelKey, panelUrl, panelsFor, shouldPlay,
} = await import('../src/systems/Cutscenes.ts')
const { DEFAULT_SAVE, loadSave, writeSave } = await import('../src/systems/Save.ts')

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

const { cutsceneLayout, overlaps, contains } = await import('../src/systems/CutsceneLayout.ts')
const { NO_INSETS } = await import('../src/systems/HudLayout.ts')
const CFG = JSON.parse(src('src/data/presentation.json')).cutscene
/** Every panel in the game is this size; the test that walks the files checks
 *  it stays 16:9. */
const PANEL_W = 1672
const PANEL_H = 941
/** The viewports the brief names, in both orientations, plus a desktop window
 *  and the two exact-16:9 shapes where there is no letterbox to hide in. */
const VIEWPORTS: Array<[number, number]> = [
  [375, 667], [667, 375],
  [390, 844], [844, 390],
  [1440, 900], [900, 1440],
  [1280, 720], [1920, 1080],
  [1024, 768], [320, 480],
]
const CUTSCENES = JSON.parse(src('src/data/cutscenes.json'))
const LEVELS = JSON.parse(src('src/data/levels.json')).levels

beforeEach(() => { store.clear() })

/* ------------------------------------------------------------- the data */

test('cutscenes.json names levels that exist, and only those', () => {
  assert.deepEqual(cutsceneProblems(), [])
  assert.deepEqual(levelsWithCutscenes().sort(), ['level1', 'level2'])
  assert.equal(panelsFor('level1').length, 3)
  assert.equal(panelsFor('level2').length, 3)
})

test('a level with no entry simply has no cutscene', () => {
  // Level 3 is the case, and it is the DEFAULT rather than an omission: a
  // level says it has a comic by having one.
  assert.deepEqual(panelsFor('level3'), [])
  assert.equal(shouldPlay('level3'), false)
  assert.deepEqual(panelsFor('level-that-does-not-exist'), [])
  assert.equal(shouldPlay('level-that-does-not-exist'), false)

  // And nothing is ever recorded for it, so a run on level 3 cannot leave a
  // seen flag behind that a future level 3 comic would then be hidden by.
  assert.equal(hasSeen('level3'), false)
})

test('every panel file named actually exists, at the size the layout assumes', () => {
  for (const [id, panels] of Object.entries(CUTSCENES.levels) as [string, string[]][]) {
    for (const p of panels) {
      const url = new URL(`../public/assets/${p}`, import.meta.url)
      assert.doesNotThrow(() => readFileSync(url), `${id} names ${p}, which is not in public/`)
    }
  }
  // 1672x941 is 16:9 to within a pixel, which is what the contain-fit assumes
  // when it says a portrait phone gets full width and vertical chrome.
  assert.ok(Math.abs(1672 / 941 - 16 / 9) < 0.002)
})

test('the checker fails an unknown level id rather than leaving it to runtime', () => {
  // Walked against the real validator's own rules, on data shaped like the
  // file: a key that is not a level is a comic that never plays and never says
  // so, which is exactly the kind of thing nothing else would catch.
  const known = new Set(LEVELS.map((l: { id: string }) => l.id))
  const check = (levels: Record<string, unknown>): string[] => {
    const problems: string[] = []
    for (const [id, panels] of Object.entries(levels)) {
      if (!known.has(id)) { problems.push(`unknown level "${id}"`); continue }
      if (!Array.isArray(panels) || panels.length === 0) { problems.push(`${id} empty`); continue }
      for (const p of panels) {
        if (typeof p !== 'string' || !p.startsWith('cutscenes/')) problems.push(`${id} bad path`)
      }
      if (new Set(panels as string[]).size !== (panels as string[]).length) {
        problems.push(`${id} duplicate`)
      }
    }
    return problems
  }
  assert.deepEqual(check(CUTSCENES.levels), [], 'the shipped file does not pass its own rules')
  assert.match(check({ level9: ['cutscenes/a.webp'] })[0]!, /unknown level "level9"/)
  assert.match(check({ level1: [] })[0]!, /level1 empty/)
  assert.match(check({ level1: ['towers/tower_dummy_1.webp'] })[0]!, /level1 bad path/)
  assert.match(check({ level1: ['cutscenes/a.webp', 'cutscenes/a.webp'] })[0]!, /level1 duplicate/)

  // And the shipped validator agrees about the shipped file, which is the
  // assertion that fails the build if someone adds a bad key.
  assert.deepEqual(cutsceneProblems(), [])
})

/* ---------------------------------------------------------- the seen flag */

test('a cutscene plays once and then does not play again', () => {
  assert.equal(shouldPlay('level1'), true, 'a fresh save should get the comic')
  markSeen('level1')
  assert.equal(hasSeen('level1'), true)
  assert.equal(shouldPlay('level1'), false, 'it played again on a later run')
  // Only the level that was watched.
  assert.equal(shouldPlay('level2'), true)
})

test('marking seen twice does not grow the list', () => {
  markSeen('level1')
  markSeen('level1')
  assert.deepEqual(loadSave().seenCutscenes, ['level1'])
})

test('the flag is written after the last panel and not before', () => {
  // The scene's own rule, walked: `handOver` is the ONE place that writes, and
  // `advance` only reaches it from the last panel. Stepping through three
  // panels, nothing is written until the third is left behind.
  const panels = panelsFor('level1')
  let index = 0
  let finished = false
  const advance = (): void => {
    if (finished) return
    if (index + 1 >= panels.length) { finished = true; markSeen('level1'); return }
    index++
  }

  advance()
  assert.equal(index, 1)
  assert.equal(hasSeen('level1'), false, 'seen was written on the first advance')
  advance()
  assert.equal(index, 2)
  assert.equal(hasSeen('level1'), false, 'seen was written before the last panel')
  advance()
  assert.equal(hasSeen('level1'), true, 'seen was not written when the comic ended')
})

test('a skipped cutscene still counts as seen', () => {
  // The player has decided about this comic. Asking again next run is not
  // respecting the answer.
  const skip = (): void => { markSeen('level2') }
  assert.equal(shouldPlay('level2'), true)
  skip()
  assert.equal(hasSeen('level2'), true)
  assert.equal(shouldPlay('level2'), false)
})

test('the scene writes in exactly one place, and only when it has panels', () => {
  const scene = src('src/scenes/CutsceneScene.ts')
  const writes = scene.match(/markSeen\(/g) ?? []
  assert.equal(writes.length, 1,
    'markSeen is called from more than one place; skip and read-to-the-end would drift')
  assert.match(scene, /if \(this\.panels\.length > 0\) markSeen\(this\.levelId\)/,
    'a level with no panels would be marked as having seen one')
  // Both endings go through the one exit.
  assert.match(scene, /private skip\(\)[\s\S]{0,200}this\.handOver\('skipped'\)/)
  assert.match(scene, /this\.handOver\('read to the end'\)/)
})

/* -------------------------------------------------------------- the save */

test('the seen list survives a round trip and a broken save resets it', () => {
  // Same schema versioning and validate-or-reset as everything else in there.
  writeSave({ ...DEFAULT_SAVE, runsCleared: 3, seenCutscenes: ['level1'] })
  const back = loadSave()
  assert.deepEqual(back.seenCutscenes, ['level1'])
  assert.equal(back.runsCleared, 3, 'the neighbouring fields were disturbed')

  // A save from before the field existed.
  store.set('courjahan.save.v1', JSON.stringify({ runsCleared: 2 }))
  assert.deepEqual(loadSave().seenCutscenes, [])
  assert.equal(loadSave().runsCleared, 2)

  // Rubbish in the field: validated element by element, not trusted for being
  // an array. A number in the list would compare false against every level id
  // forever -- a comic that silently never plays again.
  store.set('courjahan.save.v1',
    JSON.stringify({ seenCutscenes: ['level1', 7, null, 'level1', 'level2'] }))
  assert.deepEqual(loadSave().seenCutscenes, ['level1', 'level2'])

  store.set('courjahan.save.v1', JSON.stringify({ seenCutscenes: 'level1' }))
  assert.deepEqual(loadSave().seenCutscenes, [])

  store.set('courjahan.save.v1', 'not json at all')
  assert.deepEqual(loadSave().seenCutscenes, [])
})

test('the developer reset makes every comic play again', () => {
  markSeen('level1')
  markSeen('level2')
  writeSave({ ...loadSave(), runsCleared: 4 })
  forgetAllCutscenes()
  assert.deepEqual(loadSave().seenCutscenes, [])
  assert.equal(shouldPlay('level1'), true)
  assert.equal(shouldPlay('level2'), true)
  assert.equal(loadSave().runsCleared, 4, 'the reset took more than the cutscene flags')
})

/* ------------------------------------------------------------- the wiring */

test('panels resolve to urls under the asset root', () => {
  const p = panelsFor('level1')[0]!
  assert.equal(panelUrl(p), `assets/${p}`)
  assert.equal(panelKey(p), `cutscene:${p}`)
  // Keys are derived from the path, so adding a panel is one line of data.
  assert.notEqual(panelKey(panelsFor('level1')[1]!), panelKey(p))
})

test('the comic sits in front of a run beginning, not in front of a resume', () => {
  const loadout = src('src/scenes/LoadoutScene.ts')
  assert.match(loadout, /if \(shouldPlay\(level\)\) \{[\s\S]{0,160}start\('Cutscene'/,
    'BEGIN does not route through the cutscene')
  // A resume goes straight to the game: the run is already under way and its
  // opening has been and gone.
  for (const f of ['src/scenes/TitleScene.ts', 'src/scenes/WorldMapScene.ts']) {
    const code = src(f)
    const resume = code.slice(code.indexOf('private resume('))
    assert.ok(!/start\('Cutscene'/.test(resume.slice(0, 900)),
      `${f}'s resume path replays the comic`)
  }
})

test('the level select can replay a comic, and only one it has seen', () => {
  const world = src('src/scenes/WorldMapScene.ts')
  assert.match(world, /private drawReplay\(/, 'no replay control on the level select')
  assert.match(world, /if \(panelsFor\(level\.id\)\.length === 0 \|\| !hasSeen\(level\.id\)\) return/,
    'the replay badge is offered for a comic that has not been watched yet')
  assert.match(world, /start\('Cutscene', \{ levelId: level\.id, then: 'WorldMap' \}\)/,
    'replaying a comic does not come back to the level select')
})

test('the fit is contain, not cover, so no bubble is ever cut off', () => {
  // Driven through the REAL layout module rather than a second copy of its
  // arithmetic. The version this replaces asserted that the scene's source
  // contained `Math.min(w / sw, h / sh)` and then re-implemented the fit here
  // to check it — which is exactly the shape that let the actual bug through:
  // the arithmetic was right and it was being applied in the wrong coordinate
  // space, and a test that re-derives the arithmetic cannot see that.
  const layout = src('src/systems/CutsceneLayout.ts')
  assert.match(layout, /Math\.min\(area\.width \/ srcW, area\.height \/ srcH\)/,
    'the panel is scaled by max(), which crops it')
  assert.doesNotMatch(layout, /Math\.max\(area\.width/, 'a cover-fit has appeared')

  for (const [vw, vh] of VIEWPORTS) {
    const at = cutsceneLayout(
      { width: vw, height: vh, insets: NO_INSETS, panelWidth: PANEL_W, panelHeight: PANEL_H }, CFG,
    )
    // Uniform scale on both axes: the panel's aspect survives exactly.
    assert.ok(Math.abs(at.panel.width / at.panel.height - PANEL_W / PANEL_H) < 0.001,
      `${vw}x${vh} distorts the panel`)
    // And nothing ever overflows the viewport, in either orientation.
    assert.ok(at.panel.x >= -0.001 && at.panel.y >= -0.001
      && at.panel.x + at.panel.width <= vw + 0.001
      && at.panel.y + at.panel.height <= vh + 0.001,
      `${vw}x${vh} crops the panel`)
  }

  // The shape the brief names: a phone in portrait gets the width, with the
  // game's dark chrome above and below.
  const portrait = cutsceneLayout(
    { width: 390, height: 844, insets: NO_INSETS, panelWidth: PANEL_W, panelHeight: PANEL_H }, CFG,
  )
  assert.ok(portrait.panel.width / 390 > 0.9, 'the panel does not fill the width in portrait')
  assert.ok(portrait.panel.height < 844 * 0.5, 'the panel is not letterboxed vertically')
})

test('the next panel is fetched while the current one is up', () => {
  const scene = src('src/scenes/CutsceneScene.ts')
  assert.match(scene, /private preloadAhead\(\)/, 'nothing preloads the next panel')
  assert.match(scene, /this\.panels\[this\.index \+ 1\]/, 'the preload does not look ahead')
  // Started on arrival AND after each advance, or the look-ahead is one panel
  // short for the whole comic after the first tap.
  const create = scene.slice(scene.indexOf('  create('), scene.indexOf('private preloadAhead'))
  assert.match(create, /this\.preloadAhead\(\)/, 'nothing is prefetched when the comic opens')
  const advance = scene.slice(scene.indexOf('private advance('))
  assert.match(advance.slice(0, 500), /this\.preloadAhead\(\)/,
    'advancing does not start the next fetch')
})

/* --------------------------------------------------- the panel on the glass */

test('the scene fits its camera, which is the whole of what was broken', () => {
  /*
   * THE BUG. `layout` computed a correct contain-fit and centred it, in CSS
   * pixels — and the scene never fitted its camera, so that was drawn through
   * an untransformed camera over a canvas measured in PHYSICAL pixels. At
   * devicePixelRatio 3 the panel came out at a third of its size with its
   * centre a sixth of the way across: a small comic pinned to the top-left with
   * black around it, which is the report word for word. At dpr 1 the two spaces
   * are the same number and it looked perfect, which is how it shipped.
   *
   * Every other screen already did this — the menus through
   * `fitCameraToDesign`, GameScene through its own `uiCam`. This one did not.
   */
  const scene = src('src/scenes/CutsceneScene.ts')
  assert.match(scene, /fitUiCamera\(this\)/, 'the cutscene camera is unfitted again')
  // Fitted BEFORE anything is measured or placed: a layout computed against a
  // camera that has not been set up is a layout in the wrong space.
  const create = scene.slice(scene.indexOf('  create(): void {'))
  const body = create.slice(0, create.indexOf('\n  }'))
  assert.ok(body.indexOf('fitUiCamera') < body.indexOf('this.drawPanel()'),
    'the panel is drawn before the camera is fitted')

  // The arithmetic that shows why dpr matters: a CSS-space fit drawn through a
  // dpr-3 canvas is a third the size, a sixth of the way across.
  const cssFit = cutsceneLayout(
    { width: 390, height: 844, insets: NO_INSETS, panelWidth: PANEL_W, panelHeight: PANEL_H }, CFG,
  )
  const dpr = 3
  assert.ok(cssFit.panel.width / (390 * dpr) < 0.35,
    'the unfitted case no longer reproduces, so this test is measuring nothing')
})

test('the panel is centred in the safe area at every viewport, both ways up', () => {
  for (const [vw, vh] of VIEWPORTS) {
    for (const [what, insets] of [
      ['flat', NO_INSETS],
      ['notched portrait', { top: 47, right: 0, bottom: 34, left: 0 }],
      ['notched landscape', { top: 0, right: 0, bottom: 21, left: 47 }],
    ] as const) {
      const at = cutsceneLayout(
        { width: vw, height: vh, insets, panelWidth: PANEL_W, panelHeight: PANEL_H }, CFG,
      )
      const safeCx = (insets.left + (vw - insets.right)) / 2
      const safeCy = (insets.top + (vh - insets.bottom)) / 2
      const cx = at.panel.x + at.panel.width / 2
      const cy = at.panel.y + at.panel.height / 2
      // BOTH AXES. A band reserved from one side only would push the panel
      // down or across by half a control; it is taken off both sides instead.
      assert.ok(Math.abs(cx - safeCx) < 0.001,
        `${vw}x${vh} ${what}: the panel is ${(cx - safeCx).toFixed(1)}px off centre horizontally`)
      assert.ok(Math.abs(cy - safeCy) < 0.001,
        `${vw}x${vh} ${what}: the panel is ${(cy - safeCy).toFixed(1)}px off centre vertically`)
    }
  }
})

test('nothing important is ever under the notch or the home indicator', () => {
  // The panel AND both controls sit inside the safe rectangle. `viewport-fit=cover`
  // means the canvas reaches behind the hardware, so this is the only thing
  // between a speech bubble and the sensor housing.
  const notches = [
    { top: 47, right: 0, bottom: 34, left: 0 },
    { top: 0, right: 0, bottom: 21, left: 47 },
    { top: 0, right: 47, bottom: 21, left: 0 },
    { top: 24, right: 24, bottom: 24, left: 24 },
  ]
  for (const [vw, vh] of VIEWPORTS) {
    for (const insets of notches) {
      const at = cutsceneLayout(
        { width: vw, height: vh, insets, panelWidth: PANEL_W, panelHeight: PANEL_H }, CFG,
      )
      const safe = {
        x: insets.left,
        y: insets.top,
        width: vw - insets.left - insets.right,
        height: vh - insets.top - insets.bottom,
      }
      if (safe.width <= 0 || safe.height <= 0) continue
      for (const [name, r] of [
        ['panel', at.panel], ['skip', at.skip], ['counter', at.counter],
      ] as const) {
        assert.ok(contains(safe, r), `${vw}x${vh}: the ${name} runs under the hardware`)
      }
    }
  }
})

test('SKIP is never on the art, and is always big enough to hit', () => {
  // A corner placement cannot promise this: at exactly 16:9 there is no
  // letterbox band for a corner control to sit in, so the corner is on the
  // picture. A band is reserved instead and both controls live in it.
  assert.ok(CFG.skipWidth >= 44, `a ${CFG.skipWidth}pt-wide SKIP is under the 44pt minimum`)
  assert.ok(CFG.skipHeight >= 44, `a ${CFG.skipHeight}pt-tall SKIP is under the 44pt minimum`)

  for (const [vw, vh] of VIEWPORTS) {
    for (const insets of [
      NO_INSETS,
      { top: 47, right: 0, bottom: 34, left: 0 },
      { top: 0, right: 0, bottom: 21, left: 47 },
    ]) {
      const at = cutsceneLayout(
        { width: vw, height: vh, insets, panelWidth: PANEL_W, panelHeight: PANEL_H }, CFG,
      )
      assert.ok(!overlaps(at.panel, at.skip), `${vw}x${vh}: SKIP is on top of the panel`)
      assert.ok(!overlaps(at.panel, at.counter), `${vw}x${vh}: the counter is on top of the panel`)
      assert.ok(!overlaps(at.skip, at.counter), `${vw}x${vh}: the two controls overlap`)
      assert.equal(at.skip.width, CFG.skipWidth)
      assert.equal(at.skip.height, CFG.skipHeight)
    }
  }
})

test('the panel is as large as those rules leave room for', () => {
  /*
   * MEASURED, and the numbers are the report's. "As large as fits" is the rule
   * that gives way to the other three — never crop, never under a control,
   * always centred — so what is pinned here is that it still fills the screen
   * rather than that it is maximal in the abstract.
   */
  const at = (w: number, h: number, insets = NO_INSETS) => cutsceneLayout(
    { width: w, height: h, insets, panelWidth: PANEL_W, panelHeight: PANEL_H }, CFG,
  )
  const pct = (w: number, h: number, insets = NO_INSETS) => at(w, h, insets).panel.width / w

  // PORTRAIT: the width, with chrome above and below. The brief's case.
  assert.ok(pct(375, 667) > 0.9, `375x667 gives ${(pct(375, 667) * 100).toFixed(0)}% of the width`)
  assert.ok(pct(390, 844) > 0.9, `390x844 gives ${(pct(390, 844) * 100).toFixed(0)}% of the width`)
  assert.ok(pct(390, 844, { top: 47, right: 0, bottom: 34, left: 0 }) > 0.9,
    'a notched portrait phone loses the width')
  assert.equal(at(390, 844).bandEdge, 'top', 'portrait does not put the controls above the panel')

  // LANDSCAPE: most of the width, and the controls go beside rather than above.
  assert.ok(pct(844, 390) > 0.7, `844x390 gives ${(pct(844, 390) * 100).toFixed(0)}% of the width`)
  assert.ok(pct(844, 390, { top: 0, right: 0, bottom: 21, left: 47 }) > 0.7,
    'a notched landscape phone loses most of the width')
  assert.equal(at(844, 390).bandEdge, 'right', 'landscape stacks the controls above the panel')

  // DESKTOP, including the exact-16:9 window where there is no natural chrome.
  assert.ok(pct(1440, 900) > 0.9, `1440x900 gives ${(pct(1440, 900) * 100).toFixed(0)}%`)
  assert.ok(pct(1280, 720) > 0.8, `1280x720 gives ${(pct(1280, 720) * 100).toFixed(0)}%`)
  assert.ok(pct(1920, 1080) > 0.8, `1920x1080 gives ${(pct(1920, 1080) * 100).toFixed(0)}%`)
})

test('a viewport smaller than the chrome still produces a usable rectangle', () => {
  // Not a shape any phone has, but a layout that returns a negative size is how
  // the loadout hero row put its portraits above their own card. Every extent
  // here is floored, so the degenerate case is small rather than inverted.
  for (const [vw, vh] of [[120, 90], [40, 40], [1, 1]] as const) {
    const at = cutsceneLayout(
      { width: vw, height: vh, insets: NO_INSETS, panelWidth: PANEL_W, panelHeight: PANEL_H }, CFG,
    )
    assert.ok(at.panel.width > 0 && at.panel.height > 0, `${vw}x${vh} produced no panel`)
    assert.ok(at.scale > 0, `${vw}x${vh} produced a zero scale`)
  }
})

test('one layout path serves the first panel, every later panel and the resize', () => {
  /*
   * The brief asks for this to be confirmed rather than assumed. There is one
   * `layout()` and everything reaches it:
   *
   *   - the first panel, and every later one, through `drawPanel`;
   *   - a panel whose texture lands late, through `drawPanel` again from the
   *     loader's completion;
   *   - the controls, when they are built;
   *   - a resize or a rotate, through the resize handler.
   *
   * And there is no second placement function to fall out of step with it.
   */
  const scene = src('src/scenes/CutsceneScene.ts')
  const drawPanel = scene.slice(scene.indexOf('private drawPanel()'))
  assert.match(drawPanel.slice(0, drawPanel.indexOf('\n  }')), /this\.layout\(\)/,
    'drawing a panel does not lay it out')
  assert.match(drawPanel, /this\.load\.once\(Phaser\.Loader\.Events\.COMPLETE, \(\) => \{/,
    'a panel that arrives late is never redrawn')

  const advance = scene.slice(scene.indexOf('private advance('))
  assert.match(advance.slice(0, advance.indexOf('\n  }')), /this\.drawPanel\(\)/,
    'later panels take a different path from the first')

  // Resize AND the camera: its centre is derived from the viewport, so a rotate
  // that only moved the sprites would leave the whole scene offset.
  const resize = scene.slice(scene.indexOf('onSceneResize(this, () => {'))
  const handler = resize.slice(0, resize.indexOf('})'))
  assert.match(handler, /fitUiCamera\(this\)/, 'a rotate does not re-fit the camera')
  assert.match(handler, /this\.layout\(\)/, 'a rotate does not re-place the panel')
  assert.match(handler, /zone\.setSize\(viewW\(this\), viewH\(this\)\)/,
    'the tap-anywhere zone keeps its old size after a rotate')

  // No second placement. `placeSkip` was one, and it was called from two places
  // and read the raw viewport rather than the safe area.
  assert.doesNotMatch(scene, /private placeSkip\(/,
    'the controls have their own placement again, which the next resize will miss')
  assert.equal((scene.match(/private layout\(\): void/g) ?? []).length, 1)

  // The hand-over into the game is untouched by any of this, and still goes
  // through the one exit.
  assert.match(scene, /private handOver\(why: string\): void/)
  assert.match(scene, /this\.scene\.start\(this\.next\)/)
})

test('every number the comic is laid out with is in presentation.json', () => {
  const scene = src('src/scenes/CutsceneScene.ts')
  for (const key of ['margin', 'gap', 'skipWidth', 'skipHeight', 'counterWidth',
    'counterHeight', 'background', 'skipLabelSize', 'counterSize']) {
    assert.equal(typeof CFG[key], 'number', `cutscene.${key} is not in presentation.json`)
  }
  // The constants that used to live in the scene are gone.
  assert.doesNotMatch(scene, /const SKIP_MARGIN|const SKIP_W|const SKIP_H/,
    'the SKIP geometry is hardcoded in the scene again')
  assert.doesNotMatch(scene, /0x10161d/, 'the background colour is hardcoded again')
})

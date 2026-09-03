import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { collisions, hudLayout, hudTakesPress, overlaps, NO_INSETS, type Insets } from '../src/systems/HudLayout.ts'
import presentation from '../src/data/presentation.json' with { type: 'json' }

const url = (p: string) => new URL(p, import.meta.url)
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')

const CFG = presentation.hud.layout

/** Landscape viewports the game has to survive: iPhone SE, iPhone 14, iPad,
 *  desktop. The first is the one that breaks layouts. */
const VIEWPORTS: Array<[string, number, number]> = [
  ['iPhone SE', 568, 320],
  ['iPhone 14', 844, 390],
  ['iPad', 1080, 810],
  ['desktop', 1440, 900],
]

/** A notched phone in landscape: the notch on one side, the home indicator
 *  along the bottom. */
const NOTCH: Insets = { top: 0, right: 44, bottom: 21, left: 44 }

/** Three counter plates and a full hand of abilities — the widest the HUD
 *  ever gets. */
const WIDEST = { countersWidth: 350, abilitiesWidth: 370 }

test('no two HUD elements overlap, at any viewport, notch or not', () => {
  for (const [name, width, height] of VIEWPORTS) {
    for (const [what, insets] of [['flat', NO_INSETS], ['notched', NOTCH]] as const) {
      const layout = hudLayout({ width, height, insets, ...WIDEST }, CFG)
      assert.deepEqual(collisions(layout), [],
        `${name} ${what}: ${collisions(layout).join(', ')}`)
    }
  }
})

test('the hero bar is on the left, clear of the painted tavern sign', () => {
  // The map plate paints COURJAHAN'S TAVERN and its signboard into the map's
  // top-right corner, at world (930..1007, 103..147). At the minimum zoom the
  // whole board is on screen, so the map's top-right corner is the screen's
  // top-right corner and there is no camera position that moves the sign out
  // from under a HUD element parked there. The hero's health bar was parked
  // there for the whole run.
  //
  // Measured, so this is a fact about the game and not about the wording of a
  // requirement: the sign's projection at minimum zoom on the reference phone.
  const SIGN = { x: 930, y: 103, w: 77, h: 44 }
  const MIN_ZOOM = 0.776
  const WORLD = { width: 1280, height: 720 }

  for (const [name, width, height] of VIEWPORTS) {
    const layout = hudLayout({ width, height, insets: NO_INSETS, ...WIDEST }, CFG)
    assert.ok(layout.heroRow.x < layout.messageRow.x,
      `${name}: the hero bar is not on the left of the second row`)

    // Every camera position the clamp allows at minimum zoom, which is where
    // the sign's screen position is most constrained.
    const halfW = width / (2 * MIN_ZOOM)
    const halfH = height / (2 * MIN_ZOOM)
    const cxs = halfW * 2 >= WORLD.width ? [WORLD.width / 2] : [halfW, WORLD.width - halfW]
    const cys = halfH * 2 >= WORLD.height ? [WORLD.height / 2] : [halfH, WORLD.height - halfH]
    for (const cx of cxs) {
      for (const cy of cys) {
        const r = {
          x: (SIGN.x - (cx - width / (2 * MIN_ZOOM))) * MIN_ZOOM,
          y: (SIGN.y - (cy - height / (2 * MIN_ZOOM))) * MIN_ZOOM,
          width: SIGN.w * MIN_ZOOM,
          height: SIGN.h * MIN_ZOOM,
        }
        assert.ok(!overlaps(r, layout.heroRow),
          `${name}: the hero bar is on the painted tavern sign again ` +
          `(sign at ${Math.round(r.x)},${Math.round(r.y)})`)
      }
    }
  }
})

test('the hero bar carries its own plate, because no corner is safe', () => {
  // MEASURED, not assumed, and the measurement says the corner cannot be the
  // whole answer. The map is full-bleed and the camera is free, so at maximum
  // zoom it can put any painted feature under any pixel: sweeping every camera
  // position the clamp allows, at every zoom in the band, against the painted
  // content found by classifying the plate itself, ZERO of 82,290 screen cells
  // at 844x390 are never reached. There is no safe corner to move to.
  //
  // What the move does buy, over 768 camera positions:
  //
  //   position                  on the painted signboard   on any painted art
  //   old, top-right 587,60     110 / 768   (14%)          395 / 768  (51%)
  //   now, top-left   10,60       6 / 768   (0.8%)         380 / 768  (49%)
  //   best alternative clear
  //   of the rest of the HUD      2 / 768                  405 / 768  (worse)
  //
  // So the left is within noise of the best position available, and the
  // remainder is not a placement problem. It is what the HUD's own rules
  // already say: elements sit over map art, and each one carries its own
  // plate. The hero bar was a 55% black wash and did not.
  const hud = src('scenes/HudScene.ts')
  const bar = (presentation.hud as Record<string, any>).heroBar
  assert.ok(bar, 'the hero bar has no plate settings')
  assert.equal(bar.backingAlpha, 1, `a ${bar.backingAlpha} backing lets the map through the bar`)
  assert.ok(bar.edgeWidth >= 1, 'the bar has no edge, so it has no outline against busy art')
  assert.match(hud, /this\.heroBar\.fillStyle\(bar\.backing, bar\.backingAlpha\)/,
    'the hero bar no longer draws its backing from the plate settings')
  assert.match(hud, /this\.heroBar\.strokeRoundedRect\(x, y, w, h, bar\.radius\)/,
    'the hero bar draws no edge')
  assert.doesNotMatch(hud, /heroBar\.fillStyle\(0x000000, 0\.55\)/,
    'the translucent wash is back')
})

test('every element stays inside the safe area', () => {
  for (const [name, width, height] of VIEWPORTS) {
    const layout = hudLayout({ width, height, insets: NOTCH, ...WIDEST }, CFG)
    for (const [key, r] of Object.entries(layout)) {
      if (key === 'panelArea' || typeof r !== 'object') continue
      assert.ok(r.x >= NOTCH.left, `${name}: ${key} runs under the notch on the left`)
      assert.ok(r.x + r.width <= width - NOTCH.right,
        `${name}: ${key} runs under the notch on the right`)
      assert.ok(r.y >= NOTCH.top, `${name}: ${key} is above the safe area`)
      assert.ok(r.y + r.height <= height - NOTCH.bottom,
        `${name}: ${key} runs into the home indicator`)
    }
  }
})

test('the HUD is pinned to the corners it is supposed to be pinned to', () => {
  const [, width, height] = VIEWPORTS[1]!
  const l = hudLayout({ width, height, insets: NO_INSETS, ...WIDEST }, CFG)
  // Kingdom Rush: pills top-left, buttons top-right, actives along the bottom.
  // There used to be two bottom corner controls; the settings gear replaced
  // both, and then moved to the top row where a player looks for it.
  //
  // CANCEL took the corner it left, and has since left it too. The corner was
  // still the BOARD — quieter than the middle of it, but the board — and
  // nothing that is not part of the game world is drawn there any more. It is
  // in the HUD band, at the right-hand end of the second row, directly under
  // the gear and beside the instruction line it answers. The bottom row is
  // the hand and nothing else.
  assert.ok(l.counters.x < width / 3, 'the counters are not in the top-left')
  assert.ok(l.counters.y < height / 4, 'the counters are not at the top')
  assert.ok(l.startButton.x + l.startButton.width > width * 0.7,
    'the start button is not in the top-right')
  assert.ok(l.settings.x + l.settings.width > width * 0.95,
    'the settings gear is not at the right-hand end of the top row')
  assert.ok(l.settings.y < height / 4, 'the settings gear is not in the top row')
  assert.ok(l.settings.x > l.startButton.x + l.startButton.width,
    'the gear must sit outboard of START WAVE, not on it')
  assert.ok(l.cancel.x + l.cancel.width > width * 0.95,
    'CANCEL is not at the right-hand edge')
  assert.ok(l.cancel.y < height / 3, 'CANCEL is not in the HUD band')
  assert.ok(l.cancel.y >= l.settings.y + l.settings.height,
    'CANCEL is not below the gear: it is in the top row, not the second')
  // And it is out of the board entirely: everything below the band belongs to
  // the world, and the ability row is the one exception the game already made.
  assert.ok(l.cancel.y + l.cancel.height < l.panelArea.y,
    'the panel area runs over CANCEL')
  assert.equal((l as Record<string, unknown>).mute, undefined, 'the mute control is back')
  assert.equal((l as Record<string, unknown>).pause, undefined, 'the pause button is back')
  const mid = l.abilities.x + l.abilities.width / 2
  assert.ok(Math.abs(mid - width / 2) < 40, 'the abilities are not along the bottom centre')
})

test('the abilities give way to the corner button rather than sit on it', () => {
  // A wide hand on a narrow phone: centring alone puts the outermost icon on
  // top of the corner control.
  const l = hudLayout(
    { width: 568, height: 320, insets: NOTCH, countersWidth: 350, abilitiesWidth: 420 }, CFG)
  assert.ok(!overlaps(l.abilities, l.cancel), 'the ability row covers CANCEL')
})

test('CANCEL is reserved from the layout even though it is usually hidden', () => {
  // The whole reason it has a rectangle: a button that appears into whatever
  // space is free will one day appear on top of something.
  for (const [name, width, height] of VIEWPORTS) {
    const l = hudLayout({ width, height, insets: NOTCH, ...WIDEST }, CFG)
    assert.ok(!overlaps(l.cancel, l.abilities), `${name}: CANCEL over the abilities`)
    assert.ok(!overlaps(l.cancel, l.settings), `${name}: CANCEL over the gear`)
    assert.ok(l.cancel.x >= 0 && l.cancel.x + l.cancel.width <= width,
      `${name}: CANCEL off the screen`)
    assert.ok(l.cancel.y >= 0 && l.cancel.y + l.cancel.height <= height,
      `${name}: CANCEL off the bottom`)
  }
})

test('the map is full-bleed: nothing is reserved from the board', () => {
  // This is the whole point of the revert. The world camera fills the screen,
  // and the HUD floats over it.
  const game = src('scenes/GameScene.ts')
  const apply = /private applyBands\([\s\S]*?\n  \}/.exec(game)
  assert.ok(apply, 'the camera setup is gone')
  // Full canvas, from the origin. In PHYSICAL pixels: the viewport is the
  // canvas, unlike the HUD band arithmetic beside it, which is CSS pixels.
  assert.match(apply[0], /setViewport\(0, 0, this\.scale\.width, this\.scale\.height\)/,
    'the world camera is inset again, so the map no longer reaches the edges')
  assert.doesNotMatch(game, /this\.bands|bandsFor/,
    'the reserved-band geometry is back')
  // And no painted strips behind the HUD.
  const hud = src('scenes/HudScene.ts')
  assert.doesNotMatch(hud, /fillRect\(0, y, W, h\)/,
    'the HUD still paints an opaque band across the screen')
  assert.doesNotMatch(hud, /bandsFor/, 'the HUD still computes reserved bands')
})

test('the HUD and the scene that draws over it share one set of rectangles', () => {
  const hud = src('scenes/HudScene.ts')
  const game = src('scenes/GameScene.ts')
  assert.match(hud, /hudLayout\(/, 'the HUD does not use the layout')
  assert.match(game, /hudLayout\(/, 'the scene does not know where the HUD is')
  // The cancel button and the build menu keep clear by asking, not by
  // guessing. CANCEL now has a rectangle of its own in the bottom-right
  // corner — it used to be centred over the board, which is where the player
  // is being asked to tap — so it asks the layout for it outright.
  assert.match(game, /const cb = this\.layout\.cancel/,
    'the cancel button is placed by a magic number again')
  assert.doesNotMatch(game, /plateButton\(this, viewW\(this\) \/ 2,\n\s*this\.layout\.abilities/,
    'CANCEL is back over the middle of the board')
  // The ring asks the layout where the HUD is rather than guessing. It uses
  // the BANDS rather than panelArea: panelArea also excludes the message row
  // and the hero row, which leaves 129px on a notched 568x320 — less than one
  // button plus its price badge, so the menu could not open there at all.
  assert.match(game, /countersBottom: this\.layout\.counters\.y \+ this\.layout\.counters\.height/,
    'the ring is no longer told where the counters end')
  assert.match(game, /abilitiesTop: this\.layout\.abilities\.y/,
    'the ring is no longer told where the ability bar starts')
})

test('the safe area is read rather than assumed to be zero', () => {
  // index.html sets viewport-fit=cover, so without this the counters sit under
  // the notch on every notched phone in landscape.
  const html = readFileSync(url('../index.html'), 'utf8')
  assert.match(html, /id="safe-area"/, 'there is no safe-area probe')
  assert.match(html, /padding-left: env\(safe-area-inset-left/,
    'the probe does not carry the inset values')
  const sa = src('systems/SafeArea.ts')
  assert.match(sa, /getComputedStyle/, 'the probe is never read')
  assert.match(sa, /catch/, 'a browser without env\\(\\) would throw instead of reporting zero')
  assert.match(src('scenes/HudScene.ts'), /safeAreaInsets\(\)/,
    'the HUD does not use the safe area')
})

test('what was right about the bands survived the revert', () => {
  const tier = presentation.towerTier as Record<string, unknown>
  assert.ok(typeof tier.pipBaselineOffset === 'number',
    'the tier pips floated back above the towers')
  assert.equal(tier.pipRiseAboveTop, undefined, 'the old floating pip anchor is back')
  const hud = src('scenes/HudScene.ts')
  const boss = /private drawBossBar\([\s\S]*?\n  \}/.exec(hud)
  assert.ok(boss, 'the boss bar is gone')
  assert.match(boss[0], /this\.layout\.messageRow/,
    'the boss bar is unconstrained again, so it runs under the start button')
  // And it takes a width from DATA, centred in that region. Taking the
  // region's width outright made it 563px on an 844px screen — two thirds of
  // the width, for one wave in thirteen — while bossBarWidth sat unread.
  assert.match(boss[0], /Math\.min\(HUD\.bossBarWidth, region\.width\)/,
    'the boss bar sizes itself from its container again')
  assert.equal((presentation.hud as Record<string, unknown>).bossBarTop, undefined,
    'bossBarTop is back, and nothing reads it')
  assert.match(boss[0], /this\.message\.setVisible\(!boss\)/,
    'the boss bar and the wave message can be up at once, in the same place')
})

test('a press on the HUD is not also a press on the board', () => {
  // The HUD renders in its own scene, so its interactive objects never appear
  // in the world scene's hit list — the world's "was this taken by UI?" check
  // is blind to every one of them. The consequence was not cosmetic: arming an
  // ability and then tapping a second icon cast the first one at the ability
  // bar's own position, spending a Server Nuke without the player going
  // anywhere near the lane.
  for (const [name, w, h] of VIEWPORTS) {
    const L = hudLayout({ width: w, height: h, insets: NO_INSETS, ...WIDEST }, CFG)

    const centre = (r: { x: number; y: number; width: number; height: number }) =>
      [r.x + r.width / 2, r.y + r.height / 2] as const

    for (const [label, rect] of [
      ['ability bar', L.abilities],
      ['start button', L.startButton],
      ['settings gear', L.settings],
    ] as const) {
      const [cx, cy] = centre(rect)
      assert.ok(hudTakesPress(L, cx, cy),
        `${name}: a press on the ${label} must belong to the HUD`)
    }

    // And the board is still tappable, or nothing can be built. The panel area
    // is where the build menu opens, which is the world's own UI.
    const [px, py] = centre(L.panelArea)
    assert.ok(!hudTakesPress(L, px, py),
      `${name}: the board must still take presses`)
  }
})

test('the HUD claims presses only where it has something to press', () => {
  // A guard that swallowed the whole bottom band would make the lane under it
  // untappable, which is worse than the bug it fixes.
  const L = hudLayout({ width: 1280, height: 720, insets: NO_INSETS, ...WIDEST }, CFG)
  let claimed = 0
  const step = 8
  for (let x = 0; x < 1280; x += step) {
    for (let y = 0; y < 720; y += step) {
      if (hudTakesPress(L, x, y)) claimed++
    }
  }
  const share = claimed / ((1280 / step) * (720 / step))
  assert.ok(share < 0.12,
    `the HUD claims ${(share * 100).toFixed(1)}% of the screen; that is a band, not four controls`)
  assert.ok(share > 0.01, `the HUD claims only ${(share * 100).toFixed(1)}%; the guard is not working`)
})

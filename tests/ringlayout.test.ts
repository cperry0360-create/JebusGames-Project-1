import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  type Rect, contains, fitRingAndPanel, overlap, panelPlacement, ringPlacement, usableArea,
} from '../src/systems/RingLayout.ts'
import { hudLayout } from '../src/systems/HudLayout.ts'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const MAP = read('map')
const DISPLAY = read('display')
const TOWERS = read('towers')
const P = read('presentation')
const CFG = P.ring
const LAYOUT = P.hud.layout

/**
 * THE RING, PROVED RATHER THAN SAMPLED.
 *
 * "Testing exhaustive not sampled: every pad and every built tower, at min and
 * max zoom, at both viewports, for every tower type and every upgrade option.
 * Assert ring and panel entirely within viewport bounds and no hit area
 * overlaps another."
 *
 * A browser cannot do that honestly. It can drive a few combinations, and its
 * synthetic taps land on buttons a thumb could never reach — a press
 * dispatched on the canvas hit-tests a point 194px below the display exactly
 * as happily as one in the middle of it, which is how the old build menu
 * "passed" a reachability check while being unusable on three of seven pads.
 *
 * So the placement is arithmetic in a Phaser-free module, and this walks all
 * of it. Position is the assertion. A handler firing proves nothing.
 */

const VIEWPORTS = [
  [844, 390], // iPhone 14 Pro landscape, the reference phone
  [568, 320], // iPhone SE landscape, the smallest thing this has to work on
  [1280, 720], // the design box, i.e. a desktop
]

/** Every notch shape worth caring about, including none. */
const INSETS = [
  { top: 0, right: 0, bottom: 0, left: 0 },
  { top: 0, right: 44, bottom: 21, left: 44 },
]

/** How many options each menu can offer. */
function optionCounts(): number[] {
  const counts = new Set<number>()
  // Build: one per unlocked tower, from one up to every tower in the game.
  for (let n = 1; n <= Object.keys(TOWERS).length; n++) counts.add(n)
  // Upgrade: sell alone, upgrade + sell, or both branches + sell.
  counts.add(1)
  counts.add(2)
  counts.add(3)
  return [...counts].sort((a, b) => a - b)
}

/** Every anchor a ring can open on, in world coordinates. */
function anchors(): Array<{ name: string; x: number; y: number }> {
  return (MAP.buildSpots as number[][]).map((s, i) => ({ name: `spot ${i}`, x: s[0]!, y: s[1]! }))
}

/** The screen position of a world point at a given zoom, with the camera
 *  centred on that point — the worst case, and the one the rig produces when
 *  the player taps something and it eases into view. */
function project(
  wx: number, wy: number, zoom: number, viewW: number, viewH: number,
  camX: number, camY: number,
): { x: number; y: number } {
  return { x: (wx - camX) * zoom, y: (wy - camY) * zoom }
}

function areaFor(viewW: number, viewH: number, insets: typeof INSETS[number]): Rect {
  // The widest the HUD ever gets: three counter plates and a full hand of
  // abilities. A ring that fits under that fits under any smaller HUD.
  const hud = hudLayout(
    { width: viewW, height: viewH, insets, countersWidth: 350, abilitiesWidth: 370 }, LAYOUT)
  return usableArea(viewW, viewH, insets, {
    countersBottom: hud.counters.y + hud.counters.height,
    abilitiesTop: hud.abilities.y,
  }, CFG.areaMargin)
}

/**
 * The tallest panel that can ever be drawn in a given area.
 *
 * The component caps it at this and shrinks the description to fit, so testing
 * anything taller tests a case the code cannot produce. Discovering that was
 * the first thing this test did: a 260px panel does not fit at 844x390 at all,
 * because the HUD leaves only 210px between the counters and the ability bar.
 */
function tallestPanel(area: Rect): number {
  return Math.max(120, area.height * CFG.panelMaxHeightFraction)
}

test('the ring and its panel stay on screen for every pad, zoom and viewport', () => {
  const zooms = [DISPLAY.camera.minZoom, DISPLAY.camera.defaultZoom, DISPLAY.camera.maxZoom]
  let checked = 0
  const failures: string[] = []

  for (const [vw, vh] of VIEWPORTS as Array<[number, number]>) {
    for (const insets of INSETS) {
      const area = areaFor(vw, vh, insets)
      for (const count of optionCounts()) {
        for (const zoom of zooms) {
          for (const a of anchors()) {
            // The camera can be anywhere, so the anchor can land anywhere on
            // the glass — including hard against every edge. Those are the
            // cases that broke the old menu, so they are the ones walked.
            for (const [px, py] of [
              [0, 0], [vw, 0], [0, vh], [vw, vh],
              [vw / 2, vh / 2], [vw / 2, 0], [vw / 2, vh], [0, vh / 2], [vw, vh / 2],
              // And a genuinely projected one, so the arithmetic above is not
              // the only thing being tested.
              [project(a.x, a.y, zoom, vw, vh, a.x - vw / zoom / 2, a.y - vh / zoom / 2).x,
                project(a.x, a.y, zoom, vw, vh, a.x - vw / zoom / 2, a.y - vh / zoom / 2).y],
            ] as Array<[number, number]>) {
              checked++
              const ph = tallestPanel(area)
              const { ring, panel } = fitRingAndPanel(px, py, count, CFG.panelWidth, ph, CFG, area)
              const where = `${vw}x${vh} insets=${insets.left} n=${count} zoom=${zoom} `
                + `${a.name} at ${Math.round(px)},${Math.round(py)}`

              if (ring.overflowed) {
                failures.push(`${where}: the ring itself does not fit in ${area.width}x${area.height}`)
                continue
              }
              if (!contains(area, ring.bounds)) {
                failures.push(`${where}: ring at ${JSON.stringify(ring.bounds)} leaves ${JSON.stringify(area)}`)
              }
              // Every button, individually. A ring whose BOX is inside the
              // area but whose corner button is not would still be unusable.
              for (const b of ring.buttons) {
                if (!contains(area, b.bounds)) {
                  failures.push(`${where}: button ${b.index} at ${JSON.stringify(b.bounds)} is off screen`)
                }
              }
              // No two hit areas overlap. Two buttons sharing pixels means one
              // of them can never be pressed.
              for (let i = 0; i < ring.buttons.length; i++) {
                for (let j = i + 1; j < ring.buttons.length; j++) {
                  const bi = ring.buttons[i]!
                  const bj = ring.buttons[j]!
                  // Compare the PLATES, which is what takes the press. The
                  // footprints include the price badges, which may tuck under
                  // a neighbour without either becoming unpressable.
                  const pi = { x: bi.x - CFG.buttonSize / 2, y: bi.y - CFG.buttonSize / 2, width: CFG.buttonSize, height: CFG.buttonSize }
                  const pj = { x: bj.x - CFG.buttonSize / 2, y: bj.y - CFG.buttonSize / 2, width: CFG.buttonSize, height: CFG.buttonSize }
                  if (overlap(pi, pj)) {
                    failures.push(`${where}: buttons ${i} and ${j} overlap`)
                  }
                }
              }

              // And the panel, at the tallest the component can draw.
              const box = { x: panel.x, y: panel.y, width: CFG.panelWidth, height: ph }
              if (!contains(area, box)) {
                failures.push(`${where}: panel at ${JSON.stringify(box)} leaves ${JSON.stringify(area)}`)
              }
              // The requirement is that the panel never covers the PAD or
              // TOWER it describes. Sitting over some of the ring's own
              // buttons is a smaller sin and, on the smallest notched phone,
              // an unavoidable one — 568x320 leaves a 472x171 strip and a
              // six-option ring plus the panel wants 510 of it.
              if (panel.coversAnchor) {
                failures.push(`${where}: the panel covers the pad it describes`)
              }
            }
          }
        }
      }
    }
  }

  assert.ok(checked > 2000, `only ${checked} combinations walked; this is meant to be exhaustive`)
  assert.deepEqual(failures.slice(0, 12), [],
    `${failures.length} of ${checked} placements are wrong`)
})

test('the ring grows until its plates stop overlapping, at every option count', () => {
  // THE BUG THIS EXISTS FOR. The first version spaced the buttons by ARC
  // LENGTH — a gap along the circle must be a gap between the buttons. It is
  // not. Two 58px squares whose centres are 65px apart at 60 degrees have a
  // 33px horizontal gap and a 56px vertical one, and overlap in both. The
  // six-tower ring had four overlapping pairs and the exhaustive test above
  // found every one of them.
  //
  // What is checked is the property, not the formula: no two PLATES may share
  // a pixel, at any option count, in any area the game can present.
  for (const [vw, vh] of VIEWPORTS as Array<[number, number]>) {
    const area = areaFor(vw, vh, INSETS[1]!)
    // Six is the most the game can ever offer: one per tower type on a pad,
    // and three at most on a built tower. Walking eight would be testing a
    // menu that cannot exist.
    for (let n = 1; n <= Object.keys(TOWERS).length; n++) {
      const p = ringPlacement(vw / 2, vh / 2, n, CFG, area)
      // The floor is a preference that yields to the screen: a notched
      // 844x390 leaves 189px of usable height, which is less than the floor
      // plus a price badge. What must hold is that it uses the floor wherever
      // there is room for it.
      const ryMax = (area.height - (CFG.buttonSize + CFG.priceGap + CFG.priceHeight)) / 2
      assert.ok(p.radiusY >= Math.min(CFG.minRadius, ryMax) - 0.5,
        `${vw}x${vh} n=${n}: radius ${p.radiusY} is under both the floor and the room available`)
      // It stretches sideways into a wide, short strip rather than demanding a
      // circle that will not fit — but only so far, or it stops reading as a
      // ring around the tower.
      assert.ok(p.radiusX <= p.radiusY * CFG.maxAspect + 0.5,
        `${vw}x${vh} n=${n}: the ring stretched to ${(p.radiusX / p.radiusY).toFixed(1)}:1`)
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = p.buttons[i]!
          const b = p.buttons[j]!
          assert.ok(Math.abs(a.x - b.x) >= CFG.buttonSize - 0.5
            || Math.abs(a.y - b.y) >= CFG.buttonSize - 0.5,
          `${vw}x${vh} n=${n}: plates ${i} and ${j} overlap`)
        }
      }
    }
  }
})

test('the panel picks its side from the room available, not from a fixed rule', () => {
  const area = { x: 0, y: 0, width: 800, height: 400 }
  const w = CFG.panelWidth
  const place = (ring: Rect, ax: number, ay: number, h = 200) =>
    panelPlacement(ring, ax, ay, w, h, area, CFG)

  // Ring hard against the left: the panel has to go right.
  const left = place({ x: 10, y: 150, width: 140, height: 140 }, 80, 220)
  assert.equal(left.side, 'right')
  // Hard against the right: it has to flip.
  const right = place({ x: 650, y: 150, width: 140, height: 140 }, 720, 220)
  assert.equal(right.side, 'left')
  assert.ok(right.x >= area.x, 'the flipped panel left the screen')
  // A ring spanning the full width leaves no horizontal room at all, so it
  // must go below or above rather than sit on the ring.
  const wide = place({ x: 0, y: 20, width: 800, height: 100 }, 400, 70, 120)
  assert.ok(wide.side === 'below' || wide.side === 'above', `it chose ${wide.side}`)
  assert.equal(wide.overlapsRing, false, 'it covered the ring with room to spare')
  // And in every one of those, the pad it describes stays visible.
  for (const p of [left, right, wide]) {
    assert.equal(p.coversAnchor, false, 'the panel covered the pad it describes')
  }
})

test('the ring gets out of the way when the panel has nowhere to go', () => {
  // Placing the ring first and the panel afterwards cannot solve this: on a
  // notched 844x390 the strip is 736x189, a four-option ring is ~309 wide, and
  // a ring in the middle of that leaves 199px either side for a 226px panel.
  // Everything fits — 309 + 14 + 226 is 549 of 736 — but only if the ring
  // moves first.
  const area = areaFor(844, 390, INSETS[1]!)
  const cx = area.x + area.width / 2
  const cy = area.y + area.height / 2
  const alone = ringPlacement(cx, cy, 4, CFG, area)
  const naive = panelPlacement(alone.bounds, cx, cy, CFG.panelWidth, 160, area, CFG)
  assert.equal(naive.overlapsRing, true, 'this case no longer needs the ring to move')

  const fitted = fitRingAndPanel(cx, cy, 4, CFG.panelWidth, 160, CFG, area)
  assert.equal(fitted.panel.overlapsRing, false, 'the ring did not move out of the way')
  assert.equal(fitted.panel.coversAnchor, false, 'the panel covers the pad it describes')
  assert.notEqual(fitted.ring.shiftX, 0, 'the ring moved without recording that it had')
  assert.ok(contains(area, fitted.ring.bounds), 'the moved ring left the screen')
})

test('the usable area is the viewport minus the notch and the ability bar', () => {
  // Both, not either. A ring inside the safe area but over the ability bar is
  // a ring whose buttons fight the abilities for the same tap; a ring clear of
  // the HUD but under a notch is a ring with a chunk missing.
  const insets = { top: 0, right: 44, bottom: 21, left: 44 }
  const hud = hudLayout(
    { width: 844, height: 390, insets, countersWidth: 350, abilitiesWidth: 370 }, LAYOUT)
  const area = usableArea(844, 390, insets, {
    countersBottom: hud.counters.y + hud.counters.height,
    abilitiesTop: hud.abilities.y,
  }, CFG.areaMargin)
  assert.ok(area.x >= insets.left, 'the area reaches into the left inset')
  assert.ok(area.x + area.width <= 844 - insets.right, 'the area reaches into the right inset')
  assert.ok(area.y >= insets.top, 'the area reaches into the top inset')
  assert.ok(area.y + area.height <= hud.abilities.y, 'the ring may cover the ability bar')
  assert.ok(area.width > 0 && area.height > 0, 'there is no room at all')
})

test('a ring that cannot fit says so rather than drawing off screen', () => {
  // The one case the geometry cannot solve. It must be reported, not hidden:
  // a menu half off the screen is the failure this whole component exists to
  // remove, and silently drawing one would be the same bug with a new name.
  const tiny = { x: 0, y: 0, width: 60, height: 60 }
  const p = ringPlacement(30, 30, 6, CFG, tiny)
  assert.equal(p.overflowed, true, 'a ring larger than the screen reported as fitting')
  const ring = readFileSync(url('../src/ui/TowerRing.ts'), 'utf8')
  assert.match(ring, /if \(p\.overflowed\)[\s\S]{0,80}reportOnce\(/,
    'nothing reports a ring that does not fit')
  assert.match(ring, /this\.opts\.onProblem\(why\)/, 'the scene is never told')
  const game = readFileSync(url('../src/scenes/GameScene.ts'), 'utf8')
  assert.match(game, /console\.error\(`\[ring\] \$\{why\}`\)/, 'the fault is not logged')
  assert.match(game, /this\.status\.message = why/, 'the player is never told')
})

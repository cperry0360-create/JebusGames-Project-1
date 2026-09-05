import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  type Rect, contains, fitRingAndPanel, overlap, panelPlacement, ringPlacement, usableArea,
} from '../src/systems/RingLayout.ts'
import { hudLayout } from '../src/systems/HudLayout.ts'
import DRAFT from '../src/data/draft.json' with { type: 'json' }

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
  // Build: one per UNLOCKED tower, from one up to the cap on how many types a
  // run can hold at once. It used to sweep to every tower in the game, which
  // was the same number until a seventh tower existed -- and a seventh cell is
  // a ring the smallest supported screen genuinely cannot fit. The run can
  // never offer more than `unlockedTypeCap`, so sweeping past it was testing a
  // menu the game cannot produce.
  const cap = Math.min(DRAFT.unlockedTypeCap, Object.keys(TOWERS).length)
  for (let n = 1; n <= cap; n++) counts.add(n)
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
      if (n > CFG.arcMaxOptions) {
        assert.ok(p.radiusY >= Math.min(CFG.minRadius, ryMax) - 0.5,
          `${vw}x${vh} n=${n}: radius ${p.radiusY} is under both the floor and the room available`)
      } else {
        // THE ARC IS MEANT TO BE TIGHT. The floor exists so a full ring does
        // not hug the thing it is about; two or three buttons on an arc are
        // supposed to. What must hold instead is the opposite bound — that
        // they stay close.
        assert.ok(p.radiusY <= CFG.minRadius,
          `${vw}x${vh} n=${n}: the arc grew to ${p.radiusY}, which is a ring`)
      }
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

test('the panel moves, not the ring', () => {
  // THE INVERSION, and the reasoning behind it. This used to push the RING
  // aside whenever the panel overlapped it, on the grounds that a leader line
  // is cheap. It is the wrong trade: the ring's position IS information — it
  // says which pad this menu belongs to — and the panel's is not. A panel is a
  // box of text and it reads the same wherever it sits.
  const area = areaFor(844, 390, INSETS[1]!)
  const cx = area.x + area.width / 2
  const cy = area.y + area.height / 2
  const alone = ringPlacement(cx, cy, 4, CFG, area)
  const naive = panelPlacement(alone.bounds, cx, cy, CFG.panelWidth, 160, area, CFG)
  assert.equal(naive.overlapsRing, true, 'this case no longer exercises the overlap')

  const fitted = fitRingAndPanel(cx, cy, 4, CFG.panelWidth, 160, CFG, area)
  assert.equal(fitted.ring.shiftX, 0, 'the ring was pushed aside for the panel again')
  assert.equal(fitted.ring.shiftY, 0, 'the ring was pushed aside for the panel again')
  assert.equal(fitted.panel.coversAnchor, false, 'the panel covers the pad it describes')
  // And overlapping the ring is the ACCEPTED outcome here, not a failure.
  assert.equal(fitted.panel.overlapsRing, true,
    'the case changed; this test no longer proves the panel is allowed to overlap')
})

test('the panel never covers the pad it is describing, anywhere', () => {
  // The one thing the panel may never do. Overlapping the ring's own buttons
  // is a smaller sin and is permitted; hiding the pad is the whole reason this
  // is not a centred modal.
  //
  // It is also what makes moving the ring unnecessary: with the anchor
  // disqualifying a side outright, all 7,560 placements find a panel position
  // that keeps the pad visible, so the last-resort branch never fires.
  let covered = 0
  for (const [vw, vh] of VIEWPORTS as Array<[number, number]>) {
    for (const insets of INSETS) {
      const area = areaFor(vw, vh, insets)
      const ph = tallestPanel(area)
      for (let n = 1; n <= Object.keys(TOWERS).length; n++) {
        for (const [px, py] of [
          [area.x, area.y], [area.x + area.width, area.y],
          [area.x, area.y + area.height], [area.x + area.width, area.y + area.height],
          [area.x + area.width / 2, area.y + area.height / 2],
        ] as Array<[number, number]>) {
          const f = fitRingAndPanel(px, py, n, CFG.panelWidth, ph, CFG, area)
          if (f.panel.coversAnchor) covered++
        }
      }
    }
  }
  assert.equal(covered, 0, `${covered} placements put the panel over the pad`)
})

test('every ring button is near the pad it belongs to', () => {
  // PROXIMITY, NOT JUST CONTAINMENT. A ring pinned to the right edge of the
  // screen is on screen, tidy, overlapping nothing, and passes every other
  // question this file asks — which is exactly what the build ring did at
  // devicePixelRatio 3, sitting 401px from the pad that opened it.
  //
  // Containment cannot see that. Distance can. What distance CANNOT be is
  // unconditional, and being honest about why matters: a six-option ring is
  // 324px wide, and a pad in the corner of the usable area cannot have a 324px
  // ring centred on it without half of it leaving the screen. The clamp then
  // moves it, correctly, and the far button ends up 336px away. Asserting a
  // flat bound would either fail that legitimate case or be too loose to catch
  // the bug.
  //
  // So it is conditioned on the thing that actually distinguishes them. Where
  // the ring FITS centred on its anchor, it must BE centred on its anchor —
  // shift zero, every button within one radius. That is false for a ring
  // clamped 401px away and true for every correct placement.
  const BOUND = 200
  let worst = 0
  let worstWhere = ''
  let checked = 0
  for (const [vw, vh] of VIEWPORTS as Array<[number, number]>) {
    for (const insets of INSETS) {
      const area = areaFor(vw, vh, insets)
      const ph = tallestPanel(area)
      // Bounded by the cap on tower types a run can hold, for the same reason
      // `optionCounts` is: the build ring cannot offer more cells than that,
      // so sweeping past it measures a menu the game never shows.
      for (let n = 1; n <= Math.min(DRAFT.unlockedTypeCap, Object.keys(TOWERS).length); n++) {
        for (let fx = 0; fx <= 1; fx += 0.125) {
          for (let fy = 0; fy <= 1; fy += 0.125) {
            const px = area.x + area.width * fx
            const py = area.y + area.height * fy
            const { ring } = fitRingAndPanel(px, py, n, CFG.panelWidth, ph, CFG, area)

            // Does the ring fit, centred here? Asked of the box it WOULD have
            // had before the clamp, recovered by undoing the shift. A box
            // centred on the anchor is the wrong question: the price badges
            // hang below the plates, so the ring's footprint sits lower than
            // its centre and a symmetric test is 2px out.
            const unclamped = {
              x: ring.bounds.x - ring.shiftX,
              y: ring.bounds.y - ring.shiftY,
              width: ring.bounds.width,
              height: ring.bounds.height,
            }
            if (!contains(area, unclamped)) continue

            checked++
            const where = `${vw}x${vh} insets=${insets.left} n=${n} `
              + `anchor ${Math.round(px)},${Math.round(py)}`
            assert.ok(Math.hypot(ring.shiftX, ring.shiftY) < 0.5,
              `${where}: the ring moved ${Math.hypot(ring.shiftX, ring.shiftY).toFixed(0)}px `
              + 'off a pad it had room to sit on')
            for (const b of ring.buttons) {
              const d = Math.hypot(b.x - px, b.y - py)
              if (d > worst) { worst = d; worstWhere = `${where} button ${b.index}` }
              assert.ok(d <= Math.max(ring.radiusX, ring.radiusY) + 1,
                `${where}: button ${b.index} is ${d.toFixed(0)}px out, past its own radius`)
            }
          }
        }
      }
    }
  }
  assert.ok(checked > 500, `only ${checked} placements had room to be centred; the walk is too narrow`)
  // And the absolute number, measured rather than chosen. 164px is a
  // six-option ring stretched as far as the ellipse cap allows on a notched
  // iPhone SE; the bug measured 401.
  assert.ok(worst <= BOUND, `a button sits ${worst.toFixed(0)}px from its pad — ${worstWhere}`)
})

test('the panel narrows rather than sitting on the ring, and never below its floor', () => {
  // A panel on top of a ring button costs a tap every time — cancel back to
  // the ring, then press it — and the screen where that bites is the smallest
  // one, which is the one a kid is most likely holding. So the panel takes the
  // widest width that fits BESIDE the ring, down to a floor.
  //
  // This is TowerRing.panelWidthFor, mirrored here because the component
  // itself needs Phaser. Measured over 540 placements per viewport:
  //
  //   844x390   fixed 226   worst 2 hidden, any hidden in  15 / 540
  //             adaptive    worst 0 hidden, any hidden in   0 / 540
  //   568x320   fixed 226   worst 4 hidden, any hidden in 225 / 540
  //             adaptive    worst 2 hidden, any hidden in 120 / 540
  //
  // Not zero on the smallest notched screen, and it cannot be: a six-option
  // ring is 324x214 in a 472x171 strip, so there is no room beside it at any
  // width. Narrowing further does not help either — measured at 120px the
  // worst case is still two — which is why the floor is where the text stops
  // being readable rather than where the geometry stops complaining.
  const widthFor = (ring: Rect, area: Rect): number => {
    const room = Math.max(
      (area.x + area.width) - (ring.x + ring.width) - CFG.panelGap,
      ring.x - area.x - CFG.panelGap,
    )
    return Math.max(CFG.panelMinWidth, Math.min(CFG.panelWidth, Math.floor(room)))
  }
  const component = readFileSync(url('../src/ui/TowerRing.ts'), 'utf8')
  assert.match(component, /Math\.max\(\s*\n?\s*CFG\.panelMinWidth, Math\.min\(CFG\.panelWidth, Math\.floor\(room\)\)\)/,
    'the component no longer clamps its panel width the way this test models')
  assert.ok(CFG.panelMinWidth < CFG.panelWidth,
    'the floor is not below the full width, so the panel can never narrow')
  // Wide enough for a stat row's label and its value not to meet in the middle.
  assert.ok(CFG.panelMinWidth >= 140,
    `a ${CFG.panelMinWidth}px panel cannot hold a labelled stat row`)

  let worstFixed = 0
  let worstAdaptive = 0
  let hiddenAdaptive = 0
  let total = 0
  let fullWidth = 0
  for (const [vw, vh] of VIEWPORTS as Array<[number, number]>) {
    for (const insets of INSETS) {
      const area = areaFor(vw, vh, insets)
      const ph = tallestPanel(area)
      // Bounded by the cap on tower types a run can hold, for the same reason
      // `optionCounts` is: the build ring cannot offer more cells than that,
      // so sweeping past it measures a menu the game never shows.
      for (let n = 1; n <= Math.min(DRAFT.unlockedTypeCap, Object.keys(TOWERS).length); n++) {
        for (let fx = 0; fx <= 1; fx += 0.125) {
          for (let fy = 0; fy <= 1; fy += 0.25) {
            const px = area.x + area.width * fx
            const py = area.y + area.height * fy
            const bounds = ringPlacement(px, py, n, CFG, area).bounds
            const W = widthFor(bounds, area)
            if (W === CFG.panelWidth) fullWidth++
            total++
            const hidden = (pw: number): number => {
              const { ring, panel } = fitRingAndPanel(px, py, n, pw, ph, CFG, area)
              const box = { x: panel.x, y: panel.y, width: pw, height: ph }
              return ring.buttons.filter((b) => overlap(box, {
                x: b.x - CFG.buttonSize / 2, y: b.y - CFG.buttonSize / 2,
                width: CFG.buttonSize, height: CFG.buttonSize,
              })).length
            }
            const a = hidden(W)
            worstFixed = Math.max(worstFixed, hidden(CFG.panelWidth))
            worstAdaptive = Math.max(worstAdaptive, a)
            if (a > 0) hiddenAdaptive++
          }
        }
      }
    }
  }
  assert.ok(worstAdaptive < worstFixed,
    `narrowing bought nothing: worst ${worstAdaptive} against ${worstFixed} at the full width`)
  assert.ok(worstAdaptive <= 2, `${worstAdaptive} buttons can still be hidden`)
  // And it does NOT narrow when there is no reason to. A panel that shrank on
  // every screen would be paying the smallest phone's price everywhere.
  assert.ok(fullWidth / total > 0.5,
    `only ${fullWidth} of ${total} placements keep the full-width panel`)
  void hiddenAdaptive
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

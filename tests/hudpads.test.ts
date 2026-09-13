import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  hudBandHeight, hudLayout, NO_INSETS, type Insets, type Rect,
} from '../src/systems/HudLayout.ts'
import { centerRange, coverZoom } from '../src/systems/CameraMath.ts'
import { LEVELS, loadLevel } from '../src/systems/Levels.ts'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const P = read('presentation')
const DISPLAY = read('display')
const LAYOUT = P.hud.layout

/**
 * THE HUD IS SCREEN SPACE AND THE BUILD PADS ARE WORLD SPACE, and until this
 * file existed nothing in the repository compared the two.
 *
 * `hudlayout.test.ts` proves the HUD's rectangles are disjoint FROM EACH
 * OTHER. That is a different claim: the map is full-bleed by design -- the
 * world camera's viewport is the whole canvas and the HUD floats over it --
 * so two HUD elements not overlapping says nothing at all about whether a
 * build pad is underneath one of them. `tools/harness/run.sh padhud` measured
 * a pad under the HUD on eight of the nine levels at 844x390, at both edges.
 */

const VIEWPORTS: Array<[string, number, number]> = [
  ['375x667 portrait', 375, 667],
  ['667x375', 667, 375],
  ['390x844 portrait', 390, 844],
  ['844x390', 844, 390],
  ['1280x720 desktop', 1280, 720],
  ['568x320', 568, 320],
]
const NOTCH: Insets = { top: 0, right: 44, bottom: 21, left: 44 }

/** One readout's width; see the note on `countersWidth`. */
const INPUT = { countersWidth: 48, abilitiesWidth: 322 }

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width
  && a.y < b.y + b.height && b.y < a.y + a.height

/** Every rectangle the player reads or presses. `panelArea` is deliberately
 *  absent: it is a hint about where a panel MAY open, not a thing on screen. */
const hudRects = (l: ReturnType<typeof hudLayout>): Array<[string, Rect]> => [
  ['counters', l.counters], ['startButton', l.startButton], ['messageRow', l.messageRow],
  ['heroChip', l.heroChip], ['abilities', l.abilities], ['settings', l.settings],
  ['cancel', l.cancel],
]

/**
 * A pad's tap rect in CSS pixels, for a camera centred at `cy` on the vertical
 * axis. The horizontal axis is not interesting here: nothing in the HUD is
 * docked to a side edge, and `padhud` measured no left/right collision on any
 * level.
 */
function padRect(
  padY: number, camCentreY: number, zoomCss: number, viewH: number, radius: number,
): { y: number; height: number } {
  const half = Math.max(22, radius * zoomCss)
  const screenY = viewH / 2 + (padY - camCentreY) * zoomCss
  return { y: screenY - half, height: half * 2 }
}

test('every build pad on every level can be brought out from under the HUD', () => {
  /*
   * THE GUARANTEE THAT ACTUALLY HOLDS, and the one that decides whether a pad
   * is buildable.
   *
   * A STATIC "no HUD rectangle ever overlaps a pad" IS NOT AVAILABLE and it is
   * worth writing down why rather than quietly asserting something weaker. The
   * map is full-bleed and the run opens at cover zoom, which on these plates
   * means the board exactly fills the screen; the HUD's two bands come to
   * about 100 CSS px of a 390px-tall phone. A pad painted in the top or bottom
   * tenth of a plate is therefore under a band at rest, and the only ways out
   * of that are a letterboxed map (tried, reverted -- see the header of
   * HudLayout.ts) or a map that does not fill the screen. So the question the
   * player cares about is not "is it ever covered" but "can I get at it", and
   * that is what this asserts.
   *
   * WHAT MADE IT FAIL BEFORE: `centerRange` pinned the camera's centre outright
   * when the view covered the world on an axis, and `boundsMarginPx` was 0. At
   * cover zoom on a 16:9 plate in a 16:9 window that is both axes, so the
   * camera could not move at all and a pad under a band was not awkward, it was
   * unreachable. The rig now takes the HUD's own band as vertical slack.
   */
  // LANDSCAPE ONLY, for the reason spelled out in the tap-floor test below:
  // the game is landscape-only and a portrait viewport gets a full-screen
  // rotate overlay with the scene paused behind it, so no pad in that layout
  // is reachable by a thumb whatever the camera does. Recorded rather than
  // skipped silently -- at 375x667 notched this asserts level 8's pad 16 as
  // unreachable, and it is, and the gate is why that is the right answer.
  for (const [name, W, H] of VIEWPORTS.filter(([, w, h]) => w > h)) {
    for (const insets of [NO_INSETS, NOTCH]) {
      const l = hudLayout({ width: W, height: H, insets, ...INPUT }, LAYOUT)
      const band = hudBandHeight(l, H)
      const rects = hudRects(l)
      for (const def of LEVELS) {
        const level = loadLevel(def.id)
        const worldW = DISPLAY.width
        const worldH = DISPLAY.height
        // Cover zoom in CSS pixels: the floor the run opens at.
        const zoom = coverZoom(W, H, worldW, worldH)
        // What the rig will allow, with the band as the vertical margin.
        //
        // BAND / ZOOM, because `centerRange`'s margin is in WORLD units and the
        // band is measured in screen pixels. The rig does the same division for
        // the same reason -- `my = hudBand / z` -- and getting it wrong here
        // reported level 4's pad 1 as unreachable at 667x375 when it is not:
        // 82 screen pixels is 157 world units at that zoom, and the difference
        // is the whole margin.
        const ry = centerRange(H, worldH, zoom, (band + LAYOUT.padClearancePx) / zoom)
        // `[x, y]` PAIRS, NOT `{x, y}`. `BuildSystem` is what turns them into
        // objects with an index, and reading `.y` off the raw pair gives
        // `undefined` -- which compares false against every bound, skips every
        // sample position and passes. This test did exactly that until a
        // mutation of `hudBandHeight` to `return 0` failed to break it.
        const spots = level.map.buildSpots.map(
          (pair: number[], index: number) => ({ index, x: pair[0]!, y: pair[1]! }))
        assert.ok(spots.length > 0 && Number.isFinite(spots[0]!.y),
          `${def.id}'s build spots did not read as coordinates`)
        for (const spot of spots) {
          let freed = false
          // Sampled across the range rather than at three points: the real
          // camera is continuous, and three samples reported a pad as stuck
          // when a position a third of the way along would have cleared it.
          const STEPS = 24
          for (let i = 0; i <= STEPS; i++) {
            const cy = ry.min + ((ry.max - ry.min) * i) / STEPS
            const r = padRect(spot.y, cy, zoom, H, level.map.spotRadius)
            if (r.y < 0 || r.y + r.height > H) continue
            const pad: Rect = { x: 0, y: r.y, width: 0.0001, height: r.height }
            // Vertical clearance only; see `padRect`.
            const hit = rects.some(([, h]) => h.y < pad.y + pad.height && pad.y < h.y + h.height
              && overlaps({ ...h, x: 0, width: W }, { ...pad, x: 0, width: W }))
            if (!hit) { freed = true; break }
          }
          assert.ok(freed,
            `${name}${insets === NOTCH ? ' notched' : ''}: ${def.id} pad ${spot.index} `
            + `at y=${spot.y} cannot be moved clear of the HUD (band ${band.toFixed(0)}px)`)
        }
      }
    }
  }
})

test('the camera is given the HUD\'s own band as vertical slack', () => {
  // The wiring, because the arithmetic above is only a guarantee if the game
  // actually hands the rig a band. It was added as a rig field and read every
  // frame while nothing wrote it from the limits, which reads in a diff as
  // wired and measures as a no-op -- `padhud` still reported five unreachable
  // pads on level 6 until the constructor seeded it.
  const rig = readFileSync(url('../src/systems/CameraRig.ts'), 'utf8')
  assert.match(rig, /this\.hudBand = limits\.hudBandPx \?\? 0/,
    'the rig never seeds its band from the limits it was constructed with')
  assert.match(rig, /const my = Math\.max\(m, this\.hudBand \/ Math\.max\(z, 0\.0001\)\)/,
    'the band is no longer converted to world units at the frame\'s zoom')
  const game = readFileSync(url('../src/scenes/GameScene.ts'), 'utf8')
  assert.match(game, /hudBandPx: \(hudBandHeight\([\s\S]{0,120}padClearancePx\)/,
    'the rig is not told the band plus the pad\'s own half-height')
  assert.match(game, /this\.rig\?\.setHudBand\(/,
    'the band is never refreshed, so a rotation leaves the camera with the old slack')

  // And `centerRange` must honour it on the axis that is fully covered, which
  // is the branch that used to pin the camera.
  const wide = centerRange(720, 720, 1, 0)
  assert.equal(wide.min, wide.max, 'a zero margin should still pin, as it always did')
  const slack = centerRange(720, 720, 1, 40)
  assert.equal(slack.max - slack.min, 80,
    'centerRange ignores its margin when the view covers the world, which is the pin that '
    + 'made a pad at a plate edge unreachable')
})

test('nothing tappable in the HUD is under the 44pt floor', () => {
  // The carve-out this HUD pass was given: a READOUT may shrink to whatever
  // stays legible, because nothing taps it; anything the player presses keeps
  // 44x44. `counters` and `messageRow` are the two readouts and are exempt by
  // name rather than by size, so a future change that makes one of them
  // interactive has to come back here.
  const TAPPABLE = ['startButton', 'heroChip', 'abilities', 'settings', 'cancel']
  // LANDSCAPE ONLY, AND PORTRAIT IS NOT A SKIPPED CHECK. The game is
  // landscape-only and a portrait viewport gets a full-screen rotate overlay
  // with the scene paused behind it, so no control in that layout is reachable
  // by a thumb at all. The layout still computes -- at 375x667 the ability row
  // comes out 24px tall, because the row is centred in a 375px width and gives
  // way to CANCEL on both sides -- and asserting 44pt against a screen the
  // player is being told to turn over would be measuring something nobody can
  // touch. The gate itself is checked by tools/harness `screens`, which reports
  // portrait as gated rather than audited.
  const landscape = VIEWPORTS.filter(([, W, H]) => W > H)
  assert.ok(landscape.length >= 4, 'the landscape set has been emptied')
  for (const [name, W, H] of landscape) {
    const l = hudLayout({ width: W, height: H, insets: NO_INSETS, ...INPUT }, LAYOUT)
    for (const [id, r] of hudRects(l)) {
      if (!TAPPABLE.includes(id)) continue
      // The ability ROW holds several buttons, so its width is the row's; its
      // height is the one that has to clear the floor.
      // THE TAP SIZE, NOT THE DRAWN SIZE. The settings gear is drawn at 40 and
      // its hit rectangle is padded out to 44 -- see `_cornerButtonTapPad` --
      // because a 44px disc in a 44px row reads as a slab. Checking the drawn
      // size reported a violation on the one control that never had one.
      const pad = id === 'settings' ? LAYOUT.cornerButtonTapPad : 0
      assert.ok(r.height + pad >= 44,
        `${name}: ${id} taps at ${(r.height + pad).toFixed(0)}px tall, under the 44pt floor`)
      if (id !== 'abilities') {
        assert.ok(r.width + pad >= 44,
          `${name}: ${id} taps at ${(r.width + pad).toFixed(0)}px wide, under the 44pt floor`)
      }
    }
  }
})

test('the readouts shrank and the controls did not', () => {
  // The shape of the change, pinned so a later pass cannot quietly put the
  // full-width row back. The stack must also be no taller than the row it
  // replaced: the second row is placed under it and the build drawer's panel
  // under that, so a taller group costs the drawer its grid.
  assert.ok(LAYOUT.readoutHeight < LAYOUT.plateHeight,
    'a readout is no smaller than the 44px plate it was cut from')
  assert.equal(LAYOUT.readoutHeight * 2 + LAYOUT.readoutGap, LAYOUT.plateHeight,
    'the stacked pair is not the same height as the row it replaced, so the top band moved')
  assert.equal(LAYOUT.plateHeight, 44, 'the wave control is under the tap floor')
  assert.ok(LAYOUT.startWidth < 168, 'the wave control did not get smaller')
  assert.ok(LAYOUT.startMinWidth >= 44, 'the wave control can shrink under the tap floor')
  assert.ok(LAYOUT.cornerButton + LAYOUT.cornerButtonTapPad >= 44,
    'the settings gear taps under the 44pt floor')
  // The camera's slack has to clear the pad's EDGE, not its centre.
  assert.ok(LAYOUT.padClearancePx >= 22,
    'the camera is given less slack than half a build pad, so an edge pad stops short')
  // The second row reserves its one occupant's width and no more.
  assert.equal(LAYOUT.messageWidth, P.hud.bossBarWidth,
    'the message row and the boss bar in it disagree about how wide it is')

  for (const [name, W, H] of VIEWPORTS) {
    const l = hudLayout({ width: W, height: H, insets: NO_INSETS, ...INPUT }, LAYOUT)
    assert.ok(l.messageRow.width <= P.hud.bossBarWidth + 1,
      `${name}: the message row is ${l.messageRow.width.toFixed(0)}px wide for a 300px bar`)
    assert.ok(l.counters.width < W / 3,
      `${name}: the readouts still take ${(l.counters.width / W * 100).toFixed(0)}% of the width`)
  }
})

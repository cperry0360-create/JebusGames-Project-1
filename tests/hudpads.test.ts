import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  hudBandHeight, hudLayout, NO_INSETS, type Insets, type Rect,
} from '../src/systems/HudLayout.ts'
import {
  boardBounds, centerRange, clampZoom, coverZoom, openingView,
} from '../src/systems/CameraMath.ts'
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

/** Every rectangle the player reads or presses. `panelArea` is deliberately
 *  absent: it is a hint about where a panel MAY open, not a thing on screen. */
const hudRects = (l: ReturnType<typeof hudLayout>): Array<[string, Rect]> => [
  ['counters', l.counters], ['startButton', l.startButton], ['messageRow', l.messageRow],
  ['heroChip', l.heroChip], ['abilities', l.abilities], ['settings', l.settings],
  ['cancel', l.cancel],
]

/**
 * A tap point's distance to a rectangle, zero inside it.
 *
 * A CIRCLE AGAINST A RECTANGLE, not rectangle against rectangle, because a
 * build pad is a disc: `BuildSystem.spotAt` takes the nearest spot within
 * `spotRadius` world units of the tap, so the tappable region of a pad is its
 * projected circle and nothing else.
 */
function distToRect(x: number, y: number, r: Rect): number {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.width))
  const dy = Math.max(r.y - y, 0, y - (r.y + r.height))
  return Math.hypot(dx, dy)
}

/** Half of the 44pt floor: the radius of the clear circle a thumb needs. */
const TAP_R = 22

test('every build pad on every level can be brought out from under the HUD', () => {
  /*
   * THE GUARANTEE THAT DECIDES WHETHER A PAD IS BUILDABLE, re-derived from
   * scratch on 2026-09-15 because the previous version of it was measuring
   * something much harder than the game and the fix it justified shipped a
   * worse bug.
   *
   * WHAT IT USED TO ASSERT: that the pad's whole bounding square could be
   * brought fully on screen and clear of the HUD, with EVERY HUD ELEMENT
   * WIDENED TO THE FULL SCREEN WIDTH -- `overlaps({ ...h, x: 0, width: W }, ...)`.
   * That is not the HUD. The top band is a 48px readout stack in one corner, a
   * 132px wave control, a 40px gear and a 300px centred message row; the
   * bottom band is a hero chip, a 322px centred ability row and CANCEL. Between
   * them there is more clear width than covered width, so a pad slides out from
   * under one SIDEWAYS as readily as vertically -- and the old measurement could
   * not see that at all. It counted 47 trapped pads at 667x375 where there is
   * not one.
   *
   * WHAT IT COST: the camera was given the HUD's band height as a vertical
   * bounds margin to buy slack the pads did not need, and a margin on the
   * camera centre shows the void past the plate. That was the black screen
   * live play reported on every level. See `tests/camerabounds.test.ts`.
   *
   * WHAT IT ASSERTS NOW: with the camera clamped strictly to the plate -- no
   * margin, nothing outside the artwork ever visible -- every pad on every
   * level has a zoom inside the band and a camera position inside the plate
   * where a 44pt clear circle sits inside the pad's own disc, on screen, and
   * clear of every HUD rectangle. 151 pads across ten levels, at six
   * viewports, with and without a notch.
   *
   * WHAT IT DOES NOT ASSERT: that this is true AT REST. It is not, and cannot
   * be: at cover zoom a pad is about 30 CSS px across before any HUD is
   * involved, which is under the 44pt floor on its own. The player zooms in to
   * build, which is what `defaultZoom` 1.72 is for. The honest claim is
   * reachability, and the zoom each pad needs is reported below.
   */
  // LANDSCAPE ONLY. The game is landscape-only and a portrait viewport gets a
  // full-screen rotate overlay with the scene paused behind it, so no pad in
  // that layout is reachable by a thumb whatever the camera does. Recorded
  // rather than skipped silently; `tools/harness run.sh screens` reports
  // portrait as gated rather than audited, and that is the right answer.
  const worst: string[] = []
  for (const [name, W, H] of VIEWPORTS.filter(([, w, h]) => w > h)) {
    for (const insets of [NO_INSETS, NOTCH]) {
      const l = hudLayout({ width: W, height: H, insets, ...INPUT }, LAYOUT)
      const band = hudBandHeight(l, H)
      const rects = hudRects(l).map(([, r]) => r)
      const worldW = DISPLAY.width
      const worldH = DISPLAY.height
      const cover = coverZoom(W, H, worldW, worldH)
      // The band the player's pinch can actually reach, in CSS pixels per
      // world unit. Both ends go through `clampZoom` for the same reason the
      // rig does: cover is a floor the viewport imposes and can sit above the
      // design ceiling on a very wide window.
      const zLo = clampZoom(DISPLAY.camera.minZoom, cover, DISPLAY.camera.maxZoom,
        DISPLAY.camera.minZoom)
      const zHi = clampZoom(DISPLAY.camera.maxZoom, cover, DISPLAY.camera.maxZoom,
        DISPLAY.camera.minZoom)
      let worstZoom = 0
      for (const def of LEVELS) {
        const level = loadLevel(def.id)
        // `[x, y]` PAIRS, NOT `{x, y}`. `BuildSystem` is what turns them into
        // objects with an index, and reading `.y` off the raw pair gives
        // `undefined` -- which compares false against every bound, skips every
        // sample position and passes. This test did exactly that until a
        // mutation of `hudBandHeight` to `return 0` failed to break it.
        const spots = level.map.buildSpots.map(
          (pair: number[], index: number) => ({ index, x: pair[0]!, y: pair[1]! }))
        assert.ok(spots.length > 0 && Number.isFinite(spots[0]!.y),
          `${def.id}'s build spots did not read as coordinates`)
        const R = level.map.spotRadius
        for (const spot of spots) {
          let freedAt = 0
          // Zoom ASCENDING, so the number reported is the least zoom that
          // frees the pad rather than whichever end the loop started at.
          const ZS = 12
          for (let k = 0; k <= ZS && !freedAt; k++) {
            const z = zLo + ((zHi - zLo) * k) / ZS
            // A 44pt circle has to fit inside the pad's projected disc before
            // anything about the HUD matters.
            const slack = R * z - TAP_R
            if (slack < 0) continue
            const rx = centerRange(W, worldW, z)
            const ry = centerRange(H, worldH, z)
            const CS = 12
            for (let i = 0; i <= CS && !freedAt; i++) {
              const cy = ry.min + ((ry.max - ry.min) * i) / CS
              const sy = H / 2 + (spot.y - cy) * z
              for (let j = 0; j <= CS && !freedAt; j++) {
                const cx = rx.min + ((rx.max - rx.min) * j) / CS
                const sx = W / 2 + (spot.x - cx) * z
                // Candidate tap centres inside the disc: its own centre, and
                // eight directions at half and full slack. Sampled rather than
                // solved because the clear region is a rectangle complement
                // and the answer only has to be "somewhere".
                for (let a = 0; a < 8 && !freedAt; a++) {
                  for (const rr of [0, slack / 2, slack]) {
                    const tx = sx + Math.cos((a * Math.PI) / 4) * rr
                    const ty = sy + Math.sin((a * Math.PI) / 4) * rr
                    if (tx - TAP_R < 0 || ty - TAP_R < 0 || tx + TAP_R > W || ty + TAP_R > H) continue
                    if (rects.every((h) => distToRect(tx, ty, h) >= TAP_R)) { freedAt = z; break }
                  }
                }
              }
            }
          }
          assert.ok(freedAt > 0,
            `${name}${insets === NOTCH ? ' notched' : ''}: ${def.id} pad ${spot.index} `
            + `at (${spot.x},${spot.y}) has no camera position inside the plate where a 44pt `
            + `tap lands on it clear of the HUD (band ${band.toFixed(0)}px, `
            + `zoom band ${zLo.toFixed(2)}..${zHi.toFixed(2)})`)
          if (freedAt > worstZoom) worstZoom = freedAt
        }
      }
      worst.push(`${name}${insets === NOTCH ? ' notched' : ''}: band ${band.toFixed(0)}px, `
        + `worst pad needs zoom ${worstZoom.toFixed(2)} of ${zHi.toFixed(2)}`)
    }
  }
  // Printed rather than asserted: it is the measurement the claim rests on,
  // and a number nobody can read is a number nobody will re-derive.
  assert.ok(worst.length === 8, `measured ${worst.length} viewport/inset pairs, not 8`)
})

test('the camera is NOT given the HUD band as slack', () => {
  // The inverse of the guard this file used to carry, and the reason is the
  // whole point of the pass above: the band was bought with the void past the
  // plate. The behaviour side is `tests/camerabounds.test.ts`; this is the
  // wiring, because the bug was a caller passing an extra argument.
  const rig = readFileSync(url('../src/systems/CameraRig.ts'), 'utf8')
  assert.doesNotMatch(rig, /hudBandPx \?\? 0/,
    'the rig seeds a HUD band allowance again')
  assert.doesNotMatch(rig, /this\.hudBand \/ Math\.max/,
    'the band is converted to world units and used as a margin again')
  const game = readFileSync(url('../src/scenes/GameScene.ts'), 'utf8')
  assert.doesNotMatch(game, /hudBandPx:/,
    'GameScene hands the rig a band to widen its bounds with again')
  assert.doesNotMatch(game, /setHudBand/,
    'GameScene refreshes a band the rig should not have')

  // And `centerRange` must pin, not pad, when the view covers the world.
  const pinned = centerRange(720, 720, 1)
  assert.equal(pinned.min, pinned.max,
    'the centre range has slack on an axis the view already covers, which is void')
  assert.equal(pinned.min, 360, 'the pin is not the world centre')
  // The margin cannot be smuggled back in as a fourth argument.
  const four = (centerRange as unknown as (a: number, b: number, c: number, d: number)
    => { min: number; max: number })(720, 720, 1, 40)
  assert.equal(four.max - four.min, 0,
    'centerRange still honours a fourth argument, so a caller can widen the clamp')
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

/**
 * THE TEST THE BRIEF WENT LOOKING FOR, AND IT DID NOT EXIST — AND THE ONE IT
 * BOUGHT WAS WORSE THAN NOTHING.
 *
 * What this used to assert: that `GameScene.padShowing` exists, that
 * `drawSpots` calls it, and that `syncPadVisibility` re-answers it every frame.
 * It passed. It was still passing while build pads popped in and out of
 * existence under a pan, because it pinned an IMPLEMENTATION — "the scene hides
 * a pad the HUD is standing on" — and never asked what that rule does when the
 * camera moves. A rule evaluated in screen space against a live camera changes
 * its answer every frame BY CONSTRUCTION.
 *
 * Measured on the tree that shipped it: 151 of 151 pads across the ten levels
 * flip between drawn and not drawn somewhere in the reachable camera box, at
 * every landscape viewport. On level 1 at 844x390, five of seven pads are
 * hidden at once at zoom 0.98.
 *
 * So the at-rest coverage measurement stays — it is a true fact about a
 * full-bleed map with a floating HUD, and it is worth having a number for —
 * and the assertion is now the property the game actually needs.
 */
test('the HUD does stand on pads at rest, and that number is recorded', () => {
  const overlaps1 = (a: Rect, b: Rect): boolean =>
    a.x < b.x + b.width && b.x < a.x + a.width
    && a.y < b.y + b.height && b.y < a.y + a.height
  const report: string[] = []
  for (const [name, W, H] of VIEWPORTS.filter(([, w, h]) => w > h)) {
    for (const insets of [NO_INSETS, NOTCH]) {
      const l = hudLayout({ width: W, height: H, insets, ...INPUT }, LAYOUT)
      const rects = hudRects(l)
      for (const def of LEVELS) {
        const level = loadLevel(def.id)
        const worldW = DISPLAY.width
        const worldH = DISPLAY.height
        // THE CAMERA THE RUN OPENS AT, computed the same way GameScene does.
        // "At rest" is not cover zoom and not the design default: it is
        // `openingView` over the board box.
        const board = boardBounds(
          level.map.waypoints, level.map.buildSpots, level.map.roadWidth,
          level.map.spotRadius, worldW, worldH, DISPLAY.camera.openingMargin,
        )
        const cover = coverZoom(W, H, worldW, worldH)
        const open = openingView(W, H, board, cover, DISPLAY.camera.maxZoom)
        const rx = centerRange(W, worldW, open.zoom)
        const ry = centerRange(H, worldH, open.zoom)
        const cx = Math.min(Math.max(open.x, rx.min), rx.max)
        const cy = Math.min(Math.max(open.y, ry.min), ry.max)
        const R = level.map.spotRadius
        let covered = 0
        level.map.buildSpots.forEach((pair: number[]) => {
          const half = Math.max(22, R * open.zoom)
          const sx = W / 2 + (pair[0]! - cx) * open.zoom
          const sy = H / 2 + (pair[1]! - cy) * open.zoom
          const pad: Rect = { x: sx - half, y: sy - half, width: half * 2, height: half * 2 }
          if (rects.some(([, h]) => overlaps1(h, pad))) covered++
        })
        if (covered > 0) {
          report.push(`${def.id} ${name}${insets === NOTCH ? ' notched' : ''}: ${covered}`)
        }
      }
    }
  }
  // RECORDED, NOT ASSERTED TO ZERO. The map is full-bleed by design and the HUD
  // floats over it, so some pad is under some rectangle at some camera position
  // on every level. That is not the bug. Hiding the pad when it happens was.
  assert.ok(report.length > 0,
    'no pad is under the HUD at rest on any level at any viewport, which would mean '
    + 'this test has stopped measuring anything')
})

/**
 * NO BUILD PAD CHANGES VISIBILITY AS A RESULT OF THE CAMERA MOVING.
 *
 * THE PROPERTY THAT WAS MISSING, and the third attempt at one problem. The
 * first two each fixed it by shipping a different visible bug:
 *
 *   1. `reports/2026-09-13-hud-cleanup-and-level-8.md` gave the camera the HUD
 *      band as a bounds margin so the map would inset below the HUD. A margin
 *      on the camera CENTRE does not create slack inside the plate, it moves
 *      the wall outward — that was the black-screen-on-scroll bug. Reverted,
 *      and `the camera is NOT given the HUD band as slack` above keeps it out.
 *   2. `reports/2026-09-14-ui-cleanup.md` hid a pad the HUD was standing on.
 *      That rule is evaluated in SCREEN space against a LIVE camera, so pads
 *      cross under it as the camera moves. That is what this test is for.
 *
 * PART 1 IS THE PAN AND IT IS THE EVIDENCE. It walks the reachable camera box
 * on every level at every zoom in the band and counts the pads a screen-space
 * HUD rule would flip. It has to keep finding some, or part 2 is guarding
 * nothing — a HUD that stopped reaching the board would make this test vacuous
 * without anyone noticing.
 *
 * PART 2 IS THE ASSERTION, and it is on the source rather than on arithmetic
 * for a reason: no arithmetic here can see what GameScene actually does, since
 * nothing in tests/ imports Phaser. What CAN be checked is that the decision
 * reads no term the camera moves. A rule that is a function of world state
 * alone satisfies the property by construction, and there is no tuning of a
 * screen-space rule that does.
 */
test('no build pad changes visibility as the camera moves', () => {
  const over = (a: Rect, b: Rect): boolean =>
    a.x < b.x + b.width && b.x < a.x + a.width
    && a.y < b.y + b.height && b.y < a.y + a.height

  // ---- PART 1: pan every level, and count what a screen-space rule flips ----
  const flipped: string[] = []
  let sampled = 0
  for (const [name, W, H] of VIEWPORTS.filter(([, w, h]) => w > h)) {
    const l = hudLayout({ width: W, height: H, insets: NO_INSETS, ...INPUT }, LAYOUT)
    const rects = hudRects(l).map(([, r]) => r).filter((r) => r.width > 0 && r.height > 0)
    const worldW = DISPLAY.width
    const worldH = DISPLAY.height
    const cover = coverZoom(W, H, worldW, worldH)
    const zLo = clampZoom(DISPLAY.camera.minZoom, cover, DISPLAY.camera.maxZoom,
      DISPLAY.camera.minZoom)
    const zHi = clampZoom(DISPLAY.camera.maxZoom, cover, DISPLAY.camera.maxZoom,
      DISPLAY.camera.minZoom)
    for (const def of LEVELS) {
      const level = loadLevel(def.id)
      const R = level.map.spotRadius
      const spots = level.map.buildSpots.map(
        (pair: number[], index: number) => ({ index, x: pair[0]!, y: pair[1]! }))
      // The same guard the reachability test carries: `[x, y]` pairs, not
      // objects, and reading `.y` off a raw pair gives undefined and passes.
      assert.ok(spots.length > 0 && Number.isFinite(spots[0]!.y),
        `${def.id}'s build spots did not read as coordinates`)
      const hiddenSomewhere = new Set<number>()
      const shownSomewhere = new Set<number>()
      const ZS = 6
      const CS = 14
      for (let k = 0; k <= ZS; k++) {
        const z = zLo + ((zHi - zLo) * k) / ZS
        const half = Math.max(22, R * z)
        const rx = centerRange(W, worldW, z)
        const ry = centerRange(H, worldH, z)
        for (let i = 0; i <= CS; i++) {
          const cy = ry.min + ((ry.max - ry.min) * i) / CS
          for (let j = 0; j <= CS; j++) {
            const cx = rx.min + ((rx.max - rx.min) * j) / CS
            for (const spot of spots) {
              sampled++
              const sx = W / 2 + (spot.x - cx) * z
              const sy = H / 2 + (spot.y - cy) * z
              const pad: Rect = {
                x: sx - half, y: sy - half, width: half * 2, height: half * 2,
              }
              if (rects.some((r) => over(r, pad))) hiddenSomewhere.add(spot.index)
              else shownSomewhere.add(spot.index)
            }
          }
        }
      }
      for (const spot of spots) {
        if (hiddenSomewhere.has(spot.index) && shownSomewhere.has(spot.index)) {
          flipped.push(`${name} ${def.id} pad ${spot.index}`)
        }
      }
    }
  }
  assert.ok(sampled > 100000, `only ${sampled} pad/camera samples; the pan has stopped panning`)
  assert.ok(flipped.length > 0,
    'a screen-space HUD rule would flip NO pad anywhere in the camera box, so the '
    + 'assertion below is guarding nothing. Either the HUD no longer reaches the '
    + 'board or this sample stopped moving the camera.')

  // ---- PART 2: the scene must not decide a pad's drawn state from the screen ----
  const game = readFileSync(url('../src/scenes/GameScene.ts'), 'utf8')
  const rule = /private padShowing\(spot: BuildSpot\): boolean \{[\s\S]*?\n  \}/.exec(game)
  assert.ok(rule, 'padShowing is gone, so nothing decides whether a pad is drawn')
  const SCREEN = /worldToScreen|cameras\.main|this\.layout|hudStandsOn|deviceScale/
  assert.doesNotMatch(rule[0], SCREEN,
    `padShowing reads a screen-space term, so its answer moves with the camera. `
    + `${flipped.length} pads flip under a pan when it does — for example `
    + `${flipped.slice(0, 3).join(', ')}.`)
  // And no back door: nothing else may drive a pad's visibility per frame.
  assert.doesNotMatch(game, /private hudStandsOn\(/,
    'the HUD-over-pad screen test is back')
  assert.doesNotMatch(game, /private syncPadVisibility\(/,
    'a per-frame pad visibility pass is back, which is the camera clock again')
  assert.doesNotMatch(game, /syncPadVisibility\(\)/,
    'something still re-answers pad visibility on the camera clock')
})

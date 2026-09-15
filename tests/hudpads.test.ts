import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  hudBandHeight, hudLayout, NO_INSETS, type Insets, type Rect,
} from '../src/systems/HudLayout.ts'
import { centerRange, clampZoom, coverZoom } from '../src/systems/CameraMath.ts'
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

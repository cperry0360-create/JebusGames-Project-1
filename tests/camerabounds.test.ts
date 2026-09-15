import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { centerRange, clampZoom, coverZoom, safeScroll, viewSpan } from '../src/systems/CameraMath.ts'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const code = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')
const DISPLAY = read('display')
const W = DISPLAY.width
const H = DISPLAY.height

/**
 * THE PLATE IS THE WORLD, AND NOTHING OUTSIDE IT IS PAINTED.
 *
 * Live play reported black past the top and bottom of the map on every level.
 * The cause was a margin: `CameraRig` handed `centerRange` the HUD's own band
 * height as a vertical bounds margin, so a build pad at a plate edge could be
 * nudged out from under the band -- and a margin on the camera CENTRE does not
 * create slack inside the plate, it moves the wall outward. The view left the
 * artwork by 137 world px at min zoom and 45 at max, measured by
 * `tools/harness/run.sh edges`.
 *
 * `tests/camera.test.ts` already asserted "the camera centre is clamped so the
 * view stays on the map" and was green throughout, because it called
 * `centerRange` WITHOUT a margin and the rig called it WITH one. That is the
 * hole this file closes: it checks the quantity the player sees, at the zooms
 * and viewports the player can reach, and it checks that nothing is in a
 * position to widen the clamp again.
 */

/** Every viewport the game is verified at, times both orientations, in device
 *  pixels -- which is what `cam.width`/`cam.height` are. */
const VIEWPORTS: Array<[string, number, number]> = [
  ['375x667', 375, 667], ['667x375', 667, 375],
  ['390x844', 390, 844], ['844x390', 844, 390],
  ['1280x720', 1280, 720], ['720x1280', 720, 1280],
  ['568x320', 568, 320], ['1170x2532', 1170, 2532],
  ['2532x1170', 2532, 1170], ['1400x900', 1400, 900],
]

/** The device ratios `Resolution.ts` can report, capped at 3. */
const RATIOS = [1, 2, 2.625, 3]

test('no zoom or scroll the player can reach puts the view off the plate', () => {
  for (const [name, vw, vh] of VIEWPORTS) {
    for (const dpr of RATIOS) {
      // The rig's numbers are DEVICE pixels per world unit: GameScene scales
      // the JSON zooms by the device ratio before handing them over, and
      // `cam.width` is already physical.
      const cover = coverZoom(vw, vh, W, H)
      const lo = clampZoom(DISPLAY.camera.minZoom * dpr, cover, DISPLAY.camera.maxZoom * dpr,
        DISPLAY.camera.minZoom * dpr)
      const hi = clampZoom(DISPLAY.camera.maxZoom * dpr, cover, DISPLAY.camera.maxZoom * dpr,
        DISPLAY.camera.minZoom * dpr)
      assert.ok(hi >= lo, `${name} @${dpr}x: the zoom band is inverted`)
      const STEPS = 16
      for (let k = 0; k <= STEPS; k++) {
        const z = lo + ((hi - lo) * k) / STEPS
        const rx = centerRange(vw, W, z)
        const ry = centerRange(vh, H, z)
        assert.ok(rx.min <= rx.max && ry.min <= ry.max,
          `${name} @${dpr}x z=${z.toFixed(3)}: empty centre range`)
        // Both ends of the legal range, and a fling past each of them: the rig
        // clamps the target into the range, so a target outside it lands on
        // the bound rather than beyond it.
        for (const cx of [rx.min, rx.max, rx.min - 9e4, rx.max + 9e4]) {
          for (const cy of [ry.min, ry.max, ry.min - 9e4, ry.max + 9e4]) {
            const ax = Math.min(Math.max(cx, rx.min), rx.max)
            const ay = Math.min(Math.max(cy, ry.min), ry.max)
            const sx = viewSpan(ax, vw, z)
            const sy = viewSpan(ay, vh, z)
            // A whole world pixel of tolerance and no more: `safeScroll`
            // rounds, and at cover zoom the legal range can be narrower than a
            // pixel, which is the one case where rounding to the middle is the
            // best available answer.
            assert.ok(sx.min >= -1 && sx.max <= W + 1,
              `${name} @${dpr}x z=${z.toFixed(3)}: the view spans x ${sx.min.toFixed(1)}..`
              + `${sx.max.toFixed(1)} of a ${W} plate`)
            assert.ok(sy.min >= -1 && sy.max <= H + 1,
              `${name} @${dpr}x z=${z.toFixed(3)}: the view spans y ${sy.min.toFixed(1)}..`
              + `${sy.max.toFixed(1)} of a ${H} plate`)
          }
        }
      }
    }
  }
})

test('the rounded scroll the rig actually writes is on the plate too', () => {
  // `writeCenter` puts the scroll through `safeScroll`, which rounds INSIDE
  // the legal range. Checked separately because the float clamp above and the
  // integer that reaches Phaser are not the same number, and the sliver of
  // void at the map edge that `safeScroll` exists for was exactly that gap.
  for (const [name, vw, vh] of VIEWPORTS) {
    const cover = coverZoom(vw, vh, W, H)
    for (const mult of [1, 1.13, 1.5, 2, 3, 4.5, 7.11]) {
      const z = cover * mult
      const rx = centerRange(vw, W, z)
      const ry = centerRange(vh, H, z)
      for (const [c, r, view, world, axis] of [
        [rx.min, rx, vw, W, 'x'], [rx.max, rx, vw, W, 'x'],
        [ry.min, ry, vh, H, 'y'], [ry.max, ry, vh, H, 'y'],
      ] as Array<[number, { min: number; max: number }, number, number, string]>) {
        const scroll = safeScroll(c - view / 2, r.min - view / 2, r.max - view / 2)
        // `scrollX` is the top-left of the UNZOOMED camera rect, so the centre
        // is `scroll + view / 2` whatever the zoom -- which is why the rig
        // writes `centre - cam.width / 2` and not `centre - cam.width / (2z)`.
        // Getting that wrong is how the first draft of this check reported a
        // 1294px view of a 1280px plate at a scroll that is perfectly legal.
        const span = viewSpan(scroll + view / 2, view, z)
        assert.ok(span.min >= -1 && span.max <= world + 1,
          `${name} @${mult}x cover: the ${axis} scroll ${scroll} shows `
          + `${span.min.toFixed(1)}..${span.max.toFixed(1)} of a ${world} plate`)
      }
    }
  }
})

test('nothing can widen the camera clamp again', () => {
  // The three places the margin lived. A source check rather than a behaviour
  // one on purpose: the arithmetic above is only a guarantee about the numbers
  // the rig passes in, and the bug was a caller passing an extra one.
  const math = code('systems/CameraMath.ts')
  assert.doesNotMatch(math, /marginPx/,
    'centerRange has a margin parameter again, which is how the view left the plate')
  const rig = code('systems/CameraRig.ts')
  assert.doesNotMatch(rig, /this\.hudBand/,
    'the rig has a HUD band allowance again')
  assert.doesNotMatch(rig, /setHudBand/,
    'the rig takes a HUD band again')
  assert.doesNotMatch(rig, /limits\.boundsMarginPx/,
    'the rig reads a bounds margin again')
  // Exactly two clamp calls, one per axis, each with three arguments.
  const calls = rig.match(/centerRange\([^)]*\)/g) ?? []
  assert.equal(calls.length, 2, `the rig makes ${calls.length} centre-range calls, not 2`)
  for (const c of calls) {
    assert.equal(c.split(',').length, 3, `${c} passes a fourth argument`)
  }
  const game = readFileSync(url('../src/scenes/GameScene.ts'), 'utf8')
  assert.doesNotMatch(game, /hudBandPx:/, 'GameScene hands the rig a HUD band again')
  assert.doesNotMatch(game, /boundsMarginPx:/, 'GameScene hands the rig a bounds margin again')
  assert.equal(DISPLAY.camera.boundsMarginPx, undefined,
    'boundsMarginPx is back in display.json; see its retirement note there')
})

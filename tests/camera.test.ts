import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  anchorCenter,
  centerRange,
  clampZoom,
  coverZoom,
  fitScale,
  pinchScale,
  safeScroll,
  smoothing,
  worldAt,
} from '../src/systems/CameraMath.ts'

const url = (p: string) => new URL(p, import.meta.url)
const display = JSON.parse(readFileSync(url('../src/data/display.json'), 'utf8'))
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')
/** Source with comments stripped, for rules about what the code does rather
 *  than what it says about itself. */
const code = (p: string) =>
  src(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

const W = display.width, H = display.height

test('cover zoom always fills the viewport, whatever its shape', () => {
  // Every one of these is a real device shape. At cover zoom the world must
  // reach both edges, or the player sees dead space past the map.
  for (const [vw, vh] of [[852, 393], [667, 375], [1280, 720], [390, 844], [1024, 768]]) {
    const z = coverZoom(vw, vh, W, H)
    assert.ok(W * z >= vw - 0.001, `${vw}x${vh}: world is ${W * z} wide against a ${vw} viewport`)
    assert.ok(H * z >= vh - 0.001, `${vw}x${vh}: world is ${H * z} tall against a ${vh} viewport`)
    // And it must be the *smallest* such zoom, or the floor is needlessly tight.
    const smaller = z * 0.99
    assert.ok(W * smaller < vw - 0.001 || H * smaller < vh - 0.001,
      `${vw}x${vh}: cover zoom ${z} is larger than it needs to be`)
  }
})

test('zoom is clamped between cover and the configured maximum', () => {
  const cover = coverZoom(852, 393, W, H)
  const max = display.camera.maxZoom
  assert.equal(clampZoom(0.0001, cover, max), cover, 'zooming out must stop at cover')
  assert.equal(clampZoom(9999, cover, max), max, 'zooming in must stop at the maximum')
  assert.equal(clampZoom((cover + max) / 2, cover, max), (cover + max) / 2,
    'a legal zoom passes through')
  // A viewport wide enough that cover alone exceeds the ceiling still has to
  // fill the screen: the floor wins.
  assert.equal(clampZoom(1, 4, 2.75), 4, 'a wide viewport was zoomed out past cover')
})

test('the default view shows about half the map, not all of it', () => {
  const c = display.camera
  assert.ok(c.defaultZoom > 1.3,
    `a default of ${c.defaultZoom}x cover is barely zoomed in; the whole map would be on screen`)
  assert.ok(c.defaultZoom < c.maxZoom, 'the default should leave room to zoom in')
  // On a phone in landscape, how much of the map's width is on screen.
  const cover = coverZoom(852, 393, W, H)
  const shown = 852 / (cover * c.defaultZoom) / W
  assert.ok(shown > 0.35 && shown < 0.7,
    `the default shows ${(shown * 100).toFixed(0)}% of the map's width`)
})

test('the canvas fills the viewport rather than sitting in a fixed box', () => {
  const config = src('config.ts')
  assert.match(config, /Phaser\.Scale\.RESIZE/,
    'FIT letterboxes the game into a fixed box in the middle of the screen')
  assert.doesNotMatch(config, /CENTER_BOTH/, 'centring a full-viewport canvas does nothing but confuse')
  assert.match(config, /activePointers:\s*[23-9]/, 'a pinch needs more than one pointer')

  const page = readFileSync(url('../index.html'), 'utf8')
  assert.match(page, /viewport-fit=cover/, 'Safari needs this to use the whole screen')
  assert.match(page, /user-scalable=no/, "or Safari's own pinch fights the game's")
  assert.match(page, /touch-action:\s*none/, 'or the page pans instead of the map')
})

test('the camera never hands a pan straight to the world as a tap', () => {
  const rig = src('systems/CameraRig.ts')
  assert.match(rig, /tapSlopPx/, 'no movement threshold, so every pan ends in a tap')
  assert.ok(display.camera.tapSlopPx >= 6 && display.camera.tapSlopPx <= 24,
    `a ${display.camera.tapSlopPx}px threshold is not a usable tap slop`)
  const game = src('scenes/GameScene.ts')
  assert.match(game, /this\.rig\.consumedGesture/, 'the scene never asks whether the gesture was a pan')
})

test('screen-space UI is drawn by a camera that does not move', () => {
  const game = src('scenes/GameScene.ts')
  assert.match(game, /this\.cameras\.add\(/, 'no second camera, so the UI zooms with the map')
  assert.match(game, /cameras\.main\.ignore\(/, 'the world camera should skip screen-space objects')
  assert.match(game, /asScreenSpace\(/, 'nothing is registered as screen space')
})

/* ------------------------------------------------- the two-camera split */

test('a fitted menu never crops its design box, at any device size', () => {
  // The menus are composed against 1280x720. The canvas is the viewport now,
  // so on a phone in landscape a hero card at y=282 was off the bottom of the
  // screen entirely — which read as the title being "massively zoomed in".
  for (const [vw, vh] of [[852, 393], [667, 375], [1280, 720], [390, 844], [1024, 768], [2560, 1080]]) {
    const z = fitScale(vw, vh, W, H)
    assert.ok(W * z <= vw + 0.001, `${vw}x${vh}: design is ${W * z} wide in a ${vw} viewport`)
    assert.ok(H * z <= vh + 0.001, `${vw}x${vh}: design is ${H * z} tall in a ${vh} viewport`)
    // And it must be the largest such scale, or the menu is needlessly small.
    const bigger = z * 1.01
    assert.ok(W * bigger > vw + 0.001 || H * bigger > vh + 0.001,
      `${vw}x${vh}: fit scale ${z} is smaller than it needs to be`)
  }
})

test('fit and cover are opposites, and cover is never the smaller', () => {
  for (const [vw, vh] of [[852, 393], [390, 844], [1280, 720]]) {
    assert.ok(coverZoom(vw, vh, W, H) >= fitScale(vw, vh, W, H),
      'cover fills the viewport, fit fits inside it')
  }
})

test('every menu scene uses the fixed camera and none takes a gesture', () => {
  for (const scene of ['TitleScene', 'LoadoutScene', 'CreditsScene', 'SplashScene']) {
    const body = src(`scenes/${scene}.ts`)
    assert.match(body, /fitCameraToDesign\(this\)/, `${scene} does not fit its camera to the viewport`)
    assert.doesNotMatch(body, /CameraRig/, `${scene} must not bind pan or zoom gestures`)
  }
})

test('only the game scene can pan or zoom, and it gives the gestures back', () => {
  const game = src('scenes/GameScene.ts')
  assert.match(game, /new CameraRig\(/, 'the world camera has no rig')
  assert.match(game, /shutdown[\s\S]{0,80}rig\?\.destroy\(\)/,
    'the rig must die with the run, or gestures leak onto menus')
  // The split has to be recomputed: enemies and shots are created constantly,
  // and an object born after a one-off split is drawn by both cameras.
  assert.match(game, /syncCameras\(\)/, 'no camera split')
  assert.match(game, /this\.children\.list\.length !== this\.splitAt/,
    'the split is never refreshed, so new objects render on both cameras')
})

/* --------------------------------------------------- gesture arithmetic */

test('smoothing converges at the same rate whatever the frame rate', () => {
  // The bug this guards: `v += (target - v) * 0.2` per frame is twice as fast
  // at 120Hz as at 60Hz, so the camera feels different on different phones.
  const settle = (fps: number): number => {
    let v = 0
    const dt = 1 / fps
    for (let t = 0; t < 0.5; t += dt) v += (1 - v) * smoothing(15, dt)
    return v
  }
  const a = settle(60), b = settle(120), c = settle(30)
  assert.ok(Math.abs(a - b) < 0.01, `60Hz reached ${a}, 120Hz reached ${b}`)
  assert.ok(Math.abs(a - c) < 0.02, `60Hz reached ${a}, 30Hz reached ${c}`)
  // And it must actually get there, or the camera lags behind the finger.
  assert.ok(a > 0.99, `after half a second the ease has only covered ${a}`)
})

test('smoothing never overshoots, even on a stalled frame', () => {
  for (const dt of [0, 0.008, 0.016, 0.05, 1, 10]) {
    const t = smoothing(display.camera.followLambda, dt)
    assert.ok(t >= 0 && t <= 1, `dt=${dt} gives an interpolation factor of ${t}`)
  }
})

test('pinch damping is symmetric, so open and closed feel the same', () => {
  const d = display.camera.pinchDamping
  assert.ok(d > 0 && d < 1, `a damping of ${d} does not damp anything`)
  // Spreading the fingers to 2x and squeezing them to 1/2x are the same
  // gesture in opposite directions; they must move the zoom equally.
  const open = Math.log(pinchScale(2, d))
  const shut = Math.log(pinchScale(0.5, d))
  assert.ok(Math.abs(open + shut) < 1e-9, `open ${open} vs closed ${shut}`)
  // And it must be damping, not a no-op or an amplifier.
  assert.ok(pinchScale(2, d) < 2, 'zoom should move less than the fingers do')
  assert.ok(pinchScale(2, d) > 1, 'but it still has to move')
  assert.equal(pinchScale(1, d), 1, 'fingers that have not moved must not zoom')
  assert.equal(pinchScale(0, d), 1, 'a degenerate separation must not blow up')
})

test('the camera centre is clamped so the view stays on the map', () => {
  for (const [vw, vh] of [[852, 393], [667, 375], [1280, 720]]) {
    const cover = coverZoom(vw, vh, W, H)
    for (const mult of [1, 1.4, 1.75, 2.2]) {
      const z = cover * mult
      const rx = centerRange(vw, W, z), ry = centerRange(vh, H, z)
      // At either extreme the visible rectangle must touch the edge exactly.
      assert.ok(rx.min - vw / (2 * z) >= -0.001, `${vw}x${vh} @${mult}x: left edge escapes`)
      assert.ok(rx.max + vw / (2 * z) <= W + 0.001, `${vw}x${vh} @${mult}x: right edge escapes`)
      assert.ok(ry.min - vh / (2 * z) >= -0.001, `${vw}x${vh} @${mult}x: top edge escapes`)
      assert.ok(ry.max + vh / (2 * z) <= H + 0.001, `${vw}x${vh} @${mult}x: bottom edge escapes`)
      assert.ok(rx.min <= rx.max && ry.min <= ry.max, `${vw}x${vh} @${mult}x: empty range`)
    }
    // At cover exactly, one axis is pinned to a single position.
    const at = centerRange(vw, W, cover)
    const other = centerRange(vh, H, cover)
    assert.ok(Math.abs(at.max - at.min) < 0.5 || Math.abs(other.max - other.min) < 0.5,
      `${vw}x${vh}: at cover zoom neither axis is pinned, so the view can leave the map`)
  }
})

test('the map edge is a wall, not a spring', () => {
  // Overscroll-then-correct was worse than a hard stop: a drag pulled past the
  // edge, showed the void beyond the map, and snapped back. The clamp now runs
  // on the target *and* on the interpolated position, so no frame can ever
  // render past the edge and there is nothing to correct.
  const rig = code('systems/CameraRig.ts')
  assert.doesNotMatch(rig, /rubberBand/, 'the camera can still be pulled past the map edge')
  assert.doesNotMatch(rig, /edgeSlack/, 'there is still an overscroll allowance')
  assert.equal(display.camera.edgeSlackPx, undefined, 'the overscroll setting is still in the data')

  const math = code('systems/CameraMath.ts')
  assert.doesNotMatch(math, /rubberBand/, 'the rubber band is still there to be used again')

  // Both writes are clamped: the target, and the eased position written to the
  // camera. Clamping only the target still lets the ease overshoot on a frame.
  const update = rig.slice(rig.indexOf('update(dt: number)'), rig.indexOf('private find('))
  const clamps = update.match(/Math\.min\(Math\.max\(/g) ?? []
  assert.ok(clamps.length >= 4,
    `only ${clamps.length} clamped values in the frame step; target and position both need clamping on both axes`)
})

test('anchoring is the exact inverse of the world lookup', () => {
  // This pair is what keeps the map still under a pinch. If they ever disagree
  // the map slides out from under the fingers.
  for (const [view, zoom, screen, center] of [
    [852, 0.9, 210, 500], [852, 1.4, 640, 300], [393, 2.0, 12, 400], [1280, 1.0, 1279, 640],
  ]) {
    const w = worldAt(screen, center, view, zoom)
    assert.ok(Math.abs(anchorCenter(w, screen, view, zoom) - center) < 1e-9,
      `view=${view} zoom=${zoom}: anchoring a point back gave the wrong centre`)
  }
  // Zooming about a point must leave that point where it was.
  const view = 852, from = 1.0, to = 1.6, screen = 300, center = 500
  const w = worldAt(screen, center, view, from)
  const moved = anchorCenter(w, screen, view, to)
  assert.ok(Math.abs(worldAt(screen, moved, view, to) - w) < 1e-9,
    'the point under the fingers moved when the zoom changed')
})

test('the rig tracks its own pointers rather than asking Phaser for a second one', () => {
  // Comments stripped: this file *documents* the old bug, and the point is
  // that the code no longer does it.
  const rig = code('systems/CameraRig.ts')
  // The old bug: at pointerdown the second finger *is* input.pointer2, so the
  // distance between "the two fingers" was zero and the pinch never armed.
  assert.doesNotMatch(rig, /input\.pointer2/,
    'pointer2 at pointerdown is the finger going down, so the pinch measures itself')
  assert.match(rig, /pointers\.length === 2/, 'the mode is not derived from how many fingers are down')
  assert.match(rig, /beginPinch\(\)/, 'no distinct pinch state')
})

test('nothing writes to the camera from an input handler', () => {
  // Every jump the old rig had came from a handler setting cam.scrollX from a
  // delta against a stale origin. Handlers move targets; one place eases.
  const rig = code('systems/CameraRig.ts')
  // Just the input handlers. `onResize` is excluded on purpose: a rotate is
  // already a discontinuity, and easing into the new cover zoom would show
  // dead space past the map for the length of the ease.
  const from = rig.indexOf('private onDown =')
  const to = rig.indexOf('private onResize =')
  assert.ok(from > 0 && to > from, 'the handler block moved; this test is now checking nothing')
  const body = rig.slice(from, to)
  assert.doesNotMatch(body, /cam\.scrollX\s*=/, 'a handler moves the camera directly')
  assert.doesNotMatch(body, /cam\.setZoom\(/, 'a handler zooms the camera directly')
  assert.match(rig, /update\(dt: number\)/, 'the rig has no per-frame ease')
  const game = src('scenes/GameScene.ts')
  // On real time, not the scaled game clock: the camera is feel, not
  // simulation, and easing it 40% faster reads as twitchy rather than brisk.
  assert.match(game, /this\.rig\.update\(real\)/,
    'the scene never ticks the rig on real time, so nothing eases or it eases at game speed')
})

test('the rig owns its clamp instead of handing it to Phaser', () => {
  // Phaser's own bounds clamp runs in preRender and would flatten the rubber
  // band back into a hard stop.
  const rig = code('systems/CameraRig.ts')
  assert.doesNotMatch(rig, /setBounds\(/, 'Phaser bounds fight the rig for the edge behaviour')
  assert.match(rig, /centerRange\(/, 'nothing clamps the camera centre')
})

test('pan is slower than the finger and the glide actually decays', () => {
  const c = display.camera
  assert.ok(c.panSpeed > 0.5 && c.panSpeed < 1,
    `a pan speed of ${c.panSpeed} is either twitchy (>=1) or sluggish (<0.5)`)
  assert.ok(c.momentumDecay > 0 && c.momentumDecay < 0.2,
    `${c.momentumDecay} of the velocity surviving a second is not a glide, it is drift`)
  assert.ok(c.momentumMinSpeed > 0, 'without a cutoff the glide never quite stops')
  // A glide should travel a useful distance but not across the whole map.
  const v0 = 900
  const glide = v0 * (1 / -Math.log(c.momentumDecay))
  assert.ok(glide > 60 && glide < 400,
    `a 900px/s flick glides ${glide.toFixed(0)}px, which is ${glide < 60 ? 'not worth having' : 'a launch'}`)
})

test('rounding the scroll never pushes the view past the map edge', () => {
  // roundPixels renders the camera at a whole-pixel scroll, so clamping the
  // centre as a float is not enough on its own: at the edge, rounding exposed
  // a one-pixel sliver of the void beyond the map.
  for (const [min, max] of [[0, 500], [-3.4, 212.7], [214, 214], [213.7, 213.7], [-0.5, 0.5]]) {
    for (const v of [min - 40, min - 0.4, (min + max) / 2, max + 0.4, max + 40]) {
      const got = safeScroll(v, min, max)
      assert.equal(got, Math.round(got), `safeScroll returned ${got}, which is not a whole pixel`)
      if (Math.ceil(min) <= Math.floor(max)) {
        assert.ok(got >= min - 1e-6 && got <= max + 1e-6,
          `safeScroll(${v}, ${min}, ${max}) gave ${got}, outside the legal range`)
      } else {
        // Narrower than a pixel: the best available answer is within half of it.
        assert.ok(Math.abs(got - (min + max) / 2) <= 0.5 + 1e-6,
          `safeScroll(${v}, ${min}, ${max}) gave ${got}, more than half a pixel out`)
      }
    }
  }
})

/* --------------------------------------------- how big things actually are */

/**
 * The zoom is chosen for a size on the glass, not for a feel.
 *
 * The art is drawn at 470-512px and was rendering at 60-87, a five- to
 * eight-fold reduction that turned the detail to mush. Kingdom Rush, which is
 * the reference, sits much closer to its board. These check that the number in
 * display.json still produces the sizes it was picked for, so neither a zoom
 * tweak nor a re-measure of the art can quietly undo it.
 */
const RENDER = JSON.parse(
  readFileSync(new URL('../src/data/art.json', import.meta.url), 'utf8'),
).render as Record<string, { displayHeight?: number }>

const onScreen = (key: string, zoom: number): number =>
  (RENDER[key]?.displayHeight ?? 0) * zoom

const ART_JSON = JSON.parse(
  readFileSync(new URL('../src/data/art.json', import.meta.url), 'utf8'),
) as { towerTiers?: Record<string, string[]> }

test('a tower fills the share of the screen the art was drawn for', () => {
  // Tier 1 only. A tower with tier art is deliberately taller as it upgrades —
  // that growth is the primary read on an upgrade — so holding every tier to
  // one height would forbid the thing the art exists to do. The tiers are
  // checked separately below.
  const upperTiers = new Set(
    Object.values(ART_JSON.towerTiers ?? {}).flatMap((set) => set.slice(1)),
  )
  const z = display.camera.defaultZoom
  for (const key of Object.keys(RENDER).filter((k) => k.startsWith('turret-'))) {
    if (upperTiers.has(key)) continue
    const h = onScreen(key, z)
    assert.ok(h >= 140 && h <= 160,
      `${key} renders ${h.toFixed(0)}px tall at the default zoom; the target is 140-160`)
  }
})

test('an upgraded tower is visibly bigger, and not so big it leaves the board', () => {
  const z = display.camera.defaultZoom
  for (const [base, set] of Object.entries(ART_JSON.towerTiers ?? {})) {
    const heights = set.map((k) => onScreen(k, z))
    for (let i = 1; i < heights.length; i++) {
      const grew = heights[i]! / heights[i - 1]!
      assert.ok(grew > 1.1,
        `${base} tier ${i + 1} is only ${((grew - 1) * 100).toFixed(0)}% taller than tier ${i}; ` +
        'the silhouette is meant to be the primary read on an upgrade')
      assert.ok(grew < 1.45,
        `${base} tier ${i + 1} is ${grew.toFixed(2)}x tier ${i}; that is a different building`)
    }
    // A fully upgraded tower still has to sit on a phone screen beside the
    // lane it is defending.
    const tallest = heights[heights.length - 1]!
    assert.ok(tallest <= 260,
      `${base} at its top tier renders ${tallest.toFixed(0)}px tall; that is most of a phone`)
  }
})

test('the hero is the size he was drawn to be', () => {
  // Raised 25% deliberately: at ~100 he was 0.70 of a tower and read as a
  // figurine standing next to the buildings he defends.
  const h = onScreen('hero-cory', display.camera.defaultZoom)
  assert.ok(h >= 118 && h <= 138, `the hero renders ${h.toFixed(0)}px tall; the target is about 130`)
})

test('the zoom range brackets the default rather than the viewport', () => {
  const z = display.camera.defaultZoom
  const max = display.camera.maxZoom
  assert.ok(max / z >= 1.45 && max / z <= 1.75,
    `the ceiling is ${(max / z).toFixed(2)}x the default; about 1.6x was the intent`)
  // And zooming all the way out still fills the screen, at every viewport.
  const sizes: Array<[number, number]> = [[568, 320], [844, 390], [1080, 810], [1440, 900]]
  for (const [vw, vh] of sizes) {
    const cover = coverZoom(vw, vh, W, H)
    assert.equal(clampZoom(0, cover, max), cover,
      `${vw}x${vh}: zooming out does not stop where the map stops filling the screen`)
    assert.ok(clampZoom(z, cover, max) >= cover,
      `${vw}x${vh}: the default zoom shows background past the edge of the map`)
  }
})

test('the interface does not zoom with the board', () => {
  // The HUD is its own scene and GameScene's chrome is on a second camera;
  // neither is ever handed to the rig, so pinching in cannot make the buttons
  // grow. The rig may only touch cameras.main.
  const rig = readFileSync(new URL('../src/systems/CameraRig.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(rig, /uiCam|cameras\.getCamera/,
    'the camera rig can reach a camera that is not the world camera')
  const game = readFileSync(new URL('../src/scenes/GameScene.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(game, /uiCam\.setZoom|uiCam\.zoom =/,
    'the UI camera is being zoomed')
  // Anything the player presses inside GameScene is registered as screen space,
  // which is what puts it on the fixed camera.
  assert.match(game, /asScreenSpace\(this\.cancelBtn\.parts\)/,
    'the cancel button is a world object and would grow with the zoom')
  assert.match(game, /asScreenSpace\(this\.menu\.objects\)/,
    'the build menu is a world object and would grow with the zoom')
})

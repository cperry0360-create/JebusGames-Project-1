import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  boardBounds, clampZoom, coverZoom, openingView, zoomToFit,
} from '../src/systems/CameraMath.ts'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const map = read('map'), display = read('display')
const W = display.width, H = display.height
const C = display.camera

const BOARD = () => boardBounds(
  map.waypoints, map.buildSpots, map.roadWidth, map.spotRadius, W, H, C.openingMargin)

// The two phone viewports the game claims to support, at both device ratios.
// The rig's numbers are DEVICE pixels per world unit, so the canvas size is
// the CSS viewport times the ratio, capped at 3 exactly as Resolution does.
const CASES: Array<[string, number, number, number]> = []
for (const [w, h] of [[844, 390], [568, 320]]) {
  for (const dpr of [1, 3]) CASES.push([`${w}x${h} dpr${dpr}`, w! * dpr, h! * dpr, dpr])
}

test('the board box covers the whole lane and every pad', () => {
  const b = BOARD()
  for (const [x, y] of map.waypoints as number[][]) {
    // Waypoints run off both ends on purpose; only the painted part counts.
    if (x! < 0 || x! > W) continue
    assert.ok(x! >= b.x - 0.001 && x! <= b.x + b.width + 0.001, `waypoint x ${x} is outside`)
    assert.ok(y! >= b.y - 0.001 && y! <= b.y + b.height + 0.001, `waypoint y ${y} is outside`)
  }
  for (const [x, y] of map.buildSpots as number[][]) {
    assert.ok(x! - map.spotRadius >= b.x - 0.001 && x! + map.spotRadius <= b.x + b.width + 0.001,
      `the pad at ${x},${y} is not framed`)
    assert.ok(y! - map.spotRadius >= b.y - 0.001 && y! + map.spotRadius <= b.y + b.height + 0.001,
      `the pad at ${x},${y} is not framed`)
  }
})

test('the board box never leaves the plate', () => {
  // There is nothing painted outside it, so framing it would be framing void.
  const b = BOARD()
  assert.ok(b.x >= 0 && b.y >= 0)
  assert.ok(b.x + b.width <= W && b.y + b.height <= H)
})

test('the opening is in the same space as the ceiling', () => {
  /*
   * THE FIFTH ISSUE IN THIS CLASS would be an opening zoom computed in CSS
   * pixels and compared against a ceiling in device pixels — three times too
   * far out on a retina phone, and it would look like a deliberate choice.
   *
   * The check that catches it: the same CSS viewport at dpr 1 and dpr 3 must
   * show the SAME world rectangle. A space error makes them differ by exactly
   * the ratio.
   */
  const b = BOARD()
  const seen = (vw: number, vh: number, dpr: number) => {
    const o = openingView(vw, vh, b,
      coverZoom(vw, vh, W, H), C.maxZoom * dpr)
    return { w: vw / o.zoom, h: vh / o.zoom, x: o.x, y: o.y }
  }
  for (const [w, h] of [[844, 390], [568, 320]]) {
    const one = seen(w!, h!, 1)
    const three = seen(w! * 3, h! * 3, 3)
    assert.ok(Math.abs(one.w - three.w) < 0.001 && Math.abs(one.h - three.h) < 0.001,
      `${w}x${h}: dpr 1 sees ${one.w.toFixed(1)}x${one.h.toFixed(1)} world px and ` +
      `dpr 3 sees ${three.w.toFixed(1)}x${three.h.toFixed(1)}`)
    assert.deepEqual([one.x, one.y], [three.x, three.y])
  }
})

test('the opening never breaches the band it is clamped into', () => {
  const b = BOARD()
  for (const [name, vw, vh, dpr] of CASES) {
    const cover = coverZoom(vw, vh, W, H)
    const max = C.maxZoom * dpr
    const min = C.minZoom * dpr
    const o = openingView(vw, vh, b, cover, max)
    assert.ok(o.zoom <= max + 1e-9, `${name}: opening ${o.zoom} is above the ceiling ${max}`)
    // Cover, not the design minimum: the opening deliberately sits below the
    // pinch floor, because on this map the pinch floor is above the zoom that
    // frames the board. Going below COVER would show background.
    assert.ok(o.zoom >= cover - 1e-9,
      `${name}: opening ${o.zoom} is below cover ${cover}, so the map does not fill the screen`)
    void min
    assert.equal(o.zoom, clampZoom(zoomToFit(vw, vh, b), cover, max))
  }
})

test('the opening is wider than the design zoom on every phone', () => {
  // The whole point. If this ever comes back equal, the opening has silently
  // gone back to being the default.
  const b = BOARD()
  for (const [name, vw, vh, dpr] of CASES) {
    const o = openingView(vw, vh, b,
      coverZoom(vw, vh, W, H), C.maxZoom * dpr)
    assert.ok(o.zoom < C.defaultZoom * dpr,
      `${name}: the run opens at ${o.zoom.toFixed(3)}, which is no wider than ` +
      `the design zoom ${(C.defaultZoom * dpr).toFixed(3)}`)
  }
})

test('the opening frames the whole lane end to end, or says it cannot', () => {
  // `framesWholeBox` is false when the design floor is above the fit zoom,
  // which is the case on a phone. It is reported rather than worked around:
  // the band is not this function's to widen.
  const b = BOARD()
  for (const [name, vw, vh, dpr] of CASES) {
    const o = openingView(vw, vh, b,
      coverZoom(vw, vh, W, H), C.maxZoom * dpr)
    const seenW = vw / o.zoom
    if (o.framesWholeBox) {
      assert.ok(seenW >= b.width - 0.001, `${name} claims to frame the box but shows less`)
    } else {
      assert.ok(seenW < b.width, `${name} says it cannot frame the box but does`)
      // Even when it cannot, it must show most of it. Half a lane is no
      // better than the close default this replaces.
      assert.ok(seenW / b.width > 0.55,
        `${name}: the opening shows only ${(100 * seenW / b.width).toFixed(0)}% of the board`)
    }
  }
})

test('a viewport wide enough gets the whole board, not the floor', () => {
  // The general case, since no phone exercises it: a desktop window where the
  // fit zoom sits inside the band should be used as-is.
  const b = BOARD()
  // A box narrower than the plate, so the fit zoom sits above cover and is
  // used as-is. No phone reaches this branch on level one, where the board
  // spans the plate's whole width and cover is therefore the answer.
  const small = { x: 400, y: 200, width: 400, height: 200 }
  const o = openingView(2400, 1400, small, coverZoom(2400, 1400, W, H), 6)
  assert.ok(o.framesWholeBox, 'a small box inside a big window should be framed whole')
  assert.ok(2400 / o.zoom >= small.width - 0.001)
  void b
})

test('the camera is centred on the board, not on the hero', () => {
  const b = BOARD()
  const o = openingView(2532, 1170, b, coverZoom(2532, 1170, W, H), 7.11)
  assert.equal(o.x, b.x + b.width / 2)
  assert.equal(o.y, b.y + b.height / 2)
  assert.notEqual(Math.round(o.x), Math.round(map.heroStart[0]))
})

test('nothing in the rig follows anything', () => {
  // Stated as a rule because the opening frame is only worth setting if it
  // survives the first second. Every write to the camera's target centre is a
  // gesture, a clamp, or the constructor — there is no follow target, and the
  // empty-grass wave screenshots were the camera sitting still while the hero
  // walked away.
  const rig = readFileSync(url('../src/systems/CameraRig.ts'), 'utf8')
  assert.doesNotMatch(rig, /startFollow|setFollow|followTarget|follow\(/,
    'the rig has grown a follow; the opening frame will not survive it')
})

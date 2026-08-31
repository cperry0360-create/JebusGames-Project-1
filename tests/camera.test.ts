import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { clampZoom, coverZoom } from '../src/systems/CameraMath.ts'

const url = (p: string) => new URL(p, import.meta.url)
const display = JSON.parse(readFileSync(url('../src/data/display.json'), 'utf8'))
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')

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
  assert.equal(clampZoom(9999, cover, max), cover * max, 'zooming in must stop at the maximum')
  assert.equal(clampZoom(cover * 1.5, cover, max), cover * 1.5, 'a legal zoom passes through')
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

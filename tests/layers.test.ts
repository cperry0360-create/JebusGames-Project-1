import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  bandsAscending, cameraAcceptsGestures, drawsUnder, hudInteractive, LAYER, SCENE_ORDER,
} from '../src/systems/Layers.ts'

const url = (p: string) => new URL(p, import.meta.url)
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')

test('the layer bands are ordered and far enough apart to offset inside', () => {
  const bands = bandsAscending()
  for (let i = 1; i < bands.length; i++) {
    const [prevName, prev] = bands[i - 1]!
    const [name, cur] = bands[i]!
    assert.ok(cur > prev, `${name} is not above ${prevName}`)
  }
  // The world band holds y-sorted entities, which reach roughly 2000. Every
  // other gap has to leave room for an overlay to offset within its own band
  // without reaching the next one.
  assert.ok(LAYER.worldOverlay - LAYER.world >= 50_000,
    'the world band is too narrow for y-sorted entities plus their bias')
  for (let i = 2; i < bands.length; i++) {
    const gap = bands[i]![1] - bands[i - 1]![1]
    assert.ok(gap >= 40_000, `${bands[i]![0]} is only ${gap} above ${bands[i - 1]![0]}`)
  }
})

test('a modal covers the board and the crash panel covers the modal', () => {
  assert.ok(LAYER.modalDim > LAYER.panel, 'a modal must cover the anchored panels')
  assert.ok(LAYER.modal > LAYER.modalDim, "a modal must draw above its own blocker")
  assert.ok(LAYER.crash > LAYER.modal,
    'the crash panel must cover a modal; if it is showing, something already went wrong')
})

test('the scene order matches the order the game actually registers them', () => {
  // Depth cannot cross a scene boundary, so this order is load-bearing: the
  // ability bar drew over the results dialog purely because HudScene renders
  // after GameScene, and no depth GameScene asked for could beat it.
  const config = src('config.ts')
  const listed = config.slice(config.indexOf('scene: ['), config.indexOf(']', config.indexOf('scene: [')))
  const found = [...listed.matchAll(/(\w+)Scene/g)].map((m) => m[1])
  assert.deepEqual(found, [...SCENE_ORDER],
    'Layers.SCENE_ORDER no longer matches the scene list in config.ts')
  assert.ok(drawsUnder('Game', 'Hud'), 'the HUD must draw over the world')
  assert.ok(!drawsUnder('Hud', 'Game'))
})

test('a world modal stands the whole HUD down, drawn and interactive together', () => {
  // The rule, and then the proof that HudScene routes through it. The old
  // code dimmed the HUD camera to 30% alpha, which left every icon drawn over
  // the results panel AND still tappable — a modal the player can act around.
  assert.equal(hudInteractive(true), false)
  assert.equal(hudInteractive(false), true)

  const hud = src('scenes/HudScene.ts')
  assert.match(hud, /hudInteractive\(this\.world\.modalOpen\)/,
    'HudScene decides its own visibility instead of asking Layers')

  // Visibility and interactivity must come off the same value. Anything that
  // hides the HUD without disabling it recreates the bug.
  const block = hud.slice(hud.indexOf('const live = hudInteractive'))
  const body = block.slice(0, block.indexOf('if (!live) return'))
  assert.match(body, /setVisible\(live\)/, 'the HUD camera is not hidden by the same value')
  assert.match(body, /input\.enabled = live/, 'the HUD input is not disabled by the same value')
  assert.ok(!/setAlpha\(\s*this\.world\.modalOpen/.test(hud),
    'the HUD is still being dimmed rather than stood down')
})

test('a world modal takes the camera gestures with it', () => {
  // The scratch card leaked drags to the camera because the rig listens at the
  // scene level: an interactive object on top of the board does not stop it
  // hearing a drag. Gating the rig from one question is the fix; asking each
  // overlay to remember was what failed.
  assert.equal(cameraAcceptsGestures(true), false)
  assert.equal(cameraAcceptsGestures(false), true)

  const game = src('scenes/GameScene.ts')
  assert.match(game, /setEnabled\(cameraAcceptsGestures\(this\.modalOpen\)\)/,
    'the camera rig is not gated centrally on modalOpen')
})

test('every modal overlay is named in modalOpen', () => {
  // The list that everything else asks. It named only `dialog`, so a scratch
  // card left the camera live and the whole HUD with it.
  const game = src('scenes/GameScene.ts')
  const body = game.slice(game.indexOf('get modalOpen()'))
  const decl = body.slice(0, body.indexOf('\n  }'))

  for (const field of ['dialog', 'ticket']) {
    assert.match(decl, new RegExp(`this\\.${field}\\?\\.active`),
      `modalOpen does not include ${field}, so it will not stand the HUD down`)
  }

  // And the deliberately non-modal ones stay out: both are anchored panels
  // that leave the board playable behind them on purpose.
  for (const field of ['menu', 'panel']) {
    assert.ok(!decl.includes(`this.${field}`),
      `${field} is a non-modal panel and must not freeze the HUD`)
  }
})

test('no overlay hardcodes a depth outside the table', () => {
  // Every magic depth in the game was a decision made at a call site with no
  // view of the others. Anything above the world band now has to come from
  // LAYER, so the order is decided in one place.
  const files = ['scenes/GameScene.ts', 'ui/BuildMenu.ts', 'ui/ScratchCard.ts', 'ui/Dialog.ts']
  for (const f of files) {
    const body = src(f)
    for (const m of body.matchAll(/setDepth\(\s*(\d{4,})\s*\)/g)) {
      assert.fail(`${f} hardcodes depth ${m[1]}; use LAYER from systems/Layers.ts`)
    }
    for (const m of body.matchAll(/=\s*(\d{5,})\s*$/gm)) {
      assert.fail(`${f} declares a bare depth constant ${m[1]}; use LAYER`)
    }
  }
})

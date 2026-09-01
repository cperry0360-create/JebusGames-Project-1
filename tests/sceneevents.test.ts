import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { onSceneEvent, sceneIsLive } from '../src/systems/SceneEvents.ts'
import { clampZoom } from '../src/systems/CameraMath.ts'

const url = (p: string) => new URL(p, import.meta.url)
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')

/**
 * Source with its comments removed.
 *
 * These assertions are about what the code does, and the comments explaining
 * the bug quote the old broken line verbatim — so a raw text search finds the
 * prose describing the fix and reports it as the fault.
 */
const code = (p: string): string =>
  src(p).replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n')

/** The smallest thing with Phaser's on/off/once shape. */
function emitter() {
  const handlers = new Map<string, Array<{ fn: (...a: never[]) => void; ctx?: unknown; once?: boolean }>>()
  return {
    handlers,
    count: (event: string): number => handlers.get(event)?.length ?? 0,
    on(event: string, fn: (...a: never[]) => void, ctx?: unknown) {
      if (!handlers.has(event)) handlers.set(event, [])
      handlers.get(event)!.push({ fn, ctx })
      return this
    },
    once(event: string, fn: (...a: never[]) => void, ctx?: unknown) {
      if (!handlers.has(event)) handlers.set(event, [])
      handlers.get(event)!.push({ fn, ctx, once: true })
      return this
    },
    off(event: string, fn?: (...a: never[]) => void, ctx?: unknown) {
      const list = handlers.get(event) ?? []
      handlers.set(event, list.filter((h) => !(h.fn === fn && (ctx === undefined || h.ctx === ctx))))
      return this
    },
    emit(event: string, ...args: never[]) {
      for (const h of [...(handlers.get(event) ?? [])]) {
        if (h.once) this.off(event, h.fn, h.ctx)
        h.fn(...args)
      }
    },
  }
}

/** A scene that can be torn down the way Phaser tears one down. */
function fakeScene() {
  const events = emitter()
  const scene = {
    events,
    sys: { settings: { status: 5 } },   // Phaser.Scenes.RUNNING
    cameras: { main: { setViewport: () => {}, zoom: 1.72 } } as unknown,
  }
  /** Phaser's order, which is what makes the crash the shape it is: the status
   *  flips, `shutdown` is emitted, and only then does CameraManager.shutdown()
   *  set `main` to undefined — leaving `cameras` itself in place. A handler
   *  that reads `cameras.main.anything` in that state is the reported crash. */
  const tearDown = (event: string, status: number) => {
    scene.sys.settings.status = status
    events.emit(event)
    ;(scene.cameras as { main: unknown }).main = undefined
  }
  return {
    scene,
    shutdown: () => tearDown('shutdown', 8),   // Phaser.Scenes.SHUTDOWN
    destroy: () => tearDown('destroy', 9),     // Phaser.Scenes.DESTROYED
  }
}

test('a resize after the scene shuts down does not reach it, and does not throw', () => {
  // The reported crash, as a test.
  //
  //   TypeError: undefined is not an object (evaluating 'this.cameras.main.setViewport')
  //   in applyBands, 30s after the Game scene was destroyed
  //
  // The ScaleManager belongs to the GAME and outlives every scene. GameScene
  // registered an anonymous arrow on it and never removed it, so the emitter
  // went on holding a closure over a dead scene — and backgrounding the app
  // makes Phaser call ScaleManager.refresh(), which emits resize into every
  // listener it has.
  const scale = emitter()
  const s = fakeScene()
  let calls = 0

  // Exactly what GameScene does now.
  onSceneEvent(s.scene as never, scale as never, 'resize', () => {
    if (!sceneIsLive(s.scene as never)) return
    calls++
    ;(s.scene.cameras as { main: { setViewport: () => void } }).main.setViewport()
  })

  scale.emit('resize')
  assert.equal(calls, 1, 'a live scene should still get its resize')
  assert.equal(scale.count('resize'), 1)

  s.shutdown()
  assert.equal(scale.count('resize'), 0, 'the listener outlived the scene that made it')

  // The crash, reproduced: fire it anyway.
  assert.doesNotThrow(() => scale.emit('resize'))
  assert.equal(calls, 1, 'a dead scene must not run its handler again')
})

test('the same holds when the scene is destroyed rather than stopped', () => {
  // A scene that is stopped gets SHUTDOWN; one removed outright gets DESTROY.
  // A cleanup written for only one of them leaks on the other path, which is
  // why both are registered.
  const scale = emitter()
  const s = fakeScene()
  let calls = 0
  onSceneEvent(s.scene as never, scale as never, 'resize', () => { calls++ })

  s.destroy()
  assert.equal(scale.count('resize'), 0, 'DESTROY did not remove the listener')
  assert.doesNotThrow(() => scale.emit('resize'))
  assert.equal(calls, 0)
})

test('the handler survives one more delivery even after unregistering', () => {
  // Unregistering is not enough on its own: an event already queued when the
  // scene stopped can still arrive. The guard is the second line of defence
  // and has to hold with the cameras already gone.
  const s = fakeScene()
  assert.equal(sceneIsLive(s.scene as never), true)
  s.shutdown()
  assert.equal(sceneIsLive(s.scene as never), false, 'a torn-down scene reports itself live')

  // And with each piece missing individually.
  const running = { settings: { status: 5 } }   // Phaser.Scenes.RUNNING
  assert.equal(sceneIsLive({ sys: running } as never), false, 'no cameras')
  assert.equal(
    sceneIsLive({ sys: running, cameras: {} } as never), false, 'cameras with no main',
  )
  assert.equal(sceneIsLive({} as never), false, 'no sys at all')

  // A scene whose status says it is going away is dead even while its camera
  // manager is still standing — SHUTDOWN fires before the cameras are torn
  // down, and a handler that runs in that window is the same bug one tick
  // earlier.
  const live = { sys: running, cameras: { main: {} } }
  assert.equal(sceneIsLive(live as never), true, 'a running scene with a camera')
  assert.equal(
    sceneIsLive({ ...live, sys: { settings: { status: 8 } } } as never), false,
    'SHUTDOWN with the camera still present',
  )
  assert.equal(
    sceneIsLive({ ...live, sys: { settings: { status: 9 } } } as never), false,
    'DESTROYED with the camera still present',
  )
  // A scene that is merely paused (backgrounded) is still live: it has to keep
  // taking resizes or it comes back with the wrong viewport.
  assert.equal(
    sceneIsLive({ ...live, sys: { settings: { status: 6 } } } as never), true,
    'a paused scene should still take resizes',
  )
})

test('the listener does not accumulate run over run', () => {
  // The leak was one listener per run, for the life of the session.
  const scale = emitter()
  for (let run = 0; run < 5; run++) {
    const s = fakeScene()
    onSceneEvent(s.scene as never, scale as never, 'resize', () => {})
    assert.equal(scale.count('resize'), 1, `run ${run + 1} did not start from one listener`)
    s.shutdown()
    assert.equal(scale.count('resize'), 0, `run ${run + 1} left a listener behind`)
  }
})

test('reinstating the old registration shows the test can fail', () => {
  // The bug, put back: `.on` with no cleanup. If this did not accumulate, the
  // four tests above would be proving nothing.
  const scale = emitter()
  for (let run = 0; run < 3; run++) {
    const s = fakeScene()
    scale.on('resize', () => {
      ;(s.scene.cameras as { main: { setViewport: () => void } }).main.setViewport()
    })
    s.shutdown()
  }
  assert.equal(scale.count('resize'), 3, 'the old pattern should leak one per run')
  assert.throws(() => scale.emit('resize'), TypeError,
    'the old pattern should throw on a dead scene, which is the reported crash')
})

test('GameScene registers its resize through the scene, not on the ScaleManager', () => {
  const game = code('scenes/GameScene.ts')
  assert.match(game, /onSceneResize\(this,/,
    'GameScene does not use the self-cleaning registration')
  assert.ok(!/this\.scale\.on\(/.test(game),
    'GameScene still subscribes to the game-wide ScaleManager directly')
  // And applyBands guards itself.
  const fn = game.slice(game.indexOf('private applyBands()'))
  const body = fn.slice(0, fn.indexOf('\n  }'))
  assert.match(body, /if \(!sceneIsLive\(this\)\) return/,
    'applyBands will still throw on a torn-down scene')
})

test('every scene that touches a game-owned emitter cleans up after itself', () => {
  // The rule, enforced. Scene-owned emitters — this.input, this.time,
  // this.tweens, this.events — are torn down by Phaser with the scene and need
  // nothing. `this.scale` is the game's, and is the one that leaks.
  for (const file of [
    'scenes/GameScene.ts', 'scenes/HudScene.ts', 'scenes/TitleScene.ts',
    'scenes/SplashScene.ts', 'scenes/CreditsScene.ts', 'scenes/LoadoutScene.ts',
    'scenes/DiagnosticsScene.ts', 'scenes/BootScene.ts',
  ]) {
    const body = code(file)
    const subs = [...body.matchAll(/this\.scale\.on\(/g)].length
    const offs = [...body.matchAll(/this\.scale\.off\(/g)].length
    assert.ok(subs === 0 || offs >= subs,
      `${file} subscribes to the ScaleManager ${subs}x and unsubscribes ${offs}x`)
    assert.ok(!/window\.addEventListener|document\.addEventListener/.test(body),
      `${file} adds a window listener; those belong in a once-at-boot installer`)
  }
})

test('camera zoom cannot reach 0 in play, so 0 in a report means "gone"', () => {
  // Asked as its own question, and answered by the clamp rather than by
  // reasoning about it. The floor is cover zoom, and the ceiling is raised to
  // the floor, so the only way out is 0 is to ask for 0 with a zero-sized
  // viewport — and nothing asks for 0.
  const display = JSON.parse(src('data/display.json'))
  const maxZoom = display.camera.maxZoom as number
  const requests = [display.camera.defaultZoom, 0.1, 1, 2, 5, 100, -3, 0]
  const covers = [0.5, 1, 1.72, 3, 0.0001, 0]
  for (const cover of covers) {
    for (const requested of requests) {
      const z = clampZoom(requested, cover, maxZoom)
      if (requested > 0 || cover > 0) {
        assert.ok(z > 0,
          `clampZoom(${requested}, ${cover}, ${maxZoom}) = ${z}; zoom must never be 0 in play`)
      }
    }
  }
  // The one input that does produce 0 is asking for 0 with no viewport at all,
  // and nothing in the rig ever asks for 0: the target starts at defaultZoom.
  assert.equal(clampZoom(0, 0, maxZoom), 0)
  assert.ok(display.camera.defaultZoom > 0)

  // So the report must not spell "torn down" as 0.
  const game = code('scenes/GameScene.ts')
  assert.ok(!/zoom: Number\(\(this\.cameras\?\.main\?\.zoom \?\? 0\)/.test(game),
    'the crash report still reports a missing camera as zoom 0')
  assert.match(game, /zoom: this\.cameras\?\.main[\s\S]{0,160}unavailable/,
    'the crash report does not distinguish a torn-down camera from a real zoom')
})

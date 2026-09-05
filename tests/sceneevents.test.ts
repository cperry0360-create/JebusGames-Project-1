import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
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

test('nothing in src subscribes to a game-owned emitter by hand', () => {
  // The pattern guard. The crash was not "GameScene got this wrong", it was
  // "a scene can subscribe to something that outlives it and nothing notices".
  // Fixing the one site leaves the next one free to reappear, so this walks
  // the whole tree.
  //
  // `scale` is the ScaleManager and `game.events` is the game's emitter; both
  // belong to the GAME. A scene's own `this.events`, `this.input`, `this.time`
  // and `this.tweens` are torn down by Phaser with the scene and are fine.
  const walk = (dir: string): string[] =>
    readdirSync(url(`../src/${dir}`), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${dir}/${e.name}`)
        : e.name.endsWith('.ts') ? [`${dir}/${e.name}`] : [])

  const offenders: string[] = []
  for (const file of walk('.')) {
    if (file.endsWith('SceneEvents.ts')) continue   // the helper itself
    for (const [i, line] of code(file).split('\n').entries()) {
      if (/\bscale\.on\(/.test(line)) offenders.push(`${file}:${i + 1} ${line.trim()}`)
    }
  }
  assert.deepEqual(offenders, [],
    'subscribe through onSceneResize/onSceneEvent so it unregisters with the scene')
})

test('every resize handler that reads a camera guards itself', () => {
  // Unregistering is necessary but not sufficient: an event already queued
  // when the scene stopped still arrives.
  for (const [file, needle] of [
    ['scenes/GameScene.ts', /onSceneResize\(this, \(\) => \{\s*if \(!sceneIsLive\(this\)\) return/],
    ['scenes/HudScene.ts', /onSceneResize\(this, \(\) => \{ if \(sceneIsLive\(this\)\)/],
    ['ui/FitCamera.ts', /onSceneResize\(scene, \(\) => \{ if \(sceneIsLive\(scene\)\)/],
  ] as const) {
    assert.match(code(file), needle, `${file} takes resizes without checking the scene is alive`)
  }
  // CameraRig guards inside the handler, which is a bound field.
  const rig = code('systems/CameraRig.ts')
  assert.match(rig, /onSceneResize\(scene, this\.onResize\)/)
  const fn = rig.slice(rig.indexOf('private onResize'))
  assert.match(fn.slice(0, fn.indexOf('\n  }')), /if \(!sceneIsLive\(this\.scene\)\) return/,
    'CameraRig.onResize does not check the scene is alive')
})

/* ------------------------------------------------- the run brings its HUD */

test('every way into a run brings the HUD with it', () => {
  // THE RESUME BUG. The HUD used to be launched by whoever started GameScene,
  // and only one of the two callers did it: LoadoutScene launched it after
  // start('Game'), TitleScene's resume path did not. A resumed run played with
  // no HudScene at all — no counters, no start-wave button, no settings, no
  // ability bar — while the world underneath restored perfectly, so it read as
  // a broken UI rather than as a missing scene.
  //
  // The fix is ownership, not a second call site: GameScene launches its own
  // HUD, because there is no way into a run that does not go through its
  // create(). This asserts the ownership rather than the call, so adding a
  // third entry point cannot reintroduce the divergence.
  const files = readdirSync(url('../src/scenes')).filter((n) => n.endsWith('.ts'))
  const launchers = files.filter((n) => /launch\(['"]Hud['"]\)/.test(code(`scenes/${n}`)))
  assert.deepEqual(launchers, ['GameScene.ts'],
    'the HUD is launched from somewhere other than the scene that owns it; ' +
    'two call sites is how the resume path came to have no HUD')

  // And it is launched from create(), not from a handler that only some runs
  // reach — a wave starting, a first tap, a resume that took a branch.
  const game = code('scenes/GameScene.ts')
  const create = game.slice(game.indexOf('  create(): void {'), game.indexOf('\n  // ------'))
  assert.match(create, /launch\(['"]Hud['"]\)/,
    'GameScene does not launch the HUD in create(); a run can start without one')

  // Guarded, so restarting the scene does not stack a second HUD on the first.
  assert.match(create, /isActive\(['"]Hud['"]\)/,
    'the HUD launch is unguarded; a scene restart would run two of them')

  // Both entry paths still go through GameScene, which is what makes the
  // ownership above sufficient.
  assert.match(code('scenes/TitleScene.ts'), /scene\.start\(['"]Game['"]\)/,
    'the resume path no longer starts GameScene')
  assert.match(code('scenes/LoadoutScene.ts'), /scene\.start\(['"]Game['"]\)/,
    'the fresh path no longer starts GameScene')
})

test('the HUD draws no counter whose art the manifest cannot resolve', () => {
  // The other half of "missing icons": a counter plate is drawn straight from
  // ART.ui.counters, so a name that resolves to nothing draws nothing at all
  // and the counter is simply absent — which is what a HUD missing its lives
  // and wave pills looks like. The three names HudScene asks for are hardcoded
  // in buildCounters, so they are hardcoded here too, on purpose.
  const art = JSON.parse(src('data/art.json'))
  const counters = art.ui.counters as Record<string, string>
  for (const name of ['peanuts', 'lives', 'wave']) {
    const key = counters[name]
    assert.ok(key, `art.json names no counter plate for "${name}"; HudScene would draw nothing`)
    assert.ok(art.files[key],
      `the ${name} counter points at "${key}", which is not a file in the manifest`)
  }
  // HudScene must keep asking for exactly these three, or the check above is
  // guarding names nothing reads.
  const hud = code('scenes/HudScene.ts')
  assert.match(hud, /\['peanuts', 'lives', 'wave'\]/,
    'HudScene no longer builds its counters from those three names')
})

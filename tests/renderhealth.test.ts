import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  guardedRedraw, rendererAlive, rendererFault,
} from '../src/systems/RenderHealth.ts'
import { deviceScale, refreshDeviceScale, resetDeviceScale } from '../src/systems/Resolution.ts'

const url = (p: string) => new URL(p, import.meta.url)
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')
const code = (p: string) =>
  src(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

/* ------------------------------------------------------ is there a context */

test('a lost or missing context is recognised however it is missing', () => {
  // Asked in the one situation where the engine's own invariants may not hold,
  // so every shape it could be in has to have an answer.
  assert.equal(rendererFault(undefined), 'no-renderer')
  assert.equal(rendererFault(null), 'no-renderer')
  assert.equal(rendererFault({ contextLost: true, gl: {} }), 'context-lost')
  assert.equal(rendererFault({ gl: { isContextLost: () => true } }), 'context-lost')
  assert.equal(rendererFault({ gl: { isContextLost: () => false } }), null)
  // A gl object that throws when asked is not a working gl object.
  assert.equal(rendererFault({ gl: { isContextLost: () => { throw new Error('gone') } } }),
    'context-lost')
  // The Canvas renderer, which has a 2D context rather than a gl one.
  assert.equal(rendererFault({ gameContext: null }), 'no-context')
  assert.equal(rendererFault({ gameContext: {} }), null)

  assert.equal(rendererAlive({ gl: { isContextLost: () => false } }), true)
  assert.equal(rendererAlive({ contextLost: true }), false)
})

/* ------------------------------------------- the purged canvas, as a policy */

test('a text whose canvas was purged is rebuilt, never drawn into null', () => {
  /*
   * THE CRASH. "Cannot read properties of null (reading 'drawImage')" inside
   * Text.updateText, on the first redraw after two minutes in the background.
   * iOS purges the backing store of a backgrounded page's canvases and tells
   * nobody: the only sign is a null 2D context at the moment of the next draw.
   */
  const log: string[] = []
  let drawable = false          // purged while the page was away
  let context: object | null = null
  const outcome = guardedRedraw(
    () => drawable,
    () => { drawable = true; context = {}; log.push('reissued'); return true },
    () => {
      log.push('drew')
      // The draw itself is what would have thrown: it reaches into `context`.
      if (!context) throw new TypeError("Cannot read properties of null (reading 'drawImage')")
    },
  )
  assert.equal(outcome, 'reissued', 'the purged canvas was not rebuilt')
  assert.deepEqual(log, ['reissued', 'drew'],
    'the draw was attempted before the canvas was replaced')
})

test('a healthy text is drawn without being rebuilt', () => {
  let reissues = 0
  let draws = 0
  const outcome = guardedRedraw(() => true, () => { reissues++; return true }, () => { draws++ })
  assert.equal(outcome, 'drew')
  assert.equal(reissues, 0, 'a working canvas was thrown away and remade')
  assert.equal(draws, 1)
})

test('a canvas purged mid-draw is retried once, and then given up on', () => {
  // The interleaving iOS actually produces: drawable when asked, gone by the
  // time the draw runs.
  let attempts = 0
  const retried = guardedRedraw(
    () => true,
    () => true,
    () => { attempts++; if (attempts === 1) throw new Error('purged mid-draw') },
  )
  assert.equal(retried, 'reissued')
  assert.equal(attempts, 2, 'the draw was not retried after the canvas was replaced')

  // And when the platform is taking canvases away faster than we can make
  // them, it SKIPS rather than looping: a label missing for a frame is
  // recoverable, an exception in the render loop is the black screen.
  let tries = 0
  const given = guardedRedraw(
    () => true,
    () => true,
    () => { tries++; throw new Error('purged again') },
  )
  assert.equal(given, 'skipped')
  assert.equal(tries, 2, 'the guard kept retrying a draw that cannot succeed')
})

test('simulated loss and restore never throws, whatever fails', () => {
  // Every combination of "cannot check", "cannot rebuild" and "cannot draw".
  const boom = (): never => { throw new Error('gone') }
  for (const isDrawable of [() => true, () => false, boom]) {
    for (const reissue of [() => true, () => false, boom]) {
      for (const draw of [() => {}, boom]) {
        // `isDrawable` throwing is the one case the policy does not catch,
        // because a check that throws is a bug in the check rather than a
        // platform event — so it is called inside a try here, exactly as the
        // shim's own `textIsDrawable` cannot throw.
        assert.doesNotThrow(() => {
          try {
            guardedRedraw(isDrawable, reissue, draw)
          } catch (e) {
            if (isDrawable !== boom && reissue !== boom) throw e
          }
        })
      }
    }
  }
})

/* ------------------------------------------------------------- the wiring */

test('the renderer is checked before anything is allowed to draw', () => {
  const life = code('systems/Lifecycle.ts')
  // Resuming the scenes is what causes the first draw, so the check has to
  // come first — this is the ordering the crash turned on.
  const fg = life.slice(life.indexOf('const foreground ='))
  const body = fg.slice(0, fg.indexOf('\n  }'))
  assert.match(body, /rendererFault\(gameRenderer\(game\)\)/,
    'coming back does not check whether there is a context to draw on')
  assert.ok(body.indexOf('rendererFault') < body.indexOf('finishForeground'),
    'the scenes are resumed before the renderer is checked')
  assert.match(body, /awaitRestore\(\)/, 'a dead context is not waited on')

  // On loss the LOOP stops. Pausing a scene does not: Phaser keeps drawing a
  // paused scene's display list, and a draw into a lost context is the crash.
  assert.match(life, /game\.loop\.sleep\(\)/, 'the render loop keeps running through a loss')
  assert.match(life, /game\.loop\.wake\(\)/, 'the render loop is never restarted')
  assert.match(life, /e\.preventDefault\(\)/,
    'the default action is not prevented, so the context can never be restored')

  // And a context that never comes back rebuilds the game rather than leaving
  // the player on a rectangle that cannot draw.
  assert.match(life, /opts\.recreate\(\)/, 'an unrecoverable loss has no way out')
  assert.match(code('main.ts'), /recreate: \(\) => \{/, 'nothing can rebuild the game')
  assert.match(code('main.ts'), /game\.destroy\(true, false\)/,
    'a rebuild leaves the dead canvas in the DOM')
})

test('the text guard is installed before anything can redraw, and only once', () => {
  const life = code('systems/Lifecycle.ts')
  const install = life.indexOf('installTextGuard()')
  assert.ok(install > 0, 'the text guard is never installed')
  assert.ok(install < life.indexOf('const foreground ='),
    'the guard is installed after the handler that needs it')

  const guard = code('systems/TextGuard.ts')
  assert.match(guard, /if \(!proto \|\| proto\.__canvasGuarded\) return/,
    'installing twice would wrap the method twice')
  assert.match(guard, /guardedRedraw\(/, 'the shim does not use the shared policy')
  // Reissuing points the TEXTURE at the new canvas as well. Without that the
  // GPU keeps the copy of the purged one and the label stays blank.
  assert.match(guard, /source\.glTexture = null/,
    'the GPU copy of the purged canvas is kept, so the text stays blank')
  assert.match(guard, /refreshAllText/,
    'nothing redraws the text that was already on screen when the context went')
})

test('coming back on the Loadout screen redraws its text', () => {
  // The reported path: level 1 finished, Title, WorldMap, the level 2 Loadout,
  // two minutes in the background. `drawPanel -> updateCounter -> setText` is
  // an ordinary redraw of a scene that was already built, which is exactly
  // what nothing marks dirty and what `refreshAllText` exists to reach.
  const life = code('systems/Lifecycle.ts')
  const finish = life.slice(life.indexOf('const finishForeground ='))
  const body = finish.slice(0, finish.indexOf('\n  }'))
  assert.match(body, /refreshAllText\(game\)/,
    'the text already on screen is never redrawn after a context loss')
  assert.match(body, /resumeScenes\(\)/, 'the scenes are never resumed')
  assert.ok(body.indexOf('resumeScenes') < body.indexOf('refreshAllText'),
    'the text is redrawn before its scene is running again')

  // The guard covers every Text in every scene, so LoadoutScene needs no
  // special case — and must not have one.
  const guard = code('systems/TextGuard.ts')
  assert.match(guard, /game\.scene\.getScenes\(true\)/, 'only some scenes are reached')
  assert.doesNotMatch(guard, /Loadout/, 'the guard knows about one scene by name')
})

/* ------------------------------------------------------------ the dpr = 1 */

test('the device ratio is latched, so a hidden page cannot lower it', () => {
  /*
   * The crash state recorded `dpr = 1` on a phone whose ratio is 3.
   * `devicePixelRatio` is not reliable on iOS while a page is hidden or being
   * restored from the back/forward cache — and this number is the exchange
   * rate between the two coordinate spaces the whole game is written in, so a
   * transient reading puts two halves of one calculation in different spaces
   * and resizes the canvas to a third of the device's pixels.
   */
  const g = globalThis as { devicePixelRatio?: number }
  const realDpr = g.devicePixelRatio
  const doc = (globalThis as { document?: { visibilityState?: string } }).document
  const realDoc = doc
  try {
    resetDeviceScale()
    g.devicePixelRatio = 3
    ;(globalThis as { document?: unknown }).document = { visibilityState: 'visible' }
    assert.equal(deviceScale(), 3, 'the latched value is not the reading')

    // The page goes away and the platform starts lying.
    ;(globalThis as { document?: unknown }).document = { visibilityState: 'hidden' }
    g.devicePixelRatio = 1
    assert.equal(refreshDeviceScale(), false, 'a hidden page was allowed to change the ratio')
    assert.equal(deviceScale(), 3, 'a hidden page lowered the device ratio to 1')

    // Back in front of the player, still lying for a frame: the reading is
    // taken, because by then it is the best information there is.
    ;(globalThis as { document?: unknown }).document = { visibilityState: 'visible' }
    assert.equal(refreshDeviceScale(), true)
    assert.equal(deviceScale(), 1)

    // And a real change is picked up.
    g.devicePixelRatio = 2
    assert.equal(refreshDeviceScale(), true)
    assert.equal(deviceScale(), 2)
    assert.equal(refreshDeviceScale(), false, 'an unchanged ratio reports a change')

    // The clamp still holds at both ends.
    g.devicePixelRatio = 0
    refreshDeviceScale()
    assert.equal(deviceScale(), 1, 'a zero ratio is not floored')
    g.devicePixelRatio = 9
    refreshDeviceScale()
    assert.equal(deviceScale(), 3, 'the oversampling ceiling is gone')
  } finally {
    ;(globalThis as { document?: unknown }).document = realDoc
    if (realDpr === undefined) delete g.devicePixelRatio
    else g.devicePixelRatio = realDpr
    resetDeviceScale()
  }
})

test('only one place acts on a ratio change', () => {
  // Every other reader takes the latched value. A second place that re-read it
  // would be a second opinion about the size of a pixel.
  const res = code('systems/Resolution.ts')
  assert.match(res, /export function applyResolution/)
  const apply = res.slice(res.indexOf('export function applyResolution'))
  assert.match(apply.slice(0, apply.indexOf('\n}')), /refreshDeviceScale\(\)/,
    'the canvas is sized from a ratio nothing re-read')
  // Called exactly where a change is possible: the canvas sizing, and coming
  // back from the background with the page actually visible.
  const callers = [...code('systems/Lifecycle.ts').matchAll(/refreshDeviceScale\(\)/g)].length
  assert.equal(callers, 1, `the lifecycle re-reads the ratio ${callers} times`)
})

/**
 * What a crash report needs to know when there is no run to ask.
 *
 * THE REPORT THIS EXISTS FOR. An iPhone, launched from the home screen, threw
 * during boot and produced:
 *
 *     cause  uncaught exception
 *     error  Script error.
 *     EVENTS (ms since load)
 *             0  boot
 *          4796  orientation  gate raised; holding nothing
 *          4796  gate  +portrait holding=nothing
 *          4817  orientation  gate lowered; resumed nothing
 *
 * — and an EMPTY STATE section. The suspects were all environmental: the
 * viewport, the safe-area insets, the rotate gate, which scene was up, whether
 * the app was standalone. Not one of them was in the report, because `state`
 * only ever came from GameScene and there was no GameScene yet.
 *
 * So these facts are registered with Diagnostics directly, live for the whole
 * page rather than for the duration of a run, and every one of them is read
 * defensively: this runs while the game is falling over, and a context
 * provider that throws would hide the fault it was written to describe.
 *
 * Kept out of `Diagnostics.ts` on purpose. That module is Phaser-free and is
 * imported by InputGates, so importing InputGates back would be a cycle. The
 * modules that own each fact are imported HERE, at the edge.
 */

import type Phaser from 'phaser'
import { provideContext } from './Diagnostics.ts'
import { gateSummary, openGates } from './InputGates.ts'
import { gateHolding, isPortrait, overlayVisible } from './Orientation.ts'
import {
  fastestRaiseMs, formatSyncTrace, syncBursts,
} from './OrientationTrace.ts'
import { graphicsState } from './GraphicsWatch.ts'
import { deviceScale } from './Resolution.ts'
import { rawSafeAreaInsets, safeAreaInsets } from './SafeArea.ts'

/** Never throws and never returns undefined: a placeholder beats a hole. */
function attempt<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

/**
 * How the page is being displayed.
 *
 * THE ONE FACT THAT SEPARATES THE THREE DEVICES in the bug report: it crashes
 * on an iPhone added to the home screen, not on the same iPhone in a Safari
 * tab, and not on an iPad. Standalone is the only difference between the first
 * two, and it is invisible to every other diagnostic the game has.
 *
 * `navigator.standalone` is the iOS-only legacy flag and is the one that
 * actually answers this on an iPhone; the media query is the standard and is
 * checked as well so the answer is right everywhere else.
 */
function displayMode(): string {
  const legacy = (globalThis.navigator as { standalone?: boolean } | undefined)?.standalone
  const mq = attempt(
    () => globalThis.matchMedia?.('(display-mode: standalone)')?.matches ?? false,
    false,
  )
  if (legacy === true || mq) return 'standalone'
  if (legacy === false) return 'browser tab'
  return mq ? 'standalone' : 'browser'
}

/**
 * The bundle, as the DEVICE sees it.
 *
 * THIS SETTLES AN ARGUMENT THAT DOCUMENTATION CANNOT. "Script error." with no
 * message, file, line or stack is what a browser reports for an exception in a
 * script it treats as cross-origin — but the bundle is served from the same
 * origin as the page on GitHub Pages, so in principle it should never be muted
 * at all. Three reports say otherwise and there is no way to check from a
 * sandbox that cannot reach the site.
 *
 * So the page reports on itself. `script.src` is the resolved absolute URL, so
 * comparing its origin to the page's answers "is this actually cross-origin"
 * on the device that is actually crashing. And `script.crossOrigin` is the
 * reflected attribute as it exists in the SHIPPED html, which is the other
 * thing nobody can verify from here: whether Vite kept the attribute through
 * the build or dropped it.
 *
 * If the next report says `bundleSameOrigin = true` and
 * `scriptCrossOrigin = anonymous` and the error is STILL "Script error.", then
 * CORS is not the mechanism and that whole line of enquiry is closed.
 */
function bundle(): Record<string, unknown> {
  const doc = globalThis.document
  const el = attempt(
    () => doc?.querySelector('script[type="module"]') as HTMLScriptElement | null,
    null,
  )
  const pageOrigin = attempt(() => globalThis.location?.origin ?? 'unknown', 'unreadable')
  const src = el?.src ?? ''
  let bundleOrigin = 'none'
  if (src) bundleOrigin = attempt(() => new URL(src).origin, 'unparseable')
  return {
    pageOrigin,
    // Three states, not two: no module script at all, an INLINE one (which is
    // what the harness page uses, and which has no origin to compare), or a
    // real external bundle. Collapsing the first two reads as "the page has no
    // script", which would be alarming and wrong.
    bundleUrl: src || (el ? '(inline module script, no src)' : '(no module script in the DOM)'),
    bundleOrigin,
    bundleSameOrigin: src ? String(bundleOrigin === pageOrigin) : 'no bundle',
    // null when the attribute is absent, which is exactly the thing that has
    // to be checked on the shipped page rather than in the repository.
    scriptCrossOrigin: el ? (el.crossOrigin ?? 'absent') : 'no script element',
  }
}

/** The environment, with no game in it. Safe before Phaser exists at all. */
function environment(): Record<string, unknown> {
  const w = globalThis as { innerWidth?: number; innerHeight?: number }
  const angle = attempt<number | undefined>(
    () => (globalThis as { screen?: { orientation?: { angle?: number } } })
      .screen?.orientation?.angle,
    undefined,
  )
  return {
    display: displayMode(),
    // BOTH SPACES, because confusing them is this codebase's most expensive
    // recurring bug and a report that gives one number cannot say which.
    viewportCss: `${w.innerWidth ?? -1}x${w.innerHeight ?? -1}`,
    dpr: attempt(() => deviceScale(), -1),
    rawDpr: (globalThis as { devicePixelRatio?: number }).devicePixelRatio ?? -1,
    // `undefined` is a real and interesting answer here: the Screen
    // Orientation API is what decides which edge the notch is on, and an
    // absent angle means the insets are kept on both edges.
    screenAngle: angle === undefined ? 'absent' : angle,
    portrait: attempt(() => String(isPortrait()), 'unreadable'),
    rotateOverlay: attempt(() => (overlayVisible() ? 'visible' : 'hidden'), 'unreadable'),
    insetsRaw: attempt(() => JSON.stringify(rawSafeAreaInsets()), 'unreadable'),
    insetsResolved: attempt(() => JSON.stringify(safeAreaInsets()), 'unreadable'),
    gates: attempt(() => gateSummary(), 'unreadable'),
    // WHICH CLOCK CALLED THE GATE, AND WHEN. `portrait` and `rotateOverlay`
    // above are a single instant; these are the run-up to it. A gate that
    // raised and lowered 21ms apart is impossible if the streak counts frames
    // and ordinary if it counts settle-burst calls, and only the trace tells
    // the two apart. See systems/OrientationTrace.ts.
    syncBurstsSeen: attempt(() => syncBursts().length, -1),
    fastestRaiseMs: attempt(() => {
      const ms = fastestRaiseMs()
      return ms === null ? 'never raised' : `${ms.toFixed(1)}ms`
    }, 'unreadable'),
    syncTrace: attempt(() => formatSyncTrace(24), ['unreadable']),
    openGates: attempt(() => openGates().join(',') || 'none', 'unreadable'),
    visibility: globalThis.document?.visibilityState ?? 'unknown',
    ...bundle(),
    // THE DRAWING SURFACE, asked directly rather than inferred from an event.
    // See GraphicsWatch.ts: a WebGL context loss is the one candidate that fits
    // all six reports, and `webglContextLost` is a live answer no report has
    // ever carried.
    ...graphicsState(),
  }
}

/**
 * Installs the page-level context. Call once, as early as possible — before
 * the game exists, so a crash during construction is still described.
 */
export function installCrashContext(): void {
  provideContext('env', environment)
}

/**
 * Adds the facts that need a game: which scenes are up, and what the rotate
 * gate is holding.
 *
 * Separate from `installCrashContext` because the game is built after the
 * error handling is installed, and a report from in between should still carry
 * everything that does not need one.
 */
export function installGameContext(game: Phaser.Game): void {
  provideContext('game', () => ({
    scenesRunning: attempt(
      () => game.scene.getScenes(true)
        .map((s: Phaser.Scene) => s.scene.key).join(',') || 'none',
      'unreadable',
    ),
    scenesPaused: attempt(
      () => game.scene.getScenes(false)
        .filter((s: Phaser.Scene) => game.scene.isPaused(s.scene.key))
        .map((s: Phaser.Scene) => s.scene.key).join(',') || 'none',
      'unreadable',
    ),
    gateHolding: attempt(() => gateHolding(game).join(',') || 'nothing', 'unreadable'),
    // THE CANVAS ELEMENT'S OWN BACKING STORE, in device pixels, read off the
    // element rather than through `scale.width`. Both give the same number and
    // only one of them is a layout read: `viewW`/`viewH` are the CSS-pixel
    // space every layout is written in, and camera.test.ts holds that line by
    // name. A report wants BOTH spaces -- confusing them is this codebase's
    // most expensive recurring bug -- so `viewportCss` above is the other half.
    canvas: attempt(() => `${game.canvas.width}x${game.canvas.height}`, 'unreadable'),
    // A STRUCTURAL CAST, not laziness. `game.renderer` is a union of the
    // canvas and WebGL renderers, and this file is new, so `tsdiff` cannot
    // check a single Phaser member in it -- only CI can, and the last time a
    // Phaser return value went unchecked here it cost a red build. Naming the
    // one property this needs makes the access true whatever the union holds.
    // 1 is Phaser.CANVAS; anything else on a running game is WebGL.
    renderer: attempt(
      () => ((game.renderer as { type?: number } | undefined)?.type === 1 ? 'canvas' : 'webgl'),
      'unreadable',
    ),
  }))
}

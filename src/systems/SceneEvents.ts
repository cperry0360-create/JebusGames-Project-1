// Subscriptions that die with the scene that made them.
//
// The crash this exists to make impossible:
//
//   TypeError: undefined is not an object (evaluating 'this.cameras.main.setViewport')
//   at applyBands, 30s after the Game scene was destroyed
//
// GameScene registered `this.scale.on('resize', () => { ... this.applyBands() })`
// and never took it off. The ScaleManager belongs to the GAME, not the scene,
// so it outlives every run — and it went on holding an arrow function closed
// over a dead scene. Backgrounding the app makes Phaser call
// `ScaleManager.refresh()`, which emits `resize` into every listener it has,
// including that one. `this.cameras` is gone by then, so it throws.
//
// One leaked listener per run, and it fires on every resize for the rest of
// the session.
//
// The rule these helpers enforce: **anything registered on an emitter the
// scene does not own must be unregistered when the scene goes.** Both
// SHUTDOWN and DESTROY, because a scene that is stopped and restarted gets
// SHUTDOWN each time while one that is removed outright gets DESTROY, and a
// handler written for only one of them leaks on the other path.
//
// Prefer these over calling `.on` directly. A subscription that cleans itself
// up cannot be forgotten; one that needs a matching `.off` somewhere else
// always can be, and was.

// Type-only, so this module has no runtime dependency on Phaser and the
// regression test can exercise it in Node. The two event names are string
// literals for the same reason: `Phaser.Scenes.Events.SHUTDOWN` is a value
// import, and reaching for it would make the thing that must be tested
// untestable.
import type Phaser from 'phaser'

/** Phaser's own names for these. Kept as literals; see above. */
const SHUTDOWN = 'shutdown'
const DESTROY = 'destroy'

/** Anything with Phaser's on/off shape. The ScaleManager, the game's event
 *  emitter, an input plugin. */
interface Emitter {
  on(event: string, fn: (...args: never[]) => void, context?: unknown): unknown
  off(event: string, fn?: (...args: never[]) => void, context?: unknown): unknown
}

/**
 * Registers `handler` on `emitter`, and removes it when the scene shuts down
 * or is destroyed.
 *
 * The handler is stored by reference so the `off` can match it — which is the
 * other half of why the leak happened: an inline arrow has no name to pass to
 * `off`, so there was nothing to remove even if somebody had tried.
 */
export function onSceneEvent(
  scene: Phaser.Scene,
  emitter: Emitter,
  event: string,
  handler: (...args: never[]) => void,
): void {
  emitter.on(event, handler, scene)
  const remove = (): void => { emitter.off(event, handler, scene) }
  scene.events.once(SHUTDOWN, remove)
  scene.events.once(DESTROY, remove)
}

/** The common case: the game-wide ScaleManager, which every scene shares and
 *  no scene owns. */
export function onSceneResize(scene: Phaser.Scene, handler: () => void): void {
  onSceneEvent(scene, scene.scale as unknown as Emitter, 'resize', handler)
}

/**
 * True when the scene is still able to draw.
 *
 * A guard for any handler that can be reached from an emitter the scene does
 * not own. Even with the unregistration above, a `resize` already queued when
 * the scene shut down can still arrive, so the handler has to survive being
 * called once more rather than relying on never being called.
 */
export function sceneIsLive(scene: Phaser.Scene): boolean {
  return !!scene.sys
    && !scene.sys.isShuttingDown?.()
    && !!scene.cameras
    && !!scene.cameras.main
}

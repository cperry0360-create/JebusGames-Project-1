// Leaving the tab, and coming back.
//
// The reported crash: every time the tester left the game and returned, it
// broke. Two reports, both from the diagnostics:
//
//   unhandled rejection — Failed to start the audio device
//   uncaught exception (before boot) — TypeError
//
// iOS suspends the AudioContext when a tab is backgrounded and can discard the
// WebGL context with it. Phaser then tries to restart both on focus, its
// `context.resume()` rejects, nothing catches it, and the game is taken down by
// a sound it was not even playing.
//
// The rule here is that backgrounding is a *state the game enters on purpose*
// rather than something that happens to it: the run stops, the device is
// released, and both are picked back up in a known order on the way in. See
// `Audio.guardAudioPromises` for the other half — a rejection can no longer
// escape from any audio call, ours or the engine's.

import Phaser from 'phaser'
import { logEvent } from './Diagnostics.ts'
import { enterGate, leaveGate } from './InputGates.ts'
import { audioUnavailable, onAudioUnavailable, resumeAudio, suspendAudio } from './Audio.ts'
import { pauseMusic, resumeMusic } from './Music.ts'
import { toast } from '../ui/Toast.ts'
import { gameCanDraw, gameRenderer, installTextGuard, refreshAllText } from './TextGuard.ts'
import { rendererFault } from './RenderHealth.ts'
import { refreshDeviceScale } from './Resolution.ts'

/** The loader. Pausing a scene mid-preload stalls it. */
const NEVER_PAUSE = 'Boot'

export interface Lifecycle {
  /** True while the page is in the background. */
  hidden: () => boolean
  /** For tests and the harness: drive a transition without a real event. */
  background: () => void
  foreground: () => void
  /** Whether the renderer is currently able to draw. Read by the harness. */
  canDraw: () => boolean
}

export interface LifecycleOptions {
  /**
   * Builds the game again, from nothing.
   *
   * The last resort, for a context that is gone and will not come back. It is
   * handed in rather than done here because only `main` knows how to stand the
   * game up — and because a module that can rebuild the game is a module that
   * can rebuild it by accident.
   */
  recreate?: () => void
  /** How long to wait for a lost context to come back before giving up. */
  restoreTimeoutMs?: number
}

/** How long a lost context is given to return before the game is rebuilt. */
const RESTORE_TIMEOUT_MS = 4000

export function installLifecycle(game: Phaser.Game, opts: LifecycleOptions = {}): Lifecycle {
  // Before anything can redraw. iOS purges the backing store of a backgrounded
  // page's canvases, and every Phaser Text is a canvas — see RenderHealth.
  installTextGuard()
  /**
   * Which scenes *this* paused, so returning resumes those and only those.
   *
   * A run the player paused deliberately must still be paused when they come
   * back. `getScenes(true)` lists only the running ones, so a scene the pause
   * dialog already stopped never enters this set and is never resumed out of
   * it — the same rule the orientation gate uses, for the same reason.
   */
  const paused = new Set<string>()
  let away = false

  const pauseScenes = (): void => {
    for (const scene of game.scene.getScenes(true)) {
      const key = scene.scene.key
      if (key === NEVER_PAUSE) continue
      paused.add(key)
      try {
        game.scene.pause(key)
      } catch {
        paused.delete(key)
      }
    }
  }

  const resumeScenes = (): void => {
    for (const key of paused) {
      try {
        if (game.scene.isPaused(key)) game.scene.resume(key)
      } catch {
        // The scene shut down while the page was away.
      }
    }
    paused.clear()
  }

  const background = (): void => {
    if (away) return
    away = true
    logEvent('lifecycle', 'backgrounded')
    // Claimed: a run stopped because the page went away is owned by the page
    // coming back, not by anything the stuck guard should seize.
    enterGate('background', { visibility: globalThis.document?.visibilityState ?? '?' })
    pauseScenes()
    suspendAudio(game)
    // The soundtrack is not a Phaser sound, so pauseAll does not reach it.
    // Paused rather than stopped, so coming back resumes the same bar.
    pauseMusic()
  }

  const foreground = (): void => {
    if (!away) return
    away = false
    logEvent('lifecycle', 'foregrounded')
    leaveGate('background')

    // Audio first, and awaited, so the scenes are not running while the device
    // is still being handed back. The promise cannot reject.
    resumeMusic()
    void resumeAudio(game).then((ok) => {
      if (ok || audioUnavailable()) return
      // Still suspended rather than failed: the browser wants a gesture it has
      // not had since the page came back. The next tap will unlock it, and the
      // sound manager will pick up from there — nothing to report.
      logEvent('audio', 'context still suspended after returning; awaiting a tap')
    })

    // THE RENDERER IS CHECKED BEFORE ANYTHING IS ALLOWED TO DRAW, and resuming
    // the scenes is what causes the first draw. A first draw into a dead
    // context is the crash rather than a symptom of it, so the order here is
    // load-bearing: ask, then resume.
    const fault = rendererFault(gameRenderer(game))
    if (fault !== null) {
      logEvent('lifecycle', `renderer is ${fault} on the way back in; holding`)
      awaitRestore()
      return
    }
    finishForeground()
  }

  /** The half of coming back that may only run with a live context. */
  const finishForeground = (): void => {
    resumeScenes()
    // The scale manager measures wrong for a frame or two after a tab switch
    // on iOS, exactly as it does after a rotation — and `devicePixelRatio` is
    // one of the things it is wrong about, which is why the ratio is latched
    // and only re-read here, with the page visible. See Resolution.
    refreshDeviceScale()
    try {
      game.scale.refresh()
    } catch {
      // Not measurable yet; the next resize settles it.
    }
    // Every Text is holding a texture the GPU may no longer have, and nothing
    // marks one dirty on its own: a heading would stay blank until its string
    // changed, which for a heading is never.
    const redrawn = refreshAllText(game)
    if (redrawn > 0) logEvent('lifecycle', `redrew ${redrawn} text objects`)
  }

  /**
   * Waits for a lost context, and rebuilds the game if it never comes back.
   *
   * `webglcontextrestored` is the signal, and it is not guaranteed — a context
   * the browser has given up on fires nothing at all. So there is a deadline,
   * and past it the game is stood up again from scratch rather than left on a
   * screen that cannot draw. Losing the run is bad; a black rectangle with no
   * way out of it is worse, and the run is saved between waves anyway.
   */
  let restoreTimer: ReturnType<typeof setTimeout> | null = null
  const awaitRestore = (): void => {
    if (restoreTimer !== null) return
    restoreTimer = setTimeout(() => {
      restoreTimer = null
      if (rendererFault(gameRenderer(game)) === null) {
        finishForeground()
        return
      }
      logEvent('lifecycle', 'the graphics context did not come back; rebuilding the game')
      if (opts.recreate) opts.recreate()
      else cannotRebuild()
    }, opts.restoreTimeoutMs ?? RESTORE_TIMEOUT_MS)
  }

  const clearRestoreWait = (): void => {
    if (restoreTimer === null) return
    clearTimeout(restoreTimer)
    restoreTimer = null
  }

  /** Nothing was handed in that can rebuild the game. Say so rather than
   *  sitting on a blank screen pretending. */
  const cannotRebuild = (): void => {
    toast('Graphics could not be restored. Reload to carry on.')
  }

  const onVisibility = (): void => {
    if (globalThis.document?.visibilityState === 'hidden') background()
    else foreground()
  }

  globalThis.document?.addEventListener('visibilitychange', onVisibility)
  // pagehide/pageshow are the pair iOS actually fires when Safari freezes a tab
  // into the back/forward cache; visibilitychange alone misses that path.
  globalThis.addEventListener?.('pagehide', background)
  globalThis.addEventListener?.('pageshow', foreground)
  globalThis.addEventListener?.('blur', () => {
    // A blur is not a background — another window taking focus should not stop
    // the run — but on iOS it is the first sign the tab is going away, so the
    // device is released and picked up again on the next interaction.
    if (globalThis.document?.visibilityState === 'hidden') background()
  })

  installContextLossGuard(game, {
    onLost: () => {
      background()
      // PAUSING A SCENE DOES NOT STOP THE RENDER LOOP: Phaser keeps drawing a
      // paused scene's display list every frame, and a draw into a lost
      // context is the exception this is here to prevent. The loop itself has
      // to go to sleep.
      try {
        game.loop.sleep()
      } catch {
        // A loop that is already gone needs no stopping.
      }
    },
    onRestored: () => {
      clearRestoreWait()
      try {
        game.loop.wake()
      } catch {
        // Nothing to wake; the recreate path covers it.
      }
      // The engine re-uploads its own textures on a restore; the Text canvases
      // are ours and are not part of that. `foreground` walks them.
      if (away) foreground()
      else finishForeground()
    },
  })

  // Phaser pauses and resumes sound on blur and focus by itself, and its focus
  // handler is one of the unguarded `context.resume()` calls. Backgrounding is
  // handled here now, in a known order, so the engine's version is turned off
  // rather than left to race with this one.
  try {
    game.sound.pauseOnBlur = false
  } catch {
    // No sound manager yet, or a build without one.
  }

  // The notice lives here rather than in Audio.ts, so the system that makes
  // sound stays free of anything that draws.
  onAudioUnavailable(() => {
    toast('Sound is off — this browser would not start the audio device.')
  })

  return {
    hidden: () => away,
    background,
    foreground,
    canDraw: () => gameCanDraw(game),
  }
}

/**
 * The other thing iOS takes away.
 *
 * A backgrounded tab can have its WebGL context discarded. Without this the
 * browser fires `webglcontextlost`, the default action stops the context from
 * ever being restored, and every draw call afterwards throws a TypeError on a
 * null context — which is the second crash in the tester's report.
 */
function installContextLossGuard(
  game: Phaser.Game,
  handlers: { onLost: () => void; onRestored: () => void },
): void {
  const canvas = game.canvas as HTMLCanvasElement | undefined
  if (!canvas?.addEventListener) return

  canvas.addEventListener('webglcontextlost', (e) => {
    // Preventing the default is what makes the loss recoverable at all.
    e.preventDefault()
    logEvent('lifecycle', 'webgl context lost')
    handlers.onLost()
  })

  canvas.addEventListener('webglcontextrestored', () => {
    logEvent('lifecycle', 'webgl context restored')
    handlers.onRestored()
    toast('Graphics were reset by the browser. Carry on.')
  })
}

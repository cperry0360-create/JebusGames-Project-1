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
import { audioUnavailable, onAudioUnavailable, resumeAudio, suspendAudio } from './Audio.ts'
import { pauseMusic, resumeMusic } from './Music.ts'
import { toast } from '../ui/Toast.ts'

/** The loader. Pausing a scene mid-preload stalls it. */
const NEVER_PAUSE = 'Boot'

export interface Lifecycle {
  /** True while the page is in the background. */
  hidden: () => boolean
  /** For tests and the harness: drive a transition without a real event. */
  background: () => void
  foreground: () => void
}

export function installLifecycle(game: Phaser.Game): Lifecycle {
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

    resumeScenes()
    // The scale manager measures wrong for a frame or two after a tab switch
    // on iOS, exactly as it does after a rotation.
    try {
      game.scale.refresh()
    } catch {
      // Not measurable yet; the next resize settles it.
    }
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

  installContextLossGuard(game, background, foreground)

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

  return { hidden: () => away, background, foreground }
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
  onLost: () => void,
  onRestored: () => void,
): void {
  const canvas = game.canvas as HTMLCanvasElement | undefined
  if (!canvas?.addEventListener) return

  canvas.addEventListener('webglcontextlost', (e) => {
    // Preventing the default is what makes the loss recoverable at all.
    e.preventDefault()
    logEvent('lifecycle', 'webgl context lost')
    onLost()
  })

  canvas.addEventListener('webglcontextrestored', () => {
    logEvent('lifecycle', 'webgl context restored')
    onRestored()
    toast('Graphics were reset by the browser. Carry on.')
  })
}

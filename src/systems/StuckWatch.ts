/**
 * The stuck guard, wired to a real Phaser game.
 *
 * StuckGuard itself is Phaser-free so its rules can be tested without a
 * canvas. This is the other half: how those rules read a live game, and what
 * "back to normal" means for one.
 *
 * It lives in its own module rather than in `main.ts` because the harness
 * stands the game up itself, and a guard that only existed on the boot path
 * would be a guard no scenario could ever exercise. Both callers use this, so
 * what is tested is what ships.
 */

import type Phaser from 'phaser'
import { logEvent } from './Diagnostics.ts'
import { reportQuietly } from './ErrorPanel.ts'
import { gateHolding, overlayVisible, releaseGate } from './Orientation.ts'
import { clearGates, gateSummary, lastInputAt, openGates } from './InputGates.ts'
import { installStuckGuard, type StuckSample } from './StuckGuard.ts'

/** Installs the guard on `game`. Returns a function that stops it. */
export function installGameStuckGuard(game: Phaser.Game): () => void {
  return installStuckGuard(stuckHost(game))
}

/**
 * How the stuck guard sees the game.
 *
 * Everything here is read defensively. It runs on a timer that keeps ticking
 * when the game loop has stopped, which is the only time it matters and
 * exactly the time when half of these objects may be missing.
 */
export function stuckHost(game: Phaser.Game) {
  const scene = (key: string): Phaser.Scene | null => {
    try {
      return game.scene.getScene(key)
    } catch {
      return null
    }
  }
  const paused = (key: string): boolean => {
    try {
      return game.scene.isPaused(key)
    } catch {
      return false
    }
  }

  return {
    sample: (): StuckSample => {
      const g = scene('Game') as (Phaser.Scene & {
        status?: { mode?: string; wave?: number; phase?: string }
        enemies?: Array<{ x: number; y: number }>
      }) | null
      // ON SCREEN, whether or not it is ticking. `isActive` is false for a
      // paused scene, and a paused scene is the whole subject here.
      const gamePaused = paused('Game')
      const live = g !== null && (game.scene.isActive('Game') || gamePaused)
      const targeting = g?.status?.mode === 'targeting'

      // WHAT SHOULD BE MOVING. Enemy positions rounded to a pixel, plus the
      // wave, so a board with nothing on it still advances its clock. Rounded
      // because a float that jitters in the last bit would read as motion
      // forever and the guard would never fire.
      const bodies = g?.enemies ?? []
      const motion = `${g?.status?.wave ?? -1}:${bodies.length}:`
        + bodies.map((e: { x: number; y: number }) => `${Math.round(e.x)},${Math.round(e.y)}`)
          .join('|')

      // AMBIENT OWNERS. These do not go through InputGates because they are
      // conditions rather than transitions -- the overlay is CSS, and the page
      // being hidden is the browser's business -- but they own a stopped board
      // just as legitimately.
      let owner: string | null = openGates()[0] ?? null
      if (owner === null && overlayVisible()) owner = 'portrait-overlay'
      if (owner === null && globalThis.document?.visibilityState === 'hidden') owner = 'hidden'

      return {
        now: Date.now(),
        // A finished run is not a stuck one: the win and loss screens are
        // deliberately still.
        runActive: live && g?.status?.phase !== 'won' && g?.status?.phase !== 'lost',
        gate: gamePaused ? 'paused' : targeting ? 'targeting' : null,
        owner,
        motion,
        lastInputAt: lastInputAt(),
      }
    },

    report: (cause: string, message: string) => {
      // Quietly: this is recovered from, and a wall of red monospace over a
      // child's game to announce a problem that has already fixed itself would
      // be worse than the problem.
      reportQuietly(cause, `${message} | gates: ${gateSummary()} | `
        + `rotate gate holding: ${gateHolding(game).join(',') || 'nothing'}`)
    },

    /**
     * BACK TO NORMAL, in the order that cannot make things worse.
     *
     * The rotate gate first, because it is the one thing that can hold a scene
     * paused with no UI attached and it is the cause this guard was written
     * for. Then any scene still paused with nothing owning it. Then the
     * bookkeeping, so a stale claim cannot suppress the next recovery.
     */
    recover: () => {
      const freed = releaseGate(game)
      logEvent('stuck', `recovering; rotate gate released ${freed.join(',') || 'nothing'}`)
      for (const key of ['Game', 'Hud']) {
        try {
          if (game.scene.isPaused(key)) {
            game.scene.resume(key)
            logEvent('stuck', `resumed ${key}`)
          }
        } catch {
          // The scene is gone; there is nothing to hand back.
        }
      }
      const g = game.scene.getScene('Game') as (Phaser.Scene & {
        clearSelection?: (reason: string) => void
      }) | null
      try {
        // Drops any armed ability without spending it. Safe to call when
        // nothing is armed.
        g?.clearSelection?.('replaced')
      } catch {
        // A scene mid-teardown has nothing to clear.
      }
      clearGates()
    },
  }
}
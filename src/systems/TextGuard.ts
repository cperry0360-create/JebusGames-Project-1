// The engine-facing half of the canvas-purge guard. See RenderHealth.ts for
// the policy and for the crash report this exists for.
//
// A PROTOTYPE PATCH, which wants justifying. The alternative is a guard at
// every call site that sets text — and there are dozens, in nine scenes, plus
// the ones inside the engine that this file cannot reach at all. The failure is
// not a property of any call site; it is a property of every Text in the game
// after the platform has taken its memory back. One place is the only place
// that covers the engine's own redraws.

import Phaser from 'phaser'
import { logEvent } from './Diagnostics.ts'
import { guardedRedraw, rendererFault, type RendererLike } from './RenderHealth.ts'

/** The renderer, as much of it as the health check needs. */
export function gameRenderer(game: Phaser.Game | undefined): RendererLike | undefined {
  return game?.renderer as unknown as RendererLike | undefined
}

/** Whether this game can draw right now. */
export function gameCanDraw(game: Phaser.Game | undefined): boolean {
  return rendererFault(gameRenderer(game)) === null
}

/**
 * Gives a Text object a fresh canvas to draw into.
 *
 * Everything is optional and everything is guarded: this runs after the
 * platform has taken something away, so no field can be assumed to be there.
 * Returns false when it could not be done, and the caller skips the redraw
 * rather than attempting it into nothing.
 */
function reissueCanvas(text: Phaser.GameObjects.Text): boolean {
  const t = text as unknown as {
    canvas?: HTMLCanvasElement
    context?: CanvasRenderingContext2D | null
    texture?: { source?: Array<{ source?: unknown; glTexture?: unknown }>; refresh?: () => void }
    width?: number
    height?: number
  }
  try {
    const doc = globalThis.document
    if (!doc?.createElement) return false
    const canvas = doc.createElement('canvas')
    canvas.width = Math.max(1, Math.ceil(t.canvas?.width || t.width || 1))
    canvas.height = Math.max(1, Math.ceil(t.canvas?.height || t.height || 1))
    const ctx = canvas.getContext('2d')
    if (!ctx) return false
    t.canvas = canvas
    t.context = ctx
    // Point the texture at the new canvas, and drop the GPU copy of the old
    // one so the renderer uploads this canvas instead of the purged one.
    const source = t.texture?.source?.[0]
    if (source) {
      source.source = canvas
      source.glTexture = null
    }
    t.texture?.refresh?.()
    return true
  } catch {
    return false
  }
}

/** True when a Text has a canvas it can actually draw into. */
function textIsDrawable(text: Phaser.GameObjects.Text): boolean {
  const t = text as unknown as { context?: unknown; canvas?: unknown }
  return Boolean(t.context) && Boolean(t.canvas)
}

/**
 * Wraps `Text.updateText` so a purged canvas is rebuilt rather than drawn into.
 *
 * Idempotent, so installing it twice is not two layers of try/catch.
 */
export function installTextGuard(): void {
  const proto = (Phaser.GameObjects.Text as unknown as {
    prototype?: Record<string, unknown>
  })?.prototype
  if (!proto || proto.__canvasGuarded) return
  const original = proto.updateText as ((this: Phaser.GameObjects.Text) => unknown) | undefined
  if (typeof original !== 'function') return

  let reported = false
  proto.updateText = function guardedUpdateText(this: Phaser.GameObjects.Text) {
    const outcome = guardedRedraw(
      () => textIsDrawable(this),
      () => reissueCanvas(this),
      () => { original.call(this) },
    )
    if (outcome === 'skipped' && !reported) {
      reported = true
      logEvent('render', 'a text canvas was purged and could not be redrawn; skipped')
    }
    return this
  }
  proto.__canvasGuarded = true
}

/**
 * Forces every Text in every live scene to redraw.
 *
 * Called once the context is back. A Text whose canvas was purged holds a
 * texture the GPU no longer has, and nothing marks it dirty on its own — it
 * would stay blank until something happened to change its string, which for a
 * heading is never.
 */
export function refreshAllText(game: Phaser.Game | undefined): number {
  if (!game) return 0
  let touched = 0
  try {
    for (const scene of game.scene.getScenes(true)) {
      for (const obj of scene.children?.list ?? []) {
        if (!(obj instanceof Phaser.GameObjects.Text)) continue
        // Straight through the guard above, so a canvas that is still gone is
        // reissued here rather than at some later frame in front of the player.
        obj.updateText()
        touched++
      }
    }
  } catch {
    // A scene shutting down mid-walk. Whatever was reached is still reached.
  }
  return touched
}

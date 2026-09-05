// Is there still something to draw on?
//
// THE CRASH THIS EXISTS FOR. Build 46f1f72, on a phone: finish level 1, walk
// through Title and WorldMap into the level 2 Loadout, put the app in the
// background for about two minutes, come back.
//
//   Uncaught TypeError: Cannot read properties of null (reading 'drawImage')
//     Text.updateText -> Frame.setSize -> setCutPosition -> updateUVs
//     LoadoutScene.drawPanel -> updateCounter -> setText
//
// The stack is where it surfaced, not what went wrong. `setText` is an
// ordinary redraw; the null is the Text object's own 2D canvas context. iOS
// discards canvas backing stores for a backgrounded page when memory is tight,
// and it does not tell anybody: `getContext('2d')` on a purged canvas returns
// null, and every Phaser Text in the scene is a canvas. The first thing that
// redrew after foregrounding was the one that reported it.
//
// TWO HALVES, and they are different problems:
//
//   1. THE WEBGL CONTEXT, which the browser tells us about (`webglcontextlost`)
//      and which can be restored. Lifecycle.ts listens; what is here is the
//      question "is it back?", asked before anything is allowed to draw.
//
//   2. THE PER-TEXT 2D CANVASES, which the browser does NOT tell us about.
//      Nothing fires, nothing is restorable, and the only sign is a null
//      context at the moment of the next redraw. So a Text that has lost its
//      canvas is given a new one and drawn again — and if even that fails, it
//      is skipped rather than allowed to take the frame down. A missing label
//      for one frame is recoverable. An uncaught TypeError in the render loop
//      is the black screen the error panel exists to replace.

// PHASER-FREE, deliberately and unusually for a file about rendering. Both
// decisions below — "can this draw?" and "what do I do when it cannot?" — are
// reached in the one situation where nothing can be assumed to work, and they
// are the decisions a test most needs to be able to drive. So they take
// duck-typed arguments and return answers, and the engine-facing shim that
// calls them lives next door in TextGuard.ts.

/** What a renderer looks like when it is not able to draw. */
export type RenderFault = 'no-renderer' | 'context-lost' | 'no-context' | null

/** Enough of a renderer to tell whether it can draw. */
export interface RendererLike {
  contextLost?: boolean
  gl?: { isContextLost?: () => boolean } | null
  gameContext?: unknown
}

/**
 * Whether the game can safely draw a frame.
 *
 * Asked before scenes are resumed on the way back from the background, because
 * resuming them is what causes the first draw — and a first draw into a dead
 * context is the crash rather than a symptom of it.
 *
 * Written defensively on purpose. This runs in the one situation where the
 * engine's own invariants may not hold, so it must not assume the renderer has
 * any particular shape; anything it cannot read counts as broken.
 */
export function rendererFault(renderer: RendererLike | undefined | null): RenderFault {
  if (!renderer) return 'no-renderer'
  if (renderer.contextLost === true) return 'context-lost'
  if (renderer.gl) {
    try {
      if (renderer.gl.isContextLost?.() === true) return 'context-lost'
    } catch {
      return 'context-lost'
    }
    return null
  }
  // The Canvas renderer, which has a 2D context instead of a gl one. A null
  // there is the same fault by a different name.
  if ('gameContext' in renderer) return renderer.gameContext ? null : 'no-context'
  return null
}

export function rendererAlive(renderer: RendererLike | undefined | null): boolean {
  return rendererFault(renderer) === null
}

/** What happened to one redraw. */
export type RedrawOutcome = 'drew' | 'reissued' | 'skipped'

/**
 * Redraws something that may have had its canvas taken away underneath it.
 *
 * THE POLICY, on its own, because it is the part that must be right. In order:
 *
 *   1. If it is not drawable, give it a new canvas FIRST. Drawing into a null
 *      context is the crash, and asking beforehand is cheaper than catching.
 *   2. Draw. If that throws — the canvas was purged between the check and the
 *      call, which is a real interleaving on iOS — give it a new one and try
 *      ONCE more.
 *   3. If that fails too, SKIP. A label missing for a frame is recoverable; an
 *      uncaught exception in the render loop is the black screen the error
 *      panel exists to replace.
 *
 * There is no third attempt on purpose: if a canvas we made ourselves one line
 * ago cannot be drawn into, the platform is taking them away faster than we
 * can make them and a loop would make that worse rather than better.
 */
export function guardedRedraw(
  isDrawable: () => boolean,
  reissue: () => boolean,
  draw: () => void,
): RedrawOutcome {
  if (!isDrawable()) {
    if (!reissue()) return 'skipped'
    try {
      draw()
      return 'reissued'
    } catch {
      return 'skipped'
    }
  }
  try {
    draw()
    return 'drew'
  } catch {
    if (!reissue()) return 'skipped'
    try {
      draw()
      return 'reissued'
    } catch {
      return 'skipped'
    }
  }
}

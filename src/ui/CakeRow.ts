// The row of cakes a level pays out, drawn the same way everywhere it appears.
//
// TWO PLACES SHOW IT AND THEY MUST AGREE: the victory panel, where it lands
// one cake at a time, and every node on the level select road. A second copy
// of "three slots, earned ones in colour, the rest pale" is a second copy that
// drifts — the map showing two cakes for a level the victory screen paid three
// for is a bug the player cannot report because they only ever see one screen
// at a time.
//
// ONE ASSET, TWO STATES. `ui_cake.png` is the earned picture and there is no
// empty-cake file. An unearned cake is built from the same texture at boot by
// `Desaturate.UNEARNED` — pale and translucent, never darker. Baking the state
// into the art is the mistake the placeholder ability icons made: LOCKED was
// painted into the picture, so a button that had become available still said
// locked and no draw call could contradict it.

import Phaser from 'phaser'
import { ART, fitInBox } from '../systems/Art.ts'
import { ensureGrey, UNEARNED } from '../systems/Desaturate.ts'
import { MAX_CAKES } from '../systems/Cakes.ts'
import presentation from '../data/presentation.json' with { type: 'json' }

const CFG = presentation.cakes

/** How wide a row of `max` cakes at this size is, gaps included. */
export function cakeRowWidth(size: number, max: number = MAX_CAKES): number {
  return max * size + (max - 1) * size * CFG.gapFraction
}

export interface CakeRowOptions {
  /** How many are lit. */
  earned: number
  /** How many slots there are. Defaults to the maximum a level can pay. */
  max?: number
  /** The box each cake is fitted into, in the units the caller draws in. */
  size: number
  /**
   * Lands the earned ones one at a time instead of drawing them lit.
   *
   * The victory panel does; a map node does not. A node redraws on every
   * scroll frame the scene is rebuilt on, and something that popped each time
   * would read as the count changing.
   */
  animate?: boolean
}

/**
 * Draws the row centred on (x, y) and returns the images, earned first.
 *
 * The caller owns them — a dialog adds them to its own layer, the map adds
 * them to the scrolling road — so this positions and sizes and nothing else.
 */
export function cakeRow(
  scene: Phaser.Scene, x: number, y: number, opts: CakeRowOptions,
): Phaser.GameObjects.Image[] {
  const max = opts.max ?? MAX_CAKES
  const key = ART.ui.cake
  // The pale copy is made on demand rather than at boot with the others: the
  // greyable list is the HUD's, this recipe is not that one, and a texture
  // built the first time a cake is drawn costs one canvas pass on a screen
  // that is not mid-wave.
  const pale = scene.textures.exists(key) ? ensureGrey(scene, key, UNEARNED) : key
  const step = opts.size * (1 + CFG.gapFraction)
  const left = x - (cakeRowWidth(opts.size, max) - opts.size) / 2

  const out: Phaser.GameObjects.Image[] = []
  for (let i = 0; i < max; i++) {
    const lit = i < opts.earned
    const img = scene.add.image(left + i * step, y, lit ? key : pale)
    // Fitted from the manifest's SOURCE extents, so `size` is the height the
    // cake actually occupies rather than the height of its canvas. The canvas
    // is 1024 square and the ink is 926x982; fitting by the canvas would draw
    // every cake 6% small and treat a 0.943:1 shape as a square.
    fitInBox(img, key, opts.size)
    out.push(img)

    if (lit && opts.animate) {
      // DROPPED IN, ONE AT A TIME, and each one lands before the next starts.
      // The count is the whole message of the screen, and three cakes that
      // appear together are a picture rather than a score.
      //
      // The resting scale is read BEFORE it is overwritten. Computing the
      // target back out of the enlarged value works and is one edit away from
      // not working.
      const rest = img.scaleX
      img.setScale(rest * CFG.popScale).setAlpha(0)
      scene.tweens.add({
        targets: img,
        scale: rest,
        alpha: 1,
        delay: CFG.firstDelayMs + i * CFG.stepMs,
        duration: CFG.popMs,
        ease: 'Back.easeOut',
      })
    }
  }
  return out
}

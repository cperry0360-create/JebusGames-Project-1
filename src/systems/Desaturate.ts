// Greyscale copies of art, generated once at boot.
//
// Phaser's tint multiplies rather than desaturating, so a greyed-out icon made
// with a tint just goes dark and keeps its colour. Building a real greyscale
// texture is the only way to get "unavailable" reading as unavailable rather
// than as "in shadow", and it works under both renderers.

import Phaser from 'phaser'

/** The suffix a greyed copy is registered under. */
export const GREY = '-grey'

export function greyKey(key: string, recipe: GreyRecipe = SWITCHED_OFF): string {
  return key + recipe.suffix
}

/**
 * How a greyed copy is built: `grey = mid + (lum - 128) * contrast`, then the
 * alpha multiplied.
 *
 * TWO RECIPES, BECAUSE "UNAVAILABLE" AND "NOT YET EARNED" ARE DIFFERENT
 * PICTURES. A dimmed icon on a lit HUD button reads as switched off; the same
 * treatment on a cake sitting straight on a dark panel makes it disappear.
 */
export interface GreyRecipe {
  /** The grey a mid-tone pixel lands on. */
  mid: number
  /** How much of the source's contrast survives. 1 keeps all of it. */
  contrast: number
  /** Multiplied into the alpha channel. */
  alpha: number
  /** Appended to the key, so two recipes on one source do not collide. */
  suffix: string
}

/**
 * A control that cannot be pressed: pulled dark and left opaque, because it
 * is drawn on a lit plate that would otherwise show straight through it.
 *
 * `mid 129, contrast 0.7` is the old `l * 0.7 + 40` written in the shared
 * form — 128 * 0.7 + 40 is 129.6 — so every icon this has ever greyed comes
 * out within a value of where it was.
 */
export const SWITCHED_OFF: GreyRecipe = { mid: 129, contrast: 0.7, alpha: 1, suffix: GREY }

/**
 * SOMETHING NOT EARNED YET: paler than the source and translucent, NEVER
 * darker.
 *
 * The cake's frosting is dark chocolate. Running it through `SWITCHED_OFF`
 * takes a picture that is already dark, pulls it darker still, and puts it on
 * a near-black panel — at which point an unearned cake is not a faint cake,
 * it is nothing at all, and the player cannot count the empty slots. So this
 * goes the other way: mid 150 is lighter than any grey the source contains,
 * the 0.30 contrast flattens the frosting and the icing into the same pale
 * tone, and the 0.6 alpha is what separates it from an earned one.
 */
export const UNEARNED: GreyRecipe = { mid: 150, contrast: 0.3, alpha: 0.6, suffix: '-unearned' }

/**
 * Registers a greyscale copy of `key`, if one does not already exist. Returns
 * the key to draw; falls back to the original if the copy cannot be made, so a
 * missing greyscale is a cosmetic loss rather than a missing icon.
 */
export function ensureGrey(
  scene: Phaser.Scene, key: string, recipe: GreyRecipe = SWITCHED_OFF,
): string {
  const out = greyKey(key, recipe)
  if (scene.textures.exists(out)) return out
  const src = scene.textures.get(key)?.getSourceImage() as HTMLImageElement | HTMLCanvasElement | undefined
  if (!src || !src.width) return key

  const canvas = scene.textures.createCanvas(out, src.width, src.height)
  if (!canvas) return key
  const ctx = canvas.getContext()
  ctx.drawImage(src as CanvasImageSource, 0, 0)
  const data = ctx.getImageData(0, 0, src.width, src.height)
  const px = data.data
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue
    // Rec. 601 luma, then pulled towards the recipe's mid grey so it reads as
    // deliberately off rather than merely colourless.
    const l = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114
    const v = Math.max(0, Math.min(255, Math.round(recipe.mid + (l - 128) * recipe.contrast)))
    px[i] = v
    px[i + 1] = v
    px[i + 2] = v
    // Baked in rather than left to `setAlpha` on the image. The cakes are
    // drawn in a row and a tween runs over the earned ones; an alpha the
    // caller had to remember to set is an alpha a later caller forgets, and
    // the failure looks like a full-strength cake in an empty slot.
    if (recipe.alpha !== 1) px[i + 3] = Math.round(px[i + 3] * recipe.alpha)
  }
  ctx.putImageData(data, 0, 0)
  canvas.refresh()
  return out
}

// Greyscale copies of art, generated once at boot.
//
// Phaser's tint multiplies rather than desaturating, so a greyed-out icon made
// with a tint just goes dark and keeps its colour. Building a real greyscale
// texture is the only way to get "unavailable" reading as unavailable rather
// than as "in shadow", and it works under both renderers.

import Phaser from 'phaser'

/** The suffix a greyed copy is registered under. */
export const GREY = '-grey'

export function greyKey(key: string): string {
  return key + GREY
}

/**
 * Registers a greyscale copy of `key`, if one does not already exist. Returns
 * the key to draw; falls back to the original if the copy cannot be made, so a
 * missing greyscale is a cosmetic loss rather than a missing icon.
 */
export function ensureGrey(scene: Phaser.Scene, key: string): string {
  const out = greyKey(key)
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
    // Rec. 601 luma, then pulled towards mid grey so it reads as switched off
    // rather than merely colourless.
    const l = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114
    const v = Math.round(l * 0.7 + 40)
    px[i] = v
    px[i + 1] = v
    px[i + 2] = v
  }
  ctx.putImageData(data, 0, 0)
  canvas.refresh()
  return out
}

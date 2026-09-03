// The peanut, on its own, cut out of the HUD counter plate at boot.
//
// THERE IS NO PEANUT ICON IN THE PACK. The counter's art is not an icon — it
// is the whole 233x96 counter plate, a black field with a bevelled grey border
// and a peanut painted into its left end. Pointing the sell button at that key
// drew the entire plate scaled into a 40px square: a dark blob with something
// in it.
//
// So the peanut is cut out of the plate it already lives on. The alternative
// was the cash symbol it replaces, and a currency the game does not have on
// the one button that pays out is worse than a generated icon.
//
// A purpose-drawn peanut icon would be better art than this, and this file
// should be deleted the day one arrives.

import Phaser from 'phaser'

/**
 * Where the peanut sits on the plate, as fractions of the source image.
 *
 * From `art.json`'s own render metadata for `hud-peanuts`: `fieldLeft` is
 * where the dark number field begins, which is the right-hand edge of the
 * peanut's end of the plate, and `fieldCentreY` is the row the plate is
 * balanced on. The margins keep the bevelled border out of the crop.
 */
const CROP = { left: 0.05, right: 0.285, top: 0.12, bottom: 0.88 }

/** How dark a pixel has to be to count as plate rather than peanut. */
const PLATE_LUMA = 90

/**
 * Registers the cut-out, returning the key to draw. Falls back to the plate
 * key if anything is missing, so a failure here is a wrong-looking button
 * rather than a missing one.
 */
export function ensurePeanutIcon(
  scene: Phaser.Scene,
  /** The counter plate to cut it out of, and the key to register it under.
   *  Both come from art.json: no sprite key is named in this file. */
  plateKey: string,
  outKey: string,
): string {
  if (scene.textures.exists(outKey)) return outKey
  const src = scene.textures.get(plateKey)?.getSourceImage() as
    HTMLImageElement | HTMLCanvasElement | undefined
  if (!src || !src.width) return plateKey

  const x0 = Math.round(src.width * CROP.left)
  const x1 = Math.round(src.width * CROP.right)
  const y0 = Math.round(src.height * CROP.top)
  const y1 = Math.round(src.height * CROP.bottom)
  const w = x1 - x0
  const h = y1 - y0
  if (w < 4 || h < 4) return plateKey

  const canvas = scene.textures.createCanvas(outKey, w, h)
  if (!canvas) return plateKey
  const ctx = canvas.getContext()
  ctx.drawImage(src as CanvasImageSource, x0, y0, w, h, 0, 0, w, h)
  const img = ctx.getImageData(0, 0, w, h)
  const px = img.data

  /*
   * THE BACKGROUND IS FLOODED, NOT COLOUR-KEYED.
   *
   * Knocking out every dark pixel would eat the peanut's own outline, which is
   * as dark as the plate behind it. What separates the two is connectivity:
   * the plate reaches the edge of the crop and the outline does not, because
   * the shell encloses it. So the fill starts at the border and stops wherever
   * the picture gets light.
   */
  const seen = new Uint8Array(w * h)
  const stack: number[] = []
  const dark = (i: number): boolean => {
    const o = i * 4
    return px[o]! * 0.299 + px[o + 1]! * 0.587 + px[o + 2]! * 0.114 < PLATE_LUMA
  }
  for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x) }
  for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1) }
  while (stack.length) {
    const i = stack.pop()!
    if (seen[i] || !dark(i)) continue
    seen[i] = 1
    px[i * 4 + 3] = 0
    const x = i % w
    const y = (i / w) | 0
    if (x > 0) stack.push(i - 1)
    if (x < w - 1) stack.push(i + 1)
    if (y > 0) stack.push(i - w)
    if (y < h - 1) stack.push(i + w)
  }
  ctx.putImageData(img, 0, 0)
  canvas.refresh()
  return outKey
}

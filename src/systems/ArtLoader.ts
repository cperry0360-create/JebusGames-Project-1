// Phase 1 art is meant to be Kenney's CC0 "Tower Defense (Top-Down)" pack.
// Until those files are dropped into public/assets/kenney/, every sprite key
// falls back to a generated placeholder so the game always runs.
//
// Placeholders are drawn with a lit top face and a darker side face. That is
// the whole 3/4 illusion: the grid stays square and Y-sorting does the rest.

import Phaser from 'phaser'
import type { ArtDef, PlaceholderDef } from '../types.ts'
import artData from '../data/art.json'

const art = artData as ArtDef

export const SPRITE_KEYS = Object.keys(art.sprites)

/** Queues the real pack if it is present. Returns the keys it tried to load. */
export function queueKenneyPack(scene: Phaser.Scene): string[] {
  if (!art.useKenneyPack) return []
  for (const key of SPRITE_KEYS) {
    scene.load.image(key, `${art.kenneyPath}${key}.png`)
  }
  return SPRITE_KEYS
}

/** Generates a placeholder for every key that did not come from the pack. */
export function fillMissingTextures(scene: Phaser.Scene): string[] {
  const generated: string[] = []
  for (const [key, def] of Object.entries(art.sprites)) {
    if (scene.textures.exists(key)) continue
    drawPlaceholder(scene, key, def.placeholder)
    generated.push(key)
  }
  return generated
}

function drawPlaceholder(scene: Phaser.Scene, key: string, def: PlaceholderDef): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false)
  const color = Phaser.Display.Color.HexStringToColor(def.color).color
  const accent = Phaser.Display.Color.HexStringToColor(def.accent).color

  let w = 64
  let h = 64

  switch (def.shape) {
    case 'tile':
      g.fillStyle(color, 1).fillRect(0, 0, 64, 64)
      g.fillStyle(accent, 1).fillRect(0, 60, 64, 4)
      break

    case 'tower':
      w = 56
      h = 72
      // Footprint, then a body with a darker right side and a lit cap.
      g.fillStyle(accent, 1).fillEllipse(28, 64, 48, 16)
      g.fillStyle(accent, 1).fillRect(12, 26, 32, 38)
      g.fillStyle(color, 1).fillRect(12, 26, 22, 38)
      g.fillStyle(color, 1).fillEllipse(28, 26, 40, 18)
      g.lineStyle(2, accent, 1).strokeEllipse(28, 26, 40, 18)
      break

    case 'unit':
      w = 40
      h = 52
      g.fillStyle(0x000000, 0.25).fillEllipse(20, 47, 30, 10)
      g.fillStyle(accent, 1).fillRoundedRect(6, 16, 28, 30, 8)
      g.fillStyle(color, 1).fillRoundedRect(6, 16, 19, 30, 8)
      g.fillStyle(color, 1).fillCircle(20, 13, 10)
      g.fillStyle(accent, 1).fillCircle(24, 13, 4)
      break

    case 'dot':
    default:
      w = 12
      h = 12
      g.fillStyle(accent, 1).fillCircle(6, 6, 6)
      g.fillStyle(color, 1).fillCircle(6, 6, 4)
      break
  }

  g.generateTexture(key, w, h)
  g.destroy()
}

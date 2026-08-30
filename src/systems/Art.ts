// The single place any sprite is named.
//
// Gameplay code asks for a *role* — the blast effect, the tower base, a grass
// variant — and this module resolves it through src/data/art.json. Nothing
// outside this file may mention a sprite key or a path, so dropping in new art
// is an edit to art.json and nothing else. A test enforces it.
//
// Two things make an art swap a config change rather than a code change:
//   `files`  keys map to paths under assetRoot, so a second art directory is
//            just a different prefix on the path.
//   `render` gives a key an anchor and an on-screen height, so art authored at
//            any source size lands correctly without a magic number in code.

import Phaser from 'phaser'
import type { ArtDef, SpriteRender } from '../types.ts'
import artData from '../data/art.json'
import type { RoadRole } from './SpritePicker.ts'

const art = artData as ArtDef

export { pickVariant, ROAD_ROLES } from './SpritePicker.ts'
export type { RoadRole } from './SpritePicker.ts'

export const ART = {
  assetRoot: art.assetRoot,
  credit: art.credit,
  /** Logical key -> path under assetRoot. Only the loader should need this. */
  files: art.files,
  ground: art.ground,
  ui: art.ui,
  fx: art.fx,
  decor: art.decor,
  generated: art.generated,
}

export const SPRITE_KEYS = Object.keys(art.files)

export function roadSpriteFor(role: RoadRole): string {
  return art.autotile[role]
}

/** Centred at natural size unless the manifest says otherwise. */
const DEFAULT_RENDER: SpriteRender = { anchorX: 0.5, anchorY: 0.5 }

export function renderFor(key: string): SpriteRender {
  return { ...DEFAULT_RENDER, ...(art.render[key] ?? {}) }
}

/**
 * Applies a key's anchor and on-screen height. Source art can be any size —
 * a 512px tower and a 64px tile both land at the height the manifest asks for,
 * with their aspect ratio preserved.
 */
export function applyRender(
  sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image,
  key: string,
  scale = 1,
): void {
  const cfg = renderFor(key)
  sprite.setOrigin(cfg.anchorX, cfg.anchorY)
  if (cfg.displayHeight !== undefined) {
    const factor = (cfg.displayHeight / sprite.height) * scale
    sprite.setScale(factor)
  } else if (scale !== 1) {
    sprite.setScale(scale)
  }
}

// The single place any sprite is named.
//
// Gameplay code asks for a *role* — the blast effect, the tower base, a grass
// variant — and this module resolves it through src/data/art.json. Nothing
// outside this file may mention a sprite key or a filename, so dropping in a
// new art pack is an edit to art.json and nothing else. A test enforces it.

import type { ArtDef } from '../types.ts'
import artData from '../data/art.json'
import type { RoadRole } from './SpritePicker.ts'

const art = artData as ArtDef

export { pickVariant, ROAD_ROLES } from './SpritePicker.ts'
export type { RoadRole } from './SpritePicker.ts'

export const ART = {
  basePath: art.basePath,
  credit: art.credit,
  /** Logical key -> filename. Only the loader should need this. */
  files: art.files,
  ground: art.ground,
  ui: art.ui,
  fx: art.fx,
  decor: art.decor,
}

export const SPRITE_KEYS = Object.keys(art.files)

export function roadSpriteFor(role: RoadRole): string {
  return art.autotile[role]
}

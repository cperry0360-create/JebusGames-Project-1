// Loads the Kenney Tower Defense (Top-Down) pack, CC0.
// art.json maps a logical key to the real filename in public/assets/kenney,
// so gameplay code never mentions towerDefense_tileNNN.png directly.

import Phaser from 'phaser'
import type { ArtDef } from '../types.ts'
import artData from '../data/art.json'

const art = artData as ArtDef

export const SPRITE_KEYS = Object.keys(art.sprites)
export const ART_CREDIT = art.credit

export function queueArt(scene: Phaser.Scene): void {
  for (const [key, file] of Object.entries(art.sprites)) {
    scene.load.image(key, `${art.basePath}${file}`)
  }
}

export function fileFor(key: string): string {
  return art.sprites[key]
}

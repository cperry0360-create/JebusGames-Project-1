// Loads the Kenney Tower Defense (Top-Down) pack, CC0.
// art.json maps a logical key to the real filename in public/assets/kenney,
// so gameplay code never mentions towerDefense_tileNNN.png directly.

import Phaser from 'phaser'
import { ART, SPRITE_KEYS } from './Art.ts'

export { SPRITE_KEYS }
export const ART_CREDIT = ART.credit

export function queueArt(scene: Phaser.Scene): void {
  for (const [key, file] of Object.entries(ART.files)) {
    scene.load.image(key, `${ART.basePath}${file}`)
  }
}

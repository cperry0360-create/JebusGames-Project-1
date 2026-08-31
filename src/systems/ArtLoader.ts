// Loads the Kenney Tower Defense (Top-Down) pack, CC0.
// art.json maps a logical key to the real filename in public/assets/kenney,
// so gameplay code never mentions towerDefense_tileNNN.png directly.

import Phaser from 'phaser'
import { ART, SPRITE_KEYS } from './Art.ts'
import { stamped } from './Build.ts'

export { SPRITE_KEYS }
export const ART_CREDIT = ART.credit

export function queueArt(scene: Phaser.Scene): void {
  // Stamped with the build id: these files live in public/ and are copied
  // verbatim, so they carry no content hash and a phone will otherwise serve
  // last week's art indefinitely.
  for (const [key, path] of Object.entries(ART.files)) {
    scene.load.image(key, stamped(`${ART.assetRoot}${path}`))
  }
}

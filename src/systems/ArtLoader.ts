// Loads every sprite the game draws, from the manifest and nowhere else.
// art.json maps a logical key to a real filename, so gameplay code never
// mentions a path — and says which of them are animation strips rather than
// single images.

import Phaser from 'phaser'
import { ART, renderFor, SPRITE_KEYS } from './Art.ts'
import { stamped } from './Build.ts'

export { SPRITE_KEYS }
export const ART_CREDIT = ART.credit

export function queueArt(scene: Phaser.Scene): void {
  // Stamped with the build id: these files live in public/ and are copied
  // verbatim, so they carry no content hash and a phone will otherwise serve
  // last week's art indefinitely.
  for (const [key, path] of Object.entries(ART.files)) {
    const url = stamped(`${ART.assetRoot}${path}`)
    // An effect is a strip of frames rather than one picture, and the manifest
    // is where that is declared — the loader is the only thing that needs to
    // know, and it reads it from the same place everything else does.
    const sheet = renderFor(key).sheet
    if (sheet) {
      scene.load.spritesheet(key, url, {
        frameWidth: sheet.frameWidth, frameHeight: sheet.frameHeight,
      })
    } else {
      scene.load.image(key, url)
    }
  }
}

// Loads every sprite the game draws, from the manifest and nowhere else.
// art.json maps a logical key to a real filename, so gameplay code never
// mentions a path — and says which of them are animation strips rather than
// single images.

import Phaser from 'phaser'
import { ART, isPlateKey, renderFor, SPRITE_KEYS } from './Art.ts'
import { stamped } from './Build.ts'

export { SPRITE_KEYS }
export const ART_CREDIT = ART.credit

/** Queues one manifest key, sheet or single image, from the manifest alone. */
function queueOne(scene: Phaser.Scene, key: string): void {
  const url = stamped(`${ART.assetRoot}${ART.files[key]}`)
  const sheet = renderFor(key).sheet
  if (sheet) {
    scene.load.spritesheet(key, url, {
      frameWidth: sheet.frameWidth, frameHeight: sheet.frameHeight,
    })
  } else {
    scene.load.image(key, url)
  }
}

/**
 * The level's own map plate, loaded on the way into that level.
 *
 * NOT AT BOOT, and this is the whole point. `queueArt` used to queue all five
 * plates with everything else, so a player sitting on the title screen was
 * already holding 134.5 MB of board art for levels they had not chosen — and
 * on the world map, where the crash was reported, the total measured 365.6 MB.
 * A plate is one decode and this game does not stream, so fetching it per
 * level costs a load screen and nothing else.
 *
 * Already-present is not an error: Phaser's loader skips a key the texture
 * manager already holds, so a restart of the same level is free.
 */
export function queuePlate(scene: Phaser.Scene, key: string): boolean {
  if (!ART.files[key] || scene.textures.exists(key)) return false
  queueOne(scene, key)
  return true
}

export function queueArt(scene: Phaser.Scene): void {
  // Stamped with the build id: these files live in public/ and are copied
  // verbatim, so they carry no content hash and a phone will otherwise serve
  // last week's art indefinitely.
  for (const key of Object.keys(ART.files)) {
    // EVERY PLATE EXCEPT THE ONE BEING PLAYED IS DEAD WEIGHT. They are the
    // only art excluded here, and GameScene.preload queues the one its level
    // needs — see `queuePlate` above and the shutdown that frees it again.
    if (isPlateKey(key)) continue
    // An effect is a strip of frames rather than one picture, and the manifest
    // is where that is declared — the loader is the only thing that needs to
    // know, and it reads it from the same place everything else does.
    // Nothing is done here for an optional file that is absent, and that is
    // the point. Phaser's loader already carries on past a 404 — it emits
    // FILE_LOAD_ERROR and finishes the queue — so the texture simply does not
    // exist afterwards. The listener that used to sit here swallowed nothing
    // and prevented nothing; what actually stopped the game was BootScene
    // refusing to start Splash, which is where the tolerance belongs and now
    // is.
    queueOne(scene, key)
  }
}

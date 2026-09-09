// Loads every sprite the game draws, from the manifest and nowhere else.
// art.json maps a logical key to a real filename, so gameplay code never
// mentions a path — and says which of them are animation strips rather than
// single images.

import Phaser from 'phaser'
import { ART, renderFor, SPRITE_KEYS } from './Art.ts'
import { isLevelArtKey, levelArtKeys } from './LevelArt.ts'
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
 * Everything the level about to be played needs, loaded on the way into it.
 *
 * NOT AT BOOT, and this is the whole point. `queueArt` used to queue the
 * entire manifest, so a player sitting on the title screen was already holding
 * 134.5 MB of board art for levels they had not chosen and 124.7 MB of
 * enemies, effects and props for a run they had not started — measured, on the
 * world map where the crash was reported, at 365.6 MB in total. Nothing here
 * streams: it is one decode per file, out of the HTTP cache on every entry
 * after the first.
 *
 * The plate went first, in reports/2026-09-07-the-crash.md; the enemies and
 * the effects followed it in reports/2026-09-08-the-memory-numbers.md. What a
 * level asks for is `LevelArt.levelArtKeys` — its plate, its own enemies and
 * the shared in-play art — and `GameScene.freeLevelArt` gives all of it back.
 *
 * Already-present is not an error: Phaser's loader skips a key the texture
 * manager already holds, so a restart of the same level is free.
 *
 * WHAT DID NOT ARRIVE IS REPORTED HERE and not by BootScene's banner, because
 * boot's banner reads `REQUIRED_SPRITE_KEYS` and that list deliberately
 * excludes level art — announcing a plate absent on every single boot is how a
 * warning banner becomes wallpaper. So the check moved to the one place that
 * actually asks for the art. Console rather than a banner: this fires while a
 * board is being built, and the thing a player needs then is the board.
 */
export function queueLevelArt(scene: Phaser.Scene, levelId: string | null | undefined): void {
  const queued: string[] = []
  for (const key of levelArtKeys(levelId)) {
    if (!ART.files[key] || scene.textures.exists(key)) continue
    queueOne(scene, key)
    queued.push(key)
  }
  scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
    const missing = queued.filter((k) => !scene.textures.exists(k))
    if (missing.length > 0) console.error('[art] LEVEL ART DID NOT LOAD:', missing.join(', '))
  })
}

export function queueArt(scene: Phaser.Scene): void {
  // Stamped with the build id: these files live in public/ and are copied
  // verbatim, so they carry no content hash and a phone will otherwise serve
  // last week's art indefinitely.
  for (const key of Object.keys(ART.files)) {
    // ART A MENU NEVER DRAWS IS DEAD WEIGHT ON EVERY MENU. The plates, the
    // enemies and the in-play effects and props are excluded here, and
    // GameScene.preload queues the ones its level needs — see `queueLevelArt`
    // above and the shutdown that frees them again. Everything else is menu
    // art, or art a menu shares with the board, and stays.
    if (isLevelArtKey(key)) continue
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

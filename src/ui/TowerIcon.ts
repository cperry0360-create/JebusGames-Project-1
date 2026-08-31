import Phaser from 'phaser'
import { ART, applyRender, renderFor } from '../systems/Art.ts'
import { greyKey } from '../systems/Desaturate.ts'

/**
 * One tower portrait, used by the build menu and the draft screen so both
 * follow the manifest automatically. Art is bottom-anchored and fitted to the
 * box height, so a 512px source and a 64px source both land the same.
 */
export function towerIcon(
  scene: Phaser.Scene,
  x: number,
  baselineY: number,
  spriteKey: string,
  boxHeight: number,
  /** Draws the greyscale copy, for a tower that cannot be afforded. */
  grey = false,
): Phaser.GameObjects.Image[] {
  const out: Phaser.GameObjects.Image[] = []

  if (ART.ui.towerBase !== null) {
    const base = scene.add.image(x, baselineY, ART.ui.towerBase).setOrigin(0.5, 0.5)
    applyRender(base, ART.ui.towerBase)
    base.setScale((boxHeight * 0.42) / base.height)
    out.push(base)
  }

  // Same anchor the world uses, so art with padded canvases lines up in the
  // menu exactly as it does on a tile. Only the scale differs.
  const cfg = renderFor(spriteKey)
  const drawKey = grey && scene.textures.exists(greyKey(spriteKey)) ? greyKey(spriteKey) : spriteKey
  const art = scene.add.image(x, baselineY, drawKey).setOrigin(cfg.anchorX, cfg.anchorY)
  // Fitted by the artwork's own bounds, so a wide tower cannot spill out of
  // its cell and a padded canvas is not drawn smaller than the rest.
  const box = boxHeight * 0.86
  art.setScale(Math.min(box / (cfg.contentHeight ?? art.height), box / (cfg.contentWidth ?? art.width)))
  out.push(art)

  return out
}

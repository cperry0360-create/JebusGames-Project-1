import Phaser from 'phaser'
import { ART, applyRender } from '../systems/Art.ts'

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
): Phaser.GameObjects.Image[] {
  const out: Phaser.GameObjects.Image[] = []

  if (ART.ui.towerBase !== null) {
    const base = scene.add.image(x, baselineY, ART.ui.towerBase).setOrigin(0.5, 0.5)
    applyRender(base, ART.ui.towerBase)
    base.setScale((boxHeight * 0.42) / base.height)
    out.push(base)
  }

  const art = scene.add.image(x, baselineY, spriteKey).setOrigin(0.5, 1)
  art.setScale((boxHeight * 0.86) / art.height)
  out.push(art)

  return out
}

// Shared presentation helpers: drop shadows, floating damage numbers, death
// puffs. Every number comes from presentation.json.

import Phaser from 'phaser'
import presentationData from '../data/presentation.json'
import { GROUND_DEPTH } from './DepthSort.ts'
import { ART } from './Art.ts'

export const PRESENTATION = presentationData

/** A squashed dark ellipse sprite reused as the shadow for any unit. */
export function makeShadow(scene: Phaser.Scene, spriteKey: string, scale = 1): Phaser.GameObjects.Sprite {
  const s = PRESENTATION.shadow
  return scene.add
    .sprite(0, s.offsetY, spriteKey)
    .setTint(0x000000)
    .setAlpha(s.alpha)
    .setScale(scale * s.scaleX, scale * s.scaleY)
}

/** Rising damage number. Crits (or anything flagged big) read larger and gold. */
export function floatingDamage(
  scene: Phaser.Scene,
  x: number,
  y: number,
  amount: number,
  big = false,
): void {
  const d = PRESENTATION.damageNumbers
  const text = scene.add
    .text(x, y - 18, String(Math.max(1, Math.round(amount))), {
      fontFamily: 'KenneyFuture, monospace',
      fontSize: `${big ? d.critFontSize : d.fontSize}px`,
      color: big ? '#ffd45e' : '#ffffff',
      stroke: '#1a1208',
      strokeThickness: big ? 5 : 4,
    })
    .setOrigin(0.5)
    .setDepth(y + 800)

  scene.tweens.add({
    targets: text,
    y: y - 18 - d.risePixels,
    alpha: 0,
    duration: d.durationMs,
    ease: 'Quad.easeOut',
    onComplete: () => text.destroy(),
  })
}

/** Puff left behind when something dies. */
export function deathPuff(scene: Phaser.Scene, x: number, y: number, tint = 0xf6ecd9): void {
  for (let i = 0; i < 3; i++) {
    const a = Math.random() * Math.PI * 2
    const puff = scene.add
      .image(x, y, ART.fx.spark)
      .setTint(tint)
      .setDepth(y + 3)
      .setScale(0.35)
      .setAlpha(0.9)
    scene.tweens.add({
      targets: puff,
      x: x + Math.cos(a) * 20,
      y: y + Math.sin(a) * 20 - 8,
      scale: 0.05,
      alpha: 0,
      angle: 140,
      duration: PRESENTATION.deathPuffMs,
      ease: 'Quad.easeOut',
      onComplete: () => puff.destroy(),
    })
  }
}

/** Brief flash at a tower's muzzle when it fires. */
export function muzzleFlash(scene: Phaser.Scene, x: number, y: number, angle: number): void {
  const flash = scene.add
    .image(x, y, ART.fx.muzzle)
    .setDepth(y + 4)
    .setScale(PRESENTATION.muzzleFlashScale)
    .setRotation(angle)
  scene.tweens.add({
    targets: flash,
    alpha: 0,
    scale: PRESENTATION.muzzleFlashScale * 1.5,
    duration: PRESENTATION.muzzleFlashMs,
    onComplete: () => flash.destroy(),
  })
}

export const DECOR_DEPTH = GROUND_DEPTH + 3

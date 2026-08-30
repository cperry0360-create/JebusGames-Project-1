// Shared presentation helpers: drop shadows, floating damage numbers, death
// puffs. Every number comes from presentation.json.

import Phaser from 'phaser'
import presentationData from '../data/presentation.json'
import { ART, renderFor } from './Art.ts'

export const PRESENTATION = presentationData

/**
 * Builds the one soft ellipse every ground shadow reuses. Concentric ellipses
 * of falling alpha give a soft edge without a blur pass. Called once at boot.
 */
export function ensureShadowTexture(scene: Phaser.Scene): void {
  const key = ART.generated.groundShadow
  if (scene.textures.exists(key)) return

  const s = PRESENTATION.shadow
  const w = s.textureWidth
  const h = s.textureHeight
  const g = scene.make.graphics({ x: 0, y: 0 }, false)
  for (let i = s.softLayers; i >= 1; i--) {
    const t = i / s.softLayers
    g.fillStyle(0x000000, (1 / s.softLayers) * 0.9)
    g.fillEllipse(w / 2, h / 2, w * t, h * t)
  }
  g.generateTexture(key, w, h)
  g.destroy()
}

/**
 * A soft elliptical shadow sized to a sprite's footprint. Taking the width
 * from the art rather than squashing a copy of it means a tall sprite still
 * gets a shadow that looks like it is standing on the ground.
 */
export function makeShadow(scene: Phaser.Scene, spriteKey: string, scale = 1): Phaser.GameObjects.Image {
  const s = PRESENTATION.shadow
  // shadowWidth is the ellipse itself, measured from the art's base, so the
  // shadow reaches slightly past the base rather than hiding behind it.
  const width = (renderFor(spriteKey).shadowWidth ?? s.defaultWidth) * scale
  const img = scene.add.image(0, s.offsetY, ART.generated.groundShadow).setAlpha(s.alpha)
  img.setDisplaySize(width, width * s.heightRatio)
  return img
}

/** Rising damage number. Crits (or anything flagged big) read larger and amber. */
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

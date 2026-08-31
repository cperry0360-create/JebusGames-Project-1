// Shared presentation helpers: drop shadows, floating damage numbers, death
// puffs. Every number comes from presentation.json.

import Phaser from 'phaser'
import presentationData from '../data/presentation.json'
import { applyRender, ART, renderFor } from './Art.ts'
import { EFFECT_MS, playEffect } from './Effects.ts'

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
  // Ellipses of equal alpha stacked outermost-first, so alpha accumulates
  // toward the middle. Raising the radius to a power above 1 bunches the
  // layers into the centre: a tight, nearly solid core where the sprite meets
  // the ground, easing to nothing at the rim. A linear ramp gave a flat grey
  // disc, which is what made every sprite look like it was hovering over its
  // own shadow rather than standing on it.
  for (let i = s.softLayers; i >= 1; i--) {
    const t = Math.pow(i / s.softLayers, s.falloff)
    g.fillStyle(0x000000, 1 / s.softLayers)
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
  /** Overrides the number, for things that are not damage. */
  label?: string,
): void {
  const d = PRESENTATION.damageNumbers
  const text = scene.add
    .text(x, y - 18, label ?? String(Math.max(1, Math.round(amount))), {
      fontFamily: 'KenneyFuture, monospace',
      fontSize: `${big ? d.critFontSize : d.fontSize}px`,
      color: big ? '#ffd45e' : '#ffffff',
      stroke: '#1a1208',
      strokeThickness: big ? 5 : 4,
    })
    .setOrigin(0.5)
    .setDepth(y + 800)

  // Kept on screen: a long label on something near the edge was half cut off.
  const half = text.width / 2 + 6
  text.x = Phaser.Math.Clamp(text.x, half, scene.cameras.main.width - half)

  scene.tweens.add({
    targets: text,
    y: y - 18 - d.risePixels,
    alpha: 0,
    duration: d.durationMs,
    ease: 'Quad.easeOut',
    onComplete: () => text.destroy(),
  })
}

/**
 * What is left where something died.
 *
 * One animation, not three sprites thrown outward: the old version faked a
 * spread by scattering three copies of a single tile, and the sheet already
 * contains that spread in its frames.
 */
export function deathPuff(scene: Phaser.Scene, x: number, y: number, tint = 0xf6ecd9): void {
  playEffect(scene, ART.fx.puff, x, y - 8, {
    size: EFFECT_MS.deathPuffSize,
    depth: y + 3,
    durationMs: EFFECT_MS.deathPuffMs,
    tint: tint === 0xf6ecd9 ? undefined : tint,
  })
}

/**
 * Brief flash at a tower's muzzle when it fires.
 *
 * Anchored on the base of the flame rather than its middle, so it comes out
 * of the barrel instead of straddling it, and turned a quarter more than the
 * firing angle because the art points up while the angle is measured from the
 * +x axis. The pack tile it replaces also pointed up and was rotated by the
 * bare angle, so every muzzle flash in the game has been ninety degrees out
 * since it was written — invisible at 24px for a tenth of a second, and wrong.
 */
export function muzzleFlash(scene: Phaser.Scene, x: number, y: number, angle: number): void {
  const flash = scene.add.image(x, y, ART.fx.muzzle).setDepth(y + 4)
  applyRender(flash, ART.fx.muzzle)
  flash.setRotation(angle + Math.PI / 2)
  // It grows as it fades. Sized from the manifest, so this is a multiple of
  // whatever size that asked for rather than an absolute scale.
  const base = flash.scale
  scene.tweens.add({
    targets: flash,
    alpha: 0,
    scale: base * PRESENTATION.effects.muzzleGrow,
    duration: PRESENTATION.effects.muzzleMs,
    onComplete: () => flash.destroy(),
  })
}

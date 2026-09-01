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
/**
 * The build marker, drawn rather than uploaded.
 *
 * Exactly one build pad keeps the painted DO NOT BUILD HERE sign; the other
 * six get this. It was specified as a manifest hook with a fallback to the
 * sign — and the art has not landed, so every pad fell back and the board had
 * SEVEN full-size signs on it shouting the same joke. A hook cannot be the
 * whole answer when the fallback is the thing being fixed, so it is generated
 * at boot like the ground shadow and the tavern glow. The uploaded pad art
 * named in art.json still takes precedence the moment it exists.
 *
 * The first version of this was a small brown smudge, and a smudge is what it
 * read as: nothing about it said a tower could go there, and next to a rock it
 * WAS a rock. What separates a buildable slot from a piece of scenery is
 * REGULARITY — scatter props are irregular blobs at odd rotations, so the pad
 * is a perfect ellipse with a hard kerb ring and four evenly spaced pegs on
 * the compass points. Nothing that grew there is that symmetrical. It is also
 * sized to the footprint a tower actually stands on rather than to a coin,
 * because "how big is the thing I am about to place" is the question the
 * marker exists to answer.
 */
export function ensureBuildPadTexture(scene: Phaser.Scene): void {
  const key = ART.generated.buildPad
  if (scene.textures.exists(key)) return

  const cfg = PRESENTATION.buildPad.marker
  const w = cfg.textureWidth
  const h = cfg.textureHeight
  const g = scene.make.graphics({ x: 0, y: 0 }, false)

  const cx = w / 2
  const cy = h / 2
  // The kerb is the outermost thing, so the ellipse it rings is inset by its
  // own width plus the soft halo outside it.
  const rx = w * 0.42
  const ry = h * 0.42

  // A soft halo, so the pad sits in the grass instead of being stuck on top of
  // it. Concentric and cheap, the same trick the ground shadow uses.
  for (let i = cfg.softLayers; i >= 1; i--) {
    const t = i / cfg.softLayers
    g.fillStyle(cfg.rimColor, 0.45 / cfg.softLayers)
    g.fillEllipse(cx, cy, rx * 2 * t * 1.2, ry * 2 * t * 1.2)
  }

  // Prepared earth: raked flat, a shade lighter in the middle where the light
  // falls, so it does not read as a hole.
  g.fillStyle(cfg.soilDark, 1)
  g.fillEllipse(cx, cy, rx * 2, ry * 2)
  g.fillStyle(cfg.soilColor, 1)
  g.fillEllipse(cx, cy - ry * 0.06, rx * 1.82, ry * 1.72)

  // The kerb. Two strokes rather than one: a lit top edge and a shadowed
  // under-edge, which is what makes a flat ring read as a raised lip.
  g.lineStyle(cfg.kerbWidth, cfg.kerbDark, 1)
  g.strokeEllipse(cx, cy + cfg.kerbWidth * 0.4, rx * 2, ry * 2)
  g.lineStyle(cfg.kerbWidth, cfg.kerbColor, 1)
  g.strokeEllipse(cx, cy, rx * 2, ry * 2)

  // Four pegs on the compass points. Evenly spaced and identical, which is the
  // whole point: nothing in the scatter layer is evenly spaced.
  g.fillStyle(cfg.pegColor, 1)
  for (const a of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    g.fillEllipse(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, cfg.pegSize, cfg.pegSize * 0.75)
  }

  // A faint cross in the middle, the way a survey mark is set out. It says
  // "this spot", where an empty disc only says "this area".
  g.lineStyle(cfg.crossWidth, cfg.kerbColor, cfg.crossAlpha)
  g.lineBetween(cx - rx * 0.30, cy, cx + rx * 0.30, cy)
  g.lineBetween(cx, cy - ry * 0.34, cx, cy + ry * 0.34)

  g.generateTexture(key, w, h)
  g.destroy()
}

/**
 * The glow that finds the eye, as its own texture so the pulse can be an alpha
 * tween on one image rather than a Graphics redraw every frame on seven of
 * them. Soft, warm and edgeless: the pad carries the shape, this carries only
 * the "look here".
 */
export function ensureBuildGlowTexture(scene: Phaser.Scene): void {
  const key = ART.generated.buildGlow
  if (scene.textures.exists(key)) return

  const cfg = PRESENTATION.buildPad.glow
  const w = cfg.textureWidth
  const h = cfg.textureHeight
  const g = scene.make.graphics({ x: 0, y: 0 }, false)
  for (let i = cfg.softLayers; i >= 1; i--) {
    const t = i / cfg.softLayers
    g.fillStyle(cfg.color, 1 / cfg.softLayers)
    g.fillEllipse(w / 2, h / 2, w * t, h * t)
  }
  g.generateTexture(key, w, h)
  g.destroy()
}

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
  /** Bigger than a normal hit, for a hit that is. */
  scale = 1,
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

  // A number that lands bigger than it settles. Only the ones asked for it get
  // it: an ordinary tower hit does not need a flourish, and Haymaker does.
  if (scale !== 1) {
    text.setScale(scale * 1.35)
    scene.tweens.add({ targets: text, scale, duration: 150, ease: 'Back.easeOut' })
  }

  scene.tweens.add({
    targets: text,
    y: y - 18 - d.risePixels * (scale > 1 ? 1.6 : 1),
    alpha: 0,
    duration: d.durationMs * (scale > 1 ? 1.5 : 1),
    ease: 'Quad.easeOut',
    onComplete: () => text.destroy(),
  })
}

/**
 * A beat of stillness on impact.
 *
 * The oldest trick in the book and the reason a big hit feels big: the frame
 * where the punch lands is held, so the eye reads a collision rather than a
 * number changing. Everything the world simulates runs off one scaled delta,
 * so pausing is one flag rather than a per-system freeze.
 */
export function hitPause(scene: Phaser.Scene, ms: number, hold: (on: boolean) => void): void {
  if (ms <= 0) return
  hold(true)
  scene.time.delayedCall(ms, () => hold(false))
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

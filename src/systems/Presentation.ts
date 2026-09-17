// Shared presentation helpers: drop shadows, floating damage numbers, death
// puffs. Every number comes from presentation.json.

import Phaser from 'phaser'
import presentationData from '../data/presentation.json'
import { applyRender, ART, renderFor } from './Art.ts'
import { deviceScale } from './Resolution.ts'
import { EFFECT_MS, playEffect } from './Effects.ts'

export const PRESENTATION = presentationData

/**
 * Builds the one soft ellipse every ground shadow reuses. Concentric ellipses
 * of falling alpha give a soft edge without a blur pass. Called once at boot.
 */
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

/**
 * The stand-in for a UI icon whose file did not arrive.
 *
 * The build-pad miss taught this the expensive way: an optional asset that
 * silently falls back to nothing is indistinguishable from a broken screen,
 * and one that fails loudly takes the game down with it. So a missing icon
 * draws THIS — an obviously-wrong dashed box with a question mark, at the
 * right size and in the right place. The button still works, the layout still
 * holds, and anyone looking at it can see exactly which slot is empty.
 *
 * BootScene logs which keys were missing alongside it, so it is findable in
 * the console as well as visible on the glass.
 */
export function ensureIconFallbackTexture(scene: Phaser.Scene): void {
  const key = ART.generated.iconMissing
  if (scene.textures.exists(key)) return

  const cfg = PRESENTATION.iconFallback
  const n = cfg.size
  const g = scene.make.graphics({ x: 0, y: 0 }, false)
  const inset = n * 0.12
  const side = n - inset * 2

  g.fillStyle(cfg.fillColor, cfg.fillAlpha)
  g.fillRoundedRect(inset, inset, side, side, n * 0.1)
  // Dashed, because a solid box reads as a deliberate shape and this must
  // read as an absence.
  g.lineStyle(cfg.strokeWidth, cfg.strokeColor, 1)
  const dashes = 8
  for (let i = 0; i < dashes * 4; i += 2) {
    const t = (i % (dashes * 4)) / (dashes * 4)
    const along = t * 4
    const seg = Math.floor(along)
    const f = along - seg
    const pts = [
      [inset + side * f, inset], [n - inset, inset + side * f],
      [n - inset - side * f, n - inset], [inset, n - inset - side * f],
    ][seg] ?? [inset, inset]
    g.fillStyle(cfg.strokeColor, 1)
    g.fillRect(pts[0]! - cfg.strokeWidth / 2, pts[1]! - cfg.strokeWidth / 2,
      cfg.strokeWidth * 3, cfg.strokeWidth * 3)
  }
  // The mark itself: a stem and a dot, drawn rather than typed so this needs
  // no font to have loaded.
  g.fillStyle(cfg.markColor, 1)
  g.fillRoundedRect(n * 0.44, n * 0.30, n * 0.12, n * 0.30, n * 0.05)
  g.fillCircle(n * 0.5, n * 0.70, n * 0.075)

  g.generateTexture(key, n, n)
  g.destroy()
}

/**
 * THE LADS' FLAG, drawn into whatever Graphics is handed to it.
 *
 * One shape at two sizes and in two places: the MOVE button on an Ima Dummy
 * Tower's ring, as a generated texture, and the mark standing on the rally
 * point while that tower is selected, drawn straight onto the board. They are
 * the same picture on purpose -- the button says "move this", and the thing
 * that then moves has to be recognisably the thing the button showed.
 *
 * `x`/`y` is the FOOT of the pole, because that is what both callers know: on
 * the board it is the rally point itself, standing on the road like everything
 * else does.
 */
export function flagInto(
  g: Phaser.GameObjects.Graphics, x: number, y: number, height: number,
): void {
  const cfg = PRESENTATION.rallyFlag
  const pole = Math.max(1, height * cfg.poleWidth)
  g.fillStyle(cfg.poleColour, 1)
  g.fillRect(x - pole / 2, y - height, pole, height)
  // A pennant rather than a rectangle: it reads as a flag at 30px on a moving
  // board, where a small rectangle on a stick reads as a signpost.
  g.fillStyle(cfg.clothColour, 1)
  g.fillTriangle(
    x, y - height,
    x + height * cfg.clothWidth, y - height + (height * cfg.clothHeight) / 2,
    x, y - height + height * cfg.clothHeight,
  )
}

/**
 * The flag as a texture, for the one place that needs an Image rather than a
 * Graphics: the ring button's glyph.
 *
 * Generated rather than drawn from a file because there is no flag in
 * `art.json` -- see the icon list, which is nine action glyphs and no tenth --
 * and a MOVE button showing the missing-icon box is a button nobody presses.
 * `TowerRing.makeGlyph` still falls back to the named icon if this texture is
 * somehow absent, so the button cannot end up blank.
 */
export function ensureRallyFlagTexture(scene: Phaser.Scene): void {
  const key = ART.generated.rallyFlag
  if (scene.textures.exists(key)) return

  const cfg = PRESENTATION.rallyFlag
  const n = cfg.textureSize
  const g = scene.make.graphics({ x: 0, y: 0 }, false)
  flagInto(g, n * 0.3, n * 0.95, n * 0.88)
  g.generateTexture(key, n, n)
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

/**
 * A rising WORD over a unit. Not a number, and it cannot be one.
 *
 * THE FLOATING DAMAGE NUMBERS ARE GONE, 2026-09-17, and this is what is left
 * of `floatingDamage`. Live play read them as glitches: a tower firing twice a
 * second put a 15px figure on the board for 620ms per shot, and with four
 * towers and a wave on the lane the board flickered with text that appeared
 * and vanished too fast to be legible. Nothing could be read off them that the
 * health bar over the enemy's own head does not say more steadily.
 *
 * WHAT SURVIVES IS THE LINE THE BRIEF DREW: an effect that says WHAT SOMETHING
 * DID stays; an effect that only says A NUMBER HAPPENED goes. Bark deals zero
 * damage by design and its whole output is a slow, so the word SLOW over each
 * enemy it caught is the only thing that distinguishes a slow that landed from
 * one that missed -- and it is a word, so no quantity is being reported and
 * there is nothing to shrink or fade. It is the ONE caller, deliberately: the
 * moment this takes a number again it is `floatingDamage` under a new name.
 */
export function floatingLabel(scene: Phaser.Scene, x: number, y: number, label: string): void {
  const d = PRESENTATION.floatingLabel
  const text = scene.add
    .text(x, y - 18, label, {
      fontFamily: 'KenneyFuture, monospace',
      fontSize: `${d.fontSize}px`,
      color: '#cfe6ff',
      stroke: '#1a1208',
      strokeThickness: 4,
    })
    .setOrigin(0.5)
    .setDepth(y + 800)

  // Kept on screen: a long label on something near the edge was half cut off.
  const half = text.width / 2 + 6
  // Divided by the device scale so this stays exactly the number it was
  // before the canvas went to device resolution. It compares a world x against
  // a camera pixel width, which was always approximate; making it correct is a
  // separate change from making the canvas sharp.
  text.x = Phaser.Math.Clamp(text.x, half, scene.cameras.main.width / deviceScale() - half)

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

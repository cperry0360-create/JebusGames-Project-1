// Animated effects: explosions, hit sparks, death puffs.
//
// What this replaces: one 32x32 Kenney tile doing five jobs, and one 23x34
// tile scaled from half size to full over 280ms standing in for every
// explosion in the game. Tweening the size of a single picture reads as a
// balloon inflating, not as something going off — KENNEY-INVENTORY.md called
// the blast the single highest-value piece of art to replace, and it was
// right.
//
// The frames now carry the growth and the decay, so nothing here tweens a
// scale. An effect is played at **one fixed display size** and the artwork
// does the rest, which is why the sheets were authored with their relative
// sizes preserved across the sequence.

import Phaser from 'phaser'
import { ART, renderFor } from './Art.ts'
import presentationData from '../data/presentation.json'

const FX = presentationData.effects

/** Every frame in these sheets is centred in its cell, and the peak frame
 *  fills about this much of it. Turning a blast *radius* into a display size
 *  goes through here, so a 66px meteor really does cover 66px. */
const PEAK_FILL = 0.88

export interface EffectOptions {
  /** On-screen size of the frame box. The visible art peaks at ~88% of it. */
  size: number
  /** On-screen height, when the sheet's cells are not square. The three
   *  original sheets are, so `size` alone was enough until the boss's bolt
   *  (482x412) and stun overlay (617x499) arrived; forcing those into a square
   *  squashes them by 15% and 19%. Absent means square, as before. */
  height?: number
  depth: number
  durationMs: number
  tint?: number
  /** 0.5 by default; a ground-level effect can be anchored on its feet. */
  originY?: number
}

/**
 * Registers one animation per sheet in the manifest. Phaser's animation
 * manager is global, so this runs once at boot and every scene can play them.
 */
export function registerEffectAnims(scene: Phaser.Scene): void {
  for (const key of Object.keys(ART.files)) {
    const sheet = renderFor(key).sheet
    if (!sheet) continue
    if (scene.anims.exists(key)) continue
    scene.anims.create({
      key,
      frames: scene.anims.generateFrameNumbers(key, { start: 0, end: sheet.frames - 1 }),
      // Overridden per play: the same explosion is 280ms off a tower and
      // 320ms off an ability.
      frameRate: (sheet.frames * 1000) / FX.blastMs,
      repeat: 0,
    })
  }
}

/**
 * Plays one effect and cleans it up after itself.
 *
 * Returns the sprite so a caller can hand it to a camera — GameScene splits
 * its children between a world camera and a fixed UI one, and anything
 * created after the split has to be told which it belongs to.
 */
export function playEffect(
  scene: Phaser.Scene,
  key: string,
  x: number,
  y: number,
  opts: EffectOptions,
): Phaser.GameObjects.Sprite {
  const s = scene.add.sprite(x, y, key)
  s.setOrigin(0.5, opts.originY ?? 0.5)
  s.setDisplaySize(opts.size, opts.height ?? opts.size)
  s.setDepth(opts.depth)
  if (opts.tint !== undefined) s.setTint(opts.tint)
  // `duration` is the whole animation, which is what the call sites think in.
  s.play({ key, duration: opts.durationMs })
  s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy())
  return s
}

/** The display size that makes an effect's peak frame cover `radius`. */
export function sizeForRadius(radius: number): number {
  return (radius * 2) / PEAK_FILL
}

export const EFFECT_MS = FX

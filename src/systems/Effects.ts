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
 * Registers one animation per sheet whose texture is loaded.
 *
 * Phaser's animation manager is global, so an animation registered anywhere
 * can be played everywhere — which is why this used to run once at boot and
 * never again.
 *
 * IT RUNS TWICE NOW, and the second time is the one that matters. Every sheet
 * in the manifest is an `fx-` key and every `fx-` key is level art, so at boot
 * there is nothing here to register: the textures arrive with the level. The
 * skip below is what makes calling it again safe rather than merely harmless —
 * `generateFrameNumbers` on a key the texture manager does not hold produces
 * an animation with no frames, and an effect that plays no frames is invisible
 * rather than loud. GameScene calls this after its own load completes.
 */
export function registerEffectAnims(scene: Phaser.Scene): void {
  for (const key of Object.keys(ART.files)) {
    const sheet = renderFor(key).sheet
    if (!sheet) continue
    if (scene.anims.exists(key)) continue
    // The texture is what the frames are cut from. Without this an animation
    // registered before its art lands is an empty one, and it would then be
    // skipped for the rest of the session by the line above.
    if (!scene.textures.exists(key)) continue
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
 * Drops every animation cut from a texture that is about to be freed.
 *
 * AN ANIMATION OUTLIVES ITS TEXTURE, and that is the trap in freeing effect
 * art. `anims.create` stores frame objects belonging to the texture they were
 * cut from; removing the texture leaves those frames dangling, and because
 * `registerEffectAnims` skips a key `anims.exists` already knows, the next
 * level would reuse the dangling animation rather than cutting fresh frames
 * from the texture it just loaded. The effect plays, and plays nothing.
 *
 * Called from the same shutdown that frees the textures, with the same keys.
 *
 * IT ASKS THE TEXTURE, NOT THE NAME, and that is the whole of the change. This
 * used to remove the animation whose KEY equalled the texture key, which is
 * true of every clip `registerEffectAnims` builds and of nothing else. The
 * Mind Laser's strip is cut into three clips named `<key>-charge`,
 * `<key>-sustain` and `<key>-fade` by `GameScene.ensureLaserAnims`, none of
 * which matched — so all three survived every shutdown holding frames from a
 * destroyed texture, and the next level's first press went through
 * `Frame.realWidth`, which is `this.data.sourceSize.w`, on a frame whose
 * `data` `Frame.destroy()` had set to null:
 *
 *     TypeError: null is not an object (evaluating 'this.data.sourceSize')
 *
 * A texture's frames are the one thing that cannot be wrong about which
 * animations belong to it. Naming conventions can be, and this one was: a list
 * of suffixes maintained by hand is correct exactly until somebody adds a
 * fourth clip, and the failure is a crash two levels into a session on a
 * phone. See reports/2026-09-10-the-null-frame.md.
 *
 * `getAnimsFromTexture` IS PHASER'S OWN ANSWER to that question — it walks
 * every registered animation and matches `frame.textureKey` — so this asks the
 * engine rather than keeping a second copy of the rule that could drift from
 * what the frames actually say.
 */
export function forgetEffectAnims(scene: Phaser.Scene, keys: readonly string[]): void {
  for (const key of keys) {
    // ONLY FOR A TEXTURE THAT IS ACTUALLY LOADED. `getAnimsFromTexture` looks
    // the key up through the texture manager, and that hands back the
    // `__MISSING` placeholder for a key it does not hold — so asking about a
    // key this level never loaded would return the animations belonging to
    // the placeholder and remove those instead. `freeLevelArt` is given a
    // whole level's manifest and guards its own removal the same way.
    if (!scene.textures.exists(key)) continue
    for (const anim of scene.anims.getAnimsFromTexture(key)) scene.anims.remove(anim)
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

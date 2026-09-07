// THE ART THE TEN HERO POWERS DRAW, in one file.
//
// This file used to be the placeholder: five procedural shapes — an expanding
// ring, a stab, a swept band, a toothed rectangle — tinted to the hero and
// sized to the power's real radius, written so a first balance pass could
// answer "is that radius right?" before any art existed. Its own header said
// it was one file to delete when the art landed.
//
// The art has landed and the file is not deleted, because the interesting half
// of it was never the shapes. It was the SIZING RULE: nothing here invents a
// size, every call takes the radius out of heroes.json, and what the player
// sees is what the rule uses. A picture drawn at a fixed pixel size would
// break that the first time a radius was tuned — the power would change and
// its visual would not — so the pictures are fitted to the same numbers the
// rings were.
//
// So: same rule, real art. Each function takes an art.json KEY and the world
// geometry the power actually uses, and scales the one to the other.
//
// Everything cleans itself up. The two exceptions hand back a handle, because
// the scene owns their life: the Spike Strip's band, which persists for its
// eight seconds, and a status marker, which lives as long as the status on the
// enemy it follows.

// TYPE-ONLY. Every Phaser name here is the type of something handed in — a
// Scene, its sprites — so importing the engine as a value would give this
// module a runtime dependency it does not have. Same rule as `EdgeDock`.
import type Phaser from 'phaser'
import { PRESENTATION } from './Presentation.ts'
import { renderFor } from './Art.ts'

const FX = PRESENTATION.heroFx

/**
 * The scale that makes a key's ARTWORK exactly `worldWidth` across.
 *
 * Divides by `contentWidth` — the ink, not the canvas — for the reason
 * `fitInBox` does and `hud-peanut` did not: a key carrying its canvas where
 * its ink belongs draws small by exactly the width of its transparent margin,
 * silently, at every size. `tools/measure_art.py` audits every entry for it
 * now, and every one of these ten was measured rather than assumed.
 */
function widthScale(key: string, worldWidth: number, fallback: number): number {
  return worldWidth / (renderFor(key).contentWidth ?? fallback)
}

/**
 * A one-shot effect drawn AT A POINT, sized to the power's own radius.
 *
 * The replacement for `expandingRing`, and it keeps that function's one real
 * idea: the shape ARRIVES at its size rather than appearing at it, because a
 * picture that grows into place is what makes the size legible in the half
 * second it is up. It grows from `growFrom` to 1 and fades, so the last thing
 * the eye sees is the true extent of what was hit.
 *
 * `worldWidth` is the DIAMETER the power affects, not a radius: every caller
 * passes `radius * 2` (or a reach), so the picture covers exactly the ground
 * the rule does.
 *
 * `flattenY` squashes the art vertically. Seismic needs it — that one is drawn
 * head-on, so at 1:1 it reads as a wall of rock standing up out of the map
 * rather than as a crater lying flat on it. It is the only concession this
 * file makes to the 3/4 perspective, and it is a per-call number rather than a
 * property of the file because it depends on how the art was drawn.
 */
export function burstAt(
  scene: Phaser.Scene, key: string, x: number, y: number,
  worldWidth: number, depth: number,
  opts: { ms?: number; flattenY?: number; alpha?: number } = {},
): void {
  if (!scene.textures.exists(key)) return
  const img = scene.add.image(x, y, key).setDepth(depth)
  const cfg = renderFor(key)
  img.setOrigin(cfg.anchorX, cfg.anchorY)
  const s = widthScale(key, worldWidth, img.width)
  const flat = opts.flattenY ?? 1
  img.setScale(s * FX.growFrom, s * flat * FX.growFrom)
  img.setAlpha(opts.alpha ?? 1)
  scene.tweens.add({
    targets: img,
    scaleX: s,
    scaleY: s * flat,
    alpha: 0,
    duration: opts.ms ?? FX.pointMs,
    ease: 'Cubic.easeOut',
    onComplete: () => img.destroy(),
  })
}

/**
 * An effect drawn along the LINE from one point to another.
 *
 * The two that need it are the Ice Beam and Zoomies, and they are the same
 * problem: a fixed-width picture drawn over a distance the player chooses.
 * Both are authored travelling RIGHT with the hero's end on the left, so both
 * carry `anchorX: 0` and `stretch: 'line'` in art.json — the anchor there is a
 * statement about which end is the hero's, and `manifest.test.ts` exempts a
 * `stretch: 'line'` entry from the "an anchor at the frame edge means the
 * measurement latched onto a prop" rule on the strength of that field.
 *
 * STRETCHED RATHER THAN TILED. Tiling would keep the art's own scale at any
 * length and is the better answer for a repeating texture; neither of these is
 * one. The beam is a single tapering bolt and the dash is one trail with an
 * arrow at its head, and repeating either would draw two arrowheads.
 *
 * `height` is the picture's thickness in world pixels, and every caller
 * derives it from the power rather than picking it: Zoomies passes its
 * corridor's real diameter, so what is drawn is exactly the band `withinDash`
 * tests against and a dash that misses looks like a dash that missed.
 */
export function alongLine(
  scene: Phaser.Scene, key: string,
  from: { x: number; y: number }, to: { x: number; y: number },
  height: number, depth: number, ms = FX.sweepMs,
): void {
  if (!scene.textures.exists(key)) return
  const len = Math.hypot(to.x - from.x, to.y - from.y)
  if (len < 1) return
  const img = scene.add.image(from.x, from.y, key).setDepth(depth)
  const cfg = renderFor(key)
  // Anchored on the hero's end and rotated about it, so the picture starts at
  // his hand however the line is aimed.
  img.setOrigin(cfg.anchorX, cfg.anchorY)
  img.setRotation(Math.atan2(to.y - from.y, to.x - from.x))
  img.setScale(len / (cfg.contentWidth ?? img.width), height / (cfg.contentHeight ?? img.height))
  scene.tweens.add({
    targets: img, alpha: 0, duration: ms, ease: 'Quad.easeOut',
    onComplete: () => img.destroy(),
  })
}

/** A Spike Strip on the ground, and the handle the scene keeps. */
export interface HazardArt {
  /** Called each frame with how much of its life is left, 1 down to 0. */
  update(fraction: number): void
  destroy(): void
}

/**
 * The persistent one: the Spike Strip, lying on the lane until it runs out.
 *
 * It PULSES rather than merely sitting there, which the procedural version
 * also did and for a reason worth keeping: a static shape on a painted map
 * reads as part of the map. The pulse carries the one thing a persistent
 * hazard has to say that a burst does not — how much of it is left, which is
 * the alpha falling away with `fraction`.
 *
 * Flattened, like Seismic and for the same reason: the strip is drawn side-on
 * and the board is seen from three quarters above.
 */
export function groundStrip(
  scene: Phaser.Scene, key: string, x: number, y: number, radius: number, depth: number,
  angle = 0,
): HazardArt {
  if (!scene.textures.exists(key)) {
    return { update: () => {}, destroy: () => {} }
  }
  const img = scene.add.image(x, y, key).setDepth(depth)
  const cfg = renderFor(key)
  img.setOrigin(cfg.anchorX, cfg.anchorY)
  const s = widthScale(key, radius * 2, img.width)
  img.setScale(s, s * FX.stripFlatten)
  // TURNED TO THE LANE, so it lies ALONG the road rather than at whatever
  // angle its canvas happens to be painted at.
  //
  // Along, not across, and that is what the rule already does: the hazard is a
  // 54px disc that charges everything standing in it every `tickSeconds`, so
  // what it is is a STRETCH OF ROAD that hurts to walk down, and a 3:1 picture
  // turned to the lane's own heading is that stretch. Left unrotated it points
  // wherever the canvas does, and this map's road doubles back on itself
  // twice, so a strip that read correctly on one leg lay sideways across the
  // next. `Path.headingNear` gives the heading at the nearest point of the
  // lane, which is also the right answer for a strip dropped a little off it.
  img.setRotation(angle)
  return {
    update: (fraction) => {
      const a = Math.max(0, Math.min(1, fraction))
      const pulse = (Math.sin((scene.time.now / FX.hazardPulseMs) * Math.PI * 2) + 1) / 2
      img.setAlpha((FX.stripAlpha + pulse * FX.stripPulse) * a)
    },
    destroy: () => img.destroy(),
  }
}

/** A marker that follows something for as long as a status lasts. */
export interface StatusMarker {
  /** Put it over this point. The scene calls it every frame. */
  moveTo(x: number, y: number): void
  destroy(): void
}

/**
 * A small picture hanging over an enemy: on fire, or under orders.
 *
 * A MARKER IS NOT AN EFFECT, and the difference is why this returns a handle
 * rather than cleaning itself up. An effect is over in half a second and knows
 * when; a marker is up for exactly as long as a status is, which is a fact
 * about the enemy, and the enemy can also die halfway through. So the scene
 * owns it, keeps it over its target every frame, and destroys it when the
 * status ends or the target does — the same shape `skillBurn`'s timer already
 * uses to avoid charging a corpse for the rest of a burn.
 */
export function statusMarker(
  scene: Phaser.Scene, key: string, height: number, depth: number,
): StatusMarker {
  if (!scene.textures.exists(key)) {
    return { moveTo: () => {}, destroy: () => {} }
  }
  const img = scene.add.image(0, 0, key).setDepth(depth)
  const cfg = renderFor(key)
  img.setOrigin(cfg.anchorX, cfg.anchorY)
  img.setScale(height / (cfg.contentHeight ?? img.height))
  return {
    moveTo: (x, y) => { img.setPosition(x, y); img.setDepth(y + FX.markerDepthBias) },
    destroy: () => img.destroy(),
  }
}

/**
 * The one procedural shape that survived, and only for the Ice Beam.
 *
 * WHY IT IS STILL HERE. Every other power's art can say how much ground it
 * covers, because every other power's art is drawn AT the ground it covers and
 * is scaled to it. Ice Beam is the exception: what the power does is freeze a
 * 96px area at the far end, and the beam is scenery — it touches nothing it
 * crosses, and a test says so. A picture stretched along the line has one
 * thickness for its whole length and cannot describe a circle at the end of
 * it, and drawing it 192px thick to try would claim the whole corridor was
 * caught, which is the exact misreading the test exists to prevent.
 *
 * So the area keeps a ring at its true radius, in the hero's own colour, over
 * the real beam art. It is the same ring at the same radius the power was
 * tuned against.
 */
export function areaRing(
  scene: Phaser.Scene, x: number, y: number, radius: number, colour: number, depth: number,
  ms = FX.pointMs,
): void {
  const g = scene.add.graphics().setDepth(depth)
  scene.tweens.addCounter({
    from: 0, to: 1, duration: ms, ease: 'Cubic.easeOut',
    onUpdate: (tw: Phaser.Tweens.Tween) => {
      const t = tw.getValue() ?? 0
      g.clear()
      g.lineStyle(FX.areaRingWidth, colour, FX.areaRingAlpha * (1 - t))
      g.strokeCircle(x, y, radius * t)
    },
    onComplete: () => g.destroy(),
  })
}

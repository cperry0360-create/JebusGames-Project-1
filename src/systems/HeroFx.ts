// PLACEHOLDER EFFECT ART FOR THE HERO POWERS, in one file so it is one file
// to delete.
//
// None of the five powers has art yet, and waiting for it would mean shipping
// five abilities that cannot be judged — the question a first balance pass has
// to answer is "is that radius right?", and that question is about a shape on
// the board rather than about a number in a file.
//
// So each shape is drawn procedurally, TINTED TO THE HERO and SIZED TO THE
// POWER'S REAL RADIUS. Nothing here invents a size: every call takes the radius
// out of heroes.json, so what the player sees is what the rule uses and a
// tuning change moves the picture with it.
//
// Everything returns nothing and cleans itself up. The one exception is the
// Spike Strip's band, which persists and hands back a handle, because the
// scene owns its life.

// TYPE-ONLY. Every Phaser name here is the type of something handed in — a
// Scene, its Graphics — so importing the engine as a value would give this
// module a runtime dependency it does not have. Same rule as `EdgeDock`.
import type Phaser from 'phaser'
import { PRESENTATION } from './Presentation.ts'

const FX = PRESENTATION.heroFx

/**
 * A ring that opens out to `radius` and fades.
 *
 * The default shape: Seismic, Fireball's blast and Bark all read as "this much
 * board, right now", and a circle that ARRIVES at the radius rather than
 * appearing at it is what makes the size legible in the half-second it is up.
 */
export function expandingRing(
  scene: Phaser.Scene, x: number, y: number, radius: number, colour: number, depth: number,
  ms = FX.ringMs,
): void {
  const g = scene.add.graphics().setDepth(depth)
  scene.tweens.addCounter({
    from: 0, to: 1, duration: ms, ease: 'Cubic.easeOut',
    onUpdate: (tw: Phaser.Tweens.Tween) => {
      const t = tw.getValue() ?? 0
      g.clear()
      g.fillStyle(colour, FX.fillAlpha * (1 - t))
      g.fillCircle(x, y, radius * t)
      g.lineStyle(FX.ringWidth, colour, 1 - t)
      g.strokeCircle(x, y, radius * t)
    },
    onComplete: () => g.destroy(),
  })
}

/**
 * A small strike: a short bright stab at a point.
 *
 * Star Rain lands fourteen of these, so it is deliberately cheap — two lines
 * and a dot — and deliberately not a ring. Fourteen expanding rings over one
 * patch of ground is a white circle.
 */
export function strike(
  scene: Phaser.Scene, x: number, y: number, colour: number, depth: number,
): void {
  const g = scene.add.graphics().setDepth(depth)
  const h = FX.strikeLength
  g.lineStyle(FX.strikeWidth, colour, 1)
  g.beginPath()
  g.moveTo(x, y - h)
  g.lineTo(x, y - FX.strikeWidth)
  g.strokePath()
  g.fillStyle(colour, 0.9)
  g.fillCircle(x, y, FX.strikeWidth)
  scene.tweens.add({
    targets: g, alpha: 0, duration: FX.strikeMs, ease: 'Quad.easeOut',
    onComplete: () => g.destroy(),
  })
}

/**
 * A corridor swept from one point to another: Zoomies.
 *
 * Drawn as the band that actually does the damage — `radius` is the same
 * half-width `withinDash` tests against — so a dash that misses looks like a
 * dash that missed rather than like a dash that did nothing.
 */
export function lineSweep(
  scene: Phaser.Scene,
  from: { x: number; y: number }, to: { x: number; y: number },
  halfWidth: number, colour: number, depth: number, ms = FX.sweepMs,
): void {
  const g = scene.add.graphics().setDepth(depth)
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  const len = Math.hypot(to.x - from.x, to.y - from.y)
  scene.tweens.addCounter({
    from: 0, to: 1, duration: ms, ease: 'Quad.easeOut',
    onUpdate: (tw: Phaser.Tweens.Tween) => {
      const t = tw.getValue() ?? 0
      g.clear()
      g.fillStyle(colour, FX.fillAlpha * (1 - t))
      // Drawn in the band's own space, so a diagonal dash is a rotated
      // rectangle rather than an axis-aligned box around one.
      g.save()
      g.translateCanvas(from.x, from.y)
      g.rotateCanvas(angle)
      g.fillRect(0, -halfWidth, len, halfWidth * 2)
      g.lineStyle(FX.ringWidth, colour, 1 - t)
      g.strokeRect(0, -halfWidth, len, halfWidth * 2)
      g.restore()
    },
    onComplete: () => g.destroy(),
  })
}

/** A Spike Strip on the ground, and the handle the scene keeps. */
export interface HazardArt {
  /** Called each frame with how much of its life is left, 1 down to 0. */
  update(fraction: number): void
  destroy(): void
}

/**
 * The persistent one: a band on the ground that stays until it runs out.
 *
 * A RECTANGLE, per the brief, and it pulses rather than merely sitting there —
 * a static shape on a painted map reads as part of the map. The pulse also
 * carries the one thing a persistent hazard has to communicate that a burst
 * does not: how much of it is left, which is the alpha falling away.
 */
export function hazardBand(
  scene: Phaser.Scene, x: number, y: number, radius: number, colour: number, depth: number,
): HazardArt {
  const g = scene.add.graphics().setDepth(depth)
  const h = radius * FX.hazardThickness
  const draw = (fraction: number, pulse: number): void => {
    g.clear()
    const a = Math.max(0, Math.min(1, fraction))
    g.fillStyle(colour, FX.fillAlpha * (0.6 + pulse * 0.4) * a)
    g.fillRect(x - radius, y - h, radius * 2, h * 2)
    g.lineStyle(FX.ringWidth, colour, (0.5 + pulse * 0.5) * a)
    g.strokeRect(x - radius, y - h, radius * 2, h * 2)
    // The teeth, so it reads as spikes rather than as a coloured rug.
    g.lineStyle(FX.ringWidth, colour, (0.4 + pulse * 0.6) * a)
    const step = Math.max(8, (radius * 2) / FX.hazardTeeth)
    for (let px = x - radius + step / 2; px < x + radius; px += step) {
      g.beginPath()
      g.moveTo(px, y + h)
      g.lineTo(px, y - h - FX.hazardToothHeight)
      g.strokePath()
    }
  }
  draw(1, 1)
  return {
    update: (fraction) => {
      const pulse = (Math.sin((scene.time.now / FX.hazardPulseMs) * Math.PI * 2) + 1) / 2
      draw(fraction, pulse)
    },
    destroy: () => g.destroy(),
  }
}

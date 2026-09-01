// How the hero carries himself: the idle bob, the walk, and the attack lunge.
//
// No new art. Everything here is a transform on the one sprite he already
// has — a y offset, a squash, a lean, a lunge — because a character who is
// perfectly still between orders reads as a placed object rather than as a
// person standing in a field.
//
// Phaser-free on purpose. This computes a pose; the entity applies it. That
// keeps the timing checkable in Node, and it means the same pose can be put on
// the man or on the SUV without either of them knowing how it was worked out.

/** One motion state's shape. All periods in milliseconds, offsets in world px. */
export interface BobDef {
  periodMs: number
  /** How far off the ground the top of the bob lifts him. */
  riseY: number
  /** How much he squashes at the bottom, as a fraction of his scale. */
  squash: number
  /** Walk only: how far he leans into the direction of travel. */
  leanDegrees?: number
}

export interface LungeDef {
  /** Out and back. */
  lungeMs: number
  /** How far toward the target he reaches, in world px. */
  reachPx: number
  /** Stretch along the lunge at full extension, as a fraction of scale. */
  stretch: number
  /** Fraction of lungeMs spent going out. The rest is the snap back. */
  outFraction: number
}

export interface MotionDef {
  idle: BobDef
  walk: BobDef
  attack: LungeDef
  /** How much the shadow shrinks at the top of the bob, as a fraction. */
  shadowBob: number
}

/** A pose: what to do to the sprite this frame. */
export interface Pose {
  /** Added to the sprite's y. Negative is up. */
  offsetY: number
  /** Added to the sprite's x, along the facing. */
  offsetX: number
  /** Multipliers on the sprite's resting scale. */
  scaleX: number
  scaleY: number
  /** Radians, pivoting at the feet. */
  rotation: number
  /** Multiplier on the shadow's resting width. */
  shadowScale: number
}

export const REST: Pose = {
  offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotation: 0, shadowScale: 1,
}

/** How much of a lunge's vertical component actually shows. See below. */
const VERTICAL_DAMP = 0.5

/** 0 at the bottom of the bob, 1 at the top, smooth at both ends. */
function bobPhase(elapsedMs: number, periodMs: number): number {
  const t = ((elapsedMs % periodMs) + periodMs) % periodMs / periodMs
  return (1 - Math.cos(t * Math.PI * 2)) / 2
}

/**
 * The lunge curve: out fast, back slower, zero at both ends.
 *
 * A symmetric curve reads as a hop rather than a punch. The weight is in the
 * asymmetry: he gets there in a third of the time it takes him to recover,
 * which is what a swing feels like.
 */
function lungeCurve(p: number, outFraction: number): number {
  if (p <= 0 || p >= 1) return 0
  const out = Math.max(0.01, Math.min(0.99, outFraction))
  if (p < out) {
    // Ease out: fast off the mark, decelerating into full extension.
    const t = p / out
    return 1 - (1 - t) * (1 - t)
  }
  // Ease in: hangs a moment at extension, then snaps home.
  const t = (p - out) / (1 - out)
  return 1 - t * t
}

/**
 * Tracks the hero's motion clock and hands out a pose per frame.
 *
 * One object rather than free functions because the bob has to be continuous:
 * a clock reset every time he stops walking makes him jerk, and a phase
 * recomputed from wall time makes two heroes bob in lockstep.
 */
export class HeroMotion {
  private clock = 0
  private lungeLeft = 0
  private lungeTotal = 0
  /** Unit vector toward whatever he swung at, so the lunge goes at it. */
  private lungeX = 0
  private lungeY = 0

  // Written out rather than as a parameter property: Node runs these modules
  // by stripping types, and it cannot strip a constructor that also declares
  // a field. Every testable system in here has to stay loadable that way.
  private readonly def: MotionDef

  constructor(def: MotionDef) {
    this.def = def
  }

  /** Starts a swing toward a point. Re-swinging restarts it rather than
   *  stacking, so a fast attack rate reads as fast rather than as a blur. */
  swingAt(dx: number, dy: number): void {
    const d = Math.hypot(dx, dy) || 1
    this.lungeX = dx / d
    this.lungeY = dy / d
    this.lungeTotal = this.def.attack.lungeMs
    this.lungeLeft = this.lungeTotal
  }

  /** True while a swing is still playing. */
  get swinging(): boolean {
    return this.lungeLeft > 0
  }

  /**
   * Advances the clock and returns this frame's pose.
   *
   * `walking` picks which bob is running; `headingX` is the direction of
   * travel, used only for the lean, and is ignored when he is standing.
   */
  advance(dtSeconds: number, walking: boolean, headingX = 0): Pose {
    const ms = dtSeconds * 1000
    this.clock += ms
    if (this.lungeLeft > 0) this.lungeLeft = Math.max(0, this.lungeLeft - ms)

    const bob = walking ? this.def.walk : this.def.idle
    const phase = bobPhase(this.clock, bob.periodMs)

    // Up at the top of the phase, squashed at the bottom. The two are the
    // same motion: he compresses as he lands and lifts as he pushes off.
    let offsetY = -bob.riseY * phase
    const squash = bob.squash * (1 - phase)
    let scaleX = 1 + squash
    let scaleY = 1 - squash
    let offsetX = 0
    let rotation = 0

    if (walking && bob.leanDegrees) {
      // Into the direction of travel, so he looks like he is going somewhere
      // rather than being slid across the grass.
      const dir = headingX === 0 ? 0 : Math.sign(headingX)
      rotation = (bob.leanDegrees * Math.PI / 180) * dir
    }

    if (this.lungeLeft > 0 && this.lungeTotal > 0) {
      const p = 1 - this.lungeLeft / this.lungeTotal
      const reach = lungeCurve(p, this.def.attack.outFraction)
      offsetX += this.lungeX * this.def.attack.reachPx * reach
      // Damped: the board is a 3/4 view, so a world pixel up the screen is a
      // shorter step than a world pixel across it. Lunging the full distance
      // vertically reads as a hop rather than a swing.
      offsetY += this.lungeY * this.def.attack.reachPx * reach * VERTICAL_DAMP
      // Stretched along the lunge and thinned across it: the classic squash
      // and stretch, which is what sells the weight of the swing.
      const s = this.def.attack.stretch * reach
      scaleX *= 1 + s
      scaleY *= 1 - s * 0.6
    }

    return {
      offsetX,
      offsetY,
      scaleX,
      scaleY,
      rotation,
      shadowScale: 1 - this.def.shadowBob * phase,
    }
  }
}

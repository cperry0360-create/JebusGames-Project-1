// The hero's selection ring and his move order, as state rather than drawing.
//
// Three states and no others:
//
//   1. Idle, not selected  — nothing at all.
//   2. Selected            — a thin ring on the ground at his feet.
//   3. Move order          — a rotating dashed ring at the destination, which
//                            stays while he walks and goes when he arrives.
//
// What this replaces drew, all at once: a rally flag, a filled blue ellipse
// under the flag, a yellow Depreciation disc with rotating ticks, a block-range
// ellipse, and a green bracket with corner ticks around him. Five overlapping
// indicators on a patch of grass, four of which were on whether or not the
// player had asked for anything.
//
// Phaser-free: this owns the timing and hands out what to draw. The scene
// draws it. That keeps the fades and the rotation checkable in Node, and it is
// where the last version's bugs would have been — a marker that never cleared,
// or two on the board at once.

export interface RingDef {
  /** Ring width as a fraction of the hero's sprite width. */
  widthFraction: number
  strokeWidth: number
  alpha: number
  fadeOutMs: number
}

export interface MoveRingDef extends RingDef {
  dashes: number
  /** How much of each dash-plus-gap is the dash. */
  dashFraction: number
  /** One full turn of the dashes. */
  rotationMs: number
  /** The tap feedback: scales up from `appearFromScale` and fades in. */
  appearMs: number
  appearFromScale: number
}

export interface MarkersDef {
  footRing: RingDef
  moveRing: MoveRingDef
}

/** What to draw at the hero's feet this frame, or null for nothing. */
export interface FootRing {
  alpha: number
}

/** What to draw at the destination this frame, or null for nothing. */
export interface MoveRing {
  x: number
  y: number
  alpha: number
  scale: number
  /** Radians to rotate the dash pattern by. */
  phase: number
}

/**
 * Owns both markers.
 *
 * Every transition goes through a method here, so "never two rings at once"
 * is a property of the type rather than something the scene has to remember:
 * there is one slot, and ordering a new move overwrites it.
 */
export class HeroMarkers {
  private readonly def: MarkersDef
  /** Counts up forever; the dash rotation reads it. */
  private clock = 0

  private selected = false
  /** Milliseconds since the foot ring started fading, or -1 while it is up. */
  private footFade = -1

  private order: { x: number; y: number; age: number; fade: number } | null = null

  constructor(def: MarkersDef) {
    this.def = def
  }

  /** True while the destination marker is on the board and not yet fading. */
  get hasOrder(): boolean {
    return this.order !== null && this.order.fade < 0
  }

  select(): void {
    this.selected = true
    this.footFade = -1
  }

  /** Deselects, fading the foot ring rather than cutting it. */
  deselect(): void {
    if (!this.selected) return
    this.selected = false
    this.footFade = 0
  }

  /**
   * A new destination. Replaces whatever was there — the old ring does not
   * fade out beside the new one, it is simply gone, because two rings on the
   * board is the player wondering which order is live.
   */
  orderTo(x: number, y: number): void {
    this.order = { x, y, age: 0, fade: -1 }
  }

  /** He got there, or the order was cancelled: fade the destination ring. */
  endOrder(): void {
    if (this.order && this.order.fade < 0) this.order.fade = 0
  }

  /** Cancelled outright: both markers go, the same way. */
  cancel(): void {
    this.endOrder()
    this.deselect()
  }

  advance(dtSeconds: number): void {
    const ms = dtSeconds * 1000
    this.clock += ms
    if (this.footFade >= 0) {
      this.footFade += ms
      if (this.footFade >= this.def.footRing.fadeOutMs) this.footFade = -1
    }
    if (this.order) {
      this.order.age += ms
      if (this.order.fade >= 0) {
        this.order.fade += ms
        // Dropped rather than left at alpha 0, so `hasOrder` and the draw
        // agree and a finished marker cannot be revived by a stray call.
        if (this.order.fade >= this.def.moveRing.fadeOutMs) this.order = null
      }
    }
  }

  footRing(): FootRing | null {
    const d = this.def.footRing
    if (this.selected) return { alpha: d.alpha }
    if (this.footFade >= 0) {
      return { alpha: d.alpha * (1 - this.footFade / d.fadeOutMs) }
    }
    return null
  }

  moveRing(): MoveRing | null {
    const o = this.order
    if (!o) return null
    const d = this.def.moveRing
    // The tap feedback: up from 70% and in from nothing, once, over 200ms.
    const inT = Math.min(1, o.age / d.appearMs)
    const scale = d.appearFromScale + (1 - d.appearFromScale) * inT
    let alpha = d.alpha * inT
    if (o.fade >= 0) alpha = d.alpha * Math.max(0, 1 - o.fade / d.fadeOutMs)
    return {
      x: o.x,
      y: o.y,
      alpha,
      scale,
      phase: (this.clock / d.rotationMs) * Math.PI * 2,
    }
  }
}

/**
 * The dash arcs of a rotating dashed ellipse, as [startAngle, endAngle] pairs.
 *
 * Separated out so the pattern can be checked without a canvas: that the
 * dashes are evenly spaced, that they never overlap, and that a whole turn of
 * `phase` puts them back exactly where they started.
 */
export function dashArcs(
  dashes: number,
  dashFraction: number,
  phase: number,
): Array<[number, number]> {
  const out: Array<[number, number]> = []
  const step = (Math.PI * 2) / Math.max(1, dashes)
  const on = step * Math.max(0.05, Math.min(0.95, dashFraction))
  for (let i = 0; i < dashes; i++) {
    const a = phase + i * step
    out.push([a, a + on])
  }
  return out
}

// The rules behind slot 2, kept free of Phaser.
//
// "May this be cast?", "is that point legal?", "which enemies does a dash run
// through?" and "where does a scatter of small strikes land?" are all
// decisions, and decisions that gate a button should be testable without a
// canvas. What is left in the scene is drawing and damage.
//
// ONE MECHANIC, FIVE POWERS. Every hero's slot 2 is gated on the powered form,
// carries the same cooldown number, resets that cooldown on transformation, and
// is placed by tapping the button and then tapping the map inside a radius of
// the hero. Only the effect differs. That is deliberate: five powers with five
// different activation rules would be five things to learn before the second
// half of a hero is usable at all.

import type { HeroPowerDef } from '../types.ts'
import { slot2Usable } from './HeroSkills.ts'

export interface Point {
  x: number
  y: number
}

/** Why a hero power was refused, or null when it may be cast. */
export type PowerRefusal = 'unbuilt' | 'down' | 'base-form' | 'cooling'

/**
 * Whether slot 2 may be pressed right now.
 *
 * Ordered so the player is told the most useful thing: a power that does not
 * exist is not "on cooldown", and a hero who is down is not "in base form".
 */
export function powerRefusal(
  def: HeroPowerDef, powered: boolean, heroDown: boolean, ready: boolean,
): PowerRefusal | null {
  if (def.effect === null) return 'unbuilt'
  // THE SAME PREDICATE THE HUD DRAWS THE BUTTON FROM, called rather than
  // restated. The bar greys slot 2 out with `slot2Usable`; a cast path that
  // re-derived that rule is a second copy of it, and a second copy of a gate
  // is how a button comes to look pressable and refuse.
  if (!slot2Usable(powered, heroDown)) return heroDown ? 'down' : 'base-form'
  if (!ready) return 'cooling'
  return null
}

/**
 * Whether a tap is a legal place to put this power.
 *
 * A DISC AROUND THE HERO, for all five. The power is his reach, not the
 * board's: a hero power that could be dropped anywhere would make where the
 * hero is standing irrelevant, which is the one decision the hero has.
 */
export function withinCastRange(def: HeroPowerDef, hero: Point, x: number, y: number): boolean {
  return Math.hypot(x - hero.x, y - hero.y) <= def.castRadius
}

/**
 * Where the point actually lands.
 *
 * A tap outside the disc is REFUSED rather than clamped — see the targeting
 * mode, where an illegal tap leaves the mode instead of casting somewhere the
 * player did not choose. This exists for the harness and for the dash, which
 * needs the end of its run as a point rather than as a yes or no.
 */
export function clampToCastRange(def: HeroPowerDef, hero: Point, x: number, y: number): Point {
  const dx = x - hero.x
  const dy = y - hero.y
  const d = Math.hypot(dx, dy)
  if (d <= def.castRadius || d === 0) return { x, y }
  const k = def.castRadius / d
  return { x: hero.x + dx * k, y: hero.y + dy * k }
}

/**
 * Distance from a point to the segment a->b.
 *
 * The dash's hit test: Zoomies hurts what she runs THROUGH, which is a
 * corridor around a line rather than a circle at either end of it. A circle at
 * the destination would miss everything she passed on the way, which is the
 * whole of what the power is.
 */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/**
 * Whether a point is inside the corridor the hero runs along.
 *
 * A PREDICATE RATHER THAN A FILTER, deliberately. A generic `alongDash<T>` has
 * to constrain T to something with x and y, and the caller's `Enemy` only
 * satisfies that constraint when Phaser's typings are present — so locally the
 * generic collapses to the constraint and every `Enemy` member used on the
 * result becomes an error that only CI can tell apart from a real one. See
 * CLAUDE.md on tsdiff. A predicate takes a shape and returns a boolean, and
 * the caller keeps its own types the whole way through.
 */
export function withinDash(p: Point, from: Point, to: Point, radius: number): boolean {
  return distanceToSegment(p, from, to) <= radius
}

/**
 * Where each of Star Rain's strikes lands.
 *
 * Scattered inside the disc rather than on a ring or a grid: a ring reads as a
 * summoning circle and a grid reads as a bug. `sqrt` on the radius is what
 * makes the scatter EVEN across the area — without it the strikes bunch in the
 * middle, because a disc has more area further out.
 *
 * The random source is passed in, so the harness and the tests can drive a
 * known scatter and a soak run is reproducible from its seed.
 */
export function rainPoints(
  def: HeroPowerDef, at: Point, rng: () => number,
): Point[] {
  const out: Point[] = []
  for (let i = 0; i < def.hits; i++) {
    const angle = rng() * Math.PI * 2
    const r = Math.sqrt(rng()) * def.radius
    out.push({ x: at.x + Math.cos(angle) * r, y: at.y + Math.sin(angle) * r })
  }
  return out
}

/**
 * A Spike Strip on the ground, and what it has left.
 *
 * Kept as plain data with a `tick` that takes the seconds elapsed, so the
 * scene owns nothing but the drawing. The alternative — a Phaser timer per
 * strip — is the shape that leaks: a timer outlives the run that made it
 * unless every path remembers to cancel it, and there are four ways a run can
 * end.
 */
export interface Hazard {
  x: number
  y: number
  radius: number
  /** Seconds of life left. At or below zero it is finished. */
  left: number
  /** Seconds until it next charges what is standing in it. */
  until: number
  def: HeroPowerDef
}

export function makeHazard(def: HeroPowerDef, x: number, y: number): Hazard {
  return {
    x, y, radius: def.radius, def,
    left: def.durationSeconds,
    // Charges immediately: something already standing on the strip when it
    // lands should not get a free `tickSeconds` before it notices.
    until: 0,
  }
}

/**
 * Advances a strip by `dt` and says how many times it should charge.
 *
 * Returns a COUNT rather than a boolean, because a frame long enough to cover
 * two ticks must not silently drop one — that is how a hazard's damage becomes
 * a function of the frame rate.
 */
export function tickHazard(h: Hazard, dt: number): number {
  h.left -= dt
  if (h.def.tickSeconds <= 0) return 0
  h.until -= dt
  let ticks = 0
  while (h.until <= 0 && ticks < 32) {
    ticks++
    h.until += h.def.tickSeconds
  }
  return ticks
}

/** True once a strip has run out and should be taken off the board. */
export function hazardExpired(h: Hazard): boolean {
  return h.left <= 0
}

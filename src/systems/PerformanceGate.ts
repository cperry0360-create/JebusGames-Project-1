// The Performance Review: a line painted across the road that makes whatever
// walks through it 10% bigger and 20% faster, once.
//
// WHERE THE LINE IS COMES OFF THE PLATE. The machine, the sign and the red scan
// line are painted into level 8's map art, and `tools/find_level8_gate.py`
// measures them: it finds the line (the only saturated red blob on the plate)
// and intersects it with the shipped lane polylines from map_level8.json. What
// this file reads is that tool's output, copied into level8.json — a lane id, a
// distance along that lane, and the world point to play the scan at.
//
// A DISTANCE TEST, NOT A PROXIMITY TEST, and the difference is a bug that would
// only show up on a phone. An Intern reviewed to 174 px/s crosses a 25 px circle
// in 144ms; at 30fps on a bad frame it steps 5.8 px, which is fine — but a
// dropped frame of 400ms steps 70 px and misses the circle entirely. An enemy
// carries the distance it has walked down its own lane, so asking whether that
// number passed the gate's cannot be stepped over however long the frame was.
//
// Phaser-free on purpose, like the other systems modules: what a gate does is
// arithmetic, and the tests drive it directly.

import type { EnemyDef } from '../types.ts'
import type { LevelRules } from './Levels.ts'

/** One place a lane's centreline crosses the painted line. */
export interface GateCrossing {
  lane: string
  distance: number
  at: [number, number]
}

/** Level 8's `performanceReview` block, once it is known to be one. */
export interface GateRules {
  crossings: GateCrossing[]
  sizeMultiplier: number
  speedMultiplier: number
  scanMs: number
  markerHeight: number
}

/**
 * This level's gate, or null.
 *
 * NULL IS THE COMMON CASE and it is what keeps seven levels untouched: they
 * name no rules file, `levelRules` hands back null, and every caller here
 * returns nothing to do. The shape is asserted rather than trusted, because a
 * rules block is hand-written JSON and a gate with no crossings is a mechanic
 * that silently never fires.
 */
export function gateRules(rules: LevelRules | null): GateRules | null {
  const g = (rules as { performanceReview?: Partial<GateRules> } | null)?.performanceReview
  if (!g || !Array.isArray(g.crossings) || g.crossings.length === 0) return null
  if (!(typeof g.sizeMultiplier === 'number' && g.sizeMultiplier > 0)) return null
  if (!(typeof g.speedMultiplier === 'number' && g.speedMultiplier > 0)) return null
  return {
    crossings: g.crossings as GateCrossing[],
    sizeMultiplier: g.sizeMultiplier,
    speedMultiplier: g.speedMultiplier,
    scanMs: g.scanMs ?? 420,
    markerHeight: g.markerHeight ?? 24,
  }
}

/**
 * The crossing an enemy went through this step, or null.
 *
 * `from` and `to` are the distance it had walked down `lane` before and after
 * the step. A crossing counts when the step passed the gate's distance:
 * `from < d <= to`, so standing exactly on it does not re-fire and walking
 * backwards (a mind-controlled enemy retreating down its own lane) does not
 * fire at all.
 *
 * EVERY CROSSING ON THAT LANE IS CHECKED, not the first one found, because a
 * road may cross the same painted line twice. Level 8's does not — the tool
 * reports one — and the loop costs nothing and means the non-stacking rule is
 * about the enemy rather than about this plate's luck.
 */
export function crossedGate(
  g: GateRules,
  lane: string,
  from: number,
  to: number,
): GateCrossing | null {
  if (!(to > from)) return null
  for (const c of g.crossings) {
    if (c.lane !== lane) continue
    if (from < c.distance && c.distance <= to) return c
  }
  return null
}

/**
 * Whether this enemy may be reviewed at all.
 *
 * BOSSES ARE IMMUNE, and the test is the pair every other rule about
 * importance uses — `role: 'boss'` or `tier: 'boss'`, which is what
 * content.test.ts's rank-and-file bound and armor.test.ts's survival floor
 * both read. A 20% faster CEO on a 3,646 px arm is a different fight.
 *
 * The once-ever half of the rule is NOT here: it is `Enemy.reviewed`, because
 * the latch has to live on the thing being latched. This is only the question
 * of whether the gate is interested.
 */
export function reviewable(def: Pick<EnemyDef, 'role' | 'tier'>): boolean {
  return def.role !== 'boss' && def.tier !== 'boss'
}

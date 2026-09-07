// Which way a hero looks when it is not going anywhere.
//
// Moving is the easy half and is not here: a hero walking to a rally point
// faces its direction of travel, which `Hero.faceTowards` has always done. The
// hard half is the rest of the time — standing on a rally point between waves,
// or arrived and waiting — and the answer used to be "whichever way he last
// happened to turn", which on the frame after a run starts is a coin toss.
//
// THE RULE, in priority order:
//
//   1. Something alive on the board -> face the NEAREST one, at any distance.
//      Not just the ones in attack range: a hero who can see a wave coming and
//      stands with his back to it reads as broken, and `attackRange` is 70-122
//      world pixels on a 1280px board.
//   2. Nothing alive -> face where enemies ARRIVE FROM.
//
// THE SECOND ONE IS THE REASON THIS FILE EXISTS. "Left" was the honest answer
// for levels 1 and 2, whose single lane comes in through an arch at x=-60, and
// it is wrong for levels 3 and 4, which have TWO gates that merge — and any
// hero posted past the merge on level 3 has one gate up and to the left and
// another down and to the left. So the direction is computed from the map: the
// spawn points are the first waypoint of every lane the wave table actually
// uses, and the hero faces the nearest of them.
//
// Phaser-free, like Facing.ts beside it. "Which way should he be looking?" is
// arithmetic over a list of points, and arithmetic that decides what a player
// sees on the first frame of a run should be checkable without a canvas.

import { MAIN_LANE } from './Lanes.ts'
import type { WavesDef } from '../types.ts'

export interface Point {
  x: number
  y: number
}

/**
 * Every lane id this level's waves actually spawn on.
 *
 * READ OFF THE WAVE TABLE RATHER THAN OFF THE LANE LIST, because those are two
 * different questions. Level 3 declares three lanes — `main`, `upper` and
 * `lower` — and `main` is not a gate: it is the trunk the other two merge
 * into, and its first waypoint is at (733, 378), in the middle of the board.
 * A hero facing "the nearest lane's start" would spend that level looking at a
 * point on the road nothing ever comes out of.
 *
 * A spawn group that names no lane spawns on the trunk, which is what makes
 * levels 1 and 2 — whose groups name nothing at all — resolve to `main` and
 * to the arch their single lane starts at.
 */
export function spawnLaneIds(waves: WavesDef): string[] {
  const ids: string[] = []
  for (const wave of waves.waves ?? []) {
    for (const spawn of wave.spawns ?? []) {
      const id = (spawn as { lane?: string | null }).lane ?? MAIN_LANE
      if (!ids.includes(id)) ids.push(id)
    }
  }
  return ids.length > 0 ? ids : [MAIN_LANE]
}

/**
 * Where the hero should look, or null to keep whatever facing it has.
 *
 * NULL IS A REAL ANSWER and not a failure: a level whose spawn points cannot
 * be resolved, or a hero standing exactly on the only one, should keep its
 * current facing rather than snap to an arbitrary default. Snapping is worse
 * than staleness — it is the shape of bug that spins a sprite on the spot.
 *
 * TAKES THE NEAREST ENEMY, NOT THE LIST OF THEM. The caller has already found
 * it with `pickNearest`, which is the same function the attack targeting uses,
 * so the two cannot disagree about which enemy is nearest. It also keeps this
 * module out of the way of a typing artifact the codebase already documents:
 * without node_modules an `Enemy` loses its Phaser base and satisfies no
 * structural parameter, so a signature taking `Enemy[]` reads as an error
 * locally whether or not it is one. `withinDash` in HeroPowers.ts carries the
 * same note for the same reason.
 */
export function restFacingTarget(
  hero: Point,
  nearestEnemy: Point | null,
  arrivals: Point[],
): Point | null {
  if (nearestEnemy) return nearestEnemy
  return nearest(hero, arrivals)
}

/** The nearest of a list of points, or null when the list is empty or the
 *  hero is standing on the only candidate. */
export function nearest(from: Point, points: Point[]): Point | null {
  let best: Point | null = null
  let bestD = Infinity
  for (const p of points) {
    const d = Math.hypot(p.x - from.x, p.y - from.y)
    if (d < bestD) { bestD = d; best = p }
  }
  // Standing on it: `atan2(0, 0)` is 0, which is "face east" — a real
  // direction chosen by nothing. Better to keep the facing there is.
  return bestD < 1 ? null : best
}

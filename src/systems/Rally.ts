// Where an Ima Dummy Tower's soldiers stand, and where the player may put them.
//
// Phaser-free like the other systems modules: "is this tap legal", "which lane
// is nearest" and "where does a soldier stand by default" are all geometry, and
// the tests drive them directly rather than through a scene.
//
// THE RALLY POINT IS ON A LANE, ALWAYS. A soldier standing in a field blocks
// nothing, so a tap does not place a soldier where the finger landed -- it
// picks the nearest point on a lane to where the finger landed. On a branching
// map that is a real decision: the two branches are metres apart at the fork
// and the player is choosing which one to hold.

import type { LaneNetwork } from './Lanes.ts'

export interface Point {
  x: number
  y: number
}

/** Where on the network a rally point sits, and how far the tap was from it. */
export interface RallySpot extends Point {
  laneId: string
  /** Distance along that lane, so a soldier can be replaced at the same spot. */
  laneDistance: number
}

/** Why a tap was refused, or null when it was accepted. */
export type RallyRefusal = 'out-of-range' | 'no-lane'

export interface RallyResult {
  spot: RallySpot | null
  refused: RallyRefusal | null
}

/**
 * The nearest point on any lane to (x, y).
 *
 * Every lane is searched, not just the trunk: on a fork a tower sits between
 * two branches and the answer depends on which side of it the finger landed.
 */
export function nearestOnLanes(net: LaneNetwork, x: number, y: number): RallySpot | null {
  let best: RallySpot | null = null
  let bestDist = Infinity
  for (const lane of net.lanes) {
    const pts = lane.path.points
    let travelled = 0
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i]!.x, ay = pts[i]!.y
      const bx = pts[i + 1]!.x, by = pts[i + 1]!.y
      const dx = bx - ax, dy = by - ay
      const len2 = dx * dx + dy * dy
      const seg = Math.sqrt(len2)
      const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0
      const px = ax + t * dx
      const py = ay + t * dy
      const d = Math.hypot(x - px, y - py)
      if (d < bestDist) {
        bestDist = d
        best = { x: px, y: py, laneId: lane.id, laneDistance: travelled + seg * t }
      }
      travelled += seg
    }
  }
  return best
}

/**
 * Where a tower's soldiers stand before the player has said otherwise: the
 * nearest lane point to the tower itself.
 *
 * Returns null when no lane comes within the tower's range at all, which is a
 * pad no Ima Dummy Tower should be built on and which the caller reports rather
 * than silently placing soldiers nowhere.
 */
export function defaultRally(net: LaneNetwork, tower: Point, range: number): RallySpot | null {
  const spot = nearestOnLanes(net, tower.x, tower.y)
  if (!spot) return null
  return Math.hypot(spot.x - tower.x, spot.y - tower.y) <= range ? spot : null
}

/**
 * What a tap on the map does to a tower's rally point.
 *
 * TWO RULES, IN THIS ORDER, and the order is the point. The tap is snapped to a
 * lane FIRST and the range is checked against the SNAPPED point, not the raw
 * one -- otherwise a tap just inside the ring but pointing at a stretch of lane
 * outside it would place soldiers where the tower cannot see them, and a tap
 * just outside the ring pointing at lane well inside it would be refused for no
 * reason a player could see.
 *
 * A refusal is returned rather than swallowed. The scene says so out loud: a
 * control that silently does nothing is indistinguishable from one that is
 * broken, and this one is used with a thumb on a moving board.
 */
export function rallyFromTap(
  net: LaneNetwork, tower: Point, range: number, tapX: number, tapY: number,
): RallyResult {
  const spot = nearestOnLanes(net, tapX, tapY)
  if (!spot) return { spot: null, refused: 'no-lane' }
  if (Math.hypot(spot.x - tower.x, spot.y - tower.y) > range) {
    return { spot: null, refused: 'out-of-range' }
  }
  return { spot, refused: null }
}

/**
 * Where each of a tower's soldiers stands around one rally point.
 *
 * They share the point rather than each getting their own, so the player has
 * ONE thing to move -- and they are spread along the lane rather than stacked,
 * because two soldiers on the same pixel read as one. The offsets are
 * perpendicular to nothing in particular: they are along the LANE, so a line of
 * soldiers stands across the road rather than beside it.
 */
export function soldierStations(
  net: LaneNetwork, spot: RallySpot, count: number, spacing = 26,
): Point[] {
  const lane = net.lane(spot.laneId)
  const out: Point[] = []
  for (let i = 0; i < count; i++) {
    // Centred on the rally point: 2 soldiers straddle it, 3 put one on it.
    const offset = (i - (count - 1) / 2) * spacing
    const at = Math.max(0, Math.min(lane.path.totalLength, spot.laneDistance + offset))
    const p = lane.path.pointAt(at)
    out.push({ x: p.x, y: p.y })
  }
  return out
}

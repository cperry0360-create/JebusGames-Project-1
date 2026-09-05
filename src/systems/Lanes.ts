// The lanes of a map, and how they join.
//
// A map used to be one waypoint list: one gate in, one gate out, one Path.
// Levels 3 and 4 need two spawn gates whose lanes run separately and then meet
// before the exit, so "the lane" becomes "the lane network".
//
// THE SINGLE-LANE SHAPE IS UNTOUCHED. A map with only `waypoints` resolves to
// exactly one lane called `main`, whose Path is built from those waypoints and
// nothing else — so levels 1 and 2 need no edits and walk the same numbers
// they always did. `lanes` adds branches ALONGSIDE that trunk rather than
// replacing it, which is why the trunk is not duplicated in the data.
//
// A branch's waypoints END where it merges. It names the lane it joins and the
// waypoint INDEX on that lane to continue from, so the join is expressed in
// the target's own terms and moving the branch cannot silently detach it.
//
// Phaser-free on purpose, like the other systems modules: which lanes exist,
// where they meet and how long each route is are all arithmetic, and the tests
// read them directly.

import type { LaneDef, MapDef } from '../types.ts'
import { Path } from './Path.ts'

/** The lane a map has when it declares no lanes at all: its `waypoints`. */
export const MAIN_LANE = 'main'

export interface Lane {
  id: string
  path: Path
  /** Where this lane joins another, or null if it runs to the exit itself. */
  merge: { into: string; atIndex: number } | null
}

/** Where an enemy that is walking `from` ends up when it reaches the join. */
export interface Transfer {
  lane: Lane
  /** Distance along the NEW lane to continue from. */
  distance: number
}

export class LaneNetwork {
  /** Main first, then the declared branches in the order the map lists them. */
  readonly lanes: Lane[]
  private readonly byId = new Map<string, Lane>()

  constructor(map: Pick<MapDef, 'waypoints' | 'lanes'>) {
    const defs: LaneDef[] = [
      { id: MAIN_LANE, waypoints: map.waypoints },
      ...(map.lanes ?? []),
    ]
    this.lanes = defs.map((d) => ({
      id: d.id,
      path: new Path(d.waypoints),
      merge: d.merge ?? null,
    }))
    for (const l of this.lanes) this.byId.set(l.id, l)
  }

  get main(): Lane {
    return this.lanes[0]!
  }

  /** A lane by id, falling back to main. Unknown ids resolve rather than throw
   *  for the same reason Levels.resolveLevelId does: a wave naming a lane that
   *  was renamed should spawn on the trunk, not take the run down. */
  lane(id?: string | null): Lane {
    return (id != null ? this.byId.get(id) : undefined) ?? this.main
  }

  has(id: string): boolean {
    return this.byId.has(id)
  }

  /**
   * Where a lane hands its walkers over, or null if it runs to the exit.
   *
   * The handover happens at the END of the branch — its last waypoint IS the
   * join — and lands at the target's `atIndex`.
   */
  transferFrom(id: string): Transfer | null {
    const lane = this.byId.get(id)
    if (!lane?.merge) return null
    const into = this.byId.get(lane.merge.into)
    if (!into) return null
    return { lane: into, distance: into.path.distanceAtIndex(lane.merge.atIndex) }
  }

  /** The lane a walker starting on `id` finally ends on: the one with no
   *  merge of its own. */
  terminal(id: string): Lane {
    let lane = this.lane(id)
    for (let hops = 0; hops < this.lanes.length; hops++) {
      const next = this.transferFrom(lane.id)
      if (!next) return lane
      lane = next.lane
    }
    // Only reachable if the lanes form a cycle, which `validateLanes` rejects.
    return lane
  }

  /**
   * The whole distance walked from spawning on `id` to the end of the route.
   *
   * The branch in full, then whatever is LEFT of each lane it joins — not the
   * target's whole length, because the walker joins it part way along. This is
   * what "how long is this branch's route" means, and the two branches of a
   * fork are not usually equal.
   */
  routeLength(id: string): number {
    return this.routeFrom(this.lane(id), 0)
  }

  /** The distance still to walk from `start` along `lane` and everything it
   *  joins. Recursion depth is the number of lanes, and `validateLanes`
   *  rejects the cycle that would make it unbounded. */
  private routeFrom(lane: Lane, start: number): number {
    const rest = lane.path.totalLength - start
    const next = this.transferFrom(lane.id)
    return next ? rest + this.routeFrom(next.lane, next.distance) : rest
  }
}

/**
 * What is wrong with a map's lanes, as a list of sentences. Empty means fine.
 *
 * Checked rather than trusted because every one of these is silent at runtime:
 * a merge naming a lane that does not exist strands the walkers on the branch,
 * a duplicate id makes one lane unreachable, and a cycle hangs the walk.
 */
export function validateLanes(map: Pick<MapDef, 'waypoints' | 'lanes'>): string[] {
  const problems: string[] = []
  const defs: LaneDef[] = [
    { id: MAIN_LANE, waypoints: map.waypoints },
    ...(map.lanes ?? []),
  ]

  const seen = new Set<string>()
  for (const d of defs) {
    if (seen.has(d.id)) problems.push(`two lanes are called "${d.id}"`)
    seen.add(d.id)
    if (!Array.isArray(d.waypoints) || d.waypoints.length < 2) {
      problems.push(`lane "${d.id}" has fewer than two waypoints`)
    }
  }

  for (const d of defs) {
    if (!d.merge) continue
    if (d.merge.into === d.id) {
      problems.push(`lane "${d.id}" merges into itself`)
      continue
    }
    if (!seen.has(d.merge.into)) {
      problems.push(`lane "${d.id}" merges into "${d.merge.into}", which is not a lane`)
      continue
    }
    const target = defs.find((t) => t.id === d.merge!.into)!
    const i = d.merge.atIndex
    if (!Number.isInteger(i) || i < 0 || i >= target.waypoints.length) {
      problems.push(
        `lane "${d.id}" merges into "${target.id}" at waypoint ${i}, which that lane does not have ` +
        `(it has ${target.waypoints.length})`)
    }
  }

  // Exactly one lane may run to the exit, and every lane must reach it.
  const terminals = defs.filter((d) => !d.merge)
  if (terminals.length === 0) problems.push('every lane merges; none reaches the exit')
  if (terminals.length > 1 && defs.length > 1) {
    problems.push(
      `lanes ${terminals.map((t) => `"${t.id}"`).join(' and ')} both run to the exit; ` +
      'branches must merge before it')
  }

  // A cycle would hang `terminal` and `routeLength`.
  for (const d of defs) {
    const walked = new Set<string>([d.id])
    let at: LaneDef | undefined = d
    while (at?.merge) {
      const next: LaneDef | undefined = defs.find((t) => t.id === at!.merge!.into)
      if (!next) break
      if (walked.has(next.id)) {
        problems.push(`lane "${d.id}" merges in a circle through "${next.id}"`)
        break
      }
      walked.add(next.id)
      at = next
    }
  }

  return [...new Set(problems)]
}

/** Where a walker is: which lane, and how far along that lane. */
export interface LanePosition {
  laneId: string
  laneDistance: number
}

/**
 * Follows every merge the walker has already reached.
 *
 * PURE, and the single definition of what a merge does — Enemy calls it rather
 * than owning a copy, so the tests that drive this are testing the code that
 * ships rather than a paraphrase of it.
 *
 * The overshoot is carried across the join: a walker that stepped ten pixels
 * past the end of a branch arrives ten pixels past the join, not standing on
 * it. Without that a long frame would quietly lose distance at every merge,
 * and a slow enough frame rate would hold enemies at the join forever.
 *
 * Loops because a branch may join a branch, and one step can cross both. The
 * bound is the lane count; `validateLanes` rejects the cycle that would
 * otherwise make this run away.
 */
export function followMerges(net: LaneNetwork, at: LanePosition): LanePosition {
  let { laneId, laneDistance } = at
  for (let hops = 0; hops <= net.lanes.length; hops++) {
    const next = net.transferFrom(laneId)
    if (!next) break
    const overshoot = laneDistance - net.lane(laneId).path.totalLength
    if (overshoot < 0) break
    laneId = next.lane.id
    laneDistance = next.distance + overshoot
  }
  return { laneId, laneDistance }
}

/** A walker on the network: its lane position plus the monotonic total. */
export interface Walker extends LanePosition {
  /** Total walked, across every lane. Never reset by a merge. */
  distance: number
}

/**
 * Moves a walker one step, following any merge it reaches.
 *
 * `distance` takes the step and nothing else ever touches it, which is what
 * makes it monotonic across a transfer — the property targeting depends on.
 */
export function advance(net: LaneNetwork, w: Walker, step: number): Walker {
  const moved = { laneId: w.laneId, laneDistance: w.laneDistance + step }
  const at = followMerges(net, moved)
  return { ...at, distance: w.distance + step }
}

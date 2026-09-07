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
// A LANE MAY NAME MORE THAN ONE CONTINUATION, which is a SPLIT rather than a
// merge, and is the same field read the other way round: "at the end of this
// lane, carry on along one of these". Level 5's crossroads is two lanes in and
// two lanes out, so it needs both halves. One continuation behaves exactly as
// the single `merge` object always did -- levels 3 and 4 are untouched, down
// to the JSON -- and the arm a walker takes is decided ONCE, from a number it
// carries, so nothing about it is per-frame and the soak and the scene agree
// on where every enemy went.
//
// Phaser-free on purpose, like the other systems modules: which lanes exist,
// where they meet and how long each route is are all arithmetic, and the tests
// read them directly.

import type { LaneDef, MapDef, MergeContinuation } from '../types.ts'
import { Path } from './Path.ts'

/** The lane a map has when it declares no lanes at all: its `waypoints`. */
export const MAIN_LANE = 'main'

/** As much of a map as the lane network reads. */
export type LaneSource = Pick<MapDef, 'waypoints' | 'lanes' | 'mainMerge'>

/**
 * The map's lanes as one list, main first.
 *
 * ONE DEFINITION, called by the network and by the validator, so the two
 * cannot disagree about what a map's lanes are -- which they would have the
 * moment `mainMerge` was folded into one of them and not the other.
 */
export function laneDefs(map: LaneSource): LaneDef[] {
  return [
    { id: MAIN_LANE, waypoints: map.waypoints, merge: map.mainMerge },
    ...(map.lanes ?? []),
  ]
}

export interface Lane {
  id: string
  path: Path
  /**
   * Where this lane's walkers go at its end, or null if it runs to an exit.
   *
   * NORMALISED TO A LIST, and null rather than an empty list when there is
   * nowhere to go, because `merge === null` is what both the scene and the
   * soak read as "this lane reaches the exit" and an empty array would be
   * truthy. One entry is a merge; several are a split.
   */
  merge: MergeContinuation[] | null
}

/** Where an enemy that is walking `from` ends up when it reaches the join. */
export interface Transfer {
  lane: Lane
  /** Distance along the NEW lane to continue from. */
  distance: number
  /** This arm's share of the traffic at a split. 1 at a plain merge. */
  weight: number
}

/** `merge` in whichever shape the map wrote it, as the list the code wants. */
function continuationList(m: LaneDef['merge']): MergeContinuation[] | null {
  if (!m) return null
  const list = Array.isArray(m) ? m : [m]
  return list.length ? list : null
}

/**
 * Which arm of a split a walker carrying `pick` takes, and it is PURE.
 *
 * Weighted rather than uniform so a map can send two thirds of a crossroads
 * one way, and TOTAL rather than per-arm so the weights are shares and not
 * probabilities that have to add to one.
 *
 * Out-of-range and degenerate inputs land on the first arm rather than
 * throwing: a split is geometry the player is standing in front of, and an
 * enemy that stops dead at the junction because a weight was mistyped is a
 * worse failure than one that all goes the same way.
 */
export function chooseContinuation(options: Transfer[], pick: number): Transfer {
  if (options.length <= 1) return options[0]!
  const total = options.reduce((a, o) => a + Math.max(0, o.weight), 0)
  if (!(total > 0) || !Number.isFinite(pick)) return options[0]!
  let at = Math.min(Math.max(pick, 0), 1 - 1e-9) * total
  for (const o of options) {
    at -= Math.max(0, o.weight)
    if (at < 0) return o
  }
  return options[options.length - 1]!
}

/**
 * One walker's choice value AT ONE PARTICULAR SPLIT.
 *
 * A walker carries a single `routePick`. A map with two splits on one route
 * would send every enemy the same way at both if that number were used raw --
 * everything that went left at the first junction would go left at the second
 * -- which is a correlation nobody asked for and which would quietly halve the
 * traffic on two of four exits. Mixing the lane's own id in decorrelates them
 * while keeping the whole thing a pure function of the walker's one number,
 * so a soak seed still reproduces exactly.
 */
export function pickAt(routePick: number, laneId: string): number {
  let h = 2166136261
  for (let i = 0; i < laneId.length; i++) {
    h ^= laneId.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const v = routePick + (h >>> 0) / 4294967296
  return v - Math.floor(v)
}

export class LaneNetwork {
  /** Main first, then the declared branches in the order the map lists them. */
  readonly lanes: Lane[]
  private readonly byId = new Map<string, Lane>()

  constructor(map: LaneSource) {
    const defs = laneDefs(map)
    this.lanes = defs.map((d) => ({
      id: d.id,
      path: new Path(d.waypoints),
      merge: continuationList(d.merge),
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
   * Every place a lane hands its walkers over to. Empty means it runs to an
   * exit.
   *
   * The handover happens at the END of the lane — its last waypoint IS the
   * join — and lands at each target's `atIndex`. A continuation naming a lane
   * that does not exist is DROPPED rather than thrown on, the same way
   * `lane()` resolves an unknown id: `validateLanes` reports it as the typo it
   * is, and a run that reaches this point should keep walking.
   */
  continuations(id: string): Transfer[] {
    const lane = this.byId.get(id)
    if (!lane?.merge) return []
    const out: Transfer[] = []
    for (const m of lane.merge) {
      const into = this.byId.get(m.into)
      if (!into) continue
      out.push({
        lane: into,
        distance: into.path.distanceAtIndex(m.atIndex),
        weight: m.weight ?? 1,
      })
    }
    return out
  }

  /**
   * Where a lane hands its walkers over, or null if it runs to the exit.
   *
   * THE FIRST ARM at a split, which makes it the wrong function to move a
   * walker with and the right one to ask "does this lane reach the exit" —
   * which is what both of its callers in Enemy.ts use it for. `continuations`
   * is the one that moves anything.
   */
  transferFrom(id: string): Transfer | null {
    return this.continuations(id)[0] ?? null
  }

  /** Every lane a walker starting on `id` could finally end on: the ones with
   *  no continuation of their own. One entry on every map before level 5. */
  terminals(id: string): Lane[] {
    const found = new Map<string, Lane>()
    const walk = (lane: Lane, depth: number): void => {
      if (depth > this.lanes.length) return
      const next = this.continuations(lane.id)
      if (!next.length) { found.set(lane.id, lane); return }
      for (const t of next) walk(t.lane, depth + 1)
    }
    walk(this.lane(id), 0)
    return [...found.values()]
  }

  /** The lane a walker starting on `id` finally ends on: the one with no
   *  merge of its own. The FIRST one where the route splits. */
  terminal(id: string): Lane {
    return this.terminals(id)[0] ?? this.lane(id)
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
    return Math.max(...this.routeLengths(id))
  }

  /**
   * Every route out of `id`, one length per exit it can reach.
   *
   * A split has more than one, and `routeLength` takes the LONGEST of them
   * because its callers are asking how much road is left to cover — the
   * Rally placement and the soak's pad reach — and the honest answer to that
   * is the worst case. A map whose two exits are meant to be fair makes this
   * a distinction without a difference, and level 5's are, but a map is not
   * required to and the arithmetic should not assume it.
   */
  routeLengths(id: string): number[] {
    return this.routesFrom(this.lane(id), 0, 0)
  }

  /** The distances still to walk from `start` along `lane` and everything it
   *  joins. Recursion depth is the number of lanes, and `validateLanes`
   *  rejects the cycle that would make it unbounded. */
  private routesFrom(lane: Lane, start: number, depth: number): number[] {
    const rest = lane.path.totalLength - start
    const next = depth > this.lanes.length ? [] : this.continuations(lane.id)
    if (!next.length) return [rest]
    return next.flatMap((t) => this.routesFrom(t.lane, t.distance, depth + 1).map((d) => rest + d))
  }
}

/**
 * What is wrong with a map's lanes, as a list of sentences. Empty means fine.
 *
 * Checked rather than trusted because every one of these is silent at runtime:
 * a merge naming a lane that does not exist strands the walkers on the branch,
 * a duplicate id makes one lane unreachable, and a cycle hangs the walk.
 */
export function validateLanes(map: LaneSource): string[] {
  const problems: string[] = []
  const defs = laneDefs(map)

  const seen = new Set<string>()
  for (const d of defs) {
    if (seen.has(d.id)) problems.push(`two lanes are called "${d.id}"`)
    seen.add(d.id)
    if (!Array.isArray(d.waypoints) || d.waypoints.length < 2) {
      problems.push(`lane "${d.id}" has fewer than two waypoints`)
    }
  }

  const contsOf = (d: LaneDef): MergeContinuation[] => continuationList(d.merge) ?? []

  for (const d of defs) {
    const conts = contsOf(d)
    if (Array.isArray(d.merge) && d.merge.length === 0) {
      problems.push(`lane "${d.id}" declares an empty merge list; omit it to reach an exit`)
    }
    const named = new Set<string>()
    for (const m of conts) {
      if (named.has(m.into)) {
        problems.push(`lane "${d.id}" continues into "${m.into}" twice`)
      }
      named.add(m.into)
      if (m.into === d.id) {
        problems.push(`lane "${d.id}" merges into itself`)
        continue
      }
      if (!seen.has(m.into)) {
        problems.push(`lane "${d.id}" merges into "${m.into}", which is not a lane`)
        continue
      }
      if (m.weight !== undefined && !(Number.isFinite(m.weight) && m.weight > 0)) {
        problems.push(`lane "${d.id}" gives "${m.into}" a weight of ${m.weight}; it must be above zero`)
      }
      const target = defs.find((t) => t.id === m.into)!
      const i = m.atIndex
      if (!Number.isInteger(i) || i < 0 || i >= target.waypoints.length) {
        problems.push(
          `lane "${d.id}" merges into "${target.id}" at waypoint ${i}, which that lane does not have ` +
          `(it has ${target.waypoints.length})`)
      }
    }
  }

  // SOMETHING has to reach an exit.
  //
  // The rule this replaces was stronger -- EXACTLY one lane could reach the
  // exit -- and it was right for every map that existed when it was written,
  // because all of them were forks feeding one gate and a second terminal was
  // always a `merge` somebody forgot. Level 5's crossroads has two exits and
  // both cost lives, so that rule now rejects a correct map.
  //
  // What is checked instead is the property the old rule was really protecting:
  // every lane is JOINED UP. A lane nothing continues into and that itself has
  // a continuation is fine (it is a gate); a lane nothing continues into that
  // ALSO reaches an exit on its own is a route with no way onto it, which is
  // the forgotten-merge typo wearing a different hat, and it is reported.
  const terminals = defs.filter((d) => contsOf(d).length === 0)
  if (terminals.length === 0) problems.push('every lane merges; none reaches the exit')
  const fedInto = new Set<string>()
  for (const d of defs) for (const m of contsOf(d)) fedInto.add(m.into)
  if (defs.length > 1) {
    for (const d of terminals) {
      if (!fedInto.has(d.id) && d.id !== MAIN_LANE) {
        problems.push(
          `lane "${d.id}" reaches an exit but nothing merges into it; it is a route with no gate`)
      }
    }
  }

  // A cycle would hang `terminals` and `routeLengths`.
  for (const d of defs) {
    const walked = new Set<string>([d.id])
    const step = (at: LaneDef): void => {
      for (const m of contsOf(at)) {
        const next = defs.find((t) => t.id === m.into)
        if (!next) continue
        if (walked.has(next.id)) {
          problems.push(`lane "${d.id}" merges in a circle through "${next.id}"`)
          continue
        }
        walked.add(next.id)
        step(next)
      }
    }
    step(d)
  }

  return [...new Set(problems)]
}

/** Where a walker is: which lane, and how far along that lane. */
export interface LanePosition {
  laneId: string
  laneDistance: number
  /**
   * This walker's own number in [0, 1), which decides which arm of a split it
   * takes. Absent means 0, which is the first arm — so nothing that predates
   * splits changes behaviour, and a map with no split never reads it.
   *
   * CHOSEN ONCE, at spawn, and never touched again. A value rolled per frame
   * would let an enemy standing on a junction flicker between two roads.
   */
  routePick?: number
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
  const routePick = at.routePick ?? 0
  for (let hops = 0; hops <= net.lanes.length; hops++) {
    const options = net.continuations(laneId)
    if (!options.length) break
    const overshoot = laneDistance - net.lane(laneId).path.totalLength
    if (overshoot < 0) break
    // The arm is a function of the walker's own number and the junction's own
    // id, so it is settled before the enemy gets there and is the same answer
    // in the scene and in the soak.
    const next = chooseContinuation(options, pickAt(routePick, laneId))
    laneId = next.lane.id
    laneDistance = next.distance + overshoot
  }
  return { laneId, laneDistance, routePick: at.routePick }
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
  const moved = { laneId: w.laneId, laneDistance: w.laneDistance + step, routePick: w.routePick }
  const at = followMerges(net, moved)
  return { ...at, distance: w.distance + step }
}

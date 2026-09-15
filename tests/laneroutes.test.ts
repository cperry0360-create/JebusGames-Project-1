import { test } from 'node:test'
import assert from 'node:assert/strict'
import { continuationList, laneDefs } from '../src/systems/Lanes.ts'
import { LEVELS, loadLevel } from '../src/systems/Levels.ts'
import type { LaneDef } from '../src/types.ts'

/**
 * A ROAD MAY NOT DOUBLE BACK, and until this file existed nothing checked it.
 *
 * Live play reported level 8's east entrants visibly reversing. The cause was
 * the merge, not the trace: the east arm is the east EXIT's traced polyline
 * walked the other way, so it ended at the fork, and it merged into `south` at
 * index 0 because that is where the exit used to begin. `south`'s first move
 * from the fork is back down through (1029, 399) — 3 px from a point the east
 * arm had passed two steps earlier, after climbing 76 px to get there. A 135
 * degree hairpin.
 *
 * WHY EVERY EXISTING CHECK WAS CLEAN, which is the part worth keeping:
 *
 * 1. `validateLanes` checks that a merge names a real lane and a real index.
 *    Both were real.
 * 2. `tools/check_level8.py` and `tests/level8.test.ts` measure the LANES.
 *    The fault was at the handover between two of them, and each lane on its
 *    own was fine.
 * 3. A turn angle measured on the naive concatenation reads 0 degrees at the
 *    join. `atIndex: 0` makes the join point appear TWICE — the arm's last
 *    waypoint and the target's first are the same coordinate — so the segment
 *    across the join has zero length and no direction at all. Duplicate points
 *    are dropped here before anything is measured, and that one line is the
 *    difference between seeing the hairpin and not.
 *
 * Both thresholds are calibrated against every route on all ten levels rather
 * than picked. The widest turn anywhere else is 90.0 degrees — level 6's flank
 * and level 8's own south arm, in both cases the computed stub that takes the
 * road off a horizontal frame edge — and the closest any other route comes
 * back to itself is 0.79 road widths, on level 5's north arm. Level 8's east
 * route was 135 degrees and 0.06. It was an outlier by a factor of twelve.
 */
const TURN_MAX_DEG = 100
const REVISIT_MIN_ROADS = 0.7

type P = [number, number]

const dedupe = (pts: P[]): P[] => {
  const out: P[] = [pts[0]!]
  for (const p of pts.slice(1)) {
    const q = out[out.length - 1]!
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6) out.push(p)
  }
  return out
}

const turnDeg = (a: P, b: P, c: P): number => {
  const ux = b[0] - a[0], uy = b[1] - a[1]
  const vx = c[0] - b[0], vy = c[1] - b[1]
  const nu = Math.hypot(ux, uy), nv = Math.hypot(vx, vy)
  if (nu < 1e-9 || nv < 1e-9) return 0
  return (Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (nu * nv)))) * 180) / Math.PI
}

/**
 * Every route through a map, as the point list a walker visits.
 *
 * A SPLIT PRODUCES ONE ROUTE PER ARM. Level 5's crossroads has four, and each
 * has to be walked: a reversal on one arm of a split is a reversal.
 */
function routes(defs: LaneDef[]): Array<{ name: string; pts: P[] }> {
  const byId = new Map(defs.map((d) => [d.id, d]))
  const expand = (id: string, depth: number): Array<{ name: string; pts: P[] }> => {
    const d = byId.get(id)
    if (!d) return []
    const base = d.waypoints.map((w) => [w[0]!, w[1]!] as P)
    const conts = depth > 8 ? null : continuationList(d.merge)
    if (!conts || conts.length === 0) return [{ name: id, pts: base }]
    const out: Array<{ name: string; pts: P[] }> = []
    for (const c of conts) {
      const tail = expand(c.into, depth + 1)
      if (tail.length === 0) { out.push({ name: id, pts: base }); continue }
      for (const t of tail) {
        // THE HANDOVER IS A STEP. `Enemy.followMerge` sets `laneDistance` to
        // the join, so the walker's position moves from the arm's last point
        // to the target's `atIndex` in one frame — and the direction of that
        // move is exactly what reversed. Slicing the target at `atIndex` and
        // concatenating reproduces it.
        out.push({ name: `${id}>${t.name}`, pts: base.concat(t.pts.slice(c.atIndex)) })
      }
    }
    return out
  }
  const fed = new Set<string>()
  for (const d of defs) for (const c of continuationList(d.merge) ?? []) fed.add(c.into)
  const starts = defs.filter((d) => d.entrance || !fed.has(d.id)).map((d) => d.id)
  return starts.flatMap((s) => expand(s, 0))
}

test('no route on any level ever turns back on itself', () => {
  const report: string[] = []
  for (const def of LEVELS) {
    const level = loadLevel(def.id)
    const road = level.map.roadWidth
    assert.ok(road > 0, `${def.id} has no road width`)
    const found = routes(laneDefs(level.map))
    assert.ok(found.length > 0, `${def.id} has no routes at all`)
    for (const { name, pts } of found) {
      const q = dedupe(pts)
      assert.ok(q.length >= 3, `${def.id} ${name} is ${q.length} points`)

      // 1. THE HAIRPIN: two consecutive segments that nearly fold back.
      let worstTurn = 0
      let worstAt = ''
      for (let i = 1; i < q.length - 1; i++) {
        const t = turnDeg(q[i - 1]!, q[i]!, q[i + 1]!)
        if (t > worstTurn) { worstTurn = t; worstAt = `(${q[i]![0]}, ${q[i]![1]})` }
      }
      assert.ok(worstTurn <= TURN_MAX_DEG,
        `${def.id} ${name}: the road turns ${worstTurn.toFixed(0)} degrees at ${worstAt}, `
        + `past the ${TURN_MAX_DEG} the widest bend on any other route makes`)

      // 2. THE LOOP BACK: a route that comes alongside a stretch it walked
      //    earlier, which a run of gentle turns can do with no single bend
      //    looking wrong. Pairs closer together than one road width of travel
      //    are skipped: consecutive waypoints are metres apart by construction
      //    and comparing them would measure the trace's own resolution.
      const cum = [0]
      for (let i = 1; i < q.length; i++) {
        cum.push(cum[i - 1]! + Math.hypot(q[i]![0] - q[i - 1]![0], q[i]![1] - q[i - 1]![1]))
      }
      let closest = Infinity
      let closestAt = ''
      for (let i = 0; i < q.length; i++) {
        for (let j = i + 1; j < q.length; j++) {
          if (cum[j]! - cum[i]! < road) continue
          const d = Math.hypot(q[j]![0] - q[i]![0], q[j]![1] - q[i]![1])
          if (d < closest) {
            closest = d
            closestAt = `(${q[i]![0]}, ${q[i]![1]}) after ${(cum[j]! - cum[i]!).toFixed(0)} px`
          }
        }
      }
      assert.ok(closest >= REVISIT_MIN_ROADS * road,
        `${def.id} ${name}: the road comes back within ${closest.toFixed(1)} px of `
        + `${closestAt} — ${(closest / road).toFixed(2)} of a ${road} px road width, under `
        + `the ${REVISIT_MIN_ROADS} that every other route on every level clears`)
      report.push(`${def.id} ${name}: turn ${worstTurn.toFixed(0)}deg, `
        + `revisit ${(closest / road).toFixed(2)}x road`)
    }
  }
  // 22 routes across ten levels. Pinned so a level losing its lanes silently
  // cannot make this test pass by having nothing to check.
  assert.ok(report.length >= 22,
    `only ${report.length} routes were walked; the lane tables have shrunk`)
})

test('a merge hands over inside the painted road', () => {
  // The other half of the level 8 fix, and the cost of it. Truncating the east
  // arm so it does not climb to the fork leaves the arm's last point 25 px
  // from the `south` waypoint it merges into, because the two are separately
  // traced centrelines that do not share a pixel away from the fork — and the
  // handover is a POSITION SNAP, not a walk. 25 px is the smallest gap any
  // non-reversing join of those two polylines has; 532 candidates that would
  // have been closer walked backward.
  //
  // Half a road width is the bar: both ends of the hop are then on painted
  // road, so it reads as a stride rather than a teleport. Every other merge in
  // the game shares a coordinate and measures 0.
  for (const def of LEVELS) {
    const level = loadLevel(def.id)
    const road = level.map.roadWidth
    const defs = laneDefs(level.map)
    const byId = new Map(defs.map((d) => [d.id, d]))
    for (const d of defs) {
      for (const c of continuationList(d.merge) ?? []) {
        const target = byId.get(c.into)
        if (!target) continue
        const from = d.waypoints[d.waypoints.length - 1]!
        const to = target.waypoints[c.atIndex]
        assert.ok(to, `${def.id}: lane "${d.id}" merges into "${c.into}" at a waypoint it lacks`)
        const gap = Math.hypot(from[0]! - to![0]!, from[1]! - to![1]!)
        assert.ok(gap <= road / 2 + 0.5,
          `${def.id}: lane "${d.id}" hands over ${gap.toFixed(1)} px from "${c.into}" `
          + `waypoint ${c.atIndex}, more than half its ${road} px road width`)
      }
    }
  }
})

// LEVEL 9'S THREE LANES, and the one segment of them that is not painted road.
//
// The plate paints a road round the bottom right that left the tail and came
// back to the trace beside the door, and until the flank lane existed nothing
// walked it: 10.33% of level 9's painted trace, 16,024 world px, the largest
// orphan on any of the ten boards. tests/orphanroads.test.ts is the general
// check; this is the receipt for the lane that answered it.
//
// THE SPUR IS A STUB, NOT A LOOP, and that is the fact this file exists to
// pin. Its north end IS the door junction. Its south end is a rounded cap on
// open substrate, 112 px from the tail with 63 px of bare board between the
// two kerbs, so the flank cannot be all paint and ONE segment of it is
// authored. Level 6 took the same decision for the same reason and
// tests/level6map.test.ts pins its 82 px join to the pixel; this pins level
// 9's, and pins that there is exactly one of them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  LaneNetwork, pickForBranch, routeLanes, validateLanes,
} from '../src/systems/Lanes.ts'
import { badgeWorldWidth, markersFor, type MarkerConfig } from '../src/systems/Markers.ts'
import { laneGates } from '../src/systems/Gateway.ts'
import map from '../src/data/map_level9.json' with { type: 'json' }
import waves from '../src/data/waves.level9.json' with { type: 'json' }
import markerCfg from '../src/data/markers.json' with { type: 'json' }
import display from '../src/data/display.json' with { type: 'json' }

const M = map as unknown as {
  roadWidth: number; mainId: string; flankId: string
  waypoints: number[][]
  mainMerge: { into: string; atIndex: number }
  lanes: { id: string; waypoints: number[][]; entrance?: boolean
           merge?: { into: string; atIndex: number; weight?: number }
                 | { into: string; atIndex: number; weight?: number }[] }[]
  exit: { gateX: number; vanishX: number }
  buildSpots: number[][]
}
const W = waves as unknown as { waves: { name: string; flankShare?: number }[] }
const GEO = JSON.parse(
  readFileSync(new URL('../tools/level9_geometry.json', import.meta.url), 'utf8'))
const MASK = JSON.parse(readFileSync(
  new URL('./fixtures/road-masks.json', import.meta.url), 'utf8')).levels.level9 as {
    scale: number; w: number; h: number; rows: string[] }

const lane = (id: string): { id: string; waypoints: number[][]; merge?: unknown } =>
  id === M.mainId
    ? { id, waypoints: M.waypoints, merge: M.mainMerge }
    : M.lanes.find((l) => l.id === id)!
const length = (w: number[][]): number =>
  w.slice(1).reduce((a, p, i) => a + Math.hypot(p[0]! - w[i]![0]!, p[1]! - w[i]![1]!), 0)

test('level 9 has three lanes past the fork and the network accepts them', () => {
  assert.deepEqual(M.lanes.map((l) => l.id), ['south', 'tail', 'flank', 'hook'])
  assert.deepEqual(validateLanes(M), [])
  const net = new LaneNetwork(M)
  // ONE TERMINAL, and it is the hook. `tail` splits, `flank` rejoins, and only
  // a lane with no continuation can leak — which is what makes the door the
  // only way out of this board.
  assert.deepEqual(net.lanes.filter((l) => l.merge === null).map((l) => l.id), ['hook'])
  assert.deepEqual(net.terminals('north').map((l) => l.id), ['hook'])
  assert.deepEqual(net.terminals('south').map((l) => l.id), ['hook'])
})

test('the tail splits and the flank comes back onto the hook short of the door', () => {
  const tail = lane('tail'), flank = lane('flank'), hook = lane('hook')
  const junction = tail.waypoints[tail.waypoints.length - 1]!
  // ONE POINT, THREE LANES. `atIndex: 0` on both arms of the split means the
  // three have to agree about where the junction is exactly, not nearly.
  assert.deepEqual(flank.waypoints[0], junction)
  assert.deepEqual(hook.waypoints[0], junction)
  assert.deepEqual(junction, GEO.nodes.flankJoin)

  const merges = flank.merge as { into: string; atIndex: number }
  assert.equal(merges.into, 'hook')
  assert.deepEqual(hook.waypoints[merges.atIndex], GEO.nodes.doorJunction)
  assert.deepEqual(flank.waypoints[flank.waypoints.length - 1], GEO.nodes.doorJunction)
  // The rejoin is BEFORE the door, so the flank inherits the door's gate and
  // fade instead of needing a second gateX. `Gateway.distanceAtX` takes the
  // first crossing of an x, and a second gate on this route is the thing
  // map_level9.json's `exit._note` warns about.
  const afterRejoin = length(hook.waypoints.slice(merges.atIndex))
  assert.ok(afterRejoin > 60 && afterRejoin < 80,
    `the flank rejoins ${afterRejoin.toFixed(0)} px short of the door, not the expected 74`)
})

test('the flank is a SHORTCUT, and a small one', () => {
  const flank = lane('flank'), hook = lane('hook')
  const at = (flank.merge as { atIndex: number }).atIndex
  const mine = length(flank.waypoints)
  const replaced = length(hook.waypoints.slice(0, at + 1))
  assert.ok(mine < replaced, `the flank is ${mine.toFixed(1)} px against ${replaced.toFixed(1)}`)
  // PINNED WITH BOTH NUMBERS because "shortcut or detour" is the question the
  // share is tuned against, and 6% is a different level from 60%: the south
  // arm saves 55% over the north and IS the cheap road, and this is not that.
  assert.ok(Math.abs(mine - 494.1) < 1, `the flank is ${mine.toFixed(1)} px, not 494.1`)
  assert.ok(Math.abs(replaced - 528.1) < 1, `it replaces ${replaced.toFixed(1)} px, not 528.1`)
  const saved = (replaced - mine) / replaced
  assert.ok(saved > 0.05 && saved < 0.08, `the flank saves ${(saved * 100).toFixed(1)}%`)

  const net = new LaneNetwork(M)
  // A route that takes it is shorter than one that does not, from either mouth.
  for (const from of ['north', 'south']) {
    const lengths = net.routeLengths(from).sort((a, b) => a - b)
    assert.equal(lengths.length, 2, `${from} should reach the door two ways`)
    assert.ok(lengths[1]! - lengths[0]! > 30, `${from}'s two routes differ by too little`)
  }
})

test('exactly one segment of level 9 leaves the painted road, and it is the join', () => {
  // WHAT THE PLAYER SEES, measured against the thresholded plate rather than
  // reasoned about. Every lane is walked at one world pixel and each step is
  // asked whether there is trace under it; the runs that are not are collected.
  // There must be exactly one, it must be the join, and it must be the length
  // the geometry file says.
  const painted = new Set<number>()
  MASK.rows.forEach((row, y) => {
    if (!row) return
    for (const run of row.split(',')) {
      const [at, len] = run.split(':').map(Number) as [number, number]
      for (let i = 0; i < len; i++) painted.add(y * MASK.w + at + i)
    }
  })
  // The mask is sampled every `scale` px, so "on the road" allows the sample
  // either side. Without that every diagonal reads as half off the road.
  const onRoad = (x: number, y: number): boolean => {
    const cx = Math.round(x / MASK.scale), cy = Math.round(y / MASK.scale)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy
        if (nx >= 0 && nx < MASK.w && ny >= 0 && ny < MASK.h && painted.has(ny * MASK.w + nx)) {
          return true
        }
      }
    }
    return false
  }

  const offRoad: { from: number[]; to: number[]; len: number; lane: string }[] = []
  for (const id of [M.mainId, ...M.lanes.map((l) => l.id)]) {
    const w = lane(id).waypoints
    let run: number[][] = []
    for (let i = 1; i < w.length; i++) {
      const a = w[i - 1]!, b = w[i]!
      const steps = Math.max(1, Math.ceil(Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!)))
      for (let k = 0; k <= steps; k++) {
        const t = k / steps
        const x = a[0]! + (b[0]! - a[0]!) * t, y = a[1]! + (b[1]! - a[1]!) * t
        // Off the PLATE is not off the road: every lane but this map's exit
        // starts at a computed gateway point outside the frame.
        if (x < 0 || y < 0 || x > 1280 || y > 720) continue
        if (onRoad(x, y)) {
          if (run.length > 1) {
            offRoad.push({
              from: run[0]!, to: run[run.length - 1]!, lane: id,
              len: Math.hypot(run[run.length - 1]![0]! - run[0]![0]!,
                              run[run.length - 1]![1]! - run[0]![1]!),
            })
          }
          run = []
        } else run.push([x, y])
      }
    }
  }
  const real = offRoad.filter((r) => r.len > 8)
  assert.equal(real.length, 1,
    `level 9 walks off the paint in ${real.length} places: ` +
    real.map((r) => `${r.lane} (${r.from.map(Math.round)}) to (${r.to.map(Math.round)}), ` +
      `${r.len.toFixed(0)} px`).join('; '))
  assert.equal(real[0]!.lane, 'flank')
  assert.ok(Math.abs(real[0]!.len - GEO.flank.joinBare) < 12,
    `the bare crossing measures ${real[0]!.len.toFixed(1)} px against the geometry file's ` +
    `${GEO.flank.joinBare}`)
  // AND IT THREADS THE GAP. The corridor is chip 13's right edge at x=855 on
  // one side and the painted capacitor at x=903 on the other; a join that
  // crossed either would draw enemies over a component.
  for (const p of [real[0]!.from, real[0]!.to]) {
    assert.ok(p[0]! > 855 && p[0]! < 903, `the join passes through x=${p[0]!.toFixed(0)}`)
  }
})

test('the flank gets no badge: one mouth, one door, unchanged', () => {
  // THE REAL CONFIG AND THE REAL BADGE WIDTH, because `mergeNearby` folds two
  // badges together within `mergeWithin` badge widths and a made-up width
  // changes the answer — level 9's two arms share one painted mouth and it is
  // that fold which makes them one badge.
  const cfg = markerCfg as unknown as MarkerConfig
  const D = display as unknown as { width: number; height: number; camera: { defaultZoom: number } }
  const found = markersFor(M, cfg, badgeWorldWidth(cfg, D.camera.defaultZoom),
    { width: D.width, height: D.height })
  const spawns = found.filter((m) => m.kind === 'spawn')
  const exits = found.filter((m) => m.kind === 'exit')
  // ONE SPAWN BADGE, standing for both arms out of the one painted mouth, and
  // ONE DOOR. `flank` and `hook` both start mid-board and both are fed into, so
  // neither is an entrance; the door is the map's only lane with no merge.
  assert.equal(spawns.length, 1, `level 9 draws ${spawns.length} spawn badges`)
  assert.deepEqual([...spawns[0]!.lanes].sort(), ['north', 'south'])
  assert.equal(exits.length, 1, `level 9 draws ${exits.length} exit badges`)
  assert.deepEqual(exits[0]!.lanes, ['hook'])
  assert.ok(Math.abs(exits[0]!.x - M.exit.vanishX) < 1 && Math.abs(exits[0]!.y - 329) < 1,
    `the door badge is at (${exits[0]!.x}, ${exits[0]!.y}), not the door`)
})

test('only the hook reaches the gate, so the fade fires once and at the door', () => {
  const net = new LaneNetwork(M)
  const gates = laneGates(
    net.lanes.map((l) => ({
      id: l.id, waypoints: l.path.points.map((p) => [p.x, p.y]),
      totalLength: l.path.totalLength,
    })),
    { gateX: M.exit.gateX, vanishX: M.exit.vanishX })
  for (const l of net.lanes) {
    if (l.id === 'hook') {
      assert.ok(gates[l.id]!.stopDistance > gates[l.id]!.gateDistance,
        'the hook has no fade before the door')
      assert.ok(Math.abs(gates[l.id]!.stopDistance - l.path.totalLength) < 0.5,
        'the hook stops somewhere other than its own last waypoint')
    } else {
      // A lane that never reaches gateX falls back to its own length, which is
      // right: nothing on it is fading and nothing on it can leak.
      assert.ok(Math.abs(gates[l.id]!.stopDistance - l.path.totalLength) < 1e-6,
        `${l.id} has a stop distance short of its own end`)
      assert.ok(Math.max(...l.path.points.map((p) => p.x)) < M.exit.gateX,
        `${l.id} reaches past the gate at x=${M.exit.gateX}`)
    }
  }
})

test('every wave declares its share of the flank, and the share routes', () => {
  assert.equal(M.flankId, 'flank')
  for (const [i, w] of W.waves.entries()) {
    assert.equal(typeof w.flankShare, 'number',
      `wave ${i + 1} "${w.name}" declares no flankShare`)
    assert.ok(w.flankShare! > 0 && w.flankShare! < 1,
      `wave ${i + 1}'s share is ${w.flankShare}`)
  }
  // A QUARTER, everywhere, as the starting recommendation. Pinned so a tuning
  // pass is a deliberate edit rather than a drift.
  assert.deepEqual([...new Set(W.waves.map((w) => w.flankShare))], [0.25])

  // AND THE NUMBER ACTUALLY SENDS THEM THERE. `pickForBranch` is what the
  // scene and the soak both turn the share into, so this drives the real
  // function from both mouths rather than trusting it.
  const net = new LaneNetwork(M)
  for (const from of ['north', 'south']) {
    const takes = pickForBranch(net, from, 'flank', true)
    const avoids = pickForBranch(net, from, 'flank', false)
    assert.ok(takes !== null && avoids !== null, `no pick routes a walker from ${from}`)
    assert.ok(routeLanes(net, from, takes!).includes('flank'), `${from}'s flank pick does not`)
    assert.ok(!routeLanes(net, from, avoids!).includes('flank'), `${from}'s trunk pick does`)
    // Both still end at the door. A share that could strand a quarter of a
    // wave would show up as a level nobody can lose.
    for (const p of [takes!, avoids!]) {
      assert.equal(routeLanes(net, from, p).at(-1), 'hook')
    }
  }
})

test('five chips can cover the flank, and one of them could cover nothing before', () => {
  // THE ANSWER TO "is this a route no tower can reach", which would be worse
  // than a decorative one. Measured here off the shipped pads and the shipped
  // lane, at the shortest attacking range in towers.json.
  const flank = lane('flank').waypoints
  const RANGE = GEO.towerRange as number
  const near = (p: number[]): number => {
    let best = Infinity
    for (let i = 1; i < flank.length; i++) {
      const a = flank[i - 1]!, b = flank[i]!
      const dx = b[0]! - a[0]!, dy = b[1]! - a[1]!
      const l2 = dx * dx + dy * dy
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0]! - a[0]!) * dx + (p[1]! - a[1]!) * dy) / l2))
      best = Math.min(best, Math.hypot(a[0]! + t * dx - p[0]!, a[1]! + t * dy - p[1]!))
    }
    return best
  }
  const covering = M.buildSpots
    .map((p, i) => ({ n: i + 1, d: near(p) }))
    .filter((c) => c.d <= RANGE)
    .map((c) => c.n)
  assert.deepEqual(covering, GEO.padsCoveringFlank)
  assert.deepEqual(covering, [8, 9, 12, 13, 15])
  // PAD 15 IS THE POINT. 194 px from the trunk at a 132 px range, so it could
  // not shoot at anything on any board before this change; 74 px from the flank.
  assert.ok(GEO.padsUnreachable.includes(15))
  assert.deepEqual(GEO.padsUnreachableEvenWithFlank, [1, 7])
})

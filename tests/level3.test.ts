import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LaneNetwork, MAIN_LANE, advance, validateLanes, type Walker } from '../src/systems/Lanes.ts'
import { loadLevel } from '../src/systems/Levels.ts'
import map from '../src/data/map_level3.json' with { type: 'json' }
import waves from '../src/data/waves.level3.json' with { type: 'json' }
import enemies from '../src/data/enemies.json' with { type: 'json' }
import towers from '../src/data/towers.json' with { type: 'json' }
import levels from '../src/data/levels.json' with { type: 'json' }

const GEOMETRY = JSON.parse(
  readFileSync(new URL('../tools/level3_geometry.json', import.meta.url), 'utf8'))
const M = map as unknown as {
  roadWidth: number
  spotRadius: number
  heroStart: number[]
  waypoints: number[][]
  buildSpots: number[][]
  lanes: Array<{ id: string; waypoints: number[][]; merge: { into: string; atIndex: number } }>
}
const E = enemies as Record<string, { maxHealth: number; tier: string }>
const W = waves as unknown as {
  waves: Array<{ name: string; boss?: string; spawns: Array<{ enemy: string; count: number; lane?: string }> }>
}

const len = (p: number[][]): number => {
  let d = 0
  for (let i = 0; i < p.length - 1; i++) d += Math.hypot(p[i + 1]![0]! - p[i]![0]!, p[i + 1]![1]! - p[i]![1]!)
  return d
}
const toPoly = (p: number[][]): Array<[number, number]> => p.map((q) => [q[0]!, q[1]!])
const distToPoly = (x: number, y: number, poly: Array<[number, number]>): number => {
  let best = Infinity
  for (let i = 0; i < poly.length - 1; i++) {
    const [ax, ay] = poly[i]!
    const [bx, by] = poly[i + 1]!
    const dx = bx - ax, dy = by - ay
    const L = dx * dx + dy * dy
    const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)))
  }
  return best
}

/* --------------------------------------------------------------- both lanes */

test('both gates run to the exit, and neither strands its walkers', () => {
  assert.deepEqual(validateLanes(M as never), [])
  const net = new LaneNetwork(M as never)
  assert.deepEqual(net.lanes.map((l) => l.id), [MAIN_LANE, 'upper', 'lower'])

  for (const id of ['upper', 'lower']) {
    assert.equal(net.terminal(id).id, MAIN_LANE, `${id} does not end up on the shared tail`)
    assert.equal(net.lane(id).merge!.into, MAIN_LANE)
    assert.equal(net.lane(id).merge!.atIndex, 0, `${id} joins the tail somewhere other than its start`)
  }
  // Exactly one lane may run to the exit, and it is the tail.
  assert.deepEqual(net.lanes.filter((l) => l.merge === null).map((l) => l.id), [MAIN_LANE])
})

test('an enemy from either gate walks its whole route and leaves by the same exit', () => {
  // Walked with the engine's own `advance`, one step at a time, rather than
  // asserted from the arithmetic: this is the property a player sees.
  const net = new LaneNetwork(M as never)
  const exit = net.main.path.points[net.main.path.points.length - 1]!
  for (const gate of ['upper', 'lower']) {
    let w: Walker = { laneId: gate, laneDistance: 0, distance: 0 }
    const route = net.routeLength(gate)
    let steps = 0
    let last = -1
    while (w.distance < route && steps++ < 20000) {
      w = advance(net, w, 3)
      assert.ok(w.distance > last, `${gate}: progress went backwards at ${w.distance}`)
      last = w.distance
    }
    assert.ok(steps < 20000, `${gate} never reached the exit`)
    assert.equal(net.lane(w.laneId).id, MAIN_LANE, `${gate} did not finish on the shared tail`)
    const p = net.lane(w.laneId).path.pointAt(w.laneDistance)
    assert.ok(Math.hypot(p.x - exit.x, p.y - exit.y) < 4,
      `${gate} finished at (${p.x.toFixed(0)}, ${p.y.toFixed(0)}), not the exit`)
  }
})

test('the two routes are the same length, so neither gate is the fast one', () => {
  // Not a coincidence to be tidied away later: the wave table leans on it.
  // Groups released from both gates on the same delay arrive together, which is
  // what makes a split wave a two-front problem instead of a queue.
  const net = new LaneNetwork(M as never)
  const upper = net.routeLength('upper')
  const lower = net.routeLength('lower')
  assert.ok(Math.abs(upper - lower) < 1,
    `the routes differ by ${Math.abs(upper - lower).toFixed(2)}px; the wave table assumes they do not`)

  const recorded = (levels as any).levels.find((l: any) => l.id === 'level3').laneLengthPx
  for (const [name, v] of [['upper', upper], ['lower', lower]] as const) {
    assert.equal(Math.round(v * 10) / 10, recorded,
      `${name} walks ${v.toFixed(1)} but levels.json records ${recorded}`)
  }
})

/* ------------------------------------------------- against the geometry file */

test('the branch lengths are the geometry file\'s, on the plate', () => {
  // map_level3.json adds one gateway point at each end so enemies walk in and
  // out off the plate, so its routes are LONGER than the geometry file's by
  // exactly those two runs. Strip them and the two must agree.
  const tail = len(M.waypoints.slice(0, -1))          // without the exit gateway
  for (const id of ['upper', 'lower']) {
    const branch = M.lanes.find((l) => l.id === id)!
    const onPlate = len(branch.waypoints.slice(1)) + tail   // without the entry gateway
    const declared = GEOMETRY.lengths[id]
    const off = Math.abs(onPlate - declared) / declared
    assert.ok(off < 0.005,
      `${id} walks ${onPlate.toFixed(1)} on the plate against the geometry file's ${declared}`)
  }
  assert.equal(M.roadWidth, GEOMETRY.roadWidth)
})

test('every branch ends exactly on the merge point', () => {
  // The traced branches stopped 3.26px and 8.47px short of it, and a branch
  // that does not end at the join makes an enemy step sideways as it transfers.
  const merge = GEOMETRY.merge as [number, number]
  const round = (v: number) => Math.round(v * 10) / 10
  for (const l of M.lanes) {
    const last = l.waypoints[l.waypoints.length - 1]!
    assert.deepEqual(last, [round(merge[0]), round(merge[1])],
      `lane ${l.id} does not end on the merge point`)
  }
  assert.deepEqual(M.waypoints[0], [round(merge[0]), round(merge[1])],
    'the shared tail does not start at the merge point')
})

/* --------------------------------------------------------------- the pads */

test('fifteen pads, all of them the geometry file\'s', () => {
  assert.equal(M.buildSpots.length, 15)
  assert.deepEqual(M.buildSpots, GEOMETRY.pads)
})

test('no two pads are closer than the tap targets allow', () => {
  // 2 x spotRadius is where two pads' tap targets start to overlap, and the
  // geometry was authored to 74. Both bounds are checked so a future pad set
  // cannot quietly cross either.
  const floor = 2 * M.spotRadius
  let closest = Infinity
  let pair = ''
  for (let i = 0; i < M.buildSpots.length; i++) {
    for (let j = i + 1; j < M.buildSpots.length; j++) {
      const d = Math.hypot(M.buildSpots[i]![0]! - M.buildSpots[j]![0]!,
        M.buildSpots[i]![1]! - M.buildSpots[j]![1]!)
      if (d < closest) { closest = d; pair = `${i + 1} and ${j + 1}` }
    }
  }
  assert.ok(closest >= floor,
    `pads ${pair} are ${closest.toFixed(1)}px apart; ${floor} is where the tap targets overlap`)
  assert.ok(closest >= 74 - 1e-6,
    `pads ${pair} are ${closest.toFixed(1)}px apart, under the 74 the geometry was authored to`)
})

test('every pad reaches a lane, and none of them stands in one', () => {
  // THE CHECK LEVEL 2 SHIPPED WITHOUT, and its absence is why level 2 soaked
  // 0 of 60: its first pad set ran to 185px from the road, so four of the five
  // towers could be built on the far pads and never fire from them.
  const shortest = Math.min(...Object.values(towers as Record<string, any>)
    .filter((t) => t && typeof t === 'object' && (t.range ?? 0) > 0)
    .map((t) => t.range as number))
  const routes = [toPoly(M.waypoints), ...M.lanes.map((l) => toPoly(l.waypoints))]
  for (const [i, [x, y]] of M.buildSpots.entries()) {
    const d = Math.min(...routes.map((r) => distToPoly(x!, y!, r)))
    assert.ok(d <= 114, `pad ${i + 1} is ${d.toFixed(1)}px from the nearest lane, over 114`)
    assert.ok(d >= 90, `pad ${i + 1} is ${d.toFixed(1)}px from the nearest lane, under 90`)
    assert.ok(d < shortest,
      `pad ${i + 1} is ${d.toFixed(1)}px out and the shortest tower reaches ${shortest}`)
  }
})

test('the hero starts on the board, clear of both lanes', () => {
  const [x, y] = M.heroStart as [number, number]
  const routes = [toPoly(M.waypoints), ...M.lanes.map((l) => toPoly(l.waypoints))]
  const d = Math.min(...routes.map((r) => distToPoly(x, y, r))) - M.roadWidth / 2
  assert.ok(d >= 90, `he stands ${d.toFixed(1)}px from the road's edge`)
  // He is about 120 world px tall and heroStart is his FEET, so his head has to
  // clear the top of the board. The value this guards against put level 2's
  // hero at y=128 with his head over the edge.
  assert.ok(y - 120 > 0, `his head is at y=${(y - 120).toFixed(0)}, off the top of the board`)
  assert.ok(y < 720 && x > 0 && x < 1280, 'he does not start on the board at all')
})

/* --------------------------------------------------------------- the waves */

test('every wave sends enemies that exist, down lanes that exist', () => {
  const net = new LaneNetwork(M as never)
  assert.equal(W.waves.length, 13)
  for (const [i, w] of W.waves.entries()) {
    assert.ok(w.name && w.name.length > 0, `wave ${i + 1} has no name`)
    assert.ok(w.spawns.length > 0, `wave ${i + 1} sends nothing`)
    for (const sp of w.spawns) {
      assert.ok(E[sp.enemy], `wave ${i + 1} names enemy "${sp.enemy}", which is not in enemies.json`)
      assert.ok(sp.count > 0, `wave ${i + 1} sends ${sp.count} of ${sp.enemy}`)
      assert.ok(sp.lane, `wave ${i + 1} does not say which gate its ${sp.enemy} come from`)
      assert.ok(net.has(sp.lane!),
        `wave ${i + 1} sends ${sp.enemy} down "${sp.lane}", which is not a lane on this map`)
    }
    if (w.boss) assert.ok(E[w.boss], `wave ${i + 1}'s boss "${w.boss}" is not in enemies.json`)
  }
})

test('the run uses both gates, and the boss arrives alone down one of them', () => {
  const lanesUsed = new Set(W.waves.flatMap((w) => w.spawns.map((s) => s.lane)))
  assert.deepEqual([...lanesUsed].sort(), ['lower', 'upper'],
    'a two-gate level that does not use both gates')

  // Some single-gate, some on both: the first two teach the gates one at a time.
  const gates = W.waves.map((w) => new Set(w.spawns.map((s) => s.lane)).size)
  assert.ok(gates.filter((n) => n === 1).length >= 3, 'no wave comes down a single gate')
  assert.ok(gates.filter((n) => n === 2).length >= 6, 'too few waves come down both gates')

  // The heavier side has to change hands, or a board can be committed to one.
  const heavier = W.waves.map((w) => {
    const side = (lane: string) => w.spawns.filter((s) => s.lane === lane)
      .reduce((n, s) => n + s.count * E[s.enemy]!.maxHealth, 0)
    return side('upper') > side('lower') ? 'U' : 'L'
  }).join('')
  assert.ok(heavier.includes('UL') && heavier.includes('LU'),
    `the heavier gate never changes hands: ${heavier}`)

  const last = W.waves[12]!
  assert.equal(last.boss, 'unicornBoss')
  assert.deepEqual(last.spawns.map((s) => s.enemy), ['unicornBoss'],
    'the boss does not arrive alone')
  assert.equal(last.spawns[0]!.lane, 'lower')
  assert.equal(last.spawns[0]!.count, 1)
})

/* ------------------------------------------------------------- and it loads */

test('level 3 loads through the registry with its own map and waves', () => {
  const lv = loadLevel('level3')
  assert.equal(lv.name, 'Sports Complex at Dusk')
  assert.equal(lv.map.buildSpots.length, 15)
  assert.equal(lv.waveTable.waves.length, 13)
  assert.equal((lv.map as any).plate, 'level3')
  assert.equal(lv.runsClearedToUnlock, 1)
})

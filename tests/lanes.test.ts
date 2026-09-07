import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  LaneNetwork, MAIN_LANE, advance, chooseContinuation, followMerges, pickAt, validateLanes,
  type Transfer, type Walker,
} from '../src/systems/Lanes.ts'
import { pickFirst, withinRadius } from '../src/systems/Targeting.ts'
import map1 from '../src/data/map.json' with { type: 'json' }
import map2 from '../src/data/map_level2.json' with { type: 'json' }

const url = (p: string) => new URL(p, import.meta.url)
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')

/**
 * A fork: two gates in, meeting before one shared run to the exit.
 *
 * Deliberately UNEQUAL branches — west is longer than east — because equal
 * ones would hide every ordering bug a merge can have.
 *
 *   west  (0,0) -> (300,0) -> (400,100)          400 + ~141 = 541.4
 *   east  (0,200) -> (400,200) -> (400,100)      400 + 100   = 500
 *   main  (400,100) -> (700,100) -> (1000,100)   the shared run, 600 long
 *
 * Both branches join main at its waypoint 0, which is the fork point.
 */
const FORK = {
  waypoints: [[400, 100], [700, 100], [1000, 100]],
  lanes: [
    { id: 'west', waypoints: [[0, 0], [300, 0], [400, 100]], merge: { into: MAIN_LANE, atIndex: 0 } },
    { id: 'east', waypoints: [[0, 200], [400, 200], [400, 100]], merge: { into: MAIN_LANE, atIndex: 0 } },
  ],
}

const WEST_LEN = 300 + Math.hypot(100, 100)
const EAST_LEN = 400 + 100
const MAIN_LEN = 600

/* ----------------------------------------------------- the single-lane shape */

test('a map with no lanes still has exactly one, and it is its waypoints', () => {
  // The compatibility claim in one assertion: levels 1 and 2 were not edited,
  // so what they resolve to has to be what they always walked.
  for (const [name, m] of [['level 1', map1], ['level 2', map2]] as const) {
    const net = new LaneNetwork(m as never)
    assert.equal(net.lanes.length, 1, `${name} resolved to more than one lane`)
    assert.equal(net.main.id, MAIN_LANE)
    assert.equal(net.main.path.points.length, (m as { waypoints: number[][] }).waypoints.length,
      `${name}'s lane is not its own waypoints`)
    assert.equal(net.transferFrom(MAIN_LANE), null, `${name} grew a merge`)
    // And its route is simply the lane, which is the number levels.json records.
    assert.equal(net.routeLength(MAIN_LANE), net.main.path.totalLength)
  }
})

test('an unnamed lane is the main lane, so old wave tables need no edits', () => {
  const net = new LaneNetwork(FORK)
  assert.equal(net.lane(undefined).id, MAIN_LANE)
  assert.equal(net.lane(null).id, MAIN_LANE)
  // And a name that is not a lane resolves rather than throwing.
  assert.equal(net.lane('nowhere').id, MAIN_LANE)
})

/* ------------------------------------------------------------ route lengths */

test('each branch reports its own total route length', () => {
  const net = new LaneNetwork(FORK)
  assert.ok(Math.abs(net.lane('west').path.totalLength - WEST_LEN) < 1e-9)
  assert.ok(Math.abs(net.lane('east').path.totalLength - EAST_LEN) < 1e-9)

  // The route is the branch PLUS what is left of main from the join — not
  // main's whole length, and not the branch alone.
  assert.ok(Math.abs(net.routeLength('west') - (WEST_LEN + MAIN_LEN)) < 1e-9,
    `west route ${net.routeLength('west')}`)
  assert.ok(Math.abs(net.routeLength('east') - (EAST_LEN + MAIN_LEN)) < 1e-9,
    `east route ${net.routeLength('east')}`)
  assert.equal(net.routeLength(MAIN_LANE), MAIN_LEN)

  // The two branches are genuinely different lengths, which is the case that
  // makes progress ordering worth testing at all.
  assert.notEqual(net.routeLength('west'), net.routeLength('east'))
})

test('a merge part way along a lane only counts the part still to walk', () => {
  // Joining main at waypoint 1 skips main's first 300px, so the route is
  // shorter by exactly that.
  const late = {
    waypoints: FORK.waypoints,
    lanes: [{ id: 'east', waypoints: FORK.lanes[1]!.waypoints, merge: { into: MAIN_LANE, atIndex: 1 } }],
  }
  const net = new LaneNetwork(late)
  assert.ok(Math.abs(net.routeLength('east') - (EAST_LEN + 300)) < 1e-9,
    `east route ${net.routeLength('east')}`)
})

/* ------------------------------------------------- the transfer at the merge */

test('a walker transfers at the merge and keeps every pixel of its progress', () => {
  const net = new LaneNetwork(FORK)
  let w: Walker = { laneId: 'east', laneDistance: 0, distance: 0 }

  // Walk to just short of the join.
  w = advance(net, w, EAST_LEN - 1)
  assert.equal(w.laneId, 'east', 'transferred before reaching the join')
  assert.ok(Math.abs(w.distance - (EAST_LEN - 1)) < 1e-9)

  const before = w.distance
  // One step over the join.
  w = advance(net, w, 2)
  assert.equal(w.laneId, MAIN_LANE, 'did not transfer on reaching the end of the branch')
  // THE PROPERTY THIS ALL EXISTS FOR: progress did not jump, backwards or
  // forwards. It took the step and nothing else.
  assert.ok(Math.abs(w.distance - (before + 2)) < 1e-9,
    `progress went ${before} -> ${w.distance} across a 2px step`)
  // And the overshoot was carried: one pixel past the join on the new lane.
  assert.ok(Math.abs(w.laneDistance - 1) < 1e-9,
    `landed at ${w.laneDistance} on main rather than 1px past the join`)
})

test('progress is monotonic across a merge, at every step size', () => {
  // The bug this guards is a merge that resets progress to the new lane's
  // distance: on the SHORTER branch that jumps forward, on the longer one it
  // jumps back, and a tower changes target mid-shot either way.
  const net = new LaneNetwork(FORK)
  for (const step of [0.5, 7, 63, 260]) {
    for (const lane of ['west', 'east']) {
      let w: Walker = { laneId: lane, laneDistance: 0, distance: 0 }
      let last = 0
      for (let i = 0; i < 400; i++) {
        w = advance(net, w, step)
        assert.ok(w.distance >= last,
          `on ${lane} at step ${step}, progress went ${last} -> ${w.distance}`)
        assert.ok(Math.abs(w.distance - (last + step)) < 1e-9,
          `on ${lane} at step ${step}, a step of ${step} moved progress by ${w.distance - last}`)
        last = w.distance
      }
    }
  }
})

test('an enemy from either branch reaches the exit, and each walks its own route', () => {
  const net = new LaneNetwork(FORK)
  const exit = net.terminal('west')
  assert.equal(exit.id, MAIN_LANE)
  assert.equal(net.terminal('east').id, MAIN_LANE)

  for (const lane of ['west', 'east']) {
    let w: Walker = { laneId: lane, laneDistance: 0, distance: 0 }
    const route = net.routeLength(lane)
    let steps = 0
    // Walk until it is off the end of the terminal lane, as the scene does.
    while (!(net.transferFrom(w.laneId) === null && w.laneDistance >= net.lane(w.laneId).path.totalLength)) {
      w = advance(net, w, 1)
      assert.ok(++steps < 5000, `${lane} never reached the exit`)
    }
    assert.equal(w.laneId, MAIN_LANE, `${lane} did not end on the lane that reaches the exit`)
    // It walked its own route length, to within the one-pixel step.
    assert.ok(Math.abs(w.distance - route) <= 1,
      `${lane} walked ${w.distance} against a route of ${route}`)
  }
})

/* ------------------------------------------------- a tower inside the fork */

test('a tower in the fork covers enemies on both branches', () => {
  // Placed between the two branches, in range of each and of neither exit.
  // This is the case a single-lane engine cannot express at all.
  const net = new LaneNetwork(FORK)
  const TOWER = { x: 200, y: 100 }
  const RANGE = 130

  const at = (laneId: string, laneDistance: number) => {
    const p = net.lane(laneId).path.pointAt(laneDistance)
    return { x: p.x, y: p.y, distance: laneDistance, alive: true, laneId }
  }

  // One on each branch, level with the tower.
  const west = at('west', 200)
  const east = at('east', 200)
  assert.ok(Math.hypot(west.x - TOWER.x, west.y - TOWER.y) <= RANGE, 'west enemy is out of range')
  assert.ok(Math.hypot(east.x - TOWER.x, east.y - TOWER.y) <= RANGE, 'east enemy is out of range')

  const seen = withinRadius([west, east], TOWER.x, TOWER.y, RANGE)
  assert.equal(seen.length, 2, 'the tower does not see both branches')
  assert.deepEqual(new Set(seen.map((s) => s.laneId)), new Set(['west', 'east']))

  // And it picks the one furthest along by PROGRESS, across lanes.
  const ahead = { ...at('east', 260), distance: 260 }
  const behind = { ...at('west', 120), distance: 120 }
  assert.equal(pickFirst([behind, ahead], TOWER.x, TOWER.y, 400)!.laneId, 'east')
})

test('a tower in the fork damages enemies on both branches, not just sees them', () => {
  // The test above proves the tower SELECTS across lanes. This one proves the
  // damage lands: a firing loop, both branches walked with the real `advance`,
  // and both enemies dead on their own branch before either reaches the merge.
  // Selection and damage are separate failures — a tower can pick a target on
  // another lane and still have nothing happen to it.
  const net = new LaneNetwork(FORK)
  const TOWER = { x: 200, y: 100 }
  const RANGE = 130
  const DAMAGE = 12

  const walker = (laneId: string) => ({
    laneId, laneDistance: 100, distance: 100, alive: true, health: 96,
    x: 0, y: 0, bornOn: laneId, diedOn: '',
  })
  const mobs = [walker('west'), walker('east')]
  const place = (m: (typeof mobs)[number]) => {
    const p = net.lane(m.laneId).path.pointAt(m.laneDistance)
    m.x = p.x
    m.y = p.y
  }
  mobs.forEach(place)

  const dealt: Record<string, number> = { west: 0, east: 0 }
  for (let frame = 0; frame < 200 && mobs.some((m) => m.alive); frame++) {
    for (const m of mobs) {
      if (!m.alive) continue
      const next = advance(net, m as Walker, 2)
      m.laneId = next.laneId
      m.laneDistance = next.laneDistance
      m.distance = next.distance
      place(m)
    }
    const target = pickFirst(mobs, TOWER.x, TOWER.y, RANGE)
    if (!target) continue
    dealt[target.bornOn] = (dealt[target.bornOn] ?? 0) + DAMAGE
    target.health -= DAMAGE
    if (target.health <= 0) {
      target.alive = false
      target.diedOn = target.laneId
    }
  }

  assert.ok(dealt.west! > 0, 'the tower never damaged the enemy on the west branch')
  assert.ok(dealt.east! > 0, 'the tower never damaged the enemy on the east branch')
  for (const m of mobs) {
    assert.equal(m.alive, false, `the ${m.bornOn} enemy survived a tower that reached it`)
    assert.equal(m.diedOn, m.bornOn,
      `the ${m.bornOn} enemy only died after merging, so this measured the shared lane`)
  }
})

/* ---------------------------------------------------------------- validation */

test('a broken lane network is reported rather than walked', () => {
  const ok = validateLanes(FORK)
  assert.deepEqual(ok, [], `the fork should be valid, got ${ok.join('; ')}`)
  assert.deepEqual(validateLanes(map1 as never), [], 'level 1 is not a valid single-lane map')
  assert.deepEqual(validateLanes(map2 as never), [], 'level 2 is not a valid single-lane map')

  const bad = (lanes: unknown) =>
    validateLanes({ waypoints: FORK.waypoints, lanes } as never).join('; ')

  assert.match(bad([{ id: 'a', waypoints: [[0, 0], [1, 1]], merge: { into: 'nope', atIndex: 0 } }]),
    /merges into "nope", which is not a lane/)
  assert.match(bad([{ id: 'a', waypoints: [[0, 0], [1, 1]], merge: { into: 'a', atIndex: 0 } }]),
    /merges into itself/)
  assert.match(bad([{ id: MAIN_LANE, waypoints: [[0, 0], [1, 1]] }]),
    /two lanes are called "main"/)
  assert.match(bad([{ id: 'a', waypoints: [[0, 0]] , merge: { into: MAIN_LANE, atIndex: 0 } }]),
    /fewer than two waypoints/)
  assert.match(bad([{ id: 'a', waypoints: [[0, 0], [1, 1]], merge: { into: MAIN_LANE, atIndex: 9 } }]),
    /at waypoint 9, which that lane does not have/)
  // A lane that reaches the exit and that nothing feeds is a forgotten merge.
  // THIS USED TO READ /both run to the exit/, and that rule went when level 5
  // arrived: a crossroads has two exits and both cost lives, so "exactly one
  // terminal" now rejects a correct map. The typo it was really catching is
  // still caught, by the property that actually distinguishes the two -- a
  // second exit on a real map is FED BY something, and a forgotten merge is
  // not.
  assert.match(bad([{ id: 'a', waypoints: [[0, 0], [1, 1]] }]),
    /reaches an exit but nothing merges into it/)
  // ...and a genuine split is accepted.
  assert.deepEqual(validateLanes({
    waypoints: FORK.waypoints,
    mainMerge: [{ into: 'left', atIndex: 0 }, { into: 'right', atIndex: 0 }],
    lanes: [
      { id: 'left', waypoints: [[0, 0], [1, 1]] },
      { id: 'right', waypoints: [[0, 0], [1, 1]] },
    ],
  } as never), [], 'a trunk splitting into two fed exits should be valid')
  assert.match(bad([{ id: 'a', waypoints: [[0, 0], [1, 1]], merge: [] }]),
    /empty merge list/)
  assert.match(bad([{ id: 'a', waypoints: [[0, 0], [1, 1]],
    merge: [{ into: MAIN_LANE, atIndex: 0 }, { into: MAIN_LANE, atIndex: 0 }] }]),
    /continues into "main" twice/)
  assert.match(bad([{ id: 'a', waypoints: [[0, 0], [1, 1]],
    merge: [{ into: MAIN_LANE, atIndex: 0, weight: 0 }] }]),
    /weight of 0; it must be above zero/)
  // A cycle would hang the walk.
  assert.match(
    validateLanes({ waypoints: FORK.waypoints, lanes: [
      { id: 'a', waypoints: [[0, 0], [1, 1]], merge: { into: 'b', atIndex: 0 } },
      { id: 'b', waypoints: [[0, 0], [1, 1]], merge: { into: 'a', atIndex: 0 } },
    ] } as never).join('; '),
    /merges in a circle/)
})

/* ------------------------------------------------------------- the wiring */

test('the enemy walks the network rather than keeping its own copy of it', () => {
  // followMerges is the one definition of what a merge does, so the tests
  // above are testing the code that ships.
  const enemy = src('entities/Enemy.ts')
  assert.match(enemy, /followMerges\(this\.lanes/,
    'Enemy no longer delegates its merge to systems/Lanes')
  // Progress and position are separate fields, and only position is rewritten.
  assert.match(enemy, /this\.distance \+= step/, 'progress is not advanced by the step')
  assert.match(enemy, /this\.laneDistance \+= step/, 'the lane position is not advanced')
  // Targeting must never see the lane-local number.
  const targeting = src('systems/Targeting.ts')
  assert.ok(!targeting.includes('laneDistance'),
    'targeting reads the lane-local distance, which a merge rewrites')
})

test('the scene spawns onto the lane the wave named', () => {
  const game = src('scenes/GameScene.ts')
  assert.match(game, /this\.lanes\.lane\(spawn\.lane\)/,
    'the scene ignores the lane a spawn group names')
  assert.match(game, /new LaneNetwork\(this\.level\.map\)/,
    'the scene does not build a lane network from the map')
})

test('followMerges carries the overshoot rather than parking on the join', () => {
  // A frame long enough to cross a whole branch must not lose the distance
  // walked past the join, or a low frame rate would hold enemies at merges.
  const net = new LaneNetwork(FORK)
  const at = followMerges(net, { laneId: 'east', laneDistance: EAST_LEN + 250 })
  assert.equal(at.laneId, MAIN_LANE)
  assert.ok(Math.abs(at.laneDistance - 250) < 1e-9, `landed at ${at.laneDistance}, not 250`)
})

/* ------------------------------------------------------------- the crossroads */

/**
 * A crossroads: two gates in, one junction, two exits out.
 *
 * The shape level 5 needs, and the shape nothing before it had — every earlier
 * multi-lane map was a fork feeding ONE exit. Deliberately UNEQUAL exits, for
 * the same reason FORK's branches are unequal: equal ones would hide a walker
 * being handed the wrong lane's end.
 *
 *   in-north (0,0)   -> (400,100)   ~412.3
 *   in-south (0,200) -> (400,100)   ~412.3
 *   main     (400,100) -> (600,100)              the junction, 200 long
 *   out-up   (600,100) -> (900,0)                ~316.2
 *   out-down (600,100) -> (1000,200)             ~412.3
 */
const CROSS = {
  waypoints: [[400, 100], [600, 100]],
  mainMerge: [
    { into: 'out-up', atIndex: 0 },
    { into: 'out-down', atIndex: 0 },
  ],
  lanes: [
    { id: 'in-north', waypoints: [[0, 0], [400, 100]], merge: { into: MAIN_LANE, atIndex: 0 } },
    { id: 'in-south', waypoints: [[0, 200], [400, 100]], merge: { into: MAIN_LANE, atIndex: 0 } },
    { id: 'out-up', waypoints: [[600, 100], [900, 0]] },
    { id: 'out-down', waypoints: [[600, 100], [1000, 200]] },
  ],
}
const IN_LEN = Math.hypot(400, 100)
const UP_LEN = Math.hypot(300, 100)
const DOWN_LEN = Math.hypot(400, 100)

test('a crossroads has two gates and two exits, and validates', () => {
  assert.deepEqual(validateLanes(CROSS as never), [])
  const net = new LaneNetwork(CROSS as never)
  // Two lanes reach an exit, which no map before level 5 was allowed.
  assert.deepEqual(net.lanes.filter((l) => l.merge === null).map((l) => l.id),
    ['out-up', 'out-down'])
  // And both are reachable from both gates.
  for (const gate of ['in-north', 'in-south']) {
    assert.deepEqual(net.terminals(gate).map((l) => l.id).sort(), ['out-down', 'out-up'],
      `${gate} cannot reach both exits`)
  }
})

test('a split sends a walker down one arm and only one', () => {
  const net = new LaneNetwork(CROSS as never)
  const walked = new Map<string, number>()
  // Ten walkers spread across the pick range, each stepped the whole way.
  for (let i = 0; i < 10; i++) {
    let w: Walker = { laneId: 'in-north', laneDistance: 0, distance: 0, routePick: i / 10 }
    const seen = new Set<string>()
    for (let steps = 0; steps < 20000; steps++) {
      const lane = net.lane(w.laneId)
      if (lane.merge === null && w.laneDistance >= lane.path.totalLength) break
      w = advance(net, w, 3)
      seen.add(w.laneId)
    }
    const end = net.lane(w.laneId)
    assert.equal(end.merge, null, `pick ${i / 10} did not finish on an exit`)
    // It never touched the OTHER arm on the way.
    const other = end.id === 'out-up' ? 'out-down' : 'out-up'
    assert.ok(!seen.has(other), `pick ${i / 10} walked both arms`)
    walked.set(end.id, (walked.get(end.id) ?? 0) + 1)
  }
  // Both arms are used. Equal weights, so neither should take all ten.
  assert.equal(walked.size, 2, `every walker took the same arm: ${[...walked.keys()]}`)
})

test('the arm is settled by the walker own number, not by the frame', () => {
  const net = new LaneNetwork(CROSS as never)
  // The same walker asked twice gets the same answer, and a long frame that
  // steps clean over the junction lands on the same arm as ten short ones.
  for (const pick of [0.05, 0.31, 0.62, 0.94]) {
    const long = followMerges(net, { laneId: MAIN_LANE, laneDistance: 200 + 90, routePick: pick })
    let w: Walker = { laneId: MAIN_LANE, laneDistance: 0, distance: 0, routePick: pick }
    for (let i = 0; i < 100; i++) w = advance(net, w, 2.9)
    assert.equal(long.laneId, w.laneId, `pick ${pick} took different arms at different frame rates`)
    assert.equal(followMerges(net, { laneId: MAIN_LANE, laneDistance: 290, routePick: pick }).laneId,
      long.laneId, `pick ${pick} is not stable`)
  }
})

test('the overshoot crosses a split as well as a merge', () => {
  const net = new LaneNetwork(CROSS as never)
  // 40 past the junction: 40 along whichever arm, not standing on the corner.
  const at = followMerges(net, { laneId: MAIN_LANE, laneDistance: 240, routePick: 0.2 })
  assert.ok(at.laneId !== MAIN_LANE, 'the walker never left the junction')
  assert.ok(Math.abs(at.laneDistance - 40) < 1e-9, `landed at ${at.laneDistance}, not 40 along`)
})

test('routeLengths reports both ways out, and routeLength takes the longer', () => {
  const net = new LaneNetwork(CROSS as never)
  const both = net.routeLengths('in-north').sort((a, b) => a - b)
  assert.equal(both.length, 2)
  assert.ok(Math.abs(both[0]! - (IN_LEN + 200 + UP_LEN)) < 1e-9, `short route ${both[0]}`)
  assert.ok(Math.abs(both[1]! - (IN_LEN + 200 + DOWN_LEN)) < 1e-9, `long route ${both[1]}`)
  assert.equal(net.routeLength('in-north'), both[1])
  // A map with no split still reports exactly one route, which is the number
  // levels 1 to 4 were tuned against.
  assert.equal(new LaneNetwork(FORK).routeLengths('west').length, 1)
})

test('the weights are shares of the traffic, not probabilities', () => {
  const opts: Transfer[] = [
    { lane: { id: 'a' } as never, distance: 0, weight: 3 },
    { lane: { id: 'b' } as never, distance: 0, weight: 1 },
  ]
  // Three quarters of the pick range lands on the first arm.
  let a = 0
  for (let i = 0; i < 1000; i++) if (chooseContinuation(opts, i / 1000).lane.id === 'a') a++
  assert.equal(a, 750)
  // Degenerate inputs land somewhere rather than throwing: an enemy stuck on a
  // junction is worse than one that all goes the same way.
  assert.equal(chooseContinuation(opts, NaN).lane.id, 'a')
  assert.equal(chooseContinuation(opts, -1).lane.id, 'a')
  assert.equal(chooseContinuation(opts, 2).lane.id, 'b')
})

test('two junctions on one route do not send everything the same way', () => {
  // The reason `pickAt` mixes the lane id in. Without it a walker that went
  // left at the first junction goes left at every junction, and two of four
  // exits get no traffic at all.
  const picks = [...Array(200)].map((_, i) => i / 200)
  const first = picks.map((p) => pickAt(p, 'main') < 0.5)
  const second = picks.map((p) => pickAt(p, 'second-junction') < 0.5)
  const agree = first.filter((v, i) => v === second[i]).length
  assert.ok(agree > 40 && agree < 160,
    `the two junctions agree ${agree} times in 200; they are correlated`)
  // ...and each junction is still an even split on its own.
  for (const [name, side] of [['first', first], ['second', second]] as const) {
    const n = side.filter(Boolean).length
    assert.ok(n > 70 && n < 130, `${name} junction sends ${n} of 200 one way`)
  }
})

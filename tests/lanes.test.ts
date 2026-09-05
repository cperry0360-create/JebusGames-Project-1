import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  LaneNetwork, MAIN_LANE, advance, followMerges, validateLanes, type Walker,
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
  // Two lanes both running to the exit is a fork that never rejoins.
  assert.match(bad([{ id: 'a', waypoints: [[0, 0], [1, 1]] }]),
    /both run to the exit/)
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

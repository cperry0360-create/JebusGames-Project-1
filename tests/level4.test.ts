import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LaneNetwork, MAIN_LANE, advance, validateLanes, type Walker } from '../src/systems/Lanes.ts'
import { AIR, GROUND, GROUND_ONLY, layerOf, pickFirst } from '../src/systems/Targeting.ts'
import { airCoverProblems } from '../src/systems/AirCover.ts'
import { isLevelCleared, isLevelUnlocked, loadLevel } from '../src/systems/Levels.ts'
import map from '../src/data/map_level4.json' with { type: 'json' }
import waves from '../src/data/waves.level4.json' with { type: 'json' }
import enemies from '../src/data/enemies.json' with { type: 'json' }
import towers from '../src/data/towers.json' with { type: 'json' }
import draft from '../src/data/draft.json' with { type: 'json' }
import levels from '../src/data/levels.json' with { type: 'json' }
import art from '../src/data/art.json' with { type: 'json' }
import { ROAD, nodeBlock, roadNodes } from '../src/systems/WorldRoad.ts'

const GEOMETRY = JSON.parse(
  readFileSync(new URL('../tools/level4_geometry.json', import.meta.url), 'utf8'))
const M = map as unknown as {
  plate: string
  roadWidth: number
  spotRadius: number
  waypoints: number[][]
  buildSpots: number[][]
  lanes: Array<{ id: string; waypoints: number[][]; merge: { into: string; atIndex: number } }>
}
const E = enemies as Record<string, {
  name: string
  maxHealth: number
  tier: string
  sprite: string
  layer?: string
  blockable: boolean
  slowable: boolean
  retreatsWhenDefeated?: boolean
  summons?: { enemy: string; count: number; interval: number; cap: number }
}>
const W = waves as unknown as {
  waves: Array<{
    name: string
    boss?: string
    spawns: Array<{ enemy: string; count: number; interval: number; delay: number; lane?: string }>
  }>
}
const LEVEL = (levels as any).levels.find((l: any) => l.id === 'level4')

const len = (p: number[][]): number => {
  let d = 0
  for (let i = 0; i < p.length - 1; i++) {
    d += Math.hypot(p[i + 1]![0]! - p[i]![0]!, p[i + 1]![1]! - p[i]![1]!)
  }
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
/** Health a wave puts on the board. */
const load = (w: (typeof W)['waves'][number]): number =>
  w.spawns.reduce((n, s) => n + s.count * E[s.enemy]!.maxHealth, 0)

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

test('a walker from either gate reaches the exit, transferring once', () => {
  // Walked rather than reasoned about: the lane engine is what a wave actually
  // runs through, and "the JSON looks right" is not the same claim.
  const net = new LaneNetwork(M as never)
  for (const id of ['upper', 'lower']) {
    let w: Walker = { laneId: id, laneDistance: 0, distance: 0 }
    const route = net.routeLength(id)
    let transfers = 0
    for (let i = 0; i < 4000; i++) {
      const before = w.laneId
      w = advance(net, w, 1)
      if (w.laneId !== before) transfers++
      if (w.distance >= route) break
    }
    assert.equal(w.laneId, MAIN_LANE, `a walker from ${id} did not end on the tail`)
    assert.equal(transfers, 1, `a walker from ${id} transferred ${transfers} times, not once`)
    assert.ok(w.distance >= route - 1.5,
      `a walker from ${id} stopped ${(route - w.distance).toFixed(1)}px short of the exit`)
  }
})

test('the two routes are the same length, so neither gate is the fast one', () => {
  // ARRANGED HERE, unlike level 3, where the trace happened to produce it. The
  // lower gateway sits at x=-60 and the upper one 3.55px further out, which is
  // what makes the two routes equal -- see map_level4.json's _lanes. The wave
  // table leans on it: groups released from both gates on the same delay
  // arrive together, so a split wave is a two-front problem and not a queue.
  const net = new LaneNetwork(M as never)
  const upper = net.routeLength('upper')
  const lower = net.routeLength('lower')
  assert.ok(Math.abs(upper - lower) < 1,
    `the routes differ by ${Math.abs(upper - lower).toFixed(2)}px; the wave table assumes they do not`)

  for (const [name, v] of [['upper', upper], ['lower', lower]] as const) {
    assert.equal(Math.round(v * 10) / 10, LEVEL.laneLengthPx,
      `${name} walks ${v.toFixed(1)} but levels.json records ${LEVEL.laneLengthPx}`)
  }
})

/* ------------------------------------------------- against the geometry file */

test('the branch lengths are the geometry file\'s, on the plate', () => {
  // map_level4.json adds one gateway point at each end so enemies walk in and
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
  assert.equal(M.plate, 'level4')
  assert.equal((art as any).map.level4, 'map-level4')
})

test('every branch ends exactly on the merge point', () => {
  // The lane engine expects a branch to END at the join. Both of level 4's
  // traced branches stopped short of it -- upper by 1.07px, lower by 5.60 --
  // and were snapped on. Left alone an enemy would step sideways on transfer.
  const [mx, my] = GEOMETRY.merge as [number, number]
  for (const l of M.lanes) {
    const last = l.waypoints[l.waypoints.length - 1]!
    assert.deepEqual(last, [mx, my], `${l.id} does not end on the merge point`)
  }
  assert.deepEqual(M.waypoints[0], [mx, my], 'the tail does not start at the merge point')
})

/* ------------------------------------------------------------------ the pads */

test('fourteen pads, the geometry file\'s, in range and apart', () => {
  assert.equal(M.buildSpots.length, 14, 'level 4 does not field fourteen pads')
  assert.deepEqual(M.buildSpots, GEOMETRY.pads,
    'the map\'s buildSpots are not the geometry file\'s pads')

  const routes = [toPoly(GEOMETRY.upper), toPoly(GEOMETRY.lower), toPoly(GEOMETRY.shared)]
  for (const [i, [x, y]] of M.buildSpots.entries()) {
    const d = Math.min(...routes.map((r) => distToPoly(x!, y!, r)))
    assert.ok(d >= 90 && d <= 114,
      `pad ${i + 1} is ${d.toFixed(1)}px from the nearest lane, outside 90-114`)
  }

  // Two pads need 2 x spotRadius between centres before their tap targets
  // overlap. 34 needs 68; the geometry was authored to 74, and the closest
  // pair here clears it by a tenth of a pixel, which is the tightest of the
  // four levels.
  assert.equal(M.spotRadius, 34)
  let closest = Infinity
  for (let i = 0; i < M.buildSpots.length; i++) {
    for (let j = i + 1; j < M.buildSpots.length; j++) {
      const a = M.buildSpots[i]!, b = M.buildSpots[j]!
      closest = Math.min(closest, Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!))
    }
  }
  assert.ok(closest >= 2 * M.spotRadius,
    `the closest pads are ${closest.toFixed(1)}px apart, inside 2 x spotRadius`)
  assert.ok(closest >= 74, `the closest pads are ${closest.toFixed(1)}px apart, under the authored 74`)
})

test('the shared tail is barely covered, and that is the level', () => {
  // The property the whole level is built on, held here so it cannot be
  // "fixed" by someone adding pads to the snow. East of the merge is snow,
  // rock and ice pond; three of the fourteen pads reach the trunk at all, and
  // between them they cover 45% of it. A player who lets a wave through the
  // fork has almost no second chance at it.
  const range = GEOMETRY.towerRange as number
  const trunk = toPoly(GEOMETRY.shared)
  const reaching = M.buildSpots.filter(([x, y]) => distToPoly(x!, y!, trunk) <= range)
  assert.equal(reaching.length, 3, `${reaching.length} pads reach the shared tail, not three`)

  let total = 0, covered = 0
  for (let i = 1; i < trunk.length; i++) {
    const [ax, ay] = trunk[i - 1]!, [bx, by] = trunk[i]!
    const L = Math.hypot(bx - ax, by - ay)
    const N = 40
    for (let s = 0; s < N; s++) {
      const t = (s + 0.5) / N
      const qx = ax + (bx - ax) * t, qy = ay + (by - ay) * t
      total += L / N
      if (M.buildSpots.some(([x, y]) => Math.hypot(x! - qx, y! - qy) <= range)) covered += L / N
    }
  }
  const share = covered / total
  assert.ok(share > 0.4 && share < 0.5,
    `the trunk is ${(share * 100).toFixed(1)}% covered; the level is tuned around 45%`)
})

/* ---------------------------------------------------------------- the waves */

test('thirteen waves, every one naming enemies and lanes that exist', () => {
  assert.equal(W.waves.length, 13)
  const laneIds = new Set(['upper', 'lower'])
  for (const [i, w] of W.waves.entries()) {
    assert.ok(w.name.length > 0, `wave ${i + 1} has no name`)
    assert.ok(w.spawns.length > 0, `wave ${i + 1} sends nothing`)
    for (const s of w.spawns) {
      assert.ok(E[s.enemy], `wave ${i + 1} names enemy "${s.enemy}", which is not in enemies.json`)
      assert.ok(s.lane && laneIds.has(s.lane),
        `wave ${i + 1}'s ${s.enemy} group names lane "${s.lane}"`)
      assert.ok(s.count > 0 && s.interval > 0 && s.delay >= 0,
        `wave ${i + 1}'s ${s.enemy} group has a count, interval or delay that makes no sense`)
    }
    if (w.boss) assert.ok(E[w.boss], `wave ${i + 1}'s boss "${w.boss}" is not in enemies.json`)
  }
  // Both gates are used, and each is taught on its own first.
  assert.deepEqual([...new Set(W.waves[0]!.spawns.map((s) => s.lane))], ['upper'])
  assert.deepEqual([...new Set(W.waves[1]!.spawns.map((s) => s.lane))], ['lower'])
  const lanesUsed = new Set(W.waves.flatMap((w) => w.spawns.map((s) => s.lane)))
  assert.deepEqual([...lanesUsed].sort(), ['lower', 'upper'])
})

test('the heavier gate alternates, so no board can commit to one side', () => {
  const heavier = W.waves.map((w) => {
    const per: Record<string, number> = { upper: 0, lower: 0 }
    for (const s of w.spawns) per[s.lane!] = (per[s.lane!] ?? 0) + s.count * E[s.enemy]!.maxHealth
    return per.upper! > per.lower! ? 'upper' : per.lower! > per.upper! ? 'lower' : 'even'
  })
  // Not a pattern to match exactly -- that would only re-state the file. What
  // matters is that neither side is the standing answer, and that the two-gate
  // waves genuinely swap.
  const up = heavier.filter((h) => h === 'upper').length
  const low = heavier.filter((h) => h === 'lower').length
  assert.ok(low >= 4, `only ${low} waves lean on the lower gate`)
  assert.ok(up >= 4, `only ${up} waves lean on the upper gate`)
  assert.ok(heavier.includes('even'), 'no wave is evenly split, which is the worst case for a lopsided board')
})

/* ----------------------------------------------------- the boss, fought twice */

test('the Lich King retreats at wave 7 and comes back bigger at wave 13', () => {
  assert.equal(W.waves[6]!.boss, 'glitchLich', 'wave 7 is not the Lich King\'s wave')
  assert.equal(W.waves[12]!.boss, 'glitchLichReturn', 'wave 13 is not the Lich King\'s return')
  const first = E.glitchLich!, back = E.glitchLichReturn!

  // The retreat itself: beaten at wave 7 he leaves rather than dies.
  assert.equal(first.retreatsWhenDefeated, true, 'the wave 7 boss dies rather than withdrawing')
  assert.ok(!back.retreatsWhenDefeated, 'the wave 13 boss walks away from his own finale')

  // And the return is the SAME fight, harder -- 50% more health and a faster
  // summon. Written out in enemies.json rather than derived, so this is what
  // stops the pair drifting apart.
  assert.equal(back.maxHealth, first.maxHealth * 1.5,
    `the return has ${back.maxHealth} health against ${first.maxHealth}, not half again`)
  assert.ok(back.summons!.interval < first.summons!.interval,
    'the return does not summon any faster than the first fight')
  assert.equal(back.summons!.enemy, first.summons!.enemy)
  assert.equal(back.summons!.count, first.summons!.count)
  assert.equal(back.summons!.cap, first.summons!.cap)
  assert.equal(back.sprite, first.sprite, 'the two forms are drawn as different characters')
  assert.equal(back.name, first.name, 'the two forms are named as different characters')

  // Both are bosses proper: unheld, unslowed, and they do not fight the line.
  for (const [id, b] of [['glitchLich', first], ['glitchLichReturn', back]] as const) {
    assert.equal(b.tier, 'boss', `${id} is not a boss`)
    assert.equal(b.blockable, false, `${id} can be pinned by two soldiers`)
    assert.equal(b.slowable, false, `${id} can be slowed, which turns his summon clock off`)
  }

  // The scene half: Enemy.die() has to branch on the flag, or the data says
  // "retreat" and the player watches a death animation.
  const enemy = readFileSync(new URL('../src/entities/Enemy.ts', import.meta.url), 'utf8')
  assert.match(enemy, /if \(this\.def\.retreatsWhenDefeated\)/,
    'Enemy.die() does not check retreatsWhenDefeated')
  assert.match(enemy, /private retreat\(\): void/, 'there is no retreat to play')
})

test('waves 8 to 12 climb past the Lich King\'s first appearance', () => {
  // Otherwise the level peaks in its middle and spends five waves deflating.
  const totals = W.waves.map((w) => load(w))
  for (let i = 8; i <= 11; i++) {
    assert.ok(totals[i]! > totals[i - 1]!,
      `wave ${i + 1} (${totals[i]}) is lighter than wave ${i} (${totals[i - 1]})`)
  }
  assert.ok(totals[11]! > totals[6]!,
    `wave 12 is ${totals[11]} against wave 7's ${totals[6]}; the back half does not get past him`)
})

/* ------------------------------------------------------------------ the air */

test('the flyby comes early and harmless, and the real bug comes late', () => {
  const waveOf = (id: string) =>
    W.waves.flatMap((w, i) => (w.spawns.some((s) => s.enemy === id) ? [i + 1] : []))
  const beta = waveOf('glitchBugBeta')
  const real = waveOf('glitchBug')

  assert.deepEqual(beta, [4], 'the harmless flyby is not a single early wave')
  assert.equal(W.waves[3]!.spawns.find((s) => s.enemy === 'glitchBugBeta')!.count, 1,
    'the teaching flyby is more than one bug')
  assert.ok(real[0]! >= 9, `the real Glitch Bug arrives at wave ${real[0]}, before it has been taught`)
  assert.ok(real.length >= 3, 'the Glitch Bug turns up once and is never a threat')
  assert.ok(beta[0]! < real[0]!, 'the lesson comes after the exam')

  // The beta is the same picture and a fraction of the danger. That is the
  // whole trick: a player learns the silhouette on something survivable.
  assert.equal(E.glitchBugBeta!.sprite, E.glitchBug!.sprite)
  assert.ok(E.glitchBugBeta!.maxHealth < E.glitchBug!.maxHealth / 4)
  assert.equal(layerOf(E.glitchBugBeta!), AIR)
  assert.equal(layerOf(E.glitchBug!), AIR)
  // And neither is held by a line of lads standing on the ground.
  assert.equal(E.glitchBug!.blockable, false)
  assert.equal(E.glitchBugBeta!.blockable, false)
})

test('level 4 cannot be caught without air cover, on any draw', () => {
  // THE CHECK THE BRIEF ASKS FOR, and it is not "does the pool contain an
  // anti-air tower" -- towers are drafted, so that would be a probability
  // rather than a property. AirCover asks the guaranteed question: by the wave
  // an air enemy first arrives, is it still POSSIBLE to be holding an
  // all-ground hand? With six towers in the shared pool, one of them ground
  // only, and two in hand from wave 1, it is not.
  const problems = airCoverProblems({
    levelId: 'level4',
    waves: W as never,
    enemies: enemies as never,
    towers: towers as never,
    draft: draft as never,
  })
  assert.deepEqual(problems, [])
})

test('an air enemy is untouchable by a tower that only shoots the ground', () => {
  // The other half of the same rule, at the level the towers actually work at.
  // A ground-only tower with the bug sitting on top of it picks nothing.
  const bug = { x: 100, y: 100, distance: 500, alive: true, layer: AIR }
  const walker = { x: 100, y: 100, distance: 400, alive: true, layer: GROUND }

  assert.equal(pickFirst([bug], 100, 100, 200, GROUND_ONLY), null,
    'a ground-only tower shot something in the air')
  assert.equal(pickFirst([bug, walker], 100, 100, 200, GROUND_ONLY), walker,
    'a ground-only tower took the air target over the one it can hit')
  assert.equal(pickFirst([bug, walker], 100, 100, 200, [GROUND, AIR]), bug,
    'an air-capable tower did not take the target furthest along')

  // And the Shelter is the ground-only one, so the rule has a real subject.
  const groundOnly = Object.entries(towers as Record<string, { targets?: string[] }>)
    .filter(([, t]) => t.targets && !t.targets.includes(AIR)).map(([id]) => id)
  assert.deepEqual(groundOnly, ['shelter', 'imaDummy'],
    'the set of ground-only towers changed; the air-cover arithmetic depends on it')
})

/* ----------------------------------------------------------- the level entry */

test('no node\'s name lands on another node, anywhere on the road', () => {
  // THE NUMBERS MISSED THIS ONCE AND A PICTURE FOUND IT. The check this
  // replaces compared CARD rectangles and level 4's position cleared every
  // one of them; what actually collided was the block of TEXT under level 3 --
  // "SPORTS COMPLEX AT DUSK" over "Clear 2 runs to unlock" -- landing squarely
  // on level 4's card. It was invisible to the test because the test had
  // re-derived the scene's layout from constants copied out of it, and one
  // copy had drifted.
  //
  // So this measures the REAL geometry, through the module the scene draws
  // from, and it measures the node WITH the room reserved under it for its
  // name. It also covers every slot on the road rather than the four that are
  // built, because a slot that is empty today gets a level tomorrow.
  const nodes = roadNodes()
  assert.ok(nodes.length >= (levels as any).levels.length,
    'the road has fewer slots than there are levels')

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodeBlock(nodes[i]!), b = nodeBlock(nodes[j]!)
      const hit = a.x < b.x + b.width && b.x < a.x + a.width
        && a.y < b.y + b.height && b.y < a.y + a.height
      assert.ok(!hit,
        `slots ${nodes[i]!.number} and ${nodes[j]!.number} overlap once their names are counted`)
    }
  }

  // And the whole road stays inside the band it is allowed, top and bottom.
  // The road runs off the sides on purpose -- it is three screens long and
  // scrolls -- so only the vertical bound is a fault.
  for (const n of nodes) {
    const b = nodeBlock(n)
    assert.ok(b.y >= ROAD.band.top,
      `slot ${n.number} rides up over the title (${b.y} < ${ROAD.band.top})`)
    assert.ok(b.y + b.height <= ROAD.band.bottom,
      `slot ${n.number}'s name runs into the scrollbar (${b.y + b.height} > ${ROAD.band.bottom})`)
  }

  // Left to right, in level order, with no two at the same height: that is
  // what makes the road readable as a progression rather than a scatter.
  for (let i = 1; i < nodes.length; i++) {
    assert.ok(nodes[i]!.x > nodes[i - 1]!.x,
      `slot ${nodes[i]!.number} is not further along the road than slot ${nodes[i - 1]!.number}`)
    assert.notEqual(nodes[i]!.y, nodes[i - 1]!.y,
      `slots ${nodes[i - 1]!.number} and ${nodes[i]!.number} sit at the same height; the road reads flat there`)
  }
})

test('level 4 is registered, and locked until level 3 has been cleared', () => {
  const level = loadLevel('level4')
  assert.equal(level.map.plate, 'level4')
  assert.equal(level.waveTable.waves.length, 13)
  assert.equal(LEVEL.name, 'The Conundrum')

  // THE BRIEF ASKED FOR runsClearedToUnlock 1 AND for this property, and under
  // a run COUNT the two could not both hold -- levels.json carried a note
  // explaining that the value had been raised to 3 to stop level 4 opening
  // after one clear of level 1. There is no count any more and no
  // disagreement: level 4 names level 3, which is what the brief was asking
  // for both times.
  assert.equal(LEVEL.unlockedBy, 'level3')
  assert.equal(isLevelUnlocked('level4', ['level1', 'level2']), false,
    'level 4 is open before level 3 is cleared')
  assert.equal(isLevelUnlocked('level4', ['level3']), true, 'level 4 never opens')
  assert.equal(isLevelCleared('level3', ['level1', 'level2']), false)
  assert.equal(isLevelCleared('level3', ['level3']), true,
    'clearing level 3 does not open level 4, which is what unlocking it means')
})

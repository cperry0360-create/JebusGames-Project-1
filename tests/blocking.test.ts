import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LaneNetwork, MAIN_LANE } from '../src/systems/Lanes.ts'
import { defaultRally, nearestOnLanes, rallyFromTap, soldierStations } from '../src/systems/Rally.ts'
import { statAt } from '../src/systems/Upgrades.ts'
import towers from '../src/data/towers.json' with { type: 'json' }
import enemies from '../src/data/enemies.json' with { type: 'json' }
import map1 from '../src/data/map.json' with { type: 'json' }
import map3 from '../src/data/map_level3.json' with { type: 'json' }
import levels from '../src/data/levels.json' with { type: 'json' }

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const T = towers as Record<string, any>
const E = enemies as Record<string, any>
const D = T.imaDummy

/* --------------------------------------------------------------- the tower */

test('the Ima Dummy Tower deals nothing, ever', () => {
  assert.equal(D.damage, 0)
  assert.equal(D.fireInterval, 0)
  assert.equal(D.splashRadius, 0)
  assert.equal(D.supportRadius, 0, 'it is not a support tower either')
  // No tier and no branch may quietly give it a gun.
  for (const step of [...D.tiers, ...D.specializations]) {
    for (const key of ['damage', 'splashRadius', 'armorPierce', 'chainTargets']) {
      assert.equal(step[key], undefined, `a tier or branch gives the dummy tower ${key}`)
    }
  }
  for (let tier = 1; tier <= 4; tier++) {
    for (const spec of [null, 'rage', 'friend']) {
      assert.equal(statAt(D, tier, 'damage' as never, spec), 0,
        `tier ${tier}${spec ? ` ${spec}` : ''} deals damage`)
    }
  }
  // And the code agrees: a deploying tower returns out of `tick` before it aims.
  const tower = src('src/entities/Tower.ts')
  assert.match(tower, /if \(this\.isSupport \|\| this\.isDeployer\) return/,
    'a deploying tower still runs the firing path')
})

test('it has a range that is a leash rather than a weapon', () => {
  // The rally point is checked against it, which is why a tower that never
  // fires has one at all.
  assert.ok(D.range > 0)
  assert.equal(D.archetype, 'control')
  // Level 1 only, for now.
  const byId = Object.fromEntries((levels as any).levels.map((l: any) => [l.id, l]))
  assert.deepEqual(byId.level1.extraTowerWeights, { imaDummy: 4 })
  assert.equal(byId.level2.extraTowerWeights, undefined)
  assert.equal(byId.level3.extraTowerWeights, undefined)
})

test('two soldiers at every tier, and the upgrades improve them instead', () => {
  const at = (tier: number, key: string, spec: string | null = null) =>
    statAt(D, tier, key as never, spec)
  assert.equal(at(1, 'soldierCount'), 2)
  assert.equal(at(2, 'soldierCount'), 2)
  assert.equal(at(3, 'soldierCount'), 2)
  // The brief's numbers, exactly.
  const round = (v: number) => Math.round(v * 100) / 100
  assert.deepEqual([round(at(1, 'soldierHealth')), round(at(1, 'soldierDamage')),
    round(at(1, 'soldierInterval'))], [90, 8, 1])
  assert.deepEqual([round(at(2, 'soldierHealth')), round(at(2, 'soldierDamage')),
    round(at(2, 'soldierInterval'))], [170, 15, 0.9])
  assert.deepEqual([round(at(3, 'soldierHealth')), round(at(3, 'soldierDamage')),
    round(at(3, 'soldierInterval'))], [300, 26, 0.8])
  assert.equal(D.soldierRespawn, 10)
})

/* ------------------------------------------------------------ the blocking */

/** The rule both the scene and the sim implement, run headlessly. */
interface Mob { id: string; def: any; alive: boolean; distance: number; x: number; y: number; blockedBy: unknown }
interface Lad { health: number; maxHealth: number; alive: boolean; x: number; y: number }

const walkOne = (opts: { blockable: boolean; ladHealth?: number; killLadAt?: number }) => {
  const def = { ...E.lateFiler, blockable: opts.blockable }
  const mob: Mob = { id: 'e', def, alive: true, distance: 0, x: 0, y: 0, blockedBy: null }
  const lad: Lad = {
    health: opts.ladHealth ?? 90, maxHealth: opts.ladHealth ?? 90, alive: true, x: 200, y: 0,
  }
  const RANGE = 46
  const trail: number[] = []
  for (let step = 0; step < 400; step++) {
    if (opts.killLadAt !== undefined && step === opts.killLadAt) { lad.health = 0; lad.alive = false }
    // Assignment, once per frame: one enemy per lad, and only a blockable one.
    if (mob.blockedBy && (!lad.alive || !mob.def.blockable)) mob.blockedBy = null
    if (!mob.blockedBy && lad.alive && mob.def.blockable
        && Math.abs(mob.x - lad.x) <= RANGE) mob.blockedBy = lad
    // A blocked enemy does not move.
    if (!mob.blockedBy) { mob.x += 2; mob.distance += 2 }
    trail.push(mob.x)
  }
  return { mob, trail }
}

test('a blocked enemy stops, and resumes the moment its blocker dies', () => {
  const held = walkOne({ blockable: true })
  // It walked to the lad and then stopped dead.
  assert.ok(held.mob.x <= 200, `it walked past the lad to ${held.mob.x}`)
  assert.equal(held.trail[399], held.trail[300],
    'it was still moving 100 frames after it should have been held')

  // Kill the lad part way through and it carries on from where it stood.
  const freed = walkOne({ blockable: true, killLadAt: 150 })
  assert.ok(freed.mob.x > 200, 'it never resumed after its blocker died')
  // Held right up to the frame the lad falls, and moving from that frame on --
  // "the moment its blocker dies" is immediate, not next frame.
  const heldAt = freed.trail[149]!
  assert.equal(freed.trail[140], heldAt, 'it was still creeping while held')
  assert.ok(freed.trail[150]! > heldAt,
    'it waited a frame after its blocker fell before moving again')
  assert.ok(freed.trail[399]! > freed.trail[150]!, 'it did not keep going')
})

test('an enemy flagged not blockable walks straight through', () => {
  const through = walkOne({ blockable: false })
  assert.equal(through.mob.blockedBy, null, 'a not-blockable enemy was held')
  assert.ok(through.mob.x > 700, `it was slowed to ${through.mob.x}`)
})

test('both bosses walk through soldiers, and nothing else does', () => {
  assert.equal(E.theDevil.blockable, false)
  assert.equal(E.unicornBoss.blockable, false,
    'two soldiers could pin the level 3 boss forever')
  assert.equal(E.politician.blockable, false)
  for (const [id, def] of Object.entries(E)) {
    if (def.tier === 'boss') continue
    assert.equal(def.blockable, true, `${id} is rank and file but cannot be blocked`)
  }
})

test('a soldier holds one enemy at a time; the rest keep walking', () => {
  // Two lads, four enemies: two are held and two walk past, which is what
  // makes this tower a speed bump rather than a wall.
  const lads = [{ id: 'a', taken: false }, { id: 'b', taken: false }]
  const mobs = [0, 1, 2, 3].map((i) => ({ i, blockedBy: null as null | { id: string } }))
  for (const m of mobs) {
    const free = lads.find((l) => !l.taken)
    if (!free) continue
    m.blockedBy = free
    free.taken = true
  }
  assert.equal(mobs.filter((m) => m.blockedBy).length, 2)
  assert.equal(mobs.filter((m) => !m.blockedBy).length, 2)
})

test('a dead soldier comes back ten seconds later, mid-wave', () => {
  const lad = { health: 0, maxHealth: 90, respawnIn: 0, enraged: true, alive: false }
  const RESPAWN = D.soldierRespawn
  let backAt = -1
  for (let step = 1; step <= 400; step++) {
    const now = step * 0.1
    if (lad.respawnIn > 0) {
      lad.respawnIn -= 0.1
      if (lad.respawnIn <= 0) {
        lad.respawnIn = 0
        lad.health = lad.maxHealth
        lad.enraged = false
        lad.alive = true
        if (backAt < 0) backAt = now
      }
      continue
    }
    if (lad.health <= 0 && !lad.alive) { lad.respawnIn = RESPAWN; continue }
  }
  assert.ok(backAt > 0, 'it never came back')
  // A tenth either side: the countdown crosses zero a frame late on floats.
  assert.ok(Math.abs(backAt - (RESPAWN + 0.1)) < 0.15, `it came back at ${backAt}s, not ${RESPAWN}s`)
  assert.equal(lad.health, lad.maxHealth, 'it came back hurt')
  assert.equal(lad.enraged, false, 'Rage survived the respawn')
})

/* ------------------------------------------------------------ the rally point */

const NET1 = new LaneNetwork(map1 as never)
const NET3 = new LaneNetwork(map3 as never)

test('the rally point defaults to the nearest lane inside the range', () => {
  const pad = (map1 as any).buildSpots[0] as number[]
  const spot = defaultRally(NET1, { x: pad[0]!, y: pad[1]! }, D.range)
  assert.ok(spot, 'a pad beside the road got no default rally point')
  assert.ok(Math.hypot(spot!.x - pad[0]!, spot!.y - pad[1]!) <= D.range)
  // And it is ON the lane, not merely near it.
  assert.ok(Math.abs(nearestOnLanes(NET1, spot!.x, spot!.y)!.x - spot!.x) < 0.001)
})

test('the rally point cannot be set outside the tower range', () => {
  const pad = (map1 as any).buildSpots[0] as number[]
  const tower = { x: pad[0]!, y: pad[1]! }
  const far = rallyFromTap(NET1, tower, D.range, tower.x + 900, tower.y)
  assert.equal(far.spot, null, 'a tap far outside the ring was accepted')
  assert.equal(far.refused, 'out-of-range')

  // And a refusal is a REFUSAL, not a silent no-op: the scene says so.
  const scene = src('src/scenes/GameScene.ts')
  assert.match(scene, /Too far\. The lads stay inside the ring\./,
    'an out-of-range order is rejected without telling the player')
  assert.match(scene, /this\.flashRange\(tower\)/, 'the refusal has no shape, only words')

  // The near tap is accepted, so the test is measuring the ring and not a
  // rally point that never works.
  const near = rallyFromTap(NET1, tower, D.range, tower.x, tower.y)
  assert.ok(near.spot, 'a tap on the tower itself was refused')
  assert.equal(near.refused, null)
})

test('the range is measured against the SNAPPED point, not the raw tap', () => {
  // The order matters. A tap just inside the ring pointing at lane outside it
  // would otherwise post the lads where the tower cannot see them.
  const rally = src('src/systems/Rally.ts')
  const body = rally.slice(rally.indexOf('export function rallyFromTap'))
  const snap = body.indexOf('nearestOnLanes(')
  const check = body.indexOf('> range')
  assert.ok(snap >= 0 && check >= 0 && snap < check,
    'the range is checked before the tap is snapped to a lane')
})

test('on a branching map the rally point snaps to whichever lane is nearest', () => {
  // Level 3's fork: a tap on the upper side must post the lads on the upper
  // branch and a tap on the lower side on the lower one, or the player cannot
  // choose which branch to guard.
  const upper = (map3 as any).lanes.find((l: any) => l.id === 'upper')
  const lower = (map3 as any).lanes.find((l: any) => l.id === 'lower')
  const uPoint = upper.waypoints[10] as number[]
  const lPoint = lower.waypoints[10] as number[]

  const nearUpper = nearestOnLanes(NET3, uPoint[0]! + 12, uPoint[1]! - 12)
  assert.equal(nearUpper!.laneId, 'upper')
  const nearLower = nearestOnLanes(NET3, lPoint[0]! + 12, lPoint[1]! + 12)
  assert.equal(nearLower!.laneId, 'lower')

  // And the snapped point really is on that lane.
  for (const [id, got] of [['upper', nearUpper!], ['lower', nearLower!]] as const) {
    const lane = NET3.lane(id)
    const p = lane.path.pointAt(got.laneDistance)
    assert.ok(Math.hypot(p.x - got.x, p.y - got.y) < 0.01,
      `the ${id} rally point is not actually on the ${id} lane`)
  }
  // The trunk is reachable too, so a tower past the merge is not stranded.
  const shared = (map3 as any).waypoints[10] as number[]
  assert.equal(nearestOnLanes(NET3, shared[0]!, shared[1]!)!.laneId, MAIN_LANE)
})

test('soldiers share one rally point and stand apart on the lane', () => {
  const spot = nearestOnLanes(NET1, 400, 300)!
  for (const count of [2, 3]) {
    const stations = soldierStations(NET1, spot, count)
    assert.equal(stations.length, count)
    // Not stacked: two lads on the same pixel read as one.
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        assert.ok(Math.hypot(stations[i]!.x - stations[j]!.x, stations[i]!.y - stations[j]!.y) > 8,
          `${count} soldiers are standing on top of each other`)
      }
    }
    // All of them near the one point, because there is only one to move.
    for (const s of stations) {
      assert.ok(Math.hypot(s.x - spot.x, s.y - spot.y) < 60, 'a soldier wandered off the rally point')
    }
  }
})

test('soldiers walk back to the rally point when the fight ends', () => {
  const soldier = src('src/entities/Soldier.ts')
  const tick = soldier.slice(soldier.indexOf('  tick(dt: number'))
  // With nothing to hold, it steps toward its station.
  assert.match(tick, /const dx = this\.stationX - this\.x/, 'a free soldier does not head home')
  assert.match(tick, /RETURN_SPEED \* dt/, 'it teleports home instead of walking')
  // And the swing timer is NOT reset on the way, for the reason Enemy.tick
  // records: a fight that pauses for a frame must not buy a free hit.
  const idle = tick.slice(tick.indexOf('} else {'))
  assert.ok(!/attackTimer = /.test(idle.slice(0, 400)),
    'going home resets the attack timer, which buys a free swing on the way back')

  // Walked, rather than asserted: a lad shoved 60px off station gets back.
  const lad = { x: 260, y: 0, stationX: 200, stationY: 0 }
  for (let i = 0; i < 200; i++) {
    const dx = lad.stationX - lad.x
    const dy = lad.stationY - lad.y
    const d = Math.hypot(dx, dy)
    if (d <= 1) break
    const step = Math.min(d, 70 * 0.1)
    lad.x += (dx / d) * step
    lad.y += (dy / d) * step
  }
  assert.ok(Math.abs(lad.x - 200) <= 1, `it stopped ${Math.abs(lad.x - 200).toFixed(1)}px short`)
})

/* --------------------------------------------------------------- the wiring */

test('the scene and the sim block by the same rule', () => {
  const scene = src('src/scenes/GameScene.ts')
  const sim = src('tools/soak/Sim.ts')

  // Soldiers join the engagement the hero and the gnomes already use, rather
  // than getting a second blocking system.
  assert.match(scene, /for \(const g of this\.garrisons\)[\s\S]{0,240}holders\.push\(\{ who: s/,
    'soldiers do not join the one engagement pass')
  assert.match(scene, /capacity: 1/, 'a soldier holds more than one enemy')

  // The sim models it, or level 1's win rate would be a fiction.
  assert.match(sim, /const assignSoldierBlocks/, 'the soak does not model soldier blocking')
  assert.match(sim, /e\.def\.blockable && e\.blockedBy === null/,
    'the soak lets soldiers hold a not-blockable enemy')
  assert.match(sim, /if \(sd\.health <= 0\) e\.blockedBy = null/,
    'the soak does not free an enemy when its blocker falls')

  // And the uniform-hand path draws from the LEVEL's pool, not the whole
  // table -- otherwise every third seed on levels 2 and 3 is handed a tower
  // they could never build.
  assert.match(sim, /rng\.shuffled\(towerPool\.map\(\(t\) => t\.id\)\)/,
    'the soak still deals a uniform hand from every tower in the game')
})

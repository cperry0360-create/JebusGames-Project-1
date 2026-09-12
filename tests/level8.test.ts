// LEVEL 8, THE OPTIMIZATION: the receipts for a level that is built and parked.
//
// It is finished — map, roster, waves, rules, art, simulator — and it has no row
// in levels.json, because level 8 is unlocked by level 7 and level 7 has no row
// either. `isLevelUnlocked` refuses an unknown prerequisite rather than treating
// it as satisfied, and tests/levels.test.ts walks every chain back to level 1, so
// a row today would be a permanently locked node AND a red build.
//
// THE FIRST TEST IN THIS FILE IS THE ONE THE BRIEF ASKED FOR: it fails if level 8
// is ever shipped unreachable. It passes while the level is parked, it passes once
// level 7 exists and level 8 points at it, and it fails in the state in between —
// a row whose prerequisite chain does not reach level 1.
//
// The rest pin what the level IS, so a later pass cannot quietly move it: two
// exits that both cost lives, one spawn, nineteen pads straight out of the
// geometry file, a gate measured off the plate that buffs once and never twice,
// an aura that does not stack, an explosion that hurts both sides, and a boss
// with two summon phases and a cap.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  LaneNetwork, followMerges, pickForTerminal, validateLanes,
} from '../src/systems/Lanes.ts'
import { crossedGate, gateRules, reviewable } from '../src/systems/PerformanceGate.ts'
import { armorAuraRules, auraArmorAt } from '../src/systems/EnemyAura.ts'
import map from '../src/data/map_level8.json' with { type: 'json' }
import waves from '../src/data/waves.level8.json' with { type: 'json' }
import rules8 from '../src/data/level8.json' with { type: 'json' }
import levels from '../src/data/levels.json' with { type: 'json' }
import enemies from '../src/data/enemies.json' with { type: 'json' }
import art from '../src/data/art.json' with { type: 'json' }
import cakes from '../src/data/cakes.json' with { type: 'json' }

const url = (p: string) => new URL(p, import.meta.url)
const GEOMETRY = JSON.parse(readFileSync(url('../tools/level8_geometry.json'), 'utf8'))
const M = map as unknown as {
  plate: string; roadWidth: number; spotRadius: number; mainId: string
  waypoints: [number, number][]
  mainMerge: { into: string; atIndex: number; weight?: number }[]
  lanes: { id: string; waypoints: [number, number][]; merge?: unknown }[]
  buildSpots: [number, number][]
}
const R = rules8 as never as {
  roster: Record<string, string>
  performanceReview: {
    line: [number, number][]
    crossings: { lane: string; distance: number; at: [number, number] }[]
    sizeMultiplier: number; speedMultiplier: number; scanMs: number; markerHeight: number
  }
  armorAura: { radius: number; armorBonus: number }
  deathBlast: { radius: number; damage: number; hitsPlayerUnits: boolean }
}
const E = enemies as never as Record<string, any>
const W = (waves as never as { waves: any[] }).waves
const LEVELS = (levels as never as { levels: any[] }).levels
const net = new LaneNetwork(map as never)

/* ----------------------------------------------------------- reachability */

test('level 8 is not shipped unreachable', () => {
  // THE TEST THE BRIEF ASKED FOR, and the only shape of it that is honest
  // today: a conditional, because "unreachable" is a property of a level that
  // HAS a row. Green while the level is parked, green once level 7 exists and
  // level 8 points at it, red in the state in between.
  const row = LEVELS.find((l) => l.id === 'level8')
  if (!row) {
    // Parked. The things that make it parked rather than half-built are
    // asserted instead, so this branch cannot become a place a broken level
    // hides: the data is all there and the prerequisite genuinely is not.
    assert.ok(!LEVELS.some((l) => l.id === 'level7'),
      'level 7 IS registered, so level 8 has something to unlock from: give it its row')
    assert.ok(M.buildSpots.length > 0 && W.length > 0 && E.ceo,
      'level 8 is parked and also incomplete; that is not parked, that is unfinished')
    return
  }
  // Shipped. Then its chain has to reach the first level, which is exactly
  // what tests/levels.test.ts walks for every level -- asserted here as well
  // because this is the file somebody reads when they add the row.
  const byId = new Map(LEVELS.map((l) => [l.id, l]))
  const seen = new Set<string>()
  let at: string | null = 'level8'
  while (at !== null && !seen.has(at)) {
    seen.add(at)
    at = byId.get(at)?.unlockedBy ?? null
  }
  assert.ok(seen.has(LEVELS[0]!.id),
    `level 8 has a row but cannot be reached from ${LEVELS[0]!.id}: ${[...seen].join(' <- ')}`)
  assert.equal(row.unlockedBy, 'level7', 'level 8 is unlocked by level 7 and by nothing else')
})

test('the parked level is registered in Levels.ts so nothing but the row is missing', () => {
  // The map, the wave table and the rules block are all imported by
  // systems/Levels.ts. If they were not, adding the row would throw on the
  // first frame -- `loadLevel` raises for a level whose map it does not hold --
  // and the failure would land on whoever added one line to a JSON file.
  const src = readFileSync(url('../src/systems/Levels.ts'), 'utf8')
  assert.match(src, /level8: mapLevel8/, 'map_level8.json is not in the MAPS table')
  assert.match(src, /'waves\.level8\.json': wavesLevel8/, 'the wave table is not registered')
  assert.match(src, /'level8\.json': rulesLevel8/, 'the rules block is not registered')
})

/* -------------------------------------------------------------------- map */

test('one spawn, two exits, and both of them cost lives', () => {
  assert.deepEqual(validateLanes(map as never), [], 'the lane network does not validate')
  const terminals = net.lanes.filter((l) => net.continuations(l.id).length === 0)
  assert.deepEqual(terminals.map((l) => l.id).sort(), ['east', 'south'],
    'level 8 is one entrance and two exits')
  // ONE SPAWN. Every group in the table comes in on the trunk, which is the
  // only lane anything is spawned on -- the two arms are fed by the split.
  const spawnLanes = new Set(W.flatMap((w) => w.spawns.map((s: any) => s.lane ?? 'main')))
  assert.deepEqual([...spawnLanes], ['shared'], 'something spawns on an arm rather than the trunk')
  // AND NOTHING ABOUT LEAKING IS PER-EXIT. `GameScene.leak` charges the
  // enemy's own livesCost wherever it got out, so "both exits cost lives" is a
  // property of there being no code that asks which exit it was. Read as text
  // because the scene needs Phaser to construct.
  const scene = readFileSync(url('../src/scenes/GameScene.ts'), 'utf8')
  const leak = scene.slice(scene.indexOf('private leak(enemy: Enemy)'))
  assert.match(leak.slice(0, 600), /this\.status\.lives -= enemy\.def\.livesCost/)
  assert.doesNotMatch(leak.slice(0, 600), /laneId|east|south/,
    'the leak path asks which exit it was; both exits are meant to cost the same')
})

test('the map is the geometry file, not a copy of it', () => {
  assert.equal(M.roadWidth, GEOMETRY.roadWidth)
  assert.equal(M.spotRadius, GEOMETRY.padFootprintRadius)
  assert.equal(M.plate, 'level8')
  assert.deepEqual(M.buildSpots, GEOMETRY.buildSpots)
  assert.equal(M.buildSpots.length, 19, 'nineteen pads, the largest board in the game')
  // Every pad is at least `2 x spotRadius` from every other, or two tap
  // targets overlap. tools/check_level8.py measures this off the plate; this
  // measures it off the shipped map.
  for (let i = 0; i < M.buildSpots.length; i++) {
    for (let j = i + 1; j < M.buildSpots.length; j++) {
      const a = M.buildSpots[i]!
      const b = M.buildSpots[j]!
      const d = Math.hypot(a[0] - b[0], a[1] - b[1])
      assert.ok(d >= 2 * M.spotRadius,
        `pads ${i} and ${j} are ${d.toFixed(1)} px apart, under ${2 * M.spotRadius}`)
    }
  }
  // THE TRACED GEOMETRY IS THE ROAD AND THE MAP ADDS EXACTLY THREE POINTS: one
  // gateway at the spawn and one at each exit. Anything else in the difference
  // would be a coordinate somebody typed.
  assert.equal(M.waypoints.length, GEOMETRY.shared.length + 1)
  assert.deepEqual(M.waypoints.slice(1), GEOMETRY.shared)
  const east = M.lanes.find((l) => l.id === 'east')!
  const south = M.lanes.find((l) => l.id === 'south')!
  assert.equal(east.waypoints.length, GEOMETRY.branches.east.length + 1)
  assert.equal(south.waypoints.length, GEOMETRY.branches.south.length + 1)
  assert.deepEqual(east.waypoints.slice(0, -1), GEOMETRY.branches.east)
  assert.deepEqual(south.waypoints.slice(0, -1), GEOMETRY.branches.south)
  // The three gateways are off the plate, which is what makes an enemy walk on
  // and off rather than appear and vanish.
  assert.ok(M.waypoints[0]![0] < 0, 'the spawn gateway is on the plate')
  assert.ok(east.waypoints[east.waypoints.length - 1]![0] > 1280, 'the east gateway is on the plate')
  assert.ok(south.waypoints[south.waypoints.length - 1]![1] > 720, 'the south gateway is on the plate')
  // BOTH ARMS JOIN AT THE FORK, which is what `atIndex: 0` means.
  for (const m of M.mainMerge) assert.equal(m.atIndex, 0)
  assert.deepEqual(east.waypoints[0], M.waypoints[M.waypoints.length - 1])
  assert.deepEqual(south.waypoints[0], M.waypoints[M.waypoints.length - 1])
})

test('the two routes are the lengths the level is designed around', () => {
  // The figures the wave table and the report are written against, measured
  // through the shipped network rather than quoted. `laneLengthPx` on the row
  // will have to equal the longer of the two; there is no row yet, so this is
  // where the number lives until there is.
  const routes = net.routeLengths('shared').sort((a, b) => a - b)
  assert.equal(routes.length, 2, 'the trunk does not reach two exits')
  assert.ok(Math.abs(routes[0]! - 1778.9) < 1, `the east route walks ${routes[0]!.toFixed(1)}`)
  assert.ok(Math.abs(routes[1]! - 3646.5) < 1, `the south route walks ${routes[1]!.toFixed(1)}`)
  // THE SOUTH ARM IS THE LONG ONE AND THE EAST ARM IS THE UNDER-DEFENDED ONE.
  // Both halves matter to the waves, so both are pinned.
  assert.ok(GEOMETRY.coverage.east < 0.4, 'the east arm is no longer the cheap exit')
  assert.ok(GEOMETRY.coverage.south > 0.7, 'the south arm is no longer the covered one')
})

/* --------------------------------------------------------------- routing */

test('a wave group can name its exit, and every name in the table resolves', () => {
  for (const w of W) {
    for (const s of w.spawns) {
      if (s.exit === undefined) continue
      const pick = pickForTerminal(net, s.lane ?? 'main', s.exit)
      assert.notEqual(pick, null, `wave "${w.name}" routes to "${s.exit}", which no pick reaches`)
      // AND IT ACTUALLY ARRIVES. The pick is run through the same
      // `followMerges` the scene and the soak move walkers with, from the end
      // of the trunk, and has to land on the named arm.
      const at = followMerges(net, {
        laneId: s.lane ?? 'main',
        laneDistance: net.lane(s.lane ?? 'main').path.totalLength,
        routePick: pick!,
      })
      assert.equal(at.laneId, s.exit, `wave "${w.name}" aims at ${s.exit} and arrives at ${at.laneId}`)
    }
  }
})

test('both exits carry weight, and which one is heavier changes', () => {
  // The brief asks for both exits to be used and for the heavier group to
  // change sides rather than the two being treated as one road twice.
  const per = (exit: string) => W.map((w) => w.spawns
    .filter((s: any) => s.exit === exit)
    .reduce((a: number, s: any) => a + s.count, 0))
  const east = per('east')
  const south = per('south')
  assert.ok(east.reduce((a, b) => a + b, 0) > 40, 'the east exit is barely used')
  assert.ok(south.reduce((a, b) => a + b, 0) > 40, 'the south exit is barely used')
  const heavier = W.map((_, i) => (east[i]! === south[i]! ? '=' : east[i]! > south[i]! ? 'e' : 's'))
  assert.ok(heavier.includes('e') && heavier.includes('s'),
    'the same exit carries the heavier group in every wave')
  // Every wave uses at least one arm, and no wave leaves both empty.
  for (let i = 0; i < W.length; i++) {
    assert.ok(east[i]! + south[i]! > 0, `wave ${i + 1} routes nothing anywhere`)
  }
})

/* ------------------------------------------------------------------ gate */

test('the gate is where the plate says it is', () => {
  const g = gateRules(rules8 as never)
  assert.ok(g, 'level 8 has no Performance Review')
  assert.equal(g!.crossings.length, 1, 'the number of crossings changed; re-run tools/find_level8_gate.py')
  const c = g!.crossings[0]!
  assert.equal(c.lane, 'south', 'the scan line is painted across the south arm')
  // The crossing is ON the shipped lane, at the distance it claims: walk the
  // south branch's polyline and check the point.
  const way = M.lanes.find((l) => l.id === 'south')!.waypoints
  let run = 0
  let at: [number, number] | null = null
  for (let i = 1; i < way.length; i++) {
    const seg = Math.hypot(way[i]![0] - way[i - 1]![0], way[i]![1] - way[i - 1]![1])
    if (run + seg >= c.distance) {
      const t = (c.distance - run) / seg
      at = [way[i - 1]![0] + (way[i]![0] - way[i - 1]![0]) * t,
        way[i - 1]![1] + (way[i]![1] - way[i - 1]![1]) * t]
      break
    }
    run += seg
  }
  assert.ok(at, 'the gate distance is past the end of the lane it names')
  assert.ok(Math.hypot(at![0] - c.at[0], at![1] - c.at[1]) < 1.5,
    `the gate's world point ${c.at} is not on the lane at ${c.distance}`)
  // AND IT IS ON THE PAINTED LINE, which is the measurement the tool made:
  // the point has to sit between the line's two ends.
  const [p, q] = R.performanceReview.line as [[number, number], [number, number]]
  const dx = q[0] - p[0]
  const dy = q[1] - p[1]
  const t = ((c.at[0] - p[0]) * dx + (c.at[1] - p[1]) * dy) / (dx * dx + dy * dy)
  assert.ok(t > 0 && t < 1, 'the crossing is not between the painted line\'s ends')
  const off = Math.hypot(c.at[0] - (p[0] + dx * t), c.at[1] - (p[1] + dy * t))
  assert.ok(off < 2, `the crossing sits ${off.toFixed(1)} px off the painted line`)
})

test('an enemy is buffed once by the gate and never twice', () => {
  const g = gateRules(rules8 as never)!
  const c = g.crossings[0]!
  // A step that spans the gate fires; the same step again does not, because
  // the enemy is latched -- which is `Enemy.reviewed`, tested here through the
  // pure predicate and below through the scene's own use of it.
  assert.ok(crossedGate(g, c.lane, c.distance - 10, c.distance + 10), 'a step over the line missed it')
  assert.equal(crossedGate(g, c.lane, c.distance, c.distance + 40), null,
    'standing exactly on the line re-fires it')
  assert.equal(crossedGate(g, c.lane, c.distance + 1, c.distance + 500), null,
    'a step entirely past the line fires it')
  assert.equal(crossedGate(g, c.lane, c.distance + 40, c.distance - 40), null,
    'walking backwards over the line fires it')
  assert.equal(crossedGate(g, 'east', 0, 5000), null, 'the east arm has a gate on it')
  assert.equal(crossedGate(g, 'shared', 0, 5000), null, 'the trunk has a gate on it')
  // THE ROAD CROSSING TWICE IS THE CASE THE LATCH EXISTS FOR, and it is tested
  // on a two-crossing gate rather than on this plate's one: the predicate
  // reports both crossings, and the caller's latch is what makes only the
  // first count.
  const twice = { ...g, crossings: [c, { ...c, distance: c.distance + 400 }] }
  assert.ok(crossedGate(twice, c.lane, c.distance - 5, c.distance + 5))
  assert.ok(crossedGate(twice, c.lane, c.distance + 395, c.distance + 405),
    'a second crossing is not reported at all; the latch would have nothing to refuse')
  // And the latch itself, in the scene: `review` returns false when it has
  // already fired, and the effect is played only when it returns true.
  const enemy = readFileSync(url('../src/entities/Enemy.ts'), 'utf8')
  assert.match(enemy, /review\(sizeMultiplier: number, speedMultiplier: number\): boolean \{\s*\n\s*if \(this\.reviewed\) return false/,
    'Enemy.review does not refuse a second review')
  const scene = readFileSync(url('../src/scenes/GameScene.ts'), 'utf8')
  assert.match(scene, /if \(!hit \|\| !e\.review\(g\.sizeMultiplier, g\.speedMultiplier\)\) return/,
    'the scene plays the scan before asking whether the review took')
})

test('the gate buffs size and speed, and bosses are immune', () => {
  const g = gateRules(rules8 as never)!
  assert.equal(g.sizeMultiplier, 1.1)
  assert.equal(g.speedMultiplier, 1.2)
  for (const id of ['intern', 'hr', 'consultant', 'manager', 'officeDrone']) {
    assert.ok(reviewable(E[id]), `${id} should be reviewable`)
  }
  assert.equal(reviewable(E.ceo), false, 'the CEO is buffed by the gate')
  for (const [id, e] of Object.entries(E)) {
    if (typeof e !== 'object' || e === null || !('tier' in e)) continue
    if (e.tier === 'boss' || e.role === 'boss') {
      assert.equal(reviewable(e as any), false, `${id} is a boss and is reviewable`)
    }
  }
  // A reviewed Intern is the fastest thing on any board, which is a fact worth
  // pinning because it is the reason the buff is worth having.
  assert.equal(E.intern.speed * g.speedMultiplier, 174)
  assert.ok(E.intern.speed * g.speedMultiplier > E.babyFrank.speed,
    'a reviewed Intern is no longer the fastest thing in the game')
})

test('the gate is scoped to level 8 and cannot reach another level', () => {
  assert.equal(gateRules(null), null, 'a level with no rules block has a gate')
  assert.equal(gateRules({} as never), null, 'an empty rules block has a gate')
  assert.equal(gateRules({ performanceReview: { crossings: [] } } as never), null,
    'a gate with no crossings is accepted; it would silently never fire')
  // Level 5 and level 6 have rules blocks of their own and neither may grow one.
  const five = JSON.parse(readFileSync(url('../src/data/level5.json'), 'utf8'))
  const six = JSON.parse(readFileSync(url('../src/data/level6.json'), 'utf8'))
  assert.equal(gateRules(five), null, 'level 5 has a Performance Review')
  assert.equal(gateRules(six), null, 'level 6 has a Performance Review')
  assert.equal(armorAuraRules(five), null, 'level 5 has an armour aura')
  assert.equal(armorAuraRules(six), null, 'level 6 has an armour aura')
})

/* ------------------------------------------------------------------ aura */

test('HR gives armour to what is near it, and two of her do not stack', () => {
  const a = armorAuraRules(rules8 as never)
  assert.ok(a, 'level 8 has no armour aura')
  assert.equal(a!.radius, 110)
  assert.equal(a!.armorBonus, 4)
  assert.ok(a!.radius < 112, 'the aura reaches further than the shortest tower range')
  const hr = { x: 100, y: 100, alive: true }
  assert.equal(auraArmorAt({ x: 100, y: 100 }, [hr], a!), 4, 'nothing on top of HR is buffed')
  assert.equal(auraArmorAt({ x: 100 + a!.radius, y: 100 }, [hr], a!), 4, 'the rim is not covered')
  assert.equal(auraArmorAt({ x: 100 + a!.radius + 1, y: 100 }, [hr], a!), 0, 'past the rim is covered')
  assert.equal(auraArmorAt({ x: 100, y: 100 }, [{ ...hr, alive: false }], a!), 0,
    'a dead HR is still projecting')
  // NOT A SUM. Four HR standing together give +4, not +16.
  const four = [hr, { x: 104, y: 100, alive: true }, { x: 108, y: 100, alive: true },
    { x: 112, y: 100, alive: true }]
  assert.equal(auraArmorAt({ x: 100, y: 100 }, four, a!), 4, 'the aura stacks')
  // AND IT LANDS IN THE ONE PLACE ARMOUR IS TURNED INTO DAMAGE TAKEN.
  const enemy = readFileSync(url('../src/entities/Enemy.ts'), 'utf8')
  assert.match(enemy, /get effectiveArmor\(\): number \{\s*\n\s*return Math\.max\(0, this\.def\.armor \+ this\.auraArmor - this\.armorShred\)/,
    'the aura does not go through effectiveArmor')
  // The source is not its own beneficiary: HR's own armour is on its row.
  const scene = readFileSync(url('../src/scenes/GameScene.ts'), 'utf8')
  const tick = scene.slice(scene.indexOf('private tickArmorAura()'))
  assert.match(tick.slice(0, 800), /e\.def\.armorAura === true\s*\n?\s*\?\s*0/,
    'an HR buffs itself')
})

/* ------------------------------------------------------------------ blast */

test('the Consultant explodes on death and it hurts both sides', () => {
  assert.equal(E.consultant.deathBlast, true)
  assert.equal(R.deathBlast.hitsPlayerUnits, true, 'the explosion has stopped hurting the player')
  assert.ok(R.deathBlast.radius > 0 && R.deathBlast.damage > 0)
  // It must not reach a tower: every pad on this map stands at least 90 px off
  // the lane, which is the standoff the geometry pass placed them at.
  assert.ok(R.deathBlast.radius < 90,
    'the blast can reach a pad; that is a different mechanic from the one described')
  // Both sides, in the scene: enemies through `damageEnemy`, and the hero, the
  // gnomes and the lads through their own `hurt`.
  const scene = readFileSync(url('../src/scenes/GameScene.ts'), 'utf8')
  const body = scene.slice(scene.indexOf('private deathBlastAt(enemy: Enemy)'))
  const blast = body.slice(0, body.indexOf('\n  }\n') + 5)
  assert.match(blast, /this\.damageEnemy\(other, b\.damage, false\)/, 'it does not damage enemies')
  assert.match(blast, /this\.damageHero\(b\.damage\)/, 'it does not damage the hero')
  assert.match(blast, /for \(const f of this\.fighters\)/, 'it does not damage the gnomes')
  assert.match(blast, /for \(const sol of g\.soldiers\)/, 'it does not damage the lads')
  assert.match(blast, /if \(other === enemy \|\| !other\.alive\) continue/,
    'the corpse is not excluded from its own blast')
  // A blast of 30 is half an Intern and a third of a lad, which is the
  // statement level8.json makes about it.
  assert.ok(R.deathBlast.damage < E.intern.maxHealth, 'one blast clears the whole intern wave')
})

/* -------------------------------------------------------------------- CEO */

test('the CEO summons at 70% and at 40%, with a cap', () => {
  const t = E.ceo.onHealthThreshold
  assert.ok(Array.isArray(t), 'the CEO has one threshold; the brief asks for two')
  assert.equal(t.length, 2)
  assert.deepEqual(t.map((x: any) => x.belowHealth), [0.7, 0.4])
  for (const phase of t) {
    assert.equal(phase.summon.enemy, 'officeDrone')
    assert.equal(phase.summon.count, 4)
    assert.ok(phase.summon.cap! > 0 && phase.summon.cap! < 8,
      'the cap is absent or so high that two phases of four are never capped')
  }
  // LATCHED PER ENTRY. A single latch would spend the whole mechanic on the
  // first crossing; a latch per crossing would let a healed boss summon
  // forever. Read off the scene, which is where the latch lives.
  const scene = readFileSync(url('../src/scenes/GameScene.ts'), 'utf8')
  assert.match(scene, /if \(enemy\.firedThresholds\.has\(i\)\) continue/,
    'the thresholds are not latched per entry')
  assert.match(scene, /enemy\.firedThresholds\.add\(i\)/)
  assert.match(scene, /alive = this\.enemies\.filter\(\(e\) => e\.alive && e\.summonedBy === enemy\)\.length/,
    'the cap does not count what is alive')
  // Batula's single-object form is untouched, which is the compatibility the
  // widened field is for.
  assert.equal(Array.isArray(E.batula.onHealthThreshold), false,
    'Batula was rewritten as a list; the single form is meant to keep working')
  assert.equal(E.batula.onHealthThreshold.belowHealth, 0.5)
})

test('the Office Drone is a ground unit that pays nothing', () => {
  assert.equal(E.officeDrone.peanutReward, 0, 'summoning the drones is an economy faucet')
  assert.equal(E.officeDrone.glides, true, 'the drone does not hover')
  assert.equal(E.officeDrone.layer, undefined,
    'the drone is on a layer; it is a GROUND unit and every tower must be able to hit it')
  // No air-tower check anywhere near it: the brief is explicit about this.
  const towers = JSON.parse(readFileSync(url('../src/data/towers.json'), 'utf8'))
  for (const t of Object.values(towers) as any[]) {
    if (t && typeof t === 'object') assert.notEqual(t.groundOnly, true)
  }
})

/* ---------------------------------------------------------------- roster */

test('the level 8 roster is six office robots, all facing right', () => {
  const roster = R.roster
  assert.deepEqual(Object.values(roster).sort(),
    ['ceo', 'consultant', 'hr', 'intern', 'manager', 'officeDrone'])
  for (const id of Object.values(roster)) {
    assert.ok(E[id], `level8.json's roster names ${id}, which is not an enemy`)
    // ALL SIX FACE RIGHT, checked rather than trusted: a wrong `artFacing`
    // walked level 3's boss backwards through an entire map.
    assert.equal(E[id].artFacing, 'right', `${id} does not face right`)
    assert.ok(E[id].name && E[id].flavor, `${id} has no name or no flavor`)
    assert.ok(art.files[E[id].sprite], `${id}'s sprite is not in the manifest`)
  }
  // The rank and file are holdable and the boss is not.
  for (const id of ['intern', 'hr', 'consultant', 'manager', 'officeDrone']) {
    assert.equal(E[id].blockable, true, `${id} should be holdable`)
    assert.equal(E[id].slowable, true, `${id} should be slowable`)
  }
  assert.equal(E.ceo.blockable, false, 'the CEO is held by the line')
  assert.equal(E.ceo.slowable, false, 'the CEO is slowable; the brief says he is immune')
  assert.equal(E.ceo.damage, 0, 'the CEO swings')
})

test('the roster obeys the survival floor, which is why two intervals moved', () => {
  // armor.test.ts asserts the floor globally. THIS records what it cost level
  // 8, because the brief asked for intervals that break it: the Consultant at
  // 1.1s and Middle Management at 1.6s are 13.6 and 15.0 damage a second, and
  // three of either kills Cory inside ten seconds.
  const heroes = JSON.parse(readFileSync(url('../src/data/heroes.json'), 'utf8'))
  const cory = heroes.cory
  const ceiling = cory.maxHealth / (10 * cory.blockCapacity)
  for (const id of ['intern', 'hr', 'consultant', 'manager', 'officeDrone']) {
    const dps = E[id].damage / E[id].attackInterval
    assert.ok(dps <= ceiling + 1e-9,
      `${id} deals ${dps.toFixed(2)} dps against a ${ceiling.toFixed(2)} ceiling`)
  }
  assert.equal(E.consultant.attackInterval, 1.25, 'the Consultant is back on the brief\'s 1.1')
  assert.equal(E.manager.attackInterval, 2.0, 'Middle Management is back on the brief\'s 1.6')
  // And the damage numbers ARE the brief's, which is the half that was kept.
  assert.equal(E.consultant.damage, 15)
  assert.equal(E.manager.damage, 24)
})

/* -------------------------------------------------------------- the waves */

test('fourteen waves, one boss, and it arrives last', () => {
  assert.equal(W.length, 14, 'the brief asks for fourteen waves')
  assert.equal(W[0]!.spawns.length, 1, 'wave 1 should teach one thing')
  assert.equal(W[13]!.boss, 'ceo', 'the CEO is the finale')
  for (let i = 0; i < 13; i++) {
    assert.ok(!W[i]!.boss, `wave ${i + 1} has a boss; the brief asks for no mid-level appearance`)
  }
  const ceoSpawns = W.flatMap((w) => w.spawns.filter((s: any) => s.enemy === 'ceo'))
  assert.equal(ceoSpawns.length, 1, 'the CEO arrives more than once')
  assert.equal(ceoSpawns[0]!.exit, 'south', 'the CEO is routed down the short arm')
  // The four types arrive in the order the brief asks for: Interns early,
  // Middle Management in the middle, HR and the Consultant between.
  const first = (id: string) => W.findIndex((w) => w.spawns.some((s: any) => s.enemy === id))
  assert.equal(first('intern'), 0, 'the Interns are not the early pressure')
  assert.ok(first('hr') > 0 && first('hr') < 6, 'HR arrives too late or too early')
  assert.ok(first('consultant') > first('hr'), 'the Consultant arrives before HR')
  assert.ok(first('manager') > first('consultant'), 'Middle Management is not the mid-level wall')
  assert.ok(first('manager') < 8, 'the wall arrives too late to be a mid-level one')
})

/* -------------------------------------------------------------- the cakes */

test('level 8 pays cakes through the shared table and adds no table of its own', () => {
  // "Thresholds in JSON" is already true and is already shared: cakes.json
  // grades a run against the lives it started with, for every story level. A
  // per-level table would be the thing to avoid, so this asserts there is not
  // one rather than adding one.
  const c = cakes as never as { max: number; tiers: { cakes: number; livesFraction: number }[] }
  assert.equal(c.max, 3)
  assert.equal(c.tiers.length, 3)
  const text = readFileSync(url('../src/data/level8.json'), 'utf8')
  assert.doesNotMatch(text, /cake/i, 'level 8 has grown its own cake table')
  const src = readFileSync(url('../src/systems/Cakes.ts'), 'utf8')
  assert.doesNotMatch(src, /level[0-9]/, 'the cake rules know about a particular level')
})

/* ---------------------------------------------------------------- the art */

test('the level 8 art is measured, sized and in the manifest', () => {
  const r = (k: string) => (art.render as never as Record<string, any>)[k]
  // The scan sheet is declared as a grid so `registerEffectAnims` can cut it,
  // and the marker is deliberately NOT a sheet.
  assert.deepEqual(r('fx-performance-scan').sheet, { frameWidth: 272, frameHeight: 610, frames: 8 })
  assert.equal(r('fx-performance-buff').sheet, undefined,
    'the buff marker is a sheet; it hangs over an enemy for its whole life and must not animate')
  assert.equal(r('fx-performance-buff').anchorY, 1.0, 'the marker is not anchored at its base')
  // Both are level art, so they arrive with a level and are freed with it --
  // which is what makes `forgetEffectAnims` able to drop the scan animation.
  const shared: string[] = (art as never as { levelArt: { shared: string[] } }).levelArt.shared
  assert.ok(shared.includes('fx-performance-scan') && shared.includes('fx-performance-buff'),
    'the new effects are not level art')
  // THE BOSS IS BIGGER THAN THE BOARD AND THE RANK AND FILE ARE NOT. The
  // global rule is content.test.ts's; this pins level 8's own numbers.
  assert.equal(r('enemy-ceo').displayHeight, 150)
  for (const id of ['intern', 'hr', 'consultant', 'manager', 'officeDrone']) {
    assert.ok(r(E[id].sprite).displayHeight < 87.1,
      `${id} is taller than the shortest tower in the game`)
  }
  assert.equal(r('enemy-manager').displayHeight, 85,
    'Middle Management is back on the brief\'s 92, which content.test.ts refuses')
})

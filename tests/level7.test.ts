// LEVEL 7, THE HIGHWAY: the receipts for the three-lane level.
//
// THE FACT THIS FILE EXISTS TO PROTECT IS THE BOARD. Twenty of level 7's 22 pads
// reach TWO highways at once -- the medians are 111 px of scrub between roads
// whose centrelines are 183 px apart, and tower range is 112 -- so a tower here
// does roughly double the work of one on any earlier level. Both boss health
// numbers were soaked against that and against nothing else, and a later pass
// that moves a pad or a lane without re-soaking has changed what those numbers
// mean. The geometry checks below are what say so out loud.
//
// The rest pin what the level IS: three lanes that never touch, each with its
// own entrance and its own exit and all three costing lives; a mini boss that
// cannot be held, slowed or stunned and that cuts what stands in the road; and a
// boss that does not die but unloads four named cars at the place it fell,
// holding the wave open until they are resolved.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LaneNetwork, validateLanes } from '../src/systems/Lanes.ts'
import { bladeDamage, bladesFrom } from '../src/systems/Blades.ts'
import { isLevelUnlocked } from '../src/systems/Levels.ts'
import map from '../src/data/map_level7.json' with { type: 'json' }
import waves from '../src/data/waves.level7.json' with { type: 'json' }
import rules7 from '../src/data/level7.json' with { type: 'json' }
import levels from '../src/data/levels.json' with { type: 'json' }
import enemies from '../src/data/enemies.json' with { type: 'json' }
import art from '../src/data/art.json' with { type: 'json' }

const url = (p: string) => new URL(p, import.meta.url)
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')
const GEOMETRY = JSON.parse(readFileSync(url('../tools/level7_geometry.json'), 'utf8'))
const M = map as unknown as {
  plate: string; roadWidth: number; spotRadius: number; mainId: string
  waypoints: [number, number][]
  lanes: { id: string; waypoints: [number, number][]; entrance?: boolean; merge?: unknown }[]
  buildSpots: [number, number][]
}
const W = (waves as { waves: Array<{ name: string; boss?: string
  spawns: Array<{ enemy: string; count: number; interval: number; delay: number; lane?: string
    exit?: string }> }> }).waves
const E = enemies as unknown as Record<string, any>
const R = rules7 as unknown as { blades: { radius: number; damagePerSecond: number }
  roster: Record<string, string> }
const LEVELS = (levels as unknown as { levels: Array<{ id: string; unlockedBy: string | null
  waves: string; rules?: string; laneLengthPx: number }> }).levels

/* ------------------------------------------------------------- registration */

test('level 7 is registered, and level 8 is reachable behind it', () => {
  // THE WHOLE POINT OF THIS PASS, stated as an assertion. Level 8 was built,
  // checked and soaked, and sat unreachable because it is unlocked by level 7
  // and level 7 had no row -- see the note tests/level8.test.ts was written
  // around. Registering level 7 is what opens it, so the two facts are checked
  // together: a future pass that removes level 7's row has to see that it takes
  // level 8 with it.
  const seven = LEVELS.find((l) => l.id === 'level7')
  const eight = LEVELS.find((l) => l.id === 'level8')
  assert.ok(seven, 'level 7 has no row in levels.json')
  assert.ok(eight, 'level 8 has no row in levels.json')
  assert.equal(seven!.unlockedBy, 'level6', 'level 7 is unlocked by level 6 and by nothing else')
  assert.equal(eight!.unlockedBy, 'level7', 'level 8 is unlocked by level 7 and by nothing else')

  // AND THE CHAIN ACTUALLY RESOLVES, which is a different question from the
  // field being right: `isLevelUnlocked` refuses an unknown prerequisite, so a
  // row pointing at a typo is a permanently locked node rather than an error.
  assert.equal(isLevelUnlocked('level7', ['level1', 'level2', 'level3', 'level4',
    'level5', 'level6']), true, 'clearing level 6 does not open level 7')
  assert.equal(isLevelUnlocked('level8', ['level1', 'level2', 'level3', 'level4',
    'level5', 'level6', 'level7']), true, 'clearing level 7 does not open level 8')
  assert.equal(isLevelUnlocked('level8', ['level1', 'level2', 'level3', 'level4',
    'level5', 'level6']), false, 'level 8 opens without level 7')

  // The data is wired, not only the row.
  const s = src('systems/Levels.ts')
  assert.match(s, /level7: mapLevel7/, 'map_level7.json is not in the MAPS table')
  assert.match(s, /'waves\.level7\.json': wavesLevel7/, 'the wave table is not registered')
  assert.match(s, /'level7\.json': rulesLevel7/, 'the rules block is not registered')
  assert.equal(seven!.waves, 'waves.level7.json')
  assert.equal(seven!.rules, 'level7.json')
  assert.equal((art as any).worldMap.cards.level7, 'card-level7',
    'level 7 has no world-map card, so its node would draw empty')
})

/* ----------------------------------------------------------------- geometry */

test('the map is the geometry file, coordinate for coordinate', () => {
  // GENERATED, NOT HAND-EDITED. tools/build_level7_map.py writes this file from
  // tools/level7_geometry.json, and the only thing it adds is the six off-plate
  // gateways. Anything else differing means somebody typed a coordinate.
  assert.equal(M.plate, 'level7')
  assert.equal(M.roadWidth, GEOMETRY.roadWidth)
  assert.equal(M.spotRadius, GEOMETRY.padFootprintRadius)
  assert.equal(M.mainId, GEOMETRY.lanesAre[0])

  const byId: Record<string, [number, number][]> = { [M.mainId]: M.waypoints }
  for (const l of M.lanes) byId[l.id] = l.waypoints
  assert.deepEqual(Object.keys(byId).sort(), [...GEOMETRY.lanesAre].sort())

  for (const name of GEOMETRY.lanesAre as string[]) {
    const traced = GEOMETRY.lanes[name] as [number, number][]
    const shipped = byId[name]!
    // One gateway, the traced points, one gateway.
    assert.equal(shipped.length, traced.length + 2, `${name} has grown a waypoint`)
    assert.deepEqual(shipped.slice(1, -1).map((p) => [p[0], p[1]]), traced,
      `${name}'s traced points are not the geometry file's`)
    assert.equal(shipped[0]![0], -60, `${name} does not start off the west edge`)
    assert.equal(shipped[shipped.length - 1]![0], 1340, `${name} does not run off the east edge`)
    // Dead straight and dead level, which is what makes the gateway a y lookup
    // rather than a heading. If a retrace ever bends one, this fails here
    // rather than by putting a spawn point sideways.
    const ys = new Set(shipped.map((p) => p[1]))
    assert.equal(ys.size, 1, `${name} is no longer level; rebuild the gateways with a heading`)
  }

  assert.deepEqual(M.buildSpots.map((p) => [p[0], p[1]]),
    (GEOMETRY.pads as [number, number][]).map((p) => [p[0], p[1]]),
    'the pads are not the traced pads')
  assert.equal(M.buildSpots.length, 22, 'the board is not 22 pads any more; re-soak both bosses')
})

test('twenty of the twenty-two pads reach two highways at once', () => {
  // THE NUMBER BOTH BOSSES WERE SOAKED AGAINST. Re-derived here off the shipped
  // map rather than read out of the geometry file, so the two have to agree.
  const range = GEOMETRY.towerRange as number
  const lanes = new LaneNetwork(M as any)
  const distance = (id: string, x: number, y: number) => lanes.lane(id).path.distanceTo(x, y)
  const covers = M.buildSpots.map(([x, y]) =>
    (GEOMETRY.lanesAre as string[]).filter((n) => distance(n, x, y) <= range).length)
  assert.equal(covers.filter((n) => n >= 2).length, 20,
    'the number of pads covering two highways moved; both boss numbers are measured against it')
  assert.equal(covers.filter((n) => n === 0).length, 0, 'a pad reaches no road at all')
  assert.equal(GEOMETRY.padsCoveringTwoLanes, 20, 'the geometry file disagrees with the map')

  // And the reason it is possible at all, stated as arithmetic rather than as
  // a coincidence: the medians are narrower than twice the tower range.
  for (const [a, b] of [['north', 'middle'], ['middle', 'south']] as const) {
    const gap = GEOMETRY.gaps[`${a}-${b}`].centrelineToCentreline as number
    assert.ok(gap < range * 2,
      `${a} to ${b} is ${gap} px apart, which is more than two ranges; no pad can cover both`)
  }
  // ...and the one that is NOT possible, which is what keeps two of the pads
  // single. North to south is 367 px and no tower reaches across it.
  assert.ok(GEOMETRY.gaps['north-south'].centrelineToCentreline > range * 2)
})

test('the three lanes never touch, and all three are entrances and exits', () => {
  assert.deepEqual(validateLanes(M as any), [], 'the lane network is not valid')
  const lanes = new LaneNetwork(M as any)
  assert.equal(lanes.lanes.length, 3, 'level 7 is the three-lane level')

  // NOTHING MERGES ANYWHERE. Each highway runs from its own west mouth to its
  // own east mouth; there is no fork, so no wave group needs an `exit` and
  // none carries one.
  for (const l of lanes.lanes) {
    assert.equal(lanes.transferFrom(l.id), null, `${l.id} hands its walkers to another lane`)
    assert.deepEqual(lanes.terminals(l.id).map((t) => t.id), [l.id],
      `${l.id} does not run to its own exit`)
    assert.deepEqual(lanes.routeLengths(l.id), [1400], `${l.id} does not walk 1400 px`)
  }
  // The two that are not the map's own waypoints say they are arrivals, which
  // is what stops `validateLanes` reading them as a forgotten merge.
  for (const l of M.lanes) {
    assert.equal(l.entrance, true, `lane ${l.id} does not declare itself an entrance`)
    assert.equal(l.merge, undefined, `lane ${l.id} merges somewhere`)
  }

  // THEY NEVER TOUCH, measured off the painted bands rather than asserted.
  // tools/check_level7.py re-measures this from the plate; this checks that the
  // shipped centrelines are at least a road apart, which is the version the
  // engine can be wrong about.
  const ys = [M.waypoints[0]![1], ...M.lanes.map((l) => l.waypoints[0]![1])].sort((a, b) => a - b)
  for (let i = 1; i < ys.length; i++) {
    assert.ok(ys[i]! - ys[i - 1]! > M.roadWidth,
      `two highways are ${ys[i]! - ys[i - 1]!} px apart, which is inside one road width`)
  }
})

test('every spawn lane is a lane, and nothing routes to an exit', () => {
  const known = new Set([M.mainId, ...M.lanes.map((l) => l.id)])
  for (const w of W) {
    for (const s of w.spawns) {
      assert.ok(s.lane, `${w.name}: a group does not name its lane`)
      assert.ok(known.has(s.lane!), `${w.name}: "${s.lane}" is not a lane on this map`)
      // `LaneNetwork.lane()` resolves an unknown id to main rather than
      // throwing, so a typo here walks the north highway silently. That is
      // exactly what the assertion above is for.
      assert.equal(s.exit, undefined,
        `${w.name}: a group names an exit, and this map has no fork to route at`)
    }
  }
})

/* ------------------------------------------------------------------- roster */

test('the Blade Rig cannot be held, slowed or stopped', () => {
  const rig = E.bladeRig
  assert.equal(rig.blockable, false, 'the Blade Rig can be held')
  assert.equal(rig.slowable, false, 'the Blade Rig can be slowed')
  assert.equal(rig.stunnable, false, 'the Blade Rig can be stunned')
  assert.equal(rig.glides, true, 'the Blade Rig can be caught by something on the ground')
  // AND THE RULE IS ENFORCED WHERE IT HAS TO BE, not only declared. `stunnable`
  // is the new one of the four, so it is the one that could silently do
  // nothing: Enemy.applyStun has to refuse before the lockout is consulted.
  assert.match(src('entities/Enemy.ts'), /if \(this\.def\.stunnable === false\) return/,
    'applyStun does not honour `stunnable`')
  // ABSENT MEANS TRUE, which is what keeps every other level playing as it did.
  const others = Object.entries(E).filter(([id]) => id !== 'bladeRig')
  for (const [id, e] of others) {
    assert.notEqual(e.stunnable, false, `${id} has quietly become unstunnable`)
  }

  // IT IS A MINI BOSS, NOT THE BOSS: `tier: elite` so the level still fields
  // exactly one `tier: boss` sprite, `role: boss` so the size, line and
  // leak-cost rules read it as what it is. The Vampire Lord's shape exactly.
  assert.equal(rig.tier, 'elite')
  assert.equal(rig.role, 'boss')
})

test('the blades cut player units, on a rate, and reach across one lane', () => {
  const b = bladesFrom(R)
  assert.ok(b, 'level 7 declares no blades')
  assert.equal(E.bladeRig.bladed, true, 'the Blade Rig does not carry the flag')
  // Scoped: every other level returns null and the whole mechanic is absent.
  assert.equal(bladesFrom(null), null)
  assert.equal(bladesFrom({}), null)

  // A RATE, NOT A HIT. Half a second in contact costs half a second's worth.
  assert.equal(bladeDamage({ x: 0, y: 0 }, [{ x: 0, y: 0 }], b!, 1), b!.damagePerSecond)
  assert.equal(bladeDamage({ x: 0, y: 0 }, [{ x: 0, y: 0 }], b!, 0.5), b!.damagePerSecond / 2)
  assert.equal(bladeDamage({ x: 0, y: 0 }, [], b!, 1), 0, 'the blades cut with no Rig on the board')
  assert.equal(bladeDamage({ x: b!.radius + 1, y: 0 }, [{ x: 0, y: 0 }], b!, 1), 0,
    'the blades reach past their radius')

  // TWO RIGS DO NOT STACK. The wave table puts them on one at a time, and this
  // is what stops that becoming a rule nobody wrote down.
  assert.equal(bladeDamage({ x: 0, y: 0 }, [{ x: 0, y: 0 }, { x: 1, y: 1 }], b!, 1),
    b!.damagePerSecond, 'two Rigs stack')

  // IT REACHES ACROSS THE ROAD IT IS DRIVING IN AND NOT OUT OF IT. A unit
  // standing on the scrub beside the highway has to be safe, or "get out of
  // the way" is not an answer.
  assert.ok(b!.radius < M.roadWidth, `the blades reach ${b!.radius} px across a ${M.roadWidth} px road`)

  // Towers are out of scope by construction: there is no field for them.
  assert.ok(!/tower/i.test(readFileSync(url('../src/systems/Blades.ts'), 'utf8')
    .split('export interface BladesDef')[1]!.split('}')[0]!),
    'the blades block has grown a tower option')
})

test('the Transporter unloads four named cars where it died', () => {
  const spec = E.transporter.splitsOnDeath
  assert.deepEqual(spec.enemies, ['cargoRed', 'cargoBlue', 'cargoYellow', 'cargoGreen'],
    'the four cars off the trailer are not one of each colour')
  assert.equal(spec.count, 4)
  assert.equal(spec.enemy, undefined, 'the row declares both a single kind and a list')
  assert.equal(spec.holdsWave, true, 'the wave does not wait for the cars')
  assert.ok(spec.spacingPx > 0 && spec.emergeSeconds >= 0)

  // THE FOUR ARE IDENTICAL BUT FOR THE SPRITE. Which colour you shoot first
  // must not matter; the colours exist so the player recognises the trailer.
  const [first, ...rest] = spec.enemies.map((id: string) => E[id])
  for (const c of rest) {
    for (const k of ['maxHealth', 'armor', 'speed', 'peanutReward', 'livesCost',
      'damage', 'attackInterval', 'blockable', 'slowable', 'role', 'tier']) {
      assert.equal(c[k], first[k], `the cargo cars differ on ${k}`)
    }
    assert.notEqual(c.sprite, first.sprite, 'two cargo cars wear the same art')
  }
  assert.equal(first.peanutReward, 0, 'the finale pays out, which makes it a farm')

  // THE SPAWN IS AT THE DEATH POINT AND THERE IS NO CLAMP. Eli raised the
  // late-kill risk and Cory kept it; this is the assertion that stops a later
  // pass quietly adding a minimum distance or a grace period back in.
  const game = src('scenes/GameScene.ts')
  assert.match(game, /const laneDistance = Math\.max\(0, at\.laneDistance - spacing \* i\)/,
    'the split no longer starts at the parent death point')
  assert.ok(!/minimumSpawnDistance|graceSeconds|spawnClamp/.test(game),
    'a safety clamp has been added to the finale; that reverts a design decision')

  // AND THE WAVE WAITS. `holdsWave` is `!summoned` for everything else in the
  // game, which is what stops a boss's brood extending the wave that spawned
  // it -- the Vampire Lord's four Gliders must NOT hold wave 11 open.
  assert.equal(E.vampireLord.splitsOnDeath.holdsWave, undefined,
    'the Vampire Lord has started holding his wave open')
  assert.match(game, /this\.enemies\.some\(\(e\) => e\.holdsWave\)/)
})

test('the roster is nine rows, every name in one place, and the art is registered', () => {
  const ids = ['hatchback', 'musclecar', 'van', 'cargoRed', 'cargoBlue', 'cargoYellow',
    'cargoGreen', 'bladeRig', 'transporter']
  assert.deepEqual(Object.values(R.roster).sort(), [...ids].sort(),
    'the rules block names a different cast from the one this test knows')
  for (const id of ids) {
    const e = E[id]
    assert.ok(e, `level7.json names ${id}, which is not an enemy`)
    assert.equal(e.artFacing, 'right', `${id} does not face right; it will walk backwards`)
    assert.ok((art as any).files[e.sprite], `${id}'s sprite is not in the manifest`)
    assert.ok(e.maxHealth > 0, `${id} has no health`)
    // EVERY DISPLAY NAME IS ON THE ENEMY ROW AND NOWHERE ELSE, which is what
    // makes renaming them with the kids one edit in one file.
    assert.ok(typeof e.name === 'string' && e.name.length > 0)
  }
  // AND NOWHERE ELSE PRINTS ONE. The wave table is the file that would: a wave
  // called "The Blade Rig" is a second copy of a name that is supposed to live
  // on one row. Lines whose KEY begins with an underscore are design notes and
  // are prose about the level, which may name anything it likes.
  const table = src('data/waves.level7.json').split('\n')
    .filter((l) => !/^\s*"_/.test(l)).join('\n')
  for (const id of ids) {
    assert.ok(!table.includes(E[id].name),
      `waves.level7.json prints "${E[id].name}" outside a design note`)
  }
})

/* -------------------------------------------------------------------- waves */

test('thirteen waves, three lanes live, and all three at once is an event', () => {
  assert.equal(W.length, 13, 'the brief asks for thirteen waves')
  assert.equal(W[0]!.spawns.length, 1, 'wave 1 should teach one thing')
  assert.equal(W[12]!.boss, 'transporter', 'the Transporter is the finale')

  const lanesOf = (i: number) => new Set(W[i]!.spawns.map((s) => s.lane))
  // THREE OF THE TWELVE ORDINARY WAVES, and the boss wave as well -- which is
  // four in the table and is not four events. A finale using the whole board is
  // what a finale is; what must stay rare is an ORDINARY wave doing it, or the
  // twenty double-covering pads stop being a choice and become the only way to
  // play.
  const allThree = W.map((_, i) => lanesOf(i).size)
    .filter((n, i) => n === 3 && !W[i]!.boss).length
  assert.equal(allThree, 3, 'all three lanes at once should be an event, not the norm')
  assert.equal(lanesOf(12).size, 3, 'the finale does not use the whole board')
  // Every lane is used, and no wave is a mirror of itself -- two lanes carrying
  // exactly the same groups would make the third pad-median pointless.
  const used = new Set(W.flatMap((w) => w.spawns.map((s) => s.lane)))
  assert.deepEqual([...used].sort(), ['middle', 'north', 'south'])

  // THE HEAVIER SIDE MOVES. Reading the heaviest lane per wave, no lane may
  // carry the weight in more than half the table, or one road is the level.
  const heaviest = W.map((w) => {
    const byLane: Record<string, number> = {}
    for (const s of w.spawns) {
      byLane[s.lane!] = (byLane[s.lane!] ?? 0) + s.count * E[s.enemy].maxHealth
    }
    return Object.entries(byLane).sort((a, b) => b[1] - a[1])[0]![0]
  })
  for (const lane of ['north', 'middle', 'south']) {
    const n = heaviest.filter((l) => l === lane).length
    assert.ok(n <= 7, `${lane} carries the heaviest group in ${n} of 13 waves`)
    assert.ok(n >= 2, `${lane} never carries a wave's heaviest group`)
  }
})

test('the Blade Rig arrives twice, in the back half, one at a time', () => {
  const rigWaves = W.map((w, i) => ({ w, i }))
    .filter(({ w }) => w.spawns.some((s) => s.enemy === 'bladeRig'))
  assert.equal(rigWaves.length, 2, 'the brief asks for two appearances')
  for (const { w, i } of rigWaves) {
    assert.ok(i >= 6, `a Blade Rig arrives at wave ${i + 1}, which is not the back half`)
    const count = w.spawns.filter((s) => s.enemy === 'bladeRig')
      .reduce((n, s) => n + s.count, 0)
    assert.equal(count, 1, `wave ${i + 1} fields ${count} Blade Rigs; the brief says one at a time`)
    assert.equal(w.boss, 'bladeRig', `wave ${i + 1} does not announce the Rig`)
  }
  // AND THEY NEVER OVERLAP, which is what makes "two Rigs do not stack" a
  // situation the level does not produce rather than a rule it relies on.
  assert.ok(rigWaves[1]!.i > rigWaves[0]!.i + 1, 'the two Rigs arrive in consecutive waves')

  // The Transporter appears once, on the last wave, and nowhere else.
  const bossWaves = W.map((w, i) => ({ w, i }))
    .filter(({ w }) => w.spawns.some((s) => s.enemy === 'transporter'))
  assert.deepEqual(bossWaves.map(({ i }) => i), [12], 'the Transporter is not a wave 13 exclusive')
  assert.equal(bossWaves[0]!.w.spawns.find((s) => s.enemy === 'transporter')!.lane, 'south',
    'the Transporter is not routed down the lane whose east end nobody can reach')
})

test('the finale is routed through the one stretch no tower reaches', () => {
  // THE MEASUREMENT THE LEVEL IS BUILT ON. The south highway's last 189 px are
  // uncovered, so the Transporter has a hard deadline rather than a health bar:
  // if the board cannot finish it before x=1090 it walks out with 18 lives.
  const span = GEOMETRY.uncoveredLaneSpans.south as [number, number][]
  const tail = span[span.length - 1]!
  assert.equal(tail[1], 1279, 'the south lane no longer runs uncovered to its exit')
  assert.ok(tail[1] - tail[0] > 150,
    'the south lane\'s dead stretch has shrunk; the boss fight has a different shape now')
  // ...and it is the worst of the three, which is why the boss is on it.
  for (const other of ['north', 'middle'] as const) {
    const s = GEOMETRY.uncoveredLaneSpans[other] as [number, number][]
    const t = s[s.length - 1]!
    assert.ok(t[1] - t[0] < tail[1] - tail[0],
      `${other} has a longer dead stretch than the south lane`)
  }
  assert.ok(GEOMETRY.coverage.south < GEOMETRY.coverage.north)
  assert.ok(GEOMETRY.coverage.south < GEOMETRY.coverage.middle)
})

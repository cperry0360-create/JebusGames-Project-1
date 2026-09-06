import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')

import {
  DEFAULT_LEVEL_ID, LEVELS, ROAD_SLOTS, isLevelUnlocked, levelDef, loadLevel,
  resolveLevelId, unlockedLevels,
} from '../src/systems/Levels.ts'
import { roadNodes } from '../src/systems/WorldRoad.ts'

const levels = read('levels'), enemies = read('enemies')
const l1 = read('waves'), l2 = read('waves.level2')

const health = (w: any): number =>
  w.spawns.reduce((n: number, s: any) => n + s.count * enemies[s.enemy].maxHealth, 0)
const total = (t: any): number => t.waves.reduce((n: number, w: any) => n + health(w), 0)

/* ------------------------------------------------------------- the registry */

test('every level names a wave table that exists, and no two share one', () => {
  const ids = levels.levels.map((l: any) => l.id)
  assert.equal(new Set(ids).size, ids.length, 'two levels share an id')
  const files = levels.levels.map((l: any) => l.waves)
  assert.equal(new Set(files).size, files.length,
    'two levels point at the same wave table; level 2 sharing level 1\'s waves is the thing this file exists to prevent')
  for (const l of levels.levels) {
    assert.ok(existsSync(url(`../src/data/${l.waves}`)), `${l.id} points at ${l.waves}, which does not exist`)
    assert.ok(l.name && l.name.length > 0, `${l.id} has no name`)
    assert.ok(l.laneLengthPx > 0, `${l.id} has no lane length`)
    assert.ok(Number.isInteger(l.runsClearedToUnlock) && l.runsClearedToUnlock >= 0,
      `${l.id} has a nonsense unlock count`)
  }
})

test('the scene takes its level from the registry rather than importing one', () => {
  // This used to assert the OPPOSITE — that GameScene imported waves.json
  // directly — because the registry was data nothing read. It is read now, so
  // the property worth holding is that the scene has no private opinion about
  // which map or wave table a run plays.
  const byId = Object.fromEntries(levels.levels.map((l: any) => [l.id, l]))
  assert.equal(byId.level1.waves, 'waves.json')

  const game = src('scenes/GameScene.ts')
  assert.ok(!/from '\.\.\/data\/(waves|map)\.json'/.test(game),
    'GameScene imports a level\'s data directly again, going round the registry')
  assert.match(game, /loadLevel\(/, 'GameScene never resolves a level')

  // Every level in the registry must be buildable, which is the failure the
  // static import table in Levels.ts is there to make impossible.
  const src_ = src('systems/Levels.ts')
  for (const l of levels.levels) {
    assert.ok(src_.includes(`${l.id}:`), `Levels.ts registers no map for ${l.id}`)
    assert.ok(src_.includes(`'${l.waves}'`), `Levels.ts imports no wave table for ${l.waves}`)
  }
})

/* --------------------------------------------------------------- the loader */

test('the registry hands back each level\'s own map and wave table', () => {
  // The refactor's whole claim: a level id in, that level's data out. Checked
  // against the JSON directly rather than against itself.
  const l1 = loadLevel('level1')
  assert.equal(l1.id, 'level1')
  assert.deepEqual(l1.map.waypoints, read('map').waypoints)
  assert.deepEqual(l1.waveTable.waves, read('waves').waves)

  const l2 = loadLevel('level2')
  assert.equal(l2.id, 'level2')
  assert.deepEqual(l2.map.waypoints, read('map_level2').waypoints)
  assert.deepEqual(l2.waveTable.waves, read('waves.level2').waves)

  // And they are genuinely different maps, which is the bug a copy-paste
  // registry would produce and every other assertion here would still pass.
  assert.notDeepEqual(l1.map.waypoints, l2.map.waypoints)
})

test('every level in levels.json can actually be built', () => {
  for (const l of LEVELS) {
    const loaded = loadLevel(l.id)
    assert.ok(loaded.map.waypoints.length >= 2, `${l.id} has no usable lane`)
    assert.ok(loaded.map.buildSpots.length > 0, `${l.id} has nowhere to build`)
    assert.ok(loaded.waveTable.waves.length > 0, `${l.id} has no waves`)
    assert.ok(loaded.map.plate, `${l.id} names no plate`)
  }
})

test('an unknown level id falls back rather than throwing', () => {
  // A save can name a level that has been renamed or removed. Resuming onto
  // the wrong map is recoverable; taking the scene down on its first frame is
  // not, and that is the only reason this is a fallback and not an error.
  assert.equal(resolveLevelId('level-that-never-was'), DEFAULT_LEVEL_ID)
  assert.equal(resolveLevelId(null), DEFAULT_LEVEL_ID)
  assert.equal(resolveLevelId(undefined), DEFAULT_LEVEL_ID)
  assert.equal(loadLevel('level-that-never-was').id, DEFAULT_LEVEL_ID)
  // A real id is never rewritten.
  assert.equal(resolveLevelId('level2'), 'level2')
  assert.equal(DEFAULT_LEVEL_ID, 'level1')
  assert.equal(levelDef('level-that-never-was'), null)
})

/* ------------------------------------------------------- optional furniture */

test('level 1 has its arch, gate and signs, and level 2 has none of them', () => {
  // Not a wish: these three fields are optional on MapDef precisely because
  // level 2's lane runs off both edges of its plate and there is nothing to
  // animate at either end. If level 1 ever loses one, the guards in GameScene
  // start silently skipping scenery that is supposed to be there.
  const l1 = loadLevel('level1').map
  for (const k of ['entrance', 'exit', 'signs'] as const) {
    assert.ok(l1[k], `level 1 lost its ${k}`)
  }
  const l2 = loadLevel('level2').map
  for (const k of ['entrance', 'exit', 'signs'] as const) {
    assert.equal(l2[k], undefined, `level 2 grew a ${k}; the map was traced without one`)
  }
})

test('the scene builds the optional furniture only where the map declares it', () => {
  const game = src('scenes/GameScene.ts')
  // Each is behind a check on the map, not assumed present.
  assert.match(game, /if \(!entrance\) return/, 'the arch occluders assume an entrance')
  assert.match(game, /if \(map\.signs\) \{/, 'the signs are built unconditionally')
  assert.match(game, /map\.entrance \? distanceAtX/, 'the arch mouth assumes an entrance')
  assert.match(game, /map\.exit \? distanceAtX/, 'the gate assumes an exit')
  // And the taps that reach them tolerate their absence.
  assert.match(game, /this\.sign\?\.owns/, 'a tap would throw on a level with no sign')
  // The arch is cropped out of the LEVEL'S plate, not level 1's by name.
  assert.ok(!/ART\.map\.level1/.test(game), 'the scene still names level 1\'s plate directly')
})

/* -------------------------------------------------------------- the unlock */

test('a level opens exactly at its own threshold and never closes again', () => {
  // Reads each threshold from levels.json rather than naming a number. The
  // count is a tuning knob — level 2's moved from 1 to 99 to take an
  // unwinnable level out of reach — and a test that hardcodes it fails on the
  // tuning instead of on the gate, which is the thing worth protecting.
  for (const l of LEVELS) {
    const need = l.runsClearedToUnlock
    if (need > 0) {
      assert.ok(!isLevelUnlocked(l.id, need - 1),
        `${l.id} is reachable one run short of its ${need}`)
    }
    assert.ok(isLevelUnlocked(l.id, need), `${l.id} does not open at its own threshold of ${need}`)
    assert.ok(isLevelUnlocked(l.id, need + 50), `${l.id} closes again after more runs`)
  }
  // The first level is open to someone who has never finished anything.
  assert.ok(isLevelUnlocked(LEVELS[0]!.id, 0), 'the first level is not open to a new player')
  // An id that is not a level is not unlocked by any amount of play.
  assert.ok(!isLevelUnlocked('level-that-never-was', 9999))
})

test('unlockedLevels grows with cleared runs and never reorders', () => {
  assert.deepEqual(unlockedLevels(0).map((l: any) => l.id),
    LEVELS.filter((l) => l.runsClearedToUnlock === 0).map((l) => l.id))
  const most = Math.max(...LEVELS.map((l) => l.runsClearedToUnlock))
  // File order, so the select draws them in the order they were authored.
  assert.deepEqual(unlockedLevels(most).map((l: any) => l.id), LEVELS.map((l) => l.id))
  // Monotonic: clearing more runs never takes a level away.
  let seen = 0
  for (let runs = 0; runs <= most; runs++) {
    const n = unlockedLevels(runs).length
    assert.ok(n >= seen, `unlockedLevels shrank from ${seen} to ${n} at ${runs} cleared runs`)
    seen = n
  }
})

test('a run can only ever begin on a level the player has unlocked', () => {
  // A drawn lock is a drawing. This asserts the two places a run can actually
  // start, because that is where the enforcement has to be.
  //
  // START RUN cannot pick a locked level BY CONSTRUCTION now: it asks for the
  // furthest unlocked one rather than choosing and then checking.
  const title = src('scenes/TitleScene.ts')
  assert.match(title, /furthestUnlocked\(loadSave\(\)\.runsCleared\)/,
    'START RUN no longer starts the furthest unlocked level')

  // The map's cards re-check on the way into the run, so a card that somehow
  // kept a handler cannot start a level the save does not allow.
  const map = src('scenes/WorldMapScene.ts')
  assert.match(map, /if \(!isLevelUnlocked\(id, cleared\)\) return/,
    'the map starts a level without re-checking that it is unlocked')
  // And a locked node is given no handler at all: the interactive rectangle is
  // made inside a branch a locked node never reaches, and that branch returns.
  assert.match(map, /if \(state !== 'locked'\) \{[\s\S]*?return\n {4}\}/,
    'a locked node falls through to the tappable path')
  const tappable = map.slice(map.indexOf("if (state !== 'locked') {"))
  assert.ok(tappable.indexOf('setInteractive') < tappable.indexOf('\n    }'),
    'the interactive rectangle is made outside the branch a locked node cannot reach')
})

test('a resume goes back to the level it was saved on', () => {
  const title = src('scenes/TitleScene.ts')
  assert.match(title, /levelId: resolveLevelId\(saved\.level\)/,
    'resuming does not carry the saved level through')
  const game = src('scenes/GameScene.ts')
  assert.match(game, /resumeFrom\?\.level/,
    'the scene ignores the level the run was saved on')
  // And the save writes what is being played, not a literal.
  assert.match(game, /level: this\.level\.id/, 'the save still hardcodes a level')
  assert.ok(!/level: 'level1'/.test(game), 'the save still writes level1 unconditionally')
})

/* ------------------------------------------------------------- the world map */

test('every level has a slot on the road and a card to draw there', () => {
  // THE POINT OF THE MAP BEING COMPOSED. Adding a level is a row in
  // levels.json plus one card in art.json, and this is what makes forgetting
  // either a failed build rather than a gap on the screen.
  //
  // A LEVEL'S POSITION IS NO LONGER DATA. Every level used to carry a
  // hand-authored mapPosition, and the four of them had drifted out of level
  // order -- so the trail drawn between them in order ran backwards across the
  // screen and read as though it skipped a level. Order is the position now.
  const art = JSON.parse(src('data/art.json'))
  const cards = art.worldMap.cards as Record<string, string>

  for (const l of LEVELS) {
    assert.equal((l as any).mapPosition, undefined,
      `${l.id} still carries a mapPosition; the road places a level by its order`)
    const key = cards[l.id]
    assert.ok(key, `art.json's worldMap.cards has no card for ${l.id}`)
    assert.ok(art.files[key],
      `${l.id}'s card is "${key}", which is not a file in the manifest`)
  }

  // And no card for a level that does not exist, which would be a file
  // shipping for nothing.
  for (const id of Object.keys(cards)) {
    assert.ok(LEVELS.some((l) => l.id === id),
      `worldMap.cards has a card for "${id}", which is not a level`)
  }

  // Every level gets a slot, and the road is at least as long as the campaign
  // is planned to be -- the unbuilt stretch is the point, so the screen shows
  // a road ahead rather than stopping at whatever shipped last.
  assert.ok(ROAD_SLOTS >= LEVELS.length, 'the road has fewer slots than there are levels')
  assert.equal(roadNodes().length, ROAD_SLOTS)
  for (const [i, l] of LEVELS.entries()) {
    assert.equal(roadNodes()[i]!.level?.id, l.id, `slot ${i + 1} is not ${l.id}`)
    assert.equal(roadNodes()[i]!.number, i + 1, 'a node is numbered by something other than its slot')
  }
  for (const n of roadNodes().slice(LEVELS.length)) {
    assert.equal(n.level, null, `slot ${n.number} claims a level that is not built`)
  }
})

test('two levels never share a spot on the map', () => {
  // Two nodes at the same place is one node as far as the player is concerned.
  // It cannot happen now -- the slots are a level apart by construction --
  // which is most of why the positions were taken out of the data.
  const seen = new Set<string>()
  for (const n of roadNodes()) {
    const key = `${n.x},${n.y}`
    assert.ok(!seen.has(key), `two slots are both at ${key} on the world map`)
    seen.add(key)
  }
})

test('the map screen reads a level\'s place and picture from the data only', () => {
  // The whole claim of "composed": no coordinate and no texture key for a
  // level may be written into the scene.
  const map = src('scenes/WorldMapScene.ts')
  assert.match(map, /ART\.worldMap\.cards\[node\.level\.id\]/,
    'the map screen does not look its cards up by level id')
  for (const l of LEVELS) {
    assert.ok(!map.includes(`'${l.id}'`),
      `WorldMapScene names "${l.id}" directly; levels must come from the registry`)
  }
  // The road is generated from the nodes' own positions, not drawn as art, and
  // it is ONE polyline through them in order -- which is what the four
  // separate runs it replaces could not guarantee.
  assert.match(map, /roadNodes\(\)/, 'the scene does not lay itself out from the road')
  assert.match(map, /strokePoints\(points, false, false\)/,
    'the road is no longer one unbroken stroke through the nodes')
  // And no layout number is typed into the scene: they are all in
  // presentation.json's worldMap block, read through ROAD.
  assert.ok(!/const (CARD_W|CARD_H|TOP_MARGIN|BOTTOM_MARGIN|FRAME_PAD) =/.test(map),
    'the map screen has grown its own copy of the layout numbers again')
})

/* ------------------------------------------------------------ the same shape */

test('level 2 has level 1\'s wave count and level 1\'s shape', () => {
  assert.equal(l2.waves.length, l1.waves.length, 'level 2 has a different number of waves')
  const names = l2.waves.map((w: any) => w.name)
  assert.equal(new Set(names).size, names.length, 'two level 2 waves share a name')
  for (const n of names) assert.ok(n && n.length > 0, 'an unnamed wave')

  for (let i = 0; i < l1.waves.length; i++) {
    const a = l1.waves[i], b = l2.waves[i]
    assert.equal(b.spawns.length, a.spawns.length,
      `wave ${i + 1} has ${b.spawns.length} spawn groups against level 1's ${a.spawns.length}`)
    for (let j = 0; j < a.spawns.length; j++) {
      // Same groups, in the same order, arriving at the same times. Counts are
      // the only thing tuned, which is what "same shape" has to mean if it is
      // to mean anything checkable.
      assert.equal(b.spawns[j].interval, a.spawns[j].interval,
        `wave ${i + 1} group ${j + 1} spawns at a different rate`)
      assert.equal(b.spawns[j].delay, a.spawns[j].delay,
        `wave ${i + 1} group ${j + 1} starts at a different time`)
    }
  }
})

test('the demons stand in tier for tier, and Bruiser keeps the early waves', () => {
  const SUB: Record<string, string> = {
    shredder: 'directReport',      // fast, basic tier
    finalNotice: 'middleManager',  // armoured, elite
    politician: 'theDevil',        // boss
    lateFiler: 'lateFiler',        // Bruiser stays put
  }
  for (let i = 0; i < l1.waves.length; i++) {
    const a = l1.waves[i], b = l2.waves[i]
    for (let j = 0; j < a.spawns.length; j++) {
      assert.equal(b.spawns[j].enemy, SUB[a.spawns[j].enemy],
        `wave ${i + 1} group ${j + 1}: ${a.spawns[j].enemy} should be answered by ${SUB[a.spawns[j].enemy]}`)
    }
    // And the substitution really is tier for tier, not just a rename.
    for (let j = 0; j < a.spawns.length; j++) {
      assert.equal(enemies[b.spawns[j].enemy].tier, enemies[a.spawns[j].enemy].tier,
        `wave ${i + 1} group ${j + 1} swaps a ${enemies[a.spawns[j].enemy].tier} for a ${enemies[b.spawns[j].enemy].tier}`)
      assert.equal(enemies[b.spawns[j].enemy].role, enemies[a.spawns[j].enemy].role,
        `wave ${i + 1} group ${j + 1} swaps roles as well as tiers`)
    }
  }
  // Not wall-to-wall demons: the opening is Bruisers, and he is still there
  // when the demons arrive.
  const early = l2.waves.slice(0, 4)
  for (const w of early) {
    assert.ok(w.spawns.some((s: any) => s.enemy === 'lateFiler'),
      `${w.name} has no Bruiser in it`)
  }
  assert.ok(l2.waves[0].spawns.every((s: any) => s.enemy === 'lateFiler'),
    'level 2 opens on something other than Bruisers')
})

/* ------------------------------------------------------------------ the step */

test('level 2 is a step up of 15 to 20 percent, not a spike', () => {
  // Back to 15-20% after a detour through 8%.
  //
  // Level 2 was unwinnable at 18.5% and the health was blamed for it. It was
  // not: the pads were 117-185 px from the road, out of range of four of the
  // five towers, and moving them inward is what made the level playable. The
  // health cut rode along with that fix and was never needed — with the pads
  // corrected, 8% played as too easy in real hands.
  const t1 = total(l1), t2 = total(l2)
  const step = t2 / t1 - 1
  assert.ok(step >= 0.15 && step <= 0.20,
    `level 2 carries ${Math.round(step * 100)}% more enemy health than level 1, not 15-20%`)

  // And never LESS than level 1 on any wave: it is the second map, and an
  // early wave that is lighter than level 1's reads as the game going soft.
  for (let i = 0; i < l1.waves.length; i++) {
    assert.ok(health(l2.waves[i]) >= health(l1.waves[i]),
      `${l2.waves[i].name} is lighter than level 1's wave ${i + 1}`)
  }

  // Reached through counts. The demons' own stats are the ones that were
  // handed over, and a level that quietly buffs an enemy to hit a target is
  // tuning the whole game to tune one map.
  assert.equal(enemies.directReport.maxHealth, 52)
  assert.equal(enemies.middleManager.maxHealth, 185)
  assert.equal(enemies.theDevil.maxHealth, 6200)

  // No single wave is allowed to carry the increase on its own.
  for (let i = 0; i < l1.waves.length; i++) {
    const per = health(l2.waves[i]) / health(l1.waves[i]) - 1
    assert.ok(per >= 0 && per <= 0.35,
      `${l2.waves[i].name} is ${Math.round(per * 100)}% heavier than level 1's wave ${i + 1}`)
  }
})

test('level 2 ends on its boss, escorted rather than buried', () => {
  const last = l2.waves[l2.waves.length - 1]
  assert.equal(last.boss, 'theDevil')
  assert.equal(enemies[last.boss].tier, 'boss')
  const bossSpawn = last.spawns.find((s: any) => s.enemy === last.boss)
  assert.ok(bossSpawn && bossSpawn.count === 1, 'there is one of him')
  const escort = last.spawns.filter((s: any) => s.enemy !== last.boss)
    .reduce((n: number, s: any) => n + s.count, 0)
  const busiest = Math.max(...l2.waves.slice(0, -1)
    .map((w: any) => w.spawns.reduce((n: number, s: any) => n + s.count, 0)))
  assert.ok(escort > 0 && escort < busiest / 2,
    `an escort of ${escort} against a normal wave's ${busiest} is a second wave`)
  for (const s of last.spawns) {
    if (s.enemy === last.boss) continue
    assert.equal(enemies[s.enemy].tier, 'basic', 'the escort should be standard enemies')
  }
})

test('each level\'s laneLengthPx is what its own map actually walks', () => {
  // levels.json carried 1916.7 for level 2 for as long as there was no level 2
  // map to check it against: a figure that came with the plate, never measured.
  // The traced lane walks 1955.3. Nothing caught the 38.6 px because nothing
  // compared the constant to the geometry, so this does.
  //
  // ON A BRANCHING MAP `waypoints` IS NOT THE LANE. Level 3's own waypoints are
  // the shared tail alone -- 672 px of it -- and what a player watches an enemy
  // walk is a branch plus that tail. So the figure checked is the ROUTE from
  // each gate to the exit, and on a single-lane map the route is the waypoints,
  // which is why levels 1 and 2 read the same as they always did.
  const maps: Record<string, string> = {
    level1: 'map', level2: 'map_level2', level3: 'map_level3', level4: 'map_level4',
  }
  const walk = (w: [number, number][]): number => {
    let d = 0
    for (let i = 0; i < w.length - 1; i++)
      d += Math.hypot(w[i + 1][0] - w[i][0], w[i + 1][1] - w[i][1])
    return d
  }
  for (const l of levels.levels) {
    const file = maps[l.id]
    assert.ok(file, `${l.id} has no map file in this test's table; add it`)
    const map = read(file)
    const trunk = walk(map.waypoints as [number, number][])
    const branches = (map.lanes ?? []) as Array<{ id: string; waypoints: [number, number][] }>
    const routes = branches.length === 0
      ? [trunk]
      : branches.map((b) => walk(b.waypoints) + trunk)
    for (const r of routes) {
      assert.equal(Math.round(r * 10) / 10, l.laneLengthPx,
        `${l.id} records laneLengthPx ${l.laneLengthPx} but a route walks ${Math.round(r * 10) / 10}`)
    }
  }
})

test('the lane lengths are close enough that copied spacing is honest', () => {
  // The reason level 2's intervals and delays are level 1's, unchanged. If a
  // later map moves the lane materially, this fails and the spacing has to be
  // thought about rather than copied.
  const byId = Object.fromEntries(levels.levels.map((l: any) => [l.id, l]))
  const drift = Math.abs(byId.level2.laneLengthPx / byId.level1.laneLengthPx - 1)
  assert.ok(drift < 0.05,
    `the lanes differ by ${(drift * 100).toFixed(1)}%; level 2 cannot keep level 1's wave spacing unexamined`)
})

test('level 2 does not get its own economy', () => {
  // The brief: economy rules stay shared. A per-level purse or clear bonus
  // would be a rules.json change, and there is not one.
  const rules = readFileSync(url('../src/data/rules.json'), 'utf8')
  for (const key of ['level1', 'level2', 'perLevel']) {
    assert.ok(!rules.includes(key), `rules.json has grown a ${key} branch; the economy was meant to stay shared`)
  }
  const table = readFileSync(url('../src/data/waves.level2.json'), 'utf8')
  for (const key of ['startingPeanuts', 'peanutsPerWaveCleared', 'startingLives']) {
    assert.ok(!table.includes(key), `waves.level2.json sets ${key}; the economy is rules.json's`)
  }
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')

import {
  DEFAULT_LEVEL_ID, LEVELS, isLevelUnlocked, levelDef, loadLevel, resolveLevelId, unlockedLevels,
} from '../src/systems/Levels.ts'

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

test('the title screen gates the start rather than only greying the button', () => {
  // A disabled plate is a drawing. The enforcement has to be where the run
  // actually begins, or a stale selection walks straight past it.
  const title = src('scenes/TitleScene.ts')
  assert.match(title, /isLevelUnlocked\(this\.selectedLevel, cleared\)/,
    'START RUN does not re-check that the chosen level is unlocked')
  assert.match(title, /levelId,/, 'the chosen level is never handed to the run')
  assert.match(title, /setEnabled\(false\)/, 'a locked level is still clickable')
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

test('level 2 is a step up of about 8 percent, not a spike', () => {
  // The band was 15-20% and level 2 won 0 of 60 soaked runs at the top of it.
  // Two things were wrong at once — pads out of tower range AND more health —
  // and the pads were the larger of the two. With those fixed, 18.5% was still
  // more than the map could carry. 8% is the tuned figure: enough that level 2
  // is the harder board, little enough that it is beatable. Widened to 5-12%
  // so ordinary count edits do not fail this, but a slide back toward the old
  // spike does.
  const t1 = total(l1), t2 = total(l2)
  const step = t2 / t1 - 1
  assert.ok(step >= 0.05 && step <= 0.12,
    `level 2 carries ${Math.round(step * 100)}% more enemy health than level 1, not 5-12%`)

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
  const maps: Record<string, string> = { level1: 'map', level2: 'map_level2' }
  for (const l of levels.levels) {
    const file = maps[l.id]
    assert.ok(file, `${l.id} has no map file in this test's table; add it`)
    const w = read(file).waypoints as [number, number][]
    let walked = 0
    for (let i = 0; i < w.length - 1; i++)
      walked += Math.hypot(w[i + 1][0] - w[i][0], w[i + 1][1] - w[i][1])
    assert.equal(Math.round(walked * 10) / 10, l.laneLengthPx,
      `${l.id} records laneLengthPx ${l.laneLengthPx} but its waypoints walk ${(Math.round(walked * 10) / 10)}`)
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

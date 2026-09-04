import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')

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

test('level 1 is still the table the scene loads, and it is not level 2\'s', () => {
  // GameScene is deliberately NOT level-aware yet, so the one table it imports
  // has to stay the one levels.json calls level 1. If that import ever moves,
  // this is the test that says the registry and the scene have parted company.
  const byId = Object.fromEntries(levels.levels.map((l: any) => [l.id, l]))
  assert.equal(byId.level1.waves, 'waves.json')
  assert.match(src('scenes/GameScene.ts'), /from '\.\.\/data\/waves\.json'/,
    'GameScene no longer loads waves.json; levels.json needs to become real')
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
  const t1 = total(l1), t2 = total(l2)
  const step = t2 / t1 - 1
  assert.ok(step >= 0.15 && step <= 0.20,
    `level 2 carries ${Math.round(step * 100)}% more enemy health than level 1, not 15-20%`)

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

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Grid } from '../src/systems/Grid.ts'
import { Path } from '../src/systems/Path.ts'
import { BuildSystem } from '../src/systems/BuildSystem.ts'
import { shouldTrigger, atThreshold, outgoingDamage, attackInterval, incomingDamage } from '../src/systems/LastStand.ts'

const read = (n: string) => JSON.parse(readFileSync(new URL(`../src/data/${n}.json`, import.meta.url), 'utf8'))
const map = read('map'), display = read('display'), heroes = read('heroes')
const towers = read('towers'), enemies = read('enemies'), rules = read('rules'), waves = read('waves')

const grid = new Grid(map.cols, map.rows, display.tileSize, map.originX, map.originY)
const lane = new Path(map.path, grid)

test('road tiles are unbuildable, everything else is', () => {
  const b = new BuildSystem(grid)
  for (const t of lane.tiles()) b.block(t.col, t.row)
  for (const t of lane.tiles()) assert.equal(b.isBuildable(t.col, t.row), false, `road ${t.col},${t.row}`)
  assert.equal(b.isBuildable(-1, 0), false, 'off-grid')
  assert.equal(b.isBuildable(map.cols, 0), false, 'off-grid')
  let free = 0
  for (let c = 0; c < grid.cols; c++) for (let r = 0; r < grid.rows; r++) if (b.isBuildable(c, r)) free++
  assert.equal(free, grid.cols * grid.rows - lane.tiles().length)
})

test('a tile can only be built on once', () => {
  const b = new BuildSystem(grid)
  assert.ok(b.isBuildable(5, 5))
  b.occupy(5, 5)
  assert.equal(b.isBuildable(5, 5), false)
  assert.equal(b.towerCount, 1)
})

const ls = heroes.cory.lastStand

test('Last Stand threshold is 25% as the design requires', () => {
  assert.equal(ls.healthThreshold, 0.25)
})

test('Last Stand fires at 25% and not before', () => {
  const max = heroes.cory.maxHealth
  assert.equal(atThreshold(max * 0.26, max, ls), false)
  assert.equal(atThreshold(max * 0.25, max, ls), true)
  assert.equal(atThreshold(max * 0.10, max, ls), true)
  assert.equal(atThreshold(0, max, ls), false, 'a downed hero is not transforming')
})

test('Last Stand is once per encounter', () => {
  const max = heroes.cory.maxHealth
  assert.equal(shouldTrigger(max * 0.2, max, ls, false), true)
  assert.equal(shouldTrigger(max * 0.2, max, ls, true), false, 're-trigger after use')
  assert.equal(shouldTrigger(max * 0.05, max, ls, true), false, 're-trigger deeper in')
})

test('DAD MODE hits harder, swings faster, and defends worse', () => {
  const h = heroes.cory
  assert.ok(outgoingDamage(h.damage, ls, true) > outgoingDamage(h.damage, ls, false), 'damage must rise')
  assert.ok(attackInterval(h.attackInterval, ls, true) < h.attackInterval, 'interval must shorten')
  assert.ok(incomingDamage(10, ls, true) > 10, 'defence must drop')
  assert.equal(outgoingDamage(h.damage, ls, false), h.damage, 'inactive is a no-op')
  assert.equal(incomingDamage(10, ls, false), 10, 'inactive is a no-op')
  assert.equal(ls.hitsAllInRange, true, 'swings wildly at everything in range')
})

test('a hero left alone dies rather than living forever', () => {
  // Full block of Late Filers vs Cory, no towers helping.
  const h = heroes.cory, e = enemies.lateFiler
  const dps = (e.damage / e.attackInterval) * h.blockCapacity
  const heroDps = h.damage / h.attackInterval
  assert.ok(dps > 0 && heroDps > 0)
  const secondsToLastStand = (h.maxHealth * (1 - ls.healthThreshold)) / dps
  assert.ok(secondsToLastStand > 5 && secondsToLastStand < 90,
    `Last Stand would take ${secondsToLastStand.toFixed(1)}s under full block`)
  console.log(`   full block: Last Stand at ~${secondsToLastStand.toFixed(0)}s, hero dps ${heroDps.toFixed(1)} vs enemy dps ${dps.toFixed(1)}`)
})

test('opening gold buys a tower but not the whole board', () => {
  const costs = Object.values(towers).map((t: any) => t.cost)
  const cheapest = Math.min(...costs)
  assert.ok(rules.startingGold >= cheapest, 'cannot afford anything to open with')
  assert.ok(rules.startingGold < cheapest * 4, 'opening is too rich to be a decision')
})

test('the board grows at a sane rate across the run', () => {
  const costs = Object.values(towers).map((t: any) => t.cost)
  const cheapest = Math.min(...costs)
  const avg = costs.reduce((a, b) => a + b, 0) / costs.length
  const payout = (i: number) =>
    waves.waves[i].spawns.reduce((a: number, s: any) => a + s.count, 0) * enemies.lateFiler.goldReward +
    rules.goldPerWaveCleared

  // Expanding must stay possible without being instant: by the end of wave 2
  // the player should have earned another tower.
  const throughWave2 = payout(0) + payout(1)
  assert.ok(throughWave2 >= cheapest, `waves 1-2 pay ${throughWave2}, cheapest tower ${cheapest}`)
  assert.ok(payout(0) < cheapest, 'one wave should not immediately fund another tower')

  const total = rules.startingGold + waves.waves.map((_: any, i: number) => payout(i)).reduce((a: number, b: number) => a + b, 0)
  const towersAfforded = total / avg
  assert.ok(towersAfforded > 5 && towersAfforded < 14,
    `run affords ~${towersAfforded.toFixed(1)} towers, which is off`)
  console.log(`   economy: open ${rules.startingGold}g, waves 1-2 pay ${throughWave2}g, run total ${total}g (~${towersAfforded.toFixed(1)} towers)`)
})

test('the two openers cover different jobs', () => {
  const list = Object.values(towers) as any[]
  assert.equal(list.length, 2)
  assert.equal(list.filter((t) => t.splashRadius > 0).length, 1, 'need exactly one AOE option')
  assert.equal(list.filter((t) => t.splashRadius === 0).length, 1, 'need exactly one single-target option')
  for (const t of list) assert.equal(t.buildTime, 0, 'tier 1 must place instantly')
})

test('waves escalate', () => {
  const counts = waves.waves.map((w: any) => w.spawns.reduce((a: number, s: any) => a + s.count, 0))
  for (let i = 1; i < counts.length; i++) {
    assert.ok(counts[i] > counts[i - 1], `wave ${i + 1} is not bigger than wave ${i}`)
  }
  console.log(`   wave sizes: ${counts.join(', ')}`)
})

test('one enemy type, and it can be killed by one tower before it crosses', () => {
  assert.equal(Object.keys(enemies).length, 1, 'Phase 1 is one enemy type')
  const e = enemies.lateFiler
  const walk = lane.totalLength / e.speed
  const t = towers.withholding
  const dps = t.damage / t.fireInterval
  assert.ok(dps * 4 > e.maxHealth, 'a single tower cannot meaningfully hurt one enemy')
  console.log(`   lane walk ${walk.toFixed(0)}s; Withholding dps ${dps.toFixed(1)} vs ${e.maxHealth}hp`)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { shouldTrigger, atThreshold, outgoingDamage, attackInterval, incomingDamage } from '../src/systems/LastStand.ts'
import { damageAfterArmor, boostedDamage, slowedSpeed } from '../src/systems/Combat.ts'

const read = (n: string) => JSON.parse(readFileSync(new URL(`../src/data/${n}.json`, import.meta.url), 'utf8'))
const heroes = read('heroes'), towers = read('towers'), enemies = read('enemies')
const rules = read('rules'), waves = read('waves'), art = read('art'), map = read('map')

const towerList = Object.entries(towers) as [string, any][]
const enemyList = Object.entries(enemies) as [string, any][]
const ls = heroes.cory.lastStand

// ------------------------------------------------------------------ hero

test('Last Stand threshold is 25%, as the design requires', () => {
  assert.equal(ls.healthThreshold, 0.25)
})

test('Last Stand fires at 25% and not before', () => {
  const max = heroes.cory.maxHealth
  assert.equal(atThreshold(max * 0.26, max, ls), false)
  assert.equal(atThreshold(max * 0.25, max, ls), true)
  assert.equal(atThreshold(max * 0.1, max, ls), true)
  assert.equal(atThreshold(0, max, ls), false, 'a downed hero is not transforming')
})

test('Last Stand is once per encounter', () => {
  const max = heroes.cory.maxHealth
  assert.equal(shouldTrigger(max * 0.2, max, ls, false), true)
  assert.equal(shouldTrigger(max * 0.2, max, ls, true), false)
  assert.equal(shouldTrigger(max * 0.05, max, ls, true), false)
})

test('DAD MODE hits harder, swings faster, and defends worse', () => {
  const h = heroes.cory
  assert.ok(outgoingDamage(h.damage, ls, true) > h.damage)
  assert.ok(attackInterval(h.attackInterval, ls, true) < h.attackInterval)
  assert.ok(incomingDamage(10, ls, true) > 10)
  assert.equal(outgoingDamage(h.damage, ls, false), h.damage)
  assert.equal(incomingDamage(10, ls, false), 10)
  assert.equal(ls.hitsAllInRange, true, 'swings wildly at everything in range')
})

test('Cory can be worn down, so Last Stand is reachable', () => {
  const h = heroes.cory
  const worst = enemyList.map(([, e]) => (e.damage / e.attackInterval)).sort((a, b) => b - a)[0]
  const dps = worst * h.blockCapacity
  const seconds = (h.maxHealth * (1 - ls.healthThreshold)) / dps
  assert.ok(seconds > 5 && seconds < 90, `Last Stand would take ${seconds.toFixed(1)}s under a full block`)
  console.log(`   hero: full block of the hardest hitters reaches DAD MODE in ~${seconds.toFixed(0)}s`)
})

// ------------------------------------------------------------------ combat

test('armour is flat reduction with a floor, and can be ignored', () => {
  assert.equal(damageAfterArmor(20, 7, false), 13)
  assert.equal(damageAfterArmor(20, 7, true), 20)
  assert.equal(damageAfterArmor(3, 7, false), 1, 'nothing is ever fully immune')
})

test('support bonus scales damage and stacks', () => {
  assert.equal(boostedDamage(10, 0), 10)
  assert.equal(boostedDamage(10, 0.3), 13)
  assert.ok(boostedDamage(10, 0.6) > boostedDamage(10, 0.3))
})

test('slow reduces speed only while applied', () => {
  assert.equal(slowedSpeed(100, 0.45, true), 45)
  assert.equal(slowedSpeed(100, 0.45, false), 100)
  assert.equal(slowedSpeed(100, 0, true), 100)
})

// ------------------------------------------------------------------ towers

test('there are six towers and every one is distinct', () => {
  assert.equal(towerList.length, 6)
  for (const field of ['range', 'damage', 'fireInterval', 'cost'] as const) {
    const values = towerList.filter(([, t]) => t.archetype !== 'support').map(([, t]) => t[field])
    assert.equal(new Set(values).size, values.length, `two towers share the same ${field}`)
  }
})

test('towers cover the archetypes that matter against ground enemies', () => {
  const kinds = new Set(towerList.map(([, t]) => t.archetype))
  for (const need of ['single-target', 'aoe', 'control', 'support']) {
    assert.ok(kinds.has(need), `no ${need} tower`)
  }
})

test('every tower places instantly at tier 1', () => {
  for (const [id, t] of towerList) assert.equal(t.buildTime, 0, `${id} is not instant`)
})

test('tower roles behave the way their stats claim', () => {
  const byId = Object.fromEntries(towerList)
  assert.ok(byId.rounding.splashRadius > 0 && byId.escalation.splashRadius > 0, 'AOE towers need splash')
  assert.equal(byId.withholding.splashRadius, 0, 'the single-target starter should not splash')
  assert.ok(byId.writeoff.ignoresArmor, 'the anti-armour tower must ignore armour')
  assert.ok(byId.extension.slowFactor > 0 && byId.extension.slowSeconds > 0, 'the control tower must slow')
  assert.ok(byId.shelter.supportRadius > 0 && byId.shelter.supportDamageBonus > 0, 'the support tower must buff')
  assert.equal(byId.shelter.damage, 0, 'a support tower should not also be a gun')
  assert.ok(byId.escalation.range > byId.withholding.range, 'artillery should outrange the starter')
  assert.ok(byId.escalation.fireInterval > byId.withholding.fireInterval, 'artillery should be slower')
})

test('damage per second spread is wide enough for the choice to matter', () => {
  const dps = towerList
    .filter(([, t]) => t.fireInterval > 0)
    .map(([id, t]) => [id, t.damage / t.fireInterval] as [string, number])
  const values = dps.map(([, v]) => v)
  assert.ok(Math.max(...values) / Math.min(...values) > 2, 'all towers deal roughly the same dps')
  console.log('   tower dps: ' + dps.map(([id, v]) => `${id} ${v.toFixed(1)}`).join(', '))
})

// ------------------------------------------------------------------ enemies

test('there are three enemy types covering basic, fast and armoured', () => {
  assert.equal(enemyList.length, 3)
  assert.deepEqual(new Set(enemyList.map(([, e]) => e.role)), new Set(['basic', 'fast', 'armored']))
})

test('each enemy role is actually different', () => {
  const byRole = Object.fromEntries(enemyList.map(([, e]) => [e.role, e]))
  assert.ok(byRole.fast.speed > byRole.basic.speed * 1.5, 'the fast enemy is not fast')
  assert.ok(byRole.armored.armor > 0, 'the armoured enemy has no armour')
  assert.equal(byRole.basic.armor, 0)
  assert.equal(byRole.fast.armor, 0)
  assert.ok(byRole.armored.maxHealth > byRole.basic.maxHealth, 'the armoured enemy is not tougher')
  assert.ok(byRole.armored.speed < byRole.basic.speed, 'the armoured enemy should be slow')
})

test('armour is a real problem for the wrong tower and no problem for the right one', () => {
  const armored = enemyList.find(([, e]) => e.role === 'armored')![1]
  const byId = Object.fromEntries(towerList)
  const chip = damageAfterArmor(byId.rounding.damage, armored.armor, false)
  const pierce = damageAfterArmor(byId.writeoff.damage, armored.armor, true)
  assert.ok(chip < byId.rounding.damage * 0.4, 'armour barely matters against splash')
  assert.equal(pierce, byId.writeoff.damage)
  console.log(`   armour: Rounding Error does ${chip} to Final Notice, Write-Off does ${pierce}`)
})

// ------------------------------------------------------------------ waves

test('there are twelve waves and each is named', () => {
  assert.equal(waves.waves.length, 12)
  const names = waves.waves.map((w: any) => w.name)
  for (const n of names) assert.ok(n && n.length > 0)
  assert.equal(new Set(names).size, names.length, 'two waves share a name')
})

test('waves escalate in total effective health, not just headcount', () => {
  const hp = waves.waves.map((w: any) =>
    w.spawns.reduce((a: number, s: any) => a + s.count * enemies[s.enemy].maxHealth, 0))
  for (let i = 1; i < hp.length; i++) {
    assert.ok(hp[i] > hp[i - 1], `wave ${i + 1} (${hp[i]}hp) is not harder than wave ${i} (${hp[i - 1]}hp)`)
  }
  assert.ok(hp[hp.length - 1] > hp[0] * 8, 'the last wave should dwarf the first')
  console.log('   wave hp: ' + hp.join(', '))
})

test('every wave references a real enemy and introduces types gradually', () => {
  const seen = new Set<string>()
  waves.waves.forEach((w: any, i: number) => {
    for (const s of w.spawns) {
      assert.ok(enemies[s.enemy], `wave ${i + 1} references unknown enemy ${s.enemy}`)
      assert.ok(s.count > 0 && s.interval > 0 && s.delay >= 0)
      seen.add(s.enemy)
    }
  })
  assert.equal(seen.size, 3, 'not every enemy type appears')
  assert.equal(waves.waves[0].spawns.length, 1, 'wave 1 should teach one thing')
})

// ------------------------------------------------------------------ economy

test('the opening buys a real choice but not the whole board', () => {
  const costs = towerList.map(([, t]) => t.cost)
  const cheapest = Math.min(...costs)
  assert.ok(rules.startingGold >= cheapest * 2, 'cannot open with two towers')
  assert.ok(rules.startingGold < cheapest * 5, 'the opening is too rich to be a decision')
})

test('the board grows at a sane rate across the run', () => {
  const avg = towerList.reduce((a, [, t]) => a + t.cost, 0) / towerList.length
  const payout = (i: number) =>
    waves.waves[i].spawns.reduce((a: number, s: any) => a + s.count * enemies[s.enemy].goldReward, 0) +
    rules.goldPerWaveCleared
  const cheapest = Math.min(...towerList.map(([, t]) => t.cost))
  assert.ok(payout(0) + payout(1) >= cheapest, 'waves 1-2 do not fund another tower')
  const total = rules.startingGold + waves.waves.map((_: any, i: number) => payout(i))
    .reduce((a: number, b: number) => a + b, 0)
  const affordable = total / avg
  assert.ok(affordable > 8 && affordable < 30, `run affords ~${affordable.toFixed(1)} towers, which is off`)
  console.log(`   economy: open ${rules.startingGold}g, run total ${total}g (~${affordable.toFixed(1)} towers)`)
})

test('leaking matters but one mistake is not fatal', () => {
  const worst = Math.max(...enemyList.map(([, e]) => e.livesCost))
  assert.ok(rules.startingLives >= worst * 5, 'too few lives for the leak cost')
  assert.ok(rules.startingLives <= 40, 'so many lives that leaks stop mattering')
})

// ------------------------------------------------------------------ art wiring

test('every sprite key referenced by data exists in the art manifest', () => {
  const keys = new Set(Object.keys(art.sprites))
  const referenced: string[] = []
  for (const [, t] of towerList) referenced.push(t.sprite, t.shot)
  for (const [, e] of enemyList) referenced.push(e.sprite)
  referenced.push(heroes.cory.bodySprite, heroes.cory.gunSprite)
  for (const d of map.decorations) referenced.push(d[2] as string)
  for (const k of referenced) assert.ok(keys.has(k), `data references unknown sprite key "${k}"`)
})

test('the art manifest points at real Kenney filenames', () => {
  for (const [key, file] of Object.entries(art.sprites) as [string, string][]) {
    assert.match(file, /^towerDefense_tile\d{3}\.png$/, `${key} -> ${file} is not a pack filename`)
  }
})

test('towers, enemies and the hero all look different from each other', () => {
  const sprites = [
    ...towerList.map(([, t]) => t.sprite),
    ...enemyList.map(([, e]) => e.sprite),
    heroes.cory.bodySprite,
  ]
  assert.equal(new Set(sprites).size, sprites.length, 'two units share a sprite')
})

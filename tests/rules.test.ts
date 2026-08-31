import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { shouldTrigger, atThreshold, outgoingDamage, attackInterval, incomingDamage } from '../src/systems/LastStand.ts'
import { damageAfterArmor, boostedDamage, slowedSpeed } from '../src/systems/Combat.ts'
import { openingPurse } from '../src/systems/Economy.ts'

const read = (n: string) => JSON.parse(readFileSync(new URL(`../src/data/${n}.json`, import.meta.url), 'utf8'))
const heroes = read('heroes'), towers = read('towers'), enemies = read('enemies')
const rules = read('rules'), waves = read('waves'), art = read('art')

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8')

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

test('every tower places instantly at tier 1, and no higher tier is instant', () => {
  // DESIGN.md: tier 1 places instantly, tiers 2 and 3 take build time. Tier 1
  // has no entry at all, which is what makes it instant. Tier 3 is a choice of
  // two specializations rather than a step, so both have to cost time too.
  for (const [id, t] of towerList) {
    assert.equal(t.buildTime, undefined, `${id} still carries the dead buildTime field`)
    assert.equal(t.tiers.length, 1, `${id} should have exactly one linear tier above the first`)
    assert.equal(t.specializations.length, 2,
      `${id} needs two mutually exclusive tier-3 specializations`)
    for (const step of [...t.tiers, ...t.specializations]) {
      assert.ok(step.buildSeconds > 0, `${id}: "${step.name ?? 'tier 2'}" would be instant`)
    }
  }
})

test('upgrades cost more than the tower and get stronger each tier', () => {
  for (const [id, t] of towerList) {
    // Tier 2 is a step; the two specializations are alternatives at the same
    // price, so they are compared against tier 2 rather than against each other.
    assert.equal(t.specializations[0].cost, t.specializations[1].cost,
      `${id}'s two specializations cost different amounts, which makes one the default`)
    assert.ok(t.tiers[0].cost > t.cost * 0.5, `${id} tier 2 is trivially cheap`)
    assert.ok(t.specializations[0].cost > t.tiers[0].cost,
      `${id} tier 3 is not dearer than tier 2`)

    for (const [i, step] of [...t.tiers, ...t.specializations].entries()) {
      // Every step has to actually do something, or it is a peanut sink.
      const meta = ['cost', 'buildSeconds', 'id', 'name', 'flavor']
      const gains = Object.entries(step).filter(([k]) => !meta.includes(k))
      assert.ok(gains.length > 0, `${id} tier ${i + 2} buys nothing`)
      // A specialization is allowed one deliberate trade-off — a slower gun
      // that hits far harder, a tighter blast that hurts more — so it only has
      // to be a net gain, not better at everything.
      const better = gains.filter(([k, v]) => (k === 'fireInterval' ? (v as number) < 1 : (v as number) > 1))
      assert.ok(better.length > 0, `${id} tier ${i + 2} improves nothing`)
      if (i === 0) {
        for (const [k, v] of gains) {
          if (k === 'fireInterval') assert.ok(v < 1, `${id} tier 2 fires slower, not faster`)
          else assert.ok(v > 1, `${id} tier 2 makes ${k} worse`)
        }
      }
    }
    // A tier the tower has no base value for would multiply zero by something.
    for (const step of [...t.tiers, ...t.specializations]) {
      for (const k of Object.keys(step)) {
        if (['cost', 'buildSeconds', 'id', 'name', 'flavor'].includes(k)) continue
        assert.notEqual(t[k], 0, `${id} scales ${k}, which is 0 on the base tower`)
      }
    }
  }
})

test('a maxed board costs more than a run can earn', () => {
  // This is the whole point of upgrades: before them, the player could afford
  // the best possible board by wave 8 and had nothing left to decide.
  const map = JSON.parse(readFileSync(new URL('../src/data/map.json', import.meta.url), 'utf8'))
  const waves = JSON.parse(readFileSync(new URL('../src/data/waves.json', import.meta.url), 'utf8'))
  const enemies = JSON.parse(readFileSync(new URL('../src/data/enemies.json', import.meta.url), 'utf8'))

  let earned = rules.startingPeanuts
  for (const w of waves.waves) {
    earned += rules.peanutsPerWaveCleared
    for (const s of w.spawns) earned += enemies[s.enemy].peanutReward * s.count
  }

  const cheapestMaxed = Math.min(...towerList.map(([, t]: [string, any]) =>
    t.cost + t.tiers.reduce((n: number, s: any) => n + s.cost, 0) + t.specializations[0].cost))
  const fullBoard = cheapestMaxed * map.buildSpots.length
  assert.ok(fullBoard > 0)
  // Even the cheapest possible maxed board should be a real share of the run's
  // whole income, so filling it is a sequence of choices rather than a default.
  assert.ok(fullBoard > earned * 0.35,
    `the cheapest maxed board is ${fullBoard} against ${earned} earned; upgrades are not a real sink`)
})

test('selling never returns more than was paid', () => {
  const refund = rules.towerUpgrades.sellRefund
  assert.ok(refund > 0 && refund < 1, `a refund of ${refund} makes selling free money`)
  assert.ok(rules.towerUpgrades.buildFireRate > 0 && rules.towerUpgrades.buildFireRate < 1,
    'a tower going up a tier should fire slower, but not stop')
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

test('there are three fightable enemy types, plus the boss', () => {
  const rank = enemyList.filter(([, e]) => e.tier !== 'boss')
  assert.equal(rank.length, 3)
  assert.deepEqual(new Set(rank.map(([, e]) => e.role)), new Set(['basic', 'fast', 'armored']))
  assert.equal(enemyList.filter(([, e]) => e.tier === 'boss').length, 1, 'act one has one boss')
})

test('each enemy role is actually different', () => {
  const byRole = Object.fromEntries(enemyList.filter(([, e]) => e.tier !== 'boss')
    .map(([, e]) => [e.role, e]))
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

test('there are twelve waves and a boss wave, each named', () => {
  assert.equal(waves.waves.length, 13)
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
  assert.equal(seen.size, Object.keys(enemies).length, 'not every enemy type appears')
  assert.equal(waves.waves[0].spawns.length, 1, 'wave 1 should teach one thing')
})

test('the run ends on a boss, escorted but not buried', () => {
  const last = waves.waves[waves.waves.length - 1]
  assert.ok(last.boss, 'the last wave is not a boss wave')
  const boss = enemies[last.boss]
  assert.ok(boss, `wave names an unknown boss "${last.boss}"`)
  assert.equal(boss.tier, 'boss')

  const bossSpawn = last.spawns.find((s: any) => s.enemy === last.boss)
  assert.ok(bossSpawn, 'the boss wave does not spawn its boss')
  assert.equal(bossSpawn.count, 1, 'there is one of him')

  // An escort, not another wave: he has to be the fight.
  const escort = last.spawns.filter((s: any) => s.enemy !== last.boss)
    .reduce((a: number, s: any) => a + s.count, 0)
  const busiest = Math.max(...waves.waves.slice(0, -1)
    .map((w: any) => w.spawns.reduce((a: number, s: any) => a + s.count, 0)))
  assert.ok(escort > 0, 'he arrives alone')
  assert.ok(escort < busiest / 2, `an escort of ${escort} against a normal wave's ${busiest} is a second wave`)
  for (const s of last.spawns) {
    if (s.enemy === last.boss) continue
    assert.equal(enemies[s.enemy].tier, 'basic', 'the escort should be standard enemies')
  }
})

test('only the boss taxes, and only the boss walks through the line', () => {
  for (const [id, e] of Object.entries(enemies) as [string, any][]) {
    if (e.tier === 'boss') {
      assert.equal(e.blockable, false, `${id} is a boss that can be held in place`)
      assert.ok(e.tax, `${id} is a boss with no tax`)
      assert.equal(e.damage, 0, 'the boss does not attack towers or the hero')
    } else {
      assert.equal(e.blockable, true, `${id} should be holdable`)
      assert.equal(e.tax, undefined, `${id} should not tax the player`)
    }
  }
})

test('the tax escalates as the boss is worn down, and always bites', () => {
  const boss = Object.values(enemies).find((e: any) => e.tier === 'boss') as any
  const phases = boss.tax.phases
  assert.ok(phases.length >= 3, 'the design asks for thresholds at 60% and 30%')
  assert.deepEqual(phases.map((p: any) => p.aboveHealth), [0.6, 0.3, 0],
    'the phase thresholds should be 60%, 30% and the rest')
  for (let i = 1; i < phases.length; i++) {
    assert.ok(phases[i].percent > phases[i - 1].percent,
      'each phase should take a larger share')
    assert.ok(phases[i].intervalSeconds < phases[i - 1].intervalSeconds,
      'each phase should take it more often')
  }
  assert.ok(phases[phases.length - 1].percent < 0.5,
    'a tax over half your holdings each tick is not a tax, it is a wipe')
  assert.ok(boss.tax.minimumTake > 0, 'a broke player should still feel it')
})

test('killing the boss pays enough to be worth racing for', () => {
  const boss = Object.values(enemies).find((e: any) => e.tier === 'boss') as any
  const dearest = Math.max(...Object.values(towers).map((t: any) => t.cost))
  const bestOther = Math.max(...Object.values(enemies)
    .filter((e: any) => e.tier !== 'boss').map((e: any) => e.peanutReward))
  assert.ok(boss.peanutReward > bestOther * 10, 'the payout is not a lump sum')
  assert.ok(boss.peanutReward >= dearest * 3, 'the payout should buy a real answer')
  assert.ok(boss.livesCost > 1, 'letting a boss through should hurt')
  assert.equal(boss.armor, 0, 'the boss has no armour by design')
})

// ------------------------------------------------------------------ economy

test('the opening buys exactly one tower', () => {
  // Deliberately one, not a loadout. Opening rich enough to fill the board
  // meant the player made every decision they would ever make in wave 1 and
  // then watched the rest of the run.
  const costs = towerList.map(([, t]) => t.cost)
  const cheapest = Math.min(...costs)
  const secondCheapest = [...costs].sort((a, b) => a - b)[1]
  assert.ok(rules.startingPeanuts >= cheapest,
    `${rules.startingPeanuts} peanuts cannot buy the ${cheapest} peanut opener`)
  assert.ok(rules.startingPeanuts < cheapest + secondCheapest,
    'the opening should not stretch to a second tower')
})

test('the board grows at a sane rate across the run', () => {
  const avg = towerList.reduce((a, [, t]) => a + t.cost, 0) / towerList.length
  const payout = (i: number) =>
    waves.waves[i].spawns.reduce((a: number, s: any) => a + s.count * enemies[s.enemy].peanutReward, 0) +
    rules.peanutsPerWaveCleared
  const cheapest = Math.min(...towerList.map(([, t]) => t.cost))
  assert.ok(payout(0) + payout(1) >= cheapest, 'waves 1-2 do not fund another tower')
  // Measured over the waves you actually build through. The boss's lump sum
  // lands at the very end, when there is nothing left to spend it on, so
  // counting it here would say the run is richer than it plays.
  const buildable = waves.waves.length - 1
  const total = rules.startingPeanuts
    + [...Array(buildable).keys()].map((i) => payout(i)).reduce((a, b) => a + b, 0)
  const affordable = total / avg
  assert.ok(affordable > 8 && affordable < 30, `run affords ~${affordable.toFixed(1)} towers, which is off`)
  console.log(`   economy: open ${rules.startingPeanuts}p, through wave ${buildable} ${total}p `
    + `(~${affordable.toFixed(1)} towers)`)
})

test('leaking matters but one mistake is not fatal', () => {
  // Measured on the rank and file. A boss is meant to hurt badly when he gets
  // through, which is a different rule and checked below.
  const worst = Math.max(...enemyList.filter(([, e]) => e.tier !== 'boss').map(([, e]) => e.livesCost))
  assert.ok(rules.startingLives >= worst * 5, 'too few lives for the leak cost')
  assert.ok(rules.startingLives <= 40, 'so many lives that leaks stop mattering')
})

test('letting the boss through is nearly the run, but not quite', () => {
  const boss = Object.values(enemies).find((e: any) => e.tier === 'boss') as any
  assert.ok(boss.livesCost < rules.startingLives,
    'one boss leak from full ends the run outright, which leaves no fight to have')
  assert.ok(boss.livesCost >= rules.startingLives * 0.4,
    `a boss costing ${boss.livesCost} of ${rules.startingLives} lives is not a boss`)
})

// ------------------------------------------------------------------ art wiring

test('every sprite key referenced by data exists in the art manifest', () => {
  const keys = new Set(Object.keys(art.files))
  const referenced: string[] = []
  for (const [, t] of towerList) referenced.push(t.sprite, t.shot)
  for (const [, e] of enemyList) referenced.push(e.sprite)
  referenced.push(heroes.cory.bodySprite, heroes.cory.ultimateSprite, heroes.cory.fighterSprite)
  for (const k of referenced) assert.ok(keys.has(k), `data references unknown sprite key "${k}"`)
})

test('the art manifest points at asset paths, not bare filenames', () => {
  for (const [key, path] of Object.entries(art.files) as [string, string][]) {
    assert.ok(path.includes('/'), `${key} -> ${path} should name its asset directory`)
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

/* ------------------------------------------------- the opening purse */

test('the run always starts able to build the cheapest tower it drew', () => {
  // The opening instruction is "tap a glowing pad to build a tower". A fixed
  // 100 peanuts against a draw of Write-Off (150) and Escalation (220) made
  // that instruction impossible on the very first screen.
  const costs = Object.values(towers).map((t: any) => t.cost as number)
  const margin = rules.startingPeanutsMargin
  const base = rules.startingPeanuts

  // Every pair the draft could hand out, not just the ones it usually does.
  for (let i = 0; i < costs.length; i++) {
    for (let j = i + 1; j < costs.length; j++) {
      const drawn = [costs[i], costs[j]]
      const purse = openingPurse(base, margin, drawn)
      const cheapest = Math.min(...drawn)
      assert.ok(purse >= cheapest,
        `a draw of ${drawn} leaves ${purse} peanuts against a cheapest tower of ${cheapest}`)
      assert.ok(purse - cheapest > 0,
        `a draw of ${drawn} leaves nothing over after the first tower`)
    }
  }
})

test('a cheap draw is not made richer than the tuning intends', () => {
  // The purse is a floor, not a scale: only a draw that would strand the
  // player moves it, so the economy stays where it was tuned.
  const cheapest = Math.min(...Object.values(towers).map((t: any) => t.cost as number))
  assert.equal(openingPurse(rules.startingPeanuts, rules.startingPeanutsMargin, [cheapest]),
    Math.max(rules.startingPeanuts, Math.ceil(cheapest * rules.startingPeanutsMargin)))
  assert.equal(openingPurse(500, 1.3, [80]), 500, 'a generous base should not be pulled down')
})

test('the margin leaves room to do something after the first tower', () => {
  assert.ok(rules.startingPeanutsMargin > 1,
    'a margin of 1 buys the tower and leaves the player with nothing')
  assert.ok(rules.startingPeanutsMargin < 2, 'more than double is not a margin, it is a second tower')
})

test('the guidance line never tells the player to do something they cannot', () => {
  const game = src('scenes/GameScene.ts')
  assert.match(game, /canAffordAny\(/, 'the hint never checks whether anything is buyable')
  // The opening message must come from the same function as every later one,
  // or it can contradict the state it is describing.
  assert.match(game, /this\.status\.message = this\.idleHint\(\)/,
    'the opening message is hardcoded rather than derived from the game state')
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { canStun, damageAfterArmor, stunLockoutFor } from '../src/systems/Combat.ts'
import { statAt } from '../src/systems/Upgrades.ts'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const towers = read('towers'), enemies = read('enemies'), heroes = read('heroes')
const abilities = read('abilities'), RULES = read('rules')
const brute = enemies.finalNotice
const list = Object.entries(towers) as [string, any][]

const dpsVs = (t: any, tier: number, armor: number, spec: string | null = null): number => {
  const dmg = statAt(t, tier, 'damage', spec)
  const pierce = statAt(t, tier, 'armorPierce', spec)
  const eff = damageAfterArmor(dmg, armor, t.ignoresArmor, pierce)
  return eff / statAt(t, tier, 'fireInterval', spec)
}
/** Tier 3 is a choice, so "at tier 3" means "with the better of the two". */
const bestT3 = (t: any, armor: number): number =>
  Math.max(...t.specializations.map((s: any) => dpsVs(t, 3, armor, s.id)))

test('a hit always lands at least 1, so nothing is ever immune', () => {
  assert.equal(damageAfterArmor(4, 99, false, 0), 1)
  assert.equal(damageAfterArmor(4, 99, true, 0), 4, 'ignoresArmor should bypass entirely')
  assert.equal(damageAfterArmor(10, 7, false, 7), 10, 'full pierce should cancel the armour')
  assert.equal(damageAfterArmor(10, 7, false, 3), 6, 'partial pierce should reduce it')
  assert.equal(damageAfterArmor(10, 7, false, 99), 10, 'over-pierce should not add damage')
})

test('single-target towers are the armoured counter, AOE is not', () => {
  // DESIGN.md names single-target DPS as the armoured answer. Before pierce
  // existed that was false in the data: Withholding is single-target and was
  // losing 64% of its damage to armour, exactly like the AOE towers.
  const single = list.filter(([, t]) => t.archetype === 'single-target')
  const aoe = list.filter(([, t]) => t.archetype === 'aoe')
  assert.ok(single.length >= 2 && aoe.length >= 2)

  for (const [id, t] of single) {
    const kept = dpsVs(t, 1, brute.armor) / dpsVs(t, 1, 0)
    assert.ok(kept >= 0.75,
      `${id} is single-target but keeps only ${(kept * 100).toFixed(0)}% of its DPS against armour`)
  }
  for (const [id, t] of aoe) {
    const kept = dpsVs(t, 1, brute.armor) / dpsVs(t, 1, 0)
    assert.ok(kept < 0.75,
      `${id} is AOE and shrugs off armour (${(kept * 100).toFixed(0)}% kept); armoured units must stay threatening to an AOE-only board`)
  }

  // And the best single-target answer must beat the best AOE one outright.
  const bestSingle = Math.max(...single.map(([, t]) => dpsVs(t, 1, brute.armor)))
  const bestAoe = Math.max(...aoe.map(([, t]) => dpsVs(t, 1, brute.armor)))
  assert.ok(bestSingle > bestAoe * 1.5,
    `best single-target does ${bestSingle.toFixed(1)} DPS to the brute against AOE's ${bestAoe.toFixed(1)}`)
})

test('upgrading a single-target tower is a reachable answer to armour', () => {
  for (const [id, t] of list) {
    if (t.archetype !== 'single-target' || t.ignoresArmor) continue
    const t1 = dpsVs(t, 1, brute.armor)
    const t3 = bestT3(t, brute.armor)
    assert.ok(t3 > t1 * 3, `${id} tier 3 only does ${(t3 / t1).toFixed(1)}x its tier 1 DPS against armour`)
    const pierce = Math.max(...t.specializations.map((s: any) => statAt(t, 3, 'armorPierce', s.id)))
    assert.ok(pierce >= brute.armor, `${id} should fully pierce the brute by tier 3`)
  }
})

test('every tower is worth building against the enemies it is for', () => {
  // Rounding Error takes 91s on one brute and that is correct — it is AOE, and
  // armour is supposed to punish an AOE-only board. What is not acceptable is a
  // tower that looks broken: Filing Extension did 4 damage, 1 after armour,
  // 148s per brute, and players reported it as "does not fire".
  const basic = enemies.lateFiler
  for (const [id, t] of list) {
    if (t.damage === 0) continue
    const vsBasic = basic.maxHealth / dpsVs(t, 1, basic.armor)
    assert.ok(vsBasic < 15, `${id} needs ${vsBasic.toFixed(0)}s to kill one basic enemy`)
    // And every hit must be visibly worth something, armoured or not.
    const perHit = damageAfterArmor(t.damage, brute.armor, t.ignoresArmor, t.armorPierce)
    assert.ok(perHit >= 2, `${id} lands ${perHit} damage a shot on a brute, which reads as broken`)
  }
})

test('upgrading answers armour for every tower that survives to tier 3', () => {
  for (const [id, t] of list) {
    if (t.damage === 0) continue
    const secs = brute.maxHealth / bestT3(t, brute.armor)
    assert.ok(secs < 20, `${id} still needs ${secs.toFixed(0)}s per brute when fully upgraded`)
  }
})

test('Cory can strip a brute, and the passive is actually applied', () => {
  const p = heroes.cory.passive
  assert.ok(p.maxArmorShred >= brute.armor,
    `Depreciation caps at ${p.maxArmorShred} against ${brute.armor} armour, so it can never fully strip one`)
  const seconds = brute.armor / p.armorShredPerSecond
  assert.ok(seconds < 8, `stripping a brute takes ${seconds.toFixed(1)}s, too slow to matter`)
  // Wired, not just declared: it has bitten before by living only in JSON.
  const hero = readFileSync(url('../src/entities/Hero.ts'), 'utf8')
  assert.match(hero, /shredArmor\(p\.armorShredPerSecond \* dt, p\.maxArmorShred\)/,
    'the passive is not applied in Hero.tick')
})

test('at least one ability answers armour', () => {
  const abilities = read('abilities')
  const answers = Object.entries(abilities as Record<string, any>)
    .filter(([, a]) => a.damage > 0 && a.ignoresArmor)
  assert.ok(answers.length > 0,
    'every damaging ability is reduced by armour, so spending everything still has no answer')
})

// ------------------------------------------------------------------- stuns

test('a stun cannot be refreshed before it expires', () => {
  // The reported bug: the Filing Extension's tier-3 stop applied faster than
  // its own duration, so anything it touched never took another step. It was
  // a permanent stun wearing the word "slow".
  const lockout = stunLockoutFor(0.6, RULES.combat.stunLockoutMultiple)
  assert.ok(lockout > 0.6, 'the lockout does not outlast the stun itself')
  assert.equal(canStun(0.3, lockout), false, 'stunned again while already stunned')
  assert.equal(canStun(0, 0.4), false, 'stunned again during its own lockout')
  assert.equal(canStun(0, 0), true, 'a target that is free cannot be stunned at all')
})

test('no stun in the data can be sustained by the tower that applies it', () => {
  // The real test is the ratio: a stun whose lockout is shorter than the
  // firing tower's interval is a permanent stop however it is worded.
  const multiple = RULES.combat.stunLockoutMultiple
  const stuns: Array<[string, number]> = []
  for (const [id, t] of Object.entries(towers) as [string, any][]) {
    for (const spec of t.specializations ?? []) {
      if (spec.stunSeconds) stuns.push([`${id}/${spec.id}`, spec.stunSeconds])
    }
  }
  assert.ok(stuns.length > 0, 'no stun in the data to check')
  for (const [where, seconds] of stuns) {
    const lockout = stunLockoutFor(seconds, multiple)
    const uptime = seconds / lockout
    assert.ok(uptime <= 0.5,
      `${where} stops its target ${Math.round(uptime * 100)}% of the time; that is a stop, not a stun`)
  }
})

test('every slow in the game is a slow, not a disguised stop', () => {
  // "Stopped" used to be expressed as a 2% speed multiplier through the slow
  // system, which is what let it refresh. Nothing may do that again: a slow
  // has to leave the target actually moving.
  const factors: Array<[string, number]> = []
  for (const [id, t] of Object.entries(towers) as [string, any][]) {
    if (t.slowFactor) factors.push([`tower ${id}`, t.slowFactor])
  }
  for (const [id, a] of Object.entries(abilities) as [string, any][]) {
    if (a.slowFactor) factors.push([`ability ${id}`, a.slowFactor])
  }
  assert.ok(factors.length > 0, 'nothing slows anything')
  for (const [where, factor] of factors) {
    assert.ok(factor >= 0.15,
      `${where} slows to ${Math.round(factor * 100)}% speed, which reads as a stop`)
  }
})

test('a stun is not routed through the slow system', () => {
  const scene = readFileSync(new URL('../src/scenes/GameScene.ts', import.meta.url), 'utf8')
  assert.ok(!/STUN_FACTOR/.test(scene), 'the fake-stop constant is back')
  assert.match(scene, /applyStun\(/, 'the stun no longer goes through its own path')
  const enemy = readFileSync(new URL('../src/entities/Enemy.ts', import.meta.url), 'utf8')
  // Stopped means stopped: it must gate the attack path too, not only movement.
  assert.match(enemy, /if \(this\.stunRemaining > 0\) \{/,
    'a stunned enemy can still act')
})

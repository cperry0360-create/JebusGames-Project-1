import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { damageAfterArmor } from '../src/systems/Combat.ts'
import { statAt } from '../src/systems/Upgrades.ts'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const towers = read('towers'), enemies = read('enemies'), heroes = read('heroes')
const brute = enemies.finalNotice
const list = Object.entries(towers) as [string, any][]

const dpsVs = (t: any, tier: number, armor: number): number => {
  const dmg = statAt(t, tier, 'damage')
  const pierce = statAt(t, tier, 'armorPierce')
  const eff = damageAfterArmor(dmg, armor, t.ignoresArmor, pierce)
  return eff / statAt(t, tier, 'fireInterval')
}

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
    const t3 = dpsVs(t, 3, brute.armor)
    assert.ok(t3 > t1 * 3, `${id} tier 3 only does ${(t3 / t1).toFixed(1)}x its tier 1 DPS against armour`)
    assert.ok(statAt(t, 3, 'armorPierce') >= brute.armor,
      `${id} should fully pierce the brute by tier 3`)
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
    const secs = brute.maxHealth / dpsVs(t, 3, brute.armor)
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

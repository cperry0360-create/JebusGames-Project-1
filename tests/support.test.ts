import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { auraAt, darkCount, NO_AURA, type AuraSource } from '../src/systems/Support.ts'
import { boostedDamage } from '../src/systems/Combat.ts'
import { statAt } from '../src/systems/Upgrades.ts'
import towers from '../src/data/towers.json' with { type: 'json' }

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const T = towers as Record<string, any>

/** A Beacon standing at the origin, lit, with the numbers off towers.json. */
const beacon = (over: Partial<AuraSource> = {}): AuraSource => ({
  x: 0, y: 0,
  radius: T.shelter.supportRadius,
  damageBonus: T.shelter.supportDamageBonus,
  rangeBonus: 0,
  pierce: 0,
  dark: false,
  ...over,
})

/* ------------------------------------------------------------- the rule */

test('a Beacon lifts what stands inside its radius and nothing outside it', () => {
  const r = T.shelter.supportRadius
  assert.equal(auraAt(r - 1, 0, [beacon()]).damage, T.shelter.supportDamageBonus)
  // Inclusive: a tower exactly on the edge is covered, which is the boundary
  // the scene drew its ring at.
  assert.equal(auraAt(r, 0, [beacon()]).damage, T.shelter.supportDamageBonus)
  assert.equal(auraAt(r + 1, 0, [beacon()]).damage, 0)
  // Distance is real distance, not per-axis: a tower at 45 degrees is further
  // away than either coordinate says.
  assert.equal(auraAt(r * 0.75, r * 0.75, [beacon()]).damage, 0)
})

test('two Beacons covering the same gun stack', () => {
  const gain = auraAt(10, 0, [beacon(), beacon({ x: 20 })])
  assert.equal(gain.damage, T.shelter.supportDamageBonus * 2)
})

test('a Beacon that is switched off lifts nothing', () => {
  // THE REGRESSION. `landDisable` has recomputed support since the Rainbow
  // Reaper shipped, with a comment promising that a disabled Shelter's aura
  // goes dark with it -- and the recompute never asked whether the source was
  // switched off. A boss could take the Beacon out and every gun it covered
  // kept the 30%, or a specialised 90%, as if nothing had happened.
  const dark = beacon({ dark: true })
  assert.deepEqual(auraAt(10, 0, [dark]), NO_AURA)
  // One of two going dark leaves exactly the other one's share.
  const gain = auraAt(10, 0, [dark, beacon({ x: 20 })])
  assert.equal(gain.damage, T.shelter.supportDamageBonus)
  assert.equal(darkCount([dark, beacon({ x: 20 })]), 1)
})

test('the specialized Beacons grant range and pierce, and those go dark too', () => {
  const signal = T.shelter.specializations.find((s: any) => s.id === 'offshore')
  const bonfire = T.shelter.specializations.find((s: any) => s.id === 'loophole')
  const lit = auraAt(10, 0, [
    beacon({ rangeBonus: signal.supportRangeBonus }),
    beacon({ x: 20, pierce: bonfire.grantsPierce }),
  ])
  assert.equal(lit.range, signal.supportRangeBonus)
  assert.equal(lit.pierce, bonfire.grantsPierce)
  const off = auraAt(10, 0, [
    beacon({ rangeBonus: signal.supportRangeBonus, dark: true }),
    beacon({ x: 20, pierce: bonfire.grantsPierce, dark: true }),
  ])
  assert.deepEqual(off, NO_AURA)
})

test('the bonus is worth what the panel says it is', () => {
  // A tier-2 Beacon reads 1.55x its base bonus, and the gun it covers is
  // meant to feel it. Checked against the arithmetic the tower itself uses.
  const at2 = statAt(T.shelter, 2, 'supportDamageBonus', null)
  assert.ok(at2 > T.shelter.supportDamageBonus, 'the tier-2 Beacon lifts no harder than tier 1')
  const gun = T.withholding.damage
  assert.equal(boostedDamage(gun, auraAt(0, 0, [beacon({ damageBonus: at2 })]).damage),
    gun * (1 + at2))
})

/* --------------------------------------------- both call sites, one rule */

test('the scene reads the aura out of Support.ts and asks whether it is dark', () => {
  const game = src('src/scenes/GameScene.ts')
  assert.match(game, /from '\.\.\/systems\/Support\.ts'/,
    'GameScene should not carry its own copy of the aura arithmetic')
  const body = /private refreshSupport\(\): void \{[\s\S]*?\n  \}/.exec(game)
  assert.ok(body, 'refreshSupport is gone')
  assert.match(body[0], /dark: t\.disabledFor > 0/,
    'a switched-off Beacon must be handed to the rule as dark')
  assert.match(body[0], /auraAt\(/, 'the scene computes support some other way')
})

test('the aura comes back with the tower, off the tower rather than off a timer', () => {
  // `landDisable`'s delayed call runs on the wall clock and `disabledFor`
  // counts down on the scaled one, so the two do not land on the same frame.
  // The run loop watches the towers instead, or a Beacon that came back stayed
  // dark until something else happened to change the board.
  const game = src('src/scenes/GameScene.ts')
  assert.match(game, /this\.darkSupports !== this\.towers\.reduce\(/,
    'nothing in the run loop notices a Beacon coming back')
  assert.match(game, /this\.darkSupports = darkCount\(sources\)/,
    'the watch has nothing to compare against')
})

test('the soak models the aura, all three parts of it', () => {
  // The soak scored a board that drew a Beacon as a board with a dead tower on
  // it: no aura, no bonus. Every win rate printed before this understated one.
  const sim = src('tools/soak/Sim.ts')
  assert.match(sim, /from '\.\.\/\.\.\/src\/systems\/Support\.ts'/,
    'the soak should read the same aura rule the game does')
  assert.match(sim, /dark: t\.disabledFor > 0/,
    'the soak must darken a Beacon the Reaper switched off')
  assert.match(sim, /boostedDamage\(statOf\(t, 'damage'\), gain\.damage\)/,
    'the damage bonus is not reaching the shot')
  assert.match(sim, /statOf\(t, 'range'\) \* \(1 \+ gain\.range\)/,
    'the granted range is not reaching the shot')
  assert.match(sim, /statOf\(t, 'armorPierce'\) \+ gain\.pierce/,
    'the granted pierce is not reaching the shot')
})

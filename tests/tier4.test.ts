import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  BASE_TIER, atSpecChoice, isMaxed, maxTier, nextStep, specById, specPoints, statAt,
} from '../src/systems/Upgrades.ts'
import towers from '../src/data/towers.json' with { type: 'json' }

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const T = towers as Record<string, any>
const D = T.imaDummy

/* ------------------------------------------------- the branch is generic */

test('branching upgrades were already generic; this is the first tower at tier 4', () => {
  // The capability did not need adding. `maxTier` is one above the linear
  // steps and `atSpecChoice` fires at the top of them, so a tower with TWO
  // linear tiers gets its mutually exclusive choice at tier 4 with no engine
  // change at all. Every other tower has one linear tier and chooses at 3.
  assert.equal(D.tiers.length, 2)
  assert.equal(maxTier(D), 4, 'the Ima Dummy Tower does not reach tier 4')
  assert.ok(atSpecChoice(D, 3), 'tier 4 is not the branch')
  assert.ok(!atSpecChoice(D, 2), 'tier 3 is a branch when it should be a step')

  for (const [id, def] of Object.entries(T)) {
    if (id === 'imaDummy') continue
    assert.equal(maxTier(def), 3, `${id} moved off tier 3`)
    assert.ok(atSpecChoice(def, 2), `${id}'s branch moved`)
  }
  // And the rule is derived rather than written down anywhere as a 3.
  const up = src('src/systems/Upgrades.ts')
  assert.match(up, /BASE_TIER \+ def\.tiers\.length \+ \(def\.specializations\.length > 0 \? 1 : 0\)/,
    'the top tier is no longer derived from the number of linear steps')
})

test('the choice is offered once, and taking one locks the other out', () => {
  // Walked as the scene walks it: at the branch there is no single next step,
  // so the caller asks for a specialization; once one is taken the tower is
  // maxed and nothing offers the other.
  assert.equal(nextStep(D, 3), null, 'the branch offers a linear step as well')
  assert.ok(!isMaxed(D, 3), 'the tower is finished before its branch')

  for (const spec of D.specializations) {
    assert.ok(isMaxed(D, maxTier(D)), 'a chosen tower still has an upgrade')
    assert.equal(nextStep(D, maxTier(D)), null,
      `after ${spec.id} the tower still offers a step`)
    assert.equal(atSpecChoice(D, maxTier(D)), false,
      `after ${spec.id} the branch is offered again`)
  }

  // The two are alternatives at one price, so neither is the default.
  assert.equal(D.specializations[0].cost, D.specializations[1].cost)
  assert.equal(D.specializations.length, 2)
  // And a tower carries ONE spec id, which is what makes it exclusive: there
  // is nowhere to record a second.
  const tower = src('src/entities/Tower.ts')
  assert.match(tower, /spec: string \| null/, 'a tower can hold more than one branch')
})

test('both options are visible, with their effects stated, before either is bought', () => {
  // A choice locked for the run has to be readable in the panel that offers
  // it rather than discovered afterwards.
  for (const spec of D.specializations) {
    const points = specPoints(spec)
    assert.ok(points.length >= 1, `${spec.id} explains nothing`)
    for (const p of points) {
      assert.ok(p.length <= 52, `${spec.id}: "${p}" is too long for a card line`)
    }
  }
  const rage = specPoints(specById(D, 'rage')!).join(' ')
  assert.match(rage, /35% health/, 'Rage does not say when it triggers')
  assert.match(rage, /\+60% damage/, 'Rage does not say how much more it hits for')
  assert.match(rage, /20% faster/, 'Rage does not say how much faster it swings')
  const friend = specPoints(specById(D, 'friend')!).join(' ')
  assert.match(friend, /third lad/, 'Need a Pal does not say what it adds')
  assert.match(friend, /rally point/, 'Need a Pal does not say they share the rally point')
})

/* ------------------------------------------------------------------- Rage */

test('Rage triggers at the threshold, not before, and lasts the life', () => {
  const spec = specById(D, 'rage')!
  const BELOW = spec.rageBelowHealth as number
  assert.equal(BELOW, 0.35)

  const lad = { maxHealth: 300, health: 300, enraged: false }
  const step = (): void => {
    // The scene's own order: the state is entered BEFORE the swing, so the
    // blow that takes a lad under the line is not itself enraged.
    if (!lad.enraged && lad.health > 0 && lad.health / lad.maxHealth < BELOW) lad.enraged = true
  }

  // Down to exactly the threshold: not yet. "Below 35%" is below.
  lad.health = lad.maxHealth * BELOW
  step()
  assert.equal(lad.enraged, false, 'Rage triggered AT the threshold rather than below it')

  lad.health = lad.maxHealth * BELOW - 1
  step()
  assert.equal(lad.enraged, true, 'Rage did not trigger below the threshold')

  // Healed back over the line without dying: still raging. It lasts the LIFE.
  lad.health = lad.maxHealth
  step()
  assert.equal(lad.enraged, true, 'Rage wore off without the lad dying')
})

test('Rage is worth 60% more damage and a quarter off the interval', () => {
  const spec = specById(D, 'rage')!
  assert.equal(spec.rageDamage, 1.6)
  // "25 percent faster" is the interval times 0.8: 1 / 0.8 = 1.25 swings for
  // every one before, which is what a player means by a quarter faster.
  assert.equal(spec.rageInterval, 0.8)
  assert.ok(Math.abs(1 / (spec.rageInterval as number) - 1.25) < 1e-9)

  const base = statAt(D, 4, 'soldierDamage' as never, 'rage')
  const interval = statAt(D, 4, 'soldierInterval' as never, 'rage')
  const calm = base / interval
  const raging = (base * (spec.rageDamage as number)) / (interval * (spec.rageInterval as number))
  assert.ok(Math.abs(raging / calm - 2) < 0.01,
    `Rage is worth ${(raging / calm).toFixed(2)}x, not the 2x its two numbers multiply to`)
})

test('Rage clears when the lad respawns at full health', () => {
  const lad = { maxHealth: 300, health: 0, enraged: true, respawnIn: 0 }
  lad.respawnIn = 10
  for (let i = 0; i < 120; i++) {
    if (lad.respawnIn <= 0) break
    lad.respawnIn -= 0.1
    if (lad.respawnIn <= 0) {
      lad.health = lad.maxHealth
      lad.enraged = false
    }
  }
  assert.equal(lad.enraged, false, 'Rage survived a respawn')
  assert.equal(lad.health, lad.maxHealth)

  // Both halves of the game agree, each where its respawn lives: the scene's
  // is on the entity, in Soldier.revive; the soak's is in its own tick.
  const soldier = src('src/entities/Soldier.ts')
  const revive = soldier.slice(soldier.indexOf('private revive()'))
  assert.match(revive.slice(0, 400), /this\.enraged = false/,
    'a revived soldier keeps the Rage it died with')
  assert.match(src('tools/soak/Sim.ts'), /sd\.enraged = false/, 'the soak never clears Rage')
  const scene = src('src/scenes/GameScene.ts')
  assert.match(scene, /!s\.enraged && s\.health > 0 && s\.health \/ s\.maxHealth < rage\.below/,
    'the scene does not enter Rage below the threshold, once')
})

/* --------------------------------------------------------- Need a Friend? */

test('Need a Pal fields three lads on the one rally point', () => {
  assert.equal(statAt(D, 3, 'soldierCount' as never), 2)
  assert.equal(statAt(D, 4, 'soldierCount' as never, 'friend'), 3, 'the third lad never arrives')
  assert.equal(statAt(D, 4, 'soldierCount' as never, 'rage'), 2,
    'Rage quietly adds a soldier too, so the branch is not a choice')

  // ONE rally point for all three: the scene stations them from the single
  // spot rather than giving the third its own.
  const scene = src('src/scenes/GameScene.ts')
  assert.match(scene, /soldierStations\(this\.lanes, g\.rally, want\)/,
    'the lads do not share one rally point')
  const rally = src('src/systems/Rally.ts')
  assert.match(rally, /export function soldierStations\(/)
  assert.match(rally, /spot\.laneDistance \+ offset/,
    'the extra lad is not placed along the lane from the same point')
})

test('the third lad arrives when the branch finishes, not at the next wave', () => {
  // `manGarrison` is called on every tier change, so the garrison grows the
  // moment the work completes rather than waiting for a respawn or a wave.
  const scene = src('src/scenes/GameScene.ts')
  assert.match(scene, /if \(g\.soldiers\.length !== g\.tower\.soldierCount\) this\.manGarrison\(g\)/,
    'the scene never notices the garrison should be bigger')
  const sim = src('tools/soak/Sim.ts')
  assert.match(sim, /if \(t\.soldiers\.length > 0\) manGarrison\(t\)/,
    'the soak does not re-man a garrison after an upgrade')
})

test('each lad respawns on its own timer', () => {
  // Three lads killed ten seconds apart come back ten seconds apart: the
  // countdown is per soldier, not per tower.
  const lads = [0, 1, 2].map((i) => ({ i, health: 90, respawnIn: 0, backAt: -1 }))
  const RESPAWN = D.soldierRespawn
  for (let step = 1; step <= 600; step++) {
    const now = step * 0.1
    for (const l of lads) {
      if (Math.abs(now - (l.i + 1) * 5) < 1e-9) l.health = 0
      if (l.respawnIn > 0) {
        l.respawnIn -= 0.1
        if (l.respawnIn <= 0) { l.respawnIn = 0; l.health = 90; if (l.backAt < 0) l.backAt = now }
        continue
      }
      if (l.health <= 0) l.respawnIn = RESPAWN
    }
  }
  const backs = lads.map((l) => Number(l.backAt.toFixed(1)))
  for (const [i, at] of backs.entries()) {
    assert.ok(at > 0, `lad ${i} never came back`)
    assert.ok(Math.abs(at - ((i + 1) * 5 + RESPAWN + 0.2)) < 0.3,
      `lad ${i} came back at ${at}s, not ${RESPAWN}s after it fell`)
  }
  assert.equal(new Set(backs).size, 3, 'the lads all came back at the same moment')

  // And the state that carries it is on the soldier, not the tower.
  const soldier = src('src/entities/Soldier.ts')
  assert.match(soldier, /respawnIn = 0/, 'the respawn timer is not on the soldier')
})

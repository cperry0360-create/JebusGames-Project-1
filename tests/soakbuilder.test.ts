// THE SIMULATED PLAYER'S ROLE RULES.
//
// `tools/soak/Sim.ts` chose what to build with `rng.pick(affordable)` -- a
// uniform pick over everything it could afford, with no concept of what a
// tower is FOR. Nothing could see the consequence, because a win rate cannot
// tell you that a third of the board went on towers that do not shoot: the
// Ima Dummy Tower became a guaranteed opener, the simulated player started
// spending about one pad in three on a zero-damage tower from wave 1, and
// seven of ten levels "got harder" with no level left in the 35-45% band.
// That was the instrument, not the game. See
// reports/2026-09-16-dummy-tower-guaranteed.md and
// reports/2026-09-17-soak-builder.md.
//
// THIS FILE IS SLOWER THAN EVERY OTHER TEST HERE AND THAT IS UNAVOIDABLE: the
// invariant is a property of a run, so it has to run runs. Four seeds a level
// is the budget -- enough that every board and every mode is exercised, and
// the sweep that established these assertions used twelve and found the same
// answers.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { simulate, type SoakMode } from '../tools/soak/Sim.ts'
import { LEVELS, loadLevel } from '../src/systems/Levels.ts'

const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'))
const towers = read('../src/data/towers.json')
const builder = read('../tools/soak/builder.json')

const dealsDamage = (id: string): boolean => (towers[id]?.damage ?? 0) > 0
/** The four the soak driver rotates, minus `nobuild`, which builds nothing. */
const MODES: SoakMode[] = ['normal', 'normal', 'supportonly', 'noabilities']
const SEEDS = [1, 2, 3, 4]

test('the zero-damage cap derives from pad count, not from a fixed number', () => {
  // A FIXED NUMBER WOULD BE THE SAME CAP on level 1's seven pads and level 7's
  // twenty-two, which are not the same board. The share and the floor are both
  // in tools/soak/builder.json and NOT under src/data/ -- a knob that changes
  // what the soak measures is not a balance number, and one found under
  // src/data/ would reasonably be read as a game rule and tuned against.
  const { padShare, min } = builder.zeroDamage
  assert.ok(padShare > 0 && padShare < 1, `padShare ${padShare} is not a share`)
  assert.ok(min >= 1, 'a cap of zero would ban the role outright')
  const seen: Record<string, number> = {}
  for (const l of LEVELS) {
    const pads = loadLevel(l.id).map.buildSpots.length
    const want = Math.max(min, Math.floor(pads * padShare))
    const got = simulate(1, 'normal', l.id).builder
    assert.equal(got.pads, pads, `${l.id} reports ${got.pads} pads against ${pads}`)
    assert.equal(got.zeroDamageCap, want,
      `${l.id}: ${pads} pads should cap at ${want}, got ${got.zeroDamageCap}`)
    seen[l.id] = got.zeroDamageCap
  }
  // And the caps really do differ by board, which is the whole point of
  // deriving them: a share that produced one number everywhere would pass
  // every assertion above and still be a fixed number in disguise.
  assert.ok(new Set(Object.values(seen)).size > 1,
    `every level capped at the same number: ${JSON.stringify(seen)}`)
  console.log('   caps by level: ' + Object.entries(seen).map(([k, v]) => `${k}=${v}`).join(' '))
})

test('the simulated player never fills more than the cap with zero-damage towers', () => {
  // THE ASSERTION THIS FILE EXISTS FOR.
  let runs = 0
  for (const l of LEVELS) {
    for (const [i, seed] of SEEDS.entries()) {
      const mode = MODES[i % MODES.length]!
      if (mode === 'supportonly') continue
      const b = simulate(seed, mode, l.id).builder
      runs += 1
      assert.ok(b.zeroDamageBuilt <= b.zeroDamageCap,
        `${l.id} seed ${seed} (${mode}): ${b.zeroDamageBuilt} zero-damage towers `
        + `on ${b.pads} pads, cap ${b.zeroDamageCap}`)
    }
  }
  assert.ok(runs > 0, 'the sweep ran nothing, so it proved nothing')
  console.log(`   ${runs} runs, no board over its cap`)
})

test('a blocker is never upgraded while a gun is below its top tier', () => {
  // THE THIRD ROLE RULE, AND THE SECOND ASSERTION THIS FILE EXISTS FOR.
  //
  // The cap above bounds the PADS. It does not bound the PEANUTS: the upgrade
  // loop in `spend` used to walk every tower the board owned and tier it, a
  // zero-damage tower included, so the simulated player kept pouring peanuts
  // into a blocker while its guns sat at tier one. Level 6 capped its pads at
  // a fifth and still sent 29.5% of its tower peanuts through towers that can
  // never fire. See reports/2026-09-17-soak-builder-spend.md.
  //
  // `zeroDamageUpgradesWhileGunBelowTop` is re-derived from the board at the
  // moment the peanuts leave -- a different expression at a different time
  // than the rule's own flag -- so this fails if the `continue` is dropped,
  // and it fails on the run rather than on the source text.
  let runs = 0
  let upgrades = 0
  for (const l of LEVELS) {
    for (const [i, seed] of SEEDS.entries()) {
      const mode = MODES[i % MODES.length]!
      // `supportonly` IS EXEMPT from this rule for the same reason it is
      // exempt from the cap, and it is skipped here rather than asserted on:
      // its pool is the Beacon, so no tower on that board shoots and the rule
      // has nothing to order. The next test is the one that holds the
      // exemption.
      if (mode === 'supportonly') continue
      const b = simulate(seed, mode, l.id).builder
      runs += 1
      upgrades += b.zeroDamageUpgrades
      assert.equal(b.zeroDamageUpgradesWhileGunBelowTop, 0,
        `${l.id} seed ${seed}: ${b.zeroDamageUpgradesWhileGunBelowTop} upgrade(s) bought `
        + 'for a tower that does not shoot while a tower that does was below its top tier')
    }
  }
  assert.ok(runs > 0, 'the sweep ran nothing, so it proved nothing')
  // AND THE RULE IS ABOUT THE ORDER, NOT THE TOTAL. A long, rich board maxes
  // every gun it owns, the rule lifts, and a blocker is the only thing left to
  // buy -- which is what a person does too. Level 10 buys about five of those
  // a run. If this ever reads zero across the whole sweep the rule has stopped
  // lifting and has become a ban, which is a different rule than the one
  // builder.json describes.
  assert.ok(upgrades > 0,
    'no zero-damage tower was upgraded on any board, so the rule is a ban rather '
    + 'than an ordering: a board with every gun maxed should still buy one')
  console.log(`   ${runs} runs, 0 out-of-order upgrades, ${upgrades} bought once the guns were maxed`)
})

test('supportonly is exempt from the cap, or the mode would be nobuild', () => {
  // ITS WHOLE POOL IS THE BEACON, which deals no damage -- so a cap applied
  // here would turn the deliberately-broken player into `nobuild` and silently
  // delete the mode whose job is to show where a board cannot kill anything.
  // This fails if a future simplification applies the cap everywhere.
  let overCap = 0
  for (const l of LEVELS) {
    const b = simulate(3, 'supportonly', l.id).builder
    if (b.zeroDamageBuilt > b.zeroDamageCap) overCap += 1
  }
  assert.ok(overCap > 0,
    'no supportonly board exceeded the cap, so the mode is being capped and builds nothing')
  console.log(`   supportonly exceeded its cap on ${overCap} of ${LEVELS.length} boards, as it must`)
})

test('the board gets a gun before it gets anything else', () => {
  for (const l of LEVELS) {
    for (const seed of SEEDS) {
      const b = simulate(seed, 'normal', l.id).builder
      if (b.firstBuilt === null) continue
      assert.ok(dealsDamage(b.firstBuilt),
        `${l.id} seed ${seed} opened with ${b.firstBuilt}, which deals no damage`)
    }
  }
})

test('past the three rules the pick is still uniform, not a strategy', () => {
  // THE RANDOM PICK IS THE POINT. A builder that placed towers WELL would
  // flatter whatever tuning it happened to suit and stop being a neutral
  // instrument, so the rules must only ever REMOVE behaviour no player would
  // exhibit. If this collapses to one tower, somebody has written an AI.
  //
  // IT MEASURES THREE, AND IT MEASURED THREE BEFORE THE THIRD RULE TOO --
  // checked on the commit below this one, because a rule that touches the
  // upgrade loop shifts every later draw and could have narrowed the opening
  // without anybody noticing. (reports/2026-09-17-soak-builder.md says four;
  // that figure was already stale when it was written.) Three is the floor
  // this asserts, so the next session to see it fall has a real narrowing.
  const first = new Set<string>()
  const built = new Set<string>()
  for (const l of LEVELS) {
    for (const seed of SEEDS) {
      const r = simulate(seed, 'normal', l.id)
      if (r.builder.firstBuilt) first.add(r.builder.firstBuilt)
      for (const id of r.firedTowers) built.add(id)
    }
  }
  assert.ok(first.size >= 3,
    `only ${first.size} distinct opening tower(s) across every level and seed: ${[...first]}`)
  console.log(`   ${first.size} distinct first builds, ${built.size} distinct towers fired`)
})

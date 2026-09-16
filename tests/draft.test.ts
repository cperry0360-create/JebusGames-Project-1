import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  draftOpeningTowers, guaranteedOpeners, openingTowerCount, reserveTowers,
  unlockedTowerCount, draftAbilities, makeRng,
} from '../src/systems/Draft.ts'
import { towerWeightsFor } from '../src/systems/Levels.ts'
import { Cooldowns } from '../src/systems/Cooldowns.ts'

const read = (n: string) => JSON.parse(readFileSync(new URL(`../src/data/${n}.json`, import.meta.url), 'utf8'))
const towers = read('towers'), draft = read('draft'), abilities = read('abilities'), waves = read('waves')

const pool = Object.entries(towers).map(([id, t]: [string, any]) => ({
  id, weight: draft.towerWeights[id], archetype: t.archetype,
}))

const GUARANTEED: string[] = draft.guaranteedTowers ?? []
/** The whole opening hand: the drawn cards plus a slot per guaranteed tower. */
const OPENING = draft.towersAtStart + GUARANTEED.length

test('every tower has a draw weight and every weight names a real tower', () => {
  // A weight may be the shared pool's or a single level's, and no level adds
  // one today -- the Ima Dummy Tower's level-1-only entry was what made it
  // unreachable everywhere else. A tower nothing can draw is a tower nobody
  // will see, so every id still has to have a weight somewhere.
  const levels = read('levels').levels
  const extras: Record<string, number> = {}
  for (const l of levels) Object.assign(extras, l.extraTowerWeights ?? {})
  const everyWeight = { ...draft.towerWeights, ...extras }
  for (const id of Object.keys(towers)) {
    assert.ok(everyWeight[id] > 0, `${id} has no draw weight in draft.json or on any level`)
  }
  for (const id of Object.keys(everyWeight)) {
    assert.ok(towers[id], `weight refers to unknown tower ${id}`)
  }
})

test('the opening hand always covers a damage option and an answer', () => {
  const isDamage = (id: string) => draft.damageArchetypes.includes(towers[id].archetype)
  const isAnswer = (id: string) => draft.answerArchetypes.includes(towers[id].archetype)
  for (let seed = 1; seed <= 3000; seed++) {
    const hand = draftOpeningTowers(pool, draft, makeRng(seed))
    assert.equal(hand.length, OPENING, `seed ${seed} drew ${hand.length}`)
    assert.equal(new Set(hand).size, hand.length, `seed ${seed} drew a duplicate`)
    assert.ok(hand.some(isDamage), `seed ${seed} opened with no damage: ${hand}`)
    assert.ok(hand.some(isAnswer), `seed ${seed} opened with no AOE or control: ${hand}`)
  }
})

test('the DRAWN half of the hand covers damage and an answer by itself', () => {
  // THE FINDING THIS EXISTS FOR. `imaDummy` is archetype `control`, which is
  // an answer archetype -- so once it is guaranteed, a repair rule that looked
  // at the whole hand would find an answer every single time and never fire.
  // Measured over 3000 seeds: 1127 of them draw a pair with neither AOE nor
  // control and would have kept it, and hands with no AOE at all go from 1197
  // to 1872. So the guarantee is cut out of the pool before the draw and the
  // rule judges the drawn cards alone.
  const isDamage = (id: string) => draft.damageArchetypes.includes(towers[id].archetype)
  const isAnswer = (id: string) => draft.answerArchetypes.includes(towers[id].archetype)
  for (let seed = 1; seed <= 3000; seed++) {
    const drawn = draftOpeningTowers(pool, draft, makeRng(seed)).slice(0, draft.towersAtStart)
    assert.equal(drawn.length, draft.towersAtStart)
    for (const id of drawn) {
      assert.ok(!GUARANTEED.includes(id), `seed ${seed}: a guaranteed tower took a drawn slot`)
    }
    assert.ok(drawn.some(isDamage), `seed ${seed} drew no damage: ${drawn}`)
    assert.ok(drawn.some(isAnswer), `seed ${seed} drew no AOE or control: ${drawn}`)
  }
})

test('the guarantee is an extra slot: the drawn pair is what it always was', () => {
  // The alternative considered and rejected was raising `towersAtStart` to 3
  // and guaranteeing the dummy as one of the three, which would have made
  // every run open with the dummy and exactly ONE other tower of six. This is
  // the property that says the draft survived: on every seed, the drawn cards
  // are the same cards, in the same order, that the six-tower draft dealt.
  const unguarded = { ...draft, guaranteedTowers: [] }
  const drawablePool = pool.filter((w) => !GUARANTEED.includes(w.id))
  for (let seed = 1; seed <= 2000; seed++) {
    const drawn = draftOpeningTowers(pool, draft, makeRng(seed)).slice(0, draft.towersAtStart)
    assert.deepEqual(drawn, draftOpeningTowers(drawablePool, unguarded, makeRng(seed)),
      `seed ${seed}: the guarantee changed the draw`)
  }
})

test('the guaranteed tower is in the opening hand on every level, once', () => {
  assert.deepEqual(GUARANTEED, ['imaDummy'], 'the guarantee is the Ima Dummy Tower')
  const levels = read('levels').levels.map((l: any) => l.id)
  assert.equal(levels.length, 10, 'every level id is covered')
  for (const levelId of levels) {
    // THE LEVEL'S OWN POOL, built exactly as LoadoutScene and the soak build
    // it -- a guarantee that only holds for the shared pool is a guarantee
    // that a level could quietly opt out of.
    const weights = towerWeightsFor(levelId, draft.towerWeights)
    const levelPool = Object.entries(towers)
      .filter(([id]) => weights[id] !== undefined)
      .map(([id, t]: [string, any]) => ({ id, weight: weights[id], archetype: t.archetype }))
    assert.equal(openingTowerCount(levelPool, draft), OPENING, levelId)
    assert.deepEqual(guaranteedOpeners(levelPool, draft).map((w) => w.id), GUARANTEED, levelId)
    for (let seed = 1; seed <= 400; seed++) {
      const hand = draftOpeningTowers(levelPool, draft, makeRng(seed))
      assert.equal(hand.length, OPENING, `${levelId} seed ${seed} dealt ${hand.length}`)
      assert.equal(new Set(hand).size, hand.length, `${levelId} seed ${seed} dealt a duplicate`)
      for (const id of GUARANTEED) {
        assert.ok(hand.includes(id), `${levelId} seed ${seed} opened without ${id}: ${hand}`)
        assert.equal(hand.filter((h) => h === id).length, 1,
          `${levelId} seed ${seed} dealt ${id} twice`)
      }
    }
  }
})

test('a reroll still deals the guaranteed tower', () => {
  // LoadoutScene.reroll redeals with `seed + dealNumber * 7919` through the
  // same `deal`, so a reroll is a different seed and nothing else. If the
  // guarantee were in the caller rather than in `draftOpeningTowers` this is
  // the path that would lose it.
  const REROLL_STRIDE = 7919
  for (let seed = 1; seed <= 1000; seed++) {
    for (let deal = 1; deal <= 3; deal++) {
      const hand = draftOpeningTowers(pool, draft, makeRng(seed + deal * REROLL_STRIDE))
      assert.equal(hand.length, OPENING)
      for (const id of GUARANTEED) {
        assert.ok(hand.includes(id), `reroll ${deal} of seed ${seed} lost ${id}: ${hand}`)
      }
    }
  }
  const loadout = readFileSync(new URL('../src/scenes/LoadoutScene.ts', import.meta.url), 'utf8')
  assert.match(loadout, new RegExp(`dealNumber \\* ${REROLL_STRIDE}`),
    'the reroll stride moved; this test is redealing the wrong seeds')
})

test('the guaranteed tower is never offered again as a mid-run unlock', () => {
  for (let seed = 1; seed <= 1000; seed++) {
    const hand = draftOpeningTowers(pool, draft, makeRng(seed))
    const rest = reserveTowers(pool, hand, makeRng(seed + 7))
    for (const id of GUARANTEED) {
      assert.ok(!rest.includes(id), `seed ${seed} put ${id} back in the reserve`)
    }
    assert.equal(hand.length + rest.length, pool.length)
  }
})

test('the opening hand is varied, not the same two every run', () => {
  const seen = new Set<string>()
  for (let seed = 1; seed <= 500; seed++) {
    seen.add([...draftOpeningTowers(pool, draft, makeRng(seed))].sort().join('+'))
  }
  assert.ok(seen.size >= 5, `only ${seen.size} distinct opening hands`)
  console.log(`   draft: ${seen.size} distinct opening hands across 500 seeds`)
})

test('weights actually bias the draw', () => {
  const counts: Record<string, number> = {}
  for (let seed = 1; seed <= 4000; seed++) {
    for (const id of draftOpeningTowers(pool, draft, makeRng(seed))) counts[id] = (counts[id] ?? 0) + 1
  }
  // withholding is weighted 5, escalation 2, and both are legal openers.
  assert.ok(counts.withholding > counts.escalation,
    `weighting had no effect: withholding ${counts.withholding} vs escalation ${counts.escalation}`)
  console.log('   draw counts: ' + Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', '))
})

test('the same seed always draws the same hand', () => {
  for (const seed of [1, 42, 999]) {
    assert.deepEqual(draftOpeningTowers(pool, draft, makeRng(seed)), draftOpeningTowers(pool, draft, makeRng(seed)))
  }
})

test('the reserve holds everything not in the opening hand, without repeats', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const hand = draftOpeningTowers(pool, draft, makeRng(seed))
    const rest = reserveTowers(pool, hand, makeRng(seed + 7))
    assert.equal(new Set(rest).size, rest.length)
    for (const id of rest) assert.ok(!hand.includes(id), 'reserve repeats an opening tower')
    assert.equal(hand.length + rest.length, pool.length)
  }
})

test('towers unlock after the waves the design names, and stop at the cap', () => {
  assert.deepEqual(draft.unlockAfterWave, [4, 8])
  const g = GUARANTEED.length
  assert.equal(unlockedTowerCount(draft, 0), 2 + g)
  assert.equal(unlockedTowerCount(draft, 3), 2 + g)
  assert.equal(unlockedTowerCount(draft, 4), 3 + g, 'a tower should arrive after wave 4')
  assert.equal(unlockedTowerCount(draft, 7), 3 + g)
  assert.equal(unlockedTowerCount(draft, 8), 4 + g, 'a tower should arrive after wave 8')
  assert.equal(unlockedTowerCount(draft, 12), 4 + g, 'the cap is 4 drawn types')
  assert.equal(draft.unlockedTypeCap, 4)
})

test('the guaranteed tower does not cost the player a later unlock', () => {
  // THE FAILURE THIS GUARDS. `unlockedTypeCap` is 4. Counted against it, three
  // openers plus the wave-4 unlock would hit the cap at wave 4 and the wave-8
  // unlock would never arrive -- a change meant to hand the player a tower
  // taking one away eight waves later, silently. So the cap governs the DRAWN
  // types and a guaranteed slot sits outside it, at the ceiling exactly as it
  // does at the opening.
  const unguarded = { ...draft, guaranteedTowers: [] }
  const last = draft.unlockAfterWave[draft.unlockAfterWave.length - 1]
  for (const wave of [0, ...draft.unlockAfterWave, last + 1, 99]) {
    assert.equal(unlockedTowerCount(draft, wave),
      unlockedTowerCount(unguarded, wave) + GUARANTEED.length,
      `wave ${wave}: the guarantee changed how many DRAWN towers are unlocked`)
  }
  // And every unlock still lands: the reserve has to be able to pay for them.
  const hand = draftOpeningTowers(pool, draft, makeRng(1))
  const rest = reserveTowers(pool, hand, makeRng(8))
  assert.ok(rest.length >= unlockedTowerCount(draft, 99) - hand.length,
    'the reserve is too short to deliver every unlock')
})

test('every unlock lands before the run ends', () => {
  for (const w of draft.unlockAfterWave) {
    assert.ok(w < waves.waves.length, `unlock after wave ${w} never happens in a ${waves.waves.length}-wave run`)
  }
})

/** Exactly what the loadout screen offers: everything flagged draftable. */
const draftPool = (): string[] =>
  Object.entries(abilities).filter(([, a]: [string, any]) => a.draftable).map(([id]) => id)

test('the ability draft draws the right number without repeats', () => {
  // The pool is the draftable abilities, not every ability that exists: the
  // rare drop lives in the same file and must never be dealt at run start.
  const ids = draftPool()
  assert.equal(ids.length, 6, 'the pool should hold six draftable actives')
  for (let seed = 1; seed <= 1000; seed++) {
    const drawn = draftAbilities(ids, draft.abilitiesDrawn, makeRng(seed))
    assert.equal(drawn.length, draft.abilitiesDrawn)
    assert.equal(new Set(drawn).size, drawn.length, `seed ${seed} drew a duplicate ability`)
    for (const id of drawn) assert.ok(abilities[id], `drew unknown ability ${id}`)
  }
})

test('the rare drop can never be dealt at run start', () => {
  const rare = Object.entries(abilities).filter(([, a]: [string, any]) => !a.draftable).map(([id]) => id)
  assert.ok(rare.length > 0, 'no rare ability exists to check')
  const pool = draftPool()
  for (let seed = 1; seed <= 2000; seed++) {
    for (const id of draftAbilities(pool, draft.abilitiesDrawn, makeRng(seed))) {
      assert.ok(!rare.includes(id), `seed ${seed} dealt the rare ability ${id}`)
    }
  }
})

test('every ability in the pool can actually be drawn', () => {
  const ids = draftPool()
  const seen = new Set<string>()
  for (let seed = 1; seed <= 600; seed++) for (const id of draftAbilities(ids, 2, makeRng(seed))) seen.add(id)
  assert.equal(seen.size, ids.length, `only ${seen.size} of ${ids.length} abilities ever appear`)
})

test('cooldowns count down, gate casting, and report progress', () => {
  const cd = new Cooldowns()
  cd.register('molotov', 10)
  assert.equal(cd.ready('molotov'), true)
  assert.equal(cd.progress('molotov'), 1)
  cd.start('molotov')
  assert.equal(cd.ready('molotov'), false)
  assert.equal(cd.progress('molotov'), 0)
  cd.tick(5)
  assert.equal(cd.secondsLeft('molotov'), 5)
  assert.equal(cd.progress('molotov'), 0.5)
  cd.tick(5)
  assert.equal(cd.ready('molotov'), true)
  cd.tick(100)
  assert.equal(cd.secondsLeft('molotov'), 0, 'cooldown should not go negative')
})

test('unknown ability ids are never castable by accident', () => {
  const cd = new Cooldowns()
  assert.equal(cd.ready('nope'), true, 'unregistered reads as ready')
  cd.start('nope')
  assert.equal(cd.secondsLeft('nope'), 0, 'but starting one costs nothing, so it cannot block')
})

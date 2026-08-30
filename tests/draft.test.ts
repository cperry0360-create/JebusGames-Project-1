import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  draftOpeningTowers, reserveTowers, unlockedTowerCount, draftAbilities, makeRng,
} from '../src/systems/Draft.ts'
import { Cooldowns } from '../src/systems/Cooldowns.ts'

const read = (n: string) => JSON.parse(readFileSync(new URL(`../src/data/${n}.json`, import.meta.url), 'utf8'))
const towers = read('towers'), draft = read('draft'), abilities = read('abilities'), waves = read('waves')

const pool = Object.entries(towers).map(([id, t]: [string, any]) => ({
  id, weight: draft.towerWeights[id], archetype: t.archetype,
}))

test('every tower has a draw weight and every weight names a real tower', () => {
  for (const id of Object.keys(towers)) {
    assert.ok(draft.towerWeights[id] > 0, `${id} has no draw weight`)
  }
  for (const id of Object.keys(draft.towerWeights)) {
    assert.ok(towers[id], `weight refers to unknown tower ${id}`)
  }
})

test('the opening hand always covers a damage option and an answer', () => {
  const isDamage = (id: string) => draft.damageArchetypes.includes(towers[id].archetype)
  const isAnswer = (id: string) => draft.answerArchetypes.includes(towers[id].archetype)
  for (let seed = 1; seed <= 3000; seed++) {
    const hand = draftOpeningTowers(pool, draft, makeRng(seed))
    assert.equal(hand.length, draft.towersAtStart, `seed ${seed} drew ${hand.length}`)
    assert.equal(new Set(hand).size, hand.length, `seed ${seed} drew a duplicate`)
    assert.ok(hand.some(isDamage), `seed ${seed} opened with no damage: ${hand}`)
    assert.ok(hand.some(isAnswer), `seed ${seed} opened with no AOE or control: ${hand}`)
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
  assert.equal(unlockedTowerCount(draft, 0), 2)
  assert.equal(unlockedTowerCount(draft, 3), 2)
  assert.equal(unlockedTowerCount(draft, 4), 3, 'the 3rd tower should arrive after wave 4')
  assert.equal(unlockedTowerCount(draft, 7), 3)
  assert.equal(unlockedTowerCount(draft, 8), 4, 'the 4th tower should arrive after wave 8')
  assert.equal(unlockedTowerCount(draft, 12), 4, 'the cap is 4')
  assert.equal(draft.towerCap, 4)
})

test('every unlock lands before the run ends', () => {
  for (const w of draft.unlockAfterWave) {
    assert.ok(w < waves.waves.length, `unlock after wave ${w} never happens in a ${waves.waves.length}-wave run`)
  }
})

test('the ability draft draws the right number without repeats', () => {
  const ids = Object.keys(abilities)
  assert.equal(ids.length, 6, 'the pool should hold six actives')
  for (let seed = 1; seed <= 1000; seed++) {
    const drawn = draftAbilities(ids, draft.abilitiesDrawn, makeRng(seed))
    assert.equal(drawn.length, draft.abilitiesDrawn)
    assert.equal(new Set(drawn).size, drawn.length, `seed ${seed} drew a duplicate ability`)
    for (const id of drawn) assert.ok(abilities[id], `drew unknown ability ${id}`)
  }
})

test('every ability in the pool can actually be drawn', () => {
  const ids = Object.keys(abilities)
  const seen = new Set<string>()
  for (let seed = 1; seed <= 600; seed++) for (const id of draftAbilities(ids, 2, makeRng(seed))) seen.add(id)
  assert.equal(seen.size, ids.length, `only ${seen.size} of ${ids.length} abilities ever appear`)
})

test('cooldowns count down, gate casting, and report progress', () => {
  const cd = new Cooldowns()
  cd.register('explosion', 10)
  assert.equal(cd.ready('explosion'), true)
  assert.equal(cd.progress('explosion'), 1)
  cd.start('explosion')
  assert.equal(cd.ready('explosion'), false)
  assert.equal(cd.progress('explosion'), 0)
  cd.tick(5)
  assert.equal(cd.secondsLeft('explosion'), 5)
  assert.equal(cd.progress('explosion'), 0.5)
  cd.tick(5)
  assert.equal(cd.ready('explosion'), true)
  cd.tick(100)
  assert.equal(cd.secondsLeft('explosion'), 0, 'cooldown should not go negative')
})

test('unknown ability ids are never castable by accident', () => {
  const cd = new Cooldowns()
  assert.equal(cd.ready('nope'), true, 'unregistered reads as ready')
  cd.start('nope')
  assert.equal(cd.secondsLeft('nope'), 0, 'but starting one costs nothing, so it cannot block')
})

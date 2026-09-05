import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  LIMITS, buttonLabel, dpsOf, shotsPerSecond, statsFor, statsThatFit, withChanges,
} from '../src/systems/TowerCard.ts'
import type { TowerDef } from '../src/types.ts'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')

const TOWERS = read('towers') as Record<string, TowerDef>

/* ------------------------------------------------------- the schema, in CI */

/*
 * A LIMIT THAT LIVES ONLY IN A DOCUMENT GETS VIOLATED BY THE FOURTH TOWER.
 *
 * The ledger card is fixed-height and none of its strings wrap, which is only
 * true while every string is short enough. These fail on the FIRST string over
 * its limit and name it, rather than reporting a count.
 */

test('every tower name is within its limit', () => {
  for (const [id, def] of Object.entries(TOWERS)) {
    assert.ok(def.name.length <= LIMITS.name,
      `${id}: name "${def.name}" is ${def.name.length}, limit ${LIMITS.name}`)
    for (const spec of def.specializations) {
      assert.ok(spec.name.length <= LIMITS.name,
        `${id}/${spec.id}: name "${spec.name}" is ${spec.name.length}, limit ${LIMITS.name}`)
    }
  }
})

test('every trait phrase exists and is within its limit', () => {
  for (const [id, def] of Object.entries(TOWERS)) {
    assert.equal(typeof def.trait, 'string', `${id}: no trait phrase`)
    assert.ok(def.trait.length > 0, `${id}: empty trait phrase`)
    assert.ok(def.trait.length <= LIMITS.trait,
      `${id}: trait "${def.trait}" is ${def.trait.length}, limit ${LIMITS.trait}`)
    for (const spec of def.specializations) {
      assert.equal(typeof spec.trait, 'string', `${id}/${spec.id}: no trait phrase`)
      assert.ok(spec.trait.length > 0, `${id}/${spec.id}: empty trait phrase`)
      assert.ok(spec.trait.length <= LIMITS.trait,
        `${id}/${spec.id}: trait "${spec.trait}" is ${spec.trait.length}, limit ${LIMITS.trait}`)
    }
  }
})

test('a trait phrase is one line: no newline, no wrap point it must break at', () => {
  const all = Object.values(TOWERS).flatMap(
    (d) => [d.trait, ...d.specializations.map((s) => s.trait)])
  assert.equal(all.length, 21, 'twenty-one phrases: seven towers, two branches each')
  for (const t of all) {
    assert.doesNotMatch(t, /\n/, `"${t}" carries a newline`)
    assert.equal(t.trim(), t, `"${t}" has padding that will look like a layout fault`)
  }
})

test('every stat label is within its limit, at every tier and branch', () => {
  for (const def of Object.values(TOWERS)) {
    for (const tier of [1, 2]) {
      for (const spec of [null, ...def.specializations]) {
        for (const s of statsFor(def, tier, spec)) {
          assert.ok(s.label.length <= LIMITS.statLabel,
            `${def.name}: label "${s.label}" is ${s.label.length}, limit ${LIMITS.statLabel}`)
        }
      }
    }
  }
})

test('every button verb is within its limit', () => {
  // The verbs the scene actually passes. Read from the source rather than
  // listed here, so a seventh one cannot be added without being measured.
  const game = src('scenes/GameScene.ts')
  const verbs = [...game.matchAll(/confirmLabel: '([A-Za-z]+)'/g)].map((m) => m[1] as string)
  assert.ok(verbs.length >= 4, `only found ${verbs.length} confirm labels`)
  for (const v of verbs) {
    assert.ok(v.length <= LIMITS.buttonVerb,
      `verb "${v}" is ${v.length}, limit ${LIMITS.buttonVerb}`)
  }
})

/* ------------------------------------------------------------ the numbers */

test('dps is damage times shots per second, rounded', () => {
  // Slingshot: 11 damage every 0.65s = 16.9 -> 17.
  assert.equal(dpsOf(11, 0.65), 17)
  // Grinder: 44 every 1.7s = 25.9 -> 26.
  assert.equal(dpsOf(44, 1.7), 26)
  // A tower that does not shoot has no dps and does not divide by zero.
  assert.equal(dpsOf(0, 0), 0)
  assert.equal(shotsPerSecond(0), 0)
})

test('the derivation changes no balance number', () => {
  // dps is DISPLAY only. If this ever fails, damage or fireInterval was edited
  // under cover of a presentation change.
  assert.equal(TOWERS.withholding!.damage, 11)
  assert.equal(TOWERS.withholding!.fireInterval, 0.65)
  assert.equal(TOWERS.writeoff!.damage, 44)
  assert.equal(TOWERS.writeoff!.fireInterval, 1.7)
  assert.equal(TOWERS.withholding!.cost, 80)
  assert.equal(TOWERS.escalation!.specializations[0]!.cost, 880)
})

test('a gun reports three numbers and a support tower reports two', () => {
  const gun = statsFor(TOWERS.withholding!, 1, null)
  assert.deepEqual(gun.map((s) => s.label), ['dps', 'range', 'rate'])
  assert.equal(gun[0]!.value, '17')
  assert.equal(gun[1]!.value, '150')
  assert.equal(gun[2]!.value, '1.5')

  // Beacon's damage, range and fireInterval are all literally 0, so the gun's
  // three slots would read "0 0 0". It reports what it does instead.
  const support = statsFor(TOWERS.shelter!, 1, null)
  assert.deepEqual(support.map((s) => s.label), ['boost', 'range'])
  assert.equal(support[0]!.value, '+30%')
  assert.equal(support[1]!.value, '215')
})

test('no gun reports a zero for all three numbers', () => {
  for (const def of Object.values(TOWERS)) {
    if (def.supportRadius > 0) continue
    const stats = statsFor(def, 1, null)
    assert.ok(stats.some((s) => s.value !== '0'), `${def.name} reports nothing`)
  }
})

test('a rate is one decimal at most, and never a trailing zero', () => {
  for (const def of Object.values(TOWERS)) {
    for (const tier of [1, 2]) {
      for (const spec of [null, ...def.specializations]) {
        for (const s of statsFor(def, tier, spec)) {
          assert.doesNotMatch(s.value, /\.\d\d/, `${def.name} ${s.label}: "${s.value}"`)
          assert.doesNotMatch(s.value, /\.0$/, `${def.name} ${s.label}: "${s.value}"`)
        }
      }
    }
  }
})

/* ------------------------------------------------------- the upgrade state */

test('an upgrade marks only the numbers that change', () => {
  const def = TOWERS.withholding!
  const now = statsFor(def, 1, null)
  const next = statsFor(def, 2, null)
  const marked = withChanges(now, next)
  // Tier 2 multiplies damage, range and fireInterval, so all three move.
  for (const s of marked) assert.ok(s.next, `${s.label} should carry a new value`)
  assert.equal(marked[0]!.value, '17')
  assert.notEqual(marked[0]!.next, '17')
})

test('a number that does not change renders plain', () => {
  const a = [{ label: 'dps', value: '17' }, { label: 'range', value: '150' }]
  const b = [{ label: 'dps', value: '31' }, { label: 'range', value: '150' }]
  const marked = withChanges(a, b)
  assert.equal(marked[0]!.next, '31')
  assert.equal(marked[1]!.next, undefined, 'an unchanged number must not be marked')
})

test('the two stat shapes are matched by label, never by position', () => {
  // A support tower's [boost, range] against a gun's [dps, range, rate] must
  // not compare boost with dps.
  const support = [{ label: 'boost', value: '+30%' }, { label: 'range', value: '215' }]
  const gun = [{ label: 'dps', value: '17' }, { label: 'range', value: '150' },
    { label: 'rate', value: '1.5' }]
  const marked = withChanges(support, gun)
  assert.equal(marked[0]!.next, undefined, 'boost was compared against dps')
  assert.equal(marked[1]!.next, '150')
})

/* ------------------------------------------------------------- the button */

test('the verb and the price are one control', () => {
  assert.equal(buttonLabel('Build', 80), 'Build 80p')
  assert.equal(buttonLabel('Upgrade', 320), 'Upgrade 320p')
  // A refund is SIGNED. "45p" and "+45p" mean opposite things to a peanut
  // count, and this is the last thing read before it happens.
  assert.equal(buttonLabel('Sell', 45, true), 'Sell +45p')
  // Free actions carry no number rather than a bare zero.
  assert.equal(buttonLabel('Move', 0), 'Move')
})

/* -------------------------------------------------------- the narrow case */

test('the narrow card drops rate and keeps dps and range', () => {
  const stats = statsFor(TOWERS.withholding!, 1, null)
  const narrow = statsThatFit(stats, 150 - 22, 50)
  assert.deepEqual(narrow.map((s) => s.label), ['dps', 'range'])
})

test('the wide card keeps all three', () => {
  const stats = statsFor(TOWERS.withholding!, 1, null)
  assert.deepEqual(statsThatFit(stats, 226 - 22, 50).map((s) => s.label),
    ['dps', 'range', 'rate'])
})

test('one number always survives, however narrow', () => {
  const stats = statsFor(TOWERS.withholding!, 1, null)
  assert.equal(statsThatFit(stats, 1, 50).length, 1)
  assert.equal(statsThatFit(stats, 0, 50).length, 1)
})

/* ---------------------------------------------------- the prose is deleted */

test('there is no description on the card, and no ladder protecting one', () => {
  const ring = src('ui/TowerRing.ts')
  // The FIELD, not the word: the class comment still explains what the panel
  // used to be, and deleting that history would be the wrong kind of tidy.
  assert.doesNotMatch(ring, /description:/, 'the description field is back')
  assert.doesNotMatch(ring, /option\.description/, 'something still reads a description')
  assert.doesNotMatch(src('scenes/GameScene.ts'), /description: `/,
    'the scene still composes a description for the card')
  // The four levers existed to save a paragraph. With the paragraph gone they
  // are a height search over a card whose height is arithmetic.
  assert.doesNotMatch(ring, /bodyMinSize/, 'the body-size ladder is back')
  assert.doesNotMatch(ring, /rowMinHeight/, 'the row-height ladder is back')
  assert.doesNotMatch(ring, /titleMinSize/, 'the title-size ladder is back')
  assert.doesNotMatch(ring, /withDescription/, 'the drop-the-prose step is back')
  const P = read('presentation')
  for (const k of ['bodyMinSize', 'rowMinHeight', 'titleMinSize']) {
    assert.equal(P.ring[k], undefined, `presentation.json still carries ${k}`)
  }
})

test('the cost row is gone: the price is on the button', () => {
  const ring = src('ui/TowerRing.ts')
  assert.doesNotMatch(ring, /'Returns'/, 'the separate refund row is back')
  assert.doesNotMatch(ring, /label: option\.price/, 'the separate cost row is back')
  assert.match(ring, /buttonLabel\(/, 'the button does not carry the price')
})

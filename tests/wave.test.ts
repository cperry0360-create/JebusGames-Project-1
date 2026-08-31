import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { waveOutcome } from '../src/systems/Wave.ts'

const url = (p: string) => new URL(p, import.meta.url)
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')

test('a wave is cleared only when every enemy in it died', () => {
  assert.equal(waveOutcome(0, false).cleared, true)
  assert.equal(waveOutcome(1, false).cleared, false)
  assert.equal(waveOutcome(9, false).cleared, false)
})

test('a wave with escapes still ends, so the board cannot hang', () => {
  // The field is empty and nothing is left to spawn. Refusing to end the wave
  // there would leave the player staring at a board with nothing on it.
  for (const escaped of [0, 1, 5]) {
    assert.equal(waveOutcome(escaped, false).runEnds, null,
      'a mid-run wave should not end the run either way')
  }
})

test('the run cannot be won on a wave something walked out of', () => {
  // The bug: the boss reaching the exit removed him from the field exactly
  // like dying did, the wave "cleared", and the run was won with the boss
  // alive and gone. Measured before the fix: 20 lives -> 10, wave 12 -> 13,
  // phase "won".
  assert.equal(waveOutcome(0, true).runEnds, 'won')
  assert.equal(waveOutcome(1, true).runEnds, 'lost')
  assert.equal(waveOutcome(1, true).cleared, false)
})

test('the scene asks the rule rather than counting bodies on the field', () => {
  const game = src('scenes/GameScene.ts')
  const over = /private checkWaveOver\([\s\S]*?\n  \}/.exec(game)
  assert.ok(over, 'checkWaveOver is gone')
  assert.match(over[0], /waveOutcome\(escaped, last\)/,
    'the wave-end rule has been inlined again')
  // The clear bonus is a reward for clearing.
  assert.match(over[0], /if \(cleared\) \{[\s\S]{0,120}peanutsPerWaveCleared/,
    'a wave that leaked still pays the clear bonus')
  // And an escape has to be counted where it happens.
  const leak = /private leak\([\s\S]*?\n  \}/.exec(game)
  assert.ok(leak, 'leak is gone')
  assert.match(leak[0], /escapedThisWave\+\+/, 'escapes are charged for but not counted')
  assert.match(leak[0], /lives -= enemy\.def\.livesCost/, 'an escape no longer costs lives')
  // Reset per wave, or one leak would poison every wave after it.
  const start = /startWave\(\): void \{[\s\S]*?\n  \}/.exec(game)
  assert.ok(start && /escapedThisWave = 0/.test(start[0]),
    'the escape count is never reset, so one leak taints the rest of the run')
})

test('a boss reaching the exit costs several lives', () => {
  const enemies = JSON.parse(src('data/enemies.json')) as Record<string, {
    tier?: string; livesCost: number
  }>
  const rules = JSON.parse(src('data/rules.json')) as { startingLives: number }
  const bosses = Object.values(enemies).filter((e) => e.tier === 'boss')
  assert.ok(bosses.length > 0, 'there is no boss')
  for (const b of bosses) {
    assert.ok(b.livesCost >= 5,
      `a boss reaching the exit costs ${b.livesCost} lives; that is not "heavily"`)
    assert.ok(b.livesCost < rules.startingLives,
      'a boss escape is an instant loss, which hides the rule rather than teaching it')
  }
  // And trash has to cost less than a boss, or the boss is not special.
  const trash = Object.values(enemies).filter((e) => e.tier !== 'boss')
  for (const t of trash) {
    assert.ok(t.livesCost < Math.min(...bosses.map((b) => b.livesCost)),
      'a trash escape costs as much as the boss escaping')
  }
})

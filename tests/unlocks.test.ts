import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const url = (p: string) => new URL(p, import.meta.url)
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')

/**
 * The Server Nuke is the reward for finishing the game once.
 *
 * It was arriving on first-ever runs because the unlock never existed: the
 * "once per run" guard was there, the "only after you have cleared one" guard
 * was not, and nothing in the save file recorded whether a run had been won.
 */

test('the nuke is gated on having cleared a run, not just on the once-a-run rule', () => {
  const game = src('scenes/GameScene.ts')
  const roll = game.slice(game.indexOf('private rollRareDrop'))
  const body = roll.slice(0, roll.indexOf('\n  private ', 10))
  assert.match(body, /hasClearedARun\(\)/, 'the drop does not check whether a run was ever cleared')
  assert.match(body, /nukeUsed/, 'the once-per-run guard is gone')
  assert.match(body, /dropFromTiers/, 'the drop is no longer limited to elites and bosses')

  // And the gate has to be the first thing, so a first-time player cannot roll
  // at all rather than rolling and being filtered later.
  assert.ok(body.indexOf('hasClearedARun') < body.indexOf('Math.random'),
    'the run is rolled before the unlock is checked')
})

test('clearing a run is what records the unlock', () => {
  const game = src('scenes/GameScene.ts')
  assert.match(game, /if \(won\) recordRunCleared\(\)/, 'winning never records anything')
  const save = src('systems/Save.ts')
  assert.match(save, /runsCleared/, 'the save has nowhere to remember a cleared run')
  assert.match(save, /export function hasClearedARun/, 'nothing exposes the unlock')
  assert.match(save, /export function recordRunCleared/, 'nothing records a clear')
})

test('a partial save cannot resurrect or lose the unlock', () => {
  const save = src('systems/Save.ts')
  // Everything read back has to be validated: a hand-edited or half-written
  // file should not unlock the nuke, and should not throw either.
  assert.match(save, /function count\(/, 'runsCleared is read back unvalidated')
  assert.match(save, /Number\.isFinite/, 'a non-numeric runsCleared would pass straight through')
  assert.match(save, /catch/, 'the save must never throw; localStorage is not always there')
})

test('saving a setting does not wipe the unlock', () => {
  // Audio owns volume and mute and writes the whole save object. Writing only
  // its own two fields would drop runsCleared on the first volume change.
  const audio = src('systems/Audio.ts')
  // Matched across the whole CALL, not one line: a writer that names four
  // fields is a multi-line call, and a line-by-line check reads its first line
  // as a bare `writeSave({` and fails a writer that is perfectly correct.
  const calls = audio.match(/writeSave\(\{[\s\S]*?\n  \}\)/g) ?? []
  assert.ok(calls.length > 0, 'Audio no longer writes the save; this test is checking nothing')
  for (const call of calls) {
    assert.match(call, /\.\.\.loadSave\(\)/,
      'a writeSave in Audio.ts replaces the whole save and would drop every field it does not name')
  }
})

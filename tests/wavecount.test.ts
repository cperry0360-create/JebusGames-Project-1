import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const url = (p: string) => new URL(p, import.meta.url)
const src = (p: string): string => readFileSync(url(`../src/${p}`), 'utf8')

/**
 * THE WAVE COUNT IS DRAWN IN ONE PLACE, AND THIS IS THE FILE THAT SAYS SO.
 *
 * On 2026-09-17 the HUD showed it twice: `2/13` on a readout in the top-left
 * stack and `▶ 2/13 +20` on the start button in the top-right corner. Neither
 * change was wrong. The readout belonged with peanuts and lives, where a player
 * already looks for the run's state; the button had to name the wave it was
 * about to start. They were made separately, days apart, and nobody joined them
 * up -- so the screen carried the same number in both corners and the board
 * carried a 132x44 plate it did not need.
 *
 * That is not a bug any assertion in this repository could have caught, because
 * each half was individually correct. So the assertion is the JOIN: one place,
 * and a second one fails here rather than in a playtest.
 *
 * WHAT COUNTS AS "ON THE HUD": a string the HUD scene puts on the glass during
 * a run. The crash reporter's state block and the end-of-run banner's "Waves
 * survived" row both carry the same number and are neither -- one is never
 * drawn at all and the other is a dialog over a finished run. They are
 * allow-listed BY NAME below, so a third use in GameScene has to come back here
 * and say which it is.
 */

/** Code only: a comment that mentions the count is not a second copy of it. */
function code(file: string): string[] {
  return src(file)
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
}

test('the HUD draws the wave count in exactly one place', () => {
  const lines = code('scenes/HudScene.ts')
  const hits = lines
    .map((l, i) => [i, l] as const)
    .filter(([, l]) => /waveCount/.test(l))
  assert.ok(hits.length > 0, 'the HUD no longer draws the wave count at all')

  // Every one of them is inside `drawWaveControl`, which is the whole claim.
  // The method's extent is found by its own signature and the next one at the
  // same indentation, so this cannot drift with the file's length.
  const body = lines.join('\n')
  const start = body.indexOf('  private drawWaveControl(')
  assert.ok(start > 0, 'HudScene has no drawWaveControl; the control was renamed or removed')
  const end = body.indexOf('\n  private ', start + 1)
  const method = body.slice(start, end === -1 ? undefined : end)
  const inside = (method.match(/waveCount/g) ?? []).length
  const total = (body.match(/waveCount/g) ?? []).length
  assert.equal(inside, total,
    `the HUD mentions the wave count ${total} times and ${inside} of them are in ` +
    'drawWaveControl; a second place to draw it is how the count ended up in both corners')
})

test('the wave is not a readout in the top-left stack', () => {
  // The other half of the same fault, from the other end: the count came back
  // as a THIRD pill beside peanuts and lives while the control still carried
  // it. A readout may shrink to 16px because nothing taps it; the thing that
  // starts the wave may not, so of the two copies this is the one that goes.
  const hud = src('scenes/HudScene.ts')
  const list = /const READOUTS = \[([^\]]*)\]/.exec(hud)
  assert.ok(list, 'HudScene no longer declares which readouts it builds')
  const names = [...list[1]!.matchAll(/'([a-z]+)'/g)].map((m) => m[1]!)
  assert.deepEqual(names, ['peanuts', 'lives'],
    `the top-left stack is ${names.join(', ')}; the wave is the CONTROL under it, not a readout`)
  // And nothing builds a pill for it by hand either.
  assert.doesNotMatch(hud, /wavePill/,
    'the wave pill is back; it and the wave control would both draw the count')
})

test('GameScene carries the count only where it is not on the glass', () => {
  /*
   * The five lines that may mention it, and what each one is. Anything else
   * fails, because the question this file exists to ask -- is it drawn twice?
   * -- cannot be answered from a grep that has never been read.
   */
  const ALLOWED: Array<[RegExp, string]> = [
    [/^\s*waveCount: number$/, 'the status field itself'],
    [/waveCount: 0,/, 'the zeroed status at scene construction'],
    [/this\.status\.waveCount = this\.level\.waveTable\.waves\.length/, 'the level setting it'],
    [/wave: `\$\{this\.status\.wave \+ 1\}\/\$\{this\.status\.waveCount\}`/,
      'the crash reporter\'s state block, which is never drawn'],
    [/label: 'Waves survived'/,
      'the end-of-run banner, which is a dialog over a finished run rather than the HUD'],
  ]
  for (const line of code('scenes/GameScene.ts')) {
    if (!/waveCount/.test(line)) continue
    assert.ok(ALLOWED.some(([re]) => re.test(line)),
      `GameScene has a new use of the wave count:\n    ${line.trim()}\n` +
      'If it is drawn on the HUD during a run, it is a second copy of the wave ' +
      'control\'s label. If it is not, add it to this list and say what it is.')
  }
})

test('every state of the wave control names the wave', () => {
  /*
   * ONE PLACE IS ONLY ENOUGH IF THAT PLACE ALWAYS SAYS IT. The mid-wave label
   * read `18 LEFT` while the count was a readout in the stack above, and
   * keeping it would have taken the wave number off the screen for the whole of
   * every wave -- which is the same fault as drawing it twice, arrived at from
   * the other direction.
   *
   * The four states, and the one plate they share:
   *   ready, clock running   `▶ 2/13 +20`
   *   ready, no clock        `▶ 1/13`
   *   wave running           `2/13 · 18`
   *   run over               `CLEARED` / `OVERRUN`
   */
  const hud = src('scenes/HudScene.ts')
  const start = hud.indexOf('  private drawWaveControl(')
  const method = hud.slice(start, hud.indexOf('\n  /**', start + 1))
  const labels = [...method.matchAll(/setLabel\(([^\n]*)\)$/gm)].map((m) => m[1]!)
  assert.equal(labels.length, 3, `drawWaveControl sets ${labels.length} labels, not three`)
  // The two live states both carry `n/waveCount`; the third is the run's end,
  // where the count is the banner's job and the plate is a verdict.
  const live = labels.filter((l) => /waveCount/.test(l))
  assert.equal(live.length, 2,
    'a live state of the wave control no longer names the wave, so the count is off ' +
    'the screen while it is in that state')
  assert.ok(/CLEARED/.test(labels[2]!) && /OVERRUN/.test(labels[2]!),
    'the run-over state is not the verdict pair')
  // AND NOT AN EMPTY PLATE WHEN THERE IS NO BONUS. Wave 1 and a resumed wave 1
  // carry no countdown, so `bonus` is 0 and the label falls to its other arm --
  // which has to be the count, not a blank and not `+0`.
  assert.match(method, /bonus > 0 \? `▶ \$\{n\}\/\$\{s\.waveCount\} \+\$\{bonus\}` : `▶ \$\{n\}\/\$\{s\.waveCount\}`/,
    'the no-bonus arm of the ready label is not the bare wave count')
})

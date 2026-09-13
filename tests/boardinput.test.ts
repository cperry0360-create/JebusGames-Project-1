/**
 * EVERY REGISTERED LEVEL MUST BE ABLE TO TAKE A TOWER ON ITS FIRST PAD.
 *
 * WHY THIS FILE EXISTS. Level 8 shipped a board that answered no tap at all --
 * no tower, no special, no hero order -- and nothing in `tests/` could have
 * caught it, because nothing in `tests/` can see a scene (CLAUDE.md, "the test
 * suite cannot see Phaser at all"). The check that CAN is
 * `tools/harness/run.sh boardinput`, which drives real pointer events at every
 * registered level in turn. This file is the half of that a node run can hold:
 * the data every one of those placements rests on, and the promise that the
 * harness scenario still covers every level rather than a hand-written few.
 *
 * The cause that time was not in the data -- see
 * reports/2026-09-13-level-8-soft-lock.md -- which is exactly why both halves
 * are here: a pad off the plate and a modal flag left set both end with a
 * player tapping a node and nothing happening.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BuildSystem } from '../src/systems/BuildSystem.ts'
import { LEVELS, loadLevel } from '../src/systems/Levels.ts'
import display from '../src/data/display.json' with { type: 'json' }

const W = (display as { width: number }).width
const H = (display as { height: number }).height

test('every registered level has a first pad a tap can land on', () => {
  assert.ok(LEVELS.length > 0, 'levels.json registered no levels at all')
  for (const row of LEVELS) {
    const map = loadLevel(row.id).map
    const spots = map.buildSpots
    assert.ok(spots.length > 0, `${row.id} has no build pads; there is nowhere to put a tower`)
    const first = spots[0]!
    const build = new BuildSystem(spots, map.spotRadius)

    // The tap that opens the build ring resolves through `spotAt`, so the
    // first pad has to be the thing a tap on its own centre finds.
    const hit = build.spotAt(first[0]!, first[1]!)
    assert.ok(hit, `${row.id}: a tap on the centre of pad 0 resolves to no pad`)
    assert.equal(hit.index, 0, `${row.id}: a tap on pad 0's centre resolves to pad ${hit.index}`)
    assert.ok(build.isFree(0), `${row.id}: pad 0 is not free on a fresh board`)

    // And the whole of its tap target has to be on the plate. A pad whose
    // centre is inside the world but whose radius runs off the edge cannot be
    // aimed at reliably: the camera is clamped to the plate, so the part of
    // the target past the frame is not reachable at any zoom.
    const r = map.spotRadius
    assert.ok(first[0]! - r >= 0 && first[0]! + r <= W && first[1]! - r >= 0 && first[1]! + r <= H,
      `${row.id}: pad 0 at ${first[0]},${first[1]} has a ${r}px tap target that runs off `
      + `the ${W}x${H} plate`)
  }
})

test('the boardinput harness scenario still covers every registered level', () => {
  // It takes an optional list of level ids so one level can be driven on its
  // own. The DEFAULT is what matters: a scenario narrowed to the level someone
  // was debugging is a scenario that stops guarding the other nine.
  const src = readFileSync(new URL('../tools/harness/index.html', import.meta.url), 'utf8')
  const at = src.indexOf("if (scenario === 'boardinput')")
  assert.ok(at >= 0, 'the boardinput scenario is gone from the harness')
  const body = src.slice(at, at + 20000)
  assert.match(body, /:\s*LVB\.LEVELS\.map\(\(l\) => l\.id\)/,
    'boardinput no longer defaults to every row in levels.json')
  // The three actions go together on purpose: they share one `pointerup`, so a
  // scenario that dropped two of them would still pass on a dead board.
  for (const needle of [
    'no tower could be placed on pad',
    'no special could be cast from real taps',
    'could not be selected and ordered from real taps',
  ]) {
    assert.ok(body.includes(needle), `boardinput no longer checks: ${needle}`)
  }
})

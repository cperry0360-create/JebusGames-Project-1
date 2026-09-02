import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const url = (p: string) => new URL(p, import.meta.url)

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(url(dir), { withFileTypes: true })) {
    if (e.isDirectory()) sourceFiles(`${dir}/${e.name}`, out)
    else if (e.name.endsWith('.ts')) out.push(`${dir}/${e.name}`)
  }
  return out
}

const read = (f: string) => readFileSync(url(f), 'utf8')

/**
 * The modal dim must cover the SCREEN, at every device pixel ratio.
 *
 * These are source-shape assertions, and they are deliberately narrow: the
 * real test is pixels, and it lives in the harness because a scrim that fails
 * has correct bounds and a correct size and is simply drawn somewhere else.
 *
 *   sh tools/harness/build.sh
 *   DPR=1 sh tools/harness/run.sh scrim 140 844x390
 *   DPR=3 sh tools/harness/run.sh scrim 140 844x390
 *
 * That scenario samples the four screen corners with the overlay up and with
 * it down, and asserts every corner kept the same fraction of its brightness.
 * What it caught, at dpr 3 and only at dpr 3:
 *
 *   scratchcard  kept 0.641 / 0.995 / 1.000 / 1.000   top-left quadrant only
 *   nuke-launch  the whole panel drawn one canvas up and to the left
 *
 * These two tests guard the two shapes that caused it, so a reintroduction
 * fails in CI rather than on a phone.
 */

test('nothing on the UI camera ignores camera scroll', () => {
  // setScrollFactor(0) is the wrong tool for screen space in GameScene. The UI
  // camera is not at the origin: at devicePixelRatio 3 on an 844x390 viewport
  // its scrollX is -844 and its scrollY -390, so an object that ignores camera
  // scroll is drawn a whole canvas up and to the left. Measured: the Server
  // Nuke launch panel was entirely off screen, leaving a dark board with the
  // once-per-run ability behind it and no way to reach or dismiss it.
  //
  // Screen space is `GameScene.asScreenSpace`, which puts an object on the UI
  // camera's list and off the world camera's. That is the whole mechanism, and
  // it wants ordinary scroll factors.
  const offenders: string[] = []
  for (const f of sourceFiles('../src')) {
    const src = read(f)
    src.split('\n').forEach((line, i) => {
      if (line.includes('.setScrollFactor(0)')) {
        offenders.push(`${f.replace('../', '')}:${i + 1}`)
      }
    })
  }
  assert.deepEqual(offenders, [],
    'use asScreenSpace for screen space; setScrollFactor(0) mis-draws at dpr > 1')
})

test('every modal blocker is centred on the viewport, not on the origin', () => {
  // The other half of the same bug, and the one that shipped first: a blocker
  // built at (0, 0) and made oversize reaches the far corner only when the UI
  // camera's zoom is 1. At dpr 3 the zoom is 3 and the dim stops halfway.
  //
  // Matched on the argument text rather than on behaviour, because a unit test
  // cannot construct a Phaser rectangle. It is a shape check with a measured
  // failure behind it, not a style rule.
  const files = ['../src/ui/Dialog.ts', '../src/ui/ScratchCard.ts', '../src/ui/NukeOverlays.ts']
  const bad: string[] = []
  for (const f of files) {
    const src = read(f)
    // Every `.rectangle(` that is assigned to a blocker.
    for (const m of src.matchAll(/blocker = scene\.add\s*\n?\s*\.rectangle\(([^)]*)\)/g)) {
      const args = m[1].replace(/\s+/g, ' ').trim()
      const centredOnOrigin = /^0\s*,\s*0\s*,/.test(args)
      if (centredOnOrigin) bad.push(`${f.replace('../', '')}: rectangle(${args}) is centred on (0, 0)`)
    }
  }
  assert.deepEqual(bad, [],
    'a modal blocker is centred on the viewport centre — see tools/harness scenario "scrim"')
})

test('the scrim harness scenario still exists and still measures corners', () => {
  // The pixel assertion is only worth citing while it is there to run.
  const harness = read('../tools/harness/index.html')
  assert.ok(harness.includes("scenario === 'scrim'"), 'the scrim scenario is gone')
  assert.ok(harness.includes('UNEVEN'), 'the scrim scenario no longer fails on an uneven scrim')
  const runner = read('../tools/harness/run.sh')
  assert.ok(runner.includes('force-device-scale-factor'),
    'run.sh must be able to run at a retina device ratio; dpr 1 is where this bug hides')
})

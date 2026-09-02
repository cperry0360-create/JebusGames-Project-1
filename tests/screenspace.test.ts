import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const url = (p: string) => new URL(p, import.meta.url)
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(url(dir), { withFileTypes: true })) {
    if (e.isDirectory()) sourceFiles(`${dir}/${e.name}`, out)
    else if (e.name.endsWith('.ts')) out.push(`${dir}/${e.name}`)
  }
  return out
}

const read = (f: string) => readFileSync(url(f), 'utf8')

/**
 * ONE BUG CLASS: canvas pixels compared against CSS pixels.
 *
 * The game has two units and they are the same number only at
 * devicePixelRatio 1. `viewW`/`viewH`, every HUD rectangle and every layout
 * constant are CSS pixels. Camera arithmetic — `(wx - cam.worldView.x) *
 * cam.zoom` — yields canvas pixels, because the world camera's zoom carries
 * the device ratio. Mixing them has cost three bugs so far: the modal scrim
 * covering only the top-left quadrant, the build ring landing 401px from its
 * pad, and a harness probe reporting a correctly-placed tower as off screen.
 *
 * This file guards the shapes that caused them. It was called scrim.test.ts
 * when it only knew about the first.
 *
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

test('a world point becomes screen space through one function', () => {
  // The arithmetic is four terms long and every call site used to write it
  // out. It is correct, and it returns CANVAS pixels — which is fine right up
  // until the result is compared with something in CSS pixels, which is what
  // every layout in the game is written in. At dpr 1 the two agree and every
  // check passes; at 3 the build ring was clamped to the screen edge, 401px
  // from the pad it belonged to.
  const res = read('../src/systems/Resolution.ts')
  assert.match(res, /export function worldToScreen\(/,
    'there is still no world-to-screen helper, so every call site does it by hand')
  // And it converts. A helper that returned canvas pixels would be the same
  // bug with a nicer name on it.
  assert.match(res, /\(\(wx - cam\.worldView\.x\) \* cam\.zoom \+ cam\.x\) \/ dpr/,
    'worldToScreen does not divide by the device ratio, so it returns canvas pixels')

  const offenders: string[] = []
  for (const f of sourceFiles('../src')) {
    if (f.endsWith('systems/Resolution.ts')) continue
    const src = read(f)
    src.split('\n').forEach((line, i) => {
      if (/worldView\.[xy]\)\s*\*\s*cam\.zoom/.test(line)) {
        offenders.push(`${f.replace('../', '')}:${i + 1}`)
      }
    })
  }
  assert.deepEqual(offenders, [],
    'project a world point with worldToScreen; done by hand it returns canvas pixels')
})

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

/* ------------------------------------------------ the pointer half of the pair */

test('there are two conversions, and neither takes the other argument', () => {
  // FOUR BUGS came from confusing canvas pixels with CSS pixels, and the
  // fourth — the settings slider pinned at 100% at devicePixelRatio 3 — was in
  // a file written AFTER worldToScreen was added to prevent it. The helper did
  // not apply: it takes a point on the MAP, and a pointer is not one.
  const res = src('systems/Resolution.ts')
  assert.match(res, /export function worldToScreen\(\s*scene: Phaser\.Scene,\s*wx: number,\s*wy: number/,
    'worldToScreen no longer takes a world point')
  assert.match(res, /export function pointerToScreen\(\s*scene: Phaser\.Scene,\s*pointer: \{ x: number; y: number \}/,
    'there is no pointer-space helper')
})

test('nothing reads a raw pointer coordinate against a CSS-pixel layout', () => {
  // The fifth instance, found while adding the helper: hudTakesPress was being
  // handed pointer.x directly. At dpr 3 on an 844px screen the pointer runs to
  // 2532 while START WAVE spans 594..834 in CSS pixels, so a tap a third of
  // the way across the BOARD tested as a tap on the button — and the map
  // ignored it.
  const game = src('scenes/GameScene.ts')
  assert.doesNotMatch(game, /hudTakesPress\(this\.layout, p\.x, p\.y\)/,
    'the HUD press test is back on raw canvas pixels')
  assert.match(game, /const ui = pointerToScreen\(this, p, this\.uiCam\)/,
    'the press is not converted through the camera that drew the HUD')
  assert.match(game, /hudTakesPress\(this\.layout, ui\.x, ui\.y\)/)

  // And the slider, which is where this was first caught.
  const slider = src('ui/Slider.ts')
  assert.match(slider, /pointerToScreen\(scene, p\)\.x/, 'the slider is back on a raw pointer')
  assert.doesNotMatch(slider, /\bp\.x\b(?!.*pointerToScreen)/,
    'the slider reads a raw pointer coordinate somewhere')
})

test('CANCEL is part of what the HUD claims from the board', () => {
  // It moved into the bottom-right corner. A control the map does not know
  // about is a control the map will take taps through.
  assert.match(src('systems/HudLayout.ts'), /inside\(layout\.settings\) \|\| inside\(layout\.cancel\)/,
    'the HUD does not claim presses on CANCEL')
})

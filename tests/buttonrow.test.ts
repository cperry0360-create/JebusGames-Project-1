import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buttonRow } from '../src/systems/ButtonRow.ts'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')
const LO = read('presentation').loadout

/* THE BUG THIS FILE EXISTS FOR.
 *
 * The loadout screen's two buttons sat at two hardcoded offsets from the
 * middle — 300 wide at centre+90, 240 wide at centre-190 — so the row spanned
 * centre-310 to centre+240 and its own centre landed 35 units LEFT of the card
 * column above it. Measured on the running screen at 844x390 before the fix:
 * row centre 605 against a column centred on 640.
 *
 * Two independent offsets cannot stay centred. The moment the widths differ,
 * "start each one here" and "sit the pair centred" are different instructions,
 * and only the first was ever written down.
 */

test('the row is centred on the centre it was given, whatever the widths', () => {
  for (const centre of [640, 500, 823.5]) {
    for (const labels of [[100, 100], [90, 240], [240, 90], [10, 400]]) {
      const r = buttonRow({
        centreX: centre, labelWidths: labels, padX: 34, gap: 26,
        minWidth: 200, maxTotal: 720,
      })
      assert.ok(Math.abs((r.left + r.right) / 2 - centre) < 1e-9,
        `centre ${centre}, labels ${labels}: row centred on ${(r.left + r.right) / 2}`)
      // And the buttons' own centres are symmetric about it too.
      const mid = (r.centres[0]! + r.centres[1]!) / 2
      assert.ok(Math.abs(mid - centre) < 1e-9, 'the two centres are not symmetric')
    }
  }
})

test('both buttons take the wider label’s width', () => {
  // The primary action must not be visually smaller than the secondary one.
  const r = buttonRow({
    centreX: 640, labelWidths: [90, 240], padX: 34, gap: 26,
    minWidth: 200, maxTotal: 720,
  })
  assert.equal(r.width, 240 + 34 * 2)
  assert.equal(r.centres[1]! - r.centres[0]!, r.width + r.gap,
    'the gap between the two is not the gap that was asked for')
})

test('a short label still gets a pressable button', () => {
  const r = buttonRow({
    centreX: 640, labelWidths: [10, 12], padX: 34, gap: 26,
    minWidth: 200, maxTotal: 720,
  })
  assert.equal(r.width, 200)
})

test('too wide for the column shrinks BOTH, and stays centred', () => {
  // Letting one give way is how they diverged in the first place.
  const r = buttonRow({
    centreX: 640, labelWidths: [300, 300], padX: 34, gap: 26,
    minWidth: 200, maxTotal: 520,
  })
  assert.ok(r.squeezed, 'a row wider than the column did not report being squeezed')
  assert.equal(r.width, Math.floor((520 - 26) / 2))
  assert.ok(r.right - r.left <= 520, 'the squeezed row still overflows the column')
  assert.ok(Math.abs((r.left + r.right) / 2 - 640) < 1e-9, 'squeezing moved the centre')
})

test('the measured row fits the narrowest column the screen can produce', () => {
  // `minContentWidth` is the floor `drawBackdrop` clamps to. The real labels
  // measured 270 wide including padding on the running screen; a pair of those
  // plus the gap is 566, so at the floor the squeeze is what keeps them inside.
  const r = buttonRow({
    centreX: 640, labelWidths: [270 - LO.buttonPadX * 2, 270 - LO.buttonPadX * 2],
    padX: LO.buttonPadX, gap: LO.buttonGap,
    minWidth: LO.buttonMinWidth, maxTotal: LO.minContentWidth,
  })
  assert.ok(r.right - r.left <= LO.minContentWidth,
    `the row is ${r.right - r.left} in a ${LO.minContentWidth} column`)
})

test('the scene centres on the CONTENT column, not the viewport', () => {
  // They are the same number today, because `drawBackdrop` keeps the column
  // symmetric about the middle — it takes whichever side of the painted safe
  // band runs out first. Naming it is what keeps the cards and the buttons
  // moving together if that ever stops being true.
  const scene = src('scenes/LoadoutScene.ts')
  assert.match(scene, /get contentCentre\(\): number/, 'there is no named content centre')
  const fn = scene.slice(scene.indexOf('private buildButtons('))
  const body = fn.slice(0, fn.indexOf('\n  }'))
  assert.match(body, /centreX: this\.contentCentre/,
    'the row is centred on something other than the content column')
  assert.match(body, /maxTotal: this\.contentWidth/,
    'the row is not bounded by the column it sits under')
  // No hand-placed offsets left.
  const code = body.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n')
  assert.doesNotMatch(code, /W \/ 2 [+-] \d/, 'a hardcoded offset from the middle is back')
  assert.match(code, /row\.centres\[0\]!/, 'the buttons are not placed from the row')
  assert.match(code, /row\.width/, 'the buttons do not share the row’s width')
})

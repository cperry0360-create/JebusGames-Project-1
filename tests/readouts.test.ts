import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { hudLayout, NO_INSETS, type Insets } from '../src/systems/HudLayout.ts'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')
const P = read('presentation')
const ART = read('art')
const LAYOUT = P.hud.layout

/**
 * THE PEANUT COUNTER CLIPPED AT FOUR DIGITS, and it took three faults.
 *
 * Measured from a rendered frame by `tools/harness/run.sh counters` before the
 * fix, at 844x390: the painted field is 30.0 CSS px wide, three digits are 26.0
 * across and four are 34.0, and the number was being drawn at scale 1.00 at
 * every value — 5.0 px past its field at 100 and 13.0 px past it at 1012.
 *
 *   1. `hud.numberMargin` was a flat 9 CSS px, authored for the 44px-tall
 *      plates this corner used to carry. The readouts were shrunk to 20px tall
 *      and it was not rescaled, so a 9px inset was pushing the number into a
 *      30px field and leaving 21px of it for a 26px number.
 *   2. `bump` did `setScale(1)` and yoyoed back to 1, discarding whatever scale
 *      `setCounter` had computed to make the number fit — and `setCounter`
 *      returns early when the text has not changed, so nothing put it back.
 *   3. The plate could not hold four digits at a legible size however the text
 *      was scaled. `setCounter`'s floor of 0.6 is 9px, which the brief rules
 *      out: the floor is legibility.
 *
 * The fix is a three-slice pill whose FIELD stretches, sized by digit count,
 * with the corner reserving the widest it can reach. This file guards the
 * arithmetic and the wiring; the harness looks at the frame.
 */

test('the readout config is the shape the pill needs', () => {
  assert.equal(typeof LAYOUT.readoutDigits, 'number', 'no readoutDigits')
  assert.ok(LAYOUT.readoutDigits >= 5,
    `readoutDigits is ${LAYOUT.readoutDigits}; peanuts reaches five figures`)
  assert.equal(typeof LAYOUT.readoutFieldPad, 'number', 'no readoutFieldPad')
  assert.ok(LAYOUT.readoutFieldPad > 0 && LAYOUT.readoutFieldPad < 0.4,
    `readoutFieldPad is ${LAYOUT.readoutFieldPad}; it is a fraction of the plate's height`)
  // THE FLAT MARGIN IS RETIRED AND MUST NOT COME BACK. It is the fault, and a
  // pixel inset into a plate whose height is a tunable comes loose again the
  // next time the plate is resized.
  assert.equal(P.hud.numberMargin, undefined,
    'hud.numberMargin is back; it is a flat pixel inset into a plate sized by readoutHeight')
  assert.equal(typeof P.hud._numberMargin, 'string',
    'the retirement note for numberMargin is gone, so the next pass will re-add it')
  const hud = src('scenes/HudScene.ts')
  assert.doesNotMatch(hud, /HUD\.numberMargin/, 'the HUD reads the flat margin again')
})

test('every counter plate has a measured field to slice at', () => {
  // The three-slice cuts the plate at `fieldLeft` and `fieldRight`. Without
  // both, the cut falls back to a guess and the icon ends up in the stretched
  // piece.
  for (const name of ['peanuts', 'lives', 'wave']) {
    const key = ART.ui.counters[name]
    const r = ART.render[key]
    assert.ok(r, `${name} has no render entry`)
    for (const k of ['contentWidth', 'contentHeight', 'fieldLeft', 'fieldRight']) {
      assert.equal(typeof r[k], 'number', `${key} has no ${k}, so the pill cannot be sliced`)
    }
    assert.ok(r.fieldRight > r.fieldLeft, `${key}'s field is inside out`)
    // AND THE FIELD IS NOT THE WHOLE PLATE. The old code computed the printable
    // width as `1 - fieldLeft`, which runs past `fieldRight` into the frame --
    // 0.681 of the plate against the field's real 0.621 on the peanut plate.
    assert.ok(r.fieldRight < 1, `${key}'s field reaches the plate's edge`)
  }
})

test('the corner reserves the widest the pill can grow to', () => {
  /*
   * The layout runs before anything is drawn and the number changes all run,
   * so what the corner has to reserve is the pill at `readoutDigits`. This
   * mirrors `HudScene.counterWidths`; if the two drift, the pill grows out from
   * under the reservation and into the wave control.
   *
   * The glyph width cannot be measured without a browser, so it is bounded:
   * a bold digit at this size is between 0.4 and 0.75 of the font size, and
   * the harness's own measurement is 8.0 px at 15px, which is 0.53.
   */
  const widest = (name: string, perGlyph: number): number => {
    const r = ART.render[ART.ui.counters[name]]
    const scale = LAYOUT.readoutHeight / r.contentHeight
    const capL = r.fieldLeft * r.contentWidth
    const capR = r.contentWidth - r.fieldRight * r.contentWidth
    const natural = (r.fieldRight - r.fieldLeft) * r.contentWidth * scale
    const pad = LAYOUT.readoutFieldPad * LAYOUT.readoutHeight
    const glyphs = LAYOUT.readoutDigits * perGlyph * LAYOUT.readoutNumberSize
    return (capL + capR) * scale + Math.max(natural, glyphs + pad * 2)
  }
  const NOTCH: Insets = { top: 0, right: 44, bottom: 21, left: 44 }
  for (const [vw, vh] of [[667, 375], [844, 390], [1280, 720], [568, 320]]) {
    for (const insets of [NO_INSETS, NOTCH]) {
      // The widest of the two plates, which is what `measureCounters` returns.
      const reserve = Math.max(widest('peanuts', 0.75), widest('lives', 0.75))
      const l = hudLayout(
        { width: vw!, height: vh!, insets, countersWidth: reserve, abilitiesWidth: 322 }, LAYOUT)
      assert.ok(l.counters.width >= reserve - 0.5,
        `${vw}x${vh}: the corner gives the readouts ${l.counters.width.toFixed(1)} `
        + `for a pill that can reach ${reserve.toFixed(1)}`)
      // And the reserved corner still does not reach the wave control.
      assert.ok(l.counters.x + l.counters.width <= l.startButton.x + 0.5,
        `${vw}x${vh}: the readouts reach ${(l.counters.x + l.counters.width).toFixed(1)} `
        + `and the wave control starts at ${l.startButton.x.toFixed(1)}`)
    }
  }
})

test('the pill grows and the bump does not undo the fit', () => {
  const hud = src('scenes/HudScene.ts')
  // The three slices, and the stretch.
  assert.match(hud, /tex\.add\(frame, 0, fx, 0, fw, srcH\)/,
    'the plate is no longer cut into frames, so the whole image stretches with the field')
  assert.match(hud, /private stretchPill\(/, 'nothing stretches the pill')
  assert.match(hud, /pill\.mid\.setDisplaySize\(field, h\)/,
    'the middle slice is no longer the piece that grows')
  // GROWTH BY GLYPH COUNT, not by the number itself: the peanut count changes
  // on most kills and a pill that breathes on every kill is worse than a pill
  // that is slightly wide.
  assert.match(hud, /'8'\.repeat\(/,
    'the pill is sized from the actual number again, so it wobbles between 1111 and 1888')
  // AND THE BUMP. This is fault 2 and it is the one that made 1012 clip while
  // 800 did not.
  assert.match(hud, /text\.setScale\(pill\.fit\)/,
    'the bump no longer starts from the fitted scale')
  assert.match(hud, /scale: pill\.fit \* 1\.25/,
    'the bump tweens to a flat 1.25 again, which lands back on 1 and drops the fit')
  assert.doesNotMatch(hud, /targets: text, scale: 1\.25/, 'the old bump is back')
})

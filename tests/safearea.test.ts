import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { housingSide, resolveInsets } from '../src/systems/HudLayout.ts'

const url = (p: string) => new URL(p, import.meta.url)
const presentation = JSON.parse(readFileSync(url('../src/data/presentation.json'), 'utf8'))

const AT90 = presentation.safeArea.housingAtAngle90 as 'left' | 'right'
const ins = (left: number, right: number) => ({ top: 0, right, bottom: 0, left })

test('a one-sided report is trusted exactly as it stands', () => {
  // When the platform distinguishes the two edges it knows something we do
  // not. Nothing here may second-guess that.
  assert.deepEqual(resolveInsets(ins(64, 0), 'left'), ins(64, 0))
  assert.deepEqual(resolveInsets(ins(0, 64), 'right'), ins(0, 64))
  assert.deepEqual(resolveInsets(ins(64, 20), 'left'), ins(64, 20))
  assert.deepEqual(resolveInsets(ins(0, 0), 'left'), ins(0, 0))
})

test('a symmetric report frees the edge with no hardware behind it', () => {
  // THE BUG THIS EXISTS FOR. A notched phone in landscape reports the housing
  // inset on BOTH horizontal edges. Every consumer already applied each edge's
  // own value to that edge — there is no max() and no shared constant
  // downstream — so the symmetry could only be undone here.
  assert.deepEqual(resolveInsets(ins(64, 64), 'left'), ins(64, 0),
    'the housing is on the left, so the right edge must be free')
  assert.deepEqual(resolveInsets(ins(64, 64), 'right'), ins(0, 64),
    'the housing is on the right, so the left edge must be free')
})

test('the freed edge goes to zero, so a docked control is actually flush', () => {
  // Not to a smaller corner allowance. A gap is either zero or it is visible,
  // and the HUD carries its own margin for the rounded corner already.
  assert.equal(resolveInsets(ins(44, 44), 'left').right, 0)
  assert.equal(resolveInsets(ins(44, 44), 'right').left, 0)
})

test('not knowing the orientation keeps both insets', () => {
  // The conservative branch, and the one that shipped before this. A HUD held
  // off an edge it need not be is ugly; one under a notch is unreadable.
  assert.deepEqual(resolveInsets(ins(64, 64), null), ins(64, 64))
  assert.equal(housingSide(null, AT90), null)
  assert.equal(housingSide(Number.NaN, AT90), null)
})

test('only the two landscape quarter turns resolve to a side', () => {
  // Portrait has the housing along the top, which is not a horizontal inset,
  // and 180 puts it along the bottom. Neither is this function's business.
  assert.equal(housingSide(0, AT90), null)
  assert.equal(housingSide(180, AT90), null)
  assert.notEqual(housingSide(90, AT90), null)
  assert.notEqual(housingSide(270, AT90), null)
})

test('the two landscape orientations are mirrors, whichever way round they are', () => {
  // Flipping the phone moves the notch to the other edge. The value in the
  // data decides which is which; that the two disagree is the invariant, and
  // it holds however that value is set.
  const a = housingSide(90, AT90)
  const b = housingSide(270, AT90)
  assert.notEqual(a, b, 'both landscape orientations put the housing on the same side')
  assert.deepEqual([a, b].sort(), ['left', 'right'])
  assert.equal(a, presentation.safeArea.housingAtAngle90)
  // Negative and wrapped angles are the same two turns.
  assert.equal(housingSide(-90, AT90), b)
  assert.equal(housingSide(450, AT90), a)
})

test('the data names a side and only a side', () => {
  const v = presentation.safeArea.housingAtAngle90
  assert.ok(v === 'left' || v === 'right', `housingAtAngle90 is "${v}"`)
})

test('nothing downstream applies one edge to the other', () => {
  // The stated hypothesis was that a consumer took max(left, right) or reused
  // one value. It did not, and this pins that: a layout that reads only
  // `insets.left` for both edges would pass every test above and still be
  // broken.
  const src = ['HudLayout', 'RingLayout'].map((n) =>
    readFileSync(url(`../src/systems/${n}.ts`), 'utf8')).join('\n')
    .split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//')).join('\n')
  assert.doesNotMatch(src, /Math\.max\([^)]*insets\.(left|right)/,
    'a layout is taking the larger of the two horizontal insets')
  assert.match(src, /insets\.left/, 'nothing reads the left inset')
  assert.match(src, /insets\.right/, 'nothing reads the right inset')
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const url = (p: string) => new URL(p, import.meta.url)
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))

const P = read('presentation')
const A = read('abilities')

test('the blue spline overlay is gone, not shrunk', () => {
  // "Do not replace it with a narrower or fainter version of itself." So the
  // check is for the mechanism, not for a colour or an alpha: nothing may
  // offset the lane and stroke it any more.
  const game = src('scenes/GameScene.ts')
  assert.doesNotMatch(game, /drawPathBand/, 'drawPathBand is back')
  assert.doesNotMatch(game, /strokePoints/, 'something is stroking a line along the lane again')
  assert.equal(P.pathBand, undefined, 'the pathBand data block is back')
})

test('the covered-lane wash is a different feature and survives', () => {
  // The same Graphics object served two purposes. Only the summon band was
  // asked for; the wash showing which stretch of road a SELECTED TOWER covers
  // is the other half of "should I upgrade it?" and was not in the ask.
  const game = src('scenes/GameScene.ts')
  assert.match(game, /private drawCoveredLane/)
  assert.match(game, /private laneWash!/, 'the field should be named for what it now does')
})

test('the cursor names one texture key per state and stubs each one', () => {
  const c = P.castCursor
  assert.equal(typeof c.validKey, 'string')
  assert.equal(typeof c.invalidKey, 'string')
  assert.notEqual(c.validKey, c.invalidKey, 'two sprites, arriving separately')
  assert.equal(typeof c.stubValidColour, 'number')
  assert.equal(typeof c.stubInvalidColour, 'number')
  assert.ok(c.size > 0)

  const cur = src('ui/CastCursor.ts')
  // The stub is chosen by asking whether the texture is there, so dropping the
  // art in is the whole of the change.
  assert.match(cur, /textures\.exists\(key\)/)
  assert.match(cur, /scene\.add\.rectangle\(/, 'no rectangle stub')
  assert.match(cur, /stubbed/, 'a probe cannot tell a stub from the real thing')
})

test('the cursor is driven by validity and by the pointer, not by the lane', () => {
  const game = src('scenes/GameScene.ts')
  // Same rule as before — validCastPoint — reported in a different place.
  assert.match(game, /const ok = this\.validCastPoint\(def, w\.x, w\.y\)/)
  assert.match(game, /this\.castCursor\.moveTo\(w\.x, w\.y, ok, this\.cameras\.main\.zoom\)/)
  // And it goes away with the mode.
  assert.match(game, /this\.castCursor\.hide\(\)/)
})

test('the cursor keeps a constant size on the glass', () => {
  // A pointer that grows with the camera is reporting the camera.
  assert.match(src('ui/CastCursor.ts'), /setScale\(1 \/ Math\.max\(0\.0001, zoom\)\)/)
})

test('the placement rule itself is unchanged', () => {
  // The band was where the restriction was DRAWN, never where it was decided.
  assert.equal(A.gnomes.pathOnlyWithin, 56)
  assert.match(src('scenes/GameScene.ts'),
    /private validCastPoint[\s\S]{0,220}?this\.lane\.distanceTo\(x, y\) <= within/)
})

test('CANCEL is in the HUD, and the layout reserves it', () => {
  const game = src('scenes/GameScene.ts')
  assert.match(game, /const cb = this\.layout\.cancel/)
  assert.match(src('systems/HudLayout.ts'), /cancel: Rect/)
  assert.equal(typeof P.hud.layout.cancelWidth, 'number')
})

test('there is no wave message bar left to need a plate', () => {
  // IT USED TO HAVE ONE, and the plate was the right fix for the wrong thing:
  // a permanent line of guidance across the top of the board, over painted
  // map, needed a backing to be readable at all. The line is gone -- what a
  // player needs at the moment it happens goes through `toast`, and what was
  // teaching waits for a tutorial -- so the plate went with it.
  const hud = src('scenes/HudScene.ts')
  assert.ok(!/drawMessagePlate/.test(hud), 'the message plate is back')
  assert.ok(!/this\.message\b/.test(hud), 'the message text is back')
  // The rectangle stays: the boss bar uses it for one wave in thirteen.
  assert.match(hud, /this\.layout\.messageRow/, 'the boss bar lost its region too')
})

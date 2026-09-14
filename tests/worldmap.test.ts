import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LEVELS, ROAD_SLOTS } from '../src/systems/Levels.ts'
import {
  ROAD, blockHeight, maxScroll, nodeBlock, nodeCentre, nodeRect, nodeState, perRow,
  placeOf, roadHeight, roadNodes, roadPath, roadWidth, rowCount, rowPitch, scrollToNode,
} from '../src/systems/WorldRoad.ts'

const url = (p: string) => new URL(p, import.meta.url)
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')
const display = JSON.parse(readFileSync(url('../src/data/display.json'), 'utf8'))

/*
 * THE LEVEL SELECT, as a road.
 *
 * What it replaced: four full-size cards at hand-authored positions, which had
 * run out of room at four levels, read as four different sizes because the
 * pictures did, and were drawn a path in level order that their POSITIONS were
 * not in — so the long dotted run crossed the whole screen and appeared to
 * skip a level entirely.
 */

test('the road is one run of identical nodes in level order', () => {
  const nodes = roadNodes()
  assert.equal(nodes.length, ROAD_SLOTS)
  // TEN, AND THE SCOPE IS TEN. It was twenty, which is why this screen was a
  // 4310-unit road of padlocks behind a scrollbar; ten of those slots were for
  // levels nobody had designed. A road with fewer slots than levels is the
  // other failure and Levels.ts makes it impossible, so this is the one worth
  // stating.
  assert.equal(ROAD_SLOTS, 10, 'the planned campaign is no longer ten levels')
  assert.ok(ROAD_SLOTS >= LEVELS.length, 'a built level has no slot to be drawn in')

  // IDENTICAL. Every node is the same box; the only thing that changes is what
  // is drawn inside it. This is the whole of fix (a), and it holds for the
  // unbuilt slots too, which is what stops the road going ragged past level 4.
  for (const n of nodes) {
    const r = nodeBlock(n)
    assert.equal(r.width, ROAD.node.width + ROAD.node.framePad)
    assert.equal(r.height,
      ROAD.node.height + ROAD.node.framePad + ROAD.label.gap + ROAD.label.reserve)
  }

  // EVENLY SPACED ALONG ITS ROW, and every second row runs the other way. The
  // road is folded into two rows now, so "left to right for twenty" is no
  // longer the shape -- but "one pitch along from the last, in the direction
  // this row runs" still is, and it is what stops a node landing anywhere its
  // level order did not put it.
  for (let i = 1; i < nodes.length; i++) {
    if (placeOf(i).row !== placeOf(i - 1).row) continue
    const dir = placeOf(i).row % 2 === 0 ? 1 : -1
    assert.equal((nodes[i]!.x - nodes[i - 1]!.x) * dir, ROAD.pitch,
      `slot ${nodes[i]!.number} is not one pitch along from the last`)
  }
  // And each row starts under the end of the one before it, so the eye never
  // crosses the whole screen to find the next level.
  for (let r = 1; r < rowCount(); r++) {
    const last = nodes[r * perRow() - 1]!, first = nodes[r * perRow()]!
    assert.equal(first.x, last.x,
      `row ${r + 1} starts at ${first.x}, not under the end of row ${r} at ${last.x}`)
    assert.ok(first.y > last.y, `row ${r + 1} does not sit below row ${r}`)
  }
  // And numbered from one, which is the other half of "read as progression".
  assert.deepEqual(nodes.map((n) => n.number), nodes.map((_, i) => i + 1))
})

test('every planned level has a slot, built or not', () => {
  const nodes = roadNodes()
  for (const [i, l] of LEVELS.entries()) assert.equal(nodes[i]!.level?.id, l.id)
  const unbuilt = nodes.filter((n) => n.level === null)
  assert.equal(unbuilt.length, ROAD_SLOTS - LEVELS.length)
  // THE ROAD RAN OUT, AND THAT IS THE CAMPAIGN FINISHING RATHER THAN A FAULT.
  //
  // This line used to read `assert.ok(unbuilt.length > 0, 'there is no road
  // ahead; the map ends at the last built level')`, and it was right for as
  // long as there was more road to build. levels.json's `_plannedLevels` says
  // TEN IS THE SCOPE AND IT IS FINAL, and says what raising it costs: eleven
  // slots is a third row on a screen where two already use 498 of the band's
  // 522 units. Level 10 is the tenth, so every slot holds a level and the map
  // shows a finished campaign instead of a promise.
  //
  // The assertion above it is untouched and is the one with the teeth: the
  // number of empty slots is exactly the gap between the plan and what is
  // built, whatever either number is. A level added without a slot, or a slot
  // lost, still fails. Only "there must be a gap" goes, because keeping it
  // would mean this test could pass only while the game was unfinished.
  // An unbuilt slot is locked, always, whatever the save says. There is
  // nothing behind it to unlock.
  for (const n of unbuilt) assert.equal(nodeState(n, LEVELS.map((l) => l.id)), 'locked')
})

test('the three states are the three the player can be in, and no fourth', () => {
  const nodes = roadNodes()
  // Nothing cleared: level 1 is the one to play, everything else is shut.
  const fresh = nodes.map((n) => nodeState(n, []))
  assert.equal(fresh[0], 'open')
  assert.deepEqual(new Set(fresh.slice(1)), new Set(['locked']))

  // Two levels in: 1 and 2 are behind them, level 3 is next.
  const on = nodes.map((n) => nodeState(n, ['level1', 'level2']))
  assert.deepEqual(on.slice(0, 4), ['cleared', 'cleared', 'open', 'locked'])

  // AND BEATING THE SAME LEVEL AGAIN OPENS NOTHING. Under the old run count
  // this was the bug: three clears of level 1 read as three cleared runs and
  // opened level 4.
  const repeat = nodes.map((n) => nodeState(n, ['level1', 'level1', 'level1']))
  assert.deepEqual(repeat.slice(0, 4), ['cleared', 'open', 'locked', 'locked'])

  // Exactly one node is ever the objective, so the pulse cannot appear twice.
  const ids = LEVELS.map((l) => l.id)
  for (let n = 0; n <= ids.length; n++) {
    const open = nodes.filter((nd) => nodeState(nd, ids.slice(0, n)) === 'open')
    assert.ok(open.length <= 1, `${open.length} nodes are the current objective at ${n} beaten`)
  }
})

/*
 * THE TWO CHECKS THIS SCREEN KEEPS NEEDING.
 *
 * The last two world map briefs both shipped overlapping cards, and both times
 * the test that should have caught it had re-derived the scene's layout from
 * constants copied out of it: one copy drifted and the check went on passing
 * against a screen that no longer existed. These two ask WorldRoad for the
 * rectangles the scene draws, so there is nothing to drift.
 *
 * Proved to catch a real failure rather than assumed to: setting
 * `worldMap.rows.gap` to -140 in presentation.json puts row two's frames
 * through row one's captions and fails the first; setting `band.bottom` back
 * to 596, or `label.reserve` up to 160, pushes the deepest block out of the
 * band and fails the second. Both were run red before this was written; see
 * reports/2026-09-13-level-select-redesign.md.
 */

test('no two framed nodes overlap', () => {
  // THE FRAME, not the picture: the painted border is the edge a neighbour has
  // to clear, and it is 8 units larger than the art on every side.
  const nodes = roadNodes()
  const hit = (a: ReturnType<typeof nodeRect>, b: ReturnType<typeof nodeRect>): boolean =>
    a.x < b.x + b.width && b.x < a.x + a.width
    && a.y < b.y + b.height && b.y < a.y + a.height
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      assert.ok(!hit(nodeRect(nodes[i]!), nodeRect(nodes[j]!)),
        `slots ${i + 1} and ${j + 1} overlap`)
    }
  }
  // AND THE NAMES DO NOT EITHER, which is the collision that actually shipped:
  // never two cards, always one card's caption lying across the next. A
  // label block is the frame plus the room reserved under it.
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      assert.ok(!hit(nodeBlock(nodes[i]!), nodeBlock(nodes[j]!)),
        `slots ${i + 1} and ${j + 1} have label blocks that overlap`)
    }
  }
})

test('no label block leaves the band', () => {
  // A short reserve does not clip the text -- it pushes the deepest node down
  // until its last line lands in the chrome, which is what a first pass at a
  // reserve of 118 did when this was one row.
  for (const n of roadNodes()) {
    const b = nodeBlock(n)
    assert.ok(b.y >= ROAD.band.top,
      `slot ${n.number} rides over the top of the band by ${Math.round(ROAD.band.top - b.y)}`)
    assert.ok(b.y + b.height <= ROAD.band.bottom,
      `slot ${n.number}'s name reaches ${Math.round(b.y + b.height)},`
      + ` past the band at ${ROAD.band.bottom}`)
  }
  // The whole road, counted once rather than node by node: two rows, their
  // names and the full swing of the wave against the room there is.
  assert.ok(roadHeight() <= ROAD.band.bottom - ROAD.band.top,
    `the road wants ${Math.round(roadHeight())} units and the band has `
    + `${ROAD.band.bottom - ROAD.band.top}`)
})

test('the road stays inside the band it is given, at its deepest and its highest', () => {
  // And the band is used rather than hugged: the old screen put everything in
  // the top half. Two rows fill it to within a couple of units now, which is
  // the same claim with no room left to be wrong about.
  const slack = (ROAD.band.bottom - ROAD.band.top) - roadHeight()
  assert.ok(slack >= 0, `the road is ${Math.round(-slack)} units too tall for its band`)
  assert.ok(slack < ROAD.node.height,
    `the road leaves ${Math.round(slack)} units of the band empty`)
  // ONE ROW'S NAMES CLEAR THE NEXT ROW'S FRAMES BY `rows.gap`, AT EVERY
  // COLUMN. That is a property of phasing the wave off the screen slot rather
  // than off the level number, and it is the thing that would quietly stop
  // being true if someone phased it off the index again.
  assert.equal(rowPitch() - blockHeight(), ROAD.rows.gap)
  // BY SCREEN SLOT, not by level order: the snake mirrors every second row, so
  // the node under slot 4 of row one is slot 4 of row two and NOT the node
  // four places later in the level order.
  const bySlot = new Map<string, number>()
  for (const n of roadNodes()) bySlot.set(`${placeOf(n.index).row}:${placeOf(n.index).slot}`, n.y)
  for (let r = 1; r < rowCount(); r++) {
    for (let slot = 0; slot < perRow(); slot++) {
      const above = bySlot.get(`${r - 1}:${slot}`), below = bySlot.get(`${r}:${slot}`)
      if (above === undefined || below === undefined) continue
      assert.equal(Math.round(below - above), rowPitch(),
        `slot ${slot} is not one row pitch apart between rows ${r} and ${r + 1}`)
    }
  }
  // The scrollbar is BELOW nothing now -- at two rows its strip is part of the
  // band. It is never drawn (see the scrollbar test), and that is what makes
  // the overlap harmless; stating it here so the trade is not rediscovered as
  // a bug.
  assert.ok(maxScroll(display.width) === 0,
    'the road scrolls again, and the scrollbar at y '
    + `${ROAD.scrollbar.y} would draw over the second row's names`)
})

test('the wave never leaves two neighbours at the same height', () => {
  // A road that goes flat for a stretch reads as a list.
  const ys = roadNodes().map((n) => n.y)
  for (let i = 1; i < ys.length; i++) {
    assert.notEqual(ys[i], ys[i - 1], `slots ${i} and ${i + 1} are level with each other`)
  }
  // THE ROAD IS CENTRED ON ITS BLOCK, not on the band. A node's name hangs
  // below it, so centring the nodes themselves leaves air at the top and drops
  // the deepest caption out of the bottom -- which is the shape the screen had
  // before any of this.
  const blocks = roadNodes().map(nodeBlock)
  const top = Math.min(...blocks.map((b) => b.y))
  const bottom = Math.max(...blocks.map((b) => b.y + b.height))
  assert.ok(Math.abs((top - ROAD.band.top) - (ROAD.band.bottom - bottom)) <= 1,
    `the road leaves ${Math.round(top - ROAD.band.top)} units above it and `
    + `${Math.round(ROAD.band.bottom - bottom)} below`)
})

test('the turn between rows bows clear of the last name on the row', () => {
  /*
   * The two nodes either side of a turn share a screen slot, so the painted
   * road between them would be a plumb line -- straight down through the
   * middle of the caption under the node it is leaving. A rendered frame at a
   * bow of 46 shows the road drawn through its own label.
   *
   * The path is geometry and lives in WorldRoad, so this can measure it.
   */
  const path = roadPath()
  const nodes = roadNodes()
  assert.ok(path.length > nodes.length, 'the road is drawn straight through every turn')
  for (let r = 1; r < rowCount(); r++) {
    const leaving = nodes[r * perRow() - 1]!
    const out = Math.max(...path.map((p) => Math.abs(p.x - leaving.x)))
    assert.ok(out > ROAD.label.wrap / 2,
      `the turn bows ${Math.round(out)} units, inside a caption ${ROAD.label.wrap} wide`)
  }
  // And not so far that it leaves the design box it is centred in.
  const right = Math.max(...path.map((p) => p.x))
  const left = Math.min(...path.map((p) => p.x))
  assert.ok(left >= 0 && right <= display.width,
    `the road runs from ${Math.round(left)} to ${Math.round(right)} of a `
    + `${display.width}-unit box`)
})

test('the scrollbar is horizontal, and absent when the road fits', () => {
  // THE AXIS. The road runs sideways, so the bar does. The one it replaces was
  // a vertical bar on a map that does not scroll vertically at all.
  const map = src('scenes/WorldMapScene.ts')
  assert.match(map, /fillRoundedRect\(left, S\.y - r, S\.width, S\.height, r\)/,
    'the scrollbar track is not drawn as a horizontal pill')
  assert.match(map, /if \(max <= 0\) return/,
    'the scrollbar is drawn even when there is nothing to scroll')
  // And it is drawn, not a control: a 12-unit-tall control is an 8px tap
  // target on a phone, which is a SMALL fault waiting to happen.
  const bar = map.slice(map.indexOf('private drawBar('))
  assert.ok(!/setInteractive/.test(bar.slice(0, 1400)), 'the scrollbar is a tap target')

  // The arithmetic, rather than the drawing. Nothing to scroll when the whole
  // road is on screen; the full overhang when it is not.
  assert.equal(maxScroll(roadWidth()), 0)
  assert.equal(maxScroll(roadWidth() + 500), 0)
  assert.equal(maxScroll(display.width), roadWidth() - display.width)
  // AT TEN LEVELS IN TWO ROWS IT IS NEVER NEEDED, and that is the point of the
  // redesign rather than a side effect of it: five across at this pitch is
  // exactly the design box, and a camera fitted to the box never sees less
  // than the box, so `maxScroll` is zero on every viewport the game runs at.
  assert.equal(roadWidth(), ROAD.margin * 2 + ROAD.node.width + (perRow() - 1) * ROAD.pitch)
  assert.ok(roadWidth() <= display.width,
    `the road is ${roadWidth()} units against a ${display.width} box, so the bar is back`)
  assert.equal(maxScroll(display.width), 0)
})

test('the screen opens on the level the player is up to, clamped to the ends', () => {
  const visW = display.width
  // EVERY SLOT OPENS AT ZERO, because the whole road is on screen and there is
  // nowhere to scroll to. Kept rather than deleted: the arithmetic is what
  // says the bar must not be drawn, and a planned count that outgrew two rows
  // would need all of it back.
  for (let i = 0; i < ROAD_SLOTS; i++) assert.equal(scrollToNode(i, visW), 0)
  // And it still centres and clamps when there IS something to scroll, which
  // is the only way to check the clamp on a road that fits.
  const narrow = 400
  assert.equal(scrollToNode(0, narrow), 0)
  assert.equal(scrollToNode(perRow() - 1, narrow), maxScroll(narrow))
  const mid = 2
  assert.equal(scrollToNode(mid, narrow), nodeCentre(mid).x - narrow / 2)
})

/* ------------------------------------------ the difficulty chip, out of the road */

test('the difficulty readout sits in the chrome bar, not over the scrolling road', () => {
  /*
   * BUG D. It floated at the top right at (1120, 68) -- inside the band the
   * road scrolls through -- so map nodes passed underneath it as the road
   * moved. THAT OCCLUSION IS THE DEFECT; the styling was the smaller half of
   * the same mistake.
   */
  const P = JSON.parse(readFileSync(new URL('../src/data/presentation.json', import.meta.url), 'utf8'))
  const chip = P.difficultyChip
  const band = P.worldMap.band
  assert.ok(chip, 'the chip has no layout entry, so it is hardcoded again')
  // Below the road's band, with its whole height clear of it.
  assert.ok(chip.y - chip.height / 2 > band.bottom,
    `the chip's top edge is at ${chip.y - chip.height / 2}, inside a road band that ends at ${band.bottom}`)
  // And clear of the BACK/RESUME group, which is centred on the design box.
  // Its widest form is RESUME 280 at x-150 and BACK 200 at x+150, so the
  // group's left edge is 640 - 150 - 140 = 350.
  assert.ok(chip.x + chip.width / 2 <= 350,
    `the chip reaches x ${chip.x + chip.width / 2}, into the BACK/RESUME group at 350`)
  assert.ok(chip.x - chip.width / 2 >= 0, 'the chip runs off the left of the design box')

  const map = readFileSync(new URL('../src/scenes/WorldMapScene.ts', import.meta.url), 'utf8')
  const draw = /private drawDifficultyChip\(\): void \{[\s\S]*?\n  \}/.exec(map)![0]
  // NOT A PLATE. BACK is the screen's action and wears the arcade plate; this
  // is a state readout that happens to be tappable, and dressing the two the
  // same said they were the same kind of thing.
  assert.ok(!/plateButton/.test(draw),
    'the difficulty wears the same plate as BACK, so it reads as an action')
  // ONE CONTROL: the label and the value share a baseline inside one chip.
  assert.match(draw, /'DIFFICULTY'/, 'the chip lost its label')
  assert.match(draw, /difficultyName\(id\)\.toUpperCase\(\)/, 'the chip lost its value')
  assert.match(draw, /\.setOrigin\(0, 0\.5\)[\s\S]{0,600}\.setOrigin\(1, 0\.5\)/,
    'the label and value are not laid out inline on one baseline')
  // And still a legal tap target.
  assert.match(draw, /tapFloor\(this, C\.width\), tapFloor\(this, C\.height\)/,
    'the chip is not held to the tap floor')
})

test('the harness can look for the black pill at any aspect ratio', () => {
  // BUG C is not reproducible here and the detector is what is being left
  // behind: `mapedge` lists every drawn object as a screen rectangle, flags
  // anything tall and narrow near either edge, and samples the canvas down the
  // left edge for near-black pixels. Two earlier sessions concluded "cannot
  // reproduce" with nothing to show for it; this is something to show.
  const harness = readFileSync(new URL('../tools/harness/index.html', import.meta.url), 'utf8')
  assert.match(harness, /scenario === 'mapedge'/, 'the mapedge scenario is gone')
  assert.match(harness, /tall-narrow near an edge/, 'it no longer looks for the pill shape')
  assert.match(harness, /left 24px strip/, 'it no longer samples the left edge in pixels')
})

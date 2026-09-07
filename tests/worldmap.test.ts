import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LEVELS, ROAD_SLOTS } from '../src/systems/Levels.ts'
import {
  ROAD, bandCentre, maxScroll, nodeBlock, nodeCentre, nodeState, roadNodes, roadWidth,
  scrollToNode,
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
  assert.ok(ROAD_SLOTS >= 20, 'the planned campaign is no longer on the map')

  // IDENTICAL. Every node is the same box; the only thing that changes is what
  // is drawn inside it. This is the whole of fix (a), and it holds for the
  // unbuilt slots too, which is what stops the road going ragged past level 4.
  for (const n of nodes) {
    const r = nodeBlock(n)
    assert.equal(r.width, ROAD.node.width + ROAD.node.framePad)
    assert.equal(r.height,
      ROAD.node.height + ROAD.node.framePad + ROAD.label.gap + ROAD.label.reserve)
  }

  // In order, left to right, evenly spaced. A path drawn through these in
  // order cannot double back, which is what the old positions did.
  for (let i = 1; i < nodes.length; i++) {
    assert.equal(nodes[i]!.x - nodes[i - 1]!.x, ROAD.pitch,
      `slot ${nodes[i]!.number} is not one pitch along from the last`)
  }
  // And numbered from one, which is the other half of "read as progression".
  assert.deepEqual(nodes.map((n) => n.number), nodes.map((_, i) => i + 1))
})

test('every planned level has a slot, built or not', () => {
  const nodes = roadNodes()
  for (const [i, l] of LEVELS.entries()) assert.equal(nodes[i]!.level?.id, l.id)
  const unbuilt = nodes.filter((n) => n.level === null)
  assert.equal(unbuilt.length, ROAD_SLOTS - LEVELS.length)
  assert.ok(unbuilt.length > 0, 'there is no road ahead; the map ends at the last built level')
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

test('the road stays inside the band it is given, at its deepest and its highest', () => {
  // The band is what is left between the title and the scrollbar. A node whose
  // name lands under the bar is the fault this measures: it happened at a
  // reserve of 118, where SPORTS COMPLEX AT DUSK's three lines plus its unlock
  // line pushed the last row over the track.
  for (const n of roadNodes()) {
    const b = nodeBlock(n)
    assert.ok(b.y >= ROAD.band.top, `slot ${n.number} rides over the title`)
    assert.ok(b.y + b.height <= ROAD.band.bottom, `slot ${n.number}'s name reaches the scrollbar`)
  }
  // And the band is used rather than hugged: the old screen put everything in
  // the top half. The deepest and highest nodes are within a node's height of
  // the band's own edges.
  const ys = roadNodes().map((n) => n.y)
  const top = Math.min(...ys) - (ROAD.node.height + ROAD.node.framePad) / 2
  const bottom = Math.max(...ys) + nodeBlock(roadNodes()[0]!).height
    - (ROAD.node.height + ROAD.node.framePad) / 2
  assert.ok(top - ROAD.band.top < ROAD.node.height,
    `the road leaves ${Math.round(top - ROAD.band.top)} units empty at the top of the band`)
  assert.ok(ROAD.band.bottom - bottom < ROAD.node.height,
    `the road leaves ${Math.round(ROAD.band.bottom - bottom)} units empty at the bottom of the band`)
  // The scrollbar sits below everything the road draws and above the buttons.
  assert.ok(ROAD.scrollbar.y - ROAD.scrollbar.height / 2 >= ROAD.band.bottom,
    'the scrollbar is inside the band the nodes use')
})

test('the wave never leaves two neighbours at the same height', () => {
  // A road that goes flat for a stretch reads as a list. The step is chosen so
  // the pattern does not repeat over the whole planned campaign.
  const ys = roadNodes().map((n) => n.y)
  for (let i = 1; i < ys.length; i++) {
    assert.notEqual(ys[i], ys[i - 1], `slots ${i} and ${i + 1} are level with each other`)
  }
  assert.ok(Math.abs(bandCentre() - (ROAD.band.top + ROAD.band.bottom) / 2) > 1,
    'the wave is centred on the band rather than on the block, which drops the last name out of it')
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
  // At twenty levels it IS needed, which is what makes the styling worth
  // having rather than a control nobody sees.
  assert.ok(roadWidth() > display.width * 2,
    'the road is under two screens long; check whether the bar is still needed')
})

test('the screen opens on the level the player is up to, clamped to the ends', () => {
  const visW = display.width
  // Slot one is already at the left end, so there is nothing to scroll back.
  assert.equal(scrollToNode(0, visW), 0)
  // The last slot cannot scroll past the end of the road.
  assert.equal(scrollToNode(ROAD_SLOTS - 1, visW), maxScroll(visW))
  // A slot in the middle is centred.
  const mid = Math.floor(ROAD_SLOTS / 2)
  assert.equal(scrollToNode(mid, visW), nodeCentre(mid).x - visW / 2)
})

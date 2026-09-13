// Where every node on the level-select road sits, and what state it is in.
//
// Phaser-free, like the other systems modules, so the geometry the scene draws
// is the geometry the tests measure. That matters here specifically: the last
// two level briefs both shipped a world map whose cards overlapped, and both
// times the test that was supposed to catch it had RE-DERIVED the scene's
// layout from constants copied out of it. One copy drifted and the check went
// on passing against a screen that no longer existed. There is one copy now.
//
// A NODE'S POSITION IS ITS PLACE IN THE LEVEL ORDER. Nothing else decides it.
// See the note on ROAD_SLOTS in Levels.ts for what that replaced and why.
//
// TWO ROWS OF FIVE, NOT ONE ROW OF TWENTY. The campaign is ten levels and the
// road used to be laid out for twenty, which made it 4310 design units — three
// and a third screens — of which ten slots were padlocks for levels nobody has
// designed. Halving the planned count halved the road to 2210, and 2210 is
// still 1.7 screens: every viewport showed six levels and a scrollbar. Five
// across at a pitch of 240 is exactly the 1280 the design box has, so the whole
// campaign is on the glass at once and the bar is gone.
//
// The cost is vertical, and it is the whole of the tuning here: two stacked
// blocks of node-plus-name want 498 units and the band has 536. See
// `label.reserve` in presentation.json for where the difference came from.

import presentation from '../data/presentation.json' with { type: 'json' }
import { LEVELS, ROAD_SLOTS, isLevelCleared, isLevelUnlocked, type LevelDef } from './Levels.ts'

export const ROAD = presentation.worldMap

/** One slot on the road. `level` is null past the last level that is built. */
export interface RoadNode {
  /** 0-based slot, which is also the index into LEVELS where one exists. */
  index: number
  /** What the badge shows. 1-based, because players count from one. */
  number: number
  level: LevelDef | null
  x: number
  y: number
}

/**
 * Cleared, open or locked — and every unbuilt slot is locked.
 *
 * Three states, because three is what a player has to be able to tell apart:
 * where they have been, where they are, and where they cannot go yet.
 */
export type NodeState = 'cleared' | 'open' | 'locked'

export interface Rect { x: number; y: number; width: number; height: number }
export interface Point { x: number; y: number }

/** Half the framed node, which is the box that actually has to fit. */
const halfW = (): number => (ROAD.node.width + ROAD.node.framePad) / 2
const halfH = (): number => (ROAD.node.height + ROAD.node.framePad) / 2

/** How many nodes are on one row of the road. Never more than there are. */
export function perRow(): number {
  return Math.min(ROAD_SLOTS, Math.max(1, ROAD.rows.perRow))
}

/** How many rows the road is folded into. */
export function rowCount(): number {
  return Math.ceil(ROAD_SLOTS / perRow())
}

/**
 * One slot's row, and WHERE ALONG THE ROW it sits.
 *
 * `column` is its place in level order within the row; `slot` is its place on
 * the screen, and on every second row those two run opposite ways. That is the
 * snake: row one left to right, row two right to left, so the eye leaves the
 * end of one row and arrives at the start of the next without crossing the
 * screen. A layout where both rows ran left to right would need a return line
 * back across everything already read.
 */
export function placeOf(i: number): { row: number; column: number; slot: number } {
  const per = perRow()
  const row = Math.floor(i / per)
  const column = i % per
  return { row, column, slot: row % 2 === 0 ? column : per - 1 - column }
}

/** The height of one node and the room reserved under it for its name. */
export function blockHeight(): number {
  return halfH() * 2 + ROAD.label.gap + ROAD.label.reserve
}

/** Distance between one row's node centres and the next row's. */
export function rowPitch(): number {
  return blockHeight() + ROAD.rows.gap
}

/**
 * Everything the road occupies vertically: both rows, both label blocks, and
 * the full swing of the wave.
 */
export function roadHeight(): number {
  return rowPitch() * (rowCount() - 1) + ROAD.sway.amplitude * 2 + blockHeight()
}

/**
 * The height row 0's wave is centred on.
 *
 * NOT the middle of the band. A node's name hangs below it and its unlock
 * line below that, so centring the wave itself would push the deepest name
 * past the bottom of the band while leaving the same amount of empty air at
 * the top — which is the shape the old screen had, content in the top half
 * and nothing under it. Centring the WHOLE BLOCK instead spreads the road over
 * the band, which is the same rule the single-row version followed and is now
 * applied to both rows at once.
 */
export function rowBaseline(row: number): number {
  const band = ROAD.band.bottom - ROAD.band.top
  const top = ROAD.band.top + (band - roadHeight()) / 2
  return top + ROAD.sway.amplitude + halfH() + row * rowPitch()
}

/**
 * Where slot `i` sits, in world units.
 *
 * THE WAVE IS A FUNCTION OF THE SCREEN SLOT, NOT OF THE LEVEL NUMBER, and that
 * is what keeps two rows apart. Both rows ride the same wave, so the vertical
 * clearance between a row's deepest name and the next row's frame is
 * `rows.gap` at every column rather than `rows.gap` at one column and nothing
 * at another. Phase it off the level number instead and the two rows drift in
 * and out of step: at an amplitude the band can afford, the second row's frame
 * lands 14 units inside the first row's captions.
 */
export function nodeCentre(i: number): Point {
  const { row, slot } = placeOf(i)
  return {
    x: ROAD.margin + ROAD.node.width / 2 + slot * ROAD.pitch,
    y: rowBaseline(row) + ROAD.sway.amplitude * Math.sin(slot * ROAD.sway.step),
  }
}

/** Every slot on the road, in level order, built and unbuilt alike. */
export function roadNodes(): RoadNode[] {
  const out: RoadNode[] = []
  for (let i = 0; i < ROAD_SLOTS; i++) {
    out.push({ index: i, number: i + 1, level: LEVELS[i] ?? null, ...nodeCentre(i) })
  }
  return out
}

/**
 * The polyline the road is painted along: every node in level order, with a
 * bowed turn where one row hands over to the next.
 *
 * WITHOUT THE BOW THE TURN IS A VERTICAL DROP. The last node of a row and the
 * first node of the next share a screen slot, so a straight line between them
 * is a plumb line — which reads as a link between two lists rather than as a
 * road bending round. Three points bulging outwards, away from the rest of the
 * road, make it a turn. The bulge goes right at the right-hand end and left at
 * the left-hand end, which is the side with nothing on it.
 */
export function roadPath(): Point[] {
  const per = perRow()
  const out: Point[] = []
  for (let i = 0; i < ROAD_SLOTS; i++) {
    const here = nodeCentre(i)
    out.push(here)
    const next = i + 1
    if (next >= ROAD_SLOTS || placeOf(next).row === placeOf(i).row) continue
    const to = nodeCentre(next)
    // Outwards is whichever end of the road this row finished at.
    const dir = placeOf(i).slot === per - 1 ? 1 : -1
    for (const t of [0.25, 0.5, 0.75]) {
      out.push({
        x: here.x + dir * ROAD.rows.turn * Math.sin(t * Math.PI),
        y: here.y + (to.y - here.y) * t,
      })
    }
  }
  return out
}

/** How wide the whole road is, margins included. */
export function roadWidth(): number {
  return ROAD.margin * 2 + ROAD.node.width + (perRow() - 1) * ROAD.pitch
}

export function nodeState(node: RoadNode, cleared: readonly string[]): NodeState {
  if (!node.level) return 'locked'
  if (isLevelCleared(node.level.id, cleared)) return 'cleared'
  return isLevelUnlocked(node.level.id, cleared) ? 'open' : 'locked'
}

/** The framed picture, which is what a neighbour must not touch. */
export function nodeRect(node: RoadNode): Rect {
  return {
    x: node.x - halfW(), y: node.y - halfH(),
    width: halfW() * 2, height: halfH() * 2,
  }
}

/**
 * The node AND the room reserved under it for its name.
 *
 * The thing that actually collided on the old screen was never two cards: it
 * was one card's two-line caption lying across the next card. So this is the
 * box the overlap test uses.
 */
export function nodeBlock(node: RoadNode): Rect {
  const r = nodeRect(node)
  return { ...r, height: blockHeight() }
}

/**
 * How far the road may be scrolled, given how much of the world is on screen.
 *
 * Zero when the whole road fits — which is also what says the scrollbar must
 * not be drawn. AT TEN LEVELS IN TWO ROWS THIS IS ALWAYS ZERO on any viewport
 * the game runs at: the road is exactly the 1280 of the design box and the
 * fitted camera never sees less than the box. It is kept because "the bar is
 * absent when the road fits" is the rule, not "there is no bar" — a planned
 * count that outgrew two rows would bring both back, and a screen that owns
 * the arithmetic cannot be surprised by it.
 */
export function maxScroll(visibleWidth: number): number {
  return Math.max(0, roadWidth() - visibleWidth)
}

/**
 * The road offset that puts slot `i` in the middle of the visible width,
 * clamped to the ends. What the screen opens on, so a player arrives looking
 * at the level they are actually up to rather than at level one forever.
 */
export function scrollToNode(i: number, visibleWidth: number): number {
  const centred = nodeCentre(i).x - visibleWidth / 2
  return Math.max(0, Math.min(maxScroll(visibleWidth), centred))
}

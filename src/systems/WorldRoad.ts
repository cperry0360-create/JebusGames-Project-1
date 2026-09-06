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

/** Half the framed node, which is the box that actually has to fit. */
const halfW = (): number => (ROAD.node.width + ROAD.node.framePad) / 2
const halfH = (): number => (ROAD.node.height + ROAD.node.framePad) / 2

/**
 * The height the wave is centred on.
 *
 * NOT the middle of the band. A node's name hangs below it and its unlock
 * line below that, so centring the wave itself would push the deepest name
 * past the bottom of the band while leaving the same amount of empty air at
 * the top — which is the shape the old screen had, content in the top half
 * and nothing under it. Centring the BLOCK instead spreads the road over the
 * whole band.
 */
export function bandCentre(): number {
  const up = halfH()
  const down = halfH() + ROAD.label.gap + ROAD.label.reserve
  return (ROAD.band.top + up + (ROAD.band.bottom - down)) / 2
}

/** Where slot `i` sits, in world units. */
export function nodeCentre(i: number): { x: number; y: number } {
  return {
    x: ROAD.margin + ROAD.node.width / 2 + i * ROAD.pitch,
    y: bandCentre() + ROAD.sway.amplitude * Math.sin(i * ROAD.sway.step),
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

/** How wide the whole road is, margins included. */
export function roadWidth(): number {
  return ROAD.margin * 2 + ROAD.node.width + (ROAD_SLOTS - 1) * ROAD.pitch
}

export function nodeState(node: RoadNode, runsCleared: number): NodeState {
  if (!node.level) return 'locked'
  if (isLevelCleared(node.level.id, runsCleared)) return 'cleared'
  return isLevelUnlocked(node.level.id, runsCleared) ? 'open' : 'locked'
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
  return { ...r, height: r.height + ROAD.label.gap + ROAD.label.reserve }
}

/**
 * How far the road may be scrolled, given how much of the world is on screen.
 *
 * Zero when the whole road fits — which is also what says the scrollbar must
 * not be drawn. The screen it replaced had a bar for an axis it did not
 * scroll on.
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

// Picks which road tile *role* belongs at each road tile. It never names a
// sprite: the scene resolves the role through the art manifest, so a new art
// pack is a change to art.json alone.
//
// The pack ships grass-over-dirt transitions rather than a one-tile road, so
// the lane is two tiles wide and every road tile has grass on at most one side
// (plus corners):
//   edge     grass along one side
//   outer    grass wrapping two adjacent sides, i.e. the outside of a turn
//   inner    grass poking into a single corner, i.e. the inside of a turn

import type { RoadRole } from './SpritePicker.ts'

export type IsRoad = (col: number, row: number) => boolean

/** Returns the role for a road tile, or null for open road with no edge. */
export function roadRole(isRoad: IsRoad, col: number, row: number): RoadRole | null {
  const n = !isRoad(col, row - 1)
  const s = !isRoad(col, row + 1)
  const w = !isRoad(col - 1, row)
  const e = !isRoad(col + 1, row)
  const sides = (n ? 1 : 0) + (s ? 1 : 0) + (w ? 1 : 0) + (e ? 1 : 0)

  if (sides === 1) {
    if (n) return 'edge-n'
    if (s) return 'edge-s'
    if (w) return 'edge-w'
    return 'edge-e'
  }

  if (sides === 2) {
    if (n && w) return 'outer-nw'
    if (n && e) return 'outer-ne'
    if (s && w) return 'outer-sw'
    if (s && e) return 'outer-se'
    // Opposite sides means a one-tile-wide neck; the pack has no such tile,
    // so fall back to open road rather than drawing something wrong.
    return null
  }

  if (sides === 0) {
    const corners: Array<{ grass: boolean; role: RoadRole }> = [
      { grass: !isRoad(col - 1, row - 1), role: 'inner-nw' },
      { grass: !isRoad(col + 1, row - 1), role: 'inner-ne' },
      { grass: !isRoad(col - 1, row + 1), role: 'inner-sw' },
      { grass: !isRoad(col + 1, row + 1), role: 'inner-se' },
    ].filter((c) => c.grass)
    if (corners.length === 1) return corners[0].role
    return null
  }

  return null
}

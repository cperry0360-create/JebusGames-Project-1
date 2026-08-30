// Picks the right Kenney road sprite for each road tile.
//
// The pack ships grass-over-dirt transitions rather than a 1-tile road, so the
// lane is two tiles wide and every road tile has grass on at most one side
// (plus corners). Sprite keys map to the tiles identified in art.json:
//   edges    grass along one side
//   outer    grass wrapping two adjacent sides, i.e. the outside of a turn
//   inner    grass poking into a single corner, i.e. the inside of a turn

export type IsRoad = (col: number, row: number) => boolean

/** Returns the sprite key for a road tile, or null for open road. */
export function roadSprite(isRoad: IsRoad, col: number, row: number): string | null {
  const n = !isRoad(col, row - 1)
  const s = !isRoad(col, row + 1)
  const w = !isRoad(col - 1, row)
  const e = !isRoad(col + 1, row)
  const sides = (n ? 1 : 0) + (s ? 1 : 0) + (w ? 1 : 0) + (e ? 1 : 0)

  if (sides === 1) {
    if (n) return 'road-edge-n'
    if (s) return 'road-edge-s'
    if (w) return 'road-edge-w'
    return 'road-edge-e'
  }

  if (sides === 2) {
    if (n && w) return 'road-outer-nw'
    if (n && e) return 'road-outer-ne'
    if (s && w) return 'road-outer-sw'
    if (s && e) return 'road-outer-se'
    // Opposite sides means a one-tile-wide neck; the pack has no such tile,
    // so fall back to open road rather than drawing something wrong.
    return null
  }

  if (sides === 0) {
    const corners = [
      { grass: !isRoad(col - 1, row - 1), key: 'road-inner-nw' },
      { grass: !isRoad(col + 1, row - 1), key: 'road-inner-ne' },
      { grass: !isRoad(col - 1, row + 1), key: 'road-inner-sw' },
      { grass: !isRoad(col + 1, row + 1), key: 'road-inner-se' },
    ].filter((c) => c.grass)
    if (corners.length === 1) return corners[0].key
    return null
  }

  return null
}

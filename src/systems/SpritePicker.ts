// The Phaser-free, JSON-free half of the art layer, so the variant picking and
// the road-role vocabulary can be tested on plain node.

import type { WeightedSprite } from '../types.ts'

export type RoadRole =
  | 'edge-n' | 'edge-s' | 'edge-w' | 'edge-e'
  | 'outer-nw' | 'outer-ne' | 'outer-sw' | 'outer-se'
  | 'inner-nw' | 'inner-ne' | 'inner-sw' | 'inner-se'

export const ROAD_ROLES: RoadRole[] = [
  'edge-n', 'edge-s', 'edge-w', 'edge-e',
  'outer-nw', 'outer-ne', 'outer-sw', 'outer-se',
  'inner-nw', 'inner-ne', 'inner-sw', 'inner-se',
]

/** Deterministic given a deterministic roll in [0, 1). */
export function pickVariant(list: WeightedSprite[], roll: number): string {
  const total = list.reduce((a, w) => a + w.weight, 0)
  let n = roll * total
  for (const w of list) {
    n -= w.weight
    if (n <= 0) return w.key
  }
  return list[list.length - 1].key
}

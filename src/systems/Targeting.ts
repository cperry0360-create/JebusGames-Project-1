// Target selection, kept free of Phaser so it can be reasoned about and
// tested on its own.

export interface Targetable {
  x: number
  y: number
  /** Distance travelled along the lane. Higher means closer to the exit. */
  distance: number
  alive: boolean
}

function inRange(t: Targetable, x: number, y: number, range: number): boolean {
  const dx = t.x - x
  const dy = t.y - y
  return dx * dx + dy * dy <= range * range
}

/** Standard tower-defense default: hit whatever is furthest along the lane,
 *  so leaks are prevented before damage is spread around. */
export function pickFirst<T extends Targetable>(candidates: T[], x: number, y: number, range: number): T | null {
  let best: T | null = null
  for (const c of candidates) {
    if (!c.alive || !inRange(c, x, y, range)) continue
    if (best === null || c.distance > best.distance) best = c
  }
  return best
}

/** Used by the hero, who fights what is on top of him rather than what is
 *  closest to the exit. */
export function pickNearest<T extends Targetable>(candidates: T[], x: number, y: number, range: number): T | null {
  let best: T | null = null
  let bestDist = Infinity
  for (const c of candidates) {
    if (!c.alive || !inRange(c, x, y, range)) continue
    const d = (c.x - x) ** 2 + (c.y - y) ** 2
    if (d < bestDist) {
      bestDist = d
      best = c
    }
  }
  return best
}

export function withinRadius<T extends Targetable>(candidates: T[], x: number, y: number, radius: number): T[] {
  return candidates.filter((c) => c.alive && inRange(c, x, y, radius))
}

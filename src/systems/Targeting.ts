// Target selection, kept free of Phaser so it can be reasoned about and
// tested on its own.

/** The layer a thing moves through when it does not say. */
export const GROUND = 'ground'
/** The layer that only air-capable towers may shoot. */
export const AIR = 'air'
/** What a tower can shoot when it does not say. Ground only, deliberately: a
 *  tower that forgets to declare itself must not silently gain air. */
export const GROUND_ONLY: readonly string[] = [GROUND]

export interface Targetable {
  x: number
  y: number
  /** Distance travelled along the lane. Higher means closer to the exit. */
  distance: number
  alive: boolean
  /** What it moves through. Absent means ground. */
  layer?: string
}

function inRange(t: Targetable, x: number, y: number, range: number): boolean {
  const dx = t.x - x
  const dy = t.y - y
  return dx * dx + dy * dy <= range * range
}

/** The layer a target is on, with the default applied in ONE place so nothing
 *  else has to remember what absent means. */
export function layerOf(t: { layer?: string }): string {
  return t.layer ?? GROUND
}

/**
 * Whether a shooter that can hit `targets` may shoot something on `layer`.
 *
 * `targets` undefined means "no filter at all" rather than "ground only", and
 * the difference matters: the hero, the summoned fighters and every ability
 * pass nothing and hit whatever is in reach, which is what they did before
 * layers existed. Only towers pass a list.
 */
export function canHit(targets: readonly string[] | undefined, layer: string): boolean {
  return targets === undefined || targets.includes(layer)
}

/** Standard tower-defense default: hit whatever is furthest along the lane,
 *  so leaks are prevented before damage is spread around. */
export function pickFirst<T extends Targetable>(
  candidates: T[], x: number, y: number, range: number, targets?: readonly string[],
): T | null {
  let best: T | null = null
  for (const c of candidates) {
    if (!c.alive || !inRange(c, x, y, range)) continue
    if (!canHit(targets, layerOf(c))) continue
    if (best === null || c.distance > best.distance) best = c
  }
  return best
}

/** Used by the hero, who fights what is on top of him rather than what is
 *  closest to the exit. */
export function pickNearest<T extends Targetable>(
  candidates: T[], x: number, y: number, range: number, targets?: readonly string[],
): T | null {
  let best: T | null = null
  let bestDist = Infinity
  for (const c of candidates) {
    if (!c.alive || !inRange(c, x, y, range)) continue
    if (!canHit(targets, layerOf(c))) continue
    const d = (c.x - x) ** 2 + (c.y - y) ** 2
    if (d < bestDist) {
      bestDist = d
      best = c
    }
  }
  return best
}

export function withinRadius<T extends Targetable>(
  candidates: T[], x: number, y: number, radius: number, targets?: readonly string[],
): T[] {
  return candidates.filter((c) => c.alive && inRange(c, x, y, radius) && canHit(targets, layerOf(c)))
}

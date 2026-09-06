/**
 * The Beacon's aura: who it lifts, by how much, and when it stops.
 *
 * Phaser-free and in its own file for one reason -- THE GAME AND THE SOAK HAVE
 * TO AGREE. The rule used to live inside `GameScene.refreshSupport`, where the
 * headless simulator could not reach it, so `tools/soak/Sim.ts` modelled no
 * aura at all: every soaked board that drew a Beacon was scored as a board
 * with a dead tower on it, and every win rate this repository has ever printed
 * understated one. Two copies of the rule would have drifted the same way
 * again, so there is one, and both callers read it.
 *
 * A DARK BEACON LIFTS NOTHING. `dark` is the whole of that rule and it is
 * checked here rather than at either call site, because it is exactly the
 * check that went missing the first time: `landDisable` recomputed support and
 * the recompute never asked whether the source was switched off, so a boss
 * could take a Beacon out and every gun it covered kept the bonus.
 */

/** A tower handing out an aura, as the rule sees one. */
export interface AuraSource {
  x: number
  y: number
  /** The aura's reach. 0 for anything that is not a support tower. */
  radius: number
  /** Added to the receiver's damage as a fraction of its own base. */
  damageBonus: number
  /** Added to the receiver's range as a fraction of its own. */
  rangeBonus: number
  /** Flat armour pierce granted to the receiver. */
  pierce: number
  /** True while the tower is switched off by a boss. */
  dark: boolean
}

/** What one tower is getting from every Beacon that covers it. */
export interface Aura {
  damage: number
  range: number
  pierce: number
}

export const NO_AURA: Aura = { damage: 0, range: 0, pierce: 0 }

/**
 * Everything the sources at `sources` grant a tower standing at `x, y`.
 *
 * Bonuses STACK: two Beacons covering the same gun add up, which is what makes
 * a second one on a tight board a real choice against a sixth gun. The radius
 * is inclusive, so a tower exactly on the edge is covered.
 */
export function auraAt(x: number, y: number, sources: readonly AuraSource[]): Aura {
  let damage = 0
  let range = 0
  let pierce = 0
  for (const s of sources) {
    if (s.radius <= 0 || s.dark) continue
    if (Math.hypot(s.x - x, s.y - y) > s.radius) continue
    damage += s.damageBonus
    range += s.rangeBonus
    pierce += s.pierce
  }
  return { damage, range, pierce }
}

/** How many of these sources are switched off, which is what the scene watches
 *  to know that an aura has to be recomputed. */
export function darkCount(sources: readonly AuraSource[]): number {
  let n = 0
  for (const s of sources) if (s.radius > 0 && s.dark) n++
  return n
}

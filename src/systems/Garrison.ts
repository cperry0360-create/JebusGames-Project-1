// The two garrison rules that are not geometry: who a lad swings at when
// nothing is holding still for him, and what is left when his tower goes away.
//
// Phaser-free like the other systems modules, and split out for one reason:
// both of these shipped wrong inside GameScene where nothing in `tests/` could
// see them. A boss walked through a line of lads untouched because the scene
// only ever handed a soldier the enemy it was HOLDING, and a boss is
// `blockable: false` so it is never held by anybody. A sold tower left its lads
// on the road forever because the garrison stayed in the scene's list after the
// tower was spliced out of its own.
//
// Rally.ts is where a rally point comes from. This is what the lads standing on
// it do.

/** What these rules need off an enemy, and nothing more. */
export interface SwingCandidate {
  alive: boolean
  x: number
  y: number
  /**
   * Whether a lad can take hold of it.
   *
   * False for a boss, which is unblockable by DESIGN -- a player who can park
   * one on two soldiers has turned the fight off -- and for a flyer, which is
   * unblockable by physics. Both keep walking; neither used to take a scratch
   * on the way past, which is the bug.
   */
  blockable: boolean
  /** Mind-controlled enemies are fighting for the player. */
  controlled?: boolean
}

/**
 * The nearest thing a lad may swing at but may NOT hold.
 *
 * NEAREST, not furthest along the lane. A tower picks the enemy closest to the
 * exit because it is choosing between targets across its whole range; a lad is
 * swinging at whatever is walking through him, and `soldierBlockRange` is about
 * an arm's length. "Furthest along" over that distance is a coin toss that
 * reads as the lad ignoring the thing on top of him.
 *
 * Controlled enemies are excluded for the reason the tower and hero targeting
 * excludes them: they are fighting for the player, and a lad killing one on the
 * frame it turned makes the ability read as broken.
 */
export function unblockableNear<T extends SwingCandidate>(
  enemies: readonly T[], x: number, y: number, range: number,
): T | null {
  let best: T | null = null
  let bestDist = Infinity
  for (const e of enemies) {
    if (!e.alive || e.blockable || e.controlled === true) continue
    const d = (e.x - x) ** 2 + (e.y - y) ** 2
    if (d > range * range || d >= bestDist) continue
    bestDist = d
    best = e
  }
  return best
}

/**
 * What a lad swings at this frame.
 *
 * `held` is whatever the scene's one engagement pass gave him, and it wins:
 * a lad with an enemy pinned in front of him is already in a fight and does not
 * go looking for a second one. Only when he is holding nothing does he take a
 * swing at what is walking past -- and taking a swing is ALL he does. The enemy
 * is not held, its `blocker` is not set, it does not stop, and it stays as
 * unblockable as it was: a boss walks through the garrison at full speed and
 * loses some health doing it.
 */
export function swingTarget<T extends SwingCandidate>(
  held: T | null, enemies: readonly T[], x: number, y: number, range: number,
): T | null {
  if (held) return held
  return unblockableNear(enemies, x, y, range)
}

/**
 * Strikes a tower's garrison off the list and hands back its lads.
 *
 * The caller destroys them and releases anything holding onto them; this owns
 * the one step that was missing and that nothing else could do afterwards --
 * taking the garrison OUT of the list. A garrison whose tower has been sold is
 * still ticked, still compares `soldiers.length` against a tier it can still
 * read off the destroyed tower object, and so still calls `manGarrison` to
 * replace every lad that falls. The lads outlive the tower by the whole rest of
 * the run.
 *
 * Returns an empty array for a tower that has no garrison, so every caller can
 * call it unconditionally rather than asking first.
 */
export function removeGarrison<T, S>(
  garrisons: Array<{ tower: T; soldiers: S[] }>, tower: T,
): S[] {
  const i = garrisons.findIndex((g) => g.tower === tower)
  if (i < 0) return []
  return garrisons.splice(i, 1)[0]!.soldiers
}

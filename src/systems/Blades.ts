// The Blade Rig's blades: a continuous cost for standing where it is driving.
//
// Phaser-free, like EnemyAura.ts and PerformanceGate.ts and for the same two
// reasons: the rule can be driven by a test without a scene, and the soak can
// import the identical function instead of re-implementing it slightly wrong.
// It takes plain coordinates rather than entities.
//
// WHY THIS EXISTS AT ALL. There was NO continuous contact-damage mechanism in
// this repository before level 7. Everything that hurts a player unit is either
// an attack from something HOLDING it -- `damageBlocker`, driven by the
// enemy's own `damage` and `attackInterval` -- or a one-shot at a point, which
// is the Consultant's `deathBlast`. The Blade Rig is neither: it is
// `blockable: false`, so nothing ever holds it, and the blades are on the whole
// time rather than at one instant. This is the smallest thing that works: a
// radius, a rate, and a list of positions, applied per frame.
//
// TOWERS ARE NOT IN SCOPE and there is no field to put them in. A tower is a
// building on a pad beside the road; the blades cut things standing IN it.
// Leaving the option out means nobody can turn it on by accident.

/** level7.json's `blades` block. */
export interface BladesDef {
  /** World pixels from the Rig's own position within which a unit is cut. */
  radius: number
  /** Damage per second while in contact. Applied as `rate * dt`, so a unit
   *  that clips the edge of the sweep pays for the frames it was there. */
  damagePerSecond: number
  /**
   * An impact sheet played AT THE CONTACT POINT, as a manifest key.
   *
   * Level 7's Rig has none and the mechanic worked without one, which is the
   * fault it shipped with: a hero standing in the sweep lost health with
   * nothing on screen to say why. Level 9's No-Pilot is the same mechanic and
   * it is the whole character -- an out-of-control charge is nothing if the
   * crash is invisible -- so the crash sheet plays where the damage lands, in
   * the frame it lands.
   *
   * Optional, so level 7 is untouched.
   */
  fx?: string
  /** How big the impact is drawn, in world pixels. Square. */
  fxSize?: number
  /**
   * Seconds between impacts from one rig, however many things it is cutting.
   *
   * The damage is continuous and the picture must not be: at 60 fps a hero
   * standing in the sweep for two seconds would start 120 overlapping
   * animations, which is a white square and a frame-rate problem rather than a
   * crash. One impact per rig per interval is what a collision looks like.
   */
  fxCooldown?: number
}

/** A thing that can be cut: the hero, a fighter, a garrison soldier. */
export interface BladeTarget {
  x: number
  y: number
}

/**
 * Asserts the shape and hands it back, or null for a level without blades.
 *
 * `levelRules` returns null for every level that names no rules file, so this
 * is a no-op on levels 1 to 6 and 8 by construction rather than by an `if`
 * somebody remembered to write.
 */
export function bladesFrom(rules: { blades?: unknown } | null): BladesDef | null {
  const b = rules?.blades as Partial<BladesDef> | undefined
  if (!b) return null
  if (typeof b.radius !== 'number' || !(b.radius > 0)) {
    throw new Error('level rules declare `blades` without a positive radius')
  }
  if (typeof b.damagePerSecond !== 'number' || !(b.damagePerSecond > 0)) {
    throw new Error('level rules declare `blades` without a positive damagePerSecond')
  }
  const out: BladesDef = { radius: b.radius, damagePerSecond: b.damagePerSecond }
  if (typeof b.fx === 'string' && b.fx) {
    out.fx = b.fx
    out.fxSize = typeof b.fxSize === 'number' && b.fxSize > 0 ? b.fxSize : 150
    out.fxCooldown = typeof b.fxCooldown === 'number' && b.fxCooldown > 0 ? b.fxCooldown : 0.45
  }
  return out
}

/**
 * The damage one target takes this frame from the rigs around it, or 0.
 *
 * TAKES THE WORST RIG RATHER THAN SUMMING, which matters on the two waves
 * where a Rig overlaps the next group: the brief says the Rigs arrive ONE AT A
 * TIME, so two of them sharing a target is not a case the level produces, and
 * a max rather than a sum means it never becomes one by accident if a later
 * wave table changes its mind.
 */
export function bladeDamage(
  target: BladeTarget,
  rigs: readonly BladeTarget[],
  def: BladesDef,
  dt: number,
): number {
  if (dt <= 0) return 0
  let worst = 0
  for (const rig of rigs) {
    const dx = target.x - rig.x
    const dy = target.y - rig.y
    if (dx * dx + dy * dy > def.radius * def.radius) continue
    if (def.damagePerSecond > worst) worst = def.damagePerSecond
  }
  return worst * dt
}

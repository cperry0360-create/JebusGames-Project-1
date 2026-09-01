// Arriving and leaving: the two ends of the lane.
//
// Enemies used to appear at the map's left edge already at full opacity, which
// put them on top of the archway's stonework rather than behind it, and they
// walked into the closed gate at the right and thinned away to nothing. Both
// read as sprites being switched on and off rather than as anything entering
// or leaving a place.
//
// Phaser-free on purpose. What an emerging enemy looks like, and whether a
// gate impact is allowed to shake the screen, are both arithmetic — and
// arithmetic that decides what the player sees should be checkable without a
// canvas.

export interface EmergeConfig {
  /** How long the fade and the scale-up take once the arch mouth is reached. */
  fadeMs: number
  /** Scale at the moment of emerging. Reaches 1 when the fade completes. */
  startScale: number
}

export interface EmergeState {
  alpha: number
  scale: number
}

/**
 * How visible an enemy is on its way out of the arch.
 *
 * `msSinceMouth` is negative while it is still behind the arch, which is the
 * case that matters: an enemy that has not reached the mouth is not dim, it is
 * NOT THERE. Returning alpha 0 rather than a small alpha is what stops a
 * ghost being visible against the stone at the map's edge.
 */
export function emergeState(msSinceMouth: number, cfg: EmergeConfig): EmergeState {
  if (msSinceMouth < 0) return { alpha: 0, scale: cfg.startScale }
  const t = cfg.fadeMs <= 0 ? 1 : Math.min(1, msSinceMouth / cfg.fadeMs)
  return { alpha: t, scale: cfg.startScale + (1 - cfg.startScale) * t }
}

export interface GateShakeConfig {
  /** No second shake inside this window. A wave arriving together would
   *  otherwise hold the camera in continuous motion. */
  minGapMs: number
  /** One arrival. */
  baseIntensity: number
  /** Each impact folded into the same shake adds this much... */
  perExtra: number
  /** ...up to here, however many arrive. */
  maxIntensity: number
  durationMs: number
}

export interface GateShake {
  play: boolean
  intensity: number
}

/**
 * Whether this gate impact shakes the screen, and how hard.
 *
 * Two separate limits, because they guard different failures. The gap stops a
 * stream of arrivals turning into one long rumble with no individual impacts
 * legible in it. The cap stops a wave that arrives together hitting with the
 * force of the whole wave at once — the last wave lands thirteen enemies, and
 * thirteen times a single shake is a screen the player cannot read.
 *
 * `burst` is how many impacts have landed since the last shake was allowed,
 * this one included, so a group that arrives together still reads as heavier
 * than one straggler.
 */
export function gateShake(
  nowMs: number,
  lastShakeMs: number,
  burst: number,
  cfg: GateShakeConfig,
): GateShake {
  if (nowMs - lastShakeMs < cfg.minGapMs) return { play: false, intensity: 0 }
  const extra = Math.max(0, burst - 1) * cfg.perExtra
  return {
    play: true,
    intensity: Math.min(cfg.maxIntensity, cfg.baseIntensity + extra),
  }
}

/**
 * The distance along the lane at which the lane first reaches `targetX`.
 *
 * The arch mouth and the gate face are measured off the painted plate as map
 * positions, because that is what they are; the enemy walks in lane distance.
 * This is the conversion, done once at scene start rather than per frame.
 *
 * Falls back to the full length, so a target the lane never reaches means "the
 * far end" rather than zero — an enemy that leaks immediately would be a much
 * worse failure than one that walks too far.
 */
export function distanceAtX(waypoints: number[][], targetX: number): number {
  let travelled = 0
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1]!
    const b = waypoints[i]!
    const seg = Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!)
    const spans = (a[0]! - targetX) * (b[0]! - targetX) <= 0
    if (spans && b[0]! !== a[0]!) {
      return travelled + seg * ((targetX - a[0]!) / (b[0]! - a[0]!))
    }
    travelled += seg
  }
  return travelled
}

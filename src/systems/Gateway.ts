// Arriving and leaving: the two ends of the lane.
//
// Enemies used to appear at the map's left edge already at full opacity, which
// put them on top of the archway's stonework rather than behind it. Both ends
// read as sprites being switched on and off rather than as anything entering
// or leaving a place.
//
// Phaser-free on purpose. What an emerging enemy looks like, and how much of
// one is left as it walks out through the gate, are both arithmetic — and
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

/**
 * How visible an enemy is on its way OUT, through the gate.
 *
 * The gate in this plate is OPEN — two leaves standing apart with a dark gap
 * between them — so there is nothing to hit. It used to be painted shut, and
 * an arrival threw up two dust puffs, played a heavy hit and shook the camera.
 * All three were describing a collision with a gate that is not there.
 *
 * Measured against DISTANCE rather than elapsed time, unlike the way in. On
 * the way in every enemy starts from a standstill behind the arch and the fade
 * is about the reveal, so time is the honest unit. On the way out the gap is
 * about thirteen world pixels wide and the fade has to finish inside it: a
 * timed fade would let a Scrapper walk clean out the far side at full opacity
 * while a Buckethead dissolved before reaching the gap at all.
 */
export function vanishAlpha(distance: number, fromDistance: number, toDistance: number): number {
  if (distance <= fromDistance) return 1
  const span = toDistance - fromDistance
  if (span <= 0) return 0
  return Math.max(0, 1 - (distance - fromDistance) / span)
}

/**
 * The distance along the lane at which the lane first reaches `targetX`.
 *
 * The arch mouth and the gate gap are measured off the painted plate as map
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

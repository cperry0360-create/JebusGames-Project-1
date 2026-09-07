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

/** The three lane distances that decide where an enemy appears and vanishes. */
export interface GateDistances {
  mouthDistance: number
  gateDistance: number
  stopDistance: number
}

/**
 * Those three, for every lane on the map.
 *
 * ONE SET PER LANE, because a map may now have more than one exit and they
 * need not be equidistant from the junction: the trunk's own length is the
 * right answer for the lane it belongs to and the wrong one for a longer arm,
 * and the enemy on that arm would have vanished and leaked early.
 *
 * `emergeFromX` and the two exit x's are read off the PAINTED PLATE, so they
 * are map positions and mean the same thing on every lane -- the conversion to
 * a distance is what differs, and `distanceAtX` does it per lane. A lane that
 * never reaches the named x falls back to its own full length, which is what
 * `distanceAtX` already returns and is why a map with no gate at all (levels 2
 * to 5) gets "the end of this lane" for free.
 *
 * Phaser-free, like the rest of this file: which pixel an enemy stops existing
 * at is arithmetic.
 */
export function laneGates(
  lanes: { id: string; waypoints: number[][]; totalLength: number }[],
  ends: { emergeFromX?: number; gateX?: number; vanishX?: number },
): Record<string, GateDistances> {
  const out: Record<string, GateDistances> = {}
  for (const l of lanes) {
    out[l.id] = {
      mouthDistance: ends.emergeFromX !== undefined
        ? distanceAtX(l.waypoints, ends.emergeFromX) : 0,
      gateDistance: ends.gateX !== undefined
        ? distanceAtX(l.waypoints, ends.gateX) : l.totalLength,
      stopDistance: ends.vanishX !== undefined
        ? distanceAtX(l.waypoints, ends.vanishX) : l.totalLength,
    }
  }
  return out
}

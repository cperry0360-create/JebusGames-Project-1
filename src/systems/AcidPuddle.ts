// Batula's puddles, and the meter that makes him worse for having left them.
//
// PUBLIC HUMILIATION. Every three and a half seconds OF MOVEMENT he stops,
// hunches, covers his face and leaves an acid puddle under himself. The puddle
// kills a lad standing in it in about a second and a half and halves the fire
// rate of any tower it touches. It does not hurt him and it does not hurt any
// other enemy — that is deliberate and there is no flag for it. He walks
// through his own trail, so friendly fire would turn the fight into a race he
// loses by standing still.
//
// And every puddle makes him faster and harder-hitting, to a cap. He gets
// angrier the more he embarrasses himself, which is the fight's pressure
// curve: a board that cannot finish him early is fighting a worse Batula late.
//
// Phaser-free. Where a puddle is, what it costs and how long it has left is
// arithmetic; the scene draws a circle at the answer.

export interface AcidRules {
  /** Seconds OF MOVEMENT between drops, not seconds of wall clock. */
  intervalSeconds: number
  stopSeconds: number
  radius: number
  durationSeconds: number
  fadeSeconds: number
  damagePerSecond: number
  tickSeconds: number
  /** What a tower inside the radius has its fire rate multiplied by. */
  towerFireRateMultiplier: number
  /** False, and it stays false. See the file header. */
  harmsEnemies: boolean
}

export interface HumiliationRules {
  maxStacks: number
  speedPerStack: number
  damagePerStack: number
  shoutText: string
  shoutSeconds: number
  shoutFromX: number
  shoutSpreadY: number
  sound: string
}

export interface Puddle {
  x: number
  y: number
  /** Seconds of life left, fade included. */
  left: number
  /** Counts down to the next charge against whatever is standing in it. */
  until: number
}

/**
 * Where Batula is in his own cycle: walking, or stopped and hunched.
 *
 * THE HUMILIATION COUNT IS NOT HERE. It is granted by a puddle, but it is also
 * granted outright by the roar at half health, and it is read by things that
 * know nothing about puddles — his speed and his damage. Keeping it out of the
 * drop cycle keeps each of the two doing one thing.
 */
export interface AcidState {
  /** Seconds of MOVEMENT since the last drop. */
  sinceDrop: number
  /** Seconds left of the stop, or 0 while walking. */
  stopLeft: number
}

export function newAcidState(): AcidState {
  return { sinceDrop: 0, stopLeft: 0 }
}

/**
 * One frame of the boss's own cycle.
 *
 * Returns whether he is HELD this frame — he does not walk while hunched —
 * and whether a puddle is due at his feet on it.
 *
 * THE CLOCK ONLY RUNS WHILE HE MOVES. A Batula frozen by a Deadfall, or
 * standing on a soldier he cannot get past, is not quietly building a puddle
 * he will drop the instant he is free. That is what makes the trail a record
 * of the ground he has covered rather than of how long the fight has taken.
 */
export function tickAcid(
  at: AcidState, dt: number, moving: boolean, rules: AcidRules,
): { state: AcidState; held: boolean; drop: boolean } {
  if (at.stopLeft > 0) {
    const stopLeft = at.stopLeft - dt
    return { state: { ...at, stopLeft: Math.max(0, stopLeft) }, held: true, drop: false }
  }
  if (!moving) return { state: at, held: false, drop: false }
  const sinceDrop = at.sinceDrop + dt
  if (sinceDrop < rules.intervalSeconds) {
    return { state: { ...at, sinceDrop }, held: false, drop: false }
  }
  return {
    // The remainder is carried rather than reset to zero, so a long frame does
    // not lose the part of the interval it overshot by and the trail stays
    // evenly spaced along the road he has covered.
    state: { sinceDrop: sinceDrop - rules.intervalSeconds, stopLeft: rules.stopSeconds },
    held: true,
    drop: true,
  }
}

/** A fresh puddle under a point. Charges immediately, so something already
 *  standing there does not get a free tick before it notices. */
export function makePuddle(x: number, y: number, rules: AcidRules): Puddle {
  return { x, y, left: rules.durationSeconds + rules.fadeSeconds, until: 0 }
}

/**
 * A puddle one frame on, and how many times it should charge.
 *
 * A COUNT rather than a boolean, for the reason the Spike Strip's is: a frame
 * long enough to cover two ticks must not drop one, or the damage becomes a
 * function of the frame rate and the level cannot be balanced.
 */
export function tickPuddle(p: Puddle, dt: number, rules: AcidRules): number {
  p.left -= dt
  if (rules.tickSeconds <= 0) return 0
  p.until -= dt
  let ticks = 0
  while (p.until <= 0 && ticks < 32) {
    ticks++
    p.until += rules.tickSeconds
  }
  return ticks
}

export function puddleExpired(p: Puddle): boolean {
  return p.left <= 0
}

/** 1 while it is at full strength, falling to 0 across the fade. */
export function puddleAlpha(p: Puddle, rules: AcidRules): number {
  if (rules.fadeSeconds <= 0) return p.left > 0 ? 1 : 0
  return Math.max(0, Math.min(1, p.left / rules.fadeSeconds))
}

/** True if (x, y) is inside this puddle. */
export function inPuddle(p: Puddle, x: number, y: number, rules: AcidRules): boolean {
  return Math.hypot(x - p.x, y - p.y) <= rules.radius
}

/**
 * The damage per tick a player unit standing at (x, y) takes.
 *
 * THE HIGHEST, NOT THE SUM. Overlapping puddles do not stack: a boss who
 * paused twice in the same place would otherwise have made a spot that kills a
 * lad on contact, which is not a mechanic anybody asked for and is not
 * something the player can read off the board.
 */
export function damageAt(
  puddles: readonly Puddle[], x: number, y: number, rules: AcidRules,
): number {
  let worst = 0
  for (const p of puddles) {
    if (!inPuddle(p, x, y, rules)) continue
    worst = Math.max(worst, rules.damagePerSecond * rules.tickSeconds)
  }
  return worst
}

/**
 * What a tower at (x, y) has its fire interval multiplied by.
 *
 * The tower takes no damage — only the lads standing outside it do — so this
 * is the whole of what a puddle does to a gun. Returns 1 for a tower on clean
 * ground, which is what makes it safe to multiply into every tower's interval
 * on every level: with no puddles there is nothing to find.
 */
export function towerFireIntervalMultiplier(
  puddles: readonly Puddle[], x: number, y: number, rules: AcidRules,
): number {
  for (const p of puddles) {
    // The fire RATE is halved, so the INTERVAL is doubled. Getting this the
    // wrong way round would make a puddle a buff.
    if (inPuddle(p, x, y, rules)) return 1 / Math.max(0.0001, rules.towerFireRateMultiplier)
  }
  return 1
}

/** One more stack of Humiliation, capped. */
export function humiliate(stacks: number, by: number, rules: HumiliationRules): number {
  return Math.max(0, Math.min(rules.maxStacks, stacks + by))
}

/** What the meter is worth right now: +5% each to speed and damage per stack. */
export function humiliationBonus(
  stacks: number, rules: HumiliationRules,
): { speed: number; damage: number } {
  const n = Math.max(0, Math.min(rules.maxStacks, stacks))
  return {
    speed: 1 + n * rules.speedPerStack,
    damage: 1 + n * rules.damagePerStack,
  }
}

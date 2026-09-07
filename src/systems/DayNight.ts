// Which half of the day level 5 is in, and what that does to a vampire.
//
// The level opens in daylight and turns part way through wave 5. Waves 1 to 4
// are DAY and only the Thrall and Baby Frank walk in them; waves 6 to 12 are
// NIGHT and the full roster does. The flip itself is a moment, not a wave
// boundary — it happens mid-wave, live Thralls turn where they stand, and the
// board changes colour under everything.
//
// THE CLOCK IS SECONDS FROM THE WAVE'S FIRST SPAWN, and it is worth saying why
// it is not a fraction of the wave. A wave has no length until it is over: it
// ends when the field empties, which depends on how fast the board kills. A
// flip at "half way through wave 5" would therefore land at a different moment
// in every run and the soak could not reproduce it — and reproducing it is the
// whole reason the simulator exists.
//
// Phaser-free. What the overlay's colour and alpha are on a given frame is
// arithmetic, and the scene turns the answer into a rectangle.

export type Phase = 'day' | 'night'

/** What one half of the day does. Both halves have all four fields, so
 *  reading them never needs to know which half it is holding. */
export interface PhaseMods {
  /** Overlay colour, as the "0xrrggbb" string JSON can hold. */
  tint: string
  alpha: number
  /** What the light does to a vampire's legs: 0.75 by day, 1.15 by night. */
  vampireSpeedMultiplier: number
  /** Whether a vampire may heal off a player unit at all. */
  vampireLifesteal: boolean
  /** Flat damage a second the sun does to a vampire standing in it. */
  sunDamagePerSecond: number
}

export interface DayNightRules {
  /** 1-based wave the flip happens during. */
  flipWave: number
  /** Seconds into that wave at which it fires. */
  flipAfterSeconds: number
  transitionSeconds: number
  day: PhaseMods
  night: PhaseMods
}

/** Where the flip has got to: which side, and how far through the fade. */
export interface DayNightState {
  phase: Phase
  /** 0 while the fade has not started, 1 once it is finished. */
  progress: number
}

export const DAY_START: DayNightState = { phase: 'day', progress: 0 }

/**
 * True on the frame the flip is due.
 *
 * `alreadyFlipped` is asked rather than assumed because a wave can be re-entered
 * in the simulator's loop and the flip must fire once. The wave index is
 * 0-based here, as it is everywhere else the wave table is walked, and
 * `flipWave` is 1-based because that is how a wave is written down.
 */
export function flipDue(
  waveIndex: number, secondsIntoWave: number, alreadyFlipped: boolean, rules: DayNightRules,
): boolean {
  if (alreadyFlipped) return false
  return waveIndex + 1 >= rules.flipWave && secondsIntoWave >= rules.flipAfterSeconds
}

/** The state `dt` later, once the flip has been triggered. */
export function advanceFlip(at: DayNightState, dt: number, rules: DayNightRules): DayNightState {
  if (at.phase !== 'night') return at
  const t = rules.transitionSeconds <= 0 ? 1 : at.progress + dt / rules.transitionSeconds
  return { phase: 'night', progress: Math.min(1, t) }
}

/** The state the moment the flip fires: night, with the fade at its start. */
export function flipped(): DayNightState {
  return { phase: 'night', progress: 0 }
}

/** The half of the day in force. */
export function modsFor(at: DayNightState, rules: DayNightRules): PhaseMods {
  return at.phase === 'night' ? rules.night : rules.day
}

/**
 * What a vampire's speed is multiplied by right now, and what the sun is
 * costing it a second.
 *
 * BOTH TAKE THE FADE INTO ACCOUNT, so a vampire caught by dusk speeds up over
 * the two and a half seconds the sky takes rather than on one frame. A jump
 * would be the same arithmetic and would read as a bug, and the fade is short
 * enough that it costs the tuning nothing.
 */
export function vampireSpeedMultiplier(at: DayNightState, rules: DayNightRules): number {
  return lerp(rules.day.vampireSpeedMultiplier, rules.night.vampireSpeedMultiplier, blend(at))
}

export function sunDamagePerSecond(at: DayNightState, rules: DayNightRules): number {
  return lerp(rules.day.sunDamagePerSecond, rules.night.sunDamagePerSecond, blend(at))
}

/**
 * Whether a vampire may heal right now.
 *
 * NOT BLENDED, unlike the two above. Half a lifesteal is not a thing, and
 * dusk is when the vampires get their teeth back — so it turns on at the START
 * of the fade rather than at the end of it. The alternative reads as the game
 * withholding the reward for two and a half seconds after it has visibly
 * arrived.
 */
export function lifestealEnabled(at: DayNightState, rules: DayNightRules): boolean {
  return modsFor(at, rules).vampireLifesteal
}

/** The overlay's colour and strength on this frame, for the scene to draw. */
export function overlay(at: DayNightState, rules: DayNightRules): { tint: number; alpha: number } {
  const t = blend(at)
  return {
    tint: lerpColour(colour(rules.day.tint), colour(rules.night.tint), t),
    alpha: lerp(rules.day.alpha, rules.night.alpha, t),
  }
}

/** 0 fully day, 1 fully night. */
function blend(at: DayNightState): number {
  return at.phase === 'night' ? at.progress : 0
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * `"0x1a1a5e"` as a number.
 *
 * JSON has no hex literal, so the colours are written as strings — which is
 * readable, and is also how a `0x` that was meant to be a colour stops being
 * stored as a decimal nobody can check against a swatch.
 */
export function colour(hex: string): number {
  const n = Number(hex)
  return Number.isFinite(n) ? n : 0
}

/** Per channel, not on the packed integer: blending the packed value bleeds
 *  red into green and produces a colour that is on neither end. */
export function lerpColour(a: number, b: number, t: number): number {
  const mix = (shift: number): number => {
    const from = (a >> shift) & 0xff
    const to = (b >> shift) & 0xff
    return Math.round(from + (to - from) * t) & 0xff
  }
  return (mix(16) << 16) | (mix(8) << 8) | mix(0)
}

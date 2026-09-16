// The three difficulty settings, and the seven numbers they move.
//
// Phaser-free like the other systems modules, because "how many lives does a
// Try Hard run start with" is arithmetic — and it is arithmetic the SOAK has
// to agree with the game about. The simulator imports this file, so there is
// one answer rather than two that drift.
//
// IT USED TO BE TWO NUMBERS: starting lives and starting peanuts. The note
// here argued that a third would change which TOWERS are viable rather than
// how hard a level is, and would force every level to be tuned three times.
// Half of that survives and half of it does not, so both halves are stated:
//
//   STILL TRUE. There is no armour scalar, no enemy damage scalar and no
//   enemy speed scalar, and there must not be. The Grinder ignores armour and
//   the Slingshot cuts it, so scaling armour makes one tower better and
//   another nearly useless and the draft decides the run before the player
//   does. Enemy damage and enemy speed do the same thing to the towers whose
//   whole value is their fire rate.
//
//   NO LONGER TRUE. "Every level would have to be tuned three times" is a
//   statement about a target band, and only `normal` has one — the 35-45%
//   band every published win rate is measured in. Lazy Dad Mode is for a
//   young child who is getting frustrated; it is soaked once to confirm it
//   lands somewhere a child gets through, and then left alone.
//
// SO THE HEALTH SCALAR IS HERE, ON LAZY DAD MODE ALONE. It is the only knob
// that touches a level whose failure mode is a boss DPS check — level 2's
// Devil and level 10's Vlaude, where a player arrives with every pad filled
// and money spare and neither extra lives nor a fatter purse changes a thing.
// It does make armour-piercing towers relatively better, exactly as the
// armour objection above says; at 0.6 that distortion is swamped by the
// effect. See reports/2026-09-16-lazy-dad-mode.md.
//
// EVERY MULTIPLIER IS 1 ON `normal` AND ON `try-hard`, and every function
// below returns its input UNTOUCHED when the multiplier is exactly 1. Not
// "rounds to the same integer today" — the same number, by an early return.
// That is what makes `normal` a literal no-op rather than one that happens to
// hold at the values shipped this week.

import data from '../data/difficulty.json' with { type: 'json' }

export interface DifficultyDef {
  id: string
  /** What the selector shows. The id is never shown to a player. */
  name: string
  /** One line under the name on the selector. */
  blurb: string
  livesMultiplier: number
  peanutsMultiplier: number
  /** Peanuts paid for a KILL. The wave-clear bounty is not scaled by it. */
  peanutIncomeMultiplier: number
  /** The countdown between waves. Longer is easier: it is thinking time. */
  waveIntervalMultiplier: number
  /** How long the hero stays off the board. Shorter is easier. */
  heroRespawnMultiplier: number
  /** Every ability's cooldown, the hero's own button included. Shorter is easier. */
  abilityCooldownMultiplier: number
  /** Every enemy's health, bosses included and uniformly. Lower is easier. */
  enemyHealthMultiplier: number
}

const DATA = data as unknown as {
  default: string
  minLives: number
  minEnemyHealth: number
  modes: DifficultyDef[]
}

/**
 * The one shape every scaler below is written in.
 *
 * THE `=== 1` EARLY RETURN IS THE LOAD-BEARING LINE. `Math.round(x * 1)` is
 * not `x` for a non-integer x, and three of these scale seconds — a hero's
 * 25-second revive is an integer today and an ability's cooldown is not. A
 * mode that multiplies by 1 has to hand back the number it was given, bit for
 * bit, or `normal` is only approximately the game that was measured.
 */
const scale = (base: number, by: number, floor: number, round: boolean): number => {
  if (by === 1) return base
  const out = round ? Math.round(base * by) : base * by
  return Math.max(floor, out)
}

/** Every mode, easiest first — which is the order the selector draws. */
export const DIFFICULTIES: DifficultyDef[] = DATA.modes

/**
 * The mode a save with no choice in it plays.
 *
 * Named in the data rather than assumed to be the middle entry or the first
 * one: which mode is the default is a design decision, and a list order is
 * not the place to hide it.
 */
export const DEFAULT_DIFFICULTY_ID: string = DATA.default

export function difficultyDef(id: string | null | undefined): DifficultyDef {
  return DIFFICULTIES.find((d) => d.id === id)
    ?? DIFFICULTIES.find((d) => d.id === DEFAULT_DIFFICULTY_ID)
    ?? DIFFICULTIES[0]!
}

/**
 * An id that is certainly a mode.
 *
 * A save can hold anything — an older build's id, a hand edit, a mode that was
 * renamed — and the answer to all of them is the default. Resolving here
 * rather than repairing the save means one place decides what an unknown id
 * means, which is the same rule `resolveHeroId` and `resolveLevelId` follow.
 */
export function resolveDifficultyId(id: string | null | undefined): string {
  return difficultyDef(id).id
}

/** The name shown to the player, for a HUD readout or an end screen. */
export function difficultyName(id: string | null | undefined): string {
  return difficultyDef(id).name
}

/**
 * How many lives a run on this difficulty starts with.
 *
 * ROUNDED, THEN FLOORED AT `minLives`. A multiplier that could produce zero
 * would end the run on the first leak before the player had done anything,
 * which is not a difficulty setting — it is a broken level. The floor is here
 * rather than at the two call sites so the game and the soak cannot disagree
 * about the edge.
 */
export function startingLives(base: number, id: string | null | undefined): number {
  return Math.max(DATA.minLives, Math.round(base * difficultyDef(id).livesMultiplier))
}

/**
 * How many peanuts a run on this difficulty starts with, BEFORE the opening
 * purse floor.
 *
 * The order matters and it is the reason there is no floor of its own here.
 * `Economy.openingPurse` guarantees the purse covers the cheapest tower this
 * run actually drew, and it is applied to the result of this — so Try Hard's
 * 0.75 makes the opening slower without ever making the game's first
 * instruction, "build a tower", impossible to follow. A second floor in this
 * function would fight the one that already works.
 */
export function startingPeanuts(base: number, id: string | null | undefined): number {
  return Math.max(0, Math.round(base * difficultyDef(id).peanutsMultiplier))
}

/* --------------------------------------------------------------------------
 * THE FIVE LAZY DAD KNOBS.
 *
 * All five are 1 on `normal` and on `try-hard`, so every one of these is the
 * identity function on both — see the `scale` helper. They exist so a young
 * child can finish a level: more money per kill, longer to think between
 * waves, the hero back sooner, the buttons ready sooner, and enemies that die.
 * ------------------------------------------------------------------------ */

/**
 * Peanuts for a kill.
 *
 * THE WAVE-CLEAR BOUNTY IS DELIBERATELY NOT SCALED BY THIS. `peanutsPerWaveCleared`
 * is paid for surviving rather than for shooting, and it is already multiplied
 * up on every level by the fact that a Lazy Dad run clears more waves. Rounded,
 * because a peanut is not divisible in the HUD.
 */
export function peanutIncome(base: number, id: string | null | undefined): number {
  return scale(base, difficultyDef(id).peanutIncomeMultiplier ?? 1, 0, true)
}

/**
 * The countdown before the next wave starts itself.
 *
 * THE BIGGEST OF THE FIVE FOR A CHILD AND THE SMALLEST IN THE SOAK, and both
 * halves of that are worth knowing. A young player's problem is almost never
 * that a wave was too strong; it is that it arrived while they were still
 * deciding where to put a tower. The simulator has no ready phase at all — its
 * builder spends at the wave boundary and the next wave begins on the next
 * line — so this knob is invisible to every win rate the soak reports. It is
 * in the game, it is not in the measurement, and that is stated rather than
 * left to be discovered.
 *
 * NOT ROUNDED. It is a countdown in seconds, not a count of anything.
 */
export function waveInterval(base: number, id: string | null | undefined): number {
  return scale(base, difficultyDef(id).waveIntervalMultiplier ?? 1, 0, false)
}

/** How long the hero is off the board after going down. Seconds, unrounded. */
export function heroRespawnSeconds(base: number, id: string | null | undefined): number {
  return scale(base, difficultyDef(id).heroRespawnMultiplier ?? 1, 0, false)
}

/**
 * An ability's cooldown, in seconds and unrounded.
 *
 * EVERY ABILITY GOES THROUGH IT, the hero's own slot-1 button included, which
 * is the one a child actually presses.
 */
export function abilityCooldown(base: number, id: string | null | undefined): number {
  return scale(base, difficultyDef(id).abilityCooldownMultiplier ?? 1, 0, false)
}

/**
 * An enemy's maximum health, bosses included.
 *
 * UNIFORM BY DESIGN. A scalar that spared bosses would leave the two levels
 * this mode exists for exactly as they are, because both of them fail on a
 * boss and not on the walk up to it.
 *
 * A def with NO health at all stays at 0 rather than being floored to 1.
 * `EnemyDef.maxHealth` is nullable so an unfinished level's boss can exist as
 * data before its number does, and a 0 that silently became a 1 would hide
 * that instead of letting it die visibly on the frame it spawns.
 */
export function enemyHealth(base: number, id: string | null | undefined): number {
  if (base <= 0) return base
  return scale(base, difficultyDef(id).enemyHealthMultiplier ?? 1, DATA.minEnemyHealth, true)
}

// The three difficulty settings, and the two numbers they move.
//
// Phaser-free like the other systems modules, because "how many lives does a
// Try Hard run start with" is arithmetic — and it is arithmetic the SOAK has
// to agree with the game about. The simulator imports this file, so there is
// one answer rather than two that drift.
//
// WHAT THEY CHANGE IS STARTING LIVES AND STARTING PEANUTS, AND NOTHING ELSE.
// The reasoning is in difficulty.json's `_whatTheyChange` and it is worth
// repeating here because this is where somebody would add a third: scaling
// enemy HP or armour or wave timing would change which TOWERS are viable
// rather than how hard the level is, and it would mean tuning every level
// three times instead of once. Lives and money change how much a mistake
// costs. They do not touch the relationship between a tower and the thing it
// is shooting at, so a level tuned on normal stays tuned on all three.

import data from '../data/difficulty.json' with { type: 'json' }

export interface DifficultyDef {
  id: string
  /** What the selector shows. The id is never shown to a player. */
  name: string
  /** One line under the name on the selector. */
  blurb: string
  livesMultiplier: number
  peanutsMultiplier: number
}

const DATA = data as unknown as {
  default: string
  minLives: number
  modes: DifficultyDef[]
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

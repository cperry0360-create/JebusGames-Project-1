// Lifesteal and bleed, and the fact that one turns the other off.
//
// Level 5's whole counterplay loop lives in this file. A vampire that damages
// a player unit heals for a share of what it dealt; a bleeding vampire heals
// for nothing. So sustained chip damage beats burst, because burst puts an
// enemy on the floor and then lets it drink its way back up while the guns
// reload.
//
// Phaser-free, like the other rule modules, and for the reason that matters
// most here: these are the numbers the level is tuned against, so the soak has
// to run the same arithmetic the scene does rather than a paraphrase of it.
// Every function below is called from both.
//
// SCOPED BY CONSTRUCTION. Nothing in here has a default: bleed needs a
// `BleedRules`, and the only place one comes from is `Levels.levelRules`,
// which returns null for every level that does not name a rules file. Levels 1
// to 4 name none, so there is no path by which a tourist can bleed.

/** What bleed does, from level5.json. */
export interface BleedRules {
  maxStacks: number
  /** How long ONE application lasts. Re-hitting refreshes the whole clock. */
  secondsPerStack: number
  /**
   * FLAT damage per stack per second, and the single most important number on
   * the level.
   *
   * Not a share of maximum health, deliberately. Five stacks at one percent of
   * max a second kills any boss in twenty seconds whatever its health is,
   * which takes the boss's health out of the fight entirely — and a
   * sensitivity table over a number that no longer controls anything comes
   * back flat and tells you nothing. Bleed is here to switch lifesteal off,
   * not to be a damage source.
   */
  damagePerStackPerSecond: number
  disablesLifesteal: boolean
  /** Tower archetypes whose hits cut. See level5.json's `_bleed`. */
  towerArchetypes: string[]
  fromHeroBasic: boolean
  fromHeroAbilities: boolean
}

/** How much bleed is on something: stacks, and how long they have left. */
export interface BleedState {
  stacks: number
  secondsLeft: number
}

export const NO_BLEED: BleedState = { stacks: 0, secondsLeft: 0 }

/** True if this tower's shots cut rather than crush. */
export function towerBleeds(archetype: string, rules: BleedRules | null): boolean {
  return rules !== null && rules.towerArchetypes.includes(archetype)
}

/**
 * One more stack, and the clock refreshed.
 *
 * REFRESHED RATHER THAN QUEUED: a re-hit puts the whole duration back rather
 * than adding to it, so a target under fire bleeds continuously and a target
 * left alone stops. Stacks are capped; a hit at the cap still refreshes,
 * which is what makes holding a boss at five stacks a thing a player does on
 * purpose rather than a thing that happens once.
 */
export function applyBleed(at: BleedState, rules: BleedRules | null): BleedState {
  if (rules === null || rules.maxStacks <= 0) return at
  return {
    stacks: Math.min(rules.maxStacks, at.stacks + 1),
    secondsLeft: rules.secondsPerStack,
  }
}

/**
 * A bleed one frame on: what it costs, and what is left of it.
 *
 * The damage is charged for the part of the frame the bleed was actually
 * alive for, not the whole of it. A long frame that outlasts the remaining
 * time would otherwise charge for time that never happened, which is the same
 * class of bug as a hazard whose damage depends on the frame rate.
 */
export function tickBleed(
  at: BleedState, dt: number, rules: BleedRules | null,
): { state: BleedState; damage: number } {
  if (rules === null || at.stacks <= 0 || at.secondsLeft <= 0) {
    return { state: NO_BLEED, damage: 0 }
  }
  const lived = Math.min(dt, at.secondsLeft)
  const damage = at.stacks * rules.damagePerStackPerSecond * lived
  const left = at.secondsLeft - dt
  return {
    state: left > 0 ? { stacks: at.stacks, secondsLeft: left } : NO_BLEED,
    damage,
  }
}

/** True while the stacks are holding the healing off. */
export function bleedBlocksLifesteal(at: BleedState, rules: BleedRules | null): boolean {
  return rules !== null && rules.disablesLifesteal && at.stacks > 0
}

/**
 * How much a vampire actually heals for having dealt `damage` to a player unit.
 *
 * ZERO IS A REAL ANSWER and is most of what this function is for: no lifesteal
 * on the def, the sun up, or blood running out of it are all "you heal for
 * nothing". Capped at the difference from full rather than at the fraction, so
 * a nearly-full vampire cannot overheal and a full one gains nothing at all —
 * which is what stops the pip appearing over an enemy whose bar does not move.
 */
export function lifestealHeal(args: {
  damage: number
  fraction: number | undefined
  health: number
  maxHealth: number
  /** False while the sun is up: see DayNight. */
  enabled: boolean
  bleeding: boolean
}): number {
  const { damage, fraction, health, maxHealth, enabled, bleeding } = args
  if (!enabled || bleeding) return 0
  if (!fraction || fraction <= 0 || damage <= 0) return 0
  return Math.max(0, Math.min(damage * fraction, maxHealth - health))
}

/**
 * The health a converting enemy carries into its new form.
 *
 * THE ONE RULE OF THE DUSK FLIP: a Thrall on its last sliver becomes a Glider
 * on its last sliver. It keeps the SHARE, not the number — the Glider's pool
 * is much larger, so carrying the number across would leave a nearly-dead
 * Thrall as a nearly-dead Glider by accident on this roster and as a
 * nearly-full one on the next.
 *
 * Floored at 1 rather than at 0, so nothing converts into a corpse: an enemy
 * that arrived at the flip already dying should get its moment as a vampire
 * before the board finishes it.
 */
export function convertedHealth(health: number, fromMax: number, toMax: number): number {
  if (fromMax <= 0) return toMax
  const share = Math.max(0, Math.min(1, health / fromMax))
  return Math.max(1, Math.min(toMax, share * toMax))
}

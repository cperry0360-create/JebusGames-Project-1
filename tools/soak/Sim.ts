// A headless run of the game's RULE layer.
//
// WHAT THIS IS, AND WHAT IT IS NOT.
//
// The shipping entities — Enemy, Tower, Hero, Projectile, Fighter — all extend
// Phaser GameObjects, and GameScene owns the loop that drives them. There is
// no seam to run them behind: constructing an Enemy needs a Scene, a texture
// and a display list. So this is not the shipping simulation with the
// renderer removed. It cannot be, today. SOAK-REPORT.md says what it would
// take to change that.
//
// What it IS: every Phaser-free rule module the game actually ships, wired
// together over lightweight structs, reading the real JSON. Targeting, the
// wave spawner, the armour and stun maths, upgrade stats, Last Stand, the
// scratch table, cooldowns, the draft, the lane, the build spots, the Beacon's
// aura, the Banner scoring — all of it is the code the game runs, not a copy.
// What is stubbed is drawing, tweening and input.
//
// SUPPORT WAS THE LAST OF THOSE TO ARRIVE, and until it did, every win rate
// this file has ever printed was measured on a board where a drafted Beacon
// was a dead tower: it cost 140 peanuts, took a pad, and did nothing. The rule
// lived inside `GameScene.refreshSupport`, out of reach; it is
// `systems/Support.ts` now and both callers read it. Numbers printed before
// 2026-09-06 are therefore low against the game by whatever a Beacon is worth
// on that level -- 4 to 15 points of win rate, measured per level in
// reports/2026-09-06-soak-support-modeling.md.
//
// So a failure here is a real failure in a rule the game depends on, and a
// clean run here does not prove the entity layer is clean.
//
// HOW WAVES START HERE, stated because it is a MODELLING GAP rather than a
// rule, and because a reader comparing these win rates to the game needs it.
//
// The ready phase is not simulated. There is no countdown, no auto-start and
// no early-start bonus: a wave ends and the next one begins, with the builder
// spending whatever it can afford in between. `readySeconds` and
// `earlyStartPeanutsPerSecond` appear nowhere in this file.
//
// That has two consequences, and they pull in opposite directions:
//
//   * WAVE 1 IS ALREADY RIGHT. The game now waits for the player before wave 1
//     and pays no bonus for it, which is exactly what a simulator with no
//     ready phase does. Unlimited build time before wave 1 buys nothing extra
//     either -- the opening purse covers one tower and no time passes here.
//     So that change cannot move a number in this file, and it did not:
//     level 3 is 80/120 either side of it, level 1 45/60, level 2 10/60.
//
//   * WAVES 2 ONWARD ARE MODELLED POOR. A player who starts every later wave
//     the instant it is offered earns 15 x 2 = 30 peanuts a wave, which over
//     twelve waves is 360 the simulated player never sees. Every win rate this
//     tool has ever reported is therefore a FLOOR rather than an estimate.
//     Closing that gap would move every number in every previous report, which
//     is why it has not been done quietly here; it is written down instead.

import towersData from '../../src/data/towers.json' with { type: 'json' }
import enemiesData from '../../src/data/enemies.json' with { type: 'json' }
import abilitiesData from '../../src/data/abilities.json' with { type: 'json' }
import heroesData from '../../src/data/heroes.json' with { type: 'json' }
import rulesData from '../../src/data/rules.json' with { type: 'json' }
import presentationData from '../../src/data/presentation.json' with { type: 'json' }
import draftData from '../../src/data/draft.json' with { type: 'json' }

import { DEFAULT_LEVEL_ID, levelRules, loadLevel, towerWeightsFor } from '../../src/systems/Levels.ts'
import { NightRules } from '../../src/systems/NightRules.ts'
import {
  HASTE_OFF, armedAt, copyCount, copyTargets, hasteMultiplier, hasteSeconds, tickSchedule,
  vlaudeRules, type ArmedPower, type PowerId, type VlaudeRules,
} from '../../src/systems/Vlaude.ts'
import { NO_BLEED, convertedHealth, type BleedState } from '../../src/systems/Vampirism.ts'
import {
  flameEnd, inFlame, newFlameState, scorchIntervalMultiplier, tickFlame,
  type FlameRules, type FlameState,
} from '../../src/systems/Flame.ts'
import {
  newRegenState, tickRegen, type RegenState,
} from '../../src/systems/Regen.ts'
import {
  DEFAULT_DIFFICULTY_ID, startingLives, startingPeanuts,
} from '../../src/systems/Difficulty.ts'
import { DEFAULT_HERO_ID, HERO_IDS, resolveHeroId } from '../../src/systems/Heroes.ts'
import { heroSlotId, isAreaSkill } from '../../src/systems/HeroSkills.ts'
import {
  TRANSFORM_INVULNERABLE_SECONDS, applyHit, attackInterval, damageToHero, outgoingDamage,
} from '../../src/systems/Transform.ts'
import { Path } from '../../src/systems/Path.ts'
import {
  LaneNetwork, MAIN_LANE, advance, chooseContinuation, pickAt, pickForBranch, pickForTerminal,
  type Walker,
} from '../../src/systems/Lanes.ts'
import {
  crossedGate, gateRules, reviewable, type GateRules,
} from '../../src/systems/PerformanceGate.ts'
import { armorAuraRules, auraArmorAt, type ArmorAuraRules } from '../../src/systems/EnemyAura.ts'
import { bladeDamage, bladesFrom, type BladesDef } from '../../src/systems/Blades.ts'
import { defaultRally, soldierStations } from '../../src/systems/Rally.ts'
import { Disabler } from '../../src/systems/TowerDisable.ts'
import { BuildSystem } from '../../src/systems/BuildSystem.ts'
import { rainPoints } from '../../src/systems/HeroPowers.ts'
import { WaveSpawner } from '../../src/systems/WaveSpawner.ts'
import { Cooldowns } from '../../src/systems/Cooldowns.ts'
import { waveOutcome } from '../../src/systems/Wave.ts'
import { pickFirst, pickNearest, withinRadius } from '../../src/systems/Targeting.ts'
import {
  boostedDamage, canStun, damageAfterArmor, diminishedSeconds, slowedSpeed, slowStacksAfter,
  stunLockoutFor,
} from '../../src/systems/Combat.ts'
import { auraAt, NO_AURA, type Aura, type AuraSource } from '../../src/systems/Support.ts'
import {
  atSpecChoice, BASE_TIER, isMaxed, maxTier, nextStep, specById, statAt,
} from '../../src/systems/Upgrades.ts'
import { rollOutcome } from '../../src/systems/Scratch.ts'
import { bannerPointsFor } from '../../src/systems/Banner.ts'
import { openingPurse } from '../../src/systems/Economy.ts'
import {
  draftAbilities, draftOpeningTowers, guaranteedOpeners, reserveTowers,
} from '../../src/systems/Draft.ts'
import { makeRng, type Rng } from './Rng.ts'

const TOWERS = towersData as any
const ENEMIES = enemiesData as any
const ABILITIES = abilitiesData as any
const HEROES = heroesData as any
const RULES = rulesData as any
const DRAFT = draftData as any

/** A tick, in game seconds. Small enough that a fast enemy cannot step over a
 *  tower's range in one frame. */
const DT = 1 / 30
/** A wave that has not ended after this many game-seconds is stuck. */
const WAVE_LIMIT_SECONDS = 600
/** A run that has not ended after this many is stuck. */
const RUN_LIMIT_SECONDS = 4000

/**
 * What the board can do to the final wave's heaviest enemy, at the moment that
 * wave starts.
 *
 * TWO DPS NUMBERS AND THEY ANSWER DIFFERENT QUESTIONS.
 *
 * `boardDps` is every shooting tower's damage per second against that armour,
 * summed, ignoring range -- the same quantity the level 2 report published as
 * "board DPS vs armour 4". It is the board's ceiling and no enemy ever takes
 * all of it, because a tower only fires while something is in its range.
 *
 * `walkDamage` is what one enemy walking the whole route at its own speed
 * actually takes: for each tower, its DPS times the seconds the route spends
 * inside its range. THAT is the number a boss health figure has to be compared
 * against, and on a long route with a slow boss the two differ by a factor of
 * several. Slows are not modelled in it, so it is a floor.
 */
export interface FinaleBoard {
  /** 1-based wave number this was measured at the start of. */
  wave: number
  /** The enemy it is measured against: the final wave's largest health pool. */
  enemy: string
  armor: number
  speed: number
  health: number
  towers: number
  freePads: number
  /** Every shooting tower's DPS against `armor`, summed. Ignores range. */
  boardDps: number
  /** Total damage deliverable to one walker over the whole route. */
  walkDamage: number
  /** How long that walk takes at `speed`, in seconds. */
  walkSeconds: number
  /** Seconds to kill `health` at `boardDps`, for comparison with `walkSeconds`.
   *  Infinity when the board has no guns. */
  killSeconds: number
  /**
   * WHAT HE ACTUALLY TOOK over the run, summed across every instance of that
   * def, and whether any of them died.
   *
   * This is the measurement and everything above it is the estimate. It
   * includes the slows that stretch his exposure, the hero chasing him, every
   * ability the draft handed out, and the escorts that steal the targeting --
   * none of which the arithmetic can see.
   */
  dealt: number
  /** The lowest health fraction any instance reached. 0 means one died. */
  lowestFraction: number
  /** How many instances of him died. */
  killed: number
}

export interface SoakFinding {
  kind: string
  detail: string
  wave: number
  atSeconds: number
}

export interface SoakResult {
  seed: number
  hero: string
  abilities: string[]
  towers: string[]
  outcome: 'won' | 'lost' | 'stuck'
  waves: number
  lives: number
  /** 1-based wave on which the first life was lost; -1 if the run never lost one. */
  firstLifeLostWave: number
  peanutsEarned: number
  kills: number
  seconds: number
  bannerPoints: number
  findings: SoakFinding[]
  /** Every tower and ability that fired at least once. */
  firedTowers: Set<string>
  firedAbilities: Set<string>
  /**
   * WHERE THE LIVES WENT, by the exit the enemy got out of.
   *
   * Only a branching map has more than one key, and only level 8 has two that
   * both cost lives. The east arm is 36% covered against the south's 77%, so
   * "how many of the losses came out of the cheap exit" is the question the
   * wave table was built to answer and could not be asked before this existed.
   */
  leaksByExit: Record<string, number>
  /** WHICH ENEMY GOT OUT, counted. A leak rate is a number; what is leaking is
   *  a diagnosis, and the two are not the same question -- level 8 killed 273
   *  of ~257 scripted enemies on its first soak and still bled 18 lives, and
   *  nothing in the output said which of the six it was. */
  leaksByEnemy: Record<string, number>
  /** How many enemies the Performance Review buffed over the run, and how much
   *  friendly damage the Consultants' explosions did. Both 0 everywhere but
   *  level 8, which is the scoping made visible in the output. */
  reviewed: number
  /** Eligible enemies that reached the gate's distance. `reviewed` without this
   *  is a number with no denominator. */
  atGate: number
  /** And how many ever stood inside an HR's armour aura. See `everBuffed`. */
  auraBuffed: number
  /**
   * THE BOARD, MEASURED AT THE TOP OF THE FINAL WAVE, against the biggest
   * enemy that wave sends.
   *
   * Why it exists. `reports/2026-09-07-balance-verification-and-level-2.md`
   * settled level 2 on one number -- "median board DPS of a winner" against
   * the boss's armour -- and there was no instrument for it: the figures in
   * that report were derived once, by hand, and could not be re-derived for
   * level 10. Vlaude's health was set by win rate alone, by a runner that
   * fires three of his six powers, and the question "can a maxed board kill
   * 26,000 at armour 10 before he reaches the exit" had no measurement at all.
   *
   * Null on a run that never reached the final wave.
   */
  finale: FinaleBoard | null
  /**
   * The exit the LAST leak of a losing run came out of, or null for a run that
   * did not lose.
   *
   * NOT THE SAME QUESTION AS `leaksByExit`, which is where the lives went over
   * the whole run. "Which exit ended it" is the one a wave table is judged on:
   * level 8's east arm is 36% covered against the south's 77%, and a table
   * routing the heavy groups down the cheap one shows up here and not in the
   * totals.
   *
   * THE LAST LEAK RATHER THAN THE ZERO-CROSSING, and that is not a
   * simplification. A run can be LOST WITH LIVES IN HAND: `waveOutcome` ends
   * the run when anything escapes on the FINAL wave, whatever the counter
   * says, so 30 of level 8's first 73 measured losses had lives left and no
   * crossing into zero to point at -- the CEO simply walked out. The last leak
   * is the one that ended it under either rule.
   */
  lostToExit: string | null
  /** The enemy KIND whose escape took the last life, or null on a win. See the
   *  note at the assignment: on a level with one exit and four mini bosses this
   *  is the only field that names the killer. */
  lostToEnemy: string | null
  /** The mouth the enemy whose escape took the last life came in through. */
  lostToEntrance: string | null
  leaksByEntrance: Record<string, number>
  blastOnFriendlies: number
  /** Total damage level 7's blades did to the player's side over the run. 0 on
   *  every other level, which is the scoping made visible in the output. */
  bladeCuts: number
  /**
   * LEVEL 9'S THREE, counted for exactly the reason `bladeCuts` is: a mechanic
   * worth nothing and a mechanic that never ran produce the same flat
   * sensitivity table, and only one of them is a tuning problem.
   *
   * `healedTotal` read ZERO for three soaks and the level was tuned against
   * it anyway -- `tickRegens` passed `e.maxHealth` to a state that has no such
   * field, every comparison against `undefined` came back false, and a 38%
   * win rate was reported for a boss whose repair had never once run. These
   * three exist so that cannot happen silently again.
   */
  healedTotal: number
  /** Damage HAT-GTT's WALL OF TEXT put on the player's own units. */
  flameDamage: number
  /** Tower-seconds taken off the board by CANCER's claw and PERPLEXED's
   *  citation storm, summed. */
  disableSeconds: number
  /**
   * HOW MUCH ROAD WAS LEFT when the enemy that splits on death was killed, in
   * world pixels to its exit -- or null if it was never killed.
   *
   * THE MEASUREMENT THE LEVEL 7 BRIEF ASKED FOR AND ITS DESIGN DEPENDS ON.
   * The Transporter does not die, it unloads: four cars come off the trailer
   * AT THE PLACE IT FELL. Kill it early and they have most of a highway to
   * cross; kill it on the exit line and four cars are on the exit line, and
   * eight lives go with them. Eli raised that during design and Cory kept it,
   * so it is a thing to MEASURE rather than to clamp -- and a number here is
   * the only way to know whether the losses it causes are earned or
   * unavoidable.
   */
  splitKillToExit: number | null
  /** True where the LAST leak of a losing run was a child of a death split --
   *  a run that level 7's finale ended. False on every other level. */
  lostToSplit: boolean
}

interface SimEnemy {
  id: string
  def: any
  /** Which arm of a split this one takes; see `Lanes.chooseContinuation`. */
  routePick: number
  /**
   * The four fields level 5 adds, and every one of them is inert on the other
   * four levels: `night` is null there, so the speed scale stays 1, nothing is
   * ever held by itself, no bleed is ever applied and no threshold exists to
   * fire. They are on the struct rather than in a side table so a lookup
   * cannot go missing on the one path that mattered.
   */
  speedScale: number
  selfHeld: boolean
  bleed: BleedState
  /** Which `onHealthThreshold` entries have fired, by index. A SET rather than
   *  a boolean since level 8's CEO has two phases -- the scene's own latch
   *  changed the same way and for the same reason. */
  firedThresholds: Set<number>
  /** True once level 8's Performance Review has buffed it. Once, ever. */
  reviewed: boolean
  /**
   * WHICH MOUTH IT CAME IN THROUGH, kept because `laneId` does not answer it:
   * that field follows the walker through every merge, so by the time an enemy
   * leaks it says `south` whichever entrance it started at. On a map with two
   * ways in and one way out, "which entrance did the enemies that killed me
   * come from" is the question the wave table is built to answer and there was
   * nothing to answer it with.
   */
  spawnLane: string
  /** Has it ever stood at or past the gate's distance on the gate's lane?
   *  Separate from `reviewed`: a summoned child spawning BEYOND the line is at
   *  the gate and is never buffed by it, and the gap between the two counts is
   *  exactly that case. */
  atGate: boolean
  /** 1.2 once reviewed, 1 otherwise. Beside `speedScale` rather than inside
   *  it, exactly as on the shipped Enemy. */
  reviewSpeed: number
  /**
   * LEVEL 10'S HASTE, and 1 on every other level.
   *
   * The third multiplier slot, beside `speedScale` and `reviewSpeed` and
   * multiplied into the same line -- which is the shipped `Enemy.hasteSpeed`
   * exactly. ASSIGNED, NEVER ACCUMULATED, and put back to `HASTE_OFF`, so the
   * restoration is bit-for-bit the same here as it is on the board.
   */
  hasteSpeed: number
  /** How many times this body is itself a copy. A duplicate is 1, and
   *  `copyTargets` refuses anything at or above the limit -- the same
   *  function the scene calls, so a duplicate cannot duplicate in either. */
  copyDepth: number
  /** True for a unit `createEnemies` made, which is what that power's own cap
   *  counts. */
  madeByVlaude: boolean
  /** Armour lent by a living HR standing nearby. Recomputed every frame. */
  auraArmor: number
  /** True once this one has stood inside an HR's aura at all.
   *
   *  MEASURED BECAUSE THE SENSITIVITY TABLE CAME BACK FLAT. Sweeping the
   *  bonus 0, 2, 4, 8 moved the win rate 40, 40, 39, 40 -- and "worth
   *  nothing" and "never fired" produce the same flat table. This is what
   *  tells the two apart. */
  everBuffed: boolean
  /** The Rooster's breath clock, or null for everything that does not breathe.
   *  Held on the enemy so a boss killed mid-telegraph takes its half-finished
   *  cast with it, exactly as the Disabler is. */
  flame: FlameState | null
  /** HAT-GTT's repair clock, or null for everything that does not repair. The
   *  scene holds the identical state and ticks it with the identical module. */
  regen: RegenState | null
  /**
   * Which way it is walking, in radians, from the last step it took.
   *
   * AN APPROXIMATION OF THE SCENE'S FACING and it is the flame's one. The
   * scene asks the LANE for its angle at the enemy's distance; this reads the
   * direction it actually moved, which is the same answer on a straight run
   * and drifts by a few degrees through a bend. Level 6's two lanes are nearly
   * straight, so the two agree closely there. It is only ever read by the
   * flame, so nothing else can be affected by the difference.
   */
  heading: number
  health: number
  /** Total walked across every lane, and only ever incremented. What
   *  targeting sorts on, so a merge cannot make a tower drop its target. */
  distance: number
  /** Which branch it is on now, and how far along THAT lane it stands. A merge
   *  rewrites both; `distance` is untouched by one. */
  laneId: string
  laneDistance: number
  x: number
  y: number
  alive: boolean
  slowFactor: number
  slowRemaining: number
  slowStacks: number
  sinceSlow: number
  stunRemaining: number
  stunLockout: number
  stunStacks: number
  sinceStun: number
  armorShred: number
  attackTimer: number
  /** What is holding this enemy up: the hero, one of the Ima Dummy Tower's
   *  soldiers, or nothing. A blocked enemy does not move and trades blows with
   *  whatever is holding it. */
  blockedBy: 'hero' | SimSoldier | null
  /** The summoner that called this one in, or null for a scripted spawn. A
   *  wave ends when its SCRIPTED spawns are gone, so this is what the
   *  wave-over check filters on. */
  summonedBy: SimEnemy | null
  /** True for a summoned child that HOLDS THE WAVE OPEN anyway: the four cars
   *  off level 7's Transporter, and nothing else in the game. Mirrors
   *  `Enemy.holdsWave`. */
  heldWave: boolean
  /** Counts down to the next burst. Only a summoner uses it. */
  summonTimer: number
  /** The tower-disable clock, or null for everything that does not cast one.
   *  Held on the enemy so a boss killed mid-windup takes its half-finished
   *  cast with it, as it does in the scene. */
  disabler: Disabler | null
}

/** One of the Ima Dummy Tower's lads. */
interface SimSoldier {
  tower: SimTower
  x: number
  y: number
  health: number
  maxHealth: number
  attackTimer: number
  /** Counts down while dead; 0 means it is on the board. */
  respawnIn: number
  /** Sticky for this life, cleared when it comes back at full health. */
  enraged: boolean
}

interface SimTower {
  id: string
  def: any
  /** Seconds of scorch left. A scorched tower keeps firing, at half rate.
   *  0 on every level but the sixth. */
  scorchedFor: number
  spot: number
  x: number
  y: number
  tier: number
  spec: string | null
  cooldown: number
  buildLeft: number
  /** Seconds left switched off by a boss, or 0 when it is working. */
  disabledFor: number
  /** How much road is left between it and the exit -- the tower-disable's
   *  tie-break between two towers that cost the same. */
  distanceToExit: number
  /** Peanuts sunk into it, kept up to date as tiers are paid for. */
  value: number
  /** The lads, for an Ima Dummy Tower. Empty for everything that shoots. */
  soldiers: SimSoldier[]
  /** Where they stand. Null when no lane comes inside the tower's range. */
  rally: { x: number; y: number } | null
}

/**
 * Adversarial player behaviours.
 *
 * The weighted draft and a competent player never reach these, and they are
 * exactly where a stuck state would hide: a board that cannot kill anything is
 * the shape of "a wave that never ends".
 */
export type SoakMode = 'normal' | 'nobuild' | 'supportonly' | 'noabilities'

export function simulate(
  seed: number, mode: SoakMode = 'normal', levelId: string = DEFAULT_LEVEL_ID,
  heroFor?: string,
  /**
   * The DIFFICULTY, which changes starting lives and starting peanuts and
   * nothing else.
   *
   * Defaults to `normal`, which multiplies both by 1 — so every existing
   * caller, every published win rate and the whole 35-45% target band are
   * unaffected by this parameter existing. TUNING IS DONE AGAINST NORMAL AND
   * ONLY NORMAL; the other two are run as a sanity check that casual is not
   * trivial and hardcore is not impossible, and nothing is retuned to hit a
   * number on either.
   *
   * It reads the game's own `Difficulty` module rather than its own copy of
   * the multipliers, so a soak cannot report on a game that does not exist.
   */
  difficultyId: string = DEFAULT_DIFFICULTY_ID,
): SoakResult {
  // The level is a parameter now rather than two module-scope imports, so a
  // soak can be pointed at level 2. Everything below reads these two and does
  // not care which level they came from.
  const level = loadLevel(levelId)
  const MAP = level.map as any
  const WAVES = level.waveTable.waves

  const rng = makeRng(seed)
  // See `spawn`: a separate stream, so adding a per-enemy draw cannot move a
  // number on a level that never reads it.
  const routeRng = makeRng((seed ^ 0x5f356495) >>> 0)
  const findings: SoakFinding[] = []
  const firedTowers = new Set<string>()
  const firedAbilities = new Set<string>()
  let now = 0
  let waveIndex = 0

  const note = (kind: string, detail: string): void => {
    if (findings.length < 40) findings.push({ kind, detail, wave: waveIndex + 1, atSeconds: +now.toFixed(1) })
  }

  // ASKED FOR A LEVEL AND GIVEN ANOTHER ONE.
  //
  // `loadLevel` resolves an unknown id to the DEFAULT level rather than
  // throwing, which is right for a saved run naming a level that was renamed
  // and is a trap here: a soak pointed at a level with no row in levels.json
  // silently reports LEVEL 1's win rate under the other level's name. That is
  // the exact shape of "a confident wrong number" -- and level 8 is a level
  // with no row, so this is not hypothetical.
  //
  // Reported rather than thrown, because a caller that knows it is soaking a
  // parked level (tools/soak/level.ts registers one) should still be able to,
  // and a caller that made a typo needs to see it in the output.
  if (level.id !== levelId) {
    note('wrong-level', `asked for "${levelId}", which has no row in levels.json; `
      + `simulating "${level.id}" instead -- every number below is that level's`)
  }

  // --- the draft ---------------------------------------------------------
  // THE HERO IS NO LONGER DRAWN. It used to be picked at random, which was
  // indistinguishable from a constant while there was one of them; there are
  // five now and the player chooses, so the soak measures the DEFAULT unless a
  // caller names one. Picking at random here would mean every reported win
  // rate was an average over five heroes and comparable to nothing.
  // ONE RNG VALUE IS STILL DRAWN AND THROWN AWAY, and that is deliberate.
  // Every seed's whole run hangs off the order values come out of this
  // generator, so simply deleting the draw reseeds all 60 of them: level 2
  // moved 7/60 -> 12/60 with no game change at all. The soak's entire value is
  // that a number can be compared with the one before it, so the draw stays
  // until someone re-baselines the reports on purpose.
  rng.pick(HERO_IDS)
  const heroId = resolveHeroId(heroFor ?? DEFAULT_HERO_ID)
  const hero = HEROES[heroId]
  const pool = Object.keys(ABILITIES).filter((id) => ABILITIES[id].draftable)
  const abilities = draftAbilities(pool, DRAFT.abilitiesDrawn, rng)
  // The shared pool plus whatever this level adds -- nothing, on every level
  // today. The Ima Dummy Tower used to be level 1's alone via
  // `extraTowerWeights`; it is in the shared pool and guaranteed now, so every
  // soaked board on every level has a garrison in the opening hand.
  const weights = towerWeightsFor(levelId, DRAFT.towerWeights)
  const towerPool = Object.entries(TOWERS)
    .filter(([id]) => weights[id] !== undefined)
    .map(([id, t]: [string, any]) => ({ id, weight: weights[id]!, archetype: t.archetype }))
  let opening = draftOpeningTowers(towerPool, DRAFT, rng)
  let reserve = reserveTowers(towerPool, opening, rng)
  // Every third seed ignores the weighted draft and takes a uniform random
  // hand instead. The weights exist to make the FIRST tower a sensible one,
  // and leaving coverage to them means the rarely-drafted towers are barely
  // soaked at all.
  if (seed % 3 === 0) {
    // FROM THE LEVEL'S POOL, not the whole table. This drew from every tower in
    // towers.json, which was the same thing right up until a tower existed that
    // only one level can draw -- and then every third seed on levels 2 and 3
    // was handing the player an Ima Dummy Tower they could never have had. It
    // moved level 2 from 7/60 to 6/60 before it was noticed.
    //
    // AND THE GUARANTEE SURVIVES THE UNIFORM HAND. What this path drops is the
    // WEIGHTS, so that the rarely-drafted towers get soaked at all; a
    // guaranteed opener is not a weight, it is a slot, and a soak in which a
    // third of the seeds open without the tower every real run opens with
    // would be measuring a game nobody plays. The list comes from
    // `guaranteedOpeners` and draft.json rather than from an id written here.
    //
    // THE WHOLE POOL IS STILL SHUFFLED, and the filtering happens after, so
    // this consumes exactly the rng it always did. Shuffling the six drawable
    // ids instead would reseed every run in the soak for no reason.
    const ids = rng.shuffled(towerPool.map((t) => t.id))
    const forced = guaranteedOpeners(towerPool, DRAFT).map((w) => w.id)
    const rest = ids.filter((id) => !forced.includes(id))
    opening = [...rest.slice(0, DRAFT.towersAtStart), ...forced]
    reserve = rest.slice(DRAFT.towersAtStart)
  }
  const draftedAbilities = seed % 3 === 0
    ? rng.shuffled(pool).slice(0, DRAFT.abilitiesDrawn)
    : abilities

  // The lane NETWORK, not one lane. A single-lane map resolves to exactly one
  // lane built from its own waypoints, so levels 1 and 2 walk the numbers they
  // always did; level 3 resolves to two branches and the trunk they share.
  //
  // These are the game's own primitives rather than a paraphrase of them, so a
  // merge means one thing in the scene and in the soak. That matters here more
  // than usual: this file's output is what level 3 is tuned against.
  // LEVEL 5'S OWN RULES, or null, and null is the case that keeps four tuned
  // levels tuned. Everything below that reads `night` is guarded on it, so a
  // level naming no rules file runs precisely the simulation it always did --
  // which is the property re-soaking levels 1 to 4 on the same seeds proves.
  const night = NightRules.from(levelRules(levelId))
  // THE ROOSTER'S BREATH, or null on every level that is not level 6. Read off
  // the same `levelRules` resolver the night rules use, so the scoping is one
  // mechanism rather than two: a level that names no rules file gets null and
  // nothing below fires.
  const FLAME: FlameRules | null =
    ((levelRules(levelId) as any)?.flame as FlameRules | undefined) ?? null
  // LEVEL 8'S THREE, through the same resolver for the same reason. All three
  // are null on every other level, which is the property re-soaking levels 1
  // to 7 on the same seeds proves rather than claims.
  const GATE: GateRules | null = gateRules(levelRules(levelId))
  const AURA: ArmorAuraRules | null = armorAuraRules(levelRules(levelId))
  // LEVEL 7'S BLADES, null everywhere else, asserted by the same module the
  // scene asserts them with -- so a malformed block fails the soak rather than
  // silently producing a level where the mini boss does nothing.
  const BLADES: BladesDef | null = bladesFrom(levelRules(levelId) as { blades?: unknown } | null)
  const BLAST: { radius: number; damage: number; hitsPlayerUnits: boolean } | null = (() => {
    const b = (levelRules(levelId) as any)?.deathBlast
    return b && b.radius && b.damage
      ? { radius: b.radius, damage: b.damage, hitsPlayerUnits: b.hitsPlayerUnits === true }
      : null
  })()
  const net = new LaneNetwork(MAP)
  const lane = net.main
  const build = new BuildSystem(MAP.buildSpots, MAP.spotRadius)
  const spawner = new WaveSpawner()
  const cooldowns = new Cooldowns()
  for (const id of draftedAbilities) cooldowns.register(id, ABILITIES[id].cooldown)
  // SLOT 1 IS WHATEVER IS FIRST, not a named field. Only the first ability is
  // modelled here: the rest are gated on the powered form, cast by tapping the
  // map, and a soak that guessed where the player would tap would be measuring
  // its own guess. See `_modelled` in the report.
  const SLOT1 = heroSlotId(0)
  cooldowns.register(SLOT1, hero.abilities[0]!.cooldown)

  // The same two calls the scene makes, in the same order: the difficulty
  // scales the base and the opening-purse floor is applied to the result, so
  // a thin purse never makes the first tower unaffordable.
  let peanuts = openingPurse(
    startingPeanuts(RULES.startingPeanuts, difficultyId), RULES.startingPeanutsMargin,
    opening.map((id) => TOWERS[id].cost),
  )
  let peanutsEarned = 0
  const livesAtStart = startingLives(RULES.startingLives, difficultyId)
  let lives = livesAtStart
  /** 1-based wave on which the first life was lost, or -1 if none ever was. */
  let firstLifeLostWave = -1
  let kills = 0
  // Level 8's three measurements. Zero everywhere else, by construction.
  // HOW MUCH DAMAGE THE BLADES DID over the run, summed over the hero and the
  // lads. It exists for the reason level 8's `auraBuffed` does: a mechanic
  // worth nothing and a mechanic that never ran produce the same flat
  // sensitivity table, and only one of them is a tuning problem.
  let bladeCuts = 0
  // HOW MUCH HEALTH HAT-GTT PUT BACK over the run. Level 9's only new rule, and
  // it is counted for the reason `bladeCuts` is: a mechanic worth nothing and a
  // mechanic that never ran give the same flat sensitivity table, and only one
  // of those is a tuning problem.
  let healedTotal = 0
  // See the three fields on SoakResult. Both are zero on every level that has
  // no flame rule and nothing that casts a disable.
  let flameDamage = 0
  let disableSeconds = 0
  // See `splitKillToExit`. Set once, on the frame the splitter dies.
  let splitKillToExit: number | null = null
  let lostToSplit = false
  const leaksByExit: Record<string, number> = {}
  const leaksByEnemy: Record<string, number> = {}
  /** Lives lost, by the mouth the enemy that took them WALKED IN THROUGH. */
  const leaksByEntrance: Record<string, number> = {}
  let reviewedCount = 0
  /** Eligible enemies that got as far as the gate's distance on its lane --
   *  the only sensible denominator for `reviewedCount`. See the note at the
   *  count site. */
  let atGateCount = 0
  let blastOnFriendlies = 0
  let auraBuffedCount = 0
  let lostToExit: string | null = null
  let lostToEnemy: string | null = null
  let lostToEntrance: string | null = null
  let unlocked = opening.slice()
  const enemies: SimEnemy[] = []
  const towers: SimTower[] = []

  // --- the hero ----------------------------------------------------------
  const heroState = {
    // Midway down the trunk, which on a branching map is the shared tail --
    // where a hero covers whatever came out of either gate.
    x: lane.path.pointAt(lane.path.totalLength * 0.5).x,
    y: lane.path.pointAt(lane.path.totalLength * 0.5).y,
    health: hero.maxHealth,
    down: false,
    reviveIn: 0,
    // The two-state hero, modelled: a 40% cut on everything the hero takes
    // from half health onward moves every win rate the soak reports, so a
    // simulation without it would be measuring a different game.
    powered: false,
    poweredGrace: 0,
    invulnerable: 0,
    attackTimer: 0,
    blocking: 0,
  }

  const finite = (label: string, v: number, allowZero = true): number => {
    if (!Number.isFinite(v)) { note('nan', `${label} is ${v}`); return 0 }
    if (v < 0 && !allowZero) note('negative', `${label} is ${v}`)
    return v
  }

  const statOf = (t: SimTower, key: string): number =>
    finite(`${t.id}.${key}`, statAt(t.def, t.tier, key as any, t.spec))

  /**
   * Every Beacon on the board, as the aura rule sees one.
   *
   * Rebuilt each frame rather than cached on a board-changed hook: the scene
   * can afford a hook because it owns the events, and this loop cannot see
   * one -- towers are built between waves, upgraded mid-wave, switched off by
   * a boss and eaten by the Glitch Bug. Fourteen pads is a fourteen-entry
   * filter, which is nothing next to the work the same frame does walking
   * enemies.
   *
   * `dark` is `disabledFor`, so a Beacon the Rainbow Reaper switches off stops
   * lifting for exactly as long as it is off -- the same rule the scene runs,
   * out of the same file.
   */
  const auraSources = (): AuraSource[] => {
    const out: AuraSource[] = []
    for (const t of towers) {
      const radius = statOf(t, 'supportRadius')
      if (radius <= 0) continue
      // The spec's grants are flat fields rather than multipliers, so they are
      // read off the specialization directly. `statAt` would multiply a base
      // the tower does not have and hand back 0 -- which is what `Tower`'s own
      // `supportRangeBonus` and `grantsPierce` getters avoid the same way.
      const b: any = specById(t.def, t.spec) ?? {}
      out.push({
        x: t.x, y: t.y,
        radius,
        damageBonus: statOf(t, 'supportDamageBonus'),
        rangeBonus: b.supportRangeBonus ?? 0,
        pierce: b.grantsPierce ?? 0,
        dark: t.disabledFor > 0,
      })
    }
    return out
  }

  /**
   * Children that have been decided on but are not on the road yet, with the
   * seconds left before each appears.
   *
   * A QUEUE RATHER THAN A FLAG ON THE ENEMY, which is `GameScene.pendingSplits`
   * exactly and for its reason: a car that does not exist yet must not be
   * shot at, blocked, counted for the wave, or caught in an aura. Eight
   * separate target filters in this file ask `e.alive`, and a flag would have
   * needed every one of them to ask a second question. Empty on every frame of
   * every level but 7.
   */
  const pendingSplits: Array<{ args: Parameters<typeof spawn>; left: number }> = []
  const releasePending = (dt: number): void => {
    if (pendingSplits.length === 0) return
    for (let i = pendingSplits.length - 1; i >= 0; i--) {
      const p = pendingSplits[i]!
      p.left -= dt
      if (p.left > 0) continue
      pendingSplits.splice(i, 1)
      spawn(p.args[0], p.args[1], p.args[2], p.args[3], p.args[4], p.args[5], p.args[6], 0)
    }
  }

  const spawn = (id: string, at = 0, summonedBy: SimEnemy | null = null,
                 laneId: string = MAIN_LANE, laneAt = at,
                 routePick = routeRng(), heldWave = false, emergeIn = 0): void => {
    const def = ENEMIES[id]
    if (!def) { note('missing-data', `wave names unknown enemy "${id}"`); return }
    if (emergeIn > 0) {
      pendingSplits.push({ args: [id, at, summonedBy, laneId, laneAt, routePick, heldWave, 0],
        left: emergeIn })
      return
    }
    const on = net.lane(laneId)
    const p = on.path.pointAt(laneAt)
    enemies.push({
      id, def, health: def.maxHealth, distance: at,
      // WHICH ARM OF A SPLIT this one takes, drawn from the run's own seed so
      // the crossroads is reproducible.
      //
      // FROM ITS OWN STREAM, not the run's. The run's rng also picks the hero,
      // the draft and every tower the builder buys, and those draws happen
      // DURING the wave loop -- so taking one number per spawned enemy out of
      // it would shift everything after it and move every win rate this tool
      // has ever published, on four levels that have no split at all. A second
      // mulberry32 seeded off the same seed keeps the crossroads reproducible
      // and levels 1 to 4 bit-identical.
      routePick,
      speedScale: 1, selfHeld: false, bleed: NO_BLEED,
      // A SUMMONED CHILD INHERITS ITS PARENT'S MOUTH rather than taking the
      // lane it was dropped on. The CEO's drones appear wherever he happens to
      // be standing, which on this map is `south` -- the road both entrances
      // share -- so attributing them to `south` would report a third entrance
      // that does not exist and would credit none of them to the mouth the
      // boss that made them walked in through.
      spawnLane: summonedBy?.spawnLane ?? laneId,
      firedThresholds: new Set<number>(), reviewed: false, atGate: false, reviewSpeed: 1,
      hasteSpeed: HASTE_OFF, copyDepth: 0, madeByVlaude: false,
      auraArmor: 0,
      everBuffed: false,
      flame: def.flame && FLAME ? newFlameState(FLAME) : null,
      regen: def.regen ? newRegenState(def.regen) : null,
      // Enemies walk left to right on every map in the game, so facing east is
      // the right answer before anything has moved.
      heading: 0,
      laneId: on.id, laneDistance: laneAt, x: p.x, y: p.y, alive: true,
      slowFactor: 0, slowRemaining: 0, slowStacks: 0, sinceSlow: 99,
      stunRemaining: 0, stunLockout: 0, stunStacks: 0, sinceStun: 99,
      armorShred: 0, attackTimer: 0, blockedBy: null,
      summonedBy, heldWave,
      // The first burst waits a full interval, so a boss does not arrive with
      // a crowd already around it.
      summonTimer: def.summons?.interval ?? 0,
      disabler: def.towerDisable ? new Disabler(def.towerDisable) : null,
    })
  }

  /**
   * Everything level 5 adds, one frame at a time, in the scene's own order.
   *
   * WHICH OF THESE ARE MODELLED AND WHICH ARE APPROXIMATED is stated here
   * rather than left to be discovered, because level 4's boss was tuned
   * against a board where the Beacon did nothing and the number was confidently
   * wrong:
   *
   *   MODELLED EXACTLY, sharing the shipping rule module with the scene --
   *   the day/night phases and their speed and sun-damage modifiers, the dusk
   *   conversion including the health-percentage rule, lifesteal and its cap,
   *   bleed and the bleed-disables-lifesteal interaction, the acid puddles'
   *   interval-on-movement, their damage to the hero and to the lads, their
   *   effect on tower fire rate, the no-stacking rule, and the Humiliation
   *   meter's speed and damage bonuses including the roar's free stack.
   *
   *   APPROXIMATED -- the summoned FIGHTERS are not on the board here at all
   *   (the soak models the hero and the Ima Dummy's lads and nothing else that
   *   can be stood on), so a puddle has two kinds of victim rather than three;
   *   and a tower's position is its pad's, which it also is in the scene, so
   *   the fire-rate halving is exact but the hero's and the lads' positions
   *   are the sim's own simplification of where a player would put them.
   *
   *   NOT MODELLED AT ALL -- the Spike Strip, and therefore the whole Glider
   *   ground-hazard question. Only the hero's FIRST ability is simulated (see
   *   the header), and the Strip is Cory's second. Whichever way that decision
   *   goes it cannot move a number this file prints, which is worth knowing
   *   before reading the win rate as an answer to it.
   */
  const tickNight = (dt: number): void => {
    if (!night) return
    if (night.tick(dt)) {
      // The sun goes down. Every live Thrall becomes a Glider where it stands,
      // keeping its health as a PERCENTAGE -- `convertedHealth`, the same
      // function the scene calls.
      for (const e of enemies) {
        if (!e.alive) continue
        const to = night.conversionFor(e.id)
        if (!to || !ENEMIES[to]) continue
        const def = ENEMIES[to]
        const was = e.health
        const wasMax = e.def.maxHealth
        e.id = to
        e.def = def
        e.health = convertedHealth(was, wasMax, def.maxHealth)
        e.bleed = NO_BLEED
      }
    }

    // Batula's own cycle. `moving` is the scene's test: walking, and not
    // already hunched.
    const boss = enemies.find((e) => e.alive && e.def.acidTrail)
    if (boss) {
      const moving = boss.blockedBy === null && boss.stunRemaining <= 0 && !boss.selfHeld
      const r = night.tickBoss(dt, moving, boss.x, boss.y)
      boss.selfHeld = r.held
    }

    // Puddles, and what stands in them. THE PLAYER'S SIDE ONLY: the hero and
    // the lads. Batula walks through his own trail and takes nothing from it.
    const { ticks } = night.tickPuddles(dt)
    for (let t = 0; t < ticks; t++) {
      const onHero = night.acidAt(heroState.x, heroState.y)
      if (onHero > 0 && !heroState.down) {
        const out = applyHit(heroState.health, hero.maxHealth, onHero, heroState.powered)
        heroState.health = out.health
        if (out.triggers) {
          heroState.powered = true
          heroState.poweredGrace = TRANSFORM_INVULNERABLE_SECONDS
          heroState.invulnerable = TRANSFORM_INVULNERABLE_SECONDS
        }
      }
      // A garrison is a TOWER with lads on it here, not a separate list.
      for (const t of towers) {
        for (const sd of t.soldiers) {
          if (sd.respawnIn > 0) continue
          const d = night.acidAt(sd.x, sd.y)
          if (d > 0) sd.health -= d
        }
      }
    }

    // The sky on every enemy's legs, the sun on the vampires, and their own
    // blood on whatever is bleeding. Written every frame rather than on the
    // flip, so something that spawned after dusk has never seen one.
    const hum = night.humiliation
    for (const e of enemies) {
      e.speedScale = night.speedFor(e.def) * (e.def.acidTrail ? hum.speed : 1)
      if (!e.alive) continue
      const sun = night.sunFor(e.def) * dt
      if (sun > 0) hurtEnemy(e, sun, true)
      const bled = night.bleedTick(e as never, dt)
      if (bled > 0) hurtEnemy(e, bled, true)
    }
  }

  /**
   * The Rooster's breath, one frame at a time.
   *
   * WHAT IS MODELLED EXACTLY, sharing systems/Flame.ts with the scene: the
   * six-second cadence measured from the moment the fire goes out, the 0.8s
   * telegraph during which nothing is damaged, the rule that a boss killed
   * mid-telegraph burns nothing, the corridor's geometry including its round
   * tip, the damage-per-tick to the hero and the lads, the scorch's fire-rate
   * halving and its four seconds, and the rule that the fire never touches
   * another enemy.
   *
   * WHAT IS APPROXIMATED. The HEADING. The scene reads the boss's own facing
   * off the lane it is walking; here the corridor is cast along the direction
   * from where it stood a frame ago to where it stands now, which is the same
   * answer on a straight run and drifts by a few degrees through a bend. On
   * level 6 both lanes are nearly straight, so the two agree closely -- but it
   * is an approximation and not an equality, and a level with a hairpin in it
   * would need this replaced with a lane lookup.
   *
   * WHAT IS NOT MODELLED. The summoned fighters, which the soak does not put
   * on the board at all, so the fire has two kinds of victim here and three in
   * the game.
   */
  /**
   * Level 7's Blade Rig, one frame at a time.
   *
   * WHAT IS MODELLED: the hero and the garrison lads, through the same
   * subtraction their own fights use, against `bladeDamage` -- the identical
   * pure function the scene calls, imported rather than re-derived, so the two
   * cannot drift the way a re-implementation would.
   *
   * WHAT IS NOT MODELLED: the summoned fighters, for `tickBoss`'s reason --
   * this file does not put them on the board at all. So the blades have two
   * kinds of victim here and three in the game, and the mini boss is measured
   * slightly LIGHT: a player whose gnomes are standing in the road loses units
   * the simulation does not.
   *
   * WHAT IS NOT A CONCERN: towers. They are out of scope in the rule itself,
   * so there is nothing to leave out.
   */
  const tickBlades = (dt: number): void => {
    if (!BLADES) return
    const rigs = enemies.filter((e) => e.alive && e.def.bladed === true)
      .map((e) => ({ x: e.x, y: e.y }))
    if (rigs.length === 0) return
    if (!heroState.down) {
      const cut = bladeDamage({ x: heroState.x, y: heroState.y }, rigs, BLADES, dt)
      if (cut > 0) {
        const out = applyHit(heroState.health, hero.maxHealth, cut, heroState.powered)
        heroState.health = out.health
        if (out.triggers) {
          heroState.powered = true
          heroState.poweredGrace = TRANSFORM_INVULNERABLE_SECONDS
          heroState.invulnerable = TRANSFORM_INVULNERABLE_SECONDS
        }
        if (out.down) {
          heroState.down = true
          heroState.powered = false
          heroState.reviveIn = hero.reviveSeconds
        }
        bladeCuts += cut
      }
    }
    for (const t of towers) {
      for (const sd of t.soldiers) {
        if (sd.respawnIn > 0) continue
        const cut = bladeDamage({ x: sd.x, y: sd.y }, rigs, BLADES, dt)
        if (cut > 0) { sd.health -= cut; bladeCuts += cut }
      }
    }
  }

  /**
   * HAT-GTT repairing itself, and it runs the scene's module rather than a
   * second copy of the arithmetic.
   *
   * No art and no sprite swap here -- the alternate tilt is a look -- but the
   * HEALTH is the same number the player chews through, which is the whole
   * point of this file importing systems/Regen.ts instead of approximating it.
   */
  const tickRegens = (dt: number): void => {
    for (const e of enemies) {
      const def = e.def.regen
      if (!def || !e.regen) continue
      // `e.def.maxHealth` AND NOT `e.maxHealth`, because the sim's enemy state
      // has no such field -- it carries `health` and reads its ceiling off the
      // def, which is the one difference from the scene's Enemy that this rule
      // touches. Written as `e.maxHealth` first, and the arithmetic came out
      // NaN in silence: `health >= undefined` is false, `health / undefined`
      // is NaN, `NaN >= belowHealth` is false, so the guard passed, the heal
      // computed as NaN and `healed > 0` rejected it. The soak reported a
      // clean 38% for a boss whose whole mechanic never ran once.
      const max = e.def.maxHealth ?? 0
      const r = tickRegen(e.regen, dt, e.alive, e.health, max, def)
      e.regen = r.state
      if (r.healed > 0) {
        e.health = Math.min(max, e.health + r.healed)
        healedTotal += r.healed
      }
    }
  }

  /* ------------------------------------------- level 10: three of six */

  /**
   * VLAUDE'S MANIPULATIONS, AND THE SIM CAN ONLY EXPRESS THREE OF THE SIX.
   *
   * WHAT RUNS HERE, through the SAME functions the scene calls -- `armedAt`,
   * `tickSchedule`, `copyTargets`, `copyCount`, `hasteMultiplier`,
   * `hasteSeconds` -- so the pacing, the global cooldown, the combination rows
   * and the no-duplicate-of-a-duplicate rule are one implementation and not
   * two:
   *
   *   speedAlter      a multiplier slot on every walker, set and restored.
   *   duplicateEnemy  a second body at the original's place and health share.
   *   createEnemies   real units from the pool, at the gate, under their cap.
   *
   * WHAT DOES NOT, AND IT IS DELIBERATE RATHER THAN UNFINISHED:
   *
   *   buildLock       BuildSystem models `occupied` and nothing else. There is
   *                   no lock state for `isFree` to read, and the nearest
   *                   thing this file has is a Glitch Bug DESTROYING a tower,
   *                   which frees a pad and can never forbid one.
   *   generateWall    the hero here is a fixed point at `totalLength * 0.5`
   *                   and never moves, so ground denied to the hero and to a
   *                   garrison is invisible to it.
   *   generateWeapon  there is no tower health, and a turret that suppresses a
   *                   tower over time is a third thing this file cannot say.
   *
   * Teaching it those three is a change to the SIMULATOR rather than to the
   * level, it was decided against, and the win rate below is quoted with that
   * stated rather than hidden. See reports/2026-09-14-level-10-the-fight.md.
   */
  const VLAUDE: VlaudeRules | null = vlaudeRules(levelRules(levelId))
  let vArmed: ArmedPower[] = []
  let vSince = 0
  let vHasteLeft = 0
  /** Casts that have telegraphed and not yet landed. The lead is real time in
   *  the scene and is real time here. */
  const vPending: Array<{ left: number; powers: PowerId[] }> = []
  /** Units `createEnemies` still owes, each with the seconds left on it. */
  const vMaking: Array<{ left: number; id: string }> = []
  /** Copies waiting out `duplicateEnemy.durationMs` before they appear, which
   *  is the fx playing over the original in the scene. */
  const vInserts: Array<{ left: number; made: { id: string; laneId: string; laneAt: number
    at: number; pick: number; share: number } }> = []
  /** How many casts of each power this file could not answer, so a report can
   *  say so with a number rather than a claim. */
  const vUnmodelled = new Map<PowerId, number>()

  const vArm = (wave: number): void => {
    if (!VLAUDE) return
    vArmed = armedAt(VLAUDE, wave)
    vSince = VLAUDE.globalCooldownSeconds
    vPending.length = 0
    vMaking.length = 0
  }

  const vLand = (id: PowerId): void => {
    if (!VLAUDE) return
    if (id === 'speedAlter') {
      const m = hasteMultiplier(VLAUDE)
      for (const e of enemies) if (e.alive) e.hasteSpeed = m
      vHasteLeft = hasteSeconds(VLAUDE)
      return
    }
    if (id === 'duplicateEnemy') {
      const field = enemies.filter((e) => e.alive)
      const targets = copyTargets(VLAUDE, field.map((e) => ({ id: e.id, copyDepth: e.copyDepth })))
      const want = copyCount(VLAUDE, targets.length)
      const picked = field.filter((e) => targets.some((t) => t.id === e.id)).slice(0, want)
      const delay = ((VLAUDE.powers.duplicateEnemy ?? {}).durationMs as number ?? 0) / 1000
      for (const src of picked) {
        const share = (src.def.maxHealth ?? 0) > 0 ? src.health / src.def.maxHealth : 1
        // DEFERRED BY THE FX'S OWN DURATION, exactly as the scene defers it:
        // the picture plays over the original and the copy is inserted when it
        // finishes, so the two are the same beat in both.
        vInserts.push({ left: delay, made: { id: src.id, laneId: src.laneId,
          laneAt: src.laneDistance, at: src.distance, pick: src.routePick, share } })
      }
      return
    }
    if (id === 'createEnemies') {
      const cfg = VLAUDE.powers.createEnemies ?? {}
      const pool = (cfg.pool as string[]) ?? []
      const count = (cfg.count as number) ?? 0
      const gap = (cfg.intervalSeconds as number) ?? 0
      if (pool.length === 0) return
      for (let n = 0; n < count; n++) {
        vMaking.push({ left: n * gap, id: pool[Math.floor(routeRng() * pool.length)]! })
      }
      return
    }
    // buildLock, generateWall and generateWeapon: see the note above. Counted
    // so a report can say how many casts this file could not answer.
    vUnmodelled.set(id, (vUnmodelled.get(id) ?? 0) + 1)
  }

  const tickVlaude = (dt: number): void => {
    if (!VLAUDE) return
    if (vHasteLeft > 0) {
      const m = hasteMultiplier(VLAUDE)
      for (const e of enemies) if (e.alive) e.hasteSpeed = m
      vHasteLeft -= dt
      if (vHasteLeft <= 0) {
        vHasteLeft = 0
        for (const e of enemies) e.hasteSpeed = HASTE_OFF
      }
    }
    for (let i = vInserts.length - 1; i >= 0; i--) {
      const p = vInserts[i]!
      p.left -= dt
      if (p.left > 0) continue
      vInserts.splice(i, 1)
      const m = p.made
      spawn(m.id, m.at, null, m.laneId, m.laneAt, m.pick)
      const copy = enemies[enemies.length - 1]
      if (copy) {
        copy.copyDepth = 1
        copy.health = Math.max(1, Math.round((copy.def.maxHealth ?? 1) * m.share))
      }
    }
    for (let i = vMaking.length - 1; i >= 0; i--) {
      const m = vMaking[i]!
      m.left -= dt
      if (m.left > 0) continue
      vMaking.splice(i, 1)
      const cap = (VLAUDE.powers.createEnemies ?? {}).maxAliveFromThisPower as number ?? 0
      if (enemies.filter((e) => e.madeByVlaude && e.alive).length >= cap) continue
      spawn(m.id, 0, null, MAIN_LANE, 0, routeRng())
      const made = enemies[enemies.length - 1]
      if (made) made.madeByVlaude = true
    }
    for (let i = vPending.length - 1; i >= 0; i--) {
      const p = vPending[i]!
      p.left -= dt
      if (p.left > 0) continue
      vPending.splice(i, 1)
      for (const id of p.powers) vLand(id)
    }
    if (vArmed.length === 0) return
    const step = tickSchedule(vArmed, dt, vSince, VLAUDE.globalCooldownSeconds)
    vSince = step.sinceLast
    for (const row of step.fired) {
      const powers: PowerId[] = row.with ? [row.power, row.with] : [row.power]
      vPending.push({ left: VLAUDE.telegraph.leadSeconds, powers })
    }
  }

  const tickBoss = (dt: number): void => {
    if (!FLAME) return
    for (const t of towers) if (t.scorchedFor > 0) t.scorchedFor = Math.max(0, t.scorchedFor - dt)
    for (const e of enemies) {
      if (!e.flame) continue
      const r = tickFlame(e.flame, dt, e.alive, FLAME)
      e.flame = r.state
      e.selfHeld = r.held
      if (!r.burning) continue
      const from = { x: e.x, y: e.y }
      const to = flameEnd(e.x, e.y, e.heading, FLAME)
      // Towers are scorched for as long as the fire touches them, refreshed
      // every frame it does -- so the four seconds run from the LAST frame in
      // the fire rather than the first.
      for (const t of towers) {
        if (t.buildLeft > 0) continue
        if (inFlame({ x: t.x, y: t.y }, from, to, FLAME)) t.scorchedFor = FLAME.scorchSeconds
      }
      if (r.ticks <= 0) continue
      const per = FLAME.damagePerSecond * FLAME.tickSeconds
      for (let i = 0; i < r.ticks; i++) {
        if (!heroState.down && inFlame({ x: heroState.x, y: heroState.y }, from, to, FLAME)) {
          const out = applyHit(heroState.health, hero.maxHealth, per, heroState.powered)
          flameDamage += heroState.health - out.health
          heroState.health = out.health
          if (out.triggers) {
            heroState.powered = true
            heroState.poweredGrace = TRANSFORM_INVULNERABLE_SECONDS
            heroState.invulnerable = TRANSFORM_INVULNERABLE_SECONDS
          }
        }
        for (const t of towers) {
          for (const sd of t.soldiers) {
            if (sd.respawnIn > 0) continue
            if (inFlame({ x: sd.x, y: sd.y }, from, to, FLAME)) { sd.health -= per; flameDamage += per }
          }
        }
      }
    }
  }

  /**
   * Bosses calling in help, modelled the way the scene does it: at the
   * summoner's own distance, capped by how many of ITS children are still
   * alive, and not counted toward the wave being over.
   */
  /**
   * Human Resources: bonus armour for everything standing near a living one.
   *
   * ASKED EVERY FRAME rather than applied and unwound, which is what the scene
   * does and for the scene's reason -- an aura applied on spawn and removed on
   * death leaks the moment something dies in a way the remover did not expect.
   * The source is not its own beneficiary, and two of them do not stack; both
   * of those live in `auraArmorAt` and are the same code the game runs.
   */
  const tickArmorAura = (): void => {
    if (!AURA) return
    const sources = enemies
      .filter((e) => e.alive && e.def.armorAura === true)
      .map((e) => ({ x: e.x, y: e.y, alive: true }))
    if (sources.length === 0) {
      for (const e of enemies) e.auraArmor = 0
      return
    }
    for (const e of enemies) {
      e.auraArmor = e.def.armorAura === true ? 0 : auraArmorAt({ x: e.x, y: e.y }, sources, AURA)
      if (e.auraArmor > 0) e.everBuffed = true
    }
  }

  const tickSummons = (dt: number): void => {
    for (const parent of [...enemies]) {
      const spec = parent.def.summons
      if (!spec || !parent.alive) continue
      parent.summonTimer -= dt
      let due = 0
      while (parent.summonTimer <= 0) { due += spec.count; parent.summonTimer += spec.interval }
      if (due <= 0) continue
      if (spec.cap !== undefined) {
        const alive = enemies.filter((e) => e.alive && e.summonedBy === parent).length
        due = Math.min(due, Math.max(0, spec.cap - alive))
      }
      // On its parent's own lane at its parent's own place, so a boss called
      // down a branch does not send its brood along a different route.
      for (let i = 0; i < due; i++)
        spawn(spec.enemy, parent.distance, parent, parent.laneId, parent.laneDistance,
          parent.routePick)
    }
  }

  /**
   * A vampire heals off what it just took from a player unit.
   *
   * ON THE DAMAGE ACTUALLY DEALT, not on the swing: the hero's transformation
   * takes a cut out of what reaches him and a vampire should drink what it
   * got. `healFor` returns 0 for the three cases the caller must not have to
   * remember -- no lifesteal, the sun up, or blood already running out of it.
   */
  const drink = (e: SimEnemy, dealt: number): void => {
    const healed = night?.healFor(e as never, dealt) ?? 0
    if (healed > 0) e.health = Math.min(e.def.maxHealth, e.health + healed)
  }

  /** What a tower's reload is multiplied by where it stands. 1 with no acid. */
  const acidScale = (t: SimTower): number =>
    (night?.towerSlowAt(t.x, t.y) ?? 1)
    * (t.scorchedFor > 0 && FLAME ? scorchIntervalMultiplier(FLAME) : 1)

  /** Filled in at the top of the final wave. See `FinaleBoard`. */
  let finale: FinaleBoard | null = null
  /** The def id `measureFinale` picked, so `hurtEnemy` can keep its ledger. */
  let finaleId = ''
  let finaleDealt = 0
  let finaleLowest = 1
  let finaleKills = 0

  /**
   * What the board can do to the final wave's heaviest enemy.
   *
   * MEASURED, NOT MODELLED, and read-only. Every number comes from the same
   * `statOf` / `lift` / `damageAfterArmor` path the firing loop itself uses,
   * so this cannot report a gun the sim does not actually have. It deliberately
   * leaves out the hero, the abilities and every slow: those are the
   * player's variance, and a boss health figure wants the floor the BOARD
   * guarantees. What it leaves out is listed in the report rather than
   * quietly.
   */
  const measureFinale = (wi: number): FinaleBoard | null => {
    const spawns = (WAVES[wi] as any)?.spawns ?? []
    let worst: any = null
    let worstId = ''
    for (const sp of spawns) {
      const def = (enemiesData as any)[sp.enemy]
      if (!def) continue
      if (worst === null || (def.maxHealth ?? 0) > (worst.maxHealth ?? 0)) {
        worst = def
        worstId = sp.enemy
      }
    }
    if (!worst) return null
    finaleId = worstId
    const armor = worst.armor ?? 0
    const speed = worst.speed ?? 0
    // THE ROUTE THAT ENEMY WOULD WALK. The longest one from its lane, which is
    // the most exposure any pick of a split can give it -- so `walkDamage` is
    // an upper bound on the board's side of a branching map and exact on a map
    // with one road, which level 10 is.
    const laneId = spawns.find((sp: any) => sp.enemy === worstId)?.lane ?? MAIN_LANE
    const route: Array<{ path: Path; from: number }> = []
    let hop = net.lane(laneId)
    let at = 0
    for (let guard = 0; guard < 8; guard++) {
      route.push({ path: hop.path, from: at })
      const conts = hop.merge
      if (!conts || conts.length === 0) break
      // The arm with the most road in front of it, for the reason above.
      let best = conts[0]!
      let bestLen = -1
      for (const c of conts) {
        const target = net.lane(c.into)
        const len = target.path.totalLength - target.path.distanceAtIndex(c.atIndex)
        if (len > bestLen) { bestLen = len; best = c }
      }
      const next = net.lane(best.into)
      if (next.id === hop.id) break
      at = next.path.distanceAtIndex(best.atIndex)
      hop = next
    }
    let walkPx = 0
    for (const r of route) walkPx += Math.max(0, r.path.totalLength - r.from)

    const sources = auraSources()
    let boardDps = 0
    let walkDamage = 0
    let guns = 0
    // ONE PIXEL A STEP along the route, which on a 3,440 px road is 3,440
    // samples per tower and is the cheapest honest way to ask "how much of
    // this road is inside that circle". A closed form for a polyline against a
    // disc is a second geometry implementation to keep in step with `Path`.
    const STEP = 1
    for (const t of towers) {
      if (t.buildLeft > 0) continue
      if (statOf(t, 'supportRadius') > 0) continue
      guns++
      const gain = sources.length === 0 ? NO_AURA : auraAt(t.x, t.y, sources)
      const dmg = boostedDamage(statOf(t, 'damage'), gain.damage)
      const pierce = statOf(t, 'armorPierce') + gain.pierce
      const spec: any = specById(t.def, t.spec) ?? {}
      const ia = !!t.def.ignoresArmor || !!spec.ignoresArmor
      const interval = Math.max(0.05, statOf(t, 'fireInterval')) * acidScale(t)
      const dps = damageAfterArmor(dmg, armor, ia, pierce) / interval
      boardDps += dps
      const range = statOf(t, 'range') * (1 + gain.range)
      let inRangePx = 0
      for (const r of route) {
        for (let d = r.from; d <= r.path.totalLength; d += STEP) {
          const p = r.path.pointAt(d)
          if (Math.hypot(p.x - t.x, p.y - t.y) <= range) inRangePx += STEP
        }
      }
      if (speed > 0) walkDamage += dps * (inRangePx / speed)
    }
    return {
      wave: wi + 1,
      enemy: worstId,
      armor,
      speed,
      health: worst.maxHealth ?? 0,
      towers: guns,
      freePads: Math.max(0, (MAP.buildSpots?.length ?? 0) - towers.length),
      boardDps: +boardDps.toFixed(1),
      walkDamage: Math.round(walkDamage),
      walkSeconds: speed > 0 ? +(walkPx / speed).toFixed(1) : 0,
      killSeconds: boardDps > 0 ? +((worst.maxHealth ?? 0) / boardDps).toFixed(1) : Infinity,
      // Placeholders; the run has not happened yet. Overwritten at the return.
      dealt: 0,
      lowestFraction: 1,
      killed: 0,
    }
  }

  const hurtEnemy = (e: SimEnemy, damage: number, ignoresArmor: boolean, pierce = 0): void => {
    if (!e.alive) return
    // THE AURA IS IN THE ARMOUR, which is where the shipped `effectiveArmor`
    // puts it: one place, so every damage path in this file respects it
    // without any of them knowing it exists.
    const armor = Math.max(0, e.def.armor + e.auraArmor - e.armorShred)
    const dealt = ignoresArmor ? damage : damageAfterArmor(damage, armor, pierce)
    if (!Number.isFinite(dealt)) { note('nan', `damage to ${e.id} is ${dealt}`); return }
    if (dealt < 0) note('negative', `damage to ${e.id} is ${dealt}`)
    e.health -= dealt
    // THE BOSS'S LEDGER. Every damage path in this file goes through here, so
    // this is the one place that can answer "how much did the board actually
    // put into him" -- which is the question `FinaleBoard`'s arithmetic can
    // only estimate, because it cannot know about slows, the hero, the
    // abilities or the escorts stealing the targeting.
    if (finaleId !== '' && e.id === finaleId) {
      finaleDealt += dealt
      // `e.def.maxHealth` rather than `e.maxHealth`: a SimEnemy carries its
      // CURRENT health and reads its maximum off the def, and the wrong one
      // here made this field NaN, which JSON writes as null.
      finaleLowest = Math.min(finaleLowest,
        Math.max(0, e.health) / Math.max(1, e.def.maxHealth ?? 1))
    }
    if (e.health <= 0) {
      e.alive = false
      if (finaleId !== '' && e.id === finaleId) finaleKills++
      kills++
      peanuts += e.def.peanutReward
      peanutsEarned += e.def.peanutReward
      // What is left when something breaks apart: the Vampire Lord's four
      // Gliders, at the place and on the lane it died on, carrying its route
      // pick. `summonedBy` keeps them out of the wave-over count, exactly as
      // the scene's do.
      // ONE KIND OR SEVERAL, and level 7's Transporter is the several: four
      // cars off its trailer, one of each colour, strung back along the lane
      // from the place it fell and released over a short beat. The first is at
      // the death point exactly, which is what keeps the late-kill case as bad
      // here as it is in the game -- see `GameScene.splitOnDeath`.
      const sp = e.def.splitsOnDeath
      if (sp) {
        // HOW FAR FROM ITS EXIT it was when it fell, which on level 7 is the
        // whole design of the finale. `routeLength` is the lane's own, so this
        // is road left rather than road walked.
        splitKillToExit = Math.max(0, net.routeLength(e.laneId) - e.laneDistance)
        const ids: string[] = sp.enemies ?? (sp.enemy ? [sp.enemy] : [])
        const spacing: number = sp.spacingPx ?? 0
        const stagger: number = sp.emergeSeconds ?? 0
        const holds: boolean = sp.holdsWave === true
        if (ids.length > 0) {
          for (let i = 0; i < sp.count; i++) {
            spawn(ids[i % ids.length]!, Math.max(0, e.distance - spacing * i), e, e.laneId,
              Math.max(0, e.laneDistance - spacing * i), e.routePick, holds, stagger * i)
          }
        }
      }
      deathBlast(e)
    } else {
      checkThresholds(e)
    }
  }

  /**
   * The Consultant's parting recommendation: a blast at its corpse that
   * damages BOTH SIDES.
   *
   * WHAT IS MODELLED: the enemies caught, through `hurtEnemy` -- so a blast
   * that kills another Consultant sets off its blast, which is the mechanic
   * rather than a loop -- and the hero and the lads, through the same
   * subtraction their own fights use.
   *
   * WHAT IS NOT: the gnomes, because this file does not put summoned fighters
   * on the board at all (see the note on `tickBoss`). So the friendly half of
   * the explosion is modelled slightly LIGHT here: a player whose gnomes are
   * standing in the blast loses units the simulation does not.
   */
  function deathBlast(dead: SimEnemy): void {
    if (!BLAST || dead.def.deathBlast !== true) return
    const r = BLAST.radius
    for (const other of [...enemies]) {
      if (other === dead || !other.alive) continue
      if (Math.hypot(other.x - dead.x, other.y - dead.y) > r) continue
      hurtEnemy(other, BLAST.damage, false)
    }
    if (!BLAST.hitsPlayerUnits) return
    if (!heroState.down && Math.hypot(heroState.x - dead.x, heroState.y - dead.y) <= r) {
      heroState.health -= BLAST.damage
      blastOnFriendlies += BLAST.damage
    }
    for (const t of towers) {
      for (const sd of t.soldiers) {
        if (sd.respawnIn > 0 || Math.hypot(sd.x - dead.x, sd.y - dead.y) > r) continue
        sd.health -= BLAST.damage
        blastOnFriendlies += BLAST.damage
      }
    }
  }

  /**
   * Every health phase this enemy has crossed and not yet spent.
   *
   * A LIST AND NOT ONE OBJECT, since level 8's CEO summons at 70% and again at
   * 40%; Batula's single-object row reads exactly as it did.
   *
   * AND IT IS NO LONGER GATED ON `night`. It was -- the whole block sat behind
   * `night &&`, because the only threshold in the game was Batula's and his
   * grants a Humiliation stack, which is a level 5 concept. The CEO's phases
   * would have fired NOWHERE in this file, and his fight would have been
   * soaked against a boss that never summons. Only the humiliation needs the
   * night now.
   */
  function checkThresholds(e: SimEnemy): void {
    const decl = e.def.onHealthThreshold
    if (!decl) return
    const list = Array.isArray(decl) ? decl : [decl]
    for (let i = 0; i < list.length; i++) {
      if (e.firedThresholds.has(i)) continue
      const t = list[i]!
      if (e.health / (e.def.maxHealth ?? 1) > t.belowHealth) continue
      e.firedThresholds.add(i)
      if (t.humiliation && night) night.addHumiliation(t.humiliation)
      const sp = t.summon
      if (!sp) continue
      // The cap counts this summoner's own living children, so the second
      // phase tops the board up rather than adding four unconditionally.
      let want = sp.count
      if (sp.cap !== undefined) {
        const alive = enemies.filter((x) => x.alive && x.summonedBy === e).length
        want = Math.min(want, Math.max(0, sp.cap - alive))
      }
      for (let k = 0; k < want; k++) {
        spawn(sp.enemy, e.distance, e, e.laneId, e.laneDistance, e.routePick)
      }
    }
  }

  // How far each pad is from the nearest point on the road.
  //
  // On level 1 this is 87-119 world px and every tower out-ranges it, so the
  // number never mattered and nothing measured it. Level 2's pads run to 185,
  // past four of the five ranges, and a tower built on one of those is a
  // tower that never fires. A player sees the range ring and does not do
  // that; a soak that picks at random does it constantly and reports the
  // level as unwinnable for a reason no human would hit.
  // EVERY LANE, not just the trunk. On level 3 the trunk is the shared tail
  // alone, so a pad covering the upper gate is 400px from it and would rank as
  // unreachable -- the scripted player would fill the fork last or not at all,
  // and report a level nobody would actually play that way as unwinnable. This
  // is the level 2 pad-range failure in a different disguise.
  const padToLane: number[] = build.spots.map((spot) => {
    let best = Infinity
    for (const l of net.lanes) {
      const w = l.path.points
      for (let i = 0; i < w.length - 1; i++) {
        const ax = w[i]!.x, ay = w[i]!.y
        const bx = w[i + 1]!.x, by = w[i + 1]!.y
        const dx = bx - ax, dy = by - ay
        const len2 = dx * dx + dy * dy
        const t = len2 ? Math.max(0, Math.min(1, ((spot.x - ax) * dx + (spot.y - ay) * dy) / len2)) : 0
        best = Math.min(best, Math.hypot(spot.x - (ax + t * dx), spot.y - (ay + t * dy)))
      }
    }
    return best
  })

  // How much road is left between each pad and the exit -- the tower-disable's
  // tie-break. Distance to the exit rather than distance travelled, because on
  // a branching map the two branches have their own zero.
  const padToExit: number[] = build.spots.map((spot) => {
    let best = Infinity
    for (const l of net.lanes) {
      const route = net.routeLength(l.id)
      const w = l.path.points
      let travelled = 0
      let nearest = Infinity
      let atNearest = 0
      for (let i = 0; i < w.length - 1; i++) {
        const ax = w[i]!.x, ay = w[i]!.y
        const bx = w[i + 1]!.x, by = w[i + 1]!.y
        const dx = bx - ax, dy = by - ay
        const len2 = dx * dx + dy * dy
        const seg = Math.sqrt(len2)
        const t = len2 ? Math.max(0, Math.min(1, ((spot.x - ax) * dx + (spot.y - ay) * dy) / len2)) : 0
        const d = Math.hypot(spot.x - (ax + t * dx), spot.y - (ay + t * dy))
        if (d < nearest) { nearest = d; atNearest = travelled + seg * t }
        travelled += seg
      }
      best = Math.min(best, route - atNearest)
    }
    return best
  })

  // --- the scripted player ----------------------------------------------
  // Nearest the road first, not the order the pads happen to sit in the JSON.
  //
  // The scripted player fills pads in the order it walks them, so with index
  // order the result depended on how the map file happened to list its spots.
  // Level 2 measured 9/60 in overlay reading order and 21/60 with the SAME
  // fifteen pads sorted by distance — a 12-run swing from a field the map's
  // own note calls meaningless. That is the harness ranking maps by their
  // array order. A player looks at the board and covers the road first, so
  // the sim does too, and the number now describes the level.
  // HOW MUCH TRAFFIC EACH LANE ACTUALLY CARRIES, as a share of the level's
  // bodies. A lane's traffic is what SPAWNS on it plus everything that merges
  // into it, so a trunk carries the whole level and a flank carries a trickle.
  const laneTraffic = ((): Record<string, number> => {
    const out: Record<string, number> = {}
    for (const l of net.lanes) out[l.id] = 0
    let total = 0
    for (const wv of WAVES) {
      for (const sp of wv.spawns) {
        const startId = net.lane(sp.lane ?? MAIN_LANE).id
        total += sp.count
        // Every lane on this group's route, the ones it merges into included --
        // AND AT A SPLIT, EVERY ARM, BY ITS SHARE.
        //
        // This walked `transferFrom`, which is documented as returning THE
        // FIRST ARM at a split and being the wrong function to move anything
        // with. On a plain merge that is the only arm and the walk is right; on
        // a split it hands the first arm 100% of the level's bodies and every
        // other arm ZERO. Level 9's flank read 0% traffic with a quarter of
        // every wave walking down it, which put it under `MINOR_LANE_SHARE`,
        // which kept the three pads that cover it out of `rankAgainst` -- so
        // the scripted player covered a road nobody walked on level 6 and
        // refused to cover one everybody walked on level 9, off the same
        // number read two ways.
        //
        // THE SHARE COMES FROM THE WAVE where the map names an optional branch,
        // because that is where it is tuned; a map with split weights and no
        // `flankShare` still uses the weights, which is level 5.
        const wShare = (wv as { flankShare?: number }).flankShare
        const wFlank = MAP.flankId as string | undefined
        const spread = (id: string, bodies: number, depth: number): void => {
          out[id] = (out[id] ?? 0) + bodies
          if (depth > net.lanes.length) return
          const next = net.continuations(id)
          if (!next.length) return
          const weights = next.map((o) => Math.max(0, o.weight))
          const sum = weights.reduce((a, b) => a + b, 0)
          const flankAt = wFlank === undefined || wShare === undefined
            ? -1 : next.findIndex((o) => o.lane.id === wFlank)
          const rest = flankAt < 0 ? 0 : sum - weights[flankAt]!
          for (const [i, o] of next.entries()) {
            const share = flankAt < 0
              ? (sum > 0 ? weights[i]! / sum : 1 / next.length)
              : i === flankAt
                ? wShare!
                : (rest > 0 ? (1 - wShare!) * (weights[i]! / rest) : 0)
            if (share > 0) spread(o.lane.id, bodies * share, depth + 1)
          }
        }
        spread(startId, sp.count, 0)
      }
    }
    for (const k of Object.keys(out)) out[k] = total ? out[k]! / total : 0
    return out
  })()

  /**
   * THE ORDER THE SCRIPTED PLAYER FILLS PADS, and a lane nothing walks is not
   * part of "the road".
   *
   * It was `padToLane` ascending -- nearest the road first -- which is right
   * while every lane carries comparable traffic. Measured, that is true of
   * every level up to 5: the thinnest lane in the game is level 5's south gate
   * at 32.5% of the run's bodies, and a trunk carries 100%. Level 6's FLANK
   * carries 4.7%, and four pads sit nearer to it than to either front lane --
   * so adding it to the map moved pad 12 from 16th in this queue to FIRST and
   * the level's measured win rate from 38% to 13%, with the flank's spawns
   * removed entirely. The board had not changed; the scripted player had just
   * been made to spend its opening purse covering a lane nothing walked.
   *
   * SO A LANE IS EXCLUDED, NOT DISCOUNTED. Weighting the distance by the share
   * was tried first and is wrong: on levels 3, 4 and 5 the branches carry
   * 32-55% against the trunk's 100%, so dividing by the share re-ranked their
   * pads too and moved all three levels -- level 5 from 45% to 64%. A
   * threshold changes level 6 and nothing else, because there is a factor of
   * seven of clear air between 4.7% and 32.5%.
   *
   * `MINOR_LANE_SHARE` is that threshold. A pad still gets built eventually --
   * the queue holds every pad -- it just stops jumping the queue for a
   * trickle, which is what a player looking at the board would also not do.
   */
  const MINOR_LANE_SHARE = 0.2
  const ranked = net.lanes.filter((l) => (laneTraffic[l.id] ?? 0) >= MINOR_LANE_SHARE)
  const rankAgainst = ranked.length > 0 ? ranked : net.lanes
  const padRank: number[] = build.spots.map((spot) => {
    let best = Infinity
    for (const l of rankAgainst) {
      const w = l.path.points
      for (let i = 0; i < w.length - 1; i++) {
        const ax = w[i]!.x, ay = w[i]!.y
        const bx = w[i + 1]!.x, by = w[i + 1]!.y
        const dx = bx - ax, dy = by - ay
        const len2 = dx * dx + dy * dy
        const t = len2 ? Math.max(0, Math.min(1, ((spot.x - ax) * dx + (spot.y - ay) * dy) / len2)) : 0
        best = Math.min(best, Math.hypot(spot.x - (ax + t * dx), spot.y - (ay + t * dy)))
      }
    }
    return best
  })

  /**
   * THE FILL ORDER, nearest the road first -- AND SPREAD ACROSS THE ROADS WHEN
   * THAT LEAVES A TIE.
   *
   * `padRank` alone was right for every level up to 6, where the pads sit at
   * irregular distances and a sort by distance is a total order. LEVEL 7 BROKE
   * IT COMPLETELY: its board is two medians of ten pads each, every one of
   * them placed at exactly the house standoff, so TWENTY pads rank 91.0 and
   * the sort falls back to the order the array happens to list them in. That
   * order is the tracer's, which filled the north median before the south one
   * -- so the scripted player bought eight towers in a row 276 px from the
   * south highway and never touched it. Measured: 55-71% of all lives lost
   * came out of the south exit, at every rank-and-file health from 40% to
   * 100%, and the level read as unwinnable at 0/40 on all four.
   *
   * IT IS THE LEVEL 6 FLANK FAILURE AGAIN, in the other disguise: there the
   * ranking was meaningful and the traffic was not, here the traffic is fine
   * and the ranking has no information in it. Both report a board nobody would
   * play that way as impossible.
   *
   * SO A TIE IS BROKEN BY SPREADING. Pads that rank the same are dealt out
   * round-robin over the lane each is nearest to, which is what a player
   * looking at three roads does: cover one, then the next, then the next. A
   * tie group of one -- every group on levels 1 to 6 -- comes out in exactly
   * the order it went in, so those levels are bit-identical and the re-soak in
   * reports/2026-09-13-level-7.md says so.
   */
  const nearestLaneOf: string[] = build.spots.map((spot) => {
    let best = rankAgainst[0]?.id ?? net.main.id
    let bestD = Infinity
    for (const l of rankAgainst) {
      const d = l.path.distanceTo(spot.x, spot.y)
      if (d < bestD) { bestD = d; best = l.id }
    }
    return best
  })
  const byReach = ((): typeof build.spots => {
    const sorted = [...build.spots].sort(
      (a, b) => (padRank[a.index] ?? 0) - (padRank[b.index] ?? 0))
    const out: typeof build.spots = []
    for (let i = 0; i < sorted.length;) {
      // One group of pads that rank the same, to a tenth of a pixel -- the
      // precision the placement itself was done at.
      let j = i
      const at = padRank[sorted[i]!.index] ?? 0
      while (j < sorted.length && Math.abs((padRank[sorted[j]!.index] ?? 0) - at) < 0.05) j++
      const group = sorted.slice(i, j)
      i = j
      if (group.length <= 1) { out.push(...group); continue }
      // Deal them out, one lane at a time, keeping each lane's own order.
      const queues = new Map<string, typeof build.spots>()
      for (const spot of group) {
        const id = nearestLaneOf[spot.index] ?? net.main.id
        if (!queues.has(id)) queues.set(id, [])
        queues.get(id)!.push(spot)
      }
      const ids = [...queues.keys()]
      for (let k = 0; out.length < i; k++) {
        let dealt = false
        for (const id of ids) {
          const q = queues.get(id)!
          if (k >= q.length) continue
          out.push(q[k]!)
          dealt = true
        }
        if (!dealt) break
      }
    }
    return out
  })()

  const spend = (): void => {
    if (mode === 'nobuild') return
    for (const spot of byReach) {
      if (!build.isFree(spot.index)) continue
      const pickable = mode === 'supportonly'
        ? Object.keys(TOWERS).filter((id) => TOWERS[id].supportRadius > 0)
        : unlocked
      const reach = padToLane[spot.index] ?? 0
      const affordable = pickable
        .filter((id) => TOWERS[id].cost <= peanuts)
        // A support tower buffs its neighbours rather than shooting, so its
        // range is not the thing that has to reach the road.
        .filter((id) => TOWERS[id].supportRadius > 0 || TOWERS[id].range >= reach)
      if (affordable.length === 0) break
      const id = rng.pick(affordable)
      peanuts -= TOWERS[id].cost
      build.occupy(spot.index)
      const t: SimTower = {
        id, def: TOWERS[id], spot: spot.index, x: spot.x, y: spot.y,
        tier: BASE_TIER, spec: null, cooldown: 0, buildLeft: 0, scorchedFor: 0,
        disabledFor: 0, distanceToExit: padToExit[spot.index] ?? Infinity,
        value: TOWERS[id].cost, soldiers: [], rally: null,
      }
      towers.push(t)
      // The lads, at the nearest lane point inside the tower's range -- the
      // same default the scene uses, so the soak is measuring the board a
      // player who never touched the rally point would actually have.
      if ((TOWERS[id].soldierCount ?? 0) > 0) {
        t.rally = defaultRally(net, { x: t.x, y: t.y }, TOWERS[id].range)
        manGarrison(t)
      }
    }
    for (const t of towers) {
      if (t.buildLeft > 0 || isMaxed(t.def, t.tier)) continue
      const choice = atSpecChoice(t.def, t.tier)
        ? rng.pick(t.def.specializations)
        : nextStep(t.def, t.tier)
      if (!choice || peanuts < choice.cost) continue
      peanuts -= choice.cost
      t.buildLeft = choice.buildSeconds
      // What has been sunk into it, which is what the boss's tower-disable
      // measures. Counted as it is spent rather than derived, so a tier still
      // going up already counts -- the peanuts are gone either way.
      t.value += choice.cost
      if (atSpecChoice(t.def, t.tier)) t.spec = choice.id
      // The lads are raised with the tower, and `Need a Friend?` is exactly a
      // third of them walking on.
      if (t.soldiers.length > 0) manGarrison(t)
    }
  }

  /**
   * Gives each free soldier one enemy to hold.
   *
   * ONE EACH, and a grip is kept while it is possible -- the same rule the
   * scene's engagement pass uses. An enemy with no free blocker keeps walking,
   * which is what makes two soldiers a speed bump rather than a wall, and an
   * enemy flagged not blockable is never picked at all.
   */
  const assignSoldierBlocks = (): void => {
    const taken = new Set(enemies.map((e) => e.blockedBy).filter((b) => b && b !== 'hero'))
    for (const t of towers) {
      const range = t.def.soldierBlockRange ?? 46
      for (const sd of t.soldiers) {
        if (sd.respawnIn > 0 || sd.health <= 0) continue
        if (taken.has(sd)) continue
        const near = enemies
          .filter((e) => e.alive && e.def.blockable && e.blockedBy === null
            && Math.hypot(e.x - sd.x, e.y - sd.y) <= range)
          .sort((a, b) => b.distance - a.distance)
        const pick = near[0]
        if (!pick) continue
        pick.blockedBy = sd
        taken.add(sd)
      }
    }
  }

  /** Brings a tower's garrison up to the strength its tier calls for, and
   *  posts everyone. Called at build time and after every tier, because `Need
   *  a Friend?` IS a change in this number. */
  const manGarrison = (t: SimTower): void => {
    const want = Math.round(statOf(t, 'soldierCount'))
    const full = statOf(t, 'soldierHealth')
    const stations = t.rally
      ? soldierStations(net, t.rally as never, want)
      : Array.from({ length: want }, () => ({ x: t.x, y: t.y }))
    while (t.soldiers.length < want) {
      const at = stations[t.soldiers.length] ?? { x: t.x, y: t.y }
      t.soldiers.push({
        tower: t, x: at.x, y: at.y, health: full, maxHealth: full,
        attackTimer: 0, respawnIn: 0, enraged: false,
      })
    }
    for (const [i, sd] of t.soldiers.entries()) {
      const at = stations[i] ?? stations[0] ?? { x: t.x, y: t.y }
      sd.x = at.x
      sd.y = at.y
      if (sd.maxHealth !== full) {
        const share = sd.maxHealth > 0 ? sd.health / sd.maxHealth : 1
        sd.maxHealth = full
        sd.health = Math.max(1, full * share)
      }
    }
  }

  /**
   * The Ima Dummy Tower's lads, one frame.
   *
   * Modelled rather than skipped for the reason the Reaper's ability was: level
   * 1's win rate is measured off this file, and a soak in which two soldiers
   * held nothing would report a level that does not exist.
   */
  const tickGarrisons = (dt: number): void => {
    for (const t of towers) {
      if (t.soldiers.length === 0) continue
      if (t.soldiers.length !== Math.round(statOf(t, 'soldierCount'))) manGarrison(t)
      const spec = (specById(t.def, t.spec) ?? {}) as any
      for (const sd of t.soldiers) {
        if (sd.respawnIn > 0) {
          sd.respawnIn -= dt
          if (sd.respawnIn <= 0) {
            // Back at full health, and Rage forgotten with the wound that
            // caused it.
            sd.respawnIn = 0
            sd.health = sd.maxHealth
            sd.enraged = false
            sd.attackTimer = 0
          }
          continue
        }
        if (sd.health <= 0) { sd.respawnIn = t.def.soldierRespawn ?? 10; continue }

        if (spec.rageBelowHealth && !sd.enraged && sd.health / sd.maxHealth < spec.rageBelowHealth) {
          sd.enraged = true
        }
        const held = enemies.find((e) => e.alive && e.blockedBy === sd)
        if (!held) { sd.attackTimer -= dt; continue }
        sd.attackTimer -= dt
        if (sd.attackTimer > 0) continue
        sd.attackTimer = Math.max(0.05,
          statOf(t, 'soldierInterval') * (sd.enraged ? (spec.rageInterval ?? 1) : 1))
        if (night?.heroBasicBleeds) night.bleedOne(held as never)
        hurtEnemy(held, statOf(t, 'soldierDamage') * (sd.enraged ? (spec.rageDamage ?? 1) : 1), false)
      }
    }
  }

  /**
   * The boss switching a tower off, and the Glitch Bug taking one away. Same
   * rule module as the scene uses, so the two cannot drift; the sim only
   * supplies the candidates and applies the outcome.
   *
   * THE DESTROY HAS TO BE MODELLED OR THE WIN RATE IS A FICTION -- the same
   * reason the disable is. A bug that walked past a board it never touched
   * would make level 4 read easier here than it plays, and level 4 is the
   * level being tuned against this number.
   */
  let towerLost = false
  const tickTowerDisable = (dt: number): void => {
    for (const e of enemies) {
      if (!e.disabler) continue
      const ev = e.disabler.tick(dt, e.alive, e.x, e.y, towers)
      if (ev?.kind !== 'land') continue
      if (e.disabler.destroys) {
        const i = towers.indexOf(ev.target)
        if (i >= 0) {
          towers.splice(i, 1)
          build.release(ev.target.spot)
          // ONCE PER RUN, not once per cast. It is worth knowing that the bug
          // is eating boards and roughly when it starts, and it is not worth
          // burning a run's forty-finding budget on the ten or so casts a
          // level 4 run can carry -- or making this the loudest kind in a
          // 500-run report, ahead of the findings that are actually faults.
          if (!towerLost) {
            towerLost = true
            note('tower-destroyed', `${e.def.name} took ${ev.target.def.name}; more may follow`)
          }
        }
      } else {
        ev.target.disabledFor = e.def.towerDisable.duration
        disableSeconds += e.def.towerDisable.duration
      }
    }
  }

  const castAbilities = (): void => {
    if (mode === 'noabilities') return
    if (enemies.length === 0) return
    const lead = enemies.reduce((a, b) => (a.distance > b.distance ? a : b))
    for (const id of draftedAbilities) {
      if (!cooldowns.ready(id)) continue
      const def = ABILITIES[id]
      cooldowns.start(id)
      firedAbilities.add(id)
      if (def.outcomes?.length) {
        const out = rollOutcome(def.outcomes, rng())
        if (out.payout > 0) { peanuts += out.payout; peanutsEarned += out.payout }
        continue
      }
      if (def.damage > 0) {
        for (const e of withinRadius(enemies.filter((x) => x.alive), lead.x, lead.y, def.radius)) {
          hurtEnemy(e, def.damage, def.ignoresArmor)
        }
      }
      if (def.slowFactor > 0) {
        for (const e of withinRadius(enemies.filter((x) => x.alive), lead.x, lead.y, def.radius)) {
          applySlow(e, def.slowFactor, def.duration)
        }
      }
    }
    // SLOT 1, whichever hero is standing here. All five are modelled, not
    // just Cory's punch: the soak picks a hero per run, and a Bailey run whose
    // Bark did nothing would report a hero that is weaker than the one the
    // player has.
    const k = hero.abilities[0]!
    if (mode !== 'noabilities' && cooldowns.ready(SLOT1) && !heroState.down) {
      const area = isAreaSkill(k)
      const target = area ? null : pickNearest(
        enemies.filter((e) => e.alive) as any, heroState.x, heroState.y, k.range,
      ) as SimEnemy | null
      // A `coversMap` volley reaches the WHOLE BOARD, so what it can catch is
      // every live enemy rather than the ones standing round the hero. The
      // scatter inside that set is still the scatter -- `rainPoints` picks a
      // target per star -- so this only widens the candidate list.
      const caught = area
        ? (k.coversMap
          ? enemies.filter((e) => e.alive) as SimEnemy[]
          : withinRadius(enemies.filter((e) => e.alive) as any,
                         heroState.x, heroState.y, k.radius) as SimEnemy[])
        : []
      if (target || caught.length > 0) {
        cooldowns.start(SLOT1)
        firedAbilities.add(SLOT1)
        if (target) {
          // Every hit it lands, including the ones a real Quick Cut spaces out
          // over a fifth of a second -- close enough at this resolution, and a
          // second hit that is skipped when the first kills is modelled by
          // hurtEnemy ignoring a corpse.
          if (night?.heroAbilityBleeds) night.bleedOne(target as never)
          for (let i = 0; i < k.hits; i++) hurtEnemy(target, k.damage, k.ignoresArmor)
          // The burn, applied whole. It arrives over four seconds in the game
          // and at once here, which flatters Ember slightly on a target that
          // was going to die anyway and is worth knowing when its numbers move.
          if (k.burnSeconds > 0) {
            hurtEnemy(target, k.burnPerSecond * k.burnSeconds, k.ignoresArmor)
          }
          // BOTH DISTANCES, as Enemy.ts does it. `distance` is progress and
          // `laneDistance` is where the enemy actually stands; moving only the
          // first would drop the target's priority without moving it an inch,
          // which is the Haymaker doing nothing but damage.
          if (k.knockbackPixels > 0) {
            const back = Math.min(k.knockbackPixels, target.laneDistance, target.distance)
            target.distance -= back
            target.laneDistance -= back
          }
        }
        if (k.effect === 'rain') {
          // A SCATTER, MODELLED AS A SCATTER. Star Rain drops `hits` separate
          // small strikes over its disc and each one only hurts what is within
          // strikeLength of where it lands, so a lone enemy in the disc takes
          // two or three of fourteen rather than all fourteen. Applying
          // `k.damage` once to everything caught -- which is what the shared
          // branch below does, and what it did while this was a burst -- would
          // report a skill a fifth of its real strength on a crowd and five
          // times it on one target. The same rainPoints the scene calls, off
          // the run's own rng so a seed still reproduces.
          const strike = (presentationData as { heroFx: { strikeLength: number } }).heroFx.strikeLength
          for (const pt of rainPoints(k, { x: heroState.x, y: heroState.y }, rng,
            caught.map((e) => ({ x: e.x, y: e.y })))) {
            for (const e of caught) {
              if (!e.alive) continue
              if (Math.hypot(e.x - pt.x, e.y - pt.y) > strike) continue
              hurtEnemy(e, k.damage, k.ignoresArmor)
            }
          }
        }
        for (const e of caught) {
          if (k.damage > 0 && k.effect !== 'rain') hurtEnemy(e, k.damage, k.ignoresArmor)
          if (k.stunSeconds > 0) applyStun(e, k.stunSeconds)
          if (k.slowSeconds > 0) applySlow(e, k.slowFactor, k.slowSeconds)
        }
      }
    }
  }

  const applySlow = (e: SimEnemy, factor: number, seconds: number): void => {
    // The simulator has to model this or the soak reports a boss the game does
    // not have. Same flag, same place as Enemy.applySlow.
    if (!e.def.slowable) return
    const d = RULES.combat.slowDiminish
    e.slowStacks = slowStacksAfter(e.sinceSlow, e.slowStacks, d)
    const dealt = diminishedSeconds(seconds, e.slowStacks, d)
    e.slowStacks++
    e.sinceSlow = 0
    if (dealt <= 0) return
    if (factor <= e.slowFactor || e.slowRemaining <= 0) e.slowFactor = factor
    e.slowRemaining = Math.max(e.slowRemaining, dealt)
  }

  const applyStun = (e: SimEnemy, seconds: number): void => {
    // THE SIMULATOR HAS TO MODEL THIS or the soak reports a mini boss the game
    // does not have. Same flag, same place as `Enemy.applyStun`: level 7's
    // Blade Rig is the only false, absent means true.
    if (e.def.stunnable === false) return
    if (seconds <= 0 || !canStun(e.stunRemaining, e.stunLockout)) return
    const d = RULES.combat.stunDiminish
    if (e.sinceStun > d.windowSeconds) e.stunStacks = 0
    const dealt = diminishedSeconds(seconds, e.stunStacks, d)
    e.stunStacks++
    e.sinceStun = 0
    if (dealt <= 0) {
      e.stunLockout = stunLockoutFor(seconds, RULES.combat.stunLockoutMultiple)
      return
    }
    e.stunRemaining = dealt
    e.stunLockout = stunLockoutFor(dealt, RULES.combat.stunLockoutMultiple)
  }

  // --- the loop ----------------------------------------------------------
  let outcome: 'won' | 'lost' | 'stuck' = 'stuck'
  let bannerPoints = 0

  runLoop: for (waveIndex = 0; waveIndex < WAVES.length; waveIndex++) {
    spend()
    // THE BOARD, MEASURED, before the final wave's first enemy walks on. See
    // `FinaleBoard`. Read-only: nothing here touches a tower, an enemy or the
    // rng, so a run measures exactly as it did before this existed.
    if (waveIndex === WAVES.length - 1) finale = measureFinale(waveIndex)
    spawner.begin(WAVES[waveIndex])
    // THE MAP'S OPTIONAL BRANCH AND THIS WAVE'S SHARE OF IT. Both undefined on
    // every level but 9, which is what leaves the pick to the route stream.
    const flankId = MAP.flankId as string | undefined
    const flankShare = (WAVES[waveIndex] as { flankShare?: number }).flankShare
    // The dusk flip's clock is the WAVE's, not the run's. See DayNight.ts.
    night?.beginWave(waveIndex)
    // LEVEL 10'S SCHEDULE, re-armed per wave beside the spawner and the dusk
    // clock, for their reason: it is a per-wave clock that starts when the
    // wave does. `armedAt` counts waves from 1.
    vArm(waveIndex + 1)
    let escaped = 0
    const waveStart = now

    while (true) {
      now += DT
      if (now - waveStart > WAVE_LIMIT_SECONDS) {
        note('stuck-wave', `wave ${waveIndex + 1} still running after ` +
          `${WAVE_LIMIT_SECONDS}s with ${enemies.filter((e) => e.alive).length} alive, ` +
          `${spawner.remaining} unspawned`)
        break runLoop
      }
      if (now > RUN_LIMIT_SECONDS) {
        note('stuck-run', `run exceeded ${RUN_LIMIT_SECONDS}s at wave ${waveIndex + 1}`)
        break runLoop
      }

      // A group walks in from the gate its wave named. Absent means the trunk,
      // which is what every wave written before branching existed means.
      for (const sp of spawner.update(DT)) {
        // THE EXIT THE GROUP NAMED, turned into the one number a walker
        // carries by the same `pickForTerminal` the scene uses -- so the arm an
        // enemy takes is the same arm in both, and a soak of level 8 is a soak
        // of the routing the wave table actually asks for. Without this every
        // group would split by the map's weights and the whole design of the
        // level (heavy down the cheap exit, then the covered one) would be
        // invisible to this file. Undefined leaves the pick to the run's own
        // route stream, which is every wave table before level 8.
        //
        // AND THE SHARE OF THE WAVE THAT TAKES THE FLANK, the same way: the map
        // names the optional branch and the wave says how much of itself goes
        // round it. ONE DRAW FROM `routeRng` EITHER WAY -- the draw is the share
        // roll when there is a share and the pick itself when there is not -- so
        // the route stream advances identically and a level with no `flankShare`
        // soaks byte for byte as it did before this existed.
        const roll = routeRng()
        const pick = sp.exit !== undefined
          ? pickForTerminal(net, sp.lane ?? MAIN_LANE, sp.exit) ?? roll
          : flankId !== undefined && flankShare !== undefined
            ? pickForBranch(net, sp.lane ?? MAIN_LANE, flankId, roll < flankShare) ?? roll
            : roll
        spawn(sp.enemy, 0, null, sp.lane ?? MAIN_LANE, 0, pick)
      }
      tickNight(DT)
      // LEVEL 10'S THREE, and a no-op returning on the first line everywhere
      // else. BEFORE the aura and the walk, like `tickNight`, because a haste
      // that lands this frame belongs in this frame's step.
      tickVlaude(DT)
      // LEVEL 8'S HR AURA, and a no-op returning on the first line everywhere
      // else. Before anything shoots, like the scene's, because it decides how
      // much damage the hits landed this frame take off.
      tickArmorAura()
      tickBoss(DT)
      // LEVEL 7'S BLADE RIG, and a no-op returning on the first line everywhere
      // else. Beside `tickBoss` because it is the same kind of thing -- a boss
      // hurting the player's side on a clock -- and before the towers fire for
      // `tickArmorAura`'s reason.
      tickBlades(DT)
      tickRegens(DT)
      tickSummons(DT)
      tickTowerDisable(DT)
      tickGarrisons(DT)
      cooldowns.tick(DT)

      // Towers.
      //
      // The Beacons first, because what every gun below is worth depends on
      // them: an aura is read at the moment of the shot rather than cached on
      // the tower, so a Beacon switched off between two shots is felt on the
      // second one.
      const sources = auraSources()
      const lift = (t: SimTower): Aura =>
        sources.length === 0 ? NO_AURA : auraAt(t.x, t.y, sources)
      for (const t of towers) {
        if (t.buildLeft > 0) {
          t.buildLeft -= DT
          if (t.buildLeft <= 0) { t.buildLeft = 0; t.tier++ }
          continue
        }
        // SWITCHED OFF by a boss: no shot, and no reload either, so it comes
        // back with a full cooldown. Modelled rather than skipped because the
        // level 3 win rate is measured off this file, and a sim in which the
        // Reaper's ability did nothing would report a fiction.
        if (t.disabledFor > 0) {
          t.disabledFor -= DT
          if (t.disabledFor <= 0) {
            t.disabledFor = 0
            t.cooldown = Math.max(0.05, statOf(t, 'fireInterval')) * acidScale(t)
          }
          continue
        }
        if (statOf(t, 'supportRadius') > 0) continue
        t.cooldown -= DT
        if (t.cooldown > 0) continue
        // Damage, reach and pierce, exactly as `Tower`'s three getters read
        // them: the bonus multiplies the base, the range bonus is a fraction
        // of the tower's own, and the pierce is flat on top.
        const gain = lift(t)
        const range = statOf(t, 'range') * (1 + gain.range)
        const target = pickFirst(enemies.filter((e) => e.alive) as any, t.x, t.y, range) as SimEnemy | null
        if (!target) continue
        // HALF THE FIRE RATE IS TWICE THE INTERVAL. A tower standing in one of
        // Batula's puddles keeps shooting and takes no damage; it just reloads
        // at half speed. 1 everywhere else, on every level.
        t.cooldown = Math.max(0.05, statOf(t, 'fireInterval')) * acidScale(t)
        firedTowers.add(t.id)
        const dmg = boostedDamage(statOf(t, 'damage'), gain.damage)
        const splash = statOf(t, 'splashRadius')
        const pierce = statOf(t, 'armorPierce') + gain.pierce
        const b = specById(t.def, t.spec) ?? {}
        if (splash > 0) {
          for (const e of withinRadius(enemies.filter((x) => x.alive) as any, target.x, target.y, splash)) {
            hurtEnemy(e as SimEnemy, dmg, !!t.def.ignoresArmor || !!(b as any).ignoresArmor, pierce)
          }
        } else {
          hurtEnemy(target, dmg, !!t.def.ignoresArmor || !!(b as any).ignoresArmor, pierce)
        }
        // BLEED IS BY ARCHETYPE, the same list the scene reads: the aimed guns
        // and the thorns cut, the explosives crush. Applied to the primary
        // target only, which is what the scene does -- `hitWith` runs once per
        // shot and splash goes through a different path.
        if (night?.towerBleeds(t.def.archetype)) night.bleedOne(target as never)
        const slowSeconds = statOf(t, 'slowSeconds')
        if (slowSeconds > 0 && t.def.slowFactor > 0) applySlow(target, t.def.slowFactor, slowSeconds)
        if ((b as any).stunSeconds) applyStun(target, (b as any).stunSeconds)
      }

      castAbilities()

      // The hero: blocks up to his capacity, swings at whatever is nearest.
      if (heroState.down) {
        heroState.reviveIn -= DT
        if (heroState.reviveIn <= 0) {
          heroState.down = false
          heroState.health = hero.maxHealth
          heroState.reviveIn = 0
          // Back to base form, to be earned again.
          heroState.powered = false
          heroState.poweredGrace = 0
        }
        // The lads do not stop because Cory did.
        for (const e of enemies) if (e.blockedBy === 'hero') e.blockedBy = null
        assignSoldierBlocks()
      } else {
        if (heroState.invulnerable > 0) heroState.invulnerable -= DT
        if (heroState.poweredGrace > 0) heroState.poweredGrace -= DT
        const blockRange = hero.blockRange * (heroState.powered ? hero.powered.blockRangeMultiplier : 1)
        const near = withinRadius(
          enemies.filter((e) => e.alive && e.def.blockable) as any, heroState.x, heroState.y, blockRange,
        ) as SimEnemy[]
        for (const e of enemies) e.blockedBy = null
        const held = near.sort((a, b) => b.distance - a.distance).slice(0, hero.blockCapacity)
        for (const e of held) e.blockedBy = 'hero'
        heroState.blocking = held.length
        assignSoldierBlocks()

        heroState.attackTimer -= DT
        if (heroState.attackTimer <= 0) {
          const target = pickNearest(
            enemies.filter((e) => e.alive) as any, heroState.x, heroState.y,
            hero.attackRange * (heroState.powered ? hero.powered.attackRangeMultiplier : 1),
          ) as SimEnemy | null
          if (target) {
            heroState.attackTimer = attackInterval(hero.attackInterval, hero.powered, heroState.powered)
            // The hero's basic cuts, which is level5.json's `fromHeroBasic`.
            // It is the load-bearing half of the answer: the hero is what a
            // vampire is usually biting, so a hero who could not make one
            // bleed would be feeding it with no way to stop.
            if (night?.heroBasicBleeds) night.bleedOne(target as never)
            hurtEnemy(target, outgoingDamage(hero.damage, hero.powered, heroState.powered), hero.ignoresArmor)
          }
        }
        // Depreciation.
        for (const e of withinRadius(
          enemies.filter((x) => x.alive) as any, heroState.x, heroState.y, hero.passive.armorShredRadius,
        ) as SimEnemy[]) {
          e.armorShred = Math.min(hero.passive.maxArmorShred,
            e.armorShred + hero.passive.armorShredPerSecond * DT)
        }
      }

      // The cars still coming off a trailer. BEFORE the enemy loop, so one
      // released this frame takes its first step this frame rather than
      // standing still for one -- the order `GameScene.update` uses.
      releasePending(DT)

      // Enemies.
      for (const e of enemies) {
        if (!e.alive) continue
        if (e.slowRemaining > 0) e.slowRemaining -= DT
        if (e.stunRemaining > 0) e.stunRemaining -= DT
        if (e.stunLockout > 0) e.stunLockout -= DT
        e.sinceSlow += DT
        e.sinceStun += DT
        if (e.stunRemaining > 0) continue

        // Held by a soldier: they trade blows on their own intervals, and the
        // enemy does not advance a pixel while it lasts.
        if (e.blockedBy && e.blockedBy !== 'hero') {
          const sd = e.blockedBy
          e.attackTimer -= DT
          if (e.attackTimer <= 0) {
            e.attackTimer = e.def.attackInterval
            const dealt = e.def.damage * (e.def.acidTrail ? (night?.humiliation.damage ?? 1) : 1)
            sd.health -= dealt
            drink(e, dealt)
            // The moment its blocker falls the enemy is free again -- next
            // frame, once the assignment has run.
            if (sd.health <= 0) e.blockedBy = null
          }
          continue
        }

        if (e.blockedBy === 'hero' && !heroState.down) {
          e.attackTimer -= DT
          if (e.attackTimer <= 0) {
            e.attackTimer = e.def.attackInterval
            if (heroState.invulnerable <= 0) {
              const swing = e.def.damage * (e.def.acidTrail ? (night?.humiliation.damage ?? 1) : 1)
              const dmg = damageToHero(
                swing, heroState.powered, heroState.poweredGrace)
              drink(e, dmg)
              const out = applyHit(
                heroState.health, hero.maxHealth, dmg, heroState.powered,
              )
              heroState.health = finite('hero.health', out.health)
              // ONE TRANSFORMATION, at half health, once per life. It was two
              // -- the powered form here and Last Stand at a quarter -- and
              // the soak modelled both because the game had both.
              if (out.triggers) {
                heroState.powered = true
                heroState.poweredGrace = TRANSFORM_INVULNERABLE_SECONDS
                heroState.invulnerable = TRANSFORM_INVULNERABLE_SECONDS
              }
              if (out.down) {
                heroState.down = true
                heroState.powered = false
                heroState.reviveIn = hero.reviveSeconds
              }
            }
          }
          continue
        }

        // THE SKY FIRST, THEN THE SLOW, and `selfHeld` is a full stop -- the
        // same three lines the scene's walk branch runs, in the same order.
        const step = e.selfHeld
          ? 0
          : slowedSpeed(e.def.speed * e.speedScale * e.reviewSpeed * e.hasteSpeed,
                        e.slowFactor, e.slowRemaining > 0) * DT
        // WHERE IT WAS BEFORE THE STEP, for the Performance Review, read only
        // on a level that has one. The gate is a distance test rather than a
        // proximity test for the same reason it is in the scene: at 174 px/s a
        // reviewed Intern crosses a 25 px circle in 144 ms, and this file steps
        // at DT.
        const gateFromLane = GATE ? e.laneId : ''
        const gateFromAt = GATE ? e.laneDistance : 0
        const moved = advance(net, e as Walker, step)
        e.laneId = moved.laneId
        e.laneDistance = moved.laneDistance
        e.distance = moved.distance
        // THE DENOMINATOR, counted beside the numerator so the review count can
        // never again be read without one. `reviewed: 6.5 a run` was true of
        // level 8 for its whole life and said nothing: 6.5 out of 239 enemies
        // is a mechanic that touches one in forty, and 6.5 out of 7 would be a
        // mechanic working perfectly on a level where nothing survives. Only
        // the pair means anything.
        if (GATE && !e.atGate && reviewable(e.def)) {
          const c = GATE.crossings.find((x) => x.lane === e.laneId)
          if (c && e.laneDistance >= c.distance) { e.atGate = true; atGateCount++ }
        }
        if (GATE && !e.reviewed && reviewable(e.def)) {
          // The merge case is asked rather than assumed, exactly as the scene
          // asks it: if the step crossed the junction, where it JOINED the new
          // lane is what the crossing is measured from, and both come from the
          // same pure functions that moved it.
          let from = gateFromAt
          if (e.laneId !== gateFromLane) {
            const took = chooseContinuation(net.continuations(gateFromLane),
                                            pickAt(e.routePick, gateFromLane))
            from = took?.distance ?? 0
          }
          if (crossedGate(GATE, e.laneId, from, e.laneDistance)) {
            e.reviewed = true
            e.reviewSpeed = GATE.speedMultiplier
            reviewedCount++
          }
        }
        const on = net.lane(e.laneId)
        const p = on.path.pointAt(e.laneDistance)
        // The step it just took, before the position is overwritten. Held to a
        // real movement so a stopped enemy keeps facing the way it last went
        // rather than snapping to zero.
        if (Math.abs(p.x - e.x) > 1e-6 || Math.abs(p.y - e.y) > 1e-6) {
          e.heading = Math.atan2(p.y - e.y, p.x - e.x)
        }
        e.x = p.x
        e.y = p.y
        // Only a lane that runs to the exit can leak. A branch ENDS at its
        // join, so without the terminal check an enemy would count as escaped
        // on reaching it -- most of the way through the level.
        if (on.merge === null && e.laneDistance >= on.path.totalLength) {
          e.alive = false
          escaped++
          lives -= e.def.livesCost
          // WHICH EXIT IT GOT OUT OF. One key on every map before level 8.
          leaksByExit[on.id] = (leaksByExit[on.id] ?? 0) + e.def.livesCost
          leaksByEnemy[e.id] = (leaksByEnemy[e.id] ?? 0) + 1
          leaksByEntrance[e.spawnLane] = (leaksByEntrance[e.spawnLane] ?? 0) + e.def.livesCost
          // THE LAST LEAK WINS, overwritten every time. A run ends either by
          // running out of lives or by letting anything out on the final wave,
          // and the most recent escape is the one that did it under both.
          lostToExit = on.id
          // AND WHAT IT WAS, under the same last-wins rule. `lostToExit` names
          // a door and level 9 has one, so on a four-mini-boss level it answers
          // nothing: "which of the four kills the player" is a question about
          // the thing that walked through, not about the thing it walked
          // through. The wave histogram is the other half and it is not a
          // substitute -- a boss that leaks six lives on wave 4 is often
          // finished off by a packet on wave 5, and only this field says so.
          lostToEnemy = e.id
          lostToEntrance = e.spawnLane
          // AND WHETHER IT WAS A CHILD OF A DEATH SPLIT, which on level 7 is
          // the question "did the finale end this run". Same last-wins rule.
          lostToSplit = e.summonedBy !== null
            && (e.summonedBy.def.splitsOnDeath !== undefined)
          // Measurement only: where the difficulty first bites. A run that
          // ends 20/20 and a run that ends 20/20 having nearly lost one on
          // wave 11 are the same number and very different games.
          if (firstLifeLostWave < 0) firstLifeLostWave = waveIndex + 1
        }
      }

      // Clear the dead, counting what the aura had touched on the way out --
      // the array is the only record and it is about to lose them.
      for (let i = enemies.length - 1; i >= 0; i--) {
        if (enemies[i]!.alive) continue
        if (enemies[i]!.everBuffed) auraBuffedCount++
        enemies.splice(i, 1)
      }

      if (lives <= 0) { outcome = 'lost'; break runLoop }
      // Scripted spawns only, as in the scene: a summoner that kept bursting
      // would otherwise hold the wave open for as long as it could summon.
      // Scripted spawns only -- EXCEPT for a split that says otherwise. Level
      // 7's finale is the one: the four cars are summoned children and they
      // ARE the end of the level, so the wave waits for them. `heldWave`
      // mirrors `Enemy.holdsWave` and is false for everything else, which is
      // what keeps the Vampire Lord's Gliders out of wave 11's count.
      if (spawner.done && pendingSplits.length === 0
          && !enemies.some((e) => e.summonedBy === null || e.heldWave)) break
    }

    const last = waveIndex + 1 >= WAVES.length
    const res = waveOutcome(escaped, last)
    if (res.cleared) { peanuts += RULES.peanutsPerWaveCleared; peanutsEarned += RULES.peanutsPerWaveCleared }
    // Later towers unlock as waves are cleared.
    const want = Math.min(reserve.length, Math.floor((waveIndex + 1) / 3))
    unlocked = opening.concat(reserve.slice(0, want))
    if (res.runEnds) { outcome = res.runEnds; break runLoop }
  }

  // Invariants that must hold whatever happened.
  if (!Number.isFinite(peanuts)) note('nan', `peanuts is ${peanuts}`)
  if (peanuts < 0) note('negative', `peanuts ended at ${peanuts}`)
  if (!Number.isFinite(lives)) note('nan', `lives is ${lives}`)
  if (!Number.isFinite(heroState.health)) note('nan', `hero health is ${heroState.health}`)
  if (heroState.health < 0) note('negative', `hero health ended at ${heroState.health}`)
  for (const t of towers) {
    if (t.tier > maxTier(t.def)) note('bad-tier', `${t.id} reached tier ${t.tier} of ${maxTier(t.def)}`)
    if (!Number.isFinite(statAt(t.def, t.tier, 'damage', t.spec))) {
      note('nan', `${t.id} tier ${t.tier} spec ${t.spec} has non-finite damage`)
    }
  }
  if (outcome === 'stuck') note('stuck-run', `run never resolved; ended at wave ${waveIndex + 1}`)
  // Enemies reaching the exit while the board sits idle with money unspent.
  // Only meaningful for a player that is trying: the adversarial modes are
  // deliberately crippled, so "it had money and did not build" is what they
  // are FOR rather than something to report.
  if (mode === 'normal'
      && lives < livesAtStart
      && peanuts >= Math.min(...Object.values(TOWERS).map((t: any) => t.cost))
      && build.spots.some((s) => build.isFree(s.index))) {
    note('idle-money', `lost lives with ${peanuts} unspent and a free pad`)
  }

  const wavesReached = Math.min(waveIndex + (outcome === 'won' ? 1 : 0), WAVES.length)
  bannerPoints = bannerPointsFor(
    { wavesReached, cleared: outcome === 'won', livesRemaining: Math.max(0, lives), maxLives: livesAtStart },
    RULES.banner,
  )

  return {
    seed, hero: heroId, abilities: draftedAbilities, towers: opening,
    outcome, waves: wavesReached, lives, firstLifeLostWave, peanutsEarned, kills,
    seconds: +now.toFixed(1), bannerPoints, findings, firedTowers, firedAbilities,
    leaksByExit, leaksByEnemy, reviewed: reviewedCount, atGate: atGateCount,
    // The ledger is only complete when the run is, so it is stitched on here
    // rather than at the wave start where the rest of the block was measured.
    finale: finale === null ? null : {
      ...finale,
      dealt: Math.round(finaleDealt),
      lowestFraction: +finaleLowest.toFixed(3),
      killed: finaleKills,
    },
    blastOnFriendlies, bladeCuts,
    healedTotal, flameDamage, disableSeconds,
    splitKillToExit, lostToSplit: outcome === 'lost' && lostToSplit,
    auraBuffed: auraBuffedCount,
    lostToExit: outcome === 'lost' ? lostToExit : null,
    lostToEnemy: outcome === 'lost' ? lostToEnemy : null,
    lostToEntrance: outcome === 'lost' ? lostToEntrance : null,
    leaksByEntrance,
  }
}

export const ALL_TOWERS = Object.keys(TOWERS)
export const ALL_ABILITIES = Object.keys(ABILITIES)
export const ALL_HEROES = HERO_IDS

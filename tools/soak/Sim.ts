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
// scratch table, cooldowns, the draft, the lane, the build spots, the Banner
// scoring — all of it is the code the game runs, not a copy. What is stubbed
// is drawing, tweening and input.
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

import { DEFAULT_LEVEL_ID, loadLevel, towerWeightsFor } from '../../src/systems/Levels.ts'
import { DEFAULT_HERO_ID, HERO_IDS, resolveHeroId } from '../../src/systems/Heroes.ts'
import { SLOT1, isAreaSkill } from '../../src/systems/HeroSkills.ts'
import {
  TRANSFORM_INVULNERABLE_SECONDS, damageToHero, shouldTransform,
} from '../../src/systems/Transform.ts'
import { Path } from '../../src/systems/Path.ts'
import { LaneNetwork, MAIN_LANE, advance, type Walker } from '../../src/systems/Lanes.ts'
import { defaultRally, soldierStations } from '../../src/systems/Rally.ts'
import { Disabler } from '../../src/systems/TowerDisable.ts'
import { BuildSystem } from '../../src/systems/BuildSystem.ts'
import { rainPoints } from '../../src/systems/HeroPowers.ts'
import { WaveSpawner } from '../../src/systems/WaveSpawner.ts'
import { Cooldowns } from '../../src/systems/Cooldowns.ts'
import { waveOutcome } from '../../src/systems/Wave.ts'
import { pickFirst, pickNearest, withinRadius } from '../../src/systems/Targeting.ts'
import {
  canStun, damageAfterArmor, diminishedSeconds, slowedSpeed, slowStacksAfter, stunLockoutFor,
} from '../../src/systems/Combat.ts'
import {
  applyHit, attackInterval, incomingDamage, outgoingDamage,
} from '../../src/systems/LastStand.ts'
import {
  atSpecChoice, BASE_TIER, isMaxed, maxTier, nextStep, specById, statAt,
} from '../../src/systems/Upgrades.ts'
import { rollOutcome } from '../../src/systems/Scratch.ts'
import { bannerPointsFor } from '../../src/systems/Banner.ts'
import { openingPurse } from '../../src/systems/Economy.ts'
import { draftAbilities, draftOpeningTowers, reserveTowers } from '../../src/systems/Draft.ts'
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
}

interface SimEnemy {
  id: string
  def: any
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
): SoakResult {
  // The level is a parameter now rather than two module-scope imports, so a
  // soak can be pointed at level 2. Everything below reads these two and does
  // not care which level they came from.
  const level = loadLevel(levelId)
  const MAP = level.map as any
  const WAVES = level.waveTable.waves

  const rng = makeRng(seed)
  const findings: SoakFinding[] = []
  const firedTowers = new Set<string>()
  const firedAbilities = new Set<string>()
  let now = 0
  let waveIndex = 0

  const note = (kind: string, detail: string): void => {
    if (findings.length < 40) findings.push({ kind, detail, wave: waveIndex + 1, atSeconds: +now.toFixed(1) })
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
  // The shared pool plus whatever this level adds. The Ima Dummy Tower is
  // level 1's only, so levels 2 and 3 draw exactly what they were tuned
  // against and the weight is a fact about the level rather than the tower.
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
    const ids = rng.shuffled(towerPool.map((t) => t.id))
    opening = ids.slice(0, DRAFT.towersAtStart)
    reserve = ids.slice(DRAFT.towersAtStart)
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
  const net = new LaneNetwork(MAP)
  const lane = net.main
  const build = new BuildSystem(MAP.buildSpots, MAP.spotRadius)
  const spawner = new WaveSpawner()
  const cooldowns = new Cooldowns()
  for (const id of draftedAbilities) cooldowns.register(id, ABILITIES[id].cooldown)
  cooldowns.register(SLOT1, hero.slot1.cooldown)

  let peanuts = openingPurse(
    RULES.startingPeanuts, RULES.startingPeanutsMargin,
    opening.map((id) => TOWERS[id].cost),
  )
  let peanutsEarned = 0
  let lives = RULES.startingLives
  /** 1-based wave on which the first life was lost, or -1 if none ever was. */
  let firstLifeLostWave = -1
  let kills = 0
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
    lastStand: false,
    lastStandUsed: false,
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

  const spawn = (id: string, at = 0, summonedBy: SimEnemy | null = null,
                 laneId: string = MAIN_LANE, laneAt = at): void => {
    const def = ENEMIES[id]
    if (!def) { note('missing-data', `wave names unknown enemy "${id}"`); return }
    const on = net.lane(laneId)
    const p = on.path.pointAt(laneAt)
    enemies.push({
      id, def, health: def.maxHealth, distance: at,
      laneId: on.id, laneDistance: laneAt, x: p.x, y: p.y, alive: true,
      slowFactor: 0, slowRemaining: 0, slowStacks: 0, sinceSlow: 99,
      stunRemaining: 0, stunLockout: 0, stunStacks: 0, sinceStun: 99,
      armorShred: 0, attackTimer: 0, blockedBy: null,
      summonedBy,
      // The first burst waits a full interval, so a boss does not arrive with
      // a crowd already around it.
      summonTimer: def.summons?.interval ?? 0,
      disabler: def.towerDisable ? new Disabler(def.towerDisable) : null,
    })
  }

  /**
   * Bosses calling in help, modelled the way the scene does it: at the
   * summoner's own distance, capped by how many of ITS children are still
   * alive, and not counted toward the wave being over.
   */
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
        spawn(spec.enemy, parent.distance, parent, parent.laneId, parent.laneDistance)
    }
  }

  const hurtEnemy = (e: SimEnemy, damage: number, ignoresArmor: boolean, pierce = 0): void => {
    if (!e.alive) return
    const armor = Math.max(0, e.def.armor - e.armorShred)
    const dealt = ignoresArmor ? damage : damageAfterArmor(damage, armor, pierce)
    if (!Number.isFinite(dealt)) { note('nan', `damage to ${e.id} is ${dealt}`); return }
    if (dealt < 0) note('negative', `damage to ${e.id} is ${dealt}`)
    e.health -= dealt
    if (e.health <= 0) {
      e.alive = false
      kills++
      peanuts += e.def.peanutReward
      peanutsEarned += e.def.peanutReward
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
  const byReach = [...build.spots].sort(
    (a, b) => (padToLane[a.index] ?? 0) - (padToLane[b.index] ?? 0))

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
        tier: BASE_TIER, spec: null, cooldown: 0, buildLeft: 0,
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
    const k = hero.slot1
    if (mode !== 'noabilities' && cooldowns.ready(SLOT1) && !heroState.down) {
      const area = isAreaSkill(k)
      const target = area ? null : pickNearest(
        enemies.filter((e) => e.alive) as any, heroState.x, heroState.y, k.range,
      ) as SimEnemy | null
      const caught = area
        ? withinRadius(enemies.filter((e) => e.alive) as any,
                       heroState.x, heroState.y, k.radius) as SimEnemy[]
        : []
      if (target || caught.length > 0) {
        cooldowns.start(SLOT1)
        firedAbilities.add(SLOT1)
        if (target) {
          // Every hit it lands, including the ones a real Quick Cut spaces out
          // over a fifth of a second -- close enough at this resolution, and a
          // second hit that is skipped when the first kills is modelled by
          // hurtEnemy ignoring a corpse.
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
          for (const pt of rainPoints(k, { x: heroState.x, y: heroState.y }, rng)) {
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
    spawner.begin(WAVES[waveIndex])
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
      for (const sp of spawner.update(DT)) spawn(sp.enemy, 0, null, sp.lane ?? MAIN_LANE, 0)
      tickSummons(DT)
      tickTowerDisable(DT)
      tickGarrisons(DT)
      cooldowns.tick(DT)

      // Towers.
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
            t.cooldown = Math.max(0.05, statOf(t, 'fireInterval'))
          }
          continue
        }
        if (statOf(t, 'supportRadius') > 0) continue
        t.cooldown -= DT
        if (t.cooldown > 0) continue
        const range = statOf(t, 'range')
        const target = pickFirst(enemies.filter((e) => e.alive) as any, t.x, t.y, range) as SimEnemy | null
        if (!target) continue
        t.cooldown = Math.max(0.05, statOf(t, 'fireInterval'))
        firedTowers.add(t.id)
        const dmg = statOf(t, 'damage')
        const splash = statOf(t, 'splashRadius')
        const pierce = statOf(t, 'armorPierce')
        const b = specById(t.def, t.spec) ?? {}
        if (splash > 0) {
          for (const e of withinRadius(enemies.filter((x) => x.alive) as any, target.x, target.y, splash)) {
            hurtEnemy(e as SimEnemy, dmg, !!t.def.ignoresArmor || !!(b as any).ignoresArmor, pierce)
          }
        } else {
          hurtEnemy(target, dmg, !!t.def.ignoresArmor || !!(b as any).ignoresArmor, pierce)
        }
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
        const blockRange = hero.blockRange * (heroState.lastStand ? hero.lastStand.blockRangeMultiplier : 1)
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
            hero.attackRange * (heroState.lastStand ? hero.lastStand.attackRangeMultiplier : 1),
          ) as SimEnemy | null
          if (target) {
            heroState.attackTimer = attackInterval(hero.attackInterval, hero.lastStand, heroState.lastStand)
            hurtEnemy(target, outgoingDamage(hero.damage, hero.lastStand, heroState.lastStand), hero.ignoresArmor)
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
            sd.health -= e.def.damage
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
              const dmg = damageToHero(
                incomingDamage(e.def.damage, hero.lastStand, heroState.lastStand),
                heroState.powered, heroState.poweredGrace)
              const out = applyHit(
                heroState.health, hero.maxHealth, dmg, hero.lastStand, heroState.lastStandUsed,
              )
              heroState.health = finite('hero.health', out.health)
              // Checked on what is LEFT, as the scene does it.
              if (shouldTransform(heroState.health, hero.maxHealth, heroState.powered)) {
                heroState.powered = true
                heroState.poweredGrace = TRANSFORM_INVULNERABLE_SECONDS
              }
              if (out.triggers) {
                heroState.lastStand = true
                heroState.lastStandUsed = true
                heroState.invulnerable = hero.lastStand.invulnerableSeconds
              }
              if (out.down) {
                heroState.down = true
                heroState.lastStand = false
                heroState.reviveIn = hero.reviveSeconds
              }
            }
          }
          continue
        }

        const step = slowedSpeed(e.def.speed, e.slowFactor, e.slowRemaining > 0) * DT
        const moved = advance(net, e as Walker, step)
        e.laneId = moved.laneId
        e.laneDistance = moved.laneDistance
        e.distance = moved.distance
        const on = net.lane(e.laneId)
        const p = on.path.pointAt(e.laneDistance)
        e.x = p.x
        e.y = p.y
        // Only a lane that runs to the exit can leak. A branch ENDS at its
        // join, so without the terminal check an enemy would count as escaped
        // on reaching it -- most of the way through the level.
        if (on.merge === null && e.laneDistance >= on.path.totalLength) {
          e.alive = false
          escaped++
          lives -= e.def.livesCost
          // Measurement only: where the difficulty first bites. A run that
          // ends 20/20 and a run that ends 20/20 having nearly lost one on
          // wave 11 are the same number and very different games.
          if (firstLifeLostWave < 0) firstLifeLostWave = waveIndex + 1
        }
      }

      // Clear the dead.
      for (let i = enemies.length - 1; i >= 0; i--) if (!enemies[i]!.alive) enemies.splice(i, 1)

      if (lives <= 0) { outcome = 'lost'; break runLoop }
      // Scripted spawns only, as in the scene: a summoner that kept bursting
      // would otherwise hold the wave open for as long as it could summon.
      if (spawner.done && !enemies.some((e) => e.summonedBy === null)) break
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
      && lives < RULES.startingLives
      && peanuts >= Math.min(...Object.values(TOWERS).map((t: any) => t.cost))
      && build.spots.some((s) => build.isFree(s.index))) {
    note('idle-money', `lost lives with ${peanuts} unspent and a free pad`)
  }

  const wavesReached = Math.min(waveIndex + (outcome === 'won' ? 1 : 0), WAVES.length)
  bannerPoints = bannerPointsFor(
    { wavesReached, cleared: outcome === 'won', livesRemaining: Math.max(0, lives), maxLives: RULES.startingLives },
    RULES.banner,
  )

  return {
    seed, hero: heroId, abilities: draftedAbilities, towers: opening,
    outcome, waves: wavesReached, lives, firstLifeLostWave, peanutsEarned, kills,
    seconds: +now.toFixed(1), bannerPoints, findings, firedTowers, firedAbilities,
  }
}

export const ALL_TOWERS = Object.keys(TOWERS)
export const ALL_ABILITIES = Object.keys(ABILITIES)
export const ALL_HEROES = HERO_IDS

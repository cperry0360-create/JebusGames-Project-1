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

import towersData from '../../src/data/towers.json' with { type: 'json' }
import enemiesData from '../../src/data/enemies.json' with { type: 'json' }
import abilitiesData from '../../src/data/abilities.json' with { type: 'json' }
import heroesData from '../../src/data/heroes.json' with { type: 'json' }
import rulesData from '../../src/data/rules.json' with { type: 'json' }
import draftData from '../../src/data/draft.json' with { type: 'json' }

import { DEFAULT_LEVEL_ID, loadLevel } from '../../src/systems/Levels.ts'
import { Path } from '../../src/systems/Path.ts'
import { BuildSystem } from '../../src/systems/BuildSystem.ts'
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
  distance: number
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
  blocked: boolean
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
  const heroId = rng.pick(Object.keys(HEROES))
  const hero = HEROES[heroId]
  const pool = Object.keys(ABILITIES).filter((id) => ABILITIES[id].draftable)
  const abilities = draftAbilities(pool, DRAFT.abilitiesDrawn, rng)
  const towerPool = Object.entries(TOWERS).map(([id, t]: [string, any]) => ({
    id, weight: DRAFT.towerWeights[id], archetype: t.archetype,
  }))
  let opening = draftOpeningTowers(towerPool, DRAFT, rng)
  let reserve = reserveTowers(towerPool, opening, rng)
  // Every third seed ignores the weighted draft and takes a uniform random
  // hand instead. The weights exist to make the FIRST tower a sensible one,
  // and leaving coverage to them means the rarely-drafted towers are barely
  // soaked at all.
  if (seed % 3 === 0) {
    const ids = rng.shuffled(Object.keys(TOWERS))
    opening = ids.slice(0, DRAFT.towersAtStart)
    reserve = ids.slice(DRAFT.towersAtStart)
  }
  const draftedAbilities = seed % 3 === 0
    ? rng.shuffled(pool).slice(0, DRAFT.abilitiesDrawn)
    : abilities

  const lane = new Path(MAP.waypoints)
  const build = new BuildSystem(MAP.buildSpots, MAP.spotRadius)
  const spawner = new WaveSpawner()
  const cooldowns = new Cooldowns()
  for (const id of draftedAbilities) cooldowns.register(id, ABILITIES[id].cooldown)
  cooldowns.register('haymaker', hero.haymaker.cooldown)

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
    x: lane.pointAt(lane.totalLength * 0.5).x,
    y: lane.pointAt(lane.totalLength * 0.5).y,
    health: hero.maxHealth,
    down: false,
    reviveIn: 0,
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

  const spawn = (id: string): void => {
    const def = ENEMIES[id]
    if (!def) { note('missing-data', `wave names unknown enemy "${id}"`); return }
    const p = lane.pointAt(0)
    enemies.push({
      id, def, health: def.maxHealth, distance: 0, x: p.x, y: p.y, alive: true,
      slowFactor: 0, slowRemaining: 0, slowStacks: 0, sinceSlow: 99,
      stunRemaining: 0, stunLockout: 0, stunStacks: 0, sinceStun: 99,
      armorShred: 0, attackTimer: 0, blocked: false,
    })
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
  const padToLane: number[] = build.spots.map((spot) => {
    let best = Infinity
    for (let i = 0; i < MAP.waypoints.length - 1; i++) {
      const [ax, ay] = MAP.waypoints[i]
      const [bx, by] = MAP.waypoints[i + 1]
      const dx = bx - ax, dy = by - ay
      const len2 = dx * dx + dy * dy
      const t = len2 ? Math.max(0, Math.min(1, ((spot.x - ax) * dx + (spot.y - ay) * dy) / len2)) : 0
      best = Math.min(best, Math.hypot(spot.x - (ax + t * dx), spot.y - (ay + t * dy)))
    }
    return best
  })

  // --- the scripted player ----------------------------------------------
  const spend = (): void => {
    if (mode === 'nobuild') return
    for (const spot of build.spots) {
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
      towers.push({
        id, def: TOWERS[id], spot: spot.index, x: spot.x, y: spot.y,
        tier: BASE_TIER, spec: null, cooldown: 0, buildLeft: 0,
      })
    }
    for (const t of towers) {
      if (t.buildLeft > 0 || isMaxed(t.def, t.tier)) continue
      const choice = atSpecChoice(t.def, t.tier)
        ? rng.pick(t.def.specializations)
        : nextStep(t.def, t.tier)
      if (!choice || peanuts < choice.cost) continue
      peanuts -= choice.cost
      t.buildLeft = choice.buildSeconds
      if (atSpecChoice(t.def, t.tier)) t.spec = choice.id
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
    if (mode !== 'noabilities' && cooldowns.ready('haymaker') && !heroState.down) {
      const target = pickNearest(
        enemies.filter((e) => e.alive) as any, heroState.x, heroState.y, hero.haymaker.range,
      ) as SimEnemy | null
      if (target) {
        cooldowns.start('haymaker')
        firedAbilities.add('haymaker')
        hurtEnemy(target, hero.haymaker.damage, hero.haymaker.ignoresArmor)
        target.distance = Math.max(0, target.distance - hero.haymaker.knockbackPixels)
      }
    }
  }

  const applySlow = (e: SimEnemy, factor: number, seconds: number): void => {
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

      for (const id of spawner.update(DT)) spawn(id)
      cooldowns.tick(DT)

      // Towers.
      for (const t of towers) {
        if (t.buildLeft > 0) {
          t.buildLeft -= DT
          if (t.buildLeft <= 0) { t.buildLeft = 0; t.tier++ }
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
        }
      } else {
        if (heroState.invulnerable > 0) heroState.invulnerable -= DT
        const blockRange = hero.blockRange * (heroState.lastStand ? hero.lastStand.blockRangeMultiplier : 1)
        const near = withinRadius(
          enemies.filter((e) => e.alive && e.def.blockable) as any, heroState.x, heroState.y, blockRange,
        ) as SimEnemy[]
        for (const e of enemies) e.blocked = false
        const held = near.sort((a, b) => b.distance - a.distance).slice(0, hero.blockCapacity)
        for (const e of held) e.blocked = true
        heroState.blocking = held.length

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

        if (e.blocked && !heroState.down) {
          e.attackTimer -= DT
          if (e.attackTimer <= 0) {
            e.attackTimer = e.def.attackInterval
            if (heroState.invulnerable <= 0) {
              const dmg = incomingDamage(e.def.damage, hero.lastStand, heroState.lastStand)
              const out = applyHit(
                heroState.health, hero.maxHealth, dmg, hero.lastStand, heroState.lastStandUsed,
              )
              heroState.health = finite('hero.health', out.health)
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

        e.distance += slowedSpeed(e.def.speed, e.slowFactor, e.slowRemaining > 0) * DT
        const p = lane.pointAt(e.distance)
        e.x = p.x
        e.y = p.y
        if (e.distance >= lane.totalLength) {
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
      if (spawner.done && enemies.length === 0) break
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
export const ALL_HEROES = Object.keys(HEROES)

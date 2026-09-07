// Everything level 5 adds, as one object a level either has or has not.
//
// Five new systems arrived with the crossroads -- the day/night flip,
// lifesteal, bleed, Batula's acid puddles and his Humiliation meter -- and
// four already-tuned levels must not feel any of them. So they do not live in
// GameScene or in the simulator: they live here, behind one nullable field.
// `NightRules.from(levelRules(id))` returns null for every level that names no
// rules file, both callers hold `night: NightRules | null`, and null means
// none of it runs. "Levels 1 to 4 are unaffected" is then a property of the
// data rather than a claim about where an `if` was written.
//
// Phaser-free, like the rule modules it composes. This owns the STATE and the
// arithmetic -- which half of the day it is, how much bleed is on what, where
// the puddles are, how humiliated Batula is. The scene turns the answers into
// rectangles and the soak turns them into numbers, and neither has a copy of
// the rule.

import type { EnemyDef } from '../types.ts'
import type { LevelRules } from './Levels.ts'
import {
  DAY_START, advanceFlip, flipDue, flipped, lifestealEnabled, overlay,
  sunDamagePerSecond, vampireSpeedMultiplier,
  type DayNightRules, type DayNightState,
} from './DayNight.ts'
import {
  NO_BLEED, applyBleed, bleedBlocksLifesteal, lifestealHeal, tickBleed, towerBleeds,
  type BleedRules, type BleedState,
} from './Vampirism.ts'
import {
  damageAt, humiliate, humiliationBonus, makePuddle, puddleExpired, tickAcid, tickPuddle,
  towerFireIntervalMultiplier,
  type AcidRules, type AcidState, type HumiliationRules, type Puddle,
} from './AcidPuddle.ts'

/** What hovering costs an enemy, and what it saves it. See level5.json. */
export interface GlidingRules {
  /**
   * THE OPEN QUESTION IN THE BRIEF, and it is one boolean.
   *
   * Cory's second ability is the Spike Strip, a damaging ground hazard laid on
   * the lane, and the Glider is the rank and file for waves 6 to 12. With both
   * of these true one of five heroes has a dead second ability for most of the
   * level. Setting `ignoresGroundHazards` false is the whole of the fix: the
   * strip still cuts, it just cannot slow. The value shipped is the brief's
   * own literal reading and is not a decision made on the designer's behalf.
   */
  ignoresGroundSlow: boolean
  ignoresGroundHazards: boolean
  bobPixels: number
  bobSeconds: number
  shadowAlpha: number
  shadowGapPixels: number
}

export interface LifestealRules {
  cappedAtMaxHealth: boolean
  pipSeconds: number
  pipRisePixels: number
}

/** One enemy id turning into another at the dusk flip. */
export interface Conversion {
  from: string
  to: string
}

/** As much of an enemy as these rules need to look at. */
export interface Vampire {
  def: EnemyDef
  health: number
  maxHealth: number
  bleed: BleedState
}

export class NightRules {
  readonly phases: DayNightRules
  readonly bleed: BleedRules | null
  readonly acid: AcidRules | null
  readonly humiliationRules: HumiliationRules | null
  readonly gliding: GlidingRules | null
  readonly lifesteal: LifestealRules | null
  readonly conversions: Conversion[]

  day: DayNightState = DAY_START
  /**
   * Seconds since this wave's first spawn.
   *
   * The flip's clock, and it is per WAVE rather than per run because that is
   * how the brief states it -- part way through wave 5. See DayNight.ts for
   * why it is seconds and not a fraction of the wave.
   */
  secondsIntoWave = 0
  waveIndex = 0
  flipHappened = false

  readonly puddles: Puddle[] = []
  acidState: AcidState = { sinceDrop: 0, stopLeft: 0 }
  humiliationStacks = 0

  private constructor(r: LevelRules) {
    this.phases = r.phases as DayNightRules
    this.bleed = (r.bleed as BleedRules) ?? null
    this.acid = (r.acid as AcidRules) ?? null
    this.humiliationRules = (r.humiliation as HumiliationRules) ?? null
    this.gliding = (r.gliding as GlidingRules) ?? null
    this.lifesteal = (r.lifesteal as LifestealRules) ?? null
    this.conversions = (r.conversions as Conversion[]) ?? []
  }

  /**
   * These rules for a level, or null for a level that has none.
   *
   * NULL IS THE COMMON CASE and is the whole scoping mechanism. A rules block
   * without `phases` also returns null rather than a half-built object: the
   * day/night state is what every other system here is timed against, and an
   * object that had puddles but no clock would be a worse failure than none.
   */
  static from(rules: LevelRules | null): NightRules | null {
    if (!rules || !rules.phases) return null
    return new NightRules(rules)
  }

  // ------------------------------------------------------------- the clock

  /** Called when a wave starts, so the flip's clock is the wave's own. */
  beginWave(index: number): void {
    this.waveIndex = index
    this.secondsIntoWave = 0
  }

  /**
   * One frame of the day.
   *
   * Returns true on the ONE frame the sun goes down, which is the frame the
   * caller runs the conversions on. Everything after that is the fade.
   */
  tick(dt: number): boolean {
    this.secondsIntoWave += dt
    if (flipDue(this.waveIndex, this.secondsIntoWave, this.flipHappened, this.phases)) {
      this.flipHappened = true
      this.day = flipped()
      return true
    }
    this.day = advanceFlip(this.day, dt, this.phases)
    return false
  }

  get isNight(): boolean {
    return this.day.phase === 'night'
  }

  /** The board overlay's colour and strength this frame. */
  get tint(): { tint: number; alpha: number } {
    return overlay(this.day, this.phases)
  }

  /** What to multiply this enemy's walking speed by. 1 for anything the sun
   *  and the moon do not care about, which is most of the roster. */
  speedFor(def: EnemyDef): number {
    return def.vampiric ? vampireSpeedMultiplier(this.day, this.phases) : 1
  }

  /** Flat damage a second the sun is doing to this enemy right now. */
  sunFor(def: EnemyDef): number {
    return def.vampiric ? sunDamagePerSecond(this.day, this.phases) : 0
  }

  /** What one enemy id becomes at the flip, or null. */
  conversionFor(id: string): string | null {
    return this.conversions.find((c) => c.from === id)?.to ?? null
  }

  // ------------------------------------------------------- bleed and blood

  /** True if a tower of this archetype cuts rather than crushes. */
  towerBleeds(archetype: string): boolean {
    return towerBleeds(archetype, this.bleed)
  }

  get heroBasicBleeds(): boolean {
    return this.bleed?.fromHeroBasic ?? false
  }

  get heroAbilityBleeds(): boolean {
    return this.bleed?.fromHeroAbilities ?? false
  }

  /** One more stack on this enemy, and the clock refreshed. */
  bleedOne(e: Vampire): void {
    e.bleed = applyBleed(e.bleed, this.bleed)
  }

  /** A frame of bleeding, as the damage it costs. Zero on anything clean. */
  bleedTick(e: Vampire, dt: number): number {
    const r = tickBleed(e.bleed, dt, this.bleed)
    e.bleed = r.state
    return r.damage
  }

  /**
   * How much a vampire heals for having dealt `damage` to a player unit.
   *
   * The three things that make it zero are all here rather than at the call
   * sites: no lifesteal on the def, the sun up, or blood already running out
   * of it. A caller that had to remember all three would eventually forget
   * one, and the one it would forget is the bleed.
   */
  healFor(e: Vampire, damage: number): number {
    return lifestealHeal({
      damage,
      fraction: e.def.lifesteal,
      health: e.health,
      maxHealth: e.maxHealth,
      enabled: lifestealEnabled(this.day, this.phases),
      bleeding: bleedBlocksLifesteal(e.bleed, this.bleed),
    })
  }

  /** True while this one's healing is switched off by its own blood loss. */
  isBleeding(e: Vampire): boolean {
    return bleedBlocksLifesteal(e.bleed, this.bleed)
  }

  // -------------------------------------------------------------- puddles

  /**
   * One frame of Batula's own cycle, given whether he actually moved.
   *
   * Returns whether he is held this frame and whether a puddle went down at
   * (x, y). The caller owns the sprite and the shout; this owns the clock.
   */
  tickBoss(dt: number, moving: boolean, x: number, y: number): { held: boolean; dropped: boolean } {
    if (!this.acid) return { held: false, dropped: false }
    const r = tickAcid(this.acidState, dt, moving, this.acid)
    this.acidState = r.state
    if (r.drop) {
      this.puddles.push(makePuddle(x, y, this.acid))
      if (this.humiliationRules) {
        this.humiliationStacks = humiliate(this.humiliationStacks, 1, this.humiliationRules)
      }
    }
    return { held: r.held, dropped: r.drop }
  }

  /** Stacks granted outright, by the roar at half health. */
  addHumiliation(by: number): void {
    if (!this.humiliationRules) return
    this.humiliationStacks = humiliate(this.humiliationStacks, by, this.humiliationRules)
  }

  /** What the meter is worth: speed and damage multipliers, both 1 at zero. */
  get humiliation(): { speed: number; damage: number } {
    if (!this.humiliationRules) return { speed: 1, damage: 1 }
    return humiliationBonus(this.humiliationStacks, this.humiliationRules)
  }

  /**
   * Ages every puddle one frame and hands back the ones that expired, so the
   * caller can take their art off the board.
   */
  tickPuddles(dt: number): { ticks: number; expired: Puddle[] } {
    if (!this.acid) return { ticks: 0, expired: [] }
    let ticks = 0
    const expired: Puddle[] = []
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const p = this.puddles[i]!
      ticks = Math.max(ticks, tickPuddle(p, dt, this.acid))
      if (puddleExpired(p)) {
        expired.push(p)
        this.puddles.splice(i, 1)
      }
    }
    return { ticks, expired }
  }

  /** Damage per tick to a PLAYER ground unit standing at (x, y). */
  acidAt(x: number, y: number): number {
    return this.acid ? damageAt(this.puddles, x, y, this.acid) : 0
  }

  /** What a tower standing at (x, y) has its fire INTERVAL multiplied by. */
  towerSlowAt(x: number, y: number): number {
    return this.acid ? towerFireIntervalMultiplier(this.puddles, x, y, this.acid) : 1
  }

  /** Everything off the board: a run ending must not leave a puddle behind. */
  clear(): void {
    this.puddles.length = 0
    this.acidState = { sinceDrop: 0, stopLeft: 0 }
    this.humiliationStacks = 0
    this.day = DAY_START
    this.flipHappened = false
    this.secondsIntoWave = 0
  }
}

export { NO_BLEED }

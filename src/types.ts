// Shapes of the JSON under /src/data. Every tuneable number in the game is
// described here and lives there, never in a .ts file.

import type { SignBoard } from './systems/SignPlacement.ts'

export type { SignBoard }

export interface DisplayDef {
  width: number
  height: number
  /** The strip the corner counters occupy. No build pad may sit under it, or a
   *  tower would be drawn behind the HUD. The map tracer and the layout tests
   *  both hold to this; runtime code has no reason to read it. */
  hudHeight: number
  backgroundColor: string
  /** How the camera sits over the map. Zooms are multiples of cover zoom —
   *  the zoom at which the map fills the viewport with no dead margin — so
   *  they hold on any phone shape. */
  camera: { defaultZoom: number; maxZoom: number; tapSlopPx: number }
}

/**
 * One lane of a map: a route enemies walk.
 *
 * A map with no `lanes` has exactly one, built from its own `waypoints` and
 * called "main" — which is every map that exists today, and why levels 1 and 2
 * needed no edits when branching arrived.
 *
 * A branch's waypoints END at the join. `merge` names the lane it joins and
 * the waypoint INDEX on THAT lane to carry on from, so the join is stated in
 * the target's terms: moving the branch cannot silently detach it, and moving
 * the target's waypoints moves the join with them.
 */
export interface LaneDef {
  /** Unique within the map. "main" is taken by the map's own waypoints. */
  id: string
  waypoints: number[][]
  /** Where this lane joins another. Absent means it runs to the exit itself,
   *  which exactly one lane per map may do. */
  merge?: {
    into: string
    atIndex: number
  }
}

export interface MapDef {
  /** Key into art.json's map section. */
  plate: string
  /** The painted road's width in canvas pixels, measured by tools/trace_map.py.
   *  Tower bases are sized against it. */
  roadWidth: number
  note: string
  /** Click tolerance and highlight size for a build spot, in canvas pixels. */
  spotRadius: number
  /**
   * Both are canvas pixels, traced from the painted plate. The plate is 16:9
   * and fills the canvas, so canvas pixels are the map's own coordinate space.
   * The first and last waypoints sit off-screen, so enemies walk in through
   * the arch and out through the gate.
   */
  waypoints: number[][]
  /**
   * EXTRA lanes beyond the one `waypoints` describes, for maps with more than
   * one spawn gate. Absent on a single-lane map, which is the shape levels 1
   * and 2 use and the reason they were not touched when this arrived.
   *
   * The trunk is NOT repeated here — it is `waypoints`, resolved as the lane
   * "main" — so there is one place a route's geometry lives and no way for two
   * copies of it to drift. See systems/Lanes.ts.
   */
  lanes?: LaneDef[]
  buildSpots: number[][]
  /** The blank painted boards, and the rectangle a lettering overlay is drawn
   *  in on each. See systems/SignPlacement.
   *
   *  OPTIONAL, like the four fields below it. Level 1 is a village with an
   *  arch, a gate, two signboards and gaps in its tree line; level 2 is a
   *  corridor whose lane runs off both edges of the plate and has none of
   *  them. A level declares the scenery it has, and GameScene builds only
   *  what is declared — see `buildSign`, `createArchOccluders` and the
   *  gateway defaults in `create`. */
  signs?: {
    /** The board hanging from the tavern beam. Never changes. */
    tavern: SignBoard
    /** The board the innkeeper holds. The bribe swaps its texture. */
    held: SignBoard
  }
  /** The stone archway enemies walk out of, measured off the painted plate.
   *  Optional: without one, enemies are at full opacity from their first
   *  frame because there is nothing for them to walk out from behind. */
  entrance?: {
    /** Map x at the arch's mouth: where the fade starts. */
    emergeFromX: number
    /** Map x past which nothing of the arch is in front any more. */
    clearOfArchX: number
    fadeMs: number
    startScale: number
    /**
     * The arch's depth split.
     *
     * Only the NEAR pier is listed, and only as an outline. The far pier and
     * the span stand above the road's far edge, so they are behind everything
     * on it and the map plate already draws them there — see
     * `createArchOccluders` for the rectangle that used to cut the far pier in
     * half down its length.
     */
    arch: {
      near: {
        /** The painted stone's silhouette, in world units, used as a clip
         *  path. A box around it would contain road, and this piece is drawn
         *  in FRONT of units. */
        outline: number[][]
        /** The pier's painted base: what a y-sort would give it. */
        depth: number
      }
    }
  }
  /** The open gate enemies walk out through. `gateX` is the near edge of the
   *  dark gap between its two leaves, where the fade starts, and `vanishX` the
   *  far edge, where there is nothing left. Optional: without one, an enemy
   *  walks the lane to its end at full opacity and leaks there. */
  exit?: { gateX: number; vanishX: number }
}

export interface ServerNukeDef {
  abilityId: string
  /** Chance per qualifying kill, 0-1. */
  dropChance: number
  /** Enemy tiers that can drop it at all. */
  dropFromTiers: string[]
  /** A boss loses this share of its max health instead of dying. */
  bossHealthPercent: number
  /** Wind-up before it fires, in seconds. */
  castSeconds: number
}

/** The sign-bribe easter egg. It buys nothing but the sign. */
export interface SignBribeDef {
  cost: number
  /** The confirm dialog. Nothing spends peanuts without asking first. */
  confirmTitle: string
  confirmBody: string
  confirmLabel: string
  /** Shown when the player cannot afford him. */
  brokeToast: string
  /** Shown on payment, and on any later tap. */
  paidToast: string
}

export interface RulesDef {
  startingPeanuts: number
  /** Multiplied by the cheapest drawn tower to floor the opening purse. */
  startingPeanutsMargin: number
  startingLives: number
  peanutsPerWaveCleared: number
  pacing: {
    gameSpeed: number
    readySeconds: number
    firstReadySeconds: number
    earlyStartPeanutsPerSecond: number
  }
  combat: {
    /**
     * How long a stun locks a target out of being stunned again, as a
     * multiple of the stun's own duration — 2.5 means a 0.6s stop is followed
     * by 0.9s that cannot be stunned.
     *
     * Without it a stun whose tower fires faster than the stun lasts is not a
     * stun at all, it is a permanent stop: the Filing Extension's Amendment
     * held everything it touched still for the rest of the wave.
     */
    stunLockoutMultiple: number
    /** Each successive stop on the same target inside the window is shorter
     *  than the last, so one tower cannot hold one enemy forever. */
    stunDiminish: { windowSeconds: number; factor: number; minSeconds: number }
    /** The same rule for slows, which had no limit at all. */
    slowDiminish: { windowSeconds: number; factor: number; minSeconds: number }
  }
  serverNuke: ServerNukeDef
  signBribe: SignBribeDef
  towerUpgrades: TowerUpgradeDef
  banner: BannerDef
}

/**
 * What a run pays into the Banner.
 *
 * The tree these points buy is Phase 2; the payout is not, because a run that
 * ends with nothing banked is a run the player has no reason to repeat.
 */
export interface BannerDef {
  /** Depth is the main term: it pays whether or not the run was won. */
  perWaveCleared: number
  clearBonus: number
  perLifeRemaining: number
  /** Above this fraction of starting lives, a win reads as clean rather than
   *  narrow. */
  cleanLivesFraction: number
  verdicts: {
    flawless: string
    clean: string
    narrow: string
    lost: string
  }
}

export interface TowerDef {
  name: string
  /**
   * The movement layers this tower can shoot. Absent means ground only, which
   * is the safe default: a tower that forgets to declare itself cannot
   * silently gain the ability to hit air.
   */
  targets?: string[]
  /**
   * The one phrase the ledger card shows, at most `LIMITS.trait` characters
   * and never wrapping.
   *
   * Derived from what the tower's DATA does — a splash radius, a slow factor,
   * an armour rule — rather than written as flavour. `reports/` carries the
   * derivation for all eighteen. A tower with no special mechanic gets a
   * phrase naming its role.
   */
  trait: string
  archetype: string
  /** One line on what it does, for the LOADOUT screen. The ledger card shows
   *  no prose at all: three numbers and the trait phrase answer "should I buy
   *  this?" faster than a sentence, and a paragraph was what made the panel's
   *  height unpredictable. */
  blurb: string
  sprite: string
  /** The projectile. Absent on a support tower, which never fires: the Tax
   *  Shelter named one for years and no player ever saw it. */
  shot?: string
  cost: number
  range: number
  damage: number
  fireInterval: number
  projectileSpeed: number
  /** 0 means single target. */
  splashRadius: number
  ignoresArmor: boolean
  /** Flat armour this tower gets through. Single-target towers pierce; AOE
   *  towers do not, which is what keeps armoured units threatening to a
   *  player who brought only AOE. */
  armorPierce: number
  /**
   * The Ima Dummy Tower's soldiers. Absent on every tower that shoots.
   *
   * ORDINARY STATS, not a nested block, so the tier multipliers in `tiers`
   * carry them exactly the way they carry `damage` everywhere else -- a
   * soldier gets tougher because its tier says x1.89, not because a second
   * mechanism was written for it.
   */
  soldierCount?: number
  soldierHealth?: number
  soldierDamage?: number
  soldierInterval?: number
  /** Seconds a dead soldier takes to come back, mid-wave. */
  soldierRespawn?: number
  /** How far a soldier reaches to hold an enemy up. */
  soldierBlockRange?: number
  /** 0 means no slow. 0.45 means targets move at 45% speed. */
  slowFactor: number
  slowSeconds: number
  /** Non-zero marks a support tower: it never fires, it buffs towers in radius. */
  supportRadius: number
  supportDamageBonus: number
  /** The linear part of the upgrade path: tier 2. */
  tiers: TowerTier[]
  /** Tier 3 is a choice, not a step. Two mutually exclusive specializations;
   *  picking one closes the other off for the life of the tower. */
  specializations: TowerSpec[]
}

/** One of a tower's two tier-3 specializations. */
export interface TowerSpec extends TowerTier {
  id: string
  name: string
  /** The branch's own trait phrase; see `TowerDef.trait`. */
  trait: string
  /**
   * What this specialization *does*, as distinct from what it multiplies.
   * A tier-3 choice that only scaled numbers was not a choice, so each of
   * these changes how the tower behaves. All optional; a spec carries one.
   */
  /** Shots ignore armour entirely, not merely pierce some of it. */
  ignoresArmor?: boolean
  /** Extra enemies each shot also hits, at `chainFalloff` of the damage. */
  chainTargets?: number
  chainFalloff?: number
  /** Anything below this fraction of its maximum health dies on hit. */
  executeBelowPercent?: number
  /** Damage grows by this much per consecutive shot at the same target, up to
   *  `rampMax` extra. Resets when the tower changes target. */
  rampPerShot?: number
  rampMax?: number
  /** Splash also slows for this long. */
  splashSlowSeconds?: number
  /**
   * RAGE, the Ima Dummy Tower's first tier-4 branch. A soldier that drops
   * below `rageBelowHealth` of its maximum keeps `rageDamage` and
   * `rageInterval` for the rest of that life, and loses them the moment it
   * respawns at full health.
   */
  rageBelowHealth?: number
  rageDamage?: number
  rageInterval?: number
  /** Damage multiplier against anything with armour left. */
  bonusVsArmored?: number
  /** Freezes the target outright for this long. */
  stunSeconds?: number
  /** Support only: neighbours also gain this fraction of extra range. */
  supportRangeBonus?: number
  /** Support only: neighbours also gain this much armour pierce. */
  grantsPierce?: number
}

/**
 * One step up the upgrade path. Every stat here is a *multiplier* on the
 * tower's base value, so retuning a base number carries through the whole path
 * rather than diverging from it at tier 2. A stat the step does not mention is
 * left alone.
 */
export interface TowerTier {
  cost: number
  /** How long the tier takes to raise. Tier 1 is instant; these are not. */
  buildSeconds: number
  damage?: number
  range?: number
  fireInterval?: number
  splashRadius?: number
  slowSeconds?: number
  armorPierce?: number
  supportRadius?: number
  supportDamageBonus?: number
  /** The Ima Dummy Tower's soldiers, multiplied like every other stat. */
  soldierCount?: number
  soldierHealth?: number
  soldierDamage?: number
  soldierInterval?: number
}

export interface TowerUpgradeDef {
  /** Share of everything sunk in that selling returns. Below 1, or selling is
   *  free money. */
  sellRefund: number
  /** Fire rate while a tier is going up, as a share of normal. */
  buildFireRate: number
}

export interface TaxPhase {
  /** Applies while the boss is above this share of its maximum health. */
  aboveHealth: number
  /** Share of the player's *current* peanuts taken each time. */
  percent: number
  intervalSeconds: number
}

export interface TaxDef {
  /** Ordered from healthiest to weakest; the first match applies. */
  phases: TaxPhase[]
  /** So a broke player still feels it. */
  minimumTake: number
}

/** An enemy's summoning behaviour. See EnemyDef.summons. */
export interface SummonsDef {
  /** The enemy id to call in. */
  enemy: string
  /** How many arrive per burst. */
  count: number
  /** Seconds between bursts. */
  interval: number
  /** How many of this summoner's children may be alive at once. Absent means
   *  no limit, which is a thing to think twice about: an uncapped summoner on
   *  a long wave is an unbounded number of bodies on the field. */
  cap?: number
}

/** A boss ability that switches a tower off for a while. */
export interface DisableDef {
  /** Seconds between casts, measured from the moment one lands. */
  cooldown: number
  /** Seconds the telegraph runs before the disable lands. */
  windup: number
  /** Seconds the tower stays off. */
  duration: number
  /** How far the caster reaches, in world pixels. */
  range: number
}

export interface EnemyDef {
  name: string
  flavor: string
  role: string
  /** What kind of thing this is, for rules that key off importance rather
   *  than behaviour. Only elites and bosses can drop a Server Nuke. */
  tier: string
  /** False for a boss that walks through the line rather than being held by
   *  it. Holding one would let a player park it and ignore the fight. */
  blockable: boolean
  /** Present only on The Politician: he takes a share of the player's
   *  peanuts instead of attacking anything. */
  tax?: TaxDef
  sprite: string
  maxHealth: number
  /** Flat damage subtracted per hit, unless the attacker ignores armour. */
  armor: number
  speed: number
  /**
   * What this thing moves through: "ground" or "air". Absent means ground,
   * which is what every enemy written before this existed means — so no enemy
   * needed editing and levels 1 to 3 play identically.
   *
   * The layer changes NOTHING about movement. An air enemy walks the same lane
   * waypoints at the same speed; the layer only decides what is allowed to
   * shoot at it.
   */
  layer?: string
  /**
   * The tower-disable this enemy casts while it walks, if it casts one.
   *
   * Data, so a second boss with the same trick needs no new code -- the same
   * reasoning as `summons`. The rule itself lives in systems/TowerDisable.ts
   * and is Phaser-free; this is only the block that turns it on.
   */
  towerDisable?: DisableDef

  /**
   * What this enemy calls in while it walks, if anything.
   *
   * Reusable across bosses rather than written into one of them: the block is
   * data, and any enemy that carries it summons. Children appear at the
   * summoner's own place on its own lane and carry on from there.
   */
  summons?: SummonsDef
  peanutReward: number
  livesCost: number
  damage: number
  attackInterval: number
}

export interface LastStandDef {
  name: string
  healthThreshold: number
  damageMultiplier: number
  attackIntervalMultiplier: number
  damageTakenMultiplier: number
  hitsAllInRange: boolean
  /** In the vehicle: reach, block radius and speed all grow, and contact with
   *  the vehicle hurts and shoves. */
  attackRangeMultiplier: number
  blockRangeMultiplier: number
  moveSpeedMultiplier: number
  rammingDamage: number
  rammingKnockbackPixels: number
  transformShakeMs: number
  transformFlashMs: number
  transformPauseMs: number
  /** He cannot be hurt while the transformation plays. Without it the
   *  transform is a cinematic he can be killed during. */
  invulnerableSeconds: number
}

export interface PassiveDef {
  name: string
  armorShredRadius: number
  armorShredPerSecond: number
  maxArmorShred: number
}

/**
 * What a hero's slot-1 active does.
 *
 * ONE BLOCK OF FIELDS FOR ALL FIVE, with `effect` choosing which of them are
 * read. Every skill declares every field, zeros included, so `damage: 0` on
 * Bark is a statement rather than an omission and a new hero is data rather
 * than a new shape. The alternative -- a discriminated union per effect --
 * would move the same decision into the type system and cost a code change
 * every time a hero is added.
 */
export type HeroSkillEffect = 'punch' | 'burst' | 'burn' | 'double' | 'howl'

export interface HeroSkillDef {
  name: string
  icon: string
  effect: HeroSkillEffect
  cooldown: number
  /** Reach, for a skill that picks a target. 0 for one centred on the hero. */
  range: number
  /** Blast radius, for a skill centred on the hero. 0 for a targeted one. */
  radius: number
  damage: number
  ignoresArmor: boolean
  knockbackPixels: number
  stunSeconds: number
  /** Multiplier on enemy speed. 1 is no slow. */
  slowFactor: number
  slowSeconds: number
  burnPerSecond: number
  burnSeconds: number
  /** How many times it lands. 1 for everything but Quick Cut. */
  hits: number
  /** Seconds between those hits. */
  gapSeconds: number
  sound: string
  /** A voice line on the hit, or null for a hero who has none recorded. */
  voice: string | null
}

/**
 * The hero power in slot 2: reserved, gated on the powered form, and NOT YET
 * IMPLEMENTED. `effect` is null, which is what says so -- the button is wired
 * and drawn, and pressing it while powered does nothing but report that.
 */
/**
 * What a hero power does. All five are placed by tapping the button and then
 * tapping the map; only `hazard` leaves anything behind.
 */
export type HeroPowerEffect = 'hazard' | 'burst' | 'bomb' | 'rain' | 'dash'

/**
 * SLOT 2: the hero power, one per hero, usable only in the powered form.
 *
 * The same shape for all five, like `HeroSkillDef`, with zeros where a power
 * does not use a field — so a reader can see what Seismic does NOT do, and a
 * new power cannot half-declare itself and read `undefined` as 0 somewhere
 * downstream. `effect: null` is still legal and still means reserved.
 */
export interface HeroPowerDef {
  name: string
  icon: string
  effect: HeroPowerEffect | null
  /** Seconds. The same for all five, and reset by the transformation. */
  cooldown: number
  /** Whether it needs a point on the map. All five do today; the field is here
   *  so an instant power does not have to be a special case in the scene. */
  targeted: boolean
  /** How far from the hero the point may be. The targeting overlay draws it. */
  castRadius: number
  /** The effect's own radius: the blast, the scatter, or the dash corridor's
   *  half-width. */
  radius: number
  damage: number
  ignoresArmor: boolean
  /** `rain` only: how many small strikes. 1 elsewhere, 0 where damage is per
   *  tick rather than per hit. */
  hits: number
  /** Seconds between those strikes. */
  gapSeconds: number
  /** `hazard`: how long the strip lives. `dash`: how long the run takes. */
  durationSeconds: number
  /** `hazard` only: how often it charges what is standing in it. */
  tickSeconds: number
  /** Multiplier on enemy speed. 1 is no slow. */
  slowFactor: number
  slowSeconds: number
  knockbackPixels: number
  stunSeconds: number
  sound: string
}


export interface HeroDef {
  name: string
  title: string
  blurb: string
  bodySprite: string
  /** The Last Stand form. Cory does not get angrier; he gets into an SUV. */
  ultimateSprite: string
  /**
   * The form worn once health has been at or below half, or null for a hero
   * with no powered art. Cory is the null: `ultimateSprite` is already his DAD
   * MODE look, and spending it here would leave Last Stand nothing to show.
   */
  poweredSprite?: string | null
  portraitSprite: string
  /**
   * Which way this hero's art is drawn, before any mirroring.
   *
   * Cory faces LEFT — every frame, and the SUV. The four heroes added after
   * him face right. It was a blanket rule in the renderer and it made all four
   * of them walk backwards; it is a property of the art, so it lives here.
   */
  artFacing: 'left' | 'right'
  /** The hero's own tint. Every placeholder effect either of the two hero
   *  buttons draws is drawn in it, so a power reads as belonging to whoever
   *  cast it before any of the art exists. See systems/HeroFx.ts. */
  colour: number
  /** The sprites the summoned gnomes wear, one per gnome, cycled. Two entries
   *  because the ability summons two: a pair drawn from one sprite reads as
   *  the same gnome printed twice. */
  fighterSprites: string[]
  maxHealth: number
  /** How long he is off the board after going down, before he walks back on
   *  at full health. Long enough that losing him still costs a wave. */
  reviveSeconds: number
  moveSpeed: number
  attackRange: number
  /** Enemies this close stop walking and fight. */
  blockRange: number
  /** How many enemies the hero can hold at once. */
  blockCapacity: number
  damage: number
  attackInterval: number
  /**
   * What it costs to break off a fight.
   *
   * A new rally point always overrides combat — a hero who ignores the order
   * until everything near him is dead makes the rally point look broken. So
   * the order is obeyed instantly and paid for instead: he takes more damage
   * for `vulnerableSeconds` while he pulls out, and cannot swing for
   * `readySeconds` after he arrives.
   */
  retreat: {
    vulnerableSeconds: number
    damageTakenMultiplier: number
    readySeconds: number
  }
  ignoresArmor: boolean
  passive: PassiveDef
  /** Always available. */
  slot1: HeroSkillDef
  /** Powered form only, and not yet implemented. */
  slot2: HeroPowerDef
  lastStand: LastStandDef
}

export interface BrandingDef {
  /** How much dark wash sits over the painted title illustration, so the type
   *  on top of it stays readable. */
  titleBackdropDim: number
  /** Width of the settling column behind the title's text, which keeps the
   *  illustration's towers at the edges undimmed. */
  titleColumnWidth: number
  splash: {
    backgroundColor: string
    cardHeight: number
    fadeInMs: number
    holdMs: number
    fadeOutMs: number
    /** Ignore skip input for a moment, so a stray click cannot eat the splash. */
    skipGuardMs: number
  }
}

/** One sound the game can play. */
export interface AudioCue {
  /** Filename under the audio root, without its extension. */
  file: string
  /** Where this cue sits in the mix, against the others. Fixed; the player's
   *  master volume multiplies it. */
  gain: number
  /** How many copies may sound at once. A big wave fires far more shots than
   *  this, and stacked copies of one sample are mud, not volume. */
  maxVoices: number
  format: string
  /** Which bus this cue rides, if any. A voice line needs balancing against
   *  the effects as a group rather than one gain at a time. */
  bus?: string
  /** How long this cue actually sounds. Only needed when it runs longer than
   *  the default voice hold, which is every cue that is not a one-shot. */
  durationMs?: number
  /** Silence at the head of the recording, in ms, measured off the file. A
   *  caller that needs the first WORD to land on a moment starts the cue this
   *  much earlier. */
  leadInMs?: number
}

export interface AudioDef {
  note: string
  credit: string
  /** Path prefix under the site root. */
  root: string
  /** Per-bus multipliers, applied on top of a cue's own gain. */
  buses?: Record<string, number>
  /** What every other cue is multiplied by while a voice line is sounding. */
  voiceDuck?: number
  cues: Record<string, AudioCue>
}

export interface CreditEntry {
  role: string
  name: string
}

export interface CreditSection {
  title: string
  entries: CreditEntry[]
}

export interface CreditsDef {
  heading: string
  subheading: string
  sections: CreditSection[]
  /** The closing joke, under the credits proper. */
  notes: string[]
  footer: string
}

export interface AbilityDef {
  name: string
  /** False for the rare drop, which is never in the run-start pool. */
  draftable: boolean
  icon: string
  /** 'ground' asks the player for a spot; 'instant' fires immediately. */
  targeting: string
  cooldown: number
  radius: number
  damage: number
  ignoresArmor: boolean
  duration: number
  /** Repeated impacts (Meteor Barrage) or jumps (Chain Lightning). */
  ticks: number
  slowFactor: number
  /** Scratch Ticket only: the payout is rolled from this range. */
  /** The Scratch Ticket's payout table. Weighted, with losing lines: see
   *  systems/Scratch.ts. Absent on every other ability. */
  outcomes?: Array<{ label: string; payout: number; weight: number }>
  /** For an ability whose effect is not in its numbers. */
  blurb?: string
  /** How long the ticket waits before scratching itself, in seconds. */
  autoRevealSeconds: number
  summonCount: number
  /** Summons only: how far from the lane this may be dropped. Absent means
   *  anywhere. Gnomes exist to block, so a gnome off the path does nothing. */
  pathOnlyWithin?: number
  /**
   * Meteor only. `radius` is the ring the player is shown; these three are
   * what a barrage actually does inside it.
   *
   * `impactSpread` is how far one meteor may stray from the tap. It used to be
   * the whole radius, which meant a targeted ability could put every impact
   * 150px from where it was aimed and hit nothing.
   */
  impactSpread?: number
  /** The damage radius of a single impact. */
  impactRadius?: number
  /** How long the shadow is on the ground before the meteor arrives. The
   *  warning is the point: it is what lets a player read where it will land. */
  telegraphSeconds?: number
}

export interface DraftDef {
  towersAtStart: number
  /** How many tower types the build menu ever offers, not a placement cap. */
  unlockedTypeCap: number
  unlockAfterWave: number[]
  abilitiesDrawn: number
  damageArchetypes: string[]
  answerArchetypes: string[]
  towerWeights: Record<string, number>
  /** Whole-hand redeals allowed on the loadout screen, before the run starts. */
  rerollsPerRun: number
}

export interface WaveSpawnDef {
  enemy: string
  count: number
  interval: number
  /** Seconds after the wave starts before this group begins spawning. */
  delay: number
  /** Which lane this group walks in from. Absent means the map's main lane,
   *  which is what every wave written before branching existed means — so no
   *  wave table needed editing. */
  lane?: string
}

export interface WaveDef {
  name: string
  /** The enemy id of this wave's boss, if it has one. Drives the name card
   *  and the health bar across the top. */
  boss?: string
  spawns: WaveSpawnDef[]
}

export interface WavesDef {
  waves: WaveDef[]
}

/** Where a sprite sits and how big it draws. Absent fields take defaults. */
export interface SpriteRender {
  anchorX: number
  anchorY: number
  /** Counter plates only: where the empty number field sits, as fractions of
   *  the plate, so the HUD can place its text at any size. Optional, because
   *  every other sprite in the game has no number field at all. */
  fieldLeft?: number
  fieldRight?: number
  fieldCentreY?: number
  /** On-screen height in pixels; the aspect ratio is preserved. */
  displayHeight?: number
  /** Width of the ground shadow under this sprite. */
  shadowWidth?: number
  /** Ground plates only: where the middle of the painted GROUND sits inside
   *  the canvas, as a fraction of its height. A build pad is not a thing
   *  standing on the ground, it is a patch of ground, so what has to land on
   *  the spot is the middle of the dirt and not the bottom of the canvas.
   *  `anchorY` must equal this, and a test says so. */
  groundY?: number
  /** The artwork's real extents inside its canvas, for art with padding.
   *  Sizing by these means a logo drawn at a requested height really is that
   *  tall on screen, rather than that tall including its transparent margin. */
  contentWidth?: number
  contentHeight?: number
  /**
   * Effect animations only: this file is a strip of equal cells rather than
   * one picture, so the loader has to cut it up before anything can draw it.
   * Every frame is centred in its cell and the relative sizes across the
   * sequence are part of the art, which is why an effect is played at one
   * fixed display size and the frames do the growing.
   */
  sheet?: { frameWidth: number; frameHeight: number; frames: number }
  /** Button plates only: the end-cap sizes in source pixels. A plate is drawn
   *  by slicing at these, so the metal caps keep their proportions at any
   *  width and only the plain middle stretches. */
  slice?: { left: number; right: number; top: number; bottom: number }
}

/**
 * The one manifest every sprite comes from. `files` maps a logical key to a
 * path under `assetRoot`; `render` gives a key its anchor and size; everything
 * below maps a *role* the code asks for to a logical key. Swapping art never
 * touches a .ts file.
 */
export interface ArtDef {
  /** The world map screen: one tiling background, one card per level id. */
  worldMap: {
    background: string
    cards: Record<string, string>
  }
  assetRoot: string
  credit: string
  note: string
  files: Record<string, string>
  render: Record<string, Partial<SpriteRender>>
  /** Painted level plates, one per level. */
  map: Record<string, string>
  ui: {
    /** null once towers ship as one sprite carrying their own base. */
    /** The painted title illustration. null falls back to a flat panel. */
    titleBackdrop: string | null
    /** Named action and stat icons, read through `icon()` so a missing file
     *  resolves to the visible stand-in rather than an empty key. */
    icons: Record<string, string>
    /** The three counter plates, each carrying its own icon and empty field. */
    counters: Record<string, string>
    /** The arcade button plates, by the weight of the action they carry. */
    buttons: { primary: string; secondary: string; disabled: string }
    /** The small square plate for an icon button, and its selected state. */
    iconButton: string
    iconButtonActive: string
    /** The frame behind every dialog: draft cards, build menu, boss card. */
    panel: string
    /** The launch button's two states. Same box, chrome ring in the same
     *  place, so swapping reads as the dome depressing. */
    nukeButton: { up: string; down: string }
    /** The painted loadout room. The scene falls back to flat dark ground if
     *  the file itself does not load. */
    loadoutBackdrop: string
    /** The two states of the painted ticket. Identical canvases, so one
     *  overlays the other exactly. */
    scratchCard: { covered: string; revealed: string }
  }
  /** Props painted onto the map rather than owned by an entity. */
  prop: {
    signDefault: string
    signBribed: string
    /** The tavern's lettering. Static: no state, no swap. */
    signTavern: string
    /** The DO NOT BUILD HERE sign. Exactly one spot on the map carries it. */
    buildPad: string
    /** The painted flagstone every other free spot carries. */
    buildPadQuiet?: string
  }
  fx: {
    /** Landed hit: a projectile, a chain link, the Haymaker, the sign bribe. */
    spark: string
    /** Every explosion: both splash towers, the Molotov and each Meteor. */
    blast: string
    /** What is left where something died. */
    puff: string
    /** The flash at a tower's barrel when it fires. */
    muzzle: string
    /** The Rainbow Reaper's tower-disable bolt, on its way to what it will
     *  switch off. Eight frames, drawn travelling right. */
    bossBolt: string
    /** Drawn over a tower the boss has switched off. Six frames. */
    stunned: string
  }
  decor: string[]
  /** Keys that get a greyscale copy built at boot, for unavailable states. */
  greyable: string[]
  brand: {
    studioCard: string
    jebusGames: string
    cpPlays: string
  }
  /**
   * The hero's animation clips.
   *
   * Frame lists rather than a spritesheet, because the two clips are not on
   * one canvas: walk is 557x704 and attack 787x720, with their feet at
   * different fractions of each. Each frame carries its own render entry, so
   * the anchor is re-read on every swap.
   */
  hero: {
    idle: string
    walk: string[]
    attack: string[]
    /** 1-based, matching the filenames. The swing's damage fires on it. */
    attackImpactFrame: number
  }
  /** Textures the game draws for itself, named here so code never does. */
  generated: {
    groundShadow: string
    buildGlow: string
    iconMissing: string
    /** The peanut, cut out of the counter plate at boot. The pack has no
     *  peanut icon, and the sell button used to wear a cash symbol for a
     *  currency this game does not have. */
    peanutIcon: string
  }
  /** Per-tier tower sprites, keyed by the tower's base sprite key. A tower
   *  with no entry keeps one sprite at every tier, which is the default and
   *  needs nothing here. */
  towerTiers?: Record<string, string[]>
  /** Which soldier art a deploying tower fields at each tier. Same shape and
   *  same clamp as `towerTiers`. */
  soldierTiers?: Record<string, string[]>
}

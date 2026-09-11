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
/**
 * One place a lane's walkers can go when they reach its end.
 *
 * `weight` only means anything where a lane has SEVERAL of these -- a split --
 * and it is the share of traffic that takes this arm. Absent is 1, so a lane
 * with two undeclared weights splits its traffic evenly.
 */
export interface MergeContinuation {
  into: string
  atIndex: number
  weight?: number
}

export interface LaneDef {
  /** Unique within the map. "main" is taken by the map's own waypoints. */
  id: string
  waypoints: number[][]
  /**
   * Where this lane's walkers go at its end. Absent means it runs to an exit.
   *
   * ONE ENTRY IS A MERGE and is what levels 3 and 4 declare: the branch ends
   * and everything on it continues along the named lane. SEVERAL ENTRIES ARE
   * A SPLIT, which level 5's crossroads needs: the trunk ends and each walker
   * takes ONE of the arms, chosen once from its own `routePick` so the same
   * enemy never flickers between them. The single-entry form is written
   * unwrapped so levels 3 and 4 need no edit at all.
   *
   * A MAP MAY NOW HAVE MORE THAN ONE LANE WITHOUT A CONTINUATION. It could
   * not before: `validateLanes` rejected a second terminal outright, with the
   * message "branches must merge before it", because until level 5 every
   * multi-lane map was a fork feeding one gate and a lane that reached the
   * exit on its own was always a forgotten `merge`. Level 5 has two exits and
   * both cost lives, so the rule that caught that typo would now reject a
   * correct map. What replaces it is narrower and still catches the typo that
   * matters: a lane nothing leads to and that leads nowhere is unreachable.
   */
  merge?: MergeContinuation | MergeContinuation[]
  /**
   * True where this lane is a place enemies ARRIVE, not somewhere they are
   * handed on to. `main` is one by definition and never declares it.
   *
   * WHAT IT IS FOR. `validateLanes` reports a lane that nothing merges into
   * and that itself merges nowhere, because on every map up to level 5 that
   * shape was a forgotten `merge` -- a stretch of road with no way onto it.
   * Level 6 is two INDEPENDENT lanes, each with its own entrance and its own
   * exit, so its south lane is exactly that shape and is exactly correct. The
   * flag is the difference between the two, stated by the map rather than
   * guessed: a lane that says it is an entrance is reachable because walkers
   * spawn on it, and one that does not say so and has nothing feeding it is
   * still the typo the rule was written to catch.
   */
  entrance?: boolean
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
  /**
   * What the lane built from `waypoints` is CALLED. Defaults to "main".
   *
   * WHY A MAP WOULD RENAME IT. Up to level 5 the `waypoints` lane was always
   * the trunk every enemy finished on, so "main" described it and the wave
   * tables never had to name it -- branches were named and the trunk was where
   * they ended up. Level 6 is two independent lanes called `upper` and `lower`,
   * neither of which is a trunk, and its wave table spawns on both by name. One
   * of them still has to be the map's own `waypoints`, because LaneNetwork is
   * built as [waypoints, ...lanes] and GameScene measures the board bounds
   * against the first. Renaming it is how that lane can be `upper` to the waves
   * AND the map's own waypoints to the engine, instead of a silent fallback:
   * `LaneNetwork.lane()` resolves an unknown id to main, so a wave spawning on
   * "upper" against a lane called "main" would have walked the right road for
   * the wrong reason and the wrong road the day a third lane arrived.
   */
  mainId?: string
  /**
   * Where the lane `waypoints` describes CONTINUES, if it is not itself an
   * exit. Absent on every map before level 5, and the shape of the field is
   * `LaneDef.merge`'s exactly.
   *
   * IT IS HERE RATHER THAN IN `lanes` because the trunk is not repeated in
   * that array -- it is `waypoints`, resolved as the lane "main" -- and there
   * is therefore no row of it to hang a continuation on. Level 5's crossroads
   * needs one: two roads in, a shared junction, two roads out, so the lane in
   * the middle both receives merges and splits.
   *
   * A map whose main lane runs to the exit, which is all four built levels,
   * simply leaves it out.
   */
  mainMerge?: MergeContinuation | MergeContinuation[]
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
    /** The gap before waves 2 onward. Wave 1 has no clock: see `_firstWave`
     *  in rules.json and `GameScene.armReadyCountdown`. */
    readySeconds: number
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
  /**
   * Which way this enemy's art is drawn, before any mirroring.
   *
   * A PROPERTY OF THE ART, so it lives with the enemy -- the same shape, and
   * for the same reason, as `HeroDef.artFacing`. Enemy.ts used to carry "the
   * art is drawn facing right" as a blanket rule; it was true of all seven
   * enemies that existed when it was written and false of all five added for
   * level 3, so every enemy on that level walked backwards.
   */
  artFacing: 'left' | 'right'
  flavor: string
  role: string
  /** What kind of thing this is, for rules that key off importance rather
   *  than behaviour. Only elites and bosses can drop a Server Nuke. */
  tier: string
  /** False for a boss that walks through the line rather than being held by
   *  it. Holding one would let a player park it and ignore the fight. */
  blockable: boolean
  /**
   * False for an enemy that ignores slows, the same way `blockable: false`
   * makes one ignore the line.
   *
   * The Rainbow Reaper is the only one so far. Its whole fight is a clock --
   * it disables towers on a cooldown while it walks -- and a permanent 45%
   * slow from one Deferral turns that clock off, which is the same trick as
   * parking an unblockable boss on a soldier. THE POLITICIAN IS DELIBERATELY
   * STILL SLOWABLE: he is unblockable for the same reason, but level 1's win
   * rate is tuned around him as he is, and this brief was about level 3.
   */
  slowable: boolean
  /** Present only on The Politician: he takes a share of the player's
   *  peanuts instead of attacking anything. */
  tax?: TaxDef
  sprite: string
  /**
   * NULL FOR A BOSS WHOSE LEVEL HAS NOT BEEN SOAKED YET.
   *
   * A boss's health only means anything against the DPS the board it walks
   * past can hold, so it is the last number a level gets rather than the
   * first, and there is no honest placeholder for it -- level 4's 5200 was one
   * and no board in the game could kill it. The Rooster carries null until
   * level 6 has a map to be measured on, and `tests/level6.test.ts` refuses to
   * let levels.json register a level that spawns an enemy with no health.
   */
  maxHealth: number | null
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
   * True for an enemy that LEAVES when its health runs out instead of dying.
   *
   * The Glitch Lich King is the only one, and only in his wave 7 form. He is
   * fought twice on level 4 -- once in the middle of the level and once as its
   * finale -- and a boss who visibly dies at wave 7 and walks back on at wave
   * 13 reads as the game forgetting itself. So the first fight ends with him
   * going rather than falling.
   *
   * IT CHANGES THE PICTURE AND NOTHING ELSE. The player is still paid, the
   * kill still counts, and the wave still ends -- the work was done. The
   * returning form is a separate entry in enemies.json (`glitchLichReturn`)
   * rather than a state carried between waves, because the wave table is the
   * thing that decides what arrives, and a boss whose stats depended on
   * whether an earlier wave went a particular way could not be soaked.
   */
  retreatsWhenDefeated?: boolean

  /**
   * What this enemy calls in while it walks, if anything.
   *
   * Reusable across bosses rather than written into one of them: the block is
   * data, and any enemy that carries it summons. Children appear at the
   * summoner's own place on its own lane and carry on from there.
   */
  summons?: SummonsDef

  /**
   * What this one breaks into when it dies, if anything.
   *
   * DIFFERENT FROM `summons`, which is a burst on a clock while the summoner
   * walks. This fires once, on death, at the place it died — the Vampire
   * Lord's four Gliders. Kept as its own field rather than as a `summons`
   * with an impossible interval because "what it does while alive" and "what
   * is left when it dies" are two facts, and a reader of one should not have
   * to work out which the other is.
   */
  splitsOnDeath?: {
    enemy: string
    count: number
  }

  /**
   * The one-off that fires the first time this one drops below a share of its
   * health. Batula's roar at 50%: six Baby Franks and a free Humiliation.
   *
   * ONCE PER ENEMY, not once per crossing. Health can cross a threshold twice
   * — lifesteal is on this level and it heals — and a boss that re-roared
   * every time a bleed lapsed would summon without limit.
   */
  onHealthThreshold?: {
    belowHealth: number
    summon?: { enemy: string; count: number }
    /** Humiliation stacks granted outright. See level5.json. */
    humiliation?: number
  }

  /**
   * True for an enemy the sun bothers and the night helps: the day slow, the
   * sun's damage per second and the night's speed bonus all key off it.
   *
   * NOT THE SAME QUESTION AS `lifesteal`, and they are separate fields for
   * that reason. The Thrall is a villager mid-turn — it has no lifesteal and
   * the sun does not burn it yet. Baby Frank is not a vampire at all.
   */
  vampiric?: boolean

  /**
   * True for an enemy that hovers a few pixels off the ground rather than
   * standing on it, so things lying ON the ground miss it.
   *
   * WHAT THAT COSTS IT is not here: it is level5.json's `gliding`, which is
   * one place and is where the open question about the Spike Strip gets
   * answered. The enemy only declares that it glides.
   *
   * NOT `layer: 'air'`. A glider is a legal target for every tower, including
   * the ground-only ones; the air layer is about what may SHOOT it and this is
   * about what may TOUCH it.
   */
  glides?: boolean

  /**
   * The share of the damage it deals to a PLAYER unit that it heals for.
   *
   * Per enemy rather than one shared constant, because "high lifesteal" and
   * "strong lifesteal" are what tells an Elite from a Lord. The brief's 50%
   * is the Glider's; see level5.json's `_lifesteal` for the ladder.
   *
   * Absent on every enemy before level 5, which is what keeps levels 1 to 4
   * out of this entirely.
   */
  lifesteal?: number

  /**
   * True for the one enemy that leaves acid behind it.
   *
   * A FLAG RATHER THAN AN ID, so the scene and the simulator both find "the
   * enemy that does this" by asking rather than by knowing Batula's name.
   * What the trail DOES -- the interval, the radius, the damage, the stop --
   * is level5.json's `acid`, so a second boss with the same habit is one field
   * here and no new code at all.
   */
  acidTrail?: boolean

  /**
   * True for the one enemy that breathes a line of fire ahead of itself.
   *
   * A FLAG RATHER THAN AN ID, like `acidTrail` and for the same reason: the
   * scene and the simulator find "the enemy that does this" by asking rather
   * than by knowing the Rooster's name. What the fire DOES -- the interval,
   * the telegraph, the reach, the width, the damage and the scorch -- is
   * level6.json's `flame`, so a second boss with the same habit is one field
   * here and no new code.
   */
  flame?: boolean
  peanutReward: number
  livesCost: number
  damage: number
  attackInterval: number
}

/**
 * What the powered form changes about a hero, and how the change is staged.
 *
 * THIS WAS `LastStandDef` AND IT CARRIED THREE NUMBERS IT NO LONGER DOES.
 * `healthThreshold` said 0.25 in all five heroes while `rules.json
 * heroTransform.belowHealth` said 0.5, which is how the health bar came to be
 * ticked at a quarter for a rule that fires at a half; `damageTakenMultiplier`
 * said 1.5 and composed with the transformation's own 0.6 to cancel most of
 * it; and `invulnerableSeconds` was a second copy of the grace. All three
 * belong to the transformation rather than to a hero, and all three live in
 * `rules.json heroTransform` now. What is left here is what genuinely differs
 * between heroes: how much harder this one hits, and how the swap is staged.
 */
export interface PoweredFormDef {
  /**
   * What this hero's powered form is called.
   *
   * NOT PRINTED ON THE BOARD. It was: the name was announced across the map
   * on transforming, and the concept came from Cory's DAD MODE. It is a log
   * label now -- `logEvent('hero', ...)` is its only reader -- so a diagnostic
   * trace can say which hero changed without the game shouting a word at the
   * player mid-fight.
   */
  name: string
  /**
   * The voice line this hero says on transforming, as an audio.json cue, or
   * null for a hero who has not recorded one.
   *
   * PER HERO, BECAUSE THE RECORDING IS OF A PERSON. `dadmode-voice` is Cory's
   * line and it used to play for whoever was standing there -- Bailey the dog
   * included. A hero without a line makes no sound beyond the sting.
   */
  voice: string | null
  damageMultiplier: number
  attackIntervalMultiplier: number
  hitsAllInRange: boolean
  /** Powered: reach, block radius and speed all grow, and contact with a
   *  charging hero hurts and shoves. */
  attackRangeMultiplier: number
  blockRangeMultiplier: number
  moveSpeedMultiplier: number
  rammingDamage: number
  rammingKnockbackPixels: number
  transformShakeMs: number
  transformFlashMs: number
  transformPauseMs: number
}

export interface PassiveDef {
  name: string
  armorShredRadius: number
  armorShredPerSecond: number
  maxArmorShred: number
}

/**
 * What one of a hero's abilities does.
 *
 * THIS WAS TWO TYPES AND A FIXED PAIR OF SLOTS. `HeroSkillDef` was slot 1 --
 * always available, instant -- and `HeroPowerDef` was slot 2, powered-form
 * only and always placed with a second tap. A hero had exactly one of each,
 * named `slot1` and `slot2`, and the bar, the cooldowns and the HUD's press
 * handler all knew those two names. Courtland has three abilities, so the
 * PAIR is gone: a hero declares an ordered `abilities` list of any length, and
 * what used to be the difference between the two types is now two fields on
 * one -- `poweredOnly` and `activation`.
 *
 * ONE BLOCK OF FIELDS FOR EVERY ABILITY, with `effect` choosing which of them
 * are read. Every ability declares every field, zeros included, so `damage: 0`
 * on Bark is a statement rather than an omission and a new hero is data rather
 * than a new shape. The alternative -- a discriminated union per effect --
 * would move the same decision into the type system and cost a code change
 * every time a hero is added.
 */
export type HeroAbilityEffect =
  /** Instant, at or near the hero. */
  | 'punch' | 'burst' | 'burn' | 'double' | 'howl' | 'rain'
  /** Placed with a second tap. */
  | 'hazard' | 'bomb' | 'dash' | 'beam'
  /** Placed with a second tap: turns `targets` enemies near the point around
   *  for `durationSeconds`, after which they die. */
  | 'control'
  /** Held: a beam that fires from the hero along the aim while the button is
   *  down, for at most `holdSeconds` of held time. */
  | 'laser'

/**
 * How an ability is asked for.
 *
 * `instant` fires on the press. `targeted` arms the board and waits for a tap
 * inside `castRadius`, through the same targeting mode the rally point uses
 * and with the same ways out. `held` fires while the button is down and is
 * aimed by dragging.
 */
export type HeroAbilityActivation = 'instant' | 'targeted' | 'held'

export interface HeroAbilityDef {
  name: string
  icon: string
  /** The art this ability draws, as an art.json key. Data rather than a switch
   *  in the scene: a hero's effects are as much a fact about the hero as its
   *  icons are, and adding one is an edit to heroes.json. */
  fx: string
  /** Null means the slot is reserved: the button is drawn and pressing it
   *  reports that it is not wired up, spending nothing. */
  effect: HeroAbilityEffect | null
  cooldown: number
  /**
   * Whether the hero has to have transformed.
   *
   * THE GATE, AS DATA. It used to be the slot's index -- slot 2 was
   * powered-only because it was slot 2 -- which is exactly the assumption that
   * cannot survive a hero with three abilities, two of which are gated and one
   * of which is not.
   */
  poweredOnly: boolean
  activation: HeroAbilityActivation
  /** `targeted` only: how far from the hero the point may be. The targeting
   *  overlay draws it. 0 for anything else. */
  castRadius: number
  /** Reach, for an ability that picks a target itself, and the length of a
   *  `laser`'s beam. 0 for one centred on the hero. */
  range: number
  /** The effect's own radius: the blast, the scatter, the dash corridor's
   *  half-width, or how near the tapped point `control` looks for enemies. */
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
  /** How many times it lands. 1 for a single blow; 12 for Star Rain, which
   *  is that many separate small strikes scattered over its radius. */
  hits: number
  /** Seconds between those hits. */
  gapSeconds: number
  /** `hazard`: how long the strip lives. `dash`: how long the run takes.
   *  `control`: how long the enemies stay turned before they drop. */
  durationSeconds: number
  /** How often a continuous effect charges what it is on: the hazard strip,
   *  and the laser's beam. */
  tickSeconds: number
  /** How many separate things the ability takes hold of. `control` only. */
  targets: number
  /** `held` only: the most seconds of held time before it goes on cooldown. */
  holdSeconds: number
  /** `laser` only: the beam's thickness in world pixels. */
  beamWidth: number
  sound: string
  /** A voice line on the cast, or null for a hero who has none recorded. */
  voice: string | null
}


export interface HeroDef {
  name: string
  title: string
  blurb: string
  bodySprite: string
  /** The Last Stand form. For all five this is the same key as
   *  `poweredSprite`: the transformation is told by the shake, the flash, the
   *  half-second pause and the stat change rather than by a third picture. */
  ultimateSprite: string
  /**
   * The form worn once health has been at or below half.
   *
   * It was optional because Cory had no powered art and kept his own picture.
   * He has the spiked Rivian now and all five heroes have both forms, so the
   * `null` branch is dead data-wise -- the type keeps it because `heroSprite`
   * still falls back to the base key, and a hero added tomorrow with only one
   * picture should be a data edit rather than a crash.
   */
  poweredSprite?: string | null
  /**
   * How tall the POWERED form is drawn, in world pixels, or absent to take
   * whatever its art entry asks for.
   *
   * ONE HERO SETS IT. The Rivian is 1.51:1, so at the height the other nine
   * hero pictures are drawn at it would be 181px across -- wider than the road
   * and half again the widest hero. That is a decision about this character
   * rather than about that file, so it lives here and art.json carries no
   * `displayHeight` for the key at all: one number, one place.
   */
  poweredHeight?: number
  portraitSprite: string
  /**
   * Which way this hero's art is drawn, before any mirroring.
   *
   * ALL FIVE ARE 'right' NOW. Cory was the exception — every frame of him and
   * the SUV faced left — and it was once a blanket rule in the renderer, which
   * made the four heroes added after him walk backwards. His new art faces
   * right like everyone else's, so no hero needs a correction any more. The
   * field stays because it is a property of the ART: the enemies still
   * disagree with each other and read the same `mirroredFor`, so removing it
   * from one side would leave one rule with two shapes.
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
  /**
   * This hero's abilities, in bar order. ANY LENGTH.
   *
   * It was `slot1` and `slot2`, two named fields, and every hero had exactly
   * one of each. Courtland has three. The bar, the cooldown register and the
   * HUD's press handler all walk this list now, so a hero with one ability or
   * with four is data rather than a code change.
   */
  abilities: HeroAbilityDef[]
  /** What changes when this hero transforms. */
  powered: PoweredFormDef
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
  /**
   * Effects drawn along a LINE rather than at a point.
   *
   * The ice beam and the dash trail are fixed-width pictures drawn over a
   * distance the power decides, so they are stretched from the hero to the
   * point tapped. That makes their `anchorX` a statement about which END of
   * the picture is the hero's -- 0, the left edge, because both are authored
   * travelling right -- and not, as it is everywhere else in this manifest,
   * a measurement of where a character's feet are. `manifest.test.ts` exempts
   * these from the "an anchor near an edge means the measurement latched onto
   * a prop" rule on the strength of this field, so the exemption is declared
   * by the art rather than by a list of names in a test.
   */
  stretch?: 'line'
  /**
   * Beam strips only: how thick the beam's OWN CORE is inside its cell, in
   * source pixels, and where the middle of that core sits.
   *
   * A beam cell is mostly not beam. `fx_mind_laser` is a 225x200 cell holding
   * a core of 76 source pixels, with a muzzle glow and an impact spray of
   * shards filling the rest -- so scaling the WHOLE cell down to the ability's
   * `beamWidth` squeezes the core to a fifth of its drawn thickness and
   * flattens every painted detail into a smooth gradient. The corridor that is
   * damaged is `beamWidth`, so it is the CORE that has to measure `beamWidth`
   * and the spray that is allowed to spill outside it.
   *
   * `beamCoreHeight` is measured off the sustain frames -- the ones a held beam
   * spends its whole life on -- with `tools/measure_art.py`. `anchorY` goes
   * with it: it is where that core's centre line sits in the cell, so the
   * painted beam lands on the line the damage pass tests against rather than
   * parallel to it.
   */
  beamCoreHeight?: number
  /**
   * Sheets that END on a picture the game keeps: how big the ink of the LAST
   * frame is, in source pixels.
   *
   * `contentWidth`/`contentHeight` on a strip are the UNION across every
   * frame, which for the Glacier is a 262x378 box -- most of it the arc of
   * shards thrown up at the peak of the eruption. What is left on the ground
   * afterwards is a 248x172 frost patch, and that patch is what has to measure
   * the ability's radius, because it is the only thing on screen telling the
   * player where the slow zone is. Sizing the settled frame by the union would
   * draw the patch at less than half the field it marks. Same failure as
   * `beamCoreHeight`, one frame later.
   */
  restWidth?: number
  restHeight?: number
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
  /**
   * Art that only exists inside a level, and so is not loaded at boot.
   *
   * `shared` is what any level might need — effects, props, soldiers,
   * projectiles, the two in-play panels. The enemies are deliberately absent:
   * they are computed per level from enemies.json and the wave tables. See the
   * note in art.json and systems/LevelArt.ts.
   */
  levelArt: { shared: string[] }
  ui: {
    /** The painted peanut, for every place the currency is shown: the sell
     *  button, the drawer's prices, and the counter plate's own end. */
    peanut: string
    /** null once towers ship as one sprite carrying their own base. */
    /** The painted title illustration. null falls back to a flat panel. */
    titleBackdrop: string | null
    /** Named action and stat icons, read through `icon()` so a missing file
     *  resolves to the visible stand-in rather than an empty key. */
    icons: Record<string, string>
    /** The three counter plates, each carrying its own icon and empty field. */
    counters: Record<string, string>
    /** Where an icon DRAWN over a counter plate goes, as fractions of the
     *  plate's height, measured off the heart painted into the lives plate.
     *  See the note in art.json. */
    counterIcon: { left: number; top: number; width: number; height: number }
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
    /** The cake a level pays out. ONE asset for both states: the unearned one
     *  is built from it at runtime by `Desaturate.UNEARNED`. */
    cake: string
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
    /** Drawn over an enemy that is alight, for as long as it burns. A ROLE
     *  RATHER THAN A FIELD ON HAN'S EMBER: a burn is a fact about the enemy,
     *  and anything that sets something alight draws the same flame. */
    burn: string
    /** Drawn over an enemy under someone else's orders. Bound so the art
     *  ships and is named; nothing sets that state yet. */
    mindControl: string
    /** The Glacier's eruption, and the frost it leaves. Eight frames, played
     *  once, then held on the last one for the field's duration. */
    glacier: string
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
   * WHICH PICTURE EACH HERO WEARS, in each of its two forms.
   *
   * This used to be Cory's frame lists -- `idle`, `walk`, `attack` -- because
   * he was the only hero and his walk sheet was the animation system. All five
   * are single pictures now and the sheet is deleted, so what is left is the
   * roster: a base, a powered form, and two nulls kept so a sheet can be
   * dropped back in per hero without a shape change here.
   */
  hero: {
    roster: Record<string, {
      base: string
      /** What it wears once health has been at or below half. */
      powered: string | null
      /** Frame lists, or null. NULL IS WHAT DRIVES THE BOB: a hero with no
       *  sheet is one picture that would slide across the field, so Hero.ts
       *  bobs it instead. All five are null today. */
      walk: string[] | null
      attack: string[] | null
    }>
    /** 1-based. The frame of the swing clock on which the damage fires. It
     *  outlived the frames: nothing swaps a texture on it any more, but WHEN
     *  a swing lands is a tuned number and is still read from here. */
    attackImpactFrame: number
  }
  /** Textures the game draws for itself, named here so code never does. */
  generated: {
    groundShadow: string
    buildGlow: string
    iconMissing: string
  }
  /** Per-tier tower sprites, keyed by the tower's base sprite key. A tower
   *  with no entry keeps one sprite at every tier, which is the default and
   *  needs nothing here. */
  towerTiers?: Record<string, string[]>
  /** Which soldier art a deploying tower fields at each tier. Same shape and
   *  same clamp as `towerTiers`. */
  soldierTiers?: Record<string, string[]>
}

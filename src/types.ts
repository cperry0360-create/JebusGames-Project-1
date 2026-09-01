// Shapes of the JSON under /src/data. Every tuneable number in the game is
// described here and lives there, never in a .ts file.

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

export interface MapDef {
  /** Key into art.json's map section. */
  plate: string
  /** The painted road's width in canvas pixels, measured by tools/trace_map.py.
   *  Tower bases are sized against it. */
  roadWidth: number
  note: string
  heroStart: number[]
  /** Click tolerance and highlight size for a build spot, in canvas pixels. */
  spotRadius: number
  /**
   * Both are canvas pixels, traced from the painted plate. The plate is 16:9
   * and fills the canvas, so canvas pixels are the map's own coordinate space.
   * The first and last waypoints sit off-screen, so enemies walk in through
   * the arch and out through the gate.
   */
  waypoints: number[][]
  buildSpots: number[][]
  /** Where the villager's blank board is, and how wide to draw a sign on it. */
  sign: { x: number; y: number; boardWidth: number }
  /** The stone archway enemies walk out of, measured off the painted plate. */
  entrance: {
    /** Map x at the arch's mouth: where the fade starts. */
    emergeFromX: number
    /** Map x past which nothing of the arch is in front any more. */
    clearOfArchX: number
    fadeMs: number
    startScale: number
    /** The stone piers, cropped out of the plate and drawn in front. The
     *  passage between them is deliberately not listed. */
    occluders: Array<{ x: number; y: number; w: number; h: number }>
  }
  /** The closed gate enemies hit. They stop AT it; they do not pass through. */
  exit: { gateX: number; puffOffsetY: number }
  /** Parts of the painted plate that already have furniture on them, so the
   *  scatter layer does not drop a rock on the tavern roof. */
  scatterExclude?: Array<{ x: number; y: number; w: number; h: number }>
  /** The map's own light sources and chimneys, for the ambient overlay. Per
   *  map rather than in code, so a second map carries its own. */
  ambient?: {
    lights: Array<{ x: number; y: number; radius: number; kind: string }>
    chimneys: Array<{ x: number; y: number }>
  }
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
  archetype: string
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

export interface HaymakerDef {
  name: string
  icon: string
  cooldown: number
  range: number
  damage: number
  ignoresArmor: boolean
  knockbackPixels: number
}

export interface RestructureDef {
  name: string
  icon: string
  cooldown: number
}

export interface HeroDef {
  name: string
  title: string
  blurb: string
  bodySprite: string
  /** The Last Stand form. Cory does not get angrier; he gets into an SUV. */
  ultimateSprite: string
  portraitSprite: string
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
  haymaker: HaymakerDef
  restructure: RestructureDef
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
  /** The artwork's real extents inside its canvas, for art with padding.
   *  Sizing by these means a logo drawn at a requested height really is that
   *  tall on screen, rather than that tall including its transparent margin. */
  contentWidth?: number
  contentHeight?: number
  /** Signboards only: where the board sits inside the sprite's canvas, as
   *  fractions. Both sign sprites are a board with a post hanging below it,
   *  and the post is the part the villager's hand covers, so the board is what
   *  gets placed and sized. */
  boardLeft?: number
  boardRight?: number
  boardTop?: number
  boardBottom?: number
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
    /** The marker on an empty build pad. */
    buildPad: string
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
    buildPad: string
    buildGlow: string
    iconMissing: string
  }
  /** Per-tier tower sprites, keyed by the tower's base sprite key. A tower
   *  with no entry keeps one sprite at every tier, which is the default and
   *  needs nothing here. */
  towerTiers?: Record<string, string[]>
}

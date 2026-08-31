// Shapes of the JSON under /src/data. Every tuneable number in the game is
// described here and lives there, never in a .ts file.

export interface DisplayDef {
  width: number
  height: number
  /** Height of the HUD bar, including its shadow. The world draws under it,
   *  so nothing that must stay readable may sit above this line. */
  hudHeight: number
  backgroundColor: string
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

export interface RulesDef {
  startingPeanuts: number
  startingLives: number
  peanutsPerWaveCleared: number
  serverNuke: ServerNukeDef
}

export interface TowerDef {
  name: string
  flavor: string
  archetype: string
  sprite: string
  shot: string
  cost: number
  range: number
  damage: number
  fireInterval: number
  projectileSpeed: number
  /** 0 means single target. */
  splashRadius: number
  ignoresArmor: boolean
  /** 0 means no slow. 0.45 means targets move at 45% speed. */
  slowFactor: number
  slowSeconds: number
  /** Non-zero marks a support tower: it never fires, it buffs towers in radius. */
  supportRadius: number
  supportDamageBonus: number
  /** Tier 1 is instant. Tiers 2 and 3 will use this once upgrades exist. */
  buildTime: number
}

export interface EnemyDef {
  name: string
  flavor: string
  role: string
  /** What kind of thing this is, for rules that key off importance rather
   *  than behaviour. Only elites and bosses can drop a Server Nuke. */
  tier: string
  sprite: string
  maxHealth: number
  /** Flat damage subtracted per hit, unless the attacker ignores armour. */
  armor: number
  speed: number
  peanutReward: number
  livesCost: number
  damage: number
  attackInterval: number
  engageRange: number
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
}

export interface PassiveDef {
  name: string
  flavor: string
  armorShredRadius: number
  armorShredPerSecond: number
  maxArmorShred: number
}

export interface HaymakerDef {
  name: string
  flavor: string
  icon: string
  cooldown: number
  range: number
  damage: number
  ignoresArmor: boolean
  knockbackPixels: number
}

export interface RestructureDef {
  name: string
  flavor: string
  icon: string
  cooldown: number
}

export interface HeroDef {
  name: string
  title: string
  flavor: string
  blurb: string
  bodySprite: string
  /** The Last Stand form. Cory does not get angrier; he gets into an SUV. */
  ultimateSprite: string
  portraitSprite: string
  /** The sprite a summoned fighter wears. Not the hero's own. */
  fighterSprite: string
  maxHealth: number
  moveSpeed: number
  attackRange: number
  /** Enemies this close stop walking and fight. */
  blockRange: number
  /** How many enemies the hero can hold at once. */
  blockCapacity: number
  damage: number
  attackInterval: number
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
  titleMark: { height: number; x: number; y: number }
  credits: {
    logoHeight: number
    logoGap: number
    logoY: number
    textTop: number
    lineHeight: number
  }
}

export interface CreditsDef {
  heading: string
  subheading: string
  lines: string[]
  footer: string
}

export interface AbilityDef {
  name: string
  flavor: string
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
  payoutMin: number
  payoutMax: number
  /** How long the ticket waits before scratching itself, in seconds. */
  autoRevealSeconds: number
  summonCount: number
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
  spawns: WaveSpawnDef[]
}

export interface WavesDef {
  waves: WaveDef[]
}

/** Where a sprite sits and how big it draws. Absent fields take defaults. */
export interface SpriteRender {
  anchorX: number
  anchorY: number
  /** On-screen height in pixels; the aspect ratio is preserved. */
  displayHeight?: number
  /** Width of the ground shadow under this sprite. */
  shadowWidth?: number
  /** The artwork's real extents inside its canvas, for art with padding.
   *  Sizing by these means a logo drawn at a requested height really is that
   *  tall on screen, rather than that tall including its transparent margin. */
  contentWidth?: number
  contentHeight?: number
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
    towerBase: string | null
    /** The painted title illustration. null falls back to a flat panel. */
    titleBackdrop: string | null
  }
  fx: {
    spark: string
    blast: string
    ember: string
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
  /** Textures the game draws for itself, named here so code never does. */
  generated: {
    groundShadow: string
  }
}

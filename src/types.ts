// Shapes of the JSON under /src/data. Every tuneable number in the game is
// described here and lives there, never in a .ts file.

export interface DisplayDef {
  width: number
  height: number
  tileSize: number
  backgroundColor: string
}

export interface MapDef {
  cols: number
  rows: number
  originX: number
  originY: number
  /** How many tiles wide the road is. The autotiler assumes 2. */
  laneWidthTiles: number
  /**
   * Centreline of the road, in tile-lattice coordinates (corners, not centres).
   * Every segment is axis-aligned and the road spreads one tile either side,
   * which is what lets the Kenney edge and corner tiles line up. The first and
   * last points sit off-grid so enemies walk on and off screen.
   */
  waypoints: number[][]
  heroStart: number[]
  /** [col, row, spriteKey] scenery on non-road tiles. */
  decorations: (number | string)[][]
}

export interface RulesDef {
  startingGold: number
  startingLives: number
  goldPerWaveCleared: number
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
  sprite: string
  spriteScale: number
  maxHealth: number
  /** Flat damage subtracted per hit, unless the attacker ignores armour. */
  armor: number
  speed: number
  goldReward: number
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
  gunSprite: string
  portraitSprite: string
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
  gold: number
  summonCount: number
}

export interface DraftDef {
  towersAtStart: number
  towerCap: number
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

export interface WeightedSprite {
  key: string
  weight: number
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
  ground: {
    grass: WeightedSprite[]
    road: WeightedSprite[]
  }
  autotile: Record<string, string>
  ui: {
    plot: string
    plotHover: string
    /** null once towers ship as one sprite carrying their own base. */
    towerBase: string | null
  }
  fx: {
    spark: string
    blast: string
    ember: string
    muzzle: string
    coin: string
  }
  decor: string[]
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

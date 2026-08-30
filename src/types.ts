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

export interface ArtDef {
  basePath: string
  credit: string
  /** Logical key -> real filename in public/assets/kenney. */
  sprites: Record<string, string>
}

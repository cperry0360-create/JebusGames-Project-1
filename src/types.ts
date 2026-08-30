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
  /** Waypoints in tile coordinates. Segments are axis-aligned. The first and
   *  last may sit outside the grid so enemies walk on and off screen. */
  path: number[][]
  heroStart: number[]
}

export interface RulesDef {
  startingGold: number
  startingLives: number
  goldPerWaveCleared: number
  timeBetweenWaves: number
  firstWaveDelay: number
}

export interface TowerDef {
  name: string
  flavor: string
  sprite: string
  cost: number
  range: number
  damage: number
  fireInterval: number
  projectileSpeed: number
  /** 0 means single target. */
  splashRadius: number
  /** Tier 1 is instant. Tiers 2 and 3 will use this once upgrades exist. */
  buildTime: number
}

export interface EnemyDef {
  name: string
  flavor: string
  sprite: string
  maxHealth: number
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

export interface HeroDef {
  name: string
  title: string
  flavor: string
  sprite: string
  maxHealth: number
  moveSpeed: number
  attackRange: number
  /** Enemies this close stop walking and fight. */
  blockRange: number
  /** How many enemies the hero can hold at once. */
  blockCapacity: number
  damage: number
  attackInterval: number
  lastStand: LastStandDef
}

export interface WaveSpawnDef {
  enemy: string
  count: number
  interval: number
}

export interface WaveDef {
  spawns: WaveSpawnDef[]
}

export interface WavesDef {
  waves: WaveDef[]
}

export interface PlaceholderDef {
  shape: string
  color: string
  accent: string
}

export interface SpriteDef {
  placeholder: PlaceholderDef
}

export interface ArtDef {
  useKenneyPack: boolean
  kenneyPath: string
  sprites: Record<string, SpriteDef>
}

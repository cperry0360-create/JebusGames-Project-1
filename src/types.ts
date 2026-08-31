// Shapes of the JSON under /src/data. Every tuneable number in the game is
// described here and lives there, never in a .ts file.

export interface DisplayDef {
  width: number
  height: number
  /** Height of the strip the counters occupy in the top corner. There is no
   *  HUD bar any more, but the world still draws underneath the counters, so
   *  nothing that must stay readable may sit above this line. */
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
  /** Where the villager's blank board is, and how wide to draw a sign on it. */
  sign: { x: number; y: number; boardWidth: number }
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
  /** Shown when the player cannot afford him. */
  brokeToast: string
  /** Shown on payment, and on any later tap. */
  paidToast: string
}

export interface RulesDef {
  startingPeanuts: number
  startingLives: number
  peanutsPerWaveCleared: number
  serverNuke: ServerNukeDef
  signBribe: SignBribeDef
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
    headingY: number
    subheadingY: number
    logoHeight: number
    logoGap: number
    logoY: number
    textTop: number
    lineHeight: number
    /** Space above and below a section's title. */
    sectionGap: number
    /** Half the gap between the role column and the name column. */
    columnGap: number
    /** The dedication line, sat between the closing note and the back button. */
    footerY: number
  }

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
    towerBase: string | null
    /** The painted title illustration. null falls back to a flat panel. */
    titleBackdrop: string | null
    /** The three counter plates, each carrying its own icon and empty field. */
    counters: Record<string, string>
    /** The arcade button plates, by the weight of the action they carry. */
    buttons: { primary: string; secondary: string; disabled: string }
    /** The small square plate for an icon button, and its selected state. */
    iconButton: string
    iconButtonActive: string
    /** The frame behind every dialog: draft cards, build menu, boss card. */
    panel: string
  }
  /** Props painted onto the map rather than owned by an entity. */
  prop: {
    signDefault: string
    signBribed: string
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

import Phaser from 'phaser'
import type {
  AbilityDef, DraftDef, EnemyDef, HeroDef, MapDef, RulesDef, TowerDef, WavesDef,
} from '../types.ts'
import displayData from '../data/display.json'
import mapData from '../data/map.json'
import rulesData from '../data/rules.json'
import towersData from '../data/towers.json'
import enemiesData from '../data/enemies.json'
import heroesData from '../data/heroes.json'
import wavesData from '../data/waves.json'
import abilitiesData from '../data/abilities.json'
import draftData from '../data/draft.json'

import { Grid } from '../systems/Grid.ts'
import { Path } from '../systems/Path.ts'
import { roadSprite } from '../systems/Autotile.ts'
import { BuildSystem } from '../systems/BuildSystem.ts'
import { WaveSpawner } from '../systems/WaveSpawner.ts'
import { withinRadius, pickNearest } from '../systems/Targeting.ts'
import { GROUND_DEPTH } from '../systems/DepthSort.ts'
import { Cooldowns } from '../systems/Cooldowns.ts'
import { unlockedTowerCount } from '../systems/Draft.ts'
import { runState } from '../systems/RunState.ts'
import { castAbility } from '../systems/AbilityRunner.ts'
import { PRESENTATION, floatingDamage, DECOR_DEPTH } from '../systems/Presentation.ts'
import { play } from '../systems/Sfx.ts'
import { Enemy } from '../entities/Enemy.ts'
import type { Blocker } from '../entities/Enemy.ts'
import { Tower } from '../entities/Tower.ts'
import { Hero } from '../entities/Hero.ts'
import { Fighter } from '../entities/Fighter.ts'
import { Projectile } from '../entities/Projectile.ts'
import { BuildMenu } from '../ui/BuildMenu.ts'
import { COLOR, FONT_DISPLAY } from '../ui/Theme.ts'

const MAP = mapData as MapDef
const RULES = rulesData as RulesDef
const TOWERS = towersData as Record<string, TowerDef>
const ENEMIES = enemiesData as Record<string, EnemyDef>
const HEROES = heroesData as Record<string, HeroDef>
const WAVES = wavesData as WavesDef
const ABILITIES = abilitiesData as Record<string, AbilityDef>
const DRAFT = draftData as DraftDef

export type Phase = 'ready' | 'wave' | 'won' | 'lost'
/** What a click means right now. */
export type Mode = 'normal' | 'targeting' | 'restructure'

export interface GameStatus {
  gold: number
  lives: number
  wave: number
  waveCount: number
  waveName: string
  phase: Phase
  mode: Mode
  enemiesLeft: number
  heroName: string
  heroHealth: number
  heroMax: number
  heroDown: boolean
  lastStand: boolean
  unlockedTowers: string[]
  abilities: string[]
  pendingAbility: string | null
  message: string
}

const OVERLAY_DEPTH = 150000
const GRASS_KEYS = ['ground-grass', 'ground-grass', 'ground-grass', 'ground-grass', 'ground-grass',
  'ground-grass', 'ground-grass-alt', 'ground-grass-alt2', 'ground-grass-alt', 'ground-grass-alt2']
const ROAD_KEYS = ['road', 'road', 'road', 'road', 'road', 'road', 'road', 'road',
  'road-alt', 'road-alt2', 'road-alt', 'road-alt2']
const DECOR_KEYS = ['decor-bush', 'decor-shrub', 'decor-plant', 'decor-rock', 'decor-rock2', 'decor-rock3']

export class GameScene extends Phaser.Scene {
  readonly status: GameStatus = {
    gold: 0, lives: 0, wave: 0, waveCount: WAVES.waves.length, waveName: '',
    phase: 'ready', mode: 'normal', enemiesLeft: 0,
    heroName: '', heroHealth: 0, heroMax: 0, heroDown: false, lastStand: false,
    unlockedTowers: [], abilities: [], pendingAbility: null, message: '',
  }

  readonly cooldowns = new Cooldowns()

  private grid!: Grid
  private lane!: Path
  private build!: BuildSystem
  private spawner!: WaveSpawner
  private hero!: Hero
  private menu!: BuildMenu

  private enemies: Enemy[] = []
  private towers: Tower[] = []
  private shots: Projectile[] = []
  private fighters: Fighter[] = []

  private plotMarkers: Phaser.GameObjects.Image[] = []
  private hoverPlot!: Phaser.GameObjects.Image
  private rangeRing!: Phaser.GameObjects.Graphics
  private targetRing!: Phaser.GameObjects.Graphics
  private selected: Tower | null = null
  private restructuring: Tower | null = null

  constructor() {
    super('Game')
  }

  create(): void {
    // create() runs again on restart, so every field carrying state from the
    // previous run has to be cleared here, not just declared above.
    this.enemies = []
    this.towers = []
    this.shots = []
    this.fighters = []
    this.plotMarkers = []
    this.selected = null
    this.restructuring = null

    const run = runState()
    const heroDef = HEROES[run.heroId] ?? HEROES.cory

    this.grid = new Grid(MAP.cols, MAP.rows, displayData.tileSize, MAP.originX, MAP.originY)
    this.lane = new Path(MAP.waypoints, this.grid)
    this.build = new BuildSystem(this.grid)
    this.spawner = new WaveSpawner()

    this.blockScenery()
    this.drawGround()
    this.scatterDecoration()

    this.hoverPlot = this.add.image(-999, -999, 'plot-hover').setDepth(GROUND_DEPTH + 5).setVisible(false)
    this.rangeRing = this.add.graphics().setDepth(OVERLAY_DEPTH)
    this.targetRing = this.add.graphics().setDepth(OVERLAY_DEPTH + 1)

    this.hero = new Hero(
      this,
      this.grid.centreX(MAP.heroStart[0]),
      this.grid.centreY(MAP.heroStart[1]),
      heroDef,
    )

    this.status.gold = RULES.startingGold
    this.status.lives = RULES.startingLives
    this.status.wave = 0
    this.status.phase = 'ready'
    this.status.mode = 'normal'
    this.status.waveName = WAVES.waves[0].name
    this.status.enemiesLeft = 0
    this.status.heroName = heroDef.name
    this.status.heroMax = heroDef.maxHealth
    this.status.heroHealth = heroDef.maxHealth
    this.status.heroDown = false
    this.status.lastStand = false
    this.status.pendingAbility = null
    this.status.abilities = [...run.abilities]
    this.status.unlockedTowers = run.openingTowers.slice(0, DRAFT.towersAtStart)
    this.status.message = 'Click a plot to build. Click the road to rally Cory.'

    for (const id of this.status.abilities) this.cooldowns.register(id, ABILITIES[id].cooldown)
    this.cooldowns.register('haymaker', heroDef.haymaker.cooldown)
    this.cooldowns.register('restructure', heroDef.restructure.cooldown)

    this.menu = new BuildMenu(this, [])
    this.refreshMenuOptions()
    this.setupInput()
    this.showPlots(false)
  }

  // ---------------------------------------------------------------- setup

  /** Scenery occupies its tile, so it has to be blocked before the ground
   *  layer decides which tiles get a build-plot marker. */
  private blockScenery(): void {
    for (const t of this.lane.roadTiles()) this.build.block(t.col, t.row)
    for (const d of MAP.decorations) this.build.block(d[0] as number, d[1] as number)
  }

  private drawGround(): void {
    const road = new Set(this.lane.roadTiles().map((t) => this.grid.key(t.col, t.row)))
    const isRoad = (c: number, r: number): boolean => road.has(this.grid.key(c, r))
    const rng = new Phaser.Math.RandomDataGenerator([PRESENTATION.decoration.seed])

    for (let r = 0; r < this.grid.rows; r++) {
      for (let c = 0; c < this.grid.cols; c++) {
        const x = this.grid.centreX(c)
        const y = this.grid.centreY(r)
        if (isRoad(c, r)) {
          this.add.image(x, y, rng.pick(ROAD_KEYS)).setDepth(GROUND_DEPTH)
          const overlay = roadSprite(isRoad, c, r)
          if (overlay) this.add.image(x, y, overlay).setDepth(GROUND_DEPTH + 1)
        } else {
          this.add.image(x, y, rng.pick(GRASS_KEYS)).setDepth(GROUND_DEPTH)
          if (this.build.isBuildable(c, r)) {
            this.plotMarkers.push(
              this.add.image(x, y, 'plot').setDepth(GROUND_DEPTH + 2).setAlpha(0.4).setVisible(false),
            )
          }
        }
      }
    }
  }

  /** Hand-placed scenery from the map, plus a seeded scatter so the field is
   *  not an empty lawn. Scattered pieces block their tile like any other. */
  private scatterDecoration(): void {
    for (const d of MAP.decorations) {
      const col = d[0] as number
      const row = d[1] as number
      if (!this.grid.contains(col, row)) continue
      this.add.image(this.grid.centreX(col), this.grid.centreY(row), d[2] as string).setDepth(DECOR_DEPTH)
    }

    const cfg = PRESENTATION.decoration
    const rng = new Phaser.Math.RandomDataGenerator([`${cfg.seed}-scatter`])
    const roadKeys = new Set(this.lane.roadTiles().map((t) => this.grid.key(t.col, t.row)))
    for (let r = 0; r < this.grid.rows; r++) {
      for (let c = 0; c < this.grid.cols; c++) {
        if (!this.build.isBuildable(c, r)) continue
        if (rng.between(1, 100) > cfg.densityPercent) continue
        // Keep clear of the road so the lane stays readable.
        if (this.nearRoad(roadKeys, c, r, cfg.minDistanceFromRoad)) continue
        this.build.block(c, r)
        this.add
          .image(this.grid.centreX(c), this.grid.centreY(r), rng.pick(DECOR_KEYS))
          .setDepth(DECOR_DEPTH)
          .setScale(rng.realInRange(0.7, 1.05))
          .setAngle(rng.between(-18, 18))
      }
    }
  }

  private nearRoad(roadKeys: Set<string>, col: number, row: number, distance: number): boolean {
    for (let dc = -distance; dc <= distance; dc++) {
      for (let dr = -distance; dr <= distance; dr++) {
        if (roadKeys.has(this.grid.key(col + dc, row + dr))) return true
      }
    }
    return false
  }

  /** The grid only shows while the player is actually placing something. */
  private showPlots(on: boolean): void {
    for (const m of this.plotMarkers) m.setVisible(on)
  }

  private refreshMenuOptions(): void {
    this.menu.setOptions(this.status.unlockedTowers.map((id) => ({ id, def: TOWERS[id] })))
  }

  private setupInput(): void {
    this.input.mouse?.disableContextMenu()
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.updateHover(p))
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (this.menu.isOpen && this.menu.ownsAny(over)) return
      this.onClick(p)
    })
    this.input.keyboard?.on('keydown-ESC', () => this.clearSelection())
    this.input.keyboard?.on('keydown-SPACE', () => this.startWave())
    this.input.keyboard?.on('keydown-Q', () => this.armAbility(this.status.abilities[0]))
    this.input.keyboard?.on('keydown-W', () => this.armAbility(this.status.abilities[1]))
    this.input.keyboard?.on('keydown-E', () => this.castHaymaker())
    this.input.keyboard?.on('keydown-R', () => {
      if (this.status.phase === 'won' || this.status.phase === 'lost') this.toTitle()
      else this.armRestructure()
    })
  }

  private onClick(p: Phaser.Input.Pointer): void {
    if (p.rightButtonDown()) {
      this.clearSelection()
      return
    }
    if (this.status.phase === 'won' || this.status.phase === 'lost') return

    const col = this.grid.colAt(p.worldX)
    const row = this.grid.rowAt(p.worldY)

    if (this.status.mode === 'targeting' && this.status.pendingAbility) {
      this.fireAbility(this.status.pendingAbility, p.worldX, p.worldY)
      return
    }

    if (this.status.mode === 'restructure') {
      this.doRestructure(col, row)
      return
    }

    if (this.menu.isOpen) {
      this.clearSelection()
      return
    }
    if (!this.grid.contains(col, row)) return

    const tower = this.towers.find((t) => t.col === col && t.row === row)
    if (tower) {
      this.selectTower(tower)
      return
    }
    if (this.build.isBuildable(col, row)) {
      this.openBuildMenu(col, row)
      return
    }

    this.clearSelection()
    this.hero.setRally(p.worldX, p.worldY)
    this.pingRally(p.worldX, p.worldY)
  }

  // ---------------------------------------------------------------- build UI

  private openBuildMenu(col: number, row: number): void {
    this.selected = null
    this.showPlots(true)
    this.menu.open(
      this.grid.centreX(col), this.grid.centreY(row), col, row, this.status.gold,
      (id) => this.place(id, col, row),
      (id) => {
        if (id) this.showRange(this.grid.centreX(col), this.grid.centreY(row), TOWERS[id])
        else this.rangeRing.clear()
      },
    )
    this.hoverPlot.setVisible(false)
    this.status.message = 'Pick a tower, or click away to cancel.'
  }

  private place(id: string, col: number, row: number): void {
    const def = TOWERS[id]
    if (!this.build.isBuildable(col, row) || this.status.gold < def.cost) return

    this.status.gold -= def.cost
    this.build.occupy(col, row)
    this.towers.push(new Tower(this, this.grid.centreX(col), this.grid.centreY(row), id, def, col, row))
    this.refreshSupport()
    play(this, 'sfx-build', 0.5)
    this.menu.close()
    this.rangeRing.clear()
    this.showPlots(false)
    this.status.message = `${def.name} — ${def.flavor}`
  }

  private selectTower(tower: Tower): void {
    this.menu.close()
    this.showPlots(false)
    this.selected = tower
    this.showRange(tower.x, tower.y, tower.def)
    const bonus = tower.supportBonus > 0 ? `  (+${Math.round(tower.supportBonus * 100)}% sheltered)` : ''
    this.status.message = `${tower.def.name} — ${tower.def.flavor}${bonus}`
  }

  private clearSelection(): void {
    this.menu.close()
    this.selected = null
    this.restructuring = null
    this.status.mode = 'normal'
    this.status.pendingAbility = null
    this.rangeRing.clear()
    this.targetRing.clear()
    this.showPlots(false)
    this.status.message = 'Click a plot to build. Click the road to rally Cory.'
  }

  private showRange(x: number, y: number, def: TowerDef): void {
    const radius = def.supportRadius > 0 ? def.supportRadius : def.range
    const colour = def.supportRadius > 0 ? 0x8fd07a : 0xf6ecd9
    this.rangeRing.clear()
    if (radius <= 0) return
    this.rangeRing.fillStyle(colour, 0.1).fillCircle(x, y, radius)
    this.rangeRing.lineStyle(2, colour, 0.8).strokeCircle(x, y, radius)
  }

  private updateHover(p: Phaser.Input.Pointer): void {
    if (this.status.mode === 'targeting' && this.status.pendingAbility) {
      const def = ABILITIES[this.status.pendingAbility]
      this.targetRing.clear()
      if (def.radius > 0) {
        this.targetRing.fillStyle(0xff9d5a, 0.16).fillCircle(p.worldX, p.worldY, def.radius)
        this.targetRing.lineStyle(2, 0xff9d5a, 0.9).strokeCircle(p.worldX, p.worldY, def.radius)
      }
      return
    }
    if (this.menu.isOpen) return

    const col = this.grid.colAt(p.worldX)
    const row = this.grid.rowAt(p.worldY)
    const tower = this.towers.find((t) => t.col === col && t.row === row)

    if (tower) {
      this.hoverPlot.setVisible(false)
      if (!this.selected) this.showRange(tower.x, tower.y, tower.def)
      return
    }
    if (!this.selected) this.rangeRing.clear()

    if (this.status.mode === 'restructure') {
      this.hoverPlot
        .setPosition(this.grid.centreX(col), this.grid.centreY(row))
        .setVisible(this.build.isBuildable(col, row))
      return
    }
    this.hoverPlot.setVisible(false)
  }

  private pingRally(x: number, y: number): void {
    const ring = this.add.graphics().setDepth(OVERLAY_DEPTH)
    this.tweens.addCounter({
      from: 0, to: 1, duration: 420,
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0
        ring.clear()
        ring.lineStyle(3, 0x4fa3e3, 1 - t).strokeCircle(x, y, 10 + t * 24)
      },
      onComplete: () => ring.destroy(),
    })
  }

  // ---------------------------------------------------------------- abilities

  armAbility(id: string | undefined): void {
    if (!id || !ABILITIES[id]) return
    if (!this.cooldowns.ready(id)) {
      this.status.message = `${ABILITIES[id].name} is still on cooldown.`
      return
    }
    if (ABILITIES[id].targeting === 'instant') {
      this.fireAbility(id, 0, 0)
      return
    }
    this.menu.close()
    this.status.mode = 'targeting'
    this.status.pendingAbility = id
    this.status.message = `${ABILITIES[id].name}: click where you want it.`
  }

  private fireAbility(id: string, x: number, y: number): void {
    const def = ABILITIES[id]
    if (!def || !this.cooldowns.ready(id)) return
    this.cooldowns.start(id)
    play(this, 'sfx-cast', 0.45)
    castAbility(id, def, x, y, {
      scene: this,
      enemies: () => this.enemies,
      damage: (e, amount, pierce) => this.damageEnemy(e, amount, pierce),
      addGold: (amount) => { this.status.gold += amount },
      summon: (sx, sy, count, seconds) => this.summonFighters(sx, sy, count, seconds),
      overlayDepth: OVERLAY_DEPTH,
    })
    this.status.mode = 'normal'
    this.status.pendingAbility = null
    this.targetRing.clear()
    this.status.message = `${def.name}!`
  }

  private summonFighters(x: number, y: number, count: number, seconds: number): void {
    const h = this.hero.def
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count
      this.fighters.push(new Fighter(
        this,
        x + Math.cos(a) * 26,
        y + Math.sin(a) * 26,
        h.maxHealth * 0.25,
        h.damage * 0.6,
        h.attackRange * 0.8,
        h.attackInterval,
        seconds,
      ))
    }
  }

  castHaymaker(): void {
    const hm = this.hero.def.haymaker
    if (!this.cooldowns.ready('haymaker')) {
      this.status.message = `${hm.name} is still on cooldown.`
      return
    }
    if (this.hero.down) {
      this.status.message = `${this.hero.def.name} is down.`
      return
    }
    const target = pickNearest(this.enemies, this.hero.x, this.hero.y, hm.range)
    if (!target) {
      this.status.message = `${hm.name}: nothing in reach.`
      return
    }
    this.cooldowns.start('haymaker')
    play(this, 'sfx-cast', 0.6)
    this.damageEnemy(target, hm.damage, hm.ignoresArmor)
    target.knockBack(hm.knockbackPixels)
    const s = PRESENTATION.shake
    this.cameras.main.shake(s.haymakerMs, s.haymakerIntensity)
    const punch = this.add.image(target.x, target.y, 'fx-spark').setDepth(target.y + 8).setScale(1.2)
    this.tweens.add({
      targets: punch, scale: 0.2, alpha: 0, angle: 200, duration: 300, onComplete: () => punch.destroy(),
    })
    this.status.message = `${hm.name}!`
  }

  armRestructure(): void {
    if (!this.cooldowns.ready('restructure')) {
      this.status.message = `${this.hero.def.restructure.name} is still on cooldown.`
      return
    }
    if (this.towers.length === 0) {
      this.status.message = 'Nothing to restructure yet.'
      return
    }
    this.menu.close()
    this.status.mode = 'restructure'
    this.restructuring = null
    this.showPlots(true)
    this.status.message = `${this.hero.def.restructure.name}: click a tower, then an empty plot.`
  }

  private doRestructure(col: number, row: number): void {
    const tower = this.towers.find((t) => t.col === col && t.row === row)

    if (!this.restructuring) {
      if (!tower) {
        this.status.message = 'Click one of your towers first.'
        return
      }
      this.restructuring = tower
      this.showRange(tower.x, tower.y, tower.def)
      this.status.message = `Moving ${tower.def.name}. Click an empty plot.`
      return
    }

    if (!this.build.isBuildable(col, row)) {
      this.status.message = 'That plot is not free.'
      return
    }

    const moving = this.restructuring
    this.build.release(moving.col, moving.row)
    this.build.occupy(col, row)
    moving.moveTo(this.grid.centreX(col), this.grid.centreY(row), col, row)
    this.refreshSupport()
    this.cooldowns.start('restructure')
    play(this, 'sfx-build', 0.5)
    this.status.message = `${moving.def.name} restructured. No charge.`
    this.restructuring = null
    this.status.mode = 'normal'
    this.showPlots(false)
    this.rangeRing.clear()
  }

  // ---------------------------------------------------------------- waves

  startWave(): void {
    if (this.status.phase !== 'ready') return
    this.spawner.begin(WAVES.waves[this.status.wave])
    this.status.phase = 'wave'
    this.status.waveName = WAVES.waves[this.status.wave].name
    this.status.message = `Wave ${this.status.wave + 1}: ${this.status.waveName}`
  }

  private checkWaveCleared(): void {
    if (this.status.phase !== 'wave') return
    if (!this.spawner.done || this.enemies.length > 0) return

    this.status.gold += RULES.goldPerWaveCleared
    this.status.wave++
    this.grantTowerUnlocks()

    if (this.status.wave >= WAVES.waves.length) {
      this.endRun('won')
      return
    }
    this.status.phase = 'ready'
    this.status.waveName = WAVES.waves[this.status.wave].name
    this.status.message = `Wave cleared. +${RULES.goldPerWaveCleared} gold.`
  }

  /** A 3rd tower after wave 4 and a 4th after wave 8, drawn from the reserve. */
  private grantTowerUnlocks(): void {
    const run = runState()
    const target = unlockedTowerCount(DRAFT, this.status.wave)
    while (this.status.unlockedTowers.length < target) {
      const next = run.reserveTowers[this.status.unlockedTowers.length - DRAFT.towersAtStart]
      if (!next) break
      this.status.unlockedTowers.push(next)
      this.refreshMenuOptions()
      this.announce(`NEW TOWER: ${TOWERS[next].name.toUpperCase()}`, COLOR.gold)
    }
  }

  private endRun(phase: 'won' | 'lost'): void {
    if (this.status.phase === 'won' || this.status.phase === 'lost') return
    this.status.phase = phase
    this.clearSelection()

    const won = phase === 'won'
    this.status.message = won ? 'Filed on time. Press R for the title screen.' : 'Overrun. Press R for the title screen.'

    this.add.text(displayData.width / 2, displayData.height / 2, won ? 'ALL WAVES CLEARED' : 'OVERRUN', {
      fontFamily: FONT_DISPLAY, fontSize: '64px',
      color: won ? COLOR.ink : COLOR.fire, stroke: '#0d1016', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(OVERLAY_DEPTH + 10)

    this.add.text(displayData.width / 2, displayData.height / 2 + 58, 'Press R for the title screen', {
      fontFamily: FONT_DISPLAY, fontSize: '20px', color: COLOR.ink,
    }).setOrigin(0.5).setDepth(OVERLAY_DEPTH + 10)
  }

  private toTitle(): void {
    this.scene.stop('Hud')
    this.scene.start('Title')
  }

  private announce(text: string, color: string): void {
    const t = this.add.text(displayData.width / 2, 200, text, {
      fontFamily: FONT_DISPLAY, fontSize: '40px', color, stroke: '#0d1016', strokeThickness: 7,
    }).setOrigin(0.5).setDepth(OVERLAY_DEPTH + 20).setScale(0.5)
    this.tweens.add({ targets: t, scale: 1, duration: 240, ease: 'Back.easeOut' })
    this.tweens.add({ targets: t, alpha: 0, delay: 1500, duration: 500, onComplete: () => t.destroy() })
  }

  // ---------------------------------------------------------------- loop

  update(_time: number, delta: number): void {
    // A backgrounded tab hands back a huge delta; cap it so nothing teleports.
    const dt = Math.min(delta / 1000, 0.05)
    if (this.status.phase === 'won' || this.status.phase === 'lost') return

    this.cooldowns.tick(dt)

    if (this.status.phase === 'wave') {
      for (const id of this.spawner.update(dt)) {
        const def = ENEMIES[id]
        if (def) this.enemies.push(new Enemy(this, def, this.lane))
      }
    }

    this.tickEngagement()
    this.tickEnemies(dt)
    for (const t of this.towers) t.tick(dt, this.enemies, (tower, target) => this.fire(tower, target))
    this.shots = this.shots.filter((s) => !s.tick(dt))
    this.fighters = this.fighters.filter(
      (f) => !f.tick(dt, this.enemies, (e, dmg) => this.damageEnemy(e, dmg, false)),
    )
    this.hero.tick(dt, this.enemies, (e, dmg) => this.damageEnemy(e, dmg, this.hero.def.ignoresArmor))

    if (this.selected) this.showRange(this.selected.x, this.selected.y, this.selected.def)

    this.status.heroHealth = this.hero.health
    this.status.heroDown = this.hero.down
    this.status.lastStand = this.hero.lastStandActive
    this.status.enemiesLeft = this.enemies.length + this.spawner.remaining

    this.checkWaveCleared()
  }

  /** The hero and any summoned fighters hold enemies up. Whoever is closest
   *  to the exit gets held first, since they are the real threat. */
  private tickEngagement(): void {
    for (const e of this.enemies) e.blocker = null

    const holders: Array<{ who: Blocker; range: number; capacity: number }> = []
    if (this.hero.alive) {
      holders.push({ who: this.hero, range: this.hero.def.blockRange, capacity: this.hero.def.blockCapacity })
    }
    for (const f of this.fighters) {
      if (f.alive) holders.push({ who: f, range: this.hero.def.blockRange, capacity: 1 })
    }

    for (const h of holders) {
      const near = withinRadius(this.enemies, h.who.x, h.who.y, h.range).filter((e) => e.blocker === null)
      near.sort((a, b) => b.distance - a.distance)
      for (const e of near.slice(0, h.capacity)) e.blocker = h.who
    }
  }

  private tickEnemies(dt: number): void {
    const survivors: Enemy[] = []
    for (const e of this.enemies) {
      if (!e.alive || !e.active) continue
      if (e.tick(dt, (dmg) => this.damageBlocker(e, dmg))) {
        this.leak(e)
        continue
      }
      survivors.push(e)
    }
    this.enemies = survivors
  }

  // ---------------------------------------------------------------- combat

  private fire(tower: Tower, target: Enemy): void {
    this.shots.push(
      new Projectile(this, tower.x, tower.y - 10, tower.def.shot, target, tower.def.projectileSpeed, (hit) => {
        this.impactSpark(hit.x, hit.y)
        if (tower.def.splashRadius > 0) {
          this.blast(hit.x, hit.y, tower.def.splashRadius)
          for (const e of withinRadius(this.enemies, hit.x, hit.y, tower.def.splashRadius)) {
            this.damageEnemy(e, tower.damage, tower.def.ignoresArmor)
            e.applySlow(tower.def.slowFactor, tower.def.slowSeconds)
          }
        } else {
          this.damageEnemy(hit.target, tower.damage, tower.def.ignoresArmor)
          hit.target.applySlow(tower.def.slowFactor, tower.def.slowSeconds)
        }
      }),
    )
  }

  private impactSpark(x: number, y: number): void {
    const spark = this.add.image(x, y, 'fx-spark').setDepth(y + 2).setScale(0.5)
    this.tweens.add({
      targets: spark, scale: 0.95, alpha: 0, angle: 90,
      duration: 200, ease: 'Quad.easeOut', onComplete: () => spark.destroy(),
    })
  }

  private blast(x: number, y: number, radius: number): void {
    const scale = radius / 40
    const flame = this.add.image(x, y, 'fx-flame').setDepth(y + 3).setScale(scale * 0.5)
    this.tweens.add({
      targets: flame, scale, alpha: 0, duration: 280, ease: 'Quad.easeOut',
      onComplete: () => flame.destroy(),
    })
  }

  private damageEnemy(enemy: Enemy, damage: number, ignoresArmor: boolean): void {
    if (!enemy.alive) return
    if (enemy.hurt(damage, ignoresArmor)) this.status.gold += enemy.def.goldReward
  }

  /** Routes an enemy's melee to whatever is actually holding it. */
  private damageBlocker(enemy: Enemy, damage: number): void {
    const target = enemy.blocker
    if (target === this.hero) this.damageHero(damage)
    else if (target) target.hurt(damage)
  }

  private damageHero(damage: number): void {
    const result = this.hero.hurt(damage)
    if (result === 'lastStand') this.announceLastStand()
    if (result === 'down') {
      this.status.message = `${this.hero.def.name} is down. He is out for this encounter.`
      this.cameras.main.shake(240, 0.006)
    }
  }

  private announceLastStand(): void {
    const ls = this.hero.def.lastStand
    const s = PRESENTATION.shake
    this.cameras.main.flash(340, 255, 90, 60)
    this.cameras.main.shake(s.lastStandMs, s.lastStandIntensity)
    play(this, 'sfx-dadmode', 0.85)
    this.announce(ls.name, COLOR.fire)
    this.status.message = `${ls.name}! Damage doubled, defence gone.`
  }

  private leak(enemy: Enemy): void {
    this.status.lives -= enemy.def.livesCost
    floatingDamage(this, enemy.x, enemy.y, enemy.def.livesCost, true)
    enemy.destroy()
    const s = PRESENTATION.shake
    this.cameras.main.shake(s.leakMs, s.leakIntensity)
    play(this, 'sfx-leak', 0.5)
    if (this.status.lives <= 0) {
      this.status.lives = 0
      this.endRun('lost')
    }
  }

  /** Recomputed whenever the tower set changes, rather than every frame. */
  private refreshSupport(): void {
    for (const t of this.towers) {
      if (t.isSupport) continue
      let bonus = 0
      for (const s of this.towers) {
        if (!s.isSupport || s === t) continue
        if (Phaser.Math.Distance.Between(s.x, s.y, t.x, t.y) <= s.def.supportRadius) {
          bonus += s.def.supportDamageBonus
        }
      }
      t.supportBonus = bonus
    }
  }

  /** Exposed for the HUD. */
  abilityDef(id: string): AbilityDef | undefined {
    return ABILITIES[id]
  }

  heroDef(): HeroDef {
    return this.hero.def
  }
}

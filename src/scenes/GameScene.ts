import Phaser from 'phaser'
import type { EnemyDef, HeroDef, MapDef, RulesDef, TowerDef, WavesDef } from '../types.ts'
import displayData from '../data/display.json'
import mapData from '../data/map.json'
import rulesData from '../data/rules.json'
import towersData from '../data/towers.json'
import enemiesData from '../data/enemies.json'
import heroesData from '../data/heroes.json'
import wavesData from '../data/waves.json'

import { Grid } from '../systems/Grid.ts'
import { Path } from '../systems/Path.ts'
import { roadSprite } from '../systems/Autotile.ts'
import { BuildSystem } from '../systems/BuildSystem.ts'
import { WaveSpawner } from '../systems/WaveSpawner.ts'
import { withinRadius } from '../systems/Targeting.ts'
import { GROUND_DEPTH } from '../systems/DepthSort.ts'
import { Enemy } from '../entities/Enemy.ts'
import { Tower } from '../entities/Tower.ts'
import { Hero } from '../entities/Hero.ts'
import { Projectile } from '../entities/Projectile.ts'
import { BuildMenu } from '../ui/BuildMenu.ts'

const MAP = mapData as MapDef
const RULES = rulesData as RulesDef
const TOWERS = towersData as Record<string, TowerDef>
const ENEMIES = enemiesData as Record<string, EnemyDef>
const HEROES = heroesData as Record<string, HeroDef>
const WAVES = wavesData as WavesDef

export type Phase = 'ready' | 'wave' | 'won' | 'lost'

export interface GameStatus {
  gold: number
  lives: number
  wave: number
  waveCount: number
  waveName: string
  phase: Phase
  enemiesLeft: number
  heroName: string
  heroHealth: number
  heroMax: number
  heroDown: boolean
  lastStand: boolean
  message: string
}

const OVERLAY_DEPTH = 150000
const GRASS_KEYS = ['ground-grass', 'ground-grass', 'ground-grass', 'ground-grass',
  'ground-grass', 'ground-grass', 'ground-grass', 'ground-grass',
  'ground-grass-alt', 'ground-grass-alt2']
const ROAD_KEYS = ['road', 'road', 'road', 'road', 'road', 'road',
  'road', 'road', 'road', 'road', 'road-alt', 'road-alt2']

export class GameScene extends Phaser.Scene {
  readonly status: GameStatus = {
    gold: 0, lives: 0, wave: 0, waveCount: WAVES.waves.length, waveName: '',
    phase: 'ready', enemiesLeft: 0,
    heroName: HEROES.cory.name, heroHealth: 0, heroMax: 0,
    heroDown: false, lastStand: false, message: '',
  }

  private grid!: Grid
  private lane!: Path
  private build!: BuildSystem
  private spawner!: WaveSpawner
  private hero!: Hero
  private menu!: BuildMenu

  private enemies: Enemy[] = []
  private towers: Tower[] = []
  private shots: Projectile[] = []

  private hoverPlot!: Phaser.GameObjects.Image
  private rangeRing!: Phaser.GameObjects.Graphics
  private selected: Tower | null = null

  constructor() {
    super('Game')
  }

  create(): void {
    // create() runs again on restart, so every field carrying state from the
    // previous run has to be cleared here, not just declared above.
    this.enemies = []
    this.towers = []
    this.shots = []
    this.selected = null

    this.grid = new Grid(MAP.cols, MAP.rows, displayData.tileSize, MAP.originX, MAP.originY)
    this.lane = new Path(MAP.waypoints, this.grid)
    this.build = new BuildSystem(this.grid)
    this.spawner = new WaveSpawner()

    this.blockScenery()
    this.drawGround()
    this.drawDecorations()

    this.hoverPlot = this.add.image(-999, -999, 'plot-hover').setDepth(GROUND_DEPTH + 5).setVisible(false)
    this.rangeRing = this.add.graphics().setDepth(OVERLAY_DEPTH)

    this.hero = new Hero(
      this,
      this.grid.centreX(MAP.heroStart[0]),
      this.grid.centreY(MAP.heroStart[1]),
      HEROES.cory,
    )

    this.menu = new BuildMenu(this, Object.keys(TOWERS).map((id) => ({ id, def: TOWERS[id] })))

    this.status.gold = RULES.startingGold
    this.status.lives = RULES.startingLives
    this.status.wave = 0
    this.status.phase = 'ready'
    this.status.waveName = WAVES.waves[0].name
    this.status.enemiesLeft = 0
    this.status.heroMax = HEROES.cory.maxHealth
    this.status.heroHealth = HEROES.cory.maxHealth
    this.status.heroDown = false
    this.status.lastStand = false
    this.status.message = 'Tap a green tile to build. Tap open ground to rally Cory.'

    this.setupInput()
  }

  // ---------------------------------------------------------------- setup

  private drawGround(): void {
    const road = new Set(this.lane.roadTiles().map((t) => this.grid.key(t.col, t.row)))
    const isRoad = (c: number, r: number): boolean => road.has(this.grid.key(c, r))

    // Deterministic so the map looks the same every run.
    const rng = new Phaser.Math.RandomDataGenerator(['courjahan'])

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
            this.add.image(x, y, 'plot').setDepth(GROUND_DEPTH + 2).setAlpha(0.35)
          }
        }
      }
    }
  }

  /** Scenery occupies its tile, so it has to be blocked before the ground
   *  layer decides which tiles get a build-plot marker. */
  private blockScenery(): void {
    for (const t of this.lane.roadTiles()) this.build.block(t.col, t.row)
    for (const d of MAP.decorations) this.build.block(d[0] as number, d[1] as number)
  }

  private drawDecorations(): void {
    for (const d of MAP.decorations) {
      const col = d[0] as number
      const row = d[1] as number
      const key = d[2] as string
      if (!this.grid.contains(col, row)) continue
      this.add.image(this.grid.centreX(col), this.grid.centreY(row), key).setDepth(GROUND_DEPTH + 3)
    }
  }

  private setupInput(): void {
    this.input.mouse?.disableContextMenu()

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.updateHover(p))

    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      // Clicks that land on the build menu belong to the menu.
      if (this.menu.isOpen && this.menu.ownsAny(over)) return

      if (p.rightButtonDown()) {
        this.clearSelection()
        return
      }
      if (this.status.phase === 'won' || this.status.phase === 'lost') return

      const col = this.grid.colAt(p.worldX)
      const row = this.grid.rowAt(p.worldY)

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

      // Road or scenery: that is a rally order.
      this.clearSelection()
      this.hero.setRally(p.worldX, p.worldY)
      this.pingRally(p.worldX, p.worldY)
    })

    this.input.keyboard?.on('keydown-ESC', () => this.clearSelection())
    this.input.keyboard?.on('keydown-SPACE', () => this.startWave())
    this.input.keyboard?.on('keydown-R', () => {
      if (this.status.phase === 'won' || this.status.phase === 'lost') this.scene.restart()
    })
  }

  // ---------------------------------------------------------------- build UI

  private openBuildMenu(col: number, row: number): void {
    this.selected = null
    this.menu.open(
      this.grid.centreX(col),
      this.grid.centreY(row),
      col,
      row,
      this.status.gold,
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
    const tower = new Tower(this, this.grid.centreX(col), this.grid.centreY(row), id, def, col, row)
    this.towers.push(tower)
    this.refreshSupport()
    this.menu.close()
    this.rangeRing.clear()
    this.status.message = `${def.name} — ${def.flavor}`
  }

  private selectTower(tower: Tower): void {
    this.menu.close()
    this.selected = tower
    this.showRange(tower.x, tower.y, tower.def)
    const bonus = tower.supportBonus > 0 ? `  (+${Math.round(tower.supportBonus * 100)}% sheltered)` : ''
    this.status.message = `${tower.def.name} — ${tower.def.flavor}${bonus}`
  }

  private clearSelection(): void {
    this.menu.close()
    this.selected = null
    this.rangeRing.clear()
    this.status.message = 'Tap a green tile to build. Tap open ground to rally Cory.'
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

    if (this.build.isBuildable(col, row)) {
      this.hoverPlot.setPosition(this.grid.centreX(col), this.grid.centreY(row)).setVisible(true)
    } else {
      this.hoverPlot.setVisible(false)
    }
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

    if (this.status.wave >= WAVES.waves.length) {
      this.endRun('won')
      return
    }
    this.status.phase = 'ready'
    this.status.waveName = WAVES.waves[this.status.wave].name
    this.status.message = `Wave cleared. +${RULES.goldPerWaveCleared} gold. Build, then start the next one.`
  }

  private endRun(phase: 'won' | 'lost'): void {
    if (this.status.phase === 'won' || this.status.phase === 'lost') return
    this.status.phase = phase
    this.clearSelection()

    const won = phase === 'won'
    this.status.message = won ? 'Filed on time. Press R to run it again.' : 'Overrun. Press R to try again.'

    this.add.text(displayData.width / 2, displayData.height / 2, won ? 'ALL WAVES CLEARED' : 'OVERRUN', {
      fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '64px',
      color: won ? '#f6ecd9' : '#ff6b5a', stroke: '#1a1208', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(OVERLAY_DEPTH + 10)

    this.add.text(displayData.width / 2, displayData.height / 2 + 56, 'Press R to restart', {
      fontFamily: 'monospace', fontSize: '18px', color: '#f6ecd9',
    }).setOrigin(0.5).setDepth(OVERLAY_DEPTH + 10)
  }

  // ---------------------------------------------------------------- loop

  update(_time: number, delta: number): void {
    // A backgrounded tab hands back a huge delta; cap it so nothing teleports.
    const dt = Math.min(delta / 1000, 0.05)
    if (this.status.phase === 'won' || this.status.phase === 'lost') return

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
    this.hero.tick(dt, this.enemies, (e, dmg) => this.damageEnemy(e, dmg, this.hero.def.ignoresArmor))

    if (this.selected) this.showRange(this.selected.x, this.selected.y, this.selected.def)

    this.status.heroHealth = this.hero.health
    this.status.heroDown = this.hero.down
    this.status.lastStand = this.hero.lastStandActive
    this.status.enemiesLeft = this.enemies.length + this.spawner.remaining

    this.checkWaveCleared()
  }

  /** The hero physically holds up to blockCapacity enemies. Whoever is closest
   *  to the exit gets held first, since they are the real threat. */
  private tickEngagement(): void {
    for (const e of this.enemies) e.engaged = false
    if (!this.hero.alive) return
    const near = withinRadius(this.enemies, this.hero.x, this.hero.y, this.hero.def.blockRange)
    near.sort((a, b) => b.distance - a.distance)
    for (const e of near.slice(0, this.hero.def.blockCapacity)) e.engaged = true
  }

  private tickEnemies(dt: number): void {
    const survivors: Enemy[] = []
    for (const e of this.enemies) {
      if (!e.alive || !e.active) continue
      if (e.tick(dt, (dmg) => this.damageHero(dmg))) {
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

  /** Impact sparkle, from the pack's own particle sprites. */
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
      targets: flame, scale: scale, alpha: 0,
      duration: 280, ease: 'Quad.easeOut', onComplete: () => flame.destroy(),
    })
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI * 2 * i) / 4 + Math.random()
      const s = this.add.image(x, y, 'fx-flame-small').setDepth(y + 3).setScale(0.6)
      this.tweens.add({
        targets: s,
        x: x + Math.cos(a) * radius * 0.7,
        y: y + Math.sin(a) * radius * 0.7,
        alpha: 0, scale: 0.2, duration: 320,
        onComplete: () => s.destroy(),
      })
    }
  }

  private damageEnemy(enemy: Enemy, damage: number, ignoresArmor: boolean): void {
    if (!enemy.alive) return
    if (enemy.hurt(damage, ignoresArmor)) this.status.gold += enemy.def.goldReward
  }

  private damageHero(damage: number): void {
    const result = this.hero.hurt(damage)
    if (result === 'lastStand') this.announceLastStand()
    if (result === 'down') {
      this.status.message = `${this.hero.def.name} is down. He is out for this encounter.`
      this.cameras.main.shake(220, 0.006)
    }
  }

  private announceLastStand(): void {
    const ls = this.hero.def.lastStand
    this.cameras.main.flash(320, 255, 90, 60)
    this.cameras.main.shake(300, 0.008)
    this.status.message = `${ls.name}!`

    const text = this.add.text(displayData.width / 2, displayData.height / 2, ls.name, {
      fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '76px',
      color: '#ff5a3c', stroke: '#2a0d08', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(OVERLAY_DEPTH + 20).setScale(0.4)

    this.tweens.add({ targets: text, scale: 1, duration: 260, ease: 'Back.easeOut' })
    this.tweens.add({ targets: text, alpha: 0, delay: 900, duration: 500, onComplete: () => text.destroy() })
  }

  private leak(enemy: Enemy): void {
    this.status.lives -= enemy.def.livesCost
    enemy.destroy()
    this.cameras.main.shake(140, 0.004)
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
}

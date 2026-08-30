import Phaser from 'phaser'
import type { ArtDef, EnemyDef, HeroDef, MapDef, RulesDef, TowerDef, WavesDef } from '../types.ts'
import displayData from '../data/display.json'
import mapData from '../data/map.json'
import rulesData from '../data/rules.json'
import towersData from '../data/towers.json'
import enemiesData from '../data/enemies.json'
import heroesData from '../data/heroes.json'
import wavesData from '../data/waves.json'
import artData from '../data/art.json'

import { Grid } from '../systems/Grid.ts'
import { Path } from '../systems/Path.ts'
import { BuildSystem } from '../systems/BuildSystem.ts'
import { WaveSpawner } from '../systems/WaveSpawner.ts'
import { withinRadius } from '../systems/Targeting.ts'
import { GROUND_DEPTH, GRID_DEPTH } from '../systems/DepthSort.ts'
import { Enemy } from '../entities/Enemy.ts'
import { Tower } from '../entities/Tower.ts'
import { Hero } from '../entities/Hero.ts'
import { Projectile } from '../entities/Projectile.ts'

const MAP = mapData as MapDef
const RULES = rulesData as RulesDef
const TOWERS = towersData as Record<string, TowerDef>
const ENEMIES = enemiesData as Record<string, EnemyDef>
const HEROES = heroesData as Record<string, HeroDef>
const WAVES = wavesData as WavesDef
const ART = artData as ArtDef

export type Phase = 'countdown' | 'wave' | 'won' | 'lost'

export interface GameStatus {
  gold: number
  lives: number
  wave: number
  waveCount: number
  phase: Phase
  countdown: number
  heroName: string
  heroHealth: number
  heroMax: number
  heroDown: boolean
  lastStand: boolean
  selected: string | null
  message: string
}

const GHOST_DEPTH = 100000

export class GameScene extends Phaser.Scene {
  readonly status: GameStatus = {
    gold: 0,
    lives: 0,
    wave: 0,
    waveCount: WAVES.waves.length,
    phase: 'countdown',
    countdown: 0,
    heroName: HEROES.cory.name,
    heroHealth: 0,
    heroMax: 0,
    heroDown: false,
    lastStand: false,
    selected: null,
    message: '',
  }

  private grid!: Grid
  private lane!: Path
  private build!: BuildSystem
  private spawner!: WaveSpawner
  private hero!: Hero

  private enemies: Enemy[] = []
  private towers: Tower[] = []
  private shots: Projectile[] = []

  private ghost?: Phaser.GameObjects.Sprite
  private ghostRange?: Phaser.GameObjects.Graphics

  constructor() {
    super('Game')
  }

  create(): void {
    // create() runs again on restart, so every field carrying state from the
    // previous run has to be cleared here, not just declared above.
    this.enemies = []
    this.towers = []
    this.shots = []
    this.ghost = undefined
    this.ghostRange = undefined

    this.grid = new Grid(MAP.cols, MAP.rows, displayData.tileSize, MAP.originX, MAP.originY)
    this.lane = new Path(MAP.path, this.grid)
    this.build = new BuildSystem(this.grid)
    this.spawner = new WaveSpawner()

    this.drawGround()

    for (const t of this.lane.tiles()) this.build.block(t.col, t.row)

    this.hero = new Hero(
      this,
      this.grid.centreX(MAP.heroStart[0]),
      this.grid.centreY(MAP.heroStart[1]),
      HEROES.cory,
    )

    this.status.gold = RULES.startingGold
    this.status.lives = RULES.startingLives
    this.status.wave = 0
    this.status.phase = 'countdown'
    this.status.countdown = RULES.firstWaveDelay
    this.status.heroMax = HEROES.cory.maxHealth
    this.status.heroHealth = HEROES.cory.maxHealth
    this.status.heroDown = false
    this.status.lastStand = false
    this.status.selected = null
    this.status.message = 'Place a tower, then rally Cory.'

    this.setupInput()
  }

  // ---------------------------------------------------------------- setup

  private drawGround(): void {
    for (let r = 0; r < this.grid.rows; r++) {
      for (let c = 0; c < this.grid.cols; c++) {
        const key = (c + r) % 2 === 0 ? 'tile-grass' : 'tile-grass-alt'
        this.add.image(this.grid.centreX(c), this.grid.centreY(r), key).setDepth(GROUND_DEPTH)
      }
    }

    for (const t of this.lane.tiles()) {
      this.add.image(this.grid.centreX(t.col), this.grid.centreY(t.row), 'tile-path').setDepth(GROUND_DEPTH + 1)
    }

    const lines = this.add.graphics().setDepth(GRID_DEPTH)
    lines.lineStyle(1, 0x000000, 0.08)
    for (let c = 0; c <= this.grid.cols; c++) {
      const x = this.grid.originX + c * this.grid.tileSize
      lines.lineBetween(x, this.grid.originY, x, this.grid.originY + this.grid.heightPx)
    }
    for (let r = 0; r <= this.grid.rows; r++) {
      const y = this.grid.originY + r * this.grid.tileSize
      lines.lineBetween(this.grid.originX, y, this.grid.originX + this.grid.widthPx, y)
    }
  }

  private setupInput(): void {
    this.input.mouse?.disableContextMenu()

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.updateGhost(p))

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) {
        this.selectTower(null)
        return
      }
      if (this.status.phase === 'won' || this.status.phase === 'lost') return

      const col = this.grid.colAt(p.worldX)
      const row = this.grid.rowAt(p.worldY)
      if (!this.grid.contains(col, row)) return

      if (this.status.selected) {
        this.tryPlace(this.status.selected, col, row)
      } else {
        this.hero.setRally(p.worldX, p.worldY)
        this.pingRally(p.worldX, p.worldY)
      }
    })

    this.input.keyboard?.on('keydown-ONE', () => this.selectTower('withholding'))
    this.input.keyboard?.on('keydown-TWO', () => this.selectTower('rounding'))
    this.input.keyboard?.on('keydown-ESC', () => this.selectTower(null))
    this.input.keyboard?.on('keydown-R', () => {
      if (this.status.phase === 'won' || this.status.phase === 'lost') this.scene.restart()
    })
  }

  // ---------------------------------------------------------------- build

  selectTower(id: string | null): void {
    if (id !== null && !TOWERS[id]) return
    this.status.selected = id

    this.ghost?.destroy()
    this.ghostRange?.destroy()
    this.ghost = undefined
    this.ghostRange = undefined

    if (id) {
      const def = TOWERS[id]
      this.ghost = this.add.sprite(-999, -999, def.sprite).setOrigin(0.5, 0.88).setAlpha(0.65).setDepth(GHOST_DEPTH)
      this.ghostRange = this.add.graphics().setDepth(GHOST_DEPTH - 1)
      this.status.message = `${def.name} — ${def.flavor}`
    } else {
      this.status.message = 'Click the ground to rally Cory.'
    }
  }

  private updateGhost(p: Phaser.Input.Pointer): void {
    if (!this.status.selected || !this.ghost || !this.ghostRange) return
    const def = TOWERS[this.status.selected]
    const col = this.grid.colAt(p.worldX)
    const row = this.grid.rowAt(p.worldY)
    const ok = this.build.isBuildable(col, row) && this.status.gold >= def.cost

    const x = this.grid.centreX(col)
    const y = this.grid.centreY(row)
    this.ghost.setPosition(x, y).setTint(ok ? 0xffffff : 0xff6b5a)

    this.ghostRange.clear()
    this.ghostRange.lineStyle(2, ok ? 0xf6ecd9 : 0xff6b5a, 0.7).strokeCircle(x, y, def.range)
    this.ghostRange.fillStyle(ok ? 0xf6ecd9 : 0xff6b5a, 0.08).fillCircle(x, y, def.range)
  }

  private tryPlace(id: string, col: number, row: number): void {
    const def = TOWERS[id]
    if (!this.build.isBuildable(col, row)) {
      this.status.message = 'You cannot build on the road.'
      return
    }
    if (this.status.gold < def.cost) {
      this.status.message = `Not enough gold for ${def.name}.`
      return
    }

    this.status.gold -= def.cost
    this.build.occupy(col, row)
    this.towers.push(new Tower(this, this.grid.centreX(col), this.grid.centreY(row), def, col, row))
    // Keep the tower selected so the player can chain placements, but drop
    // out of build mode once another one is unaffordable.
    if (this.status.gold < def.cost) this.selectTower(null)
    this.status.message = `${def.name} built.`
  }

  private pingRally(x: number, y: number): void {
    const ring = this.add.graphics().setDepth(GHOST_DEPTH)
    ring.lineStyle(3, 0x4fa3e3, 0.9).strokeCircle(x, y, 10)
    this.tweens.add({
      targets: ring,
      alpha: 0,
      duration: 420,
      onUpdate: (tw) => {
        ring.clear()
        ring.lineStyle(3, 0x4fa3e3, 1 - tw.progress).strokeCircle(x, y, 10 + tw.progress * 22)
      },
      onComplete: () => ring.destroy(),
    })
  }

  // ---------------------------------------------------------------- loop

  update(_time: number, delta: number): void {
    // A backgrounded tab hands back a huge delta; cap it so nothing teleports.
    const dt = Math.min(delta / 1000, 0.05)
    if (this.status.phase === 'won' || this.status.phase === 'lost') return

    if (this.status.phase === 'countdown') this.tickCountdown(dt)
    if (this.status.phase === 'wave') this.tickSpawner(dt)

    this.tickEngagement()
    this.tickEnemies(dt)
    this.tickTowers(dt)
    this.tickShots(dt)
    this.hero.tick(dt, this.enemies, (e, dmg) => this.damageEnemy(e, dmg))

    this.status.heroHealth = this.hero.health
    this.status.heroDown = this.hero.down
    this.status.lastStand = this.hero.lastStandActive

    this.checkWaveCleared()
  }

  private tickCountdown(dt: number): void {
    this.status.countdown -= dt
    if (this.status.countdown > 0) return
    this.status.countdown = 0
    this.spawner.begin(WAVES.waves[this.status.wave])
    this.status.phase = 'wave'
    this.status.message = `Wave ${this.status.wave + 1} incoming.`
  }

  private tickSpawner(dt: number): void {
    for (const id of this.spawner.update(dt)) {
      const def = ENEMIES[id]
      if (def) this.enemies.push(new Enemy(this, def, this.lane))
    }
  }

  /** The hero physically holds up to blockCapacity enemies. Whoever is
   *  closest to the exit gets held first, since they are the real threat. */
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
      const leaked = e.tick(dt, (dmg) => this.damageHero(dmg))
      if (leaked) {
        this.leak(e)
        continue
      }
      survivors.push(e)
    }
    this.enemies = survivors
  }

  private tickTowers(dt: number): void {
    for (const t of this.towers) {
      t.tick(dt, this.enemies, (tower, target) => this.fire(tower, target))
    }
  }

  private tickShots(dt: number): void {
    this.shots = this.shots.filter((s) => !s.tick(dt))
  }

  // ---------------------------------------------------------------- combat

  private fire(tower: Tower, target: Enemy): void {
    this.shots.push(
      new Projectile(
        this,
        tower.x,
        tower.y - 40,
        target,
        tower.def.projectileSpeed,
        tower.def.damage,
        tower.def.splashRadius,
        (t, dmg, splash, x, y) => this.applyHit(t, dmg, splash, x, y),
      ),
    )
  }

  private applyHit(target: Enemy, damage: number, splashRadius: number, x: number, y: number): void {
    if (splashRadius <= 0) {
      this.damageEnemy(target, damage)
      return
    }
    this.blast(x, y, splashRadius)
    for (const e of withinRadius(this.enemies, x, y, splashRadius)) this.damageEnemy(e, damage)
  }

  private damageEnemy(enemy: Enemy, damage: number): void {
    if (!enemy.alive) return
    if (enemy.hurt(damage)) {
      this.status.gold += enemy.def.goldReward
    }
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

    const text = this.add
      .text(displayData.width / 2, displayData.height / 2, ls.name, {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: '76px',
        color: '#ff5a3c',
        stroke: '#2a0d08',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(GHOST_DEPTH + 10)
      .setScale(0.4)

    this.tweens.add({ targets: text, scale: 1, duration: 260, ease: 'Back.easeOut' })
    this.tweens.add({ targets: text, alpha: 0, delay: 900, duration: 500, onComplete: () => text.destroy() })
  }

  private blast(x: number, y: number, radius: number): void {
    const g = this.add.graphics().setDepth(y)
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 260,
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0
        g.clear()
        g.fillStyle(0xffd28a, 0.45 * (1 - t)).fillCircle(x, y, radius * (0.35 + t * 0.65))
      },
      onComplete: () => g.destroy(),
    })
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

  // ---------------------------------------------------------------- waves

  private checkWaveCleared(): void {
    if (this.status.phase !== 'wave') return
    if (!this.spawner.done || this.enemies.length > 0) return

    this.status.gold += RULES.goldPerWaveCleared
    this.status.wave++

    if (this.status.wave >= WAVES.waves.length) {
      this.endRun('won')
      return
    }

    this.status.phase = 'countdown'
    this.status.countdown = RULES.timeBetweenWaves
    this.status.message = `Wave cleared. +${RULES.goldPerWaveCleared} gold.`
  }

  private endRun(phase: 'won' | 'lost'): void {
    if (this.status.phase === 'won' || this.status.phase === 'lost') return
    this.status.phase = phase
    this.selectTower(null)

    const won = phase === 'won'
    this.status.message = won ? 'Filed on time. Press R to run it again.' : 'Overrun. Press R to try again.'

    this.add
      .text(displayData.width / 2, displayData.height / 2, won ? 'ALL WAVES CLEARED' : 'OVERRUN', {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: '64px',
        color: won ? '#f6ecd9' : '#ff6b5a',
        stroke: '#1a1208',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(GHOST_DEPTH + 10)

    this.add
      .text(displayData.width / 2, displayData.height / 2 + 56, 'Press R to restart', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#f6ecd9',
      })
      .setOrigin(0.5)
      .setDepth(GHOST_DEPTH + 10)
  }

  /** Exposed for the HUD. */
  towerDefs(): Array<{ id: string; def: TowerDef }> {
    return Object.keys(TOWERS).map((id) => ({ id, def: TOWERS[id] }))
  }

  usingPlaceholderArt(): boolean {
    return !ART.useKenneyPack
  }
}

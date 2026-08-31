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

import { Path } from '../systems/Path.ts'
import { BuildSystem } from '../systems/BuildSystem.ts'
import type { BuildSpot } from '../systems/BuildSystem.ts'
import { WaveSpawner } from '../systems/WaveSpawner.ts'
import { withinRadius, pickNearest } from '../systems/Targeting.ts'
import { GROUND_DEPTH } from '../systems/DepthSort.ts'
import { ART } from '../systems/Art.ts'
import { Cooldowns } from '../systems/Cooldowns.ts'
import { unlockedTowerCount } from '../systems/Draft.ts'
import { runState } from '../systems/RunState.ts'
import { castAbility } from '../systems/AbilityRunner.ts'
import { PRESENTATION, floatingDamage } from '../systems/Presentation.ts'
import { play } from '../systems/Sfx.ts'
import { Enemy } from '../entities/Enemy.ts'
import type { Blocker } from '../entities/Enemy.ts'
import { Tower } from '../entities/Tower.ts'
import { Hero } from '../entities/Hero.ts'
import { Fighter } from '../entities/Fighter.ts'
import { Projectile } from '../entities/Projectile.ts'
import { BuildMenu } from '../ui/BuildMenu.ts'
import { ScratchCard } from '../ui/ScratchCard.ts'
import { COLOR, FONT_DISPLAY, FONT_UI } from '../ui/Theme.ts'

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
  peanuts: number
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
  /** The rare drop, once it has dropped. Null before, and again after use. */
  rareAbility: string | null
  pendingAbility: string | null
  message: string
}

const OVERLAY_DEPTH = 150000
/** Above everything the world draws, including announcements. */
const TICKET_DEPTH = 190000
/** Ground markings are ellipses, not circles: the map is painted in 3/4. */
const PAD_SQUASH = 0.62

export class GameScene extends Phaser.Scene {
  readonly status: GameStatus = {
    peanuts: 0, lives: 0, wave: 0, waveCount: WAVES.waves.length, waveName: '',
    phase: 'ready', mode: 'normal', enemiesLeft: 0,
    heroName: '', heroHealth: 0, heroMax: 0, heroDown: false, lastStand: false,
    unlockedTowers: [], abilities: [], rareAbility: null, pendingAbility: null, message: '',
  }

  readonly cooldowns = new Cooldowns()

  private lane!: Path
  private build!: BuildSystem
  private spawner!: WaveSpawner
  private hero!: Hero
  private menu!: BuildMenu

  private enemies: Enemy[] = []
  private towers: Tower[] = []
  private shots: Projectile[] = []
  private fighters: Fighter[] = []

  private spotLayer!: Phaser.GameObjects.Graphics
  private markerLayer!: Phaser.GameObjects.Graphics
  private hoverSpot: BuildSpot | null = null
  private heroSelected = false
  private rangeRing!: Phaser.GameObjects.Graphics
  private targetRing!: Phaser.GameObjects.Graphics
  private selected: Tower | null = null
  private restructuring: Tower | null = null
  private ticket: ScratchCard | null = null
  /** One Server Nuke per run, dropped or not. */
  private nukeUsed = false
  private casting = false

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
    this.hoverSpot = null
    this.selected = null
    this.restructuring = null
    this.heroSelected = false
    this.ticket?.destroy()
    this.ticket = null

    const run = runState()
    const heroDef = HEROES[run.heroId] ?? HEROES.cory

    this.lane = new Path(MAP.waypoints)
    this.build = new BuildSystem(MAP.buildSpots, MAP.spotRadius)
    this.spawner = new WaveSpawner()

    this.drawPlate()

    this.spotLayer = this.add.graphics().setDepth(GROUND_DEPTH + 5)
    this.markerLayer = this.add.graphics().setDepth(GROUND_DEPTH + 6)
    this.rangeRing = this.add.graphics().setDepth(OVERLAY_DEPTH)
    this.targetRing = this.add.graphics().setDepth(OVERLAY_DEPTH + 1)

    this.hero = new Hero(this, MAP.heroStart[0], MAP.heroStart[1], heroDef)

    this.status.peanuts = RULES.startingPeanuts
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
    // The rare drop does not survive a run, and is never drafted into one.
    this.status.rareAbility = null
    this.nukeUsed = false
    this.status.unlockedTowers = run.openingTowers.slice(0, DRAFT.towersAtStart)
    this.status.message = 'Click a glowing pad to build a tower, then START WAVE.'

    for (const id of this.status.abilities) this.cooldowns.register(id, ABILITIES[id].cooldown)
    this.cooldowns.register(RULES.serverNuke.abilityId, ABILITIES[RULES.serverNuke.abilityId].cooldown)
    this.cooldowns.register('haymaker', heroDef.haymaker.cooldown)
    this.cooldowns.register('restructure', heroDef.restructure.cooldown)

    this.menu = new BuildMenu(this, [])
    this.refreshMenuOptions()
    this.setupInput()
    this.drawSpots()
  }

  // ---------------------------------------------------------------- setup

  /**
   * The map is one painted plate rather than tiles. It is 16:9 like the
   * canvas, so it scales to fill with no letterboxing and canvas pixels are
   * the map's own coordinate space.
   */
  private drawPlate(): void {
    const plate = this.add.image(0, 0, ART.map[MAP.plate]).setOrigin(0, 0).setDepth(GROUND_DEPTH)
    plate.setDisplaySize(displayData.width, displayData.height)
  }

  private get placing(): boolean {
    return this.menu.isOpen || this.status.mode === 'restructure'
  }

  /**
   * Every free building pad, always visible.
   *
   * A player cannot choose where to build if finding a spot means tapping the
   * map at random, so the pads are part of the map's furniture rather than a
   * mode. They brighten while placing and brighter still under the cursor.
   * Pads are drawn as flat ellipses because the map is painted in 3/4: a true
   * circle reads as a floating disc rather than a patch of ground.
   */
  private drawSpots(): void {
    this.spotLayer.clear()
    const r = MAP.spotRadius
    const placing = this.placing
    for (const spot of this.build.freeSpots()) {
      const hot = this.hoverSpot?.index === spot.index
      const fill = hot ? 0.34 : placing ? 0.22 : 0.14
      const edge = hot ? 1 : placing ? 0.8 : 0.5
      const colour = hot ? 0x8fd07a : 0xf6ecd9

      this.spotLayer.fillStyle(colour, fill)
      this.spotLayer.fillEllipse(spot.x, spot.y, r * 2, r * 2 * PAD_SQUASH)
      this.spotLayer.lineStyle(hot ? 3 : 2, colour, edge)
      this.spotLayer.strokeEllipse(spot.x, spot.y, r * 2, r * 2 * PAD_SQUASH)

      // A small cross marks the pad as a place to put something, so it does
      // not read as scenery when nothing is being placed.
      const t = r * 0.3
      this.spotLayer.lineStyle(2, colour, edge * 0.8)
      this.spotLayer.lineBetween(spot.x - t, spot.y, spot.x + t, spot.y)
      this.spotLayer.lineBetween(spot.x, spot.y - t * PAD_SQUASH, spot.x, spot.y + t * PAD_SQUASH)
    }
  }

  /**
   * The hero's selection ring and his rally marker.
   *
   * Redrawn every frame because he walks. The marker stays after he arrives:
   * it is the standing order, not a travel animation.
   */
  private drawHeroMarkers(): void {
    this.markerLayer.clear()
    if (this.status.phase === 'won' || this.status.phase === 'lost') return
    if (this.hero.down) return

    const r = this.hero.rally
    const walking = !this.hero.atRally
    const a = walking ? 1 : 0.55
    const w = 40
    this.markerLayer.fillStyle(0x4fa3e3, walking ? 0.28 : 0.14)
    this.markerLayer.fillEllipse(r.x, r.y, w, w * PAD_SQUASH)
    this.markerLayer.lineStyle(3, 0x4fa3e3, a)
    this.markerLayer.strokeEllipse(r.x, r.y, w, w * PAD_SQUASH)
    // A flag, so the marker reads as an order and not as another build pad.
    this.markerLayer.lineStyle(3, 0x4fa3e3, a)
    this.markerLayer.lineBetween(r.x, r.y - 4, r.x, r.y - 40)
    this.markerLayer.fillStyle(0x4fa3e3, a)
    this.markerLayer.fillTriangle(r.x + 1, r.y - 40, r.x + 22, r.y - 34, r.x + 1, r.y - 28)

    if (this.heroSelected) {
      // Deliberately not the rally marker's shape or colour: that is a blue
      // flag planted on the ground, this is a green bracket around him. Sized
      // from his own art so it fits the SUV as well as the man.
      const w = this.hero.halfFootprint * 2 + 16
      const h = w * PAD_SQUASH
      const y = this.hero.y + this.hero.footOffsetY
      this.markerLayer.fillStyle(0x8fd07a, 0.16)
      this.markerLayer.fillEllipse(this.hero.x, y, w, h)
      this.markerLayer.lineStyle(3, 0x8fd07a, 0.95)
      this.markerLayer.strokeEllipse(this.hero.x, y, w, h)
      // Corner ticks, which a plain ring does not have.
      const hx = w / 2
      const hy = h / 2
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          this.markerLayer.lineBetween(this.hero.x + sx * hx, y + sy * hy * 0.55,
            this.hero.x + sx * hx, y + sy * hy)
          this.markerLayer.lineBetween(this.hero.x + sx * hx * 0.6, y + sy * hy,
            this.hero.x + sx * hx, y + sy * hy)
        }
      }
    }
  }

  private refreshMenuOptions(): void {
    this.menu.setOptions(this.status.unlockedTowers.map((id) => ({ id, def: TOWERS[id] })))
  }

  private setupInput(): void {
    this.input.mouse?.disableContextMenu()
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.updateHover(p))
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (this.menu.isOpen && this.menu.ownsAny(over)) return
      // The ticket takes its own drags; the world must not also act on them.
      if (this.ticket?.active && this.ticket.owns(over)) return
      this.onClick(p)
    })
    this.input.keyboard?.on('keydown-ESC', () => this.clearSelection())
    this.input.keyboard?.on('keydown-SPACE', () => this.startWave())
    this.input.keyboard?.on('keydown-Q', () => this.armAbility(this.status.abilities[0]))
    this.input.keyboard?.on('keydown-W', () => this.armAbility(this.status.abilities[1]))
    // The rare drop gets its own key, since it arrives after the hand is dealt.
    this.input.keyboard?.on('keydown-F', () => this.armAbility(this.status.rareAbility ?? undefined))
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

    if (this.status.mode === 'targeting' && this.status.pendingAbility) {
      this.fireAbility(this.status.pendingAbility, p.worldX, p.worldY)
      return
    }

    if (this.status.mode === 'restructure') {
      this.doRestructure(p.worldX, p.worldY)
      return
    }

    // Precedence, most specific target first. A building pad is a deliberate
    // target: it must never lose a tap to the ground underneath it, and it
    // takes the tap even when a menu is already open, so a click on the next
    // pad moves the menu there rather than being spent dismissing it.
    const spot = this.build.spotAt(p.worldX, p.worldY)
    if (spot && this.build.isFree(spot.index)) {
      this.openBuildMenu(spot)
      return
    }

    if (this.menu.isOpen) {
      this.clearSelection()
      return
    }

    const tower = this.towerAt(p.worldX, p.worldY)
    if (tower) {
      this.selectTower(tower)
      return
    }

    if (this.hero.hits(p.worldX, p.worldY)) {
      this.selectHero()
      return
    }

    // Bare ground. It is only an order when the hero is actually selected,
    // so a misjudged tap cannot walk him off his post.
    if (this.heroSelected) {
      this.orderHero(p.worldX, p.worldY)
      return
    }
    this.clearSelection()
  }

  private selectHero(): void {
    if (this.hero.down) {
      this.status.message = `${this.hero.def.name} is down for this encounter.`
      return
    }
    this.menu.close()
    this.selected = null
    this.heroSelected = true
    this.showRange(this.hero.x, this.hero.y, this.hero.attackRange, 0x4fa3e3)
    this.status.message = `${this.hero.def.name} selected — click where he should hold.`
  }

  private orderHero(x: number, y: number): void {
    this.hero.setRally(x, y)
    this.pingRally(x, y)
    this.heroSelected = false
    this.rangeRing.clear()
    this.status.message = `${this.hero.def.name} is moving up.`
  }

  // ---------------------------------------------------------------- build UI

  /** The topmost tower under a point, so overlapping art picks the front one. */
  private towerAt(x: number, y: number): Tower | undefined {
    let best: Tower | undefined
    for (const t of this.towers) {
      if (!t.hits(x, y)) continue
      if (!best || t.y > best.y) best = t
    }
    return best
  }

  private openBuildMenu(spot: BuildSpot): void {
    this.selected = null
    this.menu.open(
      spot.x, spot.y, this.status.peanuts,
      (id) => this.place(id, spot),
      (id) => {
        if (id) this.showTowerRange(spot.x, spot.y, TOWERS[id])
        else this.rangeRing.clear()
      },
    )
    this.drawSpots()
    this.status.message = 'Pick a tower, or click away to cancel.'
  }

  private place(id: string, spot: BuildSpot): void {
    const def = TOWERS[id]
    if (!this.build.isFree(spot.index)) return
    if (this.status.peanuts < def.cost) {
      // Silence here reads as a broken button, so say what is missing.
      this.status.message = `${def.name} costs ${def.cost} peanuts — ${def.cost - this.status.peanuts} short.`
      play(this, 'sfx-leak', 0.25)
      return
    }

    this.status.peanuts -= def.cost
    this.build.occupy(spot.index)
    this.towers.push(new Tower(this, spot.x, spot.y, id, def, spot.index))
    this.refreshSupport()
    play(this, 'sfx-build', 0.5)
    this.menu.close()
    this.rangeRing.clear()
    this.drawSpots()
    this.status.message = `${def.name} — ${def.flavor}`
  }

  private selectTower(tower: Tower): void {
    this.menu.close()
    this.drawSpots()
    this.selected = tower
    this.showTowerRange(tower.x, tower.y, tower.def)
    const bonus = tower.supportBonus > 0 ? `  (+${Math.round(tower.supportBonus * 100)}% sheltered)` : ''
    this.status.message = `${tower.def.name} — ${tower.def.flavor}${bonus}`
  }

  private clearSelection(): void {
    this.menu.close()
    this.selected = null
    this.restructuring = null
    this.heroSelected = false
    this.status.mode = 'normal'
    this.status.pendingAbility = null
    this.rangeRing.clear()
    this.targetRing.clear()
    this.drawSpots()
    this.status.message = this.idleHint()
  }

  private showTowerRange(x: number, y: number, def: TowerDef): void {
    const support = def.supportRadius > 0
    this.showRange(x, y, support ? def.supportRadius : def.range, support ? 0x8fd07a : 0xf6ecd9)
  }

  private showRange(x: number, y: number, radius: number, colour: number): void {
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

    const tower = this.towerAt(p.worldX, p.worldY)
    if (tower) {
      if (this.hoverSpot) { this.hoverSpot = null; this.drawSpots() }
      if (!this.selected) this.showTowerRange(tower.x, tower.y, tower.def)
      return
    }
    if (!this.selected) this.rangeRing.clear()

    const spot = this.build.spotAt(p.worldX, p.worldY)
    const next = spot && this.build.isFree(spot.index) ? spot : null
    if (next?.index !== this.hoverSpot?.index) {
      this.hoverSpot = next
      this.drawSpots()
    }
  }

  /** The one line of guidance shown when nothing more specific is happening. */
  private idleHint(): string {
    if (this.hero.down && this.status.phase === 'ready') {
      return `${this.hero.def.name} is out for this encounter. The towers are on their own.`
    }
    if (this.build.freeSpots().length === 0) {
      return 'Every pad is built. Press R to restructure, or START WAVE.'
    }
    if (this.status.phase === 'ready') {
      return this.towers.length === 0
        ? 'Click a glowing pad to build a tower, then START WAVE.'
        : 'Build on another pad, move Cory, or START WAVE when you are ready.'
    }
    return 'Click a pad to build. Click Cory to move him.'
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
    if (this.casting) return
    if (id === RULES.serverNuke.abilityId && this.status.rareAbility !== id) return
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
    if (id === RULES.serverNuke.abilityId) {
      // Spent the moment it is cast, so a long wind-up cannot be used twice.
      this.nukeUsed = true
      this.status.rareAbility = null
    }
    this.cooldowns.start(id)
    play(this, 'sfx-cast', 0.45)
    castAbility(id, def, x, y, {
      scene: this,
      enemies: () => this.enemies,
      damage: (e, amount, pierce) => this.damageEnemy(e, amount, pierce),
      addPeanuts: (amount) => { this.status.peanuts += amount },
      summon: (sx, sy, count, seconds) => this.summonFighters(sx, sy, count, seconds),
      scratchTicket: (payout, seconds) => this.showTicket(payout, seconds),
      windUp: (seconds, fire) => this.windUp(seconds, fire),
      nuke: RULES.serverNuke,
      overlayDepth: OVERLAY_DEPTH,
    })
    this.status.mode = 'normal'
    this.status.pendingAbility = null
    this.targetRing.clear()
    this.status.message = `${def.name}!`
  }

  /**
   * The long cast. A couple of seconds of gathering light and rising noise
   * before anything happens, because the player should watch this one land
   * rather than see the board empty between frames.
   */
  private windUp(seconds: number, fire: () => void): void {
    this.casting = true
    const W = displayData.width
    const H = displayData.height
    const cam = this.cameras.main

    const wash = this.add.graphics().setDepth(TICKET_DEPTH)
    const label = this.add.text(W / 2, 150, 'SERVER NUKE', {
      fontFamily: FONT_DISPLAY, fontSize: '38px', color: '#8fd0ff',
      stroke: '#0d1016', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(TICKET_DEPTH + 1).setAlpha(0)

    this.tweens.add({ targets: label, alpha: 1, duration: 400 })
    this.tweens.addCounter({
      from: 0, to: 1, duration: seconds * 1000,
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0
        wash.clear()
        wash.fillStyle(0x8fd0ff, 0.06 + t * 0.5).fillRect(0, 0, W, H)
        // A ring closing on the map, so the wind-up has somewhere to arrive.
        wash.lineStyle(4 + t * 10, 0xffffff, t)
        wash.strokeCircle(W / 2, H / 2, (1 - t) * W * 0.8 + 40)
        cam.shake(60, 0.002 + t * 0.006)
      },
      onComplete: () => {
        cam.flash(700, 255, 255, 255)
        cam.shake(520, 0.016)
        play(this, 'sfx-dadmode', 1)
        fire()
        wash.clear()
        this.tweens.add({
          targets: label, alpha: 0, delay: 400, duration: 400,
          onComplete: () => { label.destroy(); wash.destroy() },
        })
        this.casting = false
      },
    })
  }

  /** The ticket sits over the board and never pauses it. */
  private showTicket(payout: number, autoRevealSeconds: number): void {
    this.ticket?.destroy()
    this.ticket = new ScratchCard(this, displayData.width / 2, displayData.height / 2, TICKET_DEPTH, {
      payout,
      autoRevealSeconds,
      onCollect: (amount) => {
        this.status.peanuts += amount
        this.status.message = `Scratch Ticket: ${amount} peanuts.`
        play(this, 'sfx-cast', 0.5)
      },
    })
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
        h.fighterSprite,
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
    const punch = this.add.image(target.x, target.centreY, ART.fx.spark).setDepth(target.y + 8).setScale(1.2)
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
    this.drawSpots()
    this.status.message = `${this.hero.def.restructure.name}: click a tower, then a free spot.`
  }

  private doRestructure(x: number, y: number): void {
    if (!this.restructuring) {
      const tower = this.towerAt(x, y)
      if (!tower) {
        this.status.message = 'Click one of your towers first.'
        return
      }
      this.restructuring = tower
      this.showTowerRange(tower.x, tower.y, tower.def)
      this.status.message = `Moving ${tower.def.name}. Click a free spot.`
      return
    }

    const spot = this.build.spotAt(x, y)
    if (!spot || !this.build.isFree(spot.index)) {
      this.status.message = 'That spot is not free.'
      return
    }

    const moving = this.restructuring
    this.build.release(moving.spot)
    this.build.occupy(spot.index)
    moving.relocate(spot.x, spot.y, spot.index)
    this.refreshSupport()
    this.cooldowns.start('restructure')
    play(this, 'sfx-build', 0.5)
    this.status.message = `${moving.def.name} restructured. No charge.`
    this.restructuring = null
    this.status.mode = 'normal'
    this.drawSpots()
    this.rangeRing.clear()
  }

  // ---------------------------------------------------------------- waves

  startWave(): void {
    if (this.status.phase !== 'ready') return
    this.clearSelection()
    this.spawner.begin(WAVES.waves[this.status.wave])
    this.status.phase = 'wave'
    this.status.waveName = WAVES.waves[this.status.wave].name
    this.status.message = `Wave ${this.status.wave + 1}: ${this.status.waveName}`
  }

  private checkWaveCleared(): void {
    if (this.status.phase !== 'wave') return
    if (!this.spawner.done || this.enemies.length > 0) return

    this.status.peanuts += RULES.peanutsPerWaveCleared
    this.status.wave++
    this.grantTowerUnlocks()

    if (this.status.wave >= WAVES.waves.length) {
      this.endRun('won')
      return
    }
    this.status.phase = 'ready'
    this.status.waveName = WAVES.waves[this.status.wave].name
    this.announce('WAVE CLEARED', COLOR.good)
    this.status.message =
      `Wave cleared, +${RULES.peanutsPerWaveCleared} peanuts. Build or reposition, then START WAVE ${this.status.wave + 1}.`
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
      this.announce(`NEW TOWER: ${TOWERS[next].name.toUpperCase()}`, COLOR.amber)
    }
  }

  private endRun(phase: 'won' | 'lost'): void {
    if (this.status.phase === 'won' || this.status.phase === 'lost') return
    this.status.phase = phase
    this.clearSelection()
    this.markerLayer.clear()
    this.spotLayer.clear()

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

    if (this.selected) this.showTowerRange(this.selected.x, this.selected.y, this.selected.def)
    else if (this.heroSelected) {
      this.showRange(this.hero.x, this.hero.y, this.hero.attackRange, 0x4fa3e3)
    }
    this.drawHeroMarkers()

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
      holders.push({ who: this.hero, range: this.hero.blockRange, capacity: this.hero.def.blockCapacity })
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
    const m = tower.muzzle(tower.aimAt(target.x, target.centreY))
    this.shots.push(
      new Projectile(this, m.x, m.y, tower.def.shot, target, tower.def.projectileSpeed, (hit) => {
        this.impactSpark(hit.x, hit.target.centreY)
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
    const spark = this.add.image(x, y, ART.fx.spark).setDepth(y + 2).setScale(0.5)
    this.tweens.add({
      targets: spark, scale: 0.95, alpha: 0, angle: 90,
      duration: 200, ease: 'Quad.easeOut', onComplete: () => spark.destroy(),
    })
  }

  private blast(x: number, y: number, radius: number): void {
    const scale = radius / 40
    const flame = this.add.image(x, y, ART.fx.blast).setDepth(y + 3).setScale(scale * 0.5)
    this.tweens.add({
      targets: flame, scale, alpha: 0, duration: 280, ease: 'Quad.easeOut',
      onComplete: () => flame.destroy(),
    })
  }

  private damageEnemy(enemy: Enemy, damage: number, ignoresArmor: boolean): void {
    if (!enemy.alive) return
    if (enemy.hurt(damage, ignoresArmor)) {
      this.status.peanuts += enemy.def.peanutReward
      this.rollRareDrop(enemy)
    }
  }

  /**
   * Server Nuke drops off elites and bosses only, and only once a run. The
   * roll happens on the kill so the drop is felt as a reward for the fight
   * that just happened rather than as a wave-clear payout.
   */
  private rollRareDrop(enemy: Enemy): void {
    const cfg = RULES.serverNuke
    if (this.nukeUsed || this.status.rareAbility !== null) return
    if (!cfg.dropFromTiers.includes(enemy.def.tier)) return
    if (Math.random() >= cfg.dropChance) return

    this.status.rareAbility = cfg.abilityId
    this.cooldowns.reset(cfg.abilityId)
    this.announceRareDrop(ABILITIES[cfg.abilityId].name)
  }

  private announceRareDrop(name: string): void {
    const cam = this.cameras.main
    cam.flash(520, 180, 255, 220)
    cam.shake(360, 0.009)
    play(this, 'sfx-dadmode', 0.9)

    const W = displayData.width
    const y = displayData.height / 2 - 90
    const banner = this.add.graphics().setDepth(TICKET_DEPTH)
    banner.fillStyle(0x0d1016, 0.9).fillRect(0, y - 34, W, 88)
    banner.lineStyle(3, 0x8fd0ff, 1).lineBetween(0, y - 34, W, y - 34)
    banner.lineStyle(3, 0x8fd0ff, 1).lineBetween(0, y + 54, W, y + 54)

    const title = this.add.text(W / 2, y - 22, name.toUpperCase(), {
      fontFamily: FONT_DISPLAY, fontSize: '46px', color: '#8fd0ff',
      stroke: '#0d1016', strokeThickness: 8,
    }).setOrigin(0.5, 0).setDepth(TICKET_DEPTH + 1)
    const sub = this.add.text(W / 2, y + 28, 'RARE DROP — ONE USE', {
      fontFamily: FONT_UI, fontSize: '15px', color: COLOR.ink,
    }).setOrigin(0.5, 0).setDepth(TICKET_DEPTH + 1)

    for (const o of [banner, title, sub]) {
      this.tweens.add({ targets: o, alpha: 0, delay: 2100, duration: 600, onComplete: () => o.destroy() })
    }
    this.tweens.add({ targets: title, scale: { from: 0.6, to: 1 }, duration: 320, ease: 'Back.easeOut' })
    this.status.message = `${name} recovered. One use, then it is gone.`
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
    floatingDamage(this, enemy.x, enemy.centreY, enemy.def.livesCost, true)
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

  /** The un-greyed icon key for a slot, ability or hero active alike. */
  abilityIcon(id: string): string | undefined {
    if (ABILITIES[id]) return ABILITIES[id].icon
    if (id === 'haymaker') return this.hero.def.haymaker.icon
    if (id === 'restructure') return this.hero.def.restructure.icon
    return undefined
  }

  heroDef(): HeroDef {
    return this.hero.def
  }
}

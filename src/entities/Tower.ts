import Phaser from 'phaser'
import type { TowerDef } from '../types.ts'
import { ySort } from '../systems/DepthSort.ts'
import { pickFirst } from '../systems/Targeting.ts'
import { boostedDamage } from '../systems/Combat.ts'
import { makeShadow, muzzleFlash, PRESENTATION } from '../systems/Presentation.ts'
import { ART, applyRender } from '../systems/Art.ts'
import { BASE_TIER, isMaxed, nextStep, statAt } from '../systems/Upgrades.ts'
import rulesData from '../data/rules.json'
import type { RulesDef } from '../types.ts'
import { Enemy } from './Enemy.ts'

const UPGRADES = (rulesData as RulesDef).towerUpgrades

export class Tower extends Phaser.GameObjects.Container {
  readonly def: TowerDef
  readonly id: string
  /** Which build spot it stands on, so Restructure can free the old one. */
  spot: number
  /** Summed bonus from Tax Shelters in range, refreshed when towers change. */
  supportBonus = 0
  /** 1 when built. Tiers 2 and 3 are bought and take time to raise. */
  tier = BASE_TIER

  private readonly turret: Phaser.GameObjects.Sprite
  private readonly shadow: Phaser.GameObjects.Image
  private cooldown = 0
  /** Seconds left on the tier currently going up, or 0 when it is finished. */
  private buildLeft = 0
  private buildTotal = 0
  private scaffold?: Phaser.GameObjects.Graphics

  constructor(scene: Phaser.Scene, x: number, y: number, id: string, def: TowerDef, spot: number) {
    super(scene, x, y)
    this.id = id
    this.def = def
    this.spot = spot

    // The base plate is optional: art that carries its own base sets
    // ui.towerBase to null in the manifest and this drops out.
    this.shadow = makeShadow(scene, def.sprite)
    const parts: Phaser.GameObjects.GameObject[] = [this.shadow]
    if (ART.ui.towerBase !== null) {
      const base = scene.add.sprite(0, 0, ART.ui.towerBase)
      applyRender(base, ART.ui.towerBase)
      parts.push(base)
    }
    this.turret = scene.add.sprite(0, 0, def.sprite)
    // Anchor and on-screen height come from the manifest, so a 512px tower and
    // a 64px turret both sit on the tile at the size the manifest asks for.
    applyRender(this.turret, def.sprite)
    parts.push(this.turret)
    this.add(parts)
    scene.add.existing(this)
    ySort(this)
    this.popIn()
  }

  /**
   * Whether a click lands on this tower.
   *
   * Measured against the drawn sprite rather than a radius around the base:
   * a tower stands about 115px tall, so a base-sized hit area misses most of
   * what the player is actually aiming at.
   */
  hits(x: number, y: number): boolean {
    const halfW = this.turret.displayWidth / 2
    const top = this.y - this.turret.displayHeight
    return x >= this.x - halfW && x <= this.x + halfW && y >= top && y <= this.y + 8
  }

  get isSupport(): boolean {
    return this.def.supportRadius > 0
  }

  /** Every stat below is the base value scaled by the tiers actually paid for.
   *  Consumers read these, never `def`, or an upgraded tower would keep firing
   *  with its tier 1 numbers. */
  get damage(): number {
    return boostedDamage(statAt(this.def, this.tier, 'damage'), this.supportBonus)
  }

  get range(): number {
    return statAt(this.def, this.tier, 'range')
  }

  /** Slower while a tier is going up: that is the cost of upgrading mid-wave. */
  get fireInterval(): number {
    const base = statAt(this.def, this.tier, 'fireInterval')
    return this.upgrading ? base / UPGRADES.buildFireRate : base
  }

  get splashRadius(): number {
    return statAt(this.def, this.tier, 'splashRadius')
  }

  get slowSeconds(): number {
    return statAt(this.def, this.tier, 'slowSeconds')
  }

  get supportRadius(): number {
    return statAt(this.def, this.tier, 'supportRadius')
  }

  get supportDamageBonus(): number {
    return statAt(this.def, this.tier, 'supportDamageBonus')
  }

  get upgrading(): boolean {
    return this.buildLeft > 0
  }

  get maxed(): boolean {
    return isMaxed(this.def, this.tier)
  }

  /** 0 to 1 through the tier currently going up. */
  get buildProgress(): number {
    return this.buildTotal > 0 ? 1 - this.buildLeft / this.buildTotal : 1
  }

  /**
   * Starts a tier. The tier number goes up when the work *finishes*, so a
   * tower under construction keeps its old stats and its reduced rate rather
   * than getting the new ones for free while it builds.
   */
  beginUpgrade(): void {
    const step = nextStep(this.def, this.tier)
    if (!step || this.upgrading) return
    this.buildTotal = step.buildSeconds
    this.buildLeft = step.buildSeconds
    this.drawScaffold()
  }

  /** Tier 1 places instantly (buildTime is 0); the pop is feedback, not a timer. */
  popIn(): void {
    this.setScale(0.55)
    this.scene.tweens.add({ targets: this, scale: 1, duration: 200, ease: 'Back.easeOut' })
  }

  /** Restructure moves a built tower without rebuilding it. */
  relocate(x: number, y: number, spot: number): void {
    this.spot = spot
    this.setPosition(x, y)
    ySort(this)
    this.popIn()
  }

  tick(dt: number, enemies: Enemy[], fire: (tower: Tower, target: Enemy) => void): void {
    this.tickBuild(dt)
    if (this.isSupport) return

    this.cooldown -= dt
    if (this.cooldown > 0) return

    const target = pickFirst(enemies, this.x, this.y, this.range)
    if (!target) return

    this.cooldown = this.fireInterval
    // A painted tower is a building, not a swivelling turret: rotating it lays
    // it on its side. Aim reads from the muzzle flash and the recoil instead.
    const dir = Math.atan2(target.y - this.y, target.x - this.x)
    fire(this, target)

    const m = this.muzzle(dir)
    muzzleFlash(this.scene, m.x, m.y, dir)

    // Recoil is flattened vertically for the same reason the shadows are: the
    // map is painted in 3/4, so a pixel north is further away than it is up.
    const recoil = PRESENTATION.towerRecoilPixels
    this.scene.tweens.add({
      targets: this.turret,
      x: -Math.cos(dir) * recoil,
      y: -Math.sin(dir) * recoil * 0.5,
      duration: PRESENTATION.towerRecoilMs,
      yoyo: true,
      ease: 'Quad.easeOut',
    })
  }

  private tickBuild(dt: number): void {
    if (this.buildLeft <= 0) return
    this.buildLeft -= dt
    if (this.buildLeft > 0) {
      this.drawScaffold()
      return
    }
    this.buildLeft = 0
    this.tier++
    this.scaffold?.destroy()
    this.scaffold = undefined
    this.popIn()
  }

  /** A bar over the tower while it is being raised, so the player can see what
   *  the reduced fire rate is buying and how much longer it lasts. */
  private drawScaffold(): void {
    if (!this.scaffold) {
      this.scaffold = this.scene.add.graphics()
      this.add(this.scaffold)
    }
    const w = 44
    const y = -this.turret.displayHeight - 12
    this.scaffold.clear()
    this.scaffold.fillStyle(0x14181f, 0.9).fillRect(-w / 2 - 1, y - 1, w + 2, 7)
    this.scaffold.fillStyle(0xf2d06b, 1).fillRect(-w / 2, y, w * this.buildProgress, 5)
  }

  /** Where a shot leaves this tower: up near its top, angled at the target. */
  muzzle(dir: number): { x: number; y: number } {
    const cfg = PRESENTATION.muzzle
    const top = -this.turret.displayHeight * cfg.heightFraction
    return {
      x: this.x + Math.cos(dir) * cfg.reachPixels,
      y: this.y + top + Math.sin(dir) * cfg.reachPixels * 0.5,
    }
  }

  /** Direction from this tower's own muzzle to a point. */
  aimAt(x: number, y: number): number {
    return Math.atan2(y - this.y, x - this.x)
  }
}

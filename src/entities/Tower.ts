import Phaser from 'phaser'
import type { TowerDef } from '../types.ts'
import { ySort } from '../systems/DepthSort.ts'
import { pickFirst } from '../systems/Targeting.ts'
import { boostedDamage } from '../systems/Combat.ts'
import { makeShadow, muzzleFlash, PRESENTATION } from '../systems/Presentation.ts'
import { ART, applyRender } from '../systems/Art.ts'
import { Enemy } from './Enemy.ts'

export class Tower extends Phaser.GameObjects.Container {
  readonly def: TowerDef
  readonly id: string
  /** Which build spot it stands on, so Restructure can free the old one. */
  spot: number
  /** Summed bonus from Tax Shelters in range, refreshed when towers change. */
  supportBonus = 0

  private readonly turret: Phaser.GameObjects.Sprite
  private readonly shadow: Phaser.GameObjects.Image
  private cooldown = 0

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

  get damage(): number {
    return boostedDamage(this.def.damage, this.supportBonus)
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
    if (this.isSupport) return

    this.cooldown -= dt
    if (this.cooldown > 0) return

    const target = pickFirst(enemies, this.x, this.y, this.def.range)
    if (!target) return

    this.cooldown = this.def.fireInterval
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

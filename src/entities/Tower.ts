import Phaser from 'phaser'
import type { TowerDef } from '../types.ts'
import { ySort } from '../systems/DepthSort.ts'
import { pickFirst } from '../systems/Targeting.ts'
import { boostedDamage } from '../systems/Combat.ts'
import { makeShadow, muzzleFlash, PRESENTATION } from '../systems/Presentation.ts'
import { ART } from '../systems/Art.ts'
import { Enemy } from './Enemy.ts'

export class Tower extends Phaser.GameObjects.Container {
  readonly def: TowerDef
  readonly id: string
  col: number
  row: number
  /** Summed bonus from Tax Shelters in range, refreshed when towers change. */
  supportBonus = 0

  private readonly turret: Phaser.GameObjects.Sprite
  private readonly shadow: Phaser.GameObjects.Sprite
  private cooldown = 0

  constructor(scene: Phaser.Scene, x: number, y: number, id: string, def: TowerDef, col: number, row: number) {
    super(scene, x, y)
    this.id = id
    this.def = def
    this.col = col
    this.row = row

    this.shadow = makeShadow(scene, ART.ui.towerBase)
    const base = scene.add.sprite(0, 0, ART.ui.towerBase)
    this.turret = scene.add.sprite(0, -4, def.sprite)
    this.add([this.shadow, base, this.turret])
    scene.add.existing(this)
    ySort(this)
    this.popIn()
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
  relocate(x: number, y: number, col: number, row: number): void {
    this.col = col
    this.row = row
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
    // Turret sprites in the pack point north.
    const angle = Math.atan2(target.y - this.y, target.x - this.x) + Math.PI / 2
    this.turret.setRotation(angle)
    fire(this, target)

    const recoil = PRESENTATION.towerRecoilPixels
    muzzleFlash(
      this.scene,
      this.x + Math.cos(angle - Math.PI / 2) * 22,
      this.y + Math.sin(angle - Math.PI / 2) * 22,
      angle,
    )
    this.scene.tweens.add({
      targets: this.turret,
      x: -Math.cos(angle - Math.PI / 2) * recoil,
      y: -4 - Math.sin(angle - Math.PI / 2) * recoil,
      duration: PRESENTATION.towerRecoilMs,
      yoyo: true,
      ease: 'Quad.easeOut',
    })
  }
}

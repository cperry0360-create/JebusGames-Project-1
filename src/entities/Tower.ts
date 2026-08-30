import Phaser from 'phaser'
import type { TowerDef } from '../types.ts'
import { ySort } from '../systems/DepthSort.ts'
import { pickFirst } from '../systems/Targeting.ts'
import { boostedDamage } from '../systems/Combat.ts'
import { Enemy } from './Enemy.ts'

export class Tower extends Phaser.GameObjects.Container {
  readonly def: TowerDef
  readonly id: string
  readonly col: number
  readonly row: number
  /** Summed bonus from Tax Shelters in range, refreshed when towers change. */
  supportBonus = 0

  private readonly turret: Phaser.GameObjects.Sprite
  private cooldown = 0

  constructor(scene: Phaser.Scene, x: number, y: number, id: string, def: TowerDef, col: number, row: number) {
    super(scene, x, y)
    this.id = id
    this.def = def
    this.col = col
    this.row = row

    const base = scene.add.sprite(0, 0, 'tower-base')
    this.turret = scene.add.sprite(0, -4, def.sprite)
    this.add([base, this.turret])
    scene.add.existing(this)
    ySort(this)

    // Tier 1 places instantly (buildTime is 0 in the data); the pop is
    // feedback, not a build timer.
    this.setScale(0.55)
    scene.tweens.add({ targets: this, scale: 1, duration: 200, ease: 'Back.easeOut' })
  }

  get isSupport(): boolean {
    return this.def.supportRadius > 0
  }

  get damage(): number {
    return boostedDamage(this.def.damage, this.supportBonus)
  }

  tick(dt: number, enemies: Enemy[], fire: (tower: Tower, target: Enemy) => void): void {
    if (this.isSupport) return

    this.cooldown -= dt
    if (this.cooldown > 0) return

    const target = pickFirst(enemies, this.x, this.y, this.def.range)
    if (!target) return

    this.cooldown = this.def.fireInterval
    // Turret sprites in the pack point north.
    this.turret.setRotation(Math.atan2(target.y - this.y, target.x - this.x) + Math.PI / 2)
    fire(this, target)
    this.scene.tweens.add({ targets: this.turret, scaleY: 0.86, duration: 70, yoyo: true })
  }
}

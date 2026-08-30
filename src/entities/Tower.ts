import Phaser from 'phaser'
import type { TowerDef } from '../types.ts'
import { ySort } from '../systems/DepthSort.ts'
import { pickFirst } from '../systems/Targeting.ts'
import { Enemy } from './Enemy.ts'

export class Tower extends Phaser.GameObjects.Container {
  readonly def: TowerDef
  readonly col: number
  readonly row: number

  private readonly art: Phaser.GameObjects.Sprite
  private cooldown = 0

  constructor(scene: Phaser.Scene, x: number, y: number, def: TowerDef, col: number, row: number) {
    super(scene, x, y)
    this.def = def
    this.col = col
    this.row = row

    this.art = scene.add.sprite(0, 0, def.sprite).setOrigin(0.5, 0.88)
    this.add(this.art)
    scene.add.existing(this)
    ySort(this)

    // Tier 1 places instantly (buildTime is 0 in the data); the pop is just
    // feedback, not a build timer.
    this.art.setScale(0.6)
    scene.tweens.add({ targets: this.art, scale: 1, duration: 180, ease: 'Back.easeOut' })
  }

  tick(dt: number, enemies: Enemy[], fire: (tower: Tower, target: Enemy) => void): void {
    this.cooldown -= dt
    if (this.cooldown > 0) return

    const target = pickFirst(enemies, this.x, this.y, this.def.range)
    if (!target) return

    this.cooldown = this.def.fireInterval
    this.art.flipX = target.x < this.x
    fire(this, target)

    this.scene.tweens.add({
      targets: this.art,
      scaleY: 0.9,
      duration: 70,
      yoyo: true,
    })
  }
}

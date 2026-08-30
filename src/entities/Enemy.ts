import Phaser from 'phaser'
import type { EnemyDef } from '../types.ts'
import { Path } from '../systems/Path.ts'
import { ySort } from '../systems/DepthSort.ts'

export type EnemyState = 'walking' | 'fighting' | 'dead'

export class Enemy extends Phaser.GameObjects.Container {
  readonly def: EnemyDef
  readonly maxHealth: number
  health: number
  /** Distance walked along the lane. Doubles as "how close to the exit". */
  distance = 0
  status: EnemyState = 'walking'
  /** Set each frame by the scene when the hero is holding this enemy. */
  engaged = false

  private readonly lane: Path
  private readonly art: Phaser.GameObjects.Sprite
  private readonly bar: Phaser.GameObjects.Graphics
  private attackTimer = 0

  constructor(scene: Phaser.Scene, def: EnemyDef, lane: Path) {
    super(scene, 0, 0)
    this.def = def
    this.lane = lane
    this.maxHealth = def.maxHealth
    this.health = def.maxHealth

    this.art = scene.add.sprite(0, 0, def.sprite).setOrigin(0.5, 0.9)
    this.bar = scene.add.graphics()
    this.add([this.art, this.bar])

    const p = lane.pointAt(0)
    this.setPosition(p.x, p.y)
    scene.add.existing(this)
    this.drawBar()
  }

  get alive(): boolean {
    return this.status !== 'dead'
  }

  /** Returns true once the enemy has walked off the far end of the lane. */
  tick(dt: number, onAttackHero: (damage: number) => void): boolean {
    if (this.status === 'dead') return false

    if (this.engaged) {
      this.status = 'fighting'
      this.attackTimer -= dt
      if (this.attackTimer <= 0) {
        this.attackTimer = this.def.attackInterval
        onAttackHero(this.def.damage)
        this.scene.tweens.add({
          targets: this.art,
          scaleX: 1.15,
          scaleY: 0.9,
          duration: 90,
          yoyo: true,
        })
      }
    } else {
      this.status = 'walking'
      this.attackTimer = 0
      this.distance += this.def.speed * dt
      const p = this.lane.pointAt(this.distance)
      this.art.flipX = p.x < this.x
      this.setPosition(p.x, p.y)
      if (this.distance >= this.lane.totalLength) return true
    }

    ySort(this)
    return false
  }

  /** Returns true if this hit killed it. */
  hurt(amount: number): boolean {
    if (this.status === 'dead') return false
    this.health -= amount
    this.drawBar()
    this.scene.tweens.add({ targets: this.art, alpha: 0.5, duration: 60, yoyo: true })
    if (this.health <= 0) {
      this.die()
      return true
    }
    return false
  }

  /** Falls over, spins, and gives up. */
  die(): void {
    if (this.status === 'dead') return
    this.status = 'dead'
    this.bar.setVisible(false)
    this.scene.tweens.add({
      targets: this,
      angle: Phaser.Math.Between(-180, 180),
      scale: 0.2,
      alpha: 0,
      duration: 320,
      ease: 'Quad.easeIn',
      onComplete: () => this.destroy(),
    })
  }

  private drawBar(): void {
    const w = 30
    const ratio = Phaser.Math.Clamp(this.health / this.maxHealth, 0, 1)
    this.bar.clear()
    if (ratio >= 1) return
    this.bar.fillStyle(0x1a1a1a, 0.85).fillRect(-w / 2 - 1, -50, w + 2, 6)
    this.bar.fillStyle(ratio > 0.4 ? 0x66c24a : 0xc9563a, 1).fillRect(-w / 2, -49, w * ratio, 4)
  }
}

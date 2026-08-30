import Phaser from 'phaser'
import { ySort, ABOVE } from '../systems/DepthSort.ts'
import { Enemy } from './Enemy.ts'

/** A shot in flight. It homes, because a Phase 1 tower that misses because of
 *  ballistics teaches the player nothing about whether the loop is fun. */
export class Projectile extends Phaser.GameObjects.Sprite {
  private readonly target: Enemy
  private readonly speed: number
  private readonly damage: number
  private readonly splashRadius: number
  private readonly onHit: (target: Enemy, damage: number, splashRadius: number, x: number, y: number) => void
  private spent = false

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    target: Enemy,
    speed: number,
    damage: number,
    splashRadius: number,
    onHit: (target: Enemy, damage: number, splashRadius: number, x: number, y: number) => void,
  ) {
    super(scene, x, y, 'projectile')
    this.target = target
    this.speed = speed
    this.damage = damage
    this.splashRadius = splashRadius
    this.onHit = onHit
    scene.add.existing(this)
    ySort(this, ABOVE)
  }

  /** Returns true when it has hit, missed, or lost its target. */
  tick(dt: number): boolean {
    if (this.spent) return true

    // Target died mid-flight: the shot is simply wasted.
    if (!this.target.active || !this.target.alive) {
      this.finish()
      return true
    }

    const dx = this.target.x - this.x
    const dy = this.target.y - 14 - this.y
    const dist = Math.hypot(dx, dy)
    const step = this.speed * dt

    if (dist <= step || dist === 0) {
      this.onHit(this.target, this.damage, this.splashRadius, this.target.x, this.target.y)
      this.finish()
      return true
    }

    this.x += (dx / dist) * step
    this.y += (dy / dist) * step
    ySort(this, ABOVE)
    return false
  }

  private finish(): void {
    this.spent = true
    this.destroy()
  }
}

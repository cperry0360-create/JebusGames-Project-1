import Phaser from 'phaser'
import { ySort, ABOVE } from '../systems/DepthSort.ts'
import { applyRender } from '../systems/Art.ts'
import { Enemy } from './Enemy.ts'

export interface HitPayload {
  target: Enemy
  x: number
  y: number
}

/** A shot in flight. It homes, because a Phase 1 tower that misses because of
 *  ballistics teaches nothing about whether the loop is fun. */
export class Projectile extends Phaser.GameObjects.Sprite {
  private readonly target: Enemy
  private readonly speed: number
  private readonly onHit: (hit: HitPayload) => void
  private spent = false

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    spriteKey: string,
    target: Enemy,
    speed: number,
    onHit: (hit: HitPayload) => void,
  ) {
    super(scene, x, y, spriteKey)
    // Anchor and on-screen size from the manifest, like every other sprite in
    // the game. The projectiles were the only art drawn 1:1 in world space —
    // which was survivable while they were all 64px pack tiles and is not once
    // one of them is a 200px painted rocket.
    applyRender(this, spriteKey)
    this.target = target
    this.speed = speed
    this.onHit = onHit
    scene.add.existing(this)
    ySort(this, ABOVE)
  }

  /** Returns true when it has hit, or lost its target. */
  tick(dt: number): boolean {
    if (this.spent) return true

    if (!this.target.alive) {
      this.finish()
      return true
    }

    // Aim at the body, not the feet: gameplay still resolves at ground level,
    // but a shot that dives into a 66px brute's boots reads as a miss.
    const dx = this.target.x - this.x
    const dy = this.target.centreY - this.y
    const dist = Math.hypot(dx, dy)
    const step = this.speed * dt

    if (dist <= step || dist === 0) {
      this.onHit({ target: this.target, x: this.target.x, y: this.target.y })
      this.finish()
      return true
    }

    this.x += (dx / dist) * step
    this.y += (dy / dist) * step
    // Rocket sprites in the pack point north, so offset by a quarter turn.
    this.setRotation(Math.atan2(dy, dx) + Math.PI / 2)
    ySort(this, ABOVE)
    return false
  }

  private finish(): void {
    this.spent = true
    this.destroy()
  }
}

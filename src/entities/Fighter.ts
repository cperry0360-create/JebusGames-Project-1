import Phaser from 'phaser'
import { ySort } from '../systems/DepthSort.ts'
import { makeShadow, deathPuff, floatingDamage } from '../systems/Presentation.ts'
import { pickNearest } from '../systems/Targeting.ts'
import { Enemy } from './Enemy.ts'

/** A temp summoned by Two Fighters. Blocks and swings until its timer runs
 *  out or it is killed. Deliberately dumber than the hero: no rally point. */
export class Fighter extends Phaser.GameObjects.Container {
  health: number
  private readonly art: Phaser.GameObjects.Sprite
  private readonly damage: number
  private readonly range: number
  private readonly interval: number
  private life: number
  private attackTimer = 0

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    health: number,
    damage: number,
    range: number,
    interval: number,
    lifeSeconds: number,
    spriteKey: string,
  ) {
    super(scene, x, y)
    this.health = health
    this.damage = damage
    this.range = range
    this.interval = interval
    this.life = lifeSeconds

    this.art = scene.add.sprite(0, 0, spriteKey).setScale(0.9)
    this.add([makeShadow(scene, spriteKey, 0.9), this.art])
    scene.add.existing(this)
    ySort(this)
    this.setScale(0.2)
    scene.tweens.add({ targets: this, scale: 1, duration: 220, ease: 'Back.easeOut' })
  }

  get alive(): boolean {
    return this.active && this.health > 0 && this.life > 0
  }

  hurt(amount: number): void {
    this.health -= amount
    floatingDamage(this.scene, this.x, this.y, amount)
    if (this.health <= 0) this.expire()
  }

  /** Returns true when it should be dropped from the scene's list. */
  tick(dt: number, enemies: Enemy[], onHit: (enemy: Enemy, damage: number) => void): boolean {
    if (!this.alive) return true
    this.life -= dt
    if (this.life <= 0) {
      this.expire()
      return true
    }

    const target = pickNearest(enemies, this.x, this.y, this.range)
    if (target) {
      this.art.setRotation(Math.atan2(target.y - this.y, target.x - this.x))
      this.attackTimer -= dt
      if (this.attackTimer <= 0) {
        this.attackTimer = this.interval
        onHit(target, this.damage)
        this.scene.tweens.add({ targets: this.art, scaleX: 1.25, duration: 80, yoyo: true })
      }
    }
    ySort(this)
    return false
  }

  private expire(): void {
    if (!this.active) return
    deathPuff(this.scene, this.x, this.y, 0x9fd0ff)
    this.destroy()
  }

}

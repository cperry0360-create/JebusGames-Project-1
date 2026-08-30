import Phaser from 'phaser'
import type { HeroDef } from '../types.ts'
import { ySort } from '../systems/DepthSort.ts'
import { pickNearest, withinRadius } from '../systems/Targeting.ts'
import { attackInterval, incomingDamage, outgoingDamage, shouldTrigger } from '../systems/LastStand.ts'
import { Enemy } from './Enemy.ts'

/**
 * Cory. Rally-point control, not free movement: tap a spot, he walks there and
 * fights whatever arrives.
 *
 * Two design rules are load-bearing here and both come from DESIGN.md:
 *   - Last Stand fires once at 25% health, and cannot re-arm inside an encounter.
 *   - When he goes down he stays down for the rest of the encounter.
 * Together they make every hero death a climax rather than a respawn timer.
 */
export class Hero extends Phaser.GameObjects.Container {
  readonly def: HeroDef
  health: number
  down = false
  lastStandActive = false

  private readonly art: Phaser.GameObjects.Sprite
  private readonly bar: Phaser.GameObjects.Graphics
  private rallyX: number
  private rallyY: number
  private attackTimer = 0
  private lastStandUsed = false

  constructor(scene: Phaser.Scene, x: number, y: number, def: HeroDef) {
    super(scene, x, y)
    this.def = def
    this.health = def.maxHealth
    this.rallyX = x
    this.rallyY = y

    this.art = scene.add.sprite(0, 0, def.sprite).setOrigin(0.5, 0.9).setScale(1.15)
    this.bar = scene.add.graphics()
    this.add([this.art, this.bar])
    scene.add.existing(this)
    this.drawBar()
    ySort(this)
  }

  get alive(): boolean {
    return !this.down
  }

  get damage(): number {
    return outgoingDamage(this.def.damage, this.def.lastStand, this.lastStandActive)
  }

  get attackInterval(): number {
    return attackInterval(this.def.attackInterval, this.def.lastStand, this.lastStandActive)
  }

  setRally(x: number, y: number): void {
    if (this.down) return
    this.rallyX = x
    this.rallyY = y
  }

  tick(dt: number, enemies: Enemy[], onHit: (enemy: Enemy, damage: number) => void): void {
    if (this.down) return

    const target = pickNearest(enemies, this.x, this.y, this.def.attackRange)

    // Standing and fighting beats walking: he only moves when nothing is on him.
    if (!target) {
      const dx = this.rallyX - this.x
      const dy = this.rallyY - this.y
      const dist = Math.hypot(dx, dy)
      const step = this.def.moveSpeed * dt
      if (dist > step) {
        this.x += (dx / dist) * step
        this.y += (dy / dist) * step
        this.art.flipX = dx < 0
      } else if (dist > 0) {
        this.setPosition(this.rallyX, this.rallyY)
      }
    } else {
      this.attackTimer -= dt
      if (this.attackTimer <= 0) {
        this.attackTimer = this.attackInterval
        this.art.flipX = target.x < this.x
        // DAD MODE swings wildly at everything in range rather than picking
        // a target, which is the whole point of losing precision.
        const victims = this.def.lastStand.hitsAllInRange && this.lastStandActive
          ? withinRadius(enemies, this.x, this.y, this.def.attackRange)
          : [target]
        for (const v of victims) onHit(v, this.damage)
        this.scene.tweens.add({
          targets: this.art,
          scaleX: 1.35,
          duration: 80,
          yoyo: true,
        })
      }
    }

    ySort(this)
  }

  /** Returns 'lastStand' or 'down' when this hit changed his state. */
  hurt(amount: number): 'none' | 'lastStand' | 'down' {
    if (this.down) return 'none'

    this.health -= incomingDamage(amount, this.def.lastStand, this.lastStandActive)
    this.drawBar()

    if (this.health <= 0) {
      this.health = 0
      this.goDown()
      return 'down'
    }

    if (shouldTrigger(this.health, this.def.maxHealth, this.def.lastStand, this.lastStandUsed)) {
      this.triggerLastStand()
      return 'lastStand'
    }

    return 'none'
  }

  private triggerLastStand(): void {
    this.lastStandUsed = true
    this.lastStandActive = true
    this.art.setTint(0xff5a3c)
    this.scene.tweens.add({
      targets: this.art,
      scale: 1.55,
      duration: 260,
      ease: 'Back.easeOut',
    })
    this.drawBar()
  }

  private goDown(): void {
    this.down = true
    this.lastStandActive = false
    this.bar.setVisible(false)
    this.scene.tweens.add({
      targets: this.art,
      angle: 90,
      alpha: 0.35,
      duration: 400,
      ease: 'Quad.easeIn',
    })
  }

  private drawBar(): void {
    const w = 44
    const ratio = Phaser.Math.Clamp(this.health / this.def.maxHealth, 0, 1)
    this.bar.clear()
    this.bar.fillStyle(0x1a1a1a, 0.85).fillRect(-w / 2 - 1, -62, w + 2, 7)
    this.bar.fillStyle(this.lastStandActive ? 0xff5a3c : 0x4fa3e3, 1).fillRect(-w / 2, -61, w * ratio, 5)
  }
}

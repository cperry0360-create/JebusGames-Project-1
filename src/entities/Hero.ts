import Phaser from 'phaser'
import type { HeroDef } from '../types.ts'
import { ySort } from '../systems/DepthSort.ts'
import { pickNearest, withinRadius } from '../systems/Targeting.ts'
import { attackInterval, incomingDamage, outgoingDamage, shouldTrigger } from '../systems/LastStand.ts'
import { makeShadow, deathPuff } from '../systems/Presentation.ts'
import { Enemy } from './Enemy.ts'

/**
 * Cory. Rally-point control, not free movement: tap a spot, he walks there and
 * fights whatever arrives.
 *
 * Three design rules are load-bearing here and all come from DESIGN.md:
 *   - Last Stand fires once at 25% health, and cannot re-arm inside an encounter.
 *   - When he goes down he stays down for the rest of the encounter: `down`
 *     gates movement, attacking and further damage, with no respawn timer.
 *   - He returns at full health at the next encounter. That is why this class
 *     holds no cross-encounter state and the scene builds a fresh Hero in
 *     create(); healing is the absence of carry-over, not a heal step.
 * Together they make every hero death a climax rather than a respawn timer.
 */
export class Hero extends Phaser.GameObjects.Container {
  readonly def: HeroDef
  health: number
  down = false
  lastStandActive = false

  private readonly body_: Phaser.GameObjects.Sprite
  private readonly gun: Phaser.GameObjects.Sprite
  private readonly shadow: Phaser.GameObjects.Image
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

    this.shadow = makeShadow(scene, def.bodySprite)
    this.body_ = scene.add.sprite(0, 0, def.bodySprite)
    this.gun = scene.add.sprite(0, -2, def.gunSprite)
    this.bar = scene.add.graphics()
    this.add([this.shadow, this.body_, this.gun, this.bar])
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

  /** Where he has been told to hold. The scene draws a marker here. */
  get rally(): { x: number; y: number } {
    return { x: this.rallyX, y: this.rallyY }
  }

  /** True once he has walked to his rally point and stopped. */
  get atRally(): boolean {
    return Math.hypot(this.rallyX - this.x, this.rallyY - this.y) < 2
  }

  /** How big a tap counts as a tap on him. */
  get pickRadius(): number {
    return 30
  }

  /** How far below his origin his feet are, for ground markings. His art is
   *  centre-anchored, unlike the towers and enemies. */
  get footOffsetY(): number {
    return this.body_.displayHeight / 2
  }

  hits(x: number, y: number): boolean {
    return Math.hypot(this.x - x, this.y - y) <= this.pickRadius
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
        this.faceTowards(this.rallyX, this.rallyY)
      } else if (dist > 0) {
        this.setPosition(this.rallyX, this.rallyY)
      }
    } else {
      this.faceTowards(target.x, target.y)
      this.attackTimer -= dt
      if (this.attackTimer <= 0) {
        this.attackTimer = this.attackInterval
        // DAD MODE swings wildly at everything in range rather than picking a
        // target, which is the whole point of losing precision.
        const victims = this.lastStandActive && this.def.lastStand.hitsAllInRange
          ? withinRadius(enemies, this.x, this.y, this.def.attackRange)
          : [target]
        for (const v of victims) onHit(v, this.damage)
        this.scene.tweens.add({ targets: this.gun, scaleX: 1.3, duration: 80, yoyo: true })
      }
    }

    // Depreciation: anything standing near Cory quietly loses its armour.
    const p = this.def.passive
    for (const e of withinRadius(enemies, this.x, this.y, p.armorShredRadius)) {
      e.shredArmor(p.armorShredPerSecond * dt, p.maxArmorShred)
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

  private faceTowards(x: number, y: number): void {
    // The pack's gun sprite points east.
    this.gun.setRotation(Math.atan2(y - this.y, x - this.x))
  }

  private triggerLastStand(): void {
    this.lastStandUsed = true
    this.lastStandActive = true
    this.body_.setTint(0xff5a3c)
    this.gun.setTint(0xffb03a)
    // Visible transformation: he gets bigger and stays that way.
    this.scene.tweens.add({ targets: this, scale: 1.4, duration: 280, ease: 'Back.easeOut' })
    this.scene.tweens.add({
      targets: this.body_, angle: { from: -12, to: 12 }, duration: 140, yoyo: true, repeat: 3,
      onComplete: () => this.body_.setAngle(0),
    })
    this.drawBar()
  }

  private goDown(): void {
    this.down = true
    this.lastStandActive = false
    this.bar.setVisible(false)
    this.shadow.setVisible(false)
    deathPuff(this.scene, this.x, this.y, 0xff8f7a)
    this.scene.tweens.add({ targets: this, angle: 90, alpha: 0.35, duration: 400, ease: 'Quad.easeIn' })
  }

  private drawBar(): void {
    const w = 46
    const y = -34
    const ratio = Phaser.Math.Clamp(this.health / this.def.maxHealth, 0, 1)
    this.bar.clear()
    this.bar.fillStyle(0x14181f, 0.9).fillRect(-w / 2 - 1, y - 1, w + 2, 7)
    this.bar.fillStyle(this.lastStandActive ? 0xff5a3c : 0x4fa3e3, 1).fillRect(-w / 2, y, w * ratio, 5)
    // The 25% mark, so the Last Stand threshold is legible before it fires.
    const markX = -w / 2 + w * this.def.lastStand.healthThreshold
    this.bar.lineStyle(1, 0xf6ecd9, 0.7).lineBetween(markX, y, markX, y + 5)
  }
}

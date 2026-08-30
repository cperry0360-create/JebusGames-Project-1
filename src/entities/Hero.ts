import Phaser from 'phaser'
import type { HeroDef } from '../types.ts'
import { ySort } from '../systems/DepthSort.ts'
import { pickNearest, withinRadius } from '../systems/Targeting.ts'
import { attackInterval, incomingDamage, outgoingDamage, shouldTrigger } from '../systems/LastStand.ts'
import { makeShadow, deathPuff } from '../systems/Presentation.ts'
import { applyGroundRender } from '../systems/Art.ts'
import { facesLeft } from '../systems/Facing.ts'
import presentationData from '../data/presentation.json'
import { Enemy } from './Enemy.ts'

const PRESENTATION = presentationData

/**
 * Cory. Rally-point control, not free movement: select him, tap a spot, he
 * walks there and fights whatever arrives.
 *
 * He has two forms. On foot he is a man with a rolled-up newspaper; at 25%
 * health he gets into an armoured SUV, which is wider than the road and does
 * not care about it. Both are drawn facing LEFT, which is the opposite of the
 * enemy art, so his facing rule is inverted rather than shared.
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
  private shadow: Phaser.GameObjects.Image
  private readonly bar: Phaser.GameObjects.Graphics
  private rallyX: number
  private rallyY: number
  private attackTimer = 0
  private lastStandUsed = false
  /** Offset that puts the art's feet (or wheels) on his position; negated on
   *  a flip, exactly as the enemies do it. */
  private artOffset = 0
  private facingRight = false
  /** Set while the transformation plays, so he neither moves nor fights. */
  private transforming = false
  /** Enemies currently under the vehicle, so one pass is one hit each. */
  private readonly rammed = new Set<Enemy>()

  constructor(scene: Phaser.Scene, x: number, y: number, def: HeroDef) {
    super(scene, x, y)
    this.def = def
    this.health = def.maxHealth
    this.rallyX = x
    this.rallyY = y

    this.shadow = makeShadow(scene, def.bodySprite)
    this.body_ = scene.add.sprite(0, 0, def.bodySprite)
    this.artOffset = applyGroundRender(this.body_, def.bodySprite)
    this.bar = scene.add.graphics()
    this.add([this.shadow, this.body_, this.bar])
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

  /** In the SUV his reach, his hold and his speed all grow. */
  get attackRange(): number {
    return this.def.attackRange * (this.lastStandActive ? this.def.lastStand.attackRangeMultiplier : 1)
  }

  get blockRange(): number {
    return this.def.blockRange * (this.lastStandActive ? this.def.lastStand.blockRangeMultiplier : 1)
  }

  get moveSpeed(): number {
    return this.def.moveSpeed * (this.lastStandActive ? this.def.lastStand.moveSpeedMultiplier : 1)
  }

  /** True once he is driving rather than walking. */
  get inVehicle(): boolean {
    return this.lastStandActive && !this.transforming
  }

  /** Half the drawn footprint. The vehicle is wider than a person, so the
   *  hitbox and the ram both measure from the art rather than a constant. */
  get halfFootprint(): number {
    return this.body_.displayWidth / 2
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

  /** His art is base-anchored like the towers and enemies now, so ground
   *  markings sit on his position rather than below it. */
  get footOffsetY(): number {
    return 0
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
    if (this.down || this.transforming) return

    const target = pickNearest(enemies, this.x, this.y, this.attackRange)

    // Standing and fighting beats walking: he only moves when nothing is on him.
    if (!target) {
      const dx = this.rallyX - this.x
      const dy = this.rallyY - this.y
      const dist = Math.hypot(dx, dy)
      const step = this.moveSpeed * dt
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
          ? withinRadius(enemies, this.x, this.y, this.attackRange)
          : [target]
        for (const v of victims) onHit(v, this.damage)
        const base = this.body_.scaleX
        this.scene.tweens.add({
          targets: this.body_, scaleX: base * 1.08, duration: 80, yoyo: true,
        })
      }
    }

    if (this.inVehicle) this.ram(enemies, onHit)

    // Depreciation: anything standing near Cory quietly loses its armour.
    const p = this.def.passive
    for (const e of withinRadius(enemies, this.x, this.y, p.armorShredRadius)) {
      e.shredArmor(p.armorShredPerSecond * dt, p.maxArmorShred)
    }

    ySort(this)
  }

  /**
   * Contact damage. In the SUV he drives over the lane instead of standing
   * beside it, so anything inside the vehicle's footprint is hit once and
   * shoved back down the road rather than politely blocked.
   */
  private ram(enemies: Enemy[], onHit: (enemy: Enemy, damage: number) => void): void {
    const ls = this.def.lastStand
    for (const e of withinRadius(enemies, this.x, this.y, this.halfFootprint)) {
      if (this.rammed.has(e)) continue
      this.rammed.add(e)
      onHit(e, ls.rammingDamage)
      e.knockBack(ls.rammingKnockbackPixels)
    }
    // Anything no longer under the vehicle can be hit again next time.
    for (const e of [...this.rammed]) {
      if (!e.active || !e.alive || Math.hypot(e.x - this.x, e.y - this.y) > this.halfFootprint * 1.25) {
        this.rammed.delete(e)
      }
    }
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

  /**
   * Both hero sprites are drawn facing LEFT, the opposite of the enemy art, so
   * the shared rule is asked about the reversed heading and the answer means
   * "facing right" here.
   */
  private faceTowards(x: number, y: number): void {
    const angle = Math.atan2(y - this.y, x - this.x)
    const right = facesLeft(angle + Math.PI, this.facingRight, PRESENTATION.facing.deadZone)
    if (right === this.facingRight) return
    this.facingRight = right
    this.body_.setFlipX(right)
    this.body_.x = right ? -this.artOffset : this.artOffset
  }

  /**
   * DAD MODE. He goes away for half a second and comes back in the SUV — the
   * pause is the point, so the swap is a beat rather than a sprite change.
   */
  private triggerLastStand(): void {
    const ls = this.def.lastStand
    this.lastStandUsed = true
    this.lastStandActive = true
    this.transforming = true

    const cam = this.scene.cameras.main
    cam.shake(ls.transformShakeMs, 0.012)
    cam.flash(ls.transformFlashMs, 255, 255, 255)
    this.scene.tweens.add({ targets: this.body_, alpha: 0, duration: 140 })

    this.scene.time.delayedCall(ls.transformPauseMs, () => {
      if (this.down) return
      this.body_.setTexture(this.def.ultimateSprite)
      this.artOffset = applyGroundRender(this.body_, this.def.ultimateSprite)
      this.body_.setFlipX(this.facingRight)
      this.body_.x = this.facingRight ? -this.artOffset : this.artOffset
      // The shadow belongs to the vehicle now, not to the man.
      this.shadow.destroy()
      this.shadow = makeShadow(this.scene, this.def.ultimateSprite)
      this.addAt(this.shadow, 0)
      this.body_.setAlpha(0)
      this.scene.tweens.add({ targets: this.body_, alpha: 1, duration: 180 })
      this.scene.cameras.main.shake(160, 0.008)
      this.transforming = false
      this.drawBar()
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
    // Sized and floated from the art, so the bar grows with the vehicle.
    const w = Phaser.Math.Clamp(this.body_.displayWidth * 0.62, 46, 96)
    const y = -this.body_.displayHeight - 10
    const ratio = Phaser.Math.Clamp(this.health / this.def.maxHealth, 0, 1)
    this.bar.clear()
    this.bar.fillStyle(0x14181f, 0.9).fillRect(-w / 2 - 1, y - 1, w + 2, 7)
    this.bar.fillStyle(this.lastStandActive ? 0xff5a3c : 0x4fa3e3, 1).fillRect(-w / 2, y, w * ratio, 5)
    // The 25% mark, so the Last Stand threshold is legible before it fires.
    const markX = -w / 2 + w * this.def.lastStand.healthThreshold
    this.bar.lineStyle(1, 0xf6ecd9, 0.7).lineBetween(markX, y, markX, y + 5)
  }
}

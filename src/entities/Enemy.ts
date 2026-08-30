import Phaser from 'phaser'
import type { EnemyDef } from '../types.ts'
import { Path } from '../systems/Path.ts'
import { ySort } from '../systems/DepthSort.ts'
import { damageAfterArmor, slowedSpeed } from '../systems/Combat.ts'
import { makeShadow, PRESENTATION, floatingDamage, deathPuff } from '../systems/Presentation.ts'
import { applyGroundRender } from '../systems/Art.ts'
import { facesLeft } from '../systems/Facing.ts'

export type EnemyState = 'walking' | 'fighting' | 'dead'

/** Anything that can stand in an enemy's way and be hit for it. */
export interface Blocker {
  x: number
  y: number
  alive: boolean
  hurt(amount: number): unknown
}

export class Enemy extends Phaser.GameObjects.Container {
  readonly def: EnemyDef
  readonly maxHealth: number
  health: number
  /** Distance walked along the lane. Doubles as "how close to the exit". */
  distance = 0
  status: EnemyState = 'walking'
  /** Whatever is currently holding this enemy up, set each frame by the
   *  scene. The hero and any summoned fighter both qualify. */
  blocker: Blocker | null = null
  /** Armour stripped by Cory's Depreciation passive. */
  armorShred = 0

  private readonly lane: Path
  private readonly art: Phaser.GameObjects.Sprite
  private readonly shadow: Phaser.GameObjects.Image
  private readonly bar: Phaser.GameObjects.Graphics
  private attackTimer = 0
  private slowFactor = 0
  private slowRemaining = 0
  private bobPhase = Math.random() * Math.PI * 2
  /** Distance from the feet to the art's frame centre, negated on a flip. */
  private readonly artOffset: number
  private readonly baseScaleX: number
  private facingLeft = false

  constructor(scene: Phaser.Scene, def: EnemyDef, lane: Path) {
    super(scene, 0, 0)
    this.def = def
    this.lane = lane
    this.maxHealth = def.maxHealth
    this.health = def.maxHealth

    this.shadow = makeShadow(scene, def.sprite)
    this.art = scene.add.sprite(0, 0, def.sprite)
    // Anchor and on-screen size come from the manifest, so the three enemies
    // keep the sizes they were drawn at relative to each other.
    this.artOffset = applyGroundRender(this.art, def.sprite)
    this.baseScaleX = this.art.scaleX
    this.bar = scene.add.graphics()
    // Shadow first, then the art, then the bar, so each draws over the last.
    this.add([this.shadow, this.art, this.bar])

    const p = lane.pointAt(0)
    this.setPosition(p.x, p.y)
    scene.add.existing(this)
    this.drawBar()
  }

  get alive(): boolean {
    return this.status !== 'dead'
  }

  get slowed(): boolean {
    return this.slowRemaining > 0
  }

  /** Armour after Cory's passive has been chewing on it. */
  get effectiveArmor(): number {
    return Math.max(0, this.def.armor - this.armorShred)
  }

  applySlow(factor: number, seconds: number): void {
    if (factor <= 0 || seconds <= 0) return
    // A stronger slow replaces a weaker one; equal slows just refresh.
    if (factor <= this.slowFactor || this.slowRemaining <= 0) this.slowFactor = factor
    this.slowRemaining = Math.max(this.slowRemaining, seconds)
  }

  /** Haymaker knockback: shoved back along the lane it came from. */
  knockBack(pixels: number): void {
    this.distance = Math.max(0, this.distance - pixels)
    const p = this.lane.pointAt(this.distance)
    this.scene.tweens.add({ targets: this, x: p.x, y: p.y, duration: 180, ease: 'Quad.easeOut' })
  }

  shredArmor(amount: number, max: number): void {
    this.armorShred = Math.min(max, this.armorShred + amount)
  }

  /** Returns true once the enemy has walked off the far end of the lane. */
  tick(dt: number, onAttackBlocker: (damage: number) => void): boolean {
    if (this.status === 'dead') return false

    if (this.slowRemaining > 0) {
      this.slowRemaining -= dt
      if (this.slowRemaining <= 0) this.slowFactor = 0
    }

    if (this.blocker) {
      this.status = 'fighting'
      this.attackTimer -= dt
      if (this.attackTimer <= 0) {
        this.attackTimer = this.def.attackInterval
        onAttackBlocker(this.def.damage)
        this.scene.tweens.add({
          targets: this.art, scaleX: this.baseScaleX * 1.15, duration: 90, yoyo: true,
        })
      }
    } else {
      this.status = 'walking'
      this.attackTimer = 0
      this.distance += slowedSpeed(this.def.speed, this.slowFactor, this.slowed) * dt
      const p = this.lane.pointAt(this.distance)
      this.setPosition(p.x, p.y)
      this.face(this.lane.angleAt(this.distance))
      if (this.distance >= this.lane.totalLength) return true
    }

    // Idle bob, so a stationary crowd still looks alive.
    const bob = PRESENTATION.enemyBob
    this.bobPhase += (dt * 1000 * Math.PI * 2) / bob.durationMs
    this.art.y = Math.sin(this.bobPhase) * bob.amplitudeY

    this.art.setTint(this.slowed ? 0x8fd0ff : 0xffffff)
    ySort(this)
    return false
  }

  /** Mirrors the art when the lane turns back to the left. */
  private face(angle: number): void {
    const left = facesLeft(angle, this.facingLeft, PRESENTATION.facing.deadZone)
    if (left === this.facingLeft) return
    this.facingLeft = left
    this.art.setFlipX(left)
    // Mirroring is about the art's centre, so the feet stay put once the
    // offset that put them on the lane is mirrored too.
    this.art.x = left ? -this.artOffset : this.artOffset
  }

  /** Mid-body height, for anything that should land on the enemy rather than
   *  at its feet. Gameplay still measures everything at ground level. */
  get centreY(): number {
    return this.y - (this.art.displayHeight * this.art.originY) / 2
  }

  /** Returns true if this hit killed it. */
  hurt(damage: number, ignoresArmor: boolean, showNumber = true): boolean {
    if (this.status === 'dead') return false
    const dealt = damageAfterArmor(damage, this.effectiveArmor, ignoresArmor)
    this.health -= dealt
    if (showNumber) floatingDamage(this.scene, this.x, this.centreY, dealt, dealt >= 60)
    this.drawBar()
    if (this.health <= 0) {
      this.die()
      return true
    }
    return false
  }

  die(): void {
    if (this.status === 'dead') return
    this.status = 'dead'
    this.bar.setVisible(false)
    this.shadow.setVisible(false)
    deathPuff(this.scene, this.x, this.centreY)
    this.scene.tweens.add({
      targets: this,
      angle: Phaser.Math.Between(-200, 200),
      scale: 0.15,
      alpha: 0,
      duration: 300,
      ease: 'Quad.easeIn',
      onComplete: () => this.destroy(),
    })
  }

  /** Sized to the sprite and floated just above its head, so a brute and a
   *  scout each get a bar that reads as theirs. */
  private drawBar(): void {
    const cfg = PRESENTATION.healthBar
    const w = Phaser.Math.Clamp(
      this.art.displayWidth * cfg.widthFactor, cfg.minWidth, cfg.maxWidth,
    )
    const h = cfg.heightPx
    // The art's top edge, from its own anchor, so taller art carries its bar
    // higher without a per-enemy number.
    const top = -this.art.displayHeight * this.art.originY
    const y = top - cfg.gapAbovePx - h

    const ratio = Phaser.Math.Clamp(this.health / this.maxHealth, 0, 1)
    this.bar.clear()
    this.bar.fillStyle(0x14181f, 0.9).fillRect(-w / 2 - 1, y - 1, w + 2, h + 2)
    const col = ratio > 0.5 ? 0x6cc24a : ratio > 0.25 ? 0xe8c33c : 0xd44b32
    this.bar.fillStyle(col, 1).fillRect(-w / 2, y, w * ratio, h)
    if (this.def.armor > 0) {
      // A small pip showing armour is still up, so shredding it reads.
      const shredded = this.effectiveArmor <= 0
      this.bar.fillStyle(shredded ? 0x6f7a86 : 0xc9d3de, 1).fillRect(w / 2 + 2, y, 3, h)
    }
  }
}

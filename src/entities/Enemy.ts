import Phaser from 'phaser'
import type { EnemyDef, TaxPhase } from '../types.ts'
import { Path } from '../systems/Path.ts'
import { ySort } from '../systems/DepthSort.ts'
import { canStun, damageAfterArmor, slowedSpeed, stunLockoutFor } from '../systems/Combat.ts'
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
  /** Seconds left on the "Cory is filing this one down" mark. Set by the
   *  passive and allowed to lapse, so one frame out of his radius does not
   *  make the mark flicker. */
  shreddingFor = 0
  /** Counts down to the next tax. Only The Politician uses it. */
  private taxTimer = 0

  private readonly lane: Path
  private readonly art: Phaser.GameObjects.Sprite
  private readonly shadow: Phaser.GameObjects.Image
  private readonly bar: Phaser.GameObjects.Graphics
  private attackTimer = 0
  private slowFactor = 0
  private slowRemaining = 0
  /** Seconds left standing still. A stun is not a very strong slow: it stops
   *  movement *and* attacks, and it cannot be refreshed. */
  private stunRemaining = 0
  /** Seconds left before another stun may land, counted from the moment the
   *  last one did. This is what stops a fast tower turning a 0.6s stop into a
   *  permanent one by re-applying it every shot. */
  private stunLockout = 0
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

  get stunned(): boolean {
    return this.stunRemaining > 0
  }

  /** Nothing holds a boss: it walks through the line. */
  get blockable(): boolean {
    return this.def.blockable
  }

  get healthFraction(): number {
    return this.maxHealth <= 0 ? 0 : this.health / this.maxHealth
  }

  /** The tax phase in force right now, or null for anything that does not tax.
   *  Phases are ordered healthiest first, so the first match is the one. */
  get taxPhase(): TaxPhase | null {
    const tax = this.def.tax
    if (!tax) return null
    const f = this.healthFraction
    return tax.phases.find((p) => f > p.aboveHealth) ?? tax.phases[tax.phases.length - 1]
  }

  /** Which phase that is, as an index. -1 for anything that does not tax.
   *  The diagnostics log a boss's phase changes, and a number is what
   *  survives being written into a report. */
  get taxPhaseIndex(): number {
    const tax = this.def.tax
    if (!tax) return -1
    const f = this.healthFraction
    const i = tax.phases.findIndex((p) => f > p.aboveHealth)
    return i >= 0 ? i : tax.phases.length - 1
  }

  /**
   * Ticks the tax clock and reports how much to take, or 0. The amount is a
   * share of what the player is *holding*, which is the whole point: hoarding
   * is what he feeds on.
   */
  tickTax(dt: number, currentPeanuts: number): number {
    const phase = this.taxPhase
    if (!phase || !this.alive) return 0
    this.taxTimer -= dt
    if (this.taxTimer > 0) return 0
    this.taxTimer = phase.intervalSeconds
    const take = Math.floor(currentPeanuts * phase.percent)
    return Math.min(currentPeanuts, Math.max(this.def.tax!.minimumTake, take))
  }

  /** Armour after Cory's passive has been chewing on it. */
  get effectiveArmor(): number {
    return Math.max(0, this.def.armor - this.armorShred)
  }

  applySlow(factor: number, seconds: number): void {
    if (factor <= 0 || seconds <= 0) return
    // A stronger slow replaces a weaker one; equal slows just refresh. Slows
    // are allowed to refresh: a slowed enemy still moves, so a tower holding
    // one at 45% speed indefinitely is the tower doing its job.
    if (factor <= this.slowFactor || this.slowRemaining <= 0) this.slowFactor = factor
    this.slowRemaining = Math.max(this.slowRemaining, seconds)
  }

  /**
   * Stops it dead, once, and then leaves it alone for a while.
   *
   * Refused outright while a stun is running or its lockout has not expired.
   * That refusal is the whole fix: the Amendment specialization stops a target
   * for 0.6s from a tower that fires every 0.81s, and refreshing on each shot
   * meant nothing it touched ever took another step.
   */
  applyStun(seconds: number, lockoutMultiple: number): void {
    if (seconds <= 0) return
    if (!canStun(this.stunRemaining, this.stunLockout)) return
    this.stunRemaining = seconds
    this.stunLockout = stunLockoutFor(seconds, lockoutMultiple)
  }

  /** Haymaker knockback: shoved back along the lane it came from. */
  knockBack(pixels: number): void {
    this.distance = Math.max(0, this.distance - pixels)
    const p = this.lane.pointAt(this.distance)
    this.scene.tweens.add({ targets: this, x: p.x, y: p.y, duration: 180, ease: 'Quad.easeOut' })
  }

  shredArmor(amount: number, max: number): void {
    // Only counts as "being shredded" while there is armour left to take. A
    // Late Filer has none, and marking it would tell the player the passive is
    // doing something for them when it is not.
    if (this.effectiveArmor > 0) this.shreddingFor = 0.2
    this.armorShred = Math.min(max, this.armorShred + amount)
  }

  /** Returns true once the enemy has walked off the far end of the lane. */
  tick(dt: number, onAttackBlocker: (damage: number) => void): boolean {
    if (this.status === 'dead') return false

    if (this.slowRemaining > 0) {
      this.slowRemaining -= dt
      if (this.slowRemaining <= 0) this.slowFactor = 0
    }
    if (this.stunRemaining > 0) this.stunRemaining -= dt
    if (this.shreddingFor > 0) this.shreddingFor -= dt
    if (this.stunLockout > 0) this.stunLockout -= dt

    // Stopped means stopped: it does not walk and it does not swing. Held here
    // rather than inside each branch so a stunned enemy cannot leak an attack
    // through the fighting path.
    if (this.stunRemaining > 0) {
      this.bob(dt)
      this.tintForStatus()
      ySort(this)
      return false
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
      // The swing timer is NOT reset here, and that is the whole point.
      //
      // Resetting it meant an enemy that lost its block slot for one frame and
      // regained it on the next attacked instantly, for free — and the slot
      // changes hands constantly, because a blocked enemy stops advancing
      // while the ones behind it keep walking and overtake it. Cory was
      // measured taking 48 hits for 336 damage in 5.1 game-seconds against a
      // data ceiling of 27.7 damage per second: twenty consecutive hits 17ms
      // apart, one per frame. Carrying the timer means a swing costs the same
      // whether or not the target shuffled out of range in the middle of it.
      //
      // The field starts at 0, so a first engagement still lands immediately.
      this.distance += slowedSpeed(this.def.speed, this.slowFactor, this.slowed) * dt
      const p = this.lane.pointAt(this.distance)
      this.setPosition(p.x, p.y)
      this.face(this.lane.angleAt(this.distance))
      if (this.distance >= this.lane.totalLength) return true
    }

    this.bob(dt)
    this.tintForStatus()
    ySort(this)
    return false
  }

  /** Idle bob, so a stationary crowd still looks alive. */
  private bob(dt: number): void {
    const b = PRESENTATION.enemyBob
    this.bobPhase += (dt * 1000 * Math.PI * 2) / b.durationMs
    this.art.y = Math.sin(this.bobPhase) * b.amplitudeY
  }

  /** Stopped reads paler than slowed, so the two can be told apart on a board
   *  where both are happening at once. */
  private tintForStatus(): void {
    // Order is priority. Stunned and slowed are things being done TO it that
    // change what it can do; the shred mark only says its armour is going, so
    // it yields to both.
    const shredded = this.shreddingFor > 0
    this.art.setTint(
      this.stunned ? 0xd6ecff
        : this.slowed ? 0x8fd0ff
          : shredded ? 0xf0c46a
            : 0xffffff,
    )
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
  hurt(damage: number, ignoresArmor: boolean, showNumber = true, pierce = 0): boolean {
    if (this.status === 'dead') return false
    const dealt = damageAfterArmor(damage, this.effectiveArmor, ignoresArmor, pierce)
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

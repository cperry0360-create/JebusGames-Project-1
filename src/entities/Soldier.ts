import Phaser from 'phaser'
import { ySort } from '../systems/DepthSort.ts'
import { onBoard } from '../systems/Liveness.ts'
import { makeShadow, PRESENTATION, deathPuff, floatingDamage } from '../systems/Presentation.ts'
import { applyGroundRender } from '../systems/Art.ts'
import { facesLeft } from '../systems/Facing.ts'
import type { Enemy } from './Enemy.ts'

/**
 * One of the Ima Dummy Tower's lads. Stands where he is told and refuses to
 * move; when something walks into him they hit each other until one falls over.
 *
 * NOT A Fighter. A gnome is summoned, swings at whatever is nearest and expires
 * on a timer; a soldier belongs to a tower, holds ONE enemy at its rally point,
 * walks back to that point when the fight ends, and comes back ten seconds
 * after it dies. Sharing a class would have meant a `permanent` flag and a
 * `rally` that is null for half its uses, which is two entities wearing one
 * name.
 *
 * It satisfies `Blocker` structurally -- x, y, alive, hurt -- so the engagement
 * rule that already holds enemies for the hero and the gnomes holds them for a
 * soldier with no change at all. That rule was the reason this feature was
 * mostly data: blocking already existed, it just had nothing permanent in it.
 */
export class Soldier extends Phaser.GameObjects.Container {
  // `x`, `y` and `setDepth` come from Container, and they are what make a
  // Soldier a `Blocker` and a `Sortable`. They are NOT redeclared here.
  //
  // They were, briefly, to quiet the local typecheck -- without node_modules
  // the Phaser base class is `any`, so the structural matches fail on exactly
  // the members the base provides. It bought nothing and cost a red build:
  // `declare setDepth: (value: number) => unknown` is a NARROWER type than
  // Container's `setDepth(value: number): this`, and against the real typings
  // TypeScript rejects a derived member that is not assignable to the base one.
  // Enemy and Fighter extend the same class, satisfy the same two interfaces
  // and declare nothing, which is the shape to copy. The local cascade in this
  // file is noise; see CLAUDE.md on tsdiff.
  health: number
  maxHealth: number
  /** Where it stands when nothing is in front of it. Moved by the rally point. */
  stationX: number
  stationY: number
  /** Counts down while dead; 0 means it is on the board. */
  respawnIn = 0
  /** True once this life has dropped past the Rage threshold. Cleared on
   *  respawn, which is the whole of "resets when it comes back at full". */
  enraged = false

  private readonly art: Phaser.GameObjects.Sprite
  private readonly bar: Phaser.GameObjects.Graphics
  private attackTimer = 0
  private readonly artOffset: number
  private facingLeft = false
  /** Walking speed back to its station. Fast enough not to be a journey. */
  private static readonly RETURN_SPEED = 70

  constructor(scene: Phaser.Scene, x: number, y: number, health: number, spriteKey: string) {
    super(scene, x, y)
    this.maxHealth = health
    this.health = health
    this.stationX = x
    this.stationY = y

    this.art = scene.add.sprite(0, 0, spriteKey)
    this.artOffset = applyGroundRender(this.art, spriteKey)
    this.bar = scene.add.graphics()
    this.add([makeShadow(scene, spriteKey), this.art, this.bar])
    scene.add.existing(this)
    ySort(this)
    this.drawBar()
  }

  get alive(): boolean {
    return onBoard({ active: this.active, scene: this.scene })
      && this.health > 0 && this.respawnIn <= 0
  }

  hurt(amount: number): void {
    if (!this.alive) return
    this.health -= amount
    floatingDamage(this.scene, this.x, this.y, amount)
    if (this.health <= 0) this.fall()
    else this.drawBar()
  }

  /** Moves the station and, if it is idle, sets it walking there. */
  postTo(x: number, y: number): void {
    this.stationX = x
    this.stationY = y
  }

  /** Back on its feet at full health, at its station, with Rage forgotten. */
  private revive(): void {
    this.health = this.maxHealth
    this.enraged = false
    this.attackTimer = 0
    this.setPosition(this.stationX, this.stationY)
    this.setVisible(true)
    this.setScale(0.2)
    this.scene.tweens.add({ targets: this, scale: 1, duration: 220, ease: 'Back.easeOut' })
    this.drawBar()
  }

  private fall(): void {
    deathPuff(this.scene, this.x, this.y, 0xffd08a)
    this.setVisible(false)
    this.bar.clear()
  }

  /**
   * One frame.
   *
   * `holding` is the enemy the engagement rule has given this soldier, or null.
   * The soldier does not choose its own target: the scene's one engagement pass
   * decides who holds whom, for the hero, the gnomes and these alike.
   */
  tick(dt: number, holding: Enemy | null, respawnSeconds: number,
       damage: number, interval: number,
       onHit: (enemy: Enemy, damage: number) => void): void {
    if (this.respawnIn > 0) {
      this.respawnIn -= dt
      if (this.respawnIn <= 0) {
        this.respawnIn = 0
        this.revive()
      }
      return
    }
    if (this.health <= 0) {
      // Just fell. The timer starts here rather than in `hurt` so a soldier
      // killed by two things in one frame does not start two of them.
      this.respawnIn = respawnSeconds
      return
    }

    if (holding) {
      this.face(Math.atan2(holding.y - this.y, holding.x - this.x))
      this.attackTimer -= dt
      if (this.attackTimer <= 0) {
        this.attackTimer = interval
        onHit(holding, damage)
        this.scene.tweens.add({
          targets: this.art, y: -4, duration: 80, yoyo: true, ease: 'Quad.easeOut',
        })
      }
    } else {
      // Nothing in front of it: back to the post. The attack timer is NOT
      // reset, for the reason Enemy.tick records -- a fight that pauses for a
      // frame must not hand out a free swing when it resumes.
      const dx = this.stationX - this.x
      const dy = this.stationY - this.y
      const d = Math.hypot(dx, dy)
      if (d > 1) {
        const step = Math.min(d, Soldier.RETURN_SPEED * dt)
        this.setPosition(this.x + (dx / d) * step, this.y + (dy / d) * step)
        this.face(Math.atan2(dy, dx))
      }
      this.attackTimer -= dt
    }
    this.drawBar()
    ySort(this)
  }

  private face(angle: number): void {
    const left = facesLeft(angle, this.facingLeft, PRESENTATION.facing.deadZone)
    if (left === this.facingLeft) return
    this.facingLeft = left
    this.art.setFlipX(left)
    this.art.x = left ? -this.artOffset : this.artOffset
  }

  private drawBar(): void {
    this.bar.clear()
    if (this.health >= this.maxHealth || this.health <= 0) return
    const w = 30
    const share = Math.max(0, this.health / this.maxHealth)
    this.bar.fillStyle(0x000000, 0.6).fillRect(-w / 2 - 1, -54, w + 2, 5)
    // Amber below the Rage line, so a player with that branch can see the
    // moment a soldier becomes dangerous rather than inferring it.
    this.bar.fillStyle(this.enraged ? 0xf0a830 : 0x6fbf73, 1)
      .fillRect(-w / 2, -53, w * share, 3)
  }
}

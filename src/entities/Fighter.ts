import Phaser from 'phaser'
import { ySort } from '../systems/DepthSort.ts'
import { onBoard } from '../systems/Liveness.ts'
import { makeShadow, PRESENTATION, deathPuff, floatingDamage } from '../systems/Presentation.ts'
import { applyGroundRender } from '../systems/Art.ts'
import { facesLeft } from '../systems/Facing.ts'
import { pickNearest } from '../systems/Targeting.ts'
import { Enemy } from './Enemy.ts'

/**
 * A gnome, summoned by the Gnomes ability. Blocks and swings until its timer
 * runs out or it is killed. Deliberately dumber than the hero: no rally point.
 *
 * It wears 3/4 character art like everything else on the board, so it stands
 * on its feet, casts a ground shadow and mirrors to face what it is hitting.
 * The placeholder it replaces was a top-down tile that was *rotated* toward
 * its target, which is the right move for a sprite drawn from above and the
 * wrong one for a sprite drawn from the side — a rotated gnome lies down.
 */
export class Fighter extends Phaser.GameObjects.Container {
  health: number
  private readonly art: Phaser.GameObjects.Sprite
  private readonly damage: number
  private readonly range: number
  private readonly interval: number
  private life: number
  private attackTimer = 0
  /** How far the art's frame centre sits from its feet, so a flip mirrors
   *  about the gnome rather than about the prop it is carrying. */
  private readonly artOffset: number
  /** The art is drawn facing right, like the enemies and unlike the hero. */
  private facingLeft = false

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

    this.art = scene.add.sprite(0, 0, spriteKey)
    // Anchor, on-screen height and shadow all come from the manifest, so the
    // gnome keeps the size the artist drew it at relative to everyone else.
    this.artOffset = applyGroundRender(this.art, spriteKey)
    this.add([makeShadow(scene, spriteKey), this.art])
    scene.add.existing(this)
    ySort(this)
    this.setScale(0.2)
    scene.tweens.add({ targets: this, scale: 1, duration: 220, ease: 'Back.easeOut' })
  }

  get alive(): boolean {
    // Same one definition as the enemies use, handed the two fields a Fighter
    // has. It carries no `status` of its own — a summoned fighter expires, it
    // does not die — so it is passed explicitly rather than as `this`, which
    // would match `BoardObject` only by accident.
    return onBoard({ active: this.active, scene: this.scene })
      && this.health > 0 && this.life > 0
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
      this.face(Math.atan2(target.y - this.y, target.x - this.x))
      this.attackTimer -= dt
      if (this.attackTimer <= 0) {
        this.attackTimer = this.interval
        onHit(target, this.damage)
        // A lunge toward the swing rather than a grow: scaleX on a mirrored
        // sprite would fight the flip.
        this.scene.tweens.add({
          targets: this.art, y: -4, duration: 80, yoyo: true, ease: 'Quad.easeOut',
        })
      }
    }
    ySort(this)
    return false
  }

  /** Mirrors the art to face whatever it is swinging at. */
  private face(angle: number): void {
    const left = facesLeft(angle, this.facingLeft, PRESENTATION.facing.deadZone)
    if (left === this.facingLeft) return
    this.facingLeft = left
    this.art.setFlipX(left)
    // Mirroring is about the art's centre, so the feet stay put once the
    // offset that put them on the ground is mirrored too.
    this.art.x = left ? -this.artOffset : this.artOffset
  }

  private expire(): void {
    if (!this.active) return
    deathPuff(this.scene, this.x, this.y, 0x9fd0ff)
    this.destroy()
  }

}

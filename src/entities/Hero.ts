import Phaser from 'phaser'
import type { HeroDef } from '../types.ts'
import { ySort } from '../systems/DepthSort.ts'
import { pickNearest, withinRadius } from '../systems/Targeting.ts'
import { applyHit, attackInterval, incomingDamage, outgoingDamage } from '../systems/LastStand.ts'
import { HeroFrames, type FrameDef, type HeroPose } from '../systems/HeroFrames.ts'
import { makeShadow, deathPuff } from '../systems/Presentation.ts'
import { applyGroundRender, ART } from '../systems/Art.ts'
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
 * Three rules are load-bearing here:
 *   - Last Stand fires once at 25% health, and cannot re-arm inside an
 *     encounter — not even across a revive. It is the climax of a life, and a
 *     hero who could transform twice a wave would make it a rotation.
 *   - Going down takes him off the board for `reviveSeconds`, then he walks
 *     back on at full health from where he entered. `down` gates movement,
 *     attacking and further damage for the whole of that.
 *   - He returns at full health at the next encounter too. That is why this
 *     class holds no cross-encounter state and the scene builds a fresh Hero
 *     in create(); healing is the absence of carry-over, not a heal step.
 *
 * The revive replaces DESIGN.md's original stay-down-for-the-encounter rule,
 * on tester feedback: losing Cory at wave four and playing eight more waves
 * without him read as a broken game rather than as a climax. The timer is long
 * enough that the loss still costs a wave.
 */
export class Hero extends Phaser.GameObjects.Container {
  readonly def: HeroDef
  health: number
  down = false
  lastStandActive = false
  /** Seconds until he walks back on, or 0 whenever he is up. */
  reviveIn = 0
  /** Seconds left of the window where breaking off a fight costs extra
   *  damage. The scene draws a marker while this is running. */
  retreatVulnerableFor = 0
  /** Seconds left of the transformation window, during which nothing can hurt
   *  him. Last Stand is the hero's one scripted moment and it was possible to
   *  be killed in the middle of it. */
  invulnerableFor = 0
  /** How many enemies he is holding right now, and the most he may hold. The
   *  scene sets the first every frame; both are read by the HUD and by the
   *  at-capacity marker, so the number the player is shown is the number the
   *  engagement rule actually used. */
  blocking = 0

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
  /** Whatever he swung at last frame, so `engaged` can be asked before the
   *  order is carried out rather than after. */
  private lastTarget: Enemy | null = null
  /** Set while the transformation plays, so he neither moves nor fights. */
  private transforming = false
  /** Enemies currently under the vehicle, so one pass is one hit each. */
  private readonly rammed = new Set<Enemy>()
  /** Set when he is ordered away mid-fight, applied when he arrives: he
   *  cannot swing for a moment after pulling out of one fight and into
   *  another. */
  private arrivalDelay = 0
  /** Where he came onto the map, and where he comes back on. */
  private readonly homeX: number
  private readonly homeY: number
  /** Idle bob, walk bounce and attack lunge. He is never perfectly still. */
  private readonly frames = new HeroFrames(PRESENTATION.heroFrames as FrameDef)
  /** The pose and frame currently on the sprite, so the texture is only swapped
   *  when it actually changes rather than every tick. */
  private shownPose: HeroPose | '' = ''
  private shownIndex = -1
  /**
   * The blow, held until the impact frame.
   *
   * A closure rather than a list of victims and a number, so the targets keep
   * whatever type they had where they were chosen. Storing them in a typed
   * field made the generic in `withinRadius` the problem instead.
   */
  private pendingHit: (() => void) | null = null
  /** The sprite's resting scale, from the manifest. The pose multiplies it, so
   *  this has to be captured once rather than read back off a posed sprite. */
  private baseScale = 1
  /** The shadow's resting size, for the same reason. */

  constructor(scene: Phaser.Scene, x: number, y: number, def: HeroDef) {
    super(scene, x, y)
    this.def = def
    this.health = def.maxHealth
    this.rallyX = x
    this.rallyY = y
    this.homeX = x
    this.homeY = y

    this.shadow = makeShadow(scene, def.bodySprite)
    this.body_ = scene.add.sprite(0, 0, def.bodySprite)
    this.artOffset = applyGroundRender(this.body_, def.bodySprite)
    this.captureRest()
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

  /**
   * His width at rest, in world pixels.
   *
   * Not `displayWidth`: the idle bob squashes and stretches him every frame,
   * so a ring sized off the live width would breathe along with him. The
   * selection ring is meant to sit still while he moves inside it.
   */
  get spriteWidth(): number {
    return this.body_.width * this.baseScale
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

  /**
   * An order, obeyed immediately.
   *
   * It overrides whatever he is doing, including a fight. The old rule was
   * that he only moved when nothing was in range, which on a lane full of
   * enemies meant he never moved at all: the player tapped, nothing happened,
   * and the rally point looked broken.
   *
   * Breaking off is not free. Pulling out of a fight opens a window where he
   * takes extra damage, and he cannot swing for a moment after arriving.
   */
  setRally(x: number, y: number): void {
    if (this.down) return
    const wasFighting = this.engaged
    this.rallyX = x
    this.rallyY = y
    // Turn on the spot, this frame, before he has taken a step. The tap has to
    // produce a visible answer or the player taps again.
    this.faceTowards(x, y)
    if (wasFighting && !this.atRally) {
      const r = this.def.retreat
      this.retreatVulnerableFor = r.vulnerableSeconds
      this.arrivalDelay = r.readySeconds
      this.emit('retreat')
    }
  }

  /** True when something is close enough for him to be swinging at it. */
  get engaged(): boolean {
    return this.lastTarget !== null
  }

  tick(dt: number, enemies: Enemy[], onHit: (enemy: Enemy, damage: number) => void): void {
    if (this.down) {
      this.reviveIn -= dt
      if (this.reviveIn <= 0) this.revive()
      return
    }
    // Counted down before the transforming gate, not after it: the window
    // exists precisely to cover the half-second he spends transforming, and a
    // timer that only ticks once the transformation is over covers nothing.
    if (this.invulnerableFor > 0) this.invulnerableFor -= dt
    if (this.transforming) return

    if (this.retreatVulnerableFor > 0) this.retreatVulnerableFor -= dt

    const target = pickNearest(enemies, this.x, this.y, this.attackRange)
    this.lastTarget = target

    // The order wins. He walks whenever he is not where he was told to be,
    // and fights only once he is standing there — which is what makes a rally
    // point a retreat as well as an advance.
    const dx = this.rallyX - this.x
    const dy = this.rallyY - this.y
    const dist = Math.hypot(dx, dy)
    let walking = false
    if (dist > 0.5) {
      const step = this.moveSpeed * dt
      if (dist > step) {
        this.x += (dx / dist) * step
        this.y += (dy / dist) * step
        this.faceTowards(this.rallyX, this.rallyY)
        walking = true
      } else {
        this.setPosition(this.rallyX, this.rallyY)
        // Arrived: he needs a moment before he can swing again.
        this.attackTimer = Math.max(this.attackTimer, this.arrivalDelay)
        this.arrivalDelay = 0
      }
    } else if (target) {
      this.faceTowards(target.x, target.y)
      this.attackTimer -= dt
      if (this.attackTimer <= 0) {
        this.attackTimer = this.attackInterval
        // DAD MODE swings wildly at everything in range rather than picking a
        // target, which is the whole point of losing precision.
        // The swing STARTS here; it does not land here. Who it lands on is
        // chosen now, on the frame the player saw him commit, and the damage
        // is applied on the animation's impact frame — otherwise the hit
        // resolves before the axe has moved.
        const victims = this.lastStandActive && this.def.lastStand.hitsAllInRange
          ? withinRadius(enemies, this.x, this.y, this.attackRange)
          : [target]
        const damage = this.damage
        // Anything that died between the swing starting and the axe landing is
        // skipped. The swing is committed; the victim is not.
        this.pendingHit = (): void => {
          for (const v of victims) if (v.alive) onHit(v, damage)
        }
        this.frames.swing()
      }
    }

    // The frame goes on last, after the position and facing are final, and it
    // carries the pending hit: the swing's damage is applied from inside here
    // because that is where the impact frame is known.
    this.applyPose(dt, walking)

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
      if (!e.alive || Math.hypot(e.x - this.x, e.y - this.y) > this.halfFootprint * 1.25) {
        this.rammed.delete(e)
      }
    }
  }

  /** Returns 'lastStand' or 'down' when this hit changed his state. */
  hurt(amount: number): 'none' | 'lastStand' | 'down' {
    if (this.down) return 'none'
    // The transformation is not a window to kill him in.
    if (this.invulnerableFor > 0) return 'none'

    const exposed = this.retreatVulnerableFor > 0 ? this.def.retreat.damageTakenMultiplier : 1
    const damage = incomingDamage(amount, this.def.lastStand, this.lastStandActive) * exposed

    // One rule, in one place, so death cannot be decided before the transform
    // is. See `applyHit`: a hit that would carry him through the 25% band
    // leaves him standing at it instead of killing him outright.
    const out = applyHit(
      this.health, this.def.maxHealth, damage, this.def.lastStand, this.lastStandUsed,
    )
    this.health = out.health
    this.drawBar()

    if (out.down) {
      this.goDown()
      return 'down'
    }
    if (out.triggers) {
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
  /**
   * Records the resting scale of the sprite and the shadow.
   *
   * The pose is a set of MULTIPLIERS, so it needs something to multiply. Read
   * back off the sprite each frame it would compound: a 3% squash applied to
   * an already-squashed sprite walks the scale down until he is a puddle.
   * Called again after the DAD MODE swap, which replaces both objects.
   */
  private captureRest(): void {
    this.baseScale = this.body_.scaleX
  }

  /**
   * Puts the right frame on the sprite.
   *
   * There is no offset, no rotation and no scale pulse here any more. The art
   * moves because the art moves; anything this added on top would fight it,
   * and the vertical oscillation it used to add is exactly what was asked to
   * go. The texture is swapped only when the pose or the frame changes, so a
   * held idle is one setTexture at the start and nothing after it.
   */
  private applyPose(dt: number, walking: boolean): void {
    const st = this.frames.advance(dt, walking)

    // DAD MODE has its own sprite and no clips of its own. Swapping frames
    // under it would put a walking Cory back on screen mid-transformation.
    if (this.inVehicle) {
      if (st.impact && this.pendingHit) { this.pendingHit(); this.pendingHit = null }
      return
    }

    // The damage lands on the impact frame, on the targets chosen when the
    // swing began. A target that died in the meantime is skipped rather than
    // hit — the swing is committed, the victim is not.
    if (st.impact && this.pendingHit) {
      this.pendingHit()
      this.pendingHit = null
    }

    if (st.pose === this.shownPose && st.index === this.shownIndex) return
    this.shownPose = st.pose
    this.shownIndex = st.index
    const key = this.frameKey(st.pose, st.index)
    if (!key || !this.scene.textures.exists(key)) return
    this.body_.setTexture(key)
    // Re-anchored on every swap, because the two clips do NOT share a canvas
    // or a foot fraction: walk is 557x704 and attack 787x720. Taking the
    // anchor from the manifest per FRAME is what keeps his feet in one place
    // across a transition.
    this.artOffset = applyGroundRender(this.body_, key)
    this.body_.x = this.facingRight ? -this.artOffset : this.artOffset
    this.body_.setFlipX(this.facingRight)
  }

  /**
   * The texture for a pose and frame, or the static idle when the animation
   * art is not present.
   *
   * A missing clip must never blank the hero: he falls back to the standing
   * pose he has always had and the game plays on, which is the same rule the
   * build pad and the UI icons follow.
   */
  private frameKey(pose: HeroPose, index: number): string {
    const clip = pose === 'walk' ? ART.hero.walk : pose === 'attack' ? ART.hero.attack : []
    const key = clip[index]
    if (key && this.scene.textures.exists(key)) return key
    return this.def.bodySprite
  }

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
    // He goes away for half a second to change. Nothing may kill him while he
    // is off the board doing it, and he comes back with a moment to act — the
    // transformation is the hero's one scripted beat and it is worth nothing
    // if the wave standing on him simply carries on hitting the empty space.
    this.invulnerableFor = ls.invulnerableSeconds

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
      // Both objects the pose multiplies have just been replaced.
      this.captureRest()
      this.body_.setAlpha(0)
      this.scene.tweens.add({ targets: this.body_, alpha: 1, duration: 180 })
      this.scene.cameras.main.shake(160, 0.008)
      this.transforming = false
      this.drawBar()
      // THE MOMENT OF THE TRANSFORMATION, announced rather than left to two
      // timers that happen to agree. Everything that has to land ON the SUV
      // appearing — the sting, and the voice line's first word, which is
      // scheduled to arrive here — hangs off this.
      this.emit('transformed')
    })
    this.drawBar()
  }

  /**
   * He leaves the map entirely.
   *
   * The old version tipped him on his side and faded to 35% alpha, which left
   * a ghost of the DAD MODE sprite lying on the board for the rest of the
   * encounter — read as a rendering fault rather than a death, and sat on top
   * of build pads. The downed state belongs on the HUD, where the hero bar
   * already greys out and the label reads "— DOWN".
   */
  private goDown(): void {
    this.down = true
    this.reviveIn = this.def.reviveSeconds
    this.lastStandActive = false
    this.invulnerableFor = 0
    this.blocking = 0
    // THE SWING DIES WITH HIM.
    //
    // `pendingHit` is a closure holding the enemies a committed swing chose,
    // and `frames` holds the clip that will eventually deliver its impact
    // frame. Neither used to be cleared here, and `tick()` early-returns while
    // he is down — so a swing committed a frame before he died sat untouched
    // for the whole 25-second revive, and fired the moment he came back, on
    // enemies that had leaked and been destroyed in between. That is the
    // wave-5 crash. Clearing the closure removes the stale references;
    // resetting the clip means `revive()` cannot produce the impact frame that
    // would have called it.
    this.pendingHit = null
    this.frames.reset()
    this.bar.setVisible(false)
    this.shadow.setVisible(false)
    deathPuff(this.scene, this.x, this.y, 0xff8f7a)
    this.scene.tweens.add({
      targets: this, alpha: 0, duration: 320, ease: 'Quad.easeIn',
      // Hidden as well as transparent: nothing of him renders, and nothing of
      // him can be hit-tested, once the puff has cleared.
      onComplete: () => this.setVisible(false),
    })
  }

  /**
   * He walks back on where he came in, at full health, on foot.
   *
   * Deliberately not where he fell: returning into the middle of the fight
   * that just killed him would put him straight back down, and the walk from
   * the entrance is the part of the cost the timer alone does not carry.
   *
   * Last Stand does not re-arm — `lastStandUsed` is not cleared — so the
   * transformation stays a once-per-encounter beat rather than a cooldown.
   */
  private revive(): void {
    this.reviveIn = 0
    this.down = false
    // Belt and braces with `goDown`. He cannot deliver a swing he committed
    // before he died: the closure is gone and the clip starts from idle. Done
    // in both places deliberately — `goDown` is where the references stop
    // being safe to hold, and this is where the impact frame could be
    // produced, and a future change to either must not be able to reopen the
    // window on its own.
    this.pendingHit = null
    this.frames.reset()
    this.health = this.def.maxHealth
    this.lastStandActive = false
    this.transforming = false
    this.retreatVulnerableFor = 0
    this.arrivalDelay = 0
    this.lastTarget = null
    this.rammed.clear()

    // Back on foot. If he went down in the SUV the vehicle art is still on the
    // sprite, and the vehicle without its Last Stand stats would be a lie.
    if (this.body_.texture.key !== this.def.bodySprite) {
      this.body_.setTexture(this.def.bodySprite)
      this.artOffset = applyGroundRender(this.body_, this.def.bodySprite)
      this.shadow.destroy()
      this.shadow = makeShadow(this.scene, this.def.bodySprite)
      this.addAt(this.shadow, 0)
      this.captureRest()
    }
    this.body_.setFlipX(this.facingRight)
    this.body_.x = this.facingRight ? -this.artOffset : this.artOffset

    this.setPosition(this.homeX, this.homeY)
    this.rallyX = this.homeX
    this.rallyY = this.homeY
    this.setVisible(true)
    this.setAlpha(1)
    this.shadow.setVisible(true)
    this.bar.setVisible(true)
    this.drawBar()
    ySort(this)

    this.setScale(0.4)
    this.scene.tweens.add({
      targets: this, scale: 1, duration: 260, ease: 'Back.easeOut',
    })
    this.emit('revived')
  }

  /** Where he will come back on, so the scene can mark the spot. */
  get returnPoint(): { x: number; y: number } {
    return { x: this.homeX, y: this.homeY }
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

    // How many of his hands are full.
    //
    // He holds three enemies and no more; the rest walk past. That was already
    // true in the code and invisible on the screen, so what a player saw was a
    // pile of eight enemies standing on one man and the obvious conclusion was
    // that he was blocking all of them and losing. Three pips over the health
    // bar say what the rule actually is, and turn amber together the moment
    // there is no room left — which is the moment the next enemy walks by.
    const cap = this.def.blockCapacity
    if (cap > 0 && !this.down) {
      const full = this.blocking >= cap
      const pipW = 5
      const pipGap = 3
      const totalW = cap * pipW + (cap - 1) * pipGap
      const py = y - 7
      for (let i = 0; i < cap; i++) {
        const px = -totalW / 2 + i * (pipW + pipGap)
        const held = i < this.blocking
        this.bar.fillStyle(held ? (full ? 0xf2a03c : 0xf6ecd9) : 0x14181f, held ? 1 : 0.75)
        this.bar.fillRect(px, py, pipW, 4)
      }
    }
  }
}

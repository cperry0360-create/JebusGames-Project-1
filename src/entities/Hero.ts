import Phaser from 'phaser'
import type { HeroDef } from '../types.ts'
import { ySort } from '../systems/DepthSort.ts'
import { pickNearest, withinRadius } from '../systems/Targeting.ts'
import { HeroFrames, type FrameDef, type HeroPose } from '../systems/HeroFrames.ts'
import { makeShadow, deathPuff } from '../systems/Presentation.ts'
import { applyGroundRender } from '../systems/Art.ts'
import { facesLeft, mirroredFor } from '../systems/Facing.ts'
import { restFacingTarget } from '../systems/HeroFacing.ts'
import presentationData from '../data/presentation.json'
import { attackFramesFor, heroHeight, heroSprite, walkFramesFor } from '../systems/Heroes.ts'
import {
  TRANSFORM_BELOW, TRANSFORM_INVULNERABLE_SECONDS, applyHit, attackInterval,
  damageToHero, outgoingDamage,
} from '../systems/Transform.ts'
import { Enemy } from './Enemy.ts'

const PRESENTATION = presentationData

/** The procedural walk cycle: how far, and how fast. Two pixels reads as
 *  steps; four reads as a hovercraft. */
const BOB_PIXELS = 2.5
const BOB_SPEED = 11

/**
 * Cory. Rally-point control, not free movement: select him, tap a spot, he
 * walks there and fights whatever arrives.
 *
 * He has two forms. On foot he is a man with a rolled-up newspaper; powered,
 * he is in a spiked Rivian that is wider than the road and does not care about
 * it. ALL FIVE HEROES ARE DRAWN FACING RIGHT and none of them needs a
 * correction: which way the art points is still a property of the hero
 * (`artFacing`) rather than a rule in here, because it was a rule in here —
 * "both hero sprites are drawn facing LEFT", true of the only hero there was
 * when it was written — and it made the four added afterwards walk backwards.
 *
 * Three rules are load-bearing here:
 *   - THE TRANSFORMATION FIRES ONCE, AT HALF HEALTH, PER LIFE. There used to
 *     be two of them: the powered form at half, and Last Stand at a quarter
 *     with its own ceremony, its own sprite field and its own once-per-
 *     ENCOUNTER flag that survived a revive — so a hero who went down at wave
 *     four played the rest of the level with the climax spent. They are one
 *     event now, and dying is what re-arms it.
 *   - Going down takes him off the board for `reviveSeconds`, then he comes
 *     back at full health ON THE SPOT HE FELL, still holding whatever rally
 *     order he was under. `down` gates movement, attacking and further damage
 *     for the whole of that. He used to reappear at the map's entrance with
 *     his orders wiped, which cost the player a walk they had already paid
 *     for and cancelled an instruction they had not withdrawn.
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
  /** Seconds until he walks back on, or 0 whenever he is up. */
  reviveIn = 0
  /** Seconds left of the window where breaking off a fight costs extra
   *  damage. The scene draws a marker while this is running. */
  retreatVulnerableFor = 0
  /** Seconds left of the transformation window, during which nothing can hurt
   *  him. The transformation is the hero's one scripted moment and it was
   *  possible to be killed in the middle of it. */
  invulnerableFor = 0
  /**
   * Powered form: entered the first time this life's health is at or below
   * half, kept until the hero dies.
   *
   * ONE FLAG, AND IT USED TO BE TWO. `lastStandActive` said the same thing
   * about the same hero from a different threshold, and everything that
   * changes in the powered form -- damage, reach, speed, hitting everything in
   * range, the ramming, the incoming reduction -- was split across the pair.
   */
  powered = false
  /** Seconds of the bob's own clock. */
  private bobPhase = 0
  /** Whether the floating bar is currently faded IN. Tracked rather than read
   *  back off the alpha, which is mid-tween most of the time it matters. */
  private barShown = false
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
  /** Offset that puts the art's feet (or wheels) on his position; negated on
   *  a flip, exactly as the enemies do it. */
  private artOffset = 0
  /** Which hero this is, for the roster lookups: art, walk frames, powered
   *  form. Taken from the run rather than inferred from the def, because two
   *  heroes could legitimately share a name. */
  readonly heroId: string
  /** Where the sprite sits when it is not bobbing. */
  private restingBodyY = 0
  /**
   * Which way he is HEADING, not which way the sprite is drawn.
   *
   * The two are the same question for every hero on the roster today, since
   * all five face right — but they are still two questions, and the code that
   * assumed otherwise is what made four heroes walk backwards. `mirrored`
   * resolves this against the hero's own `artFacing`.
   */
  private headingLeft = false
  /** Whatever he swung at last frame, so `engaged` can be asked before the
   *  order is carried out rather than after. */
  private lastTarget: Enemy | null = null
  /**
   * Where enemies come onto this level, so a hero with nothing to look at
   * still looks the right way.
   *
   * SET BY THE SCENE FROM MAP DATA, never guessed here. It was "left", which
   * is true of levels 1 and 2 and false of 3 and 4 — those have two gates that
   * merge, and a hero posted past the merge has one of them up and to the left
   * and the other down and to the left. Empty until the scene says otherwise,
   * and an empty list means "keep the facing you have" rather than a default.
   */
  arrivalPoints: Array<{ x: number; y: number }> = []
  /** Set while the transformation plays, so he neither moves nor fights. */
  private transforming = false
  /** Enemies currently under a charging hero, so one pass is one hit each. */
  private readonly rammed = new Set<Enemy>()
  /** Set when he is ordered away mid-fight, applied when he arrives: he
   *  cannot swing for a moment after pulling out of one fight and into
   *  another. */
  private arrivalDelay = 0
  /**
   * Where he went down, which is where he comes back.
   *
   * This replaces `homeX/homeY`, a readonly pair set once from map.json
   * heroStart. Those made every revive a teleport to the entrance however far
   * up the lane the player had walked him. Seeded to his starting position so
   * the field is meaningful before he has ever fallen.
   */
  private fellX: number
  private fellY: number
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

  constructor(scene: Phaser.Scene, x: number, y: number, def: HeroDef, heroId = 'cory') {
    super(scene, x, y)
    this.def = def
    this.heroId = heroId
    this.health = def.maxHealth
    this.rallyX = x
    this.rallyY = y
    this.fellX = x
    this.fellY = y

    this.shadow = makeShadow(scene, def.bodySprite)
    this.body_ = scene.add.sprite(0, 0, def.bodySprite)
    this.artOffset = applyGroundRender(this.body_, def.bodySprite)
    this.restingBodyY = this.body_.y
    this.captureRest()
    this.bar = scene.add.graphics()
    // STARTS INVISIBLE, because he starts at full health. `drawBar` fades it
    // in the first time he is hurt.
    this.bar.setAlpha(0)
    this.add([this.shadow, this.body_, this.bar])
    scene.add.existing(this)
    this.drawBar()
    ySort(this)
  }

  get alive(): boolean {
    return !this.down
  }

  get damage(): number {
    return outgoingDamage(this.def.damage, this.def.powered, this.powered)
  }

  get attackInterval(): number {
    return attackInterval(this.def.attackInterval, this.def.powered, this.powered)
  }

  /** Powered, the hero's reach, hold and speed all grow. */
  get attackRange(): number {
    return this.def.attackRange * (this.powered ? this.def.powered.attackRangeMultiplier : 1)
  }

  get blockRange(): number {
    return this.def.blockRange * (this.powered ? this.def.powered.blockRangeMultiplier : 1)
  }

  get moveSpeed(): number {
    return this.def.moveSpeed * (this.powered ? this.def.powered.moveSpeedMultiplier : 1)
  }

  /**
   * True once the powered form charges through the lane rather than standing
   * beside it.
   *
   * IT WAS `inVehicle`, WHICH IS ONE HERO'S PICTURE. Cory's powered form is a
   * spiked Rivian; Bailey's is a dog. All five ram -- every hero's `powered`
   * block carries `rammingDamage` -- so the name is about what the rule does
   * rather than about what Cory is driving.
   */
  get charging(): boolean {
    return this.powered && !this.transforming
  }

  /** Half the drawn footprint. The powered form is wider than a person, so the
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

  /**
   * The box a tap on him has to land in, in world pixels, relative to his
   * position — which is at his FEET, because the art is base-anchored.
   *
   * It was a circle of radius 30 around his feet, a hardcoded number in a .ts
   * file. Cory renders 75.8 world pixels tall and 62.3 across, so that circle
   * covered 40% of his height, all of it below the waist, plus thirty pixels
   * of grass under him where he is not. His head, chest and face — the top
   * 46px, sixty per cent of the man — could not be tapped at all.
   *
   * A BOX, NOT A CIRCLE: he is drawn roughly rectangular, and a circle wide
   * enough to reach his shoulders reaches just as far out into empty grass on
   * either side of his knees. The margin is proportional to his size rather
   * than a constant, so the SUV — which is wider and shorter — gets a hit area
   * that matches the SUV.
   */
  get pickBox(): { x: number; y: number; width: number; height: number } {
    const m = PRESENTATION.heroPick
    const w = this.body_.displayWidth * (1 + m.marginFraction * 2)
    const h = this.body_.displayHeight * (1 + m.marginFraction * 2)
    return {
      x: this.x - w / 2,
      // displayHeight up from the feet, then the margin split above and below.
      y: this.y - this.body_.displayHeight - (h - this.body_.displayHeight) / 2,
      width: Math.max(m.minWidth, w),
      height: Math.max(m.minHeight, h),
    }
  }

  /** His art is base-anchored like the towers and enemies now, so ground
   *  markings sit on his position rather than below it. */
  get footOffsetY(): number {
    return 0
  }

  hits(x: number, y: number): boolean {
    const b = this.pickBox
    return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height
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
        // The powered form swings wildly at everything in range rather than
        // picking a target, which is the whole point of losing precision.
        // The swing STARTS here; it does not land here. Who it lands on is
        // chosen now, on the frame the player saw him commit, and the damage
        // is applied on the animation's impact frame — otherwise the hit
        // resolves before the axe has moved.
        const victims = this.powered && this.def.powered.hitsAllInRange
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
    } else {
      // STANDING THERE WITH NOTHING IN REACH, which is most of a run.
      //
      // He used to keep whichever way he last turned, which on the first frame
      // of a level is whichever way the constructor happened to leave him. The
      // rule is in `HeroFacing`: the nearest live enemy at ANY distance — not
      // just the ones inside `attackRange`, which is 70 to 122 world pixels on
      // a 1280px board, so a hero can watch a wave walk the length of the map
      // with his back to it and still be "correct" — and, with the board
      // empty, the nearest gate enemies actually arrive through.
      // The nearest enemy ANYWHERE, found with the same `pickNearest` the
      // attack targeting uses so the two cannot disagree about which one it
      // is -- just without the range limit, which is the whole difference
      // between "who am I fighting" and "who should I be looking at".
      const seen = pickNearest(enemies, this.x, this.y, Infinity)
      // A plain point rather than `this`: without node_modules the Container
      // base is absent, so `this` satisfies no structural parameter and the
      // call reads as an error locally whether or not it is one. See
      // CLAUDE.md on tsdiff.
      const look = restFacingTarget({ x: this.x, y: this.y }, seen, this.arrivalPoints)
      if (look) this.faceTowards(look.x, look.y)
    }

    // The frame goes on last, after the position and facing are final, and it
    // carries the pending hit: the swing's damage is applied from inside here
    // because that is where the impact frame is known.
    this.applyPose(dt, walking)
    // The stand-in for the four heroes with no walk sheet. After applyPose,
    // which is what sets the resting position it works from.
    this.bob(dt, walking)

    if (this.charging) this.ram(enemies, onHit)

    // Depreciation: anything standing near Cory quietly loses its armour.
    const p = this.def.passive
    for (const e of withinRadius(enemies, this.x, this.y, p.armorShredRadius)) {
      e.shredArmor(p.armorShredPerSecond * dt, p.maxArmorShred)
    }

    ySort(this)
  }

  /**
   * Contact damage. Powered, the hero goes over the lane instead of standing
   * beside it, so anything inside the footprint is hit once and shoved back
   * down the road rather than politely blocked.
   */
  private ram(enemies: Enemy[], onHit: (enemy: Enemy, damage: number) => void): void {
    const ls = this.def.powered
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

  /** Returns 'transform' or 'down' when this hit changed the hero's state. */
  hurt(amount: number): 'none' | 'transform' | 'down' {
    if (this.down) return 'none'
    // The transformation is not a window to kill him in.
    if (this.invulnerableFor > 0) return 'none'

    // POWERED FORM COMES OFF LAST, after the retreat penalty, so it is 40% off
    // whatever the hit had become rather than 40% off the base and then
    // multiplied back up. There is no second multiplier to compose with any
    // more: Last Stand's 1.5x lived at a different threshold, and merged onto
    // this one it cancelled most of the reduction. See Transform.ts.
    const exposed = this.retreatVulnerableFor > 0 ? this.def.retreat.damageTakenMultiplier : 1
    const damage = damageToHero(amount * exposed, this.powered, 0)

    // One rule, in one place, so death cannot be decided before the transform
    // is. See `applyHit`: a hit that would carry him through the band leaves
    // him standing at it instead of killing him outright.
    const out = applyHit(this.health, this.def.maxHealth, damage, this.powered)
    this.health = out.health
    this.drawBar()

    if (out.down) {
      this.goDown()
      return 'down'
    }
    // CHECKED AFTER THE HIT LANDS, on the health that is left. Asking before
    // would power him up at 51% because the incoming blow was going to take
    // him under, which is a different moment from the one the player sees.
    if (out.triggers) {
      this.transform()
      return 'transform'
    }
    return 'none'
  }

  /** Which way the hero is HEADING, whatever the art does about it. The held
   *  beam opens pointing this way when there is nothing on the board to aim
   *  at, which is the one case where the direction has no other source. */
  get facingLeft(): boolean {
    return this.headingLeft
  }

  /** Whether the sprite is mirrored right now: the heading, resolved against
   *  the way this particular hero's art was drawn. */
  private get mirrored(): boolean {
    return mirroredFor(this.headingLeft, this.def.artFacing)
  }

  /** The flip and the anchor, which always move together: the horizontal
   *  ground-anchor correction changes sign when the sprite is mirrored. One
   *  place, because the five call sites that did it by hand are five chances
   *  to update the flip and forget the offset. */
  private applyFacing(): void {
    this.body_.setFlipX(this.mirrored)
    this.body_.x = this.mirrored ? -this.artOffset : this.artOffset
  }

  /**
   * Records the resting scale of the sprite and the shadow.
   *
   * The pose is a set of MULTIPLIERS, so it needs something to multiply. Read
   * back off the sprite each frame it would compound: a 3% squash applied to
   * an already-squashed sprite walks the scale down until he is a puddle.
   * Called again after the transformation, which replaces both objects.
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

    // The powered form has its own sprite and no clips of its own. Swapping
    // frames under it would put a walking hero back on screen mid-change.
    if (this.charging) {
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
    if (key === this.body_.texture.key) return
    // THROUGH `wearSprite`, so the anchor AND the height are both re-read.
    // This used to call `applyGroundRender` directly, which takes its height
    // from the manifest -- and Cory's powered art deliberately has none there,
    // because the Rivian's size is a fact about the hero and lives in
    // heroes.json. No hero has frame clips any more, so `frameKey` returns the
    // hero's current form and this branch now fires on a pose CHANGE rather
    // than on a frame change: starting to walk while powered would have
    // re-anchored the Rivian at its unscaled 700px source height.
    this.wearSprite(key)
  }

  /**
   * Puts on a different picture and re-anchors.
   *
   * The two forms share neither a canvas nor a foot fraction, so the anchor is
   * re-read from the manifest on every swap. The HEIGHT is asked of the roster
   * first: Cory's powered Rivian is sized by `heroes.json cory.poweredHeight`
   * rather than by its art entry, because how big that vehicle is drawn is a
   * decision about him and not about the picture. Every other hero gets
   * `undefined` and is sized by its art exactly as before.
   */
  private wearSprite(key: string, powered = this.powered): void {
    this.body_.setTexture(key)
    this.artOffset = applyGroundRender(this.body_, key, heroHeight(this.heroId, powered))
    this.applyFacing()
    this.restingBodyY = this.body_.y
    this.captureRest()
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
    const clip = (pose === 'walk' ? walkFramesFor(this.heroId)
      : pose === 'attack' ? attackFramesFor(this.heroId) : null) ?? []
    const key = clip[index]
    if (key && this.scene.textures.exists(key)) return key
    // No sheet for this pose: the hero's CURRENT form, so a powered hero with
    // no frames does not drop back to its base picture the moment it moves.
    return heroSprite(this.heroId, this.powered)
  }

  /**
   * The walk cycle: a couple of pixels, up and down.
   *
   * ALL FIVE HEROES GET IT NOW. It used to be the stand-in for the four with
   * no walk sheet, skipped for the one that had one -- and the condition was
   * the sheet's presence rather than a flag, precisely so that dropping real
   * frames in would turn it off by itself. That went the other way in the end:
   * Cory's sheet was deleted rather than four more being drawn, so there is no
   * hero left for the exemption to apply to and the branch that tested for it
   * could only ever answer the same way.
   *
   * Two pixels of vertical travel is enough to read as steps without
   * pretending to be animation.
   */
  private bob(dt: number, moving: boolean): void {
    if (!moving) {
      this.bobPhase = 0
      this.body_.y = this.restingBodyY
      return
    }
    this.bobPhase += dt * BOB_SPEED
    this.body_.y = this.restingBodyY - Math.abs(Math.sin(this.bobPhase)) * BOB_PIXELS
  }

  private faceTowards(x: number, y: number): void {
    const angle = Math.atan2(y - this.y, x - this.x)
    // The HEADING, asked the same way the enemies and the fighters ask it.
    // It used to be asked about `angle + Math.PI` and stored as "facing
    // right", which is the blanket inversion that made four of the five heroes
    // walk backwards. The mirroring is resolved from the heading and the
    // hero's own `artFacing` in `mirrored`.
    const left = facesLeft(angle, this.headingLeft, PRESENTATION.facing.deadZone)
    if (left === this.headingLeft) return
    this.headingLeft = left
    this.applyFacing()
  }

  /**
   * THE TRANSFORMATION. At half health, once per life, for every hero.
   *
   * The hero goes away for half a second and comes back in the powered form —
   * the pause is the point, so the swap is a beat rather than a sprite change.
   *
   * THIS IS THE MERGE OF TWO METHODS. `transformToPowered` fired at half
   * health and did the quiet half — the flag, the sprite, a ring, the grace —
   * and `triggerLastStand` fired at a quarter and did the loud half — the
   * shake, the flash, the half-second pause, a SECOND sprite swap to
   * `ultimateSprite`, which named the same picture, and a name shouted across
   * the board. A player saw the hero change twice in one life and heard Cory's
   * voice line whoever they were playing. There is one change now and this is
   * it: the loud staging, the one sprite, and the grace and the reduction from
   * rules.json.
   *
   * THE GRACE IS NOT A REDUCTION. It is there so the hero cannot be deleted
   * mid-swap, and against a boss swinging for a third of the bar a 40% cut
   * would not do that job.
   */
  private transform(): void {
    const pf = this.def.powered
    this.powered = true
    this.transforming = true
    // Nothing may kill the hero while they are off the board changing, and
    // they come back with a moment to act — the transformation is the hero's
    // one scripted beat and it is worth nothing if the wave standing on them
    // simply carries on hitting the empty space. ONE NUMBER, from rules.json:
    // the grace belongs to the rule, not to a hero, and it was two.
    this.invulnerableFor = TRANSFORM_INVULNERABLE_SECONDS

    const cam = this.scene.cameras.main
    cam.shake(pf.transformShakeMs, 0.012)
    cam.flash(pf.transformFlashMs, 255, 255, 255)
    this.scene.tweens.add({ targets: this.body_, alpha: 0, duration: 140 })

    this.scene.time.delayedCall(pf.transformPauseMs, () => {
      if (this.down) return
      // THE ROSTER DECIDES WHICH PICTURE, not a field on the hero. It read
      // `def.ultimateSprite`, a second key beside `poweredSprite` that named
      // the same file in all five heroes; the roster in art.json is what
      // `heroSprite` and every other form swap already ask.
      const key = heroSprite(this.heroId, true)
      if (this.scene.textures.exists(key)) {
        // Through `wearSprite`, so the powered form is sized by the rule that
        // sizes it everywhere else. Cory's carries a height that lives with
        // the hero rather than with the art -- setting the texture by hand
        // here bypassed that and drew the Rivian at whatever its art entry
        // happened to say, which is nothing.
        this.wearSprite(key, true)
        // The shadow belongs to the new shape, not to the old one.
        this.shadow.destroy()
        this.shadow = makeShadow(this.scene, key)
        this.addAt(this.shadow, 0)
      }
      this.body_.setAlpha(0)
      this.scene.tweens.add({ targets: this.body_, alpha: 1, duration: 180 })
      this.scene.cameras.main.shake(160, 0.008)
      this.transforming = false
      this.drawBar()
      // THE MOMENT OF THE TRANSFORMATION, announced rather than left to two
      // timers that happen to agree. Everything that has to land ON the new
      // form appearing — the sting, and a voice line's first word, which is
      // scheduled to arrive here — hangs off this.
      this.emit('transformed')
    })
    // Separately from 'transformed', and half a second earlier: the cooldown
    // reset and the HUD's gate belong to the DECISION, not to the picture, and
    // a button that lights up when the animation finishes reads as lag.
    this.emit('powered')
    this.drawBar()
  }

  /**
   * He leaves the map entirely.
   *
   * The old version tipped him on his side and faded to 35% alpha, which left
   * a ghost of the powered sprite lying on the board for the rest of the
   * encounter — read as a rendering fault rather than a death, and sat on top
   * of build pads. The downed state belongs on the HUD, where the hero bar
   * already greys out and the label reads "— DOWN".
   */
  private goDown(): void {
    this.down = true
    this.reviveIn = this.def.reviveSeconds
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
    this.fellX = this.x
    this.fellY = this.y
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
   * ONCE PER LIFE, SO DYING RE-ARMS IT. `powered` is cleared here and the
   * hero walks back on in base form with the transformation to earn again.
   * Last Stand used to be the opposite — its own flag was deliberately NOT
   * cleared, which meant a hero who went down at wave four played the rest of
   * the level with the beat spent and no way to get it back. There is one
   * transformation now and this is its rule.
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
    // BACK TO BASE, and it has to be earned again. The powered form is a fact
    // about one life, not about the run.
    this.powered = false
    this.transforming = false
    this.retreatVulnerableFor = 0
    this.arrivalDelay = 0
    this.lastTarget = null
    this.rammed.clear()

    // Back on foot. If he went down powered the powered art is still on the
    // sprite, and that shape without the powered stats would be a lie.
    if (this.body_.texture.key !== this.def.bodySprite) {
      // `powered` is already false by here, so the base form is sized as the
      // base form -- the height override is asked for the form he is IN.
      this.wearSprite(this.def.bodySprite, false)
      this.shadow.destroy()
      this.shadow = makeShadow(this.scene, this.def.bodySprite)
      this.addAt(this.shadow, 0)
    }
    this.applyFacing()

    // WHERE HE FELL, AND STILL UNDER ORDERS.
    //
    // Two things used to happen here and neither was asked for. He was moved
    // to `homeX/homeY` — a readonly pair set once from map.json heroStart — so
    // however far up the lane the player had walked him, he came back at the
    // entrance. And `rallyX/rallyY` were reset to the same point, which threw
    // away the standing order without saying so: the player's last deliberate
    // instruction was cancelled by his death.
    //
    // He returns where he went down. The rally point is untouched, so if he
    // was under orders he walks back to them himself.
    this.setPosition(this.fellX, this.fellY)
    this.setVisible(true)
    this.setAlpha(1)
    this.shadow.setVisible(true)
    this.bar.setVisible(true)
    // Back at full health, so the bar has nothing to say; `drawBar` takes it
    // down through the same fade rather than snapping it off.
    this.barShown = true
    this.drawBar()
    ySort(this)

    this.setScale(0.4)
    this.scene.tweens.add({
      targets: this, scale: 1, duration: 260, ease: 'Back.easeOut',
    })
    this.emit('revived')
  }

  /** Where he will come back, so the scene can mark the spot. The spot he
   *  fell on, not the entrance. */
  get returnPoint(): { x: number; y: number } {
    return { x: this.fellX, y: this.fellY }
  }

  /**
   * Shows the floating bar and starts its fade, or fades it out at full health.
   *
   * THE BAR IS ONLY UP WHILE HE IS HURT. It used to be up always, which put a
   * permanent readout over the hero's head on a board whose whole look is
   * "nothing between the player and the map" — and the number it carried is on
   * the portrait chip now, where the thumb already is. What a floating bar is
   * FOR is the moment the damage happens: it is worth seeing where the hit
   * landed, and worth nothing for the twenty seconds afterwards.
   *
   * Tweened rather than toggled: an element that blinks on and off over a
   * moving sprite reads as a rendering fault. The fade is on the bar's own
   * alpha rather than on `visible`, so a hit during a fade-out catches the
   * bar on its way down and takes it back up from wherever it got to.
   */
  private syncBarVisibility(): void {
    const want = !this.down && this.health < this.def.maxHealth
    if (want === this.barShown) return
    this.barShown = want
    this.scene.tweens.killTweensOf(this.bar)
    this.scene.tweens.add({
      targets: this.bar,
      alpha: want ? 1 : 0,
      duration: want ? PRESENTATION.heroBarFade.inMs : PRESENTATION.heroBarFade.outMs,
      ease: want ? 'Quad.easeOut' : 'Quad.easeIn',
    })
  }

  private drawBar(): void {
    this.syncBarVisibility()
    // Sized and floated from the art, so the bar grows with the vehicle.
    const w = Phaser.Math.Clamp(this.body_.displayWidth * 0.62, 46, 96)
    const y = -this.body_.displayHeight - 10
    const ratio = Phaser.Math.Clamp(this.health / this.def.maxHealth, 0, 1)
    this.bar.clear()
    this.bar.fillStyle(0x14181f, 0.9).fillRect(-w / 2 - 1, y - 1, w + 2, 7)
    this.bar.fillStyle(this.powered ? 0xff5a3c : 0x4fa3e3, 1).fillRect(-w / 2, y, w * ratio, 5)
    // ONE THRESHOLD, AND IT IS THE ONE THAT FIRES. There were two marks --
    // this hero's `lastStand.healthThreshold` at a quarter and rules.json's
    // transformation at a half -- for what is now one event, and the quarter
    // was the one a player noticed.
    const markX = -w / 2 + w * TRANSFORM_BELOW
    this.bar.lineStyle(1, 0xf6ecd9, 0.7).lineBetween(markX, y, markX, y + 5)

    // How many of his hands are full.
    //
    // He holds three enemies and no more; the rest walk past. That was already
    // true in the code and invisible on the screen, so what a player saw was a
    // pile of eight enemies standing on one man and the obvious conclusion was
    // that he was blocking all of them and losing. Three pips over the health
    // bar say what the rule actually is, and turn amber together the moment
    // there is no room left — which is the moment the next enemy walks by.
    // The block pips ride on the same Graphics as the health bar, so they fade
    // with it. That is the right answer rather than a compromise: he is only
    // holding anything while something is hitting him, and something hitting
    // him is exactly when the bar is up.
    const cap = this.def.blockCapacity
    if (cap > 0 && !this.down) {
      const full = this.blocking >= cap
      // BIGGER, AND ON A PLATE. They were 5x4 world pixels with no backing,
      // which at the zoom a run opens at is about two device pixels of unlit
      // dark-on-dark -- a playtester reported them as "small dots above his
      // head that seem to fill up", which is exactly what an illegible readout
      // looks like. Same information, at a size that can carry it.
      const pipW = 9
      const pipGap = 4
      const pipH = 6
      const totalW = cap * pipW + (cap - 1) * pipGap
      const py = y - pipH - 4
      this.bar.fillStyle(0x14181f, 0.9)
      this.bar.fillRect(-totalW / 2 - 2, py - 2, totalW + 4, pipH + 4)
      for (let i = 0; i < cap; i++) {
        const px = -totalW / 2 + i * (pipW + pipGap)
        const held = i < this.blocking
        this.bar.fillStyle(held ? (full ? 0xf2a03c : 0xf6ecd9) : 0x323a46, 1)
        this.bar.fillRect(px, py, pipW, pipH)
      }
    }
  }
}

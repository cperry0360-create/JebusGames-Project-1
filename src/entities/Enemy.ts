import Phaser from 'phaser'
import type { EnemyDef, TaxPhase } from '../types.ts'
import { Path } from '../systems/Path.ts'
import { Disabler } from '../systems/TowerDisable.ts'
import { ySort } from '../systems/DepthSort.ts'
import { canStun, damageAfterArmor, diminishedSeconds, slowedSpeed, slowStacksAfter, stunLockoutFor, type DiminishDef } from '../systems/Combat.ts'
import { makeShadow, PRESENTATION, floatingDamage, deathPuff } from '../systems/Presentation.ts'
import { emergeState, vanishAlpha, type EmergeConfig } from '../systems/Gateway.ts'
import { MAIN_LANE, followMerges, type LaneNetwork } from '../systems/Lanes.ts'
import { applyGroundRender } from '../systems/Art.ts'
import { facesLeft, mirroredFor } from '../systems/Facing.ts'
import rulesData from '../data/rules.json'
import { onBoard } from '../systems/Liveness.ts'

const RULES = rulesData

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
  /**
   * TOTAL distance walked, across every lane this enemy has been on.
   *
   * MONOTONIC BY CONSTRUCTION: it only ever has movement added to it, and a
   * merge does not touch it. That is what targeting sorts on — "furthest
   * along" — and why a transfer cannot make a tower drop the enemy it was
   * shooting and pick a different one on the same frame.
   *
   * On a single-lane map this is identical to `laneDistance` at every instant,
   * which is why levels 1 and 2 behave exactly as before.
   */
  distance = 0
  /**
   * Distance along the lane this enemy is on RIGHT NOW, which is what its
   * position is looked up with. Reset to the join point when a branch merges,
   * so it is NOT monotonic and must never be used for targeting.
   */
  laneDistance = 0
  /** The lane being walked. Changes at a merge. */
  laneId: string
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
  /**
   * The enemy that called this one in, or null for a scripted spawn.
   *
   * Load-bearing in two places: a wave is over when its SCRIPTED spawns are
   * gone, so this is what `checkWaveOver` filters on; and a summoner's cap
   * counts the children still pointing at it. It is deliberately NOT cleared
   * when the parent dies — the children stay, and they stay ITS children, so
   * a dead summoner's brood cannot be miscounted against a live one.
   */
  readonly summonedBy: Enemy | null
  /** Counts down to the next burst. Only a summoner uses it. */
  private summonTimer = 0
  /**
   * The tower-disable clock, or null for the great majority of enemies that do
   * not have one.
   *
   * Held here rather than in the scene so it lives and dies with the enemy: a
   * boss that is killed mid-windup takes its half-finished cast with it, which
   * is the behaviour a player would otherwise call unfair.
   */
  readonly disabler: Disabler | null

  private lane: Path
  private readonly lanes: LaneNetwork | null
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
  /** How many stuns and slows have landed inside the diminishing window, and
   *  how long since the last one. A target left alone becomes dangerous
   *  again, so the counterplay is to move the pressure rather than to park one
   *  tower on one lane. */
  private stunStacks = 0
  private sinceStun = 0
  private slowStacks = 0
  private sinceSlow = 0
  private bobPhase = Math.random() * Math.PI * 2
  /** Distance from the feet to the art's frame centre, negated on a flip. */
  private readonly artOffset: number
  private readonly baseScaleX: number
  private facingLeft = false
  /**
   * Milliseconds since this enemy reached the arch mouth; negative until it
   * does. It is NOT time since spawn: an enemy spawns off the plate behind the
   * arch and walks to the mouth first, and how long that takes depends on how
   * fast it is. Tying the fade to the mouth means all four enemies emerge the
   * same way at their own speeds.
   */
  private sinceMouth: number
  /** True once fully emerged, after which the emergence stops recomputing. */
  private emerged = false
  /** Lane distance at which the arch mouth is reached, at which the gate gap
   *  begins to swallow it, and at which nothing is left. All three measured
   *  off the plate; see map.json. */
  private readonly mouthDistance: number
  private readonly gateDistance: number
  private readonly stopDistance: number
  private readonly emergeCfg: EmergeConfig
  /**
   * How far to the side of the lane centreline this one walks, in world px.
   *
   * Every enemy used to sit EXACTLY on the centreline: `pointAt(distance)` and
   * nothing else. A wave was therefore a single file, and two enemies at
   * different speeds walked straight through one another with no visual
   * separation at all. The road is 38 world pixels wide and nothing read that
   * number except the code that draws the band.
   *
   * Chosen once, at spawn, and kept — a per-frame wobble would be a swerve
   * rather than a lane. It is bounded so the enemy's own width stays on the
   * paint, so a Buckethead gets less room to wander than a Scrapper.
   */
  private readonly laneOffset: number
  /** The scale the art was built at, so the emergence scale-up multiplies it
   *  rather than replacing it. */
  private readonly baseScaleY: number

  constructor(
    scene: Phaser.Scene,
    def: EnemyDef,
    lane: Path,
    gate: {
      mouthDistance: number
      gateDistance: number
      stopDistance: number
      emerge: EmergeConfig
      /** Half the painted road's width, from map.json. Bounds the lateral
       *  spread so nobody walks in the grass. */
      laneHalfWidth: number
    },
    /** The map's lanes, and which one this enemy walks in on. Omitted on a
     *  single-lane map, where there is nothing to transfer to and `lane` is
     *  the whole route. */
    network?: {
      lanes: LaneNetwork
      laneId: string
      /** Where to appear, for a summoned child: its parent's own place on the
       *  lane and its parent's progress, so it carries on from there rather
       *  than from the gate. */
      startAt?: { laneDistance: number; distance: number }
      /** The summoner that called this one in. */
      summonedBy?: Enemy
    },
  ) {
    super(scene, 0, 0)
    this.def = def
    this.lane = network ? network.lanes.lane(network.laneId).path : lane
    this.lanes = network?.lanes ?? null
    this.laneId = network?.laneId ?? MAIN_LANE
    this.summonedBy = network?.summonedBy ?? null
    this.laneDistance = network?.startAt?.laneDistance ?? 0
    this.distance = network?.startAt?.distance ?? 0
    // A summoner's first burst waits a full interval, so a boss does not
    // arrive with a crowd already around it.
    this.summonTimer = def.summons?.interval ?? 0
    this.disabler = def.towerDisable ? new Disabler(def.towerDisable) : null
    this.maxHealth = def.maxHealth
    this.health = def.maxHealth

    this.shadow = makeShadow(scene, def.sprite)
    this.art = scene.add.sprite(0, 0, def.sprite)
    // Anchor and on-screen size come from the manifest, so the three enemies
    // keep the sizes they were drawn at relative to each other.
    this.artOffset = applyGroundRender(this.art, def.sprite)
    this.baseScaleX = this.art.scaleX
    // THE FIRST FRAME COUNTS. `face()` early-returns when the heading has not
    // changed, so an enemy that spawns walking the way it starts out facing
    // never reaches it -- and a left-drawn sprite would stand there mirrored
    // wrongly until the lane happened to turn. The opening flip is applied
    // here, from the same two facts.
    const flip0 = mirroredFor(this.facingLeft, def.artFacing)
    this.art.setFlipX(flip0)
    this.art.x = flip0 ? -this.artOffset : this.artOffset
    this.bar = scene.add.graphics()
    // Shadow first, then the art, then the bar, so each draws over the last.
    this.add([this.shadow, this.art, this.bar])

    this.mouthDistance = gate.mouthDistance
    this.gateDistance = gate.gateDistance
    this.stopDistance = gate.stopDistance
    this.emergeCfg = gate.emerge
    this.baseScaleY = this.art.scaleY
    // Half the road, less half of this enemy, less a margin — then a fraction
    // of that, so nobody walks the very edge of the paint. Negative room (an
    // enemy wider than the road) collapses to the centreline rather than
    // pushing it off into the grass.
    const room = Math.max(0,
      gate.laneHalfWidth - this.art.displayWidth / 2) * RULES.laneSpread.fraction
    this.laneOffset = (Math.random() * 2 - 1) * room
    // Behind the arch and invisible, not at its mouth at full opacity.
    this.sinceMouth = -1
    const p = this.lane.pointAt(this.laneDistance)
    this.setPosition(p.x, p.y)
    scene.add.existing(this)
    this.applyEmergence(0)
    this.drawBar()
  }

  /**
   * Fades and grows the enemy as it comes out of the arch.
   *
   * The health bar is driven from the same alpha rather than being left at
   * full: a floating bar over an invisible enemy is exactly the giveaway this
   * whole change exists to remove. The shadow rides the alpha too, so nothing
   * casts a contact shadow while it is still under the stonework.
   */
  /**
   * Called once, on the tick this enemy reaches the arch mouth and starts to
   * fade in. Not on spawn: it spawns off the plate behind the arch and walks
   * to the mouth first, so a cue hung off the constructor fires while there is
   * still nothing to see.
   */
  onEmerge: (() => void) | null = null

  private applyEmergence(dt: number): void {
    // Stops writing once it is fully out, so the attack tween — which also
    // animates scaleX — is never fought over. Nothing is fighting anything
    // this early in the lane, but the two would collide silently if they ever
    // did, and that is the shape of bug this file has had before.
    if (this.emerged) return
    if (this.sinceMouth < 0) {
      if (this.laneDistance >= this.mouthDistance) {
        this.sinceMouth = 0
        const fn = this.onEmerge
        this.onEmerge = null
        fn?.()
      }
    } else {
      this.sinceMouth += dt * 1000
    }
    const e = emergeState(this.sinceMouth, this.emergeCfg)
    this.emerged = e.alpha >= 1
    this.art.setAlpha(e.alpha)
    this.bar.setAlpha(e.alpha)
    // Mirroring is setFlipX, not a negative scale, so both axes stay positive
    // here and the two mechanisms cannot cancel each other out.
    this.art.setScale(this.baseScaleX * e.scale, this.baseScaleY * e.scale)
    this.shadow.setAlpha(e.alpha * PRESENTATION.shadow.alpha)
  }

  /**
   * Fades the enemy out across the open gate's gap.
   *
   * Applied after `applyEmergence`, and only past the gap's near edge, so the
   * two ends of the lane never fight over the same alpha — the arch fade has
   * long since finished setting it to 1 by the time an enemy is 1235 world
   * pixels along.
   */
  private applyVanish(): void {
    // The gate belongs to the lane that reaches the exit. A branch has not
    // got there yet, so nothing on one fades.
    if (this.lanes && this.lanes.transferFrom(this.laneId)) return
    if (this.laneDistance <= this.gateDistance) return
    const a = vanishAlpha(this.laneDistance, this.gateDistance, this.stopDistance)
    this.art.setAlpha(a)
    this.bar.setAlpha(a)
    this.shadow.setAlpha(a * PRESENTATION.shadow.alpha)
  }

  /**
   * Still on the board, which is NOT the same as "not dead".
   *
   * A leaked enemy is destroyed by `GameScene.leak()` with its `status` still
   * `'walking'`, so `status !== 'dead'` reported it alive for the rest of the
   * run and a swing committed before it left crashed on its nulled `scene`.
   * `onBoard` is the one definition; see `systems/Liveness.ts`.
   */
  get alive(): boolean {
    return onBoard(this)
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

  applySlow(factor: number, seconds: number, diminish: DiminishDef): void {
    if (factor <= 0 || seconds <= 0) return
    // Crowd control the same way the line is: a flag on the enemy, not a rule
    // about tiers. See `EnemyDef.slowable`.
    if (!this.def.slowable) return
    // A slowed enemy is still walking, so a tower holding one at 45% speed is
    // the tower doing its job — but "allowed to refresh" and "can never lapse"
    // are not the same thing, and nothing made the second one false. Measured:
    // Deferral applies a 3.84s slow from a tower firing every 0.81s, so any
    // target it keeps shooting is slowed permanently.
    this.slowStacks = slowStacksAfter(this.sinceSlow, this.slowStacks, diminish)
    const dealt = diminishedSeconds(seconds, this.slowStacks, diminish)
    this.slowStacks++
    this.sinceSlow = 0
    if (dealt <= 0) return
    // A stronger slow replaces a weaker one; equal slows just refresh.
    if (factor <= this.slowFactor || this.slowRemaining <= 0) this.slowFactor = factor
    this.slowRemaining = Math.max(this.slowRemaining, dealt)
  }

  /**
   * Stops it dead, once, and then leaves it alone for a while.
   *
   * Refused outright while a stun is running or its lockout has not expired.
   * That refusal is the whole fix: the Amendment specialization stops a target
   * for 0.6s from a tower that fires every 0.81s, and refreshing on each shot
   * meant nothing it touched ever took another step.
   */
  applyStun(seconds: number, lockoutMultiple: number, diminish: DiminishDef): void {
    if (seconds <= 0) return
    if (!canStun(this.stunRemaining, this.stunLockout)) return
    // Each stop inside the window is shorter than the last. The lockout alone
    // only stopped a stun being refreshed while it ran; it did nothing to stop
    // the same tower stunning the same target again the moment it lapsed,
    // over and over, which is what "a single tower should never hold a target
    // indefinitely" is actually about.
    if (this.sinceStun > diminish.windowSeconds) this.stunStacks = 0
    const dealt = diminishedSeconds(seconds, this.stunStacks, diminish)
    this.stunStacks++
    this.sinceStun = 0
    if (dealt <= 0) {
      // Too short to be worth applying, but it still costs the attacker the
      // lockout — otherwise the tower simply tries again next shot.
      this.stunLockout = stunLockoutFor(seconds, lockoutMultiple)
      return
    }
    this.stunRemaining = dealt
    this.stunLockout = stunLockoutFor(dealt, lockoutMultiple)
  }

  /**
   * Hands this enemy over to the lane its branch joins, once it reaches the
   * end of the branch.
   *
   * `distance` IS NOT TOUCHED. That is the whole point: progress is the sum of
   * every step taken and a merge is not a step, so the enemy keeps its place
   * in the targeting order across the join. `laneDistance` jumps to wherever
   * the join lands on the new lane, which is the only thing that moves.
   *
   * Loops rather than transfers once, because a branch may join a branch that
   * joins the trunk, and a long frame can carry an enemy through both in one
   * step. `validateLanes` rejects the cycle that would make this unbounded.
   */
  private followMerge(): void {
    if (!this.lanes) return
    const at = followMerges(this.lanes, { laneId: this.laneId, laneDistance: this.laneDistance })
    if (at.laneId === this.laneId) return
    this.laneId = at.laneId
    this.laneDistance = at.laneDistance
    this.lane = this.lanes.lane(at.laneId).path
  }

  /**
   * True once this enemy has walked off the end of its route.
   *
   * Only a lane that reaches the exit can leak. A branch ENDS at its join, and
   * without this an enemy would count as escaped the moment it got there —
   * which on a fork is most of the way through the level.
   */
  private leaked(): boolean {
    if (this.lanes && this.lanes.transferFrom(this.laneId)) return false
    return this.laneDistance >= this.stopDistance
  }

  /** True for anything that was called in rather than scripted by the wave. */
  get summoned(): boolean {
    return this.summonedBy !== null
  }

  /**
   * How many children are due right now, advancing the burst timer.
   *
   * The scene does the spawning, not this: a child needs the lane network, the
   * gateway and a place on the scene's enemy list, and an entity that reached
   * back for all three would be a second spawner. This only answers "how
   * many", and only while the summoner is alive and walking.
   *
   * The CAP is applied by the caller, because only the scene can count how
   * many of this summoner's children are still on the field.
   */
  dueSummons(dt: number): number {
    const s = this.def.summons
    // The game's own notion of alive, not Phaser's `active`: a corpse mid
    // death-animation is still an object on the display list, and it must not
    // keep calling in help.
    if (!s || !this.alive) return 0
    this.summonTimer -= dt
    let due = 0
    // A long frame can owe more than one burst; pay them all out, the way the
    // wave spawner does.
    while (this.summonTimer <= 0) {
      due += s.count
      this.summonTimer += s.interval
    }
    return due
  }

  /** Where a child should start: this summoner's own place on its own lane. */
  get summonPoint(): { laneId: string; laneDistance: number; distance: number } {
    return { laneId: this.laneId, laneDistance: this.laneDistance, distance: this.distance }
  }

  /** Haymaker knockback: shoved back along the lane it came from. */
  knockBack(pixels: number): void {
    // Both, and by the same amount. The position goes back along the lane;
    // the progress goes back with it, because an enemy shoved twenty pixels
    // backwards that kept its place in the targeting order would be shot
    // ahead of the one that overtook it.
    //
    // Clamped at the lane's own start, not at zero progress: a knockback does
    // not push anyone back up the branch they merged out of.
    const back = Math.min(pixels, this.laneDistance)
    this.laneDistance -= back
    this.distance = Math.max(0, this.distance - back)
    const p = this.lane.pointAt(this.laneDistance)
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
    if (!this.alive) return false

    if (this.slowRemaining > 0) {
      this.slowRemaining -= dt
      if (this.slowRemaining <= 0) this.slowFactor = 0
    }
    if (this.stunRemaining > 0) this.stunRemaining -= dt
    if (this.shreddingFor > 0) this.shreddingFor -= dt
    this.sinceStun += dt
    this.sinceSlow += dt
    if (this.stunLockout > 0) this.stunLockout -= dt

    // Stopped means stopped: it does not walk and it does not swing. Held here
    // rather than inside each branch so a stunned enemy cannot leak an attack
    // through the fighting path.
    if (this.stunRemaining > 0) {
      this.applyEmergence(dt)
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
      const step = slowedSpeed(this.def.speed, this.slowFactor, this.slowed) * dt
      // Progress only ever grows. The lane position is what a merge rewrites.
      this.distance += step
      this.laneDistance += step
      this.followMerge()
      const p = this.lane.pointAt(this.laneDistance)
      const a = this.lane.angleAt(this.laneDistance)
      // Offset along the lane's NORMAL, so the spread follows the road round a
      // bend instead of shearing across it. (-sin, cos) is the left-hand
      // normal to the direction (cos, sin).
      this.setPosition(p.x - Math.sin(a) * this.laneOffset, p.y + Math.cos(a) * this.laneOffset)
      this.face(a)
      // The far side of the open gate's gap, not the end of the lane. The
      // enemy has been fading across the gap for the last few pixels, so by
      // here there is nothing left to see and the leak is bookkeeping.
      if (this.leaked()) return true
    }

    this.applyEmergence(dt)
    this.applyVanish()
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

  /**
   * Mirrors the art when the lane turns back to the left.
   *
   * TWO THINGS, AND THE SECOND ONE IS DATA: which way the enemy is heading,
   * and which way its art was drawn. This used to be a bare `setFlipX(left)`,
   * which is the same statement as "every enemy is drawn facing right" -- true
   * of all seven that existed when it was written, and false of all five added
   * for level 3, so the entire level walked backwards. `mirroredFor` is the
   * same function the heroes use, for the same reason.
   */
  private face(angle: number): void {
    const left = facesLeft(angle, this.facingLeft, PRESENTATION.facing.deadZone)
    if (left === this.facingLeft) return
    this.facingLeft = left
    const flip = mirroredFor(left, this.def.artFacing)
    this.art.setFlipX(flip)
    // Mirroring is about the art's centre, so the feet stay put once the
    // offset that put them on the lane is mirrored too.
    this.art.x = flip ? -this.artOffset : this.artOffset
  }

  /** Mid-body height, for anything that should land on the enemy rather than
   *  at its feet. Gameplay still measures everything at ground level. */
  get centreY(): number {
    return this.y - (this.art.displayHeight * this.art.originY) / 2
  }

  /** Returns true if this hit killed it. */
  hurt(damage: number, ignoresArmor: boolean, showNumber = true, pierce = 0): boolean {
    // The LAST of the three guards on the damage path, and the one that used
    // to ask only about `status`. A leaked enemy reached it destroyed but not
    // dead and `floatingDamage(this.scene, …)` threw on a nulled scene.
    if (!this.alive) return false
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
    // Idempotence AND existence. `alive` covers both: dying twice is a no-op,
    // and an enemy that left the board is not killed retrospectively.
    if (!this.alive) return
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

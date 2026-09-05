import Phaser from 'phaser'
import type { TowerDef, TowerSpec } from '../types.ts'
import { ySort } from '../systems/DepthSort.ts'
import { GROUND_ONLY, pickFirst } from '../systems/Targeting.ts'
import { boostedDamage } from '../systems/Combat.ts'
import { deathPuff, makeShadow, muzzleFlash, PRESENTATION } from '../systems/Presentation.ts'
import { applyRender, hasTierArt, tierSprite } from '../systems/Art.ts'
import { atSpecChoice, BASE_TIER, investedIn, isMaxed, maxTier, nextStep, specById, statAt } from '../systems/Upgrades.ts'
import rulesData from '../data/rules.json'
import type { RulesDef } from '../types.ts'
import { Enemy } from './Enemy.ts'

const UPGRADES = (rulesData as RulesDef).towerUpgrades

export class Tower extends Phaser.GameObjects.Container {
  readonly def: TowerDef
  readonly id: string
  /** Which build spot it stands on, so Restructure can free the old one. */
  spot: number
  /** Summed bonus from Tax Shelters in range, refreshed when towers change. */
  supportBonus = 0
  /** 1 when built. Tiers 2 and 3 are bought and take time to raise. */
  tier = BASE_TIER
  /** The tier-3 specialization, once chosen. Permanent for this tower. */
  spec: string | null = null
  /** Held while tier 3 is being raised, applied when the work finishes. */
  private pendingSpec: string | null = null

  private readonly turret: Phaser.GameObjects.Sprite
  /** Not readonly: a tower with tier art replaces its shadow when it grows,
   *  because a taller building's footing is not the same width. */
  private shadow: Phaser.GameObjects.Image
  private cooldown = 0
  /** Seconds left switched off by a boss, or 0 when it is working. Public
   *  because the scene draws the overlay from it and the picker skips a tower
   *  that is already dark. */
  disabledFor = 0
  /** How much road is left between this tower and the exit, set by the scene
   *  when it is built. Only the boss's tower-disable reads it, as a tie-break
   *  between two towers that cost the same. */
  distanceToExit = Infinity
  /** Seconds left on the tier currently going up, or 0 when it is finished. */
  private buildLeft = 0
  private buildTotal = 0
  private scaffold?: Phaser.GameObjects.Graphics
  /** Tier pips, drawn above the tower. Placeholder until tier art exists. */
  private pips!: Phaser.GameObjects.Graphics
  /** The turret's scale as the manifest set it, before any per-tier lift. */
  private baseScale = 1
  /** Consecutive shots landed on the same target, for the ramping specs. */
  private rampTarget: Enemy | null = null
  private rampStacks = 0
  /** Granted by neighbouring support towers, alongside the damage bonus. */
  grantedRange = 0
  grantedPierce = 0

  constructor(scene: Phaser.Scene, x: number, y: number, id: string, def: TowerDef, spot: number) {
    super(scene, x, y)
    this.id = id
    this.def = def
    this.spot = spot

    // Every tower's art carries its own base. The manifest used to point at a
    // Kenney placeholder tile to stand in for one; the painted towers made it
    // redundant and it is gone.
    this.shadow = makeShadow(scene, def.sprite)
    const parts: Phaser.GameObjects.GameObject[] = [this.shadow]
    this.turret = scene.add.sprite(0, 0, def.sprite)
    // Anchor and on-screen height come from the manifest, so a 512px tower and
    // a 64px turret both sit on the tile at the size the manifest asks for.
    applyRender(this.turret, def.sprite)
    this.baseScale = this.turret.scaleX
    parts.push(this.turret)
    this.pips = scene.add.graphics()
    parts.push(this.pips)
    this.add(parts)
    scene.add.existing(this)
    ySort(this)
    // Asked for rather than assumed: a tower built at tier 1 wears the same
    // sprite `def.sprite` names, but the tier is what decides, not the default.
    this.wearTier(false)
    this.drawTier()
    this.popIn()
  }

  /**
   * Whether a click lands on this tower.
   *
   * Measured against the drawn sprite rather than a radius around the base:
   * a tower stands about 115px tall, so a base-sized hit area misses most of
   * what the player is actually aiming at.
   */
  /** How tall the tower stands above its base, so a panel anchored beside it
   *  can flip clear of the whole thing rather than half of it. */
  get artHeight(): number {
    return this.turret.displayHeight
  }

  get artWidth(): number {
    return this.turret.displayWidth
  }

  hits(x: number, y: number): boolean {
    const halfW = this.turret.displayWidth / 2
    const top = this.y - this.turret.displayHeight
    return x >= this.x - halfW && x <= this.x + halfW && y >= top && y <= this.y + 8
  }

  /**
   * Puts on the sprite for the tier it is now.
   *
   * A tower with tier art changes silhouette as it grows, which is the primary
   * read; one without keeps the sprite it has always had and loses nothing.
   * The shadow is replaced with it, because a taller tower's footing is not
   * the same width as a shorter one's.
   *
   * The anchor is the bottom centre of every tier, so the base stays where it
   * was planted and the tower grows upward out of it.
   */
  private wearTier(animate: boolean): void {
    const key = tierSprite(this.def.sprite, this.tier)
    if (this.turret.texture.key === key) return

    this.turret.setTexture(key)
    applyRender(this.turret, key)
    this.baseScale = this.turret.scaleY
    this.shadow.destroy()
    this.shadow = makeShadow(this.scene, key)
    this.addAt(this.shadow, 0)

    if (!animate) return
    // Felt, not just seen. A puff at the footing covers the frame where one
    // sprite becomes another, and the pop says the building grew rather than
    // being swapped out from under the player.
    deathPuff(this.scene, this.x, this.y + 2, 0xd8c9a8)
    this.turret.setScale(this.baseScale * 0.82)
    this.scene.tweens.add({
      targets: this.turret, scaleX: this.baseScale, scaleY: this.baseScale,
      duration: 260, ease: 'Back.easeOut',
    })
  }

  /**
   * The tier, made visible.
   *
   * All three tiers share one sprite, so without this an upgraded tower is
   * indistinguishable from one still at tier 1 — the player cannot see what
   * they have bought. Pips above the tower say exactly which tier it is; the
   * scale and brightness make it readable at a glance without counting.
   *
   * This is placeholder art by intent. When per-tier sprites exist the pips
   * can go and only this method changes.
   */
  private drawTier(): void {
    const t = PRESENTATION.towerTier
    const total = maxTier(this.def)
    // ON the base, not below it.
    //
    // They were above the tower's head once, floating out over the map
    // unattached to anything and close enough to the next tower's row to
    // collide with it. Moving them down fixed that and introduced the
    // opposite: `pipDropBelowBase` put the row nine world pixels UNDER the
    // foot, on the grass, which reads as a separate thing lying on the ground
    // near the tower rather than as part of it.
    //
    // Measured before changing: the drop was 9 world pixels, not the ~50 the
    // report estimated — every tower's art fills its texture and anchorY is
    // 1.0, so the container origin IS the visible base. The direction of the
    // fix is the same either way.
    //
    // Zero is the base line: the row straddles the tower's foot, half on the
    // art and half on its shadow, which is what makes it read as attached.
    const top = t.pipBaselineOffset
    const span = (total - 1) * t.pipGap
    this.pips.clear()
    for (let i = 0; i < total; i++) {
      const x = -span / 2 + i * t.pipGap
      const filled = i < this.tier
      // A dark seat and a dark rim, so the row reads over grass, dirt path and
      // tower art alike rather than only over whatever it was tested on.
      this.pips.fillStyle(0x0d1016, 0.85).fillCircle(x, top, t.pipRadius + 3)
      this.pips.fillStyle(
        Phaser.Display.Color.HexStringToColor(filled ? t.pipColour : t.pipEmptyColour).color,
        1,
      )
      this.pips.fillCircle(x, top, t.pipRadius)
      this.pips.lineStyle(2, 0x0d1016, 0.9).strokeCircle(x, top, t.pipRadius)
    }

    // The scale-and-brighten stand-in is for towers whose art does not change.
    // Where real tier sprites exist the silhouette carries the growth, and
    // applying both would inflate a tier-3 tower well past the size it was
    // drawn at. The pips stay either way, as the secondary read.
    if (hasTierArt(this.def.sprite)) return

    const steps = this.tier - 1
    this.turret.setScale(this.baseScale * (1 + steps * t.scalePerTier))
    // Tint can only darken in Phaser, so brightness comes from lightening the
    // rest of the range toward white rather than from a multiplier above 1.
    const lift = Math.round(255 - (1 - steps * t.tintPerTier) * 40)
    const c = Math.min(255, Math.max(0, lift))
    this.turret.setTint(Phaser.Display.Color.GetColor(c, c, c))
  }

  /**
   * The specialization's behaviour, or an empty object at tiers 1 and 2.
   *
   * Read through one accessor so every consumer asks the same question and a
   * tower without a specialization answers "nothing" rather than undefined.
   */
  get behaviour(): Partial<TowerSpec> {
    return specById(this.def, this.spec) ?? {}
  }

  /** How much the ramp is adding right now, as a multiplier on damage. */
  get rampMultiplier(): number {
    const per = this.behaviour.rampPerShot ?? 0
    if (per <= 0) return 1
    return 1 + Math.min(this.rampStacks * per, this.behaviour.rampMax ?? 0)
  }

  /** Support only: what this tower grants a neighbour beyond raw damage. */
  get grantsPierce(): number {
    return this.behaviour.grantsPierce ?? 0
  }

  get supportRangeBonus(): number {
    return this.behaviour.supportRangeBonus ?? 0
  }

  /** Peanuts sunk into this tower: its cost, every tier paid for, and the
   *  specialization. What the Rainbow Reaper measures when it picks one. */
  get investedValue(): number {
    return investedIn(this.def, this.tier, this.spec)
  }

  /**
   * True for a tower that deploys soldiers instead of shooting.
   *
   * Asked the same way `isSupport` is, and used the same way: `tick` returns
   * before it aims. The Ima Dummy Tower has a RANGE -- it is the leash its
   * rally point is checked against -- so "has a range" stopped being the same
   * question as "shoots at things", and this is the difference.
   */
  get isDeployer(): boolean {
    return (this.def.soldierCount ?? 0) > 0
  }

  /** How many lads this tower fields at its current tier. `Need a Friend?`
   *  multiplies it, which is the whole of that branch. */
  get soldierCount(): number {
    return Math.round(statAt(this.def, this.tier, 'soldierCount' as never, this.spec))
  }

  get soldierHealth(): number {
    return statAt(this.def, this.tier, 'soldierHealth' as never, this.spec)
  }

  get soldierDamage(): number {
    return statAt(this.def, this.tier, 'soldierDamage' as never, this.spec)
  }

  get soldierInterval(): number {
    return statAt(this.def, this.tier, 'soldierInterval' as never, this.spec)
  }

  get soldierRespawn(): number {
    return this.def.soldierRespawn ?? 10
  }

  get soldierBlockRange(): number {
    return this.def.soldierBlockRange ?? 46
  }

  /** The Rage branch's numbers, or null on any other tower or branch. */
  get rage(): { below: number; damage: number; interval: number } | null {
    const spec = specById(this.def, this.spec)
    if (!spec?.rageBelowHealth) return null
    return {
      below: spec.rageBelowHealth,
      damage: spec.rageDamage ?? 1,
      interval: spec.rageInterval ?? 1,
    }
  }

  get isSupport(): boolean {
    return this.def.supportRadius > 0
  }

  /** Every stat below is the base value scaled by the tiers actually paid for.
   *  Consumers read these, never `def`, or an upgraded tower would keep firing
   *  with its tier 1 numbers. */
  get damage(): number {
    return boostedDamage(statAt(this.def, this.tier, 'damage', this.spec), this.supportBonus)
  }

  get range(): number {
    return statAt(this.def, this.tier, 'range', this.spec) * (1 + this.grantedRange)
  }

  /** Slower while a tier is going up: that is the cost of upgrading mid-wave. */
  get fireInterval(): number {
    const base = statAt(this.def, this.tier, 'fireInterval', this.spec)
    return this.upgrading ? base / UPGRADES.buildFireRate : base
  }

  /** How much of a target's armour this tower gets through. Climbs with tier,
   *  so upgrading a single-target tower is the reachable answer to armour. */
  get armorPierce(): number {
    return statAt(this.def, this.tier, 'armorPierce', this.spec) + this.grantedPierce
  }

  /**
   * The movement layers this tower may shoot, from towers.json.
   *
   * Ground only when the tower does not say, which is the safe direction for a
   * default to fail in: a new tower that forgets the field cannot silently
   * gain the ability to shoot air.
   */
  get targets(): readonly string[] {
    return this.def.targets ?? GROUND_ONLY
  }

  get splashRadius(): number {
    return statAt(this.def, this.tier, 'splashRadius', this.spec)
  }

  get slowSeconds(): number {
    return statAt(this.def, this.tier, 'slowSeconds', this.spec)
  }

  get supportRadius(): number {
    return statAt(this.def, this.tier, 'supportRadius', this.spec)
  }

  get supportDamageBonus(): number {
    return statAt(this.def, this.tier, 'supportDamageBonus', this.spec)
  }

  get upgrading(): boolean {
    return this.buildLeft > 0
  }

  get maxed(): boolean {
    return isMaxed(this.def, this.tier)
  }

  /** 0 to 1 through the tier currently going up. */
  get buildProgress(): number {
    return this.buildTotal > 0 ? 1 - this.buildLeft / this.buildTotal : 1
  }

  /**
   * Starts a tier. The tier number goes up when the work *finishes*, so a
   * tower under construction keeps its old stats and its reduced rate rather
   * than getting the new ones for free while it builds.
   */
  beginUpgrade(specId: string | null = null): void {
    if (this.upgrading) return
    // Tier 3 is a choice; every other tier is a step.
    const step = specId ? specById(this.def, specId) : nextStep(this.def, this.tier)
    if (!step) return
    if (specId && !atSpecChoice(this.def, this.tier)) return
    this.pendingSpec = specId
    this.buildTotal = step.buildSeconds
    this.buildLeft = step.buildSeconds
    this.drawScaffold()
  }

  /**
   * Puts a tower straight at a tier, with no build time and no fanfare.
   *
   * For a run restored from a save, and for nothing else. `beginUpgrade` is
   * the path a player takes: it costs peanuts, takes seconds, and slows the
   * tower down while the work is done. A restored tower finished all of that
   * before the app was closed, so replaying it would charge the player twice
   * and leave the board defenceless while it caught up.
   */
  restoreTier(tier: number, spec: string | null): void {
    const top = maxTier(this.def)
    this.tier = Math.max(BASE_TIER, Math.min(top, Math.floor(tier)))
    // A spec only exists at the tier that grants it; carrying one onto a
    // tier-1 tower would show a specialization the tower does not have.
    this.spec = this.tier >= top ? spec : null
    this.wearTier(false)
    this.drawTier()
  }

  /** True when the next purchase is the mutually exclusive tier-3 choice. */
  get atSpecChoice(): boolean {
    return atSpecChoice(this.def, this.tier)
  }

  get specName(): string | null {
    return specById(this.def, this.spec)?.name ?? null
  }

  /** Tier 1 places instantly (buildTime is 0); the pop is feedback, not a timer. */
  popIn(): void {
    this.setScale(0.55)
    this.scene.tweens.add({ targets: this, scale: 1, duration: 200, ease: 'Back.easeOut' })
  }

  /** Restructure moves a built tower without rebuilding it. */
  /**
   * Moves to a new pad, and is seen to move.
   *
   * It used to teleport, which is why Restructure read as a menu operation
   * rather than as a hero picking a building up. Three beats — lift, carry,
   * set down — is the smallest sequence that says a thing was moved rather
   * than replaced, and the arc is what makes it legible at a glance across a
   * board where the two pads may be nowhere near each other.
   *
   * Y-sorting is redone on landing, not on lift: the tower is above the board
   * while it travels and belongs in the sort order of where it lands.
   */
  relocate(x: number, y: number, spot: number): void {
    const cfg = PRESENTATION.restructure
    this.spot = spot
    const from = { x: this.x, y: this.y }

    this.scene.tweens.chain({
      targets: this,
      tweens: [
        { y: from.y - cfg.liftPixels, duration: cfg.liftMs, ease: 'Quad.easeOut' },
        { x, y: y - cfg.liftPixels, duration: cfg.travelMs, ease: 'Sine.easeInOut' },
        { y, duration: cfg.dropMs, ease: 'Quad.easeIn' },
      ],
      onComplete: () => {
        this.setPosition(x, y)
        ySort(this)
        this.popIn()
      },
    })
  }

  tick(dt: number, enemies: Enemy[], fire: (tower: Tower, target: Enemy) => void): void {
    this.tickBuild(dt)

    // SWITCHED OFF. The reload does not run while the lights are out, so the
    // tower comes back with a FULL cooldown rather than firing the instant it
    // recovers -- three and a half seconds of nothing, and then a shot, is the
    // ability doing what it says. Ticked before the support check because a
    // support tower can be disabled too: its aura is what goes dark.
    if (this.disabledFor > 0) {
      this.disabledFor -= dt
      if (this.disabledFor <= 0) {
        this.disabledFor = 0
        this.cooldown = this.fireInterval
      }
      return
    }
    // A tower that deploys has nothing to aim: its lads are ticked by the
    // scene, which is the only thing that knows where the enemies are AND
    // which soldier the engagement rule gave each of them.
    if (this.isSupport || this.isDeployer) return

    this.cooldown -= dt
    if (this.cooldown > 0) return

    // Nothing this tower can shoot is the same as nothing in range: it does
    // not fire, and — because the cooldown is only set BELOW, after a target
    // is found — it does not spend its cooldown waiting either. A tower that
    // burned its reload on an untargetable flyer would then be caught reloading
    // when something it CAN hit walks in.
    const target = pickFirst(enemies, this.x, this.y, this.range, this.targets)
    if (!target) return

    this.cooldown = this.fireInterval
    // Ramping specs reward staying on one target, so switching resets the
    // stack. Tracked on the tower rather than the enemy: the point is the
    // tower settling into a rhythm, and an enemy that dies takes it with it.
    if (this.rampTarget !== target) {
      this.rampTarget = target
      this.rampStacks = 0
    } else {
      this.rampStacks++
    }
    // A painted tower is a building, not a swivelling turret: rotating it lays
    // it on its side. Aim reads from the muzzle flash and the recoil instead.
    const dir = Math.atan2(target.y - this.y, target.x - this.x)
    fire(this, target)

    const m = this.muzzle(dir)
    muzzleFlash(this.scene, m.x, m.y, dir)

    // Recoil is flattened vertically for the same reason the shadows are: the
    // map is painted in 3/4, so a pixel north is further away than it is up.
    const recoil = PRESENTATION.towerRecoilPixels
    this.scene.tweens.add({
      targets: this.turret,
      x: -Math.cos(dir) * recoil,
      y: -Math.sin(dir) * recoil * 0.5,
      duration: PRESENTATION.towerRecoilMs,
      yoyo: true,
      ease: 'Quad.easeOut',
    })
  }

  private tickBuild(dt: number): void {
    if (this.buildLeft <= 0) return
    this.buildLeft -= dt
    if (this.buildLeft > 0) {
      this.drawScaffold()
      return
    }
    this.buildLeft = 0
    this.tier++
    if (this.pendingSpec) {
      this.spec = this.pendingSpec
      this.pendingSpec = null
    }
    this.scaffold?.destroy()
    this.scaffold = undefined
    this.wearTier(true)
    this.drawTier()
    this.popIn()
    // A Tax Shelter that just grew its radius has to be recomputed against
    // every tower it now covers, and support is only recalculated when the
    // tower set changes. Finishing a tier is that kind of change.
    this.emit('tierup', this)
  }

  /** A bar over the tower while it is being raised, so the player can see what
   *  the reduced fire rate is buying and how much longer it lasts. */
  private drawScaffold(): void {
    if (!this.scaffold) {
      this.scaffold = this.scene.add.graphics()
      this.add(this.scaffold)
    }
    const w = 44
    const y = -this.turret.displayHeight - 12
    this.scaffold.clear()
    this.scaffold.fillStyle(0x14181f, 0.9).fillRect(-w / 2 - 1, y - 1, w + 2, 7)
    this.scaffold.fillStyle(0xf2d06b, 1).fillRect(-w / 2, y, w * this.buildProgress, 5)
  }

  /** Where a shot leaves this tower: up near its top, angled at the target. */
  muzzle(dir: number): { x: number; y: number } {
    const cfg = PRESENTATION.muzzle
    const top = -this.turret.displayHeight * cfg.heightFraction
    return {
      x: this.x + Math.cos(dir) * cfg.reachPixels,
      y: this.y + top + Math.sin(dir) * cfg.reachPixels * 0.5,
    }
  }

  /** Direction from this tower's own muzzle to a point. */
  aimAt(x: number, y: number): number {
    return Math.atan2(y - this.y, x - this.x)
  }
}

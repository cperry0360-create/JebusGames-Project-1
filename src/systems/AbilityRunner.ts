// Executes the six active abilities. The numbers all come from abilities.json;
// this file only decides what shape each effect takes on screen.

import Phaser from 'phaser'
import type { AbilityDef, ServerNukeDef } from '../types.ts'
import { withinRadius } from './Targeting.ts'
import { Enemy } from '../entities/Enemy.ts'
import { ART } from './Art.ts'
import { EFFECT_MS, playEffect, sizeForRadius } from './Effects.ts'

export interface AbilityContext {
  scene: Phaser.Scene
  enemies: () => Enemy[]
  damage: (enemy: Enemy, amount: number, ignoresArmor: boolean) => void
  addPeanuts: (amount: number) => void
  /** Hands a rolled payout to the UI, which shows the ticket and pays out
   *  when it is scratched or when it reveals itself. */
  scratchTicket: (payout: number, autoRevealSeconds: number) => void
  /** Runs the long wind-up, then the payload. The scene owns the theatre. */
  windUp: (seconds: number, fire: () => void) => void
  summon: (x: number, y: number, count: number, seconds: number) => void
  overlayDepth: number
  nuke: ServerNukeDef
}

export function castAbility(id: string, def: AbilityDef, x: number, y: number, ctx: AbilityContext): void {
  switch (id) {
    case 'molotov':      return molotov(def, x, y, ctx)
    case 'gnomes':    return ctx.summon(x, y, def.summonCount, def.duration)
    case 'glacier':    return glacier(def, x, y, ctx)
    case 'meteor':  return meteor(def, x, y, ctx)
    case 'chain': return chain(def, x, y, ctx)
    case 'scratchTicket':  return scratchTicket(def, ctx)
    case 'serverNuke':     return serverNuke(ctx)
    default:               return molotov(def, x, y, ctx)
  }
}

function boom(ctx: AbilityContext, x: number, y: number, radius: number, tint?: number): void {
  // Sized to the blast it is doing and then left alone — the frames grow and
  // decay themselves. Untinted by default: the explosion art is already
  // orange, and tinting it orange again only muddies it.
  playEffect(ctx.scene, ART.fx.blast, x, y, {
    size: sizeForRadius(radius), depth: y + 5, durationMs: EFFECT_MS.blastMs, tint,
  })
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI * 2 * i) / 6
    const s = ctx.scene.add.image(x, y, ART.fx.ember).setDepth(y + 5).setScale(0.7)
    if (tint !== undefined) s.setTint(tint)
    ctx.scene.tweens.add({
      targets: s, x: x + Math.cos(a) * radius * 0.8, y: y + Math.sin(a) * radius * 0.8,
      alpha: 0, scale: 0.2, duration: 380, onComplete: () => s.destroy(),
    })
  }
}

function molotov(def: AbilityDef, x: number, y: number, ctx: AbilityContext): void {
  boom(ctx, x, y, def.radius)
  ctx.scene.cameras.main.shake(200, 0.006)
  for (const e of withinRadius(ctx.enemies(), x, y, def.radius)) ctx.damage(e, def.damage, def.ignoresArmor)
}

function glacier(def: AbilityDef, x: number, y: number, ctx: AbilityContext): void {
  const ring = ctx.scene.add.graphics().setDepth(ctx.overlayDepth)
  ring.fillStyle(0x8fd0ff, 0.18).fillCircle(x, y, def.radius)
  ring.lineStyle(3, 0x8fd0ff, 0.8).strokeCircle(x, y, def.radius)

  // Field lingers: everything caught inside is slowed for the duration.
  let elapsed = 0
  const timer = ctx.scene.time.addEvent({
    delay: 250,
    loop: true,
    callback: () => {
      elapsed += 0.25
      for (const e of withinRadius(ctx.enemies(), x, y, def.radius)) {
        e.applySlow(def.slowFactor, 0.6)
      }
      if (elapsed >= def.duration) {
        timer.remove()
        ctx.scene.tweens.add({
          targets: ring, alpha: 0, duration: 260, onComplete: () => ring.destroy(),
        })
      }
    },
  })

  for (const e of withinRadius(ctx.enemies(), x, y, def.radius)) ctx.damage(e, def.damage, def.ignoresArmor)
}

/** Ground markings are ellipses, not circles: the map is painted in 3/4. */
const GROUND_SQUASH = 0.62

/**
 * A shadow on the ground where a meteor is about to land.
 *
 * Without it a barrage is six explosions arriving out of nowhere and the
 * player cannot tell whether the ability did what they asked. The shadow is
 * the whole reason the spread is readable: it says *here*, then it happens.
 */
function telegraph(ctx: AbilityContext, x: number, y: number, radius: number, ms: number): void {
  const g = ctx.scene.add.graphics().setDepth(y - 1)
  ctx.scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: ms,
    onUpdate: (tw) => {
      const t = tw.getValue() ?? 0
      g.clear()
      // Darkens and draws in as it arrives, so the last frame before impact is
      // the clearest one.
      const r = radius * (1.35 - t * 0.35)
      g.fillStyle(0x140d08, 0.1 + t * 0.32)
      g.fillEllipse(x, y, r * 2, r * 2 * GROUND_SQUASH)
      g.lineStyle(2, 0xffc07a, 0.25 + t * 0.6)
      g.strokeEllipse(x, y, r * 2, r * 2 * GROUND_SQUASH)
    },
    onComplete: () => g.destroy(),
  })
}

/**
 * Meteor Barrage. Six impacts around the tap, each announced before it lands.
 *
 * The spread used to be the ability's whole radius, so a targeted barrage
 * could put every impact 150px from where the player aimed and kill nothing.
 * It is its own, much smaller number now, the first impact lands exactly on
 * the tap, and the ring the player is shown is the spread plus one impact
 * radius — so what the ring promises is what the barrage can reach.
 */
function meteor(def: AbilityDef, x: number, y: number, ctx: AbilityContext): void {
  const gap = (def.duration * 1000) / Math.max(1, def.ticks)
  const spread = def.impactSpread ?? def.radius * 0.4
  const blast = def.impactRadius ?? 62
  const lead = (def.telegraphSeconds ?? 0.5) * 1000

  for (let i = 0; i < def.ticks; i++) {
    // The first one lands on the tap. An ability the player aimed should hit
    // what they aimed at at least once.
    const a = Math.random() * Math.PI * 2
    // Linear in the radius rather than in the area, which clusters the rest
    // toward the middle instead of scattering them evenly to the edge.
    const r = i === 0 ? 0 : Math.random() * spread
    const mx = x + Math.cos(a) * r
    const my = y + Math.sin(a) * r

    ctx.scene.time.delayedCall(i * gap, () => {
      telegraph(ctx, mx, my, blast, lead)
      ctx.scene.time.delayedCall(lead, () => {
        boom(ctx, mx, my, blast)
        ctx.scene.cameras.main.shake(120, 0.004)
        for (const e of withinRadius(ctx.enemies(), mx, my, blast)) {
          ctx.damage(e, def.damage, def.ignoresArmor)
        }
      })
    })
  }
}

function chain(def: AbilityDef, x: number, y: number, ctx: AbilityContext): void {
  const hit = new Set<Enemy>()
  let fromX = x
  let fromY = y
  const bolts = ctx.scene.add.graphics().setDepth(ctx.overlayDepth)
  bolts.lineStyle(3, 0xd9f0ff, 0.95)

  for (let jump = 0; jump < def.ticks; jump++) {
    const candidates = withinRadius(ctx.enemies(), fromX, fromY, def.radius).filter((e) => !hit.has(e))
    if (candidates.length === 0) break
    candidates.sort(
      (a, b) => (a.x - fromX) ** 2 + (a.y - fromY) ** 2 - ((b.x - fromX) ** 2 + (b.y - fromY) ** 2),
    )
    const next = candidates[0]
    bolts.lineBetween(fromX, fromY, next.x, next.y)
    hit.add(next)
    ctx.damage(next, def.damage, def.ignoresArmor)
    playEffect(ctx.scene, ART.fx.spark, next.x, next.y, {
      size: EFFECT_MS.chainSparkSize, depth: next.y + 6, durationMs: EFFECT_MS.hitSparkMs,
    })
    fromX = next.x
    fromY = next.y
  }

  ctx.scene.tweens.add({ targets: bolts, alpha: 0, duration: 260, onComplete: () => bolts.destroy() })
}

/**
 * Server Nuke. Everything on the map dies at once — type, health and armour
 * are all irrelevant, which is the whole point of it being the rare drop.
 *
 * A boss is the exception: deleting one would take the encounter's ending away
 * from the player, so it takes a large fixed share of its maximum health and
 * survives to be finished properly.
 */
function serverNuke(ctx: AbilityContext): void {
  ctx.windUp(ctx.nuke.castSeconds, () => {
    for (const e of ctx.enemies()) {
      if (!e.alive) continue
      if (e.def.tier === 'boss') {
        ctx.damage(e, e.maxHealth * ctx.nuke.bossHealthPercent, true)
      } else {
        // Enough to remove anything, whatever its armour, in one go.
        ctx.damage(e, e.maxHealth + e.def.armor + 1, true)
      }
    }
  })
}

/**
 * Scratch Ticket. The payout is a range, not a number, and it is rolled here
 * rather than in the UI: the card uncovers a result that already exists.
 */
function scratchTicket(def: AbilityDef, ctx: AbilityContext): void {
  const payout = Phaser.Math.Between(def.payoutMin, def.payoutMax)
  ctx.scratchTicket(payout, def.autoRevealSeconds)
}

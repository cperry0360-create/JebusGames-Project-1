// Executes the six active abilities. The numbers all come from abilities.json;
// this file only decides what shape each effect takes on screen.

import Phaser from 'phaser'
import { rollOutcome, type ScratchOutcome } from './Scratch.ts'
import type { DiminishDef } from './Combat.ts'
import type { AbilityDef, ServerNukeDef } from '../types.ts'
import { withinRadius } from './Targeting.ts'
import { Enemy } from '../entities/Enemy.ts'
import { ART, renderFor } from './Art.ts'
import { EFFECT_MS, playEffect, sizeForRadius } from './Effects.ts'
import { GAME_SPEED } from './GameTime.ts'

export interface AbilityContext {
  scene: Phaser.Scene
  enemies: () => Enemy[]
  damage: (enemy: Enemy, amount: number, ignoresArmor: boolean) => void
  addPeanuts: (amount: number) => void
  /** Hands a drawn outcome to the UI, which shows the ticket and pays out
   *  when it is scratched or when it reveals itself. */
  scratchTicket: (outcome: ScratchOutcome, autoRevealSeconds: number) => void
  /** Diminishing returns on a repeated slow, from rules.json. */
  slowDiminish: DiminishDef
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

/**
 * One explosion, sized to the blast it is doing and then left alone: the
 * frames grow and decay themselves.
 *
 * There used to be six ember tiles thrown outward from here as well. The
 * painted sheet carries its own debris in frames four and five, and an A/B of
 * the same Molotov with and without them was indistinguishable — so they were
 * six more sprites a frame, and the last place a Kenney tile appeared in the
 * effects. Untinted, too: the art is already fire.
 */
function boom(ctx: AbilityContext, x: number, y: number, radius: number): void {
  playEffect(ctx.scene, ART.fx.blast, x, y, {
    size: sizeForRadius(radius), depth: y + 5, durationMs: EFFECT_MS.blastMs,
  })
}

function molotov(def: AbilityDef, x: number, y: number, ctx: AbilityContext): void {
  boom(ctx, x, y, def.radius)
  ctx.scene.cameras.main.shake(200, 0.006)
  for (const e of withinRadius(ctx.enemies(), x, y, def.radius)) ctx.damage(e, def.damage, def.ignoresArmor)
}

/** Ground markings are ellipses, not circles: the map is painted in 3/4. */
const GROUND_SQUASH = 0.62

/**
 * The Glacier's picture: an eruption of ice at the cast point, which settles
 * into a frost patch that stays for the field's whole life.
 *
 * WHAT THIS REPLACED: `scene.add.graphics()`, a translucent blue circle and a
 * stroked ring, tweened out over 260ms. That is why the ability read as doing
 * nothing at all -- there was nothing on screen for four and a half of its
 * five seconds, so a field the player had paid a 20-second cooldown for was
 * invisible for almost all of the time it was working.
 *
 * TWO PHASES, ONE SPRITE, AND THEY ARE SIZED DIFFERENTLY.
 *
 * The eruption throws shards well above the ground and is drawn at the size
 * of the field, uniformly. The frost that is left is a GROUND MARKING and
 * obeys the same rule the meteor telegraph does: an ellipse squashed by
 * `GROUND_SQUASH`, because the map is painted in three-quarter view and a
 * circle drawn on it floats.
 *
 * AND BOTH ARE SIZED BY THE MEASURED INK, NOT BY THE CELL. The ice occupies
 * about 262 of each 512px cell, so scaling the cell to the field's diameter
 * would draw the whole effect at half the size of the field it represents --
 * the same failure that flattened the Mind Laser into a smooth gradient.
 * `contentWidth` is the union across the strip; `restWidth`/`restHeight` are
 * the settled frame's own ink, which is what has to measure the radius once
 * the eruption is over, because from then on that patch IS the field as far
 * as the player can see.
 *
 * Returns the handle the field's own clock uses to fade it, or null when the
 * art did not load -- `add.sprite` on a key that is not in the texture manager
 * hands back Phaser's green-and-black __MISSING chequerboard rather than
 * nothing, and a chequerboard the size of the field is worse than the
 * invisible ability this is fixing. The slow and the damage do not depend on
 * it either way.
 */
function frostArt(
  ctx: AbilityContext, x: number, y: number, radius: number,
): { fade: () => void } | null {
  const key = ART.fx.glacier
  if (!ctx.scene.textures.exists(key)) return null
  const cfg = renderFor(key)
  const cellW = cfg.sheet?.frameWidth ?? 512
  const cellH = cfg.sheet?.frameHeight ?? cellW
  const span = radius * 2

  const ice = ctx.scene.add.sprite(x, y, key)
  // The anchor is the middle of the painted GROUND DISC, which is not the
  // middle of the cell and not the bottom of the ink either -- see art.json.
  ice.setOrigin(cfg.anchorX ?? 0.5, cfg.anchorY ?? 0.5)
  const burst = span / (cfg.contentWidth ?? cellW)
  ice.setDisplaySize(cellW * burst, cellH * burst)
  // Over the lane while it erupts: the shards are above the ground and the
  // whole point of the eruption is that the player watches it land.
  ice.setDepth(y + 5)

  const settle = (): void => {
    ice.setDisplaySize(
      cellW * (span / (cfg.restWidth ?? cfg.contentWidth ?? cellW)),
      cellH * (span * GROUND_SQUASH / (cfg.restHeight ?? cfg.contentHeight ?? cellH)),
    )
    // And then it is part of the ground, so enemies walk OVER it. A frost
    // patch drawn on top of the lads standing in it reads as a pane of glass.
    ice.setDepth(y - 1)
  }

  // `registerEffectAnims` builds one clip per sheet in the manifest, keyed by
  // the sprite key. If it is somehow absent the last frame is still the right
  // picture -- a field with no eruption beats a field with nothing.
  if (ctx.scene.anims.exists(key)) {
    // FRAME RATE, NOT `duration`. The clip registered by `registerEffectAnims`
    // carries a frame rate derived from `blastMs`, and a `duration` in the play
    // config does not override it -- measured: the eruption ran its eight
    // frames in about 330ms against the 640 it was asked for, which is
    // `blastMs`'s 25fps and not the Glacier's own timing. `frameRate` does
    // override it, and it is the same number said the other way round.
    ice.play({ key, frameRate: (cfg.sheet?.frames ?? 8) * 1000 / EFFECT_MS.glacierMs })
    ice.once(Phaser.Animations.Events.ANIMATION_COMPLETE, settle)
  } else {
    ice.setFrame((cfg.sheet?.frames ?? 1) - 1)
    settle()
  }

  return {
    fade: () => ctx.scene.tweens.add({
      targets: ice, alpha: 0, duration: EFFECT_MS.glacierFadeMs,
      onComplete: () => ice.destroy(),
    }),
  }
}

/**
 * GLACIER. One hit on everything under the eruption, then a field that slows
 * everything standing in it for as long as it lasts.
 *
 * THE SLOW IS APPLIED ONCE PER ENEMY PER VISIT, and that is the fix.
 *
 * It used to call `applySlow` on every enemy in the radius every 250ms with a
 * 0.6s duration, which ran the field straight into the diminishing returns in
 * rules.json: each application inside the six-second window lasts 0.7x the one
 * before it, and anything under `minSeconds` (0.4) is not applied at all. So
 * the field's own ticks were 0.6s, then 0.42s, then nothing -- an enemy
 * standing in a five-second ice field was slowed for the first two-thirds of
 * a second and walked the rest at full speed. The longer it stayed, the less
 * slowed it was, which is backwards for a lingering field.
 *
 * Worse, `applySlow` counts a stack even when it refuses to apply anything, so
 * a lad who crossed the field came out the other side with twenty stacks and
 * six seconds of immunity to every OTHER slow in the game. The ability was
 * inoculating what it was meant to freeze.
 *
 * The diminishing returns are not wrong and this does not exempt the field
 * from them. They are a rule about REPEATED applications, and the 250ms loop
 * was never twenty slows -- it was one slow, kept alive by a bookkeeping loop
 * that the rule then read as twenty. So the field grants each enemy ONE slow
 * when it enters, lasting the rest of the field's life, and takes its stack
 * like anything else. A second Glacier on the same lad inside the window is
 * still shortened; a slow tower firing into the field still stacks against it;
 * and an enemy that walks out and back in takes another stack for the second
 * visit. Nothing the diminishing returns exist to prevent is reintroduced.
 * See reports/2026-09-07-mind-laser-and-glacier.md for the alternatives.
 */
function glacier(def: AbilityDef, x: number, y: number, ctx: AbilityContext): void {
  const art = frostArt(ctx, x, y, def.radius)

  // GAME SECONDS, like every other duration in the data. The old loop counted
  // real seconds against a number the rest of the game reads as game seconds
  // -- gnomes' `duration` is game seconds because a Fighter's life is spent in
  // `dt`, which is scaled -- so the field outlived its own data by 40%. It
  // matters more now than it did: the slow handed to `applySlow` is spent in
  // that same scaled `dt`, so a field counting one unit and a slow counting
  // the other would end at different moments.
  let elapsed = 0

  // THE ERUPTION, at the moment of the cast: it damages whoever is standing
  // under it and freezes them for the field's whole life.
  //
  // `inside` is who the field has already slowed. It is the previous sweep's
  // result rather than a set the sweep maintains, so an enemy that walks out
  // of the radius simply is not in the next one -- and walking back in is then
  // a fresh visit, which takes a fresh stack, exactly like any other second
  // application of a slow.
  let inside = withinRadius(ctx.enemies(), x, y, def.radius)
  for (const e of inside) {
    ctx.damage(e, def.damage, def.ignoresArmor)
    e.applySlow(def.slowFactor, def.duration, ctx.slowDiminish)
  }

  const timer = ctx.scene.time.addEvent({
    delay: 250,
    loop: true,
    callback: () => {
      elapsed += 0.25 * GAME_SPEED
      if (elapsed >= def.duration) {
        timer.remove()
        art?.fade()
        return
      }
      // Whoever has walked in since the last sweep, slowed for whatever is
      // left of the field. Nobody already standing in it is touched again:
      // that repetition is what the diminishing returns were reading as
      // twenty separate slows.
      const left = def.duration - elapsed
      const here = withinRadius(ctx.enemies(), x, y, def.radius)
      for (const e of here) {
        if (inside.includes(e)) continue
        e.applySlow(def.slowFactor, left, ctx.slowDiminish)
      }
      inside = here
    },
  })
}

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
 * Scratch Ticket. The outcome is drawn here rather than in the UI: the card
 * uncovers a result that already exists.
 *
 * A weighted table with losing lines on it, not a uniform range. The range it
 * replaces could not lose and averaged 190 against a mean wave income of 322.
 */
function scratchTicket(def: AbilityDef, ctx: AbilityContext): void {
  const outcome = rollOutcome(def.outcomes ?? [], Math.random())
  ctx.scratchTicket(outcome, def.autoRevealSeconds)
}

// Executes the six active abilities. The numbers all come from abilities.json;
// this file only decides what shape each effect takes on screen.

import Phaser from 'phaser'
import type { AbilityDef } from '../types.ts'
import { withinRadius } from './Targeting.ts'
import { Enemy } from '../entities/Enemy.ts'
import { floatingDamage } from './Presentation.ts'
import { ART } from './Art.ts'

export interface AbilityContext {
  scene: Phaser.Scene
  enemies: () => Enemy[]
  damage: (enemy: Enemy, amount: number, ignoresArmor: boolean) => void
  addGold: (amount: number) => void
  summon: (x: number, y: number, count: number, seconds: number) => void
  overlayDepth: number
}

export function castAbility(id: string, def: AbilityDef, x: number, y: number, ctx: AbilityContext): void {
  switch (id) {
    case 'explosion':      return explosion(def, x, y, ctx)
    case 'twoFighters':    return ctx.summon(x, y, def.summonCount, def.duration)
    case 'freezeField':    return freezeField(def, x, y, ctx)
    case 'meteorBarrage':  return meteorBarrage(def, x, y, ctx)
    case 'chainLightning': return chainLightning(def, x, y, ctx)
    case 'goldRain':       return goldRain(def, ctx)
    default:               return explosion(def, x, y, ctx)
  }
}

function boom(ctx: AbilityContext, x: number, y: number, radius: number, tint = 0xffffff): void {
  const flame = ctx.scene.add.image(x, y, ART.fx.blast).setDepth(y + 5).setScale(radius / 90).setTint(tint)
  ctx.scene.tweens.add({
    targets: flame, scale: radius / 44, alpha: 0, duration: 320,
    ease: 'Quad.easeOut', onComplete: () => flame.destroy(),
  })
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI * 2 * i) / 6
    const s = ctx.scene.add.image(x, y, ART.fx.ember).setDepth(y + 5).setScale(0.7).setTint(tint)
    ctx.scene.tweens.add({
      targets: s, x: x + Math.cos(a) * radius * 0.8, y: y + Math.sin(a) * radius * 0.8,
      alpha: 0, scale: 0.2, duration: 380, onComplete: () => s.destroy(),
    })
  }
}

function explosion(def: AbilityDef, x: number, y: number, ctx: AbilityContext): void {
  boom(ctx, x, y, def.radius)
  ctx.scene.cameras.main.shake(200, 0.006)
  for (const e of withinRadius(ctx.enemies(), x, y, def.radius)) ctx.damage(e, def.damage, def.ignoresArmor)
}

function freezeField(def: AbilityDef, x: number, y: number, ctx: AbilityContext): void {
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

function meteorBarrage(def: AbilityDef, x: number, y: number, ctx: AbilityContext): void {
  const gap = (def.duration * 1000) / Math.max(1, def.ticks)
  for (let i = 0; i < def.ticks; i++) {
    ctx.scene.time.delayedCall(i * gap, () => {
      const a = Math.random() * Math.PI * 2
      const r = Math.random() * def.radius
      const mx = x + Math.cos(a) * r
      const my = y + Math.sin(a) * r
      boom(ctx, mx, my, 62, 0xffc07a)
      ctx.scene.cameras.main.shake(120, 0.004)
      for (const e of withinRadius(ctx.enemies(), mx, my, 62)) ctx.damage(e, def.damage, def.ignoresArmor)
    })
  }
}

function chainLightning(def: AbilityDef, x: number, y: number, ctx: AbilityContext): void {
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
    const spark = ctx.scene.add.image(next.x, next.y, ART.fx.spark).setDepth(next.y + 6).setScale(0.7)
    ctx.scene.tweens.add({
      targets: spark, scale: 0.1, alpha: 0, duration: 240, onComplete: () => spark.destroy(),
    })
    fromX = next.x
    fromY = next.y
  }

  ctx.scene.tweens.add({ targets: bolts, alpha: 0, duration: 260, onComplete: () => bolts.destroy() })
}

function goldRain(def: AbilityDef, ctx: AbilityContext): void {
  ctx.addGold(def.gold)
  const cam = ctx.scene.cameras.main
  for (let i = 0; i < 14; i++) {
    const coin = ctx.scene.add
      .image(Phaser.Math.Between(60, cam.width - 60), Phaser.Math.Between(90, 160), ART.fx.coin)
      .setDepth(ctx.overlayDepth)
      .setScale(1.2)
    ctx.scene.tweens.add({
      targets: coin,
      y: coin.y + Phaser.Math.Between(220, 420),
      alpha: 0,
      angle: 360,
      duration: Phaser.Math.Between(600, 1100),
      ease: 'Quad.easeIn',
      onComplete: () => coin.destroy(),
    })
  }
  floatingDamage(ctx.scene, cam.width / 2, 200, def.gold, true)
}

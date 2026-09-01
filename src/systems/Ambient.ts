// The tavern, alive.
//
// The building is painted into the map plate, so there is nothing to animate —
// only things to draw ON it. Warm glows over the lit windows and the two
// hanging lanterns, and a lazy trickle of smoke from the chimney. No new art:
// the glow is a radial gradient generated once at runtime.
//
// Everything here is decoration. It takes no input, it sits below every unit,
// and it goes away cleanly: the tweens are the scene's own so Phaser tears
// them down, and the emitter and the generated texture are released on
// SHUTDOWN and DESTROY both, per the listener rules in SceneEvents.

import Phaser from 'phaser'
import { onSceneEvent } from './SceneEvents.ts'

export interface LightDef {
  x: number
  y: number
  /** World-pixel radius of the glow. */
  radius: number
  kind: string
}

export interface AmbientDef {
  lights: LightDef[]
  chimneys: Array<{ x: number; y: number }>
}

export interface AmbientStyle {
  /** Warm candle colour. */
  glowColor: number
  /** The flicker floor and ceiling. Candlelight, not a strobe. */
  minAlpha: number
  maxAlpha: number
  /** Seconds for one flicker cycle, before the per-light variation. */
  periodSeconds: number
  /** How much each light's period may differ from its neighbours'. */
  periodVariance: number
  smoke: {
    /** Particles per second. Low: this is a banked fire, not a chimney fire. */
    rate: number
    lifespanMs: number
    riseSpeed: number
    /** Sideways drift, so the column leans rather than standing up. */
    driftSpeed: number
    startScale: number
    endScale: number
    alpha: number
    tint: number
  }
}

/** The soft radial blob both the glow and the smoke are drawn from. */
const GLOW_KEY = 'generated-ambient-glow'
const SIZE = 128

function ensureGlow(scene: Phaser.Scene): string {
  if (scene.textures.exists(GLOW_KEY)) return GLOW_KEY
  // Drawn as concentric circles rather than a canvas gradient: it is the same
  // technique the ground shadow already uses, and it needs no 2D context,
  // which the headless harness does not always have.
  const g = scene.make.graphics({ x: 0, y: 0 }, false)
  const steps = 24
  for (let i = steps; i > 0; i--) {
    const t = i / steps
    // Falls off faster than linear, or the blob reads as a flat disc.
    g.fillStyle(0xffffff, 0.055 * (1 - t) ** 1.6 + 0.004)
    g.fillCircle(SIZE / 2, SIZE / 2, (SIZE / 2) * t)
  }
  g.generateTexture(GLOW_KEY, SIZE, SIZE)
  g.destroy()
  return GLOW_KEY
}

/**
 * One tavern's worth of ambience. Returns nothing: it owns its own lifetime.
 *
 * `depth` puts it above the map plate and below every entity, which sort by
 * their own y. Decoration must never obscure a unit.
 */
export function installAmbient(
  scene: Phaser.Scene,
  def: AmbientDef,
  style: AmbientStyle,
  depth: number,
): void {
  const key = ensureGlow(scene)
  const parts: Phaser.GameObjects.GameObject[] = []

  for (const [i, light] of def.lights.entries()) {
    const glow = scene.add.image(light.x, light.y, key)
      .setDepth(depth)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(light.radius * 2, light.radius * 2)
    glow.setAlpha(style.maxAlpha)
    parts.push(glow)

    // A different period and a different starting phase per light, so the row
    // of windows never pulses in unison — which is the difference between a
    // building with people in it and a building with a dimmer switch.
    const spread = (i / Math.max(1, def.lights.length - 1)) * 2 - 1
    const period = style.periodSeconds * (1 + spread * style.periodVariance)
    scene.tweens.add({
      targets: glow,
      alpha: { from: style.maxAlpha, to: style.minAlpha },
      duration: period * 1000,
      delay: (i * 137) % 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
  }

  const emitters: Phaser.GameObjects.Particles.ParticleEmitter[] = []
  for (const c of def.chimneys) {
    const s = style.smoke
    const em = scene.add.particles(c.x, c.y, key, {
      frequency: 1000 / Math.max(0.01, s.rate),
      lifespan: s.lifespanMs,
      speedY: { min: -s.riseSpeed, max: -s.riseSpeed * 0.6 },
      speedX: { min: s.driftSpeed * 0.3, max: s.driftSpeed },
      scale: { start: s.startScale, end: s.endScale },
      alpha: { start: s.alpha, end: 0 },
      tint: s.tint,
      blendMode: Phaser.BlendModes.NORMAL,
      quantity: 1,
    })
    em.setDepth(depth)
    emitters.push(em)
    parts.push(em)
  }

  // The scene's own tweens die with it; the emitter and these objects need
  // saying so explicitly. Both SHUTDOWN and DESTROY, because a scene removed
  // outright never emits the first one.
  const release = (): void => {
    for (const em of emitters) em.stop()
    for (const p of parts) p.destroy()
    parts.length = 0
  }
  onSceneEvent(scene, scene.events as never, 'shutdown', release)
  onSceneEvent(scene, scene.events as never, 'destroy', release)
}

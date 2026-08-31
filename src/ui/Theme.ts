import Phaser from 'phaser'
import { ART, renderFor } from '../systems/Art.ts'

// One place for the game's look, so panels and labels stay consistent.
// The fonts are Kenney's CC0 font package, loaded via @font-face in index.html.

export const FONT_DISPLAY = 'KenneyFuture, Georgia, serif'
export const FONT_UI = 'KenneyFutureNarrow, KenneyFuture, monospace'

export const COLOR = {
  ink: '#f6ecd9',
  dim: '#a4b0bd',
  /** A warm yellow. Named for the colour, not for a currency. */
  amber: '#f2d06b',
  danger: '#ff8f7a',
  good: '#8fd07a',
  fire: '#ff5a3c',
  panel: 0x171c24,
  panelEdge: 0x3d4a59,
  panelHi: 0x232c38,
  accent: 0x6cc24a,
}

export interface PanelOptions {
  fill?: number
  edge?: number
  alpha?: number
  radius?: number
  /** Set false for chrome flush against an edge, where a shadow reads wrong. */
  shadow?: boolean
}

/** Offset and softness of the drop shadow under every panel. */
const PANEL_SHADOW = { offsetY: 4, spread: 2, alpha: 0.34, layers: 3 }

/** Rounded panel used by every bit of chrome in the game. */
/** Paints a panel onto an existing Graphics, so redraws keep their shadow. */
export function paintPanel(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: PanelOptions = {},
): void {
  g.clear()
  const radius = opts.radius ?? 10

  // Stacked translucent rounded rects fake a soft shadow without a blur pass.
  if (opts.shadow !== false) {
    const { offsetY, spread, alpha, layers } = PANEL_SHADOW
    for (let i = layers; i >= 1; i--) {
      const grow = spread * i
      g.fillStyle(0x000000, alpha / layers)
      g.fillRoundedRect(x - grow, y - grow + offsetY, w + grow * 2, h + grow * 2, radius + grow)
    }
  }

  g.fillStyle(opts.fill ?? COLOR.panel, opts.alpha ?? 0.96).fillRoundedRect(x, y, w, h, radius)
  g.lineStyle(2, opts.edge ?? COLOR.panelEdge, 1).strokeRoundedRect(x, y, w, h, radius)
}

export function panel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: PanelOptions = {},
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics()
  paintPanel(g, x, y, w, h, opts)
  return g
}

export function heading(scene: Phaser.Scene, x: number, y: number, text: string, size = 30) {
  return scene.add
    .text(x, y, text, {
      fontFamily: FONT_DISPLAY,
      fontSize: `${size}px`,
      color: COLOR.ink,
      stroke: '#0d1016',
      strokeThickness: 4,
    })
    .setOrigin(0.5)
}

export function label(scene: Phaser.Scene, x: number, y: number, text: string, size = 14, color = COLOR.dim) {
  return scene.add.text(x, y, text, { fontFamily: FONT_UI, fontSize: `${size}px`, color }).setOrigin(0.5)
}

/** A rectangular button with hover and disabled states. */
export function button(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  onClick: () => void,
  size = 18,
): {
  hit: Phaser.GameObjects.Rectangle
  setEnabled: (on: boolean) => void
  text: Phaser.GameObjects.Text
  /** Every piece, in draw order. A caller putting a button inside a container
   *  must add all of them: leaving the panel behind in the scene draws it over
   *  the label, because the container was added to the display list first. */
  parts: Phaser.GameObjects.GameObject[]
} {
  const g = panel(scene, x - w / 2, y - h / 2, w, h, { fill: 0x2f6b38, edge: COLOR.accent })
  const t = scene.add
    .text(x, y, text, { fontFamily: FONT_DISPLAY, fontSize: `${size}px`, color: COLOR.ink })
    .setOrigin(0.5)
  const hit = scene.add.rectangle(x, y, w, h, 0xffffff, 0.001).setInteractive({ useHandCursor: true })

  let enabled = true
  const redraw = (fill: number, edge: number): void => {
    paintPanel(g, x - w / 2, y - h / 2, w, h, { fill, edge })
  }

  hit.on('pointerover', () => { if (enabled) redraw(0x3f8a4a, COLOR.accent) })
  hit.on('pointerout', () => redraw(enabled ? 0x2f6b38 : 0x2a3340, enabled ? COLOR.accent : COLOR.panelEdge))
  hit.on('pointerdown', () => { if (enabled) onClick() })

  return {
    hit,
    text: t,
    parts: [g, t, hit],
    setEnabled: (on: boolean) => {
      enabled = on
      t.setColor(on ? COLOR.ink : '#6f7a86')
      redraw(on ? 0x2f6b38 : 0x2a3340, on ? COLOR.accent : COLOR.panelEdge)
    },
  }
}

/**
 * A button wearing one of the painted arcade plates.
 *
 * The plates are wide metal frames with detailed end caps and a plain middle,
 * so a button is three pieces: both caps drawn at a uniform scale set by the
 * requested height, and the middle stretched horizontally to fill whatever is
 * left. Only the middle distorts, which is the point — the caps are where all
 * the detail is.
 *
 * Phaser's own NineSlice would do this in one object, but it is WebGL-only and
 * draws nothing at all under the Canvas renderer, which is what a browser
 * falls back to when WebGL is unavailable. A button that vanishes on a
 * fallback renderer is worse than one built from three images, so this builds
 * the three images.
 */

/** Cuts a plate into left cap, stretchable middle and right cap. The frames
 *  live on the texture itself, so a second button reuses them. */
function plateFrames(
  scene: Phaser.Scene,
  key: string,
): { left: string; mid: string; right: string; width: number; height: number } {
  const tex = scene.textures.get(key)
  const src = tex.source[0]
  const s = renderFor(key).slice ?? { left: 0, right: 0, top: 0, bottom: 0 }
  const names = { left: `${key}__cap-l`, mid: `${key}__mid`, right: `${key}__cap-r` }
  if (!tex.has(names.left)) {
    tex.add(names.left, 0, 0, 0, s.left, src.height)
    tex.add(names.mid, 0, s.left, 0, src.width - s.left - s.right, src.height)
    tex.add(names.right, 0, src.width - s.right, 0, s.right, src.height)
  }
  return { ...names, width: src.width, height: src.height }
}

export function plateButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  onClick: () => void,
  size = 18,
  weight: 'primary' | 'secondary' = 'primary',
): {
  hit: Phaser.GameObjects.Rectangle
  setEnabled: (on: boolean) => void
  text: Phaser.GameObjects.Text
  parts: Phaser.GameObjects.GameObject[]
} {
  const build = (key: string): Phaser.GameObjects.Image[] => {
    const f = plateFrames(scene, key)
    const s = renderFor(key).slice ?? { left: 0, right: 0, top: 0, bottom: 0 }
    const scale = h / f.height
    const capW = (s.left + s.right) * scale
    // Middle first, so a rounding gap at a seam hides under a cap.
    const mid = scene.add.image(x - w / 2 + s.left * scale, y, key, f.mid).setOrigin(0, 0.5)
    mid.setScale(Math.max(w - capW, 1) / (f.width - s.left - s.right), scale)
    const l = scene.add.image(x - w / 2, y, key, f.left).setOrigin(0, 0.5).setScale(scale)
    const r = scene.add.image(x + w / 2, y, key, f.right).setOrigin(1, 0.5).setScale(scale)
    return [mid, l, r]
  }

  const on = build(ART.ui.buttons[weight])
  const off = build(ART.ui.buttons.disabled)
  off.forEach((p) => p.setVisible(false))

  // The plates are bright and saturated, so the label needs a dark outline to
  // sit on top of one rather than fight it.
  const t = scene.add
    .text(x, y, text, {
      fontFamily: FONT_DISPLAY, fontSize: `${size}px`, color: COLOR.ink,
      stroke: '#171c24', strokeThickness: 4,
    })
    .setOrigin(0.5)
  const hit = scene.add.rectangle(x, y, w, h, 0xffffff, 0.001).setInteractive({ useHandCursor: true })

  // The plate is painted, so hover cannot brighten it with a tint — Phaser's
  // tint multiplies. It rests very slightly dimmed instead and clears to full
  // on hover, which reads as the button lighting up.
  const REST = 0xd2d8de
  const light = (v: number): void => on.forEach((p) => p.setTint(v))
  light(REST)

  let enabled = true
  hit.on('pointerover', () => { if (enabled) light(0xffffff) })
  hit.on('pointerout', () => { if (enabled) light(REST) })
  hit.on('pointerdown', () => { if (enabled) onClick() })

  return {
    hit,
    text: t,
    parts: [...on, ...off, t, hit],
    setEnabled: (v: boolean) => {
      enabled = v
      on.forEach((p) => p.setVisible(v))
      off.forEach((p) => p.setVisible(!v))
      t.setColor(v ? COLOR.ink : '#6f7a86')
    },
  }
}

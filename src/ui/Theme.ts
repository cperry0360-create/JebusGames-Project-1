import Phaser from 'phaser'

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

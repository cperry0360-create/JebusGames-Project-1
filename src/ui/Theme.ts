import Phaser from 'phaser'

// One place for the game's look, so panels and labels stay consistent.
// The fonts are Kenney's CC0 font package, loaded via @font-face in index.html.

export const FONT_DISPLAY = 'KenneyFuture, Georgia, serif'
export const FONT_UI = 'KenneyFutureNarrow, KenneyFuture, monospace'

export const COLOR = {
  ink: '#f6ecd9',
  dim: '#a4b0bd',
  gold: '#f2d06b',
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
}

/** Rounded panel used by every bit of chrome in the game. */
export function panel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: PanelOptions = {},
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics()
  const fill = opts.fill ?? COLOR.panel
  const edge = opts.edge ?? COLOR.panelEdge
  const radius = opts.radius ?? 10
  g.fillStyle(fill, opts.alpha ?? 0.96).fillRoundedRect(x, y, w, h, radius)
  g.lineStyle(2, edge, 1).strokeRoundedRect(x, y, w, h, radius)
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
): { hit: Phaser.GameObjects.Rectangle; setEnabled: (on: boolean) => void; text: Phaser.GameObjects.Text } {
  const g = panel(scene, x - w / 2, y - h / 2, w, h, { fill: 0x2f6b38, edge: COLOR.accent })
  const t = scene.add
    .text(x, y, text, { fontFamily: FONT_DISPLAY, fontSize: `${size}px`, color: COLOR.ink })
    .setOrigin(0.5)
  const hit = scene.add.rectangle(x, y, w, h, 0xffffff, 0.001).setInteractive({ useHandCursor: true })

  let enabled = true
  const redraw = (fill: number, edge: number): void => {
    g.clear()
    g.fillStyle(fill, 0.96).fillRoundedRect(x - w / 2, y - h / 2, w, h, 10)
    g.lineStyle(2, edge, 1).strokeRoundedRect(x - w / 2, y - h / 2, w, h, 10)
  }

  hit.on('pointerover', () => { if (enabled) redraw(0x3f8a4a, COLOR.accent) })
  hit.on('pointerout', () => redraw(enabled ? 0x2f6b38 : 0x2a3340, enabled ? COLOR.accent : COLOR.panelEdge))
  hit.on('pointerdown', () => { if (enabled) onClick() })

  return {
    hit,
    text: t,
    setEnabled: (on: boolean) => {
      enabled = on
      t.setColor(on ? COLOR.ink : '#6f7a86')
      redraw(on ? 0x2f6b38 : 0x2a3340, on ? COLOR.accent : COLOR.panelEdge)
    },
  }
}

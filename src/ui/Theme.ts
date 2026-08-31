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

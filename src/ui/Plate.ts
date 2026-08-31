import Phaser from 'phaser'
import { ART, renderFor } from '../systems/Art.ts'
import { COLOR, FONT_DISPLAY } from './Theme.ts'

/**
 * The painted arcade chrome: six plates that stand in for every button and
 * dialog the game used to draw with a Graphics object.
 *
 * All six are metal frames with detailed corners and an empty face, so they
 * are drawn sliced — the corners keep their proportions and only the flat
 * spans between them stretch. Wide buttons need three slices (both end caps
 * and a middle); the dialog needs all nine.
 *
 * Phaser ships a NineSlice game object that would do this in one call, but it
 * is WebGL-only and draws *nothing* under the Canvas renderer a browser falls
 * back to without WebGL. A dialog that vanishes on a fallback renderer is far
 * worse than one built from nine images, so these are built from images.
 *
 * Every face is deliberately empty. Labels are drawn as text on top; no text
 * is ever baked into the art.
 */

/** The nine (or three) sub-frames of a plate, cut once and cached on the
 *  texture itself so a second button of the same weight reuses them. */
interface Slices {
  /** Frame names in [row][col] order: top/middle/bottom by left/centre/right. */
  name: string[][]
  left: number
  right: number
  top: number
  bottom: number
  midW: number
  midH: number
  width: number
  height: number
}

function slices(scene: Phaser.Scene, key: string): Slices {
  const tex = scene.textures.get(key)
  const src = tex.source[0]
  const s = renderFor(key).slice ?? { left: 0, right: 0, top: 0, bottom: 0 }
  const W = src.width
  const H = src.height
  const midW = W - s.left - s.right
  const midH = H - s.top - s.bottom
  const cols: [number, number][] = [[0, s.left], [s.left, midW], [W - s.right, s.right]]
  const rows: [number, number][] = [[0, s.top], [s.top, midH], [H - s.bottom, s.bottom]]

  const name = rows.map((_, r) => cols.map((__, c) => `${key}__${r}${c}`))
  if (!tex.has(name[0][0])) {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const [cx, cw] = cols[c]
        const [cy, cy2] = rows[r]
        // A zero-height band happens on a plate sliced horizontally only.
        if (cw > 0 && cy2 > 0) tex.add(name[r][c], 0, cx, cy, cw, cy2)
      }
    }
  }
  return { name, ...s, midW, midH, width: W, height: H }
}

/**
 * A wide button plate stretched to `w` × `h`.
 *
 * Sliced horizontally only: the plate's top and bottom edges are identical all
 * the way across, so the whole thing is scaled to the requested height and
 * only the middle band stretches sideways. Returns the pieces in draw order.
 */
function barPlate(
  scene: Phaser.Scene,
  key: string,
  x: number,
  y: number,
  w: number,
  h: number,
): Phaser.GameObjects.Image[] {
  const s = slices(scene, key)
  // Full-height cuts, not the nine-slice's middle row: a bar keeps its whole
  // top and bottom edge and is only ever cut sideways.
  const tex = scene.textures.get(key)
  const bar = ['bar-l', 'bar-m', 'bar-r'].map((n) => `${key}__${n}`)
  if (!tex.has(bar[0])) {
    tex.add(bar[0], 0, 0, 0, s.left, s.height)
    tex.add(bar[1], 0, s.left, 0, s.midW, s.height)
    tex.add(bar[2], 0, s.width - s.right, 0, s.right, s.height)
  }

  const k = h / s.height
  const caps = (s.left + s.right) * k
  // Middle first, so a rounding gap at a seam hides under a cap.
  const mid = scene.add.image(x - w / 2 + s.left * k, y, key, bar[1]).setOrigin(0, 0.5)
  mid.setScale(Math.max(w - caps, 1) / s.midW, k)
  const l = scene.add.image(x - w / 2, y, key, bar[0]).setOrigin(0, 0.5).setScale(k)
  const r = scene.add.image(x + w / 2, y, key, bar[2]).setOrigin(1, 0.5).setScale(k)
  return [mid, l, r]
}

/**
 * How much of the dialog plate's own scale its chrome keeps.
 *
 * The plate is painted for a large dialog: its corner brackets reach 144px in
 * from each side and 160px down from the top. Drawn at full size on a 200px
 * card the frame would be the whole card. So the chrome scales with the panel
 * — a big dialog gets heavy arcade chrome, a small card gets a thinner version
 * of the same frame and keeps a usable face.
 */
function chromeFor(w: number, h: number): number {
  return Phaser.Math.Clamp(Math.min(w, h) / 620, 0.17, 0.46)
}

/**
 * A dialog plate stretched to any size, sliced in both directions.
 *
 * The corners are scaled down rather than drawn at full size, because the
 * plate is painted for a large dialog and its corner brackets reach 144px in
 * from each edge. On a 280px card those would meet in the middle. The scale is
 * clamped so opposite corners can never overlap whatever size is asked for.
 */
export function platePanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  chrome = chromeFor(w, h),
): Phaser.GameObjects.Image[] {
  const key = ART.ui.panel
  const s = slices(scene, key)
  const k = Math.min(chrome, (w * 0.9) / (s.left + s.right), (h * 0.9) / (s.top + s.bottom))

  const lw = s.left * k
  const rw = s.right * k
  const th = s.top * k
  const bh = s.bottom * k
  const spanX = Math.max(w - lw - rw, 1)
  const spanY = Math.max(h - th - bh, 1)
  const sx = spanX / s.midW
  const sy = spanY / s.midH

  const xs = [x, x + lw, x + w - rw]
  const ys = [y, y + th, y + h - bh]
  const xScale = [k, sx, k]
  const yScale = [k, sy, k]

  const parts: Phaser.GameObjects.Image[] = []
  // Face first, then edges, then corners: later pieces cover any seam.
  const order: [number, number][] = [[1, 1], [0, 1], [2, 1], [1, 0], [1, 2],
    [0, 0], [0, 2], [2, 0], [2, 2]]
  for (const [r, c] of order) {
    const img = scene.add.image(xs[c], ys[r], key, s.name[r][c]).setOrigin(0, 0)
    img.setScale(xScale[c], yScale[r])
    parts.push(img)
  }
  return parts
}

export interface PlateButton {
  hit: Phaser.GameObjects.Rectangle
  text: Phaser.GameObjects.Text
  setEnabled: (on: boolean) => void
  setLabel: (s: string) => void
  /** Every piece, in draw order. A caller putting one inside a container must
   *  add all of them, or the plate draws over its own label. */
  parts: Phaser.GameObjects.GameObject[]
}

/** Resting tint. The plates are painted, and Phaser's tint multiplies, so
 *  hover cannot brighten one — it rests slightly dimmed and clears to full
 *  instead, which reads as the button lighting up. */
const REST = 0xd2d8de

/**
 * A labelled button wearing one of the wide plates.
 *
 * `primary` is for the action the player came to take — start the wave, start
 * the run, confirm. `secondary` is for leaving: credits, back, cancel. Either
 * swaps to the disabled plate when switched off.
 */
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
): PlateButton {
  const on = barPlate(scene, ART.ui.buttons[weight], x, y, w, h)
  const off = barPlate(scene, ART.ui.buttons.disabled, x, y, w, h)
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
    setLabel: (s: string) => t.setText(s),
    setEnabled: (v: boolean) => {
      enabled = v
      on.forEach((p) => p.setVisible(v))
      off.forEach((p) => p.setVisible(!v))
      t.setColor(v ? COLOR.ink : '#6f7a86')
    },
  }
}

export interface IconPlate {
  plate: Phaser.GameObjects.Image
  active: Phaser.GameObjects.Image
  setActive: (on: boolean) => void
  parts: Phaser.GameObjects.GameObject[]
}

/**
 * A small square plate for an icon button. Two plates are stacked and one is
 * shown at a time, so the selected state is the painted active plate rather
 * than a border drawn over the resting one.
 */
export function iconPlate(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
): IconPlate {
  const make = (key: string): Phaser.GameObjects.Image => {
    const cfg = renderFor(key)
    const img = scene.add.image(x, y, key).setOrigin(0.5)
    img.setDisplaySize(w, h)
    void cfg
    return img
  }
  const plate = make(ART.ui.iconButton)
  const active = make(ART.ui.iconButtonActive).setVisible(false)
  return {
    plate,
    active,
    parts: [plate, active],
    setActive: (on: boolean) => {
      plate.setVisible(!on)
      active.setVisible(on)
    },
  }
}

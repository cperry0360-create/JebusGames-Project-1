import Phaser from 'phaser'
import { ART, renderFor } from '../systems/Art.ts'
import { COLOR, FONT_UI, uiSize } from './Theme.ts'
import { play } from '../systems/Audio.ts'
import { tapFloor } from '../systems/Layout.ts'

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

/**
 * How far a panel's painted frame reaches in from its box, per side.
 *
 * Content padded by a hand-picked number is padded against the BOX, and the
 * box is not what the player sees — the nine-slice's corners and edges sit
 * inside it. A cost drawn 9px from the left edge of a panel whose frame is
 * 14px wide is drawn on the frame. This is the number to pad against.
 */
export function panelInset(
  scene: Phaser.Scene,
  w: number,
  h: number,
  chrome = chromeFor(w, h),
): { left: number; right: number; top: number; bottom: number } {
  const s = slices(scene, ART.ui.panel)
  const k = Math.min(chrome, (w * 0.9) / (s.left + s.right), (h * 0.9) / (s.top + s.bottom))
  return { left: s.left * k, right: s.right * k, top: s.top * k, bottom: s.bottom * k }
}

export interface PlateButton {
  hit: Phaser.GameObjects.Rectangle
  text: Phaser.GameObjects.Text
  setEnabled: (on: boolean) => void
  setLabel: (s: string) => void
  /** Every piece, in draw order. A caller putting one inside a container must
   *  add all of them, or the plate draws over its own label. */
  parts: Phaser.GameObjects.GameObject[]
  /**
   * JUST THE PAINTED PLATE ART — both states of it, and nothing else.
   *
   * This exists because `parts` contains the hit rectangle, and a caller that
   * wants a button without its plate (one drawn on a docked slab, say) reaches
   * for the list of pieces and hides all of them. That is what killed CANCEL:
   * Phaser excludes anything that would not render from hit-testing, so hiding
   * the rectangle along with the plate left a button whose handler was wired,
   * whose input flag was correct, and which could never be pressed. Hiding
   * `plates` cannot reach the rectangle or the label.
   */
  plates: Phaser.GameObjects.GameObject[]
}

/** Resting tint. The plates are painted, and Phaser's tint multiplies, so
 *  hover cannot brighten one — it rests slightly dimmed and clears to full
 *  instead, which reads as the button lighting up. */
/** How much of a plate's width its two end caps occupy. */
const CAP_INSET = 62
/** A label may shrink this far to fit and no further. */
const MIN_LABEL_SCALE = 0.72

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
  // THE TAP FLOOR, APPLIED IN ONE PLACE. A menu screen is composed against the
  // 1280x720 design box and fitted into the viewport, so on an iPhone in
  // landscape the whole box comes down to about 54% and a 48-unit button is 26
  // CSS pixels tall -- under the 44pt minimum, on every button of every menu,
  // on every phone. In design space it is a comfortable 48, which is why
  // nothing caught it until a frame was measured.
  //
  // `tapFloor` only ever grows the value, and only when the fit is small: on a
  // desktop window the fit is near 1 and every button keeps exactly the size
  // it was authored at.
  h = tapFloor(scene, h)
  w = tapFloor(scene, w)
  const on = barPlate(scene, ART.ui.buttons[weight], x, y, w, h)
  const off = barPlate(scene, ART.ui.buttons.disabled, x, y, w, h)
  off.forEach((p) => p.setVisible(false))

  // The plates are bright and saturated, so the label needs a dark outline to
  // sit on top of one rather than fight it.
  // Button labels are always the sans face, at every size. They are the words
  // a player has to read fastest and act on, and the display face turned "KEEP
  // PLAYING" into "HEEP PLAYING". Never a heading, never an exception.
  const t = scene.add
    .text(x, y, text, {
      fontFamily: FONT_UI, fontSize: `${uiSize(size)}px`, color: COLOR.ink,
      fontStyle: 'bold', letterSpacing: 1,
      stroke: '#171c24', strokeThickness: 4,
    })
    .setOrigin(0.5)
  const hit = scene.add.rectangle(x, y, w, h, 0xffffff, 0.001).setInteractive({ useHandCursor: true })

  const light = (v: number): void => on.forEach((p) => p.setTint(v))
  light(REST)

  // Sound lives here rather than at every call site, so a new button is
  // audible by construction and none can be forgotten.
  let enabled = true
  hit.on('pointerover', () => {
    if (!enabled) return
    light(0xffffff)
    play(scene, 'hover')
  })
  hit.on('pointerout', () => { if (enabled) light(REST) })
  hit.on('pointerdown', () => {
    if (!enabled) return
    play(scene, 'click')
    onClick()
  })

  /**
   * Fits the label to the plate.
   *
   * The nine-slice's end caps eat about 62px of the button's width, so a label
   * sized against `w` runs out over them — the start-wave button carries a
   * wave number, a countdown and a bonus, and at a phone's width all three
   * spilled past both ends of the plate. Scaling is bounded: past the floor
   * the label is genuinely too long and the call site has to shorten it, but
   * it will never draw outside its own button.
   */
  const usable = Math.max(24, w - CAP_INSET)
  const fitLabel = (s: string): void => {
    t.setScale(1)
    t.setText(s)
    if (t.width > usable) t.setScale(Math.max(MIN_LABEL_SCALE, usable / t.width))
  }
  fitLabel(text)

  return {
    hit,
    text: t,
    parts: [...on, ...off, t, hit],
    plates: [...on, ...off],
    setLabel: fitLabel,
    setEnabled: (v: boolean) => {
      // Idempotent: the HUD calls this every frame with the same value, and
      // re-registering a hit area sixty times a second is both waste and a
      // way to end up in the input list twice.
      if (v === enabled) return
      enabled = v
      on.forEach((p) => p.setVisible(v))
      off.forEach((p) => p.setVisible(!v))
      t.setColor(v ? COLOR.ink : '#6f7a86')
      // A disabled button also stops taking the pointer. The flag above is
      // enough to make the handlers do nothing, but on its own it leaves the
      // rectangle in the input list: it still lights the hand cursor, still
      // fires hover, and still swallows the press so that nothing underneath
      // sees the tap either. Off the list, a disabled button is a picture.
      if (v) hit.setInteractive({ useHandCursor: true })
      else hit.disableInteractive()
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

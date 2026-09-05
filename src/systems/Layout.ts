// THE LAYOUT AUTHORITY: the design box, the fit, the insets, and the floor
// under a tap target. One answer each, in one place.
//
// WHAT THIS IS NOT. It is not a merge of `HeroRow`, `CutsceneLayout`,
// `DrawerLayout`, `RingLayout` and `ButtonRow`. Those were looked at for
// exactly that and they are not parallel implementations of one thing -- they
// solve five different problems (a row of hero cards, a comic panel, a
// drawer, a build ring, a button row) and each one is the only solver of its
// own problem. Merging them would produce one module with five unrelated
// halves.
//
// What they DID each re-derive locally is the three facts below, and that is
// where the bugs were:
//
//   * THE FIT. A menu screen is composed against a fixed design box and fitted
//     into the viewport. Every scene that wanted to know how big that made
//     something worked it out again, and `LoadoutScene.drawBackdrop` worked it
//     out wrong -- dividing a CSS-pixel viewport by a PHYSICAL-pixel camera
//     zoom, two different spaces, which is the same class of confusion that
//     `Resolution.worldToScreen` and `pointerToScreen` were written to end.
//
//   * THE INSETS. Available through `SafeArea`, and reached for by four call
//     sites out of the dozens that place something against an edge.
//
//   * THE TAP TARGET. Nothing enforced one. A 48-unit button in a 720-unit
//     design box is 26 CSS pixels on an iPhone in landscape, because the whole
//     box is fitted to a 390-pixel height and everything in it comes down to
//     54%. Every button on every menu screen was under the 44pt minimum on
//     every phone, and no test or check could see it because in DESIGN space
//     they are all a comfortable 48.
//
// The last one is why `tapFloor` exists and why `plateButton` calls it. A
// control's design height is now a REQUEST, and the floor is what it actually
// gets on a small screen.

import type Phaser from 'phaser'
import displayData from '../data/display.json'
import { deviceScale, viewH, viewW } from './Resolution.ts'
import { safeAreaInsets } from './SafeArea.ts'
import type { Insets } from './HudLayout.ts'

/** The design box every fixed-layout menu screen is composed against. */
export const DESIGN = { width: displayData.width, height: displayData.height }

/**
 * The minimum side of anything a finger has to hit, in CSS pixels.
 *
 * 44 is the number both platform guidelines land on and the one the brief
 * asks for. It is a floor, not a target: a bigger control is always fine.
 */
export const MIN_TAP = 44

/**
 * CSS pixels per design unit, for a scene fitted by `fitCameraToDesign`.
 *
 * The camera's zoom is in PHYSICAL pixels per design unit, because
 * `fitCameraToDesign` fits the design box to the canvas and the canvas is in
 * device pixels. Dividing by the device ratio is what turns it back into the
 * space every layout in the game is written in. Getting that division wrong is
 * a whole class of bug on its own, so it is done here and nowhere else.
 */
export function designFit(scene: Phaser.Scene): number {
  const zoom = scene.cameras.main?.zoom || 1
  return zoom / deviceScale()
}

/**
 * What the camera can actually see, in DESIGN units.
 *
 * Bigger than the design box on the axis the fit did not bind -- a 16:9 box in
 * a 2.16:1 viewport leaves design space visible off both ends -- which is what
 * a full-bleed backdrop has to cover.
 */
export function visibleDesignBox(scene: Phaser.Scene): { width: number; height: number } {
  const fit = designFit(scene) || 1
  return {
    width: Math.max(DESIGN.width, viewW(scene) / fit),
    height: Math.max(DESIGN.height, viewH(scene) / fit),
  }
}

/**
 * A size in design units that will render at least `css` CSS pixels.
 *
 * The whole point of the floor: on a desktop window the fit is near 1 and this
 * returns the size unchanged, and on a phone in landscape it grows it. Nothing
 * has to know which case it is in.
 */
export function minDesign(scene: Phaser.Scene, css: number = MIN_TAP): number {
  const fit = designFit(scene)
  if (!(fit > 0)) return css
  return css / fit
}

/**
 * The design height (or width) a control should actually be given, having
 * asked for `wanted`.
 *
 * Only ever grows it. A control that is already generous stays as authored.
 */
export function tapFloor(scene: Phaser.Scene, wanted: number, css: number = MIN_TAP): number {
  return Math.max(wanted, minDesign(scene, css))
}

/* --------------------------------------------------------------- fitting */

export interface Fitted { x: number; y: number; width: number; height: number; scale: number }

/**
 * CONTAIN: the largest `srcW x srcH` that fits inside the box, centred on it.
 *
 * Contain rather than cover, always, for anything with content in its corners
 * -- a comic panel's speech bubble is the panel, and a map card's title is the
 * card. `coverZoom` in CameraMath is the other one, and it is for the world
 * camera, which is allowed to run off the edges.
 *
 * Pure arithmetic and no scene, so the tests drive it directly.
 */
export function fitInBox(
  srcW: number, srcH: number, boxW: number, boxH: number,
  at: { x: number; y: number } = { x: 0, y: 0 },
): Fitted {
  if (!(srcW > 0) || !(srcH > 0)) {
    return { x: at.x, y: at.y, width: 0, height: 0, scale: 0 }
  }
  const scale = Math.min(boxW / srcW, boxH / srcH)
  const width = srcW * scale
  const height = srcH * scale
  return { x: at.x + (boxW - width) / 2, y: at.y + (boxH - height) / 2, width, height, scale }
}

/* ---------------------------------------------------------------- edges */

export type Edge = 'top' | 'right' | 'bottom' | 'left'

/**
 * Where a control's near edge goes, if it is to sit against a screen edge
 * without ending up under the hardware.
 *
 * In CSS pixels against the live viewport, so this is for the HUD and the
 * dialogs -- the things laid out 1:1 -- rather than for a fitted menu. `pad` is
 * the breathing room the design wants ON TOP of whatever the device demands.
 *
 * Returns the coordinate of the edge itself: a caller placing a left-anchored
 * thing uses it as an x, a right-anchored one subtracts its own width.
 */
export function anchor(
  scene: Phaser.Scene, edge: Edge, pad = 0, insets: Insets = safeAreaInsets(),
): number {
  switch (edge) {
    case 'top': return insets.top + pad
    case 'left': return insets.left + pad
    case 'bottom': return viewH(scene) - insets.bottom - pad
    case 'right': return viewW(scene) - insets.right - pad
  }
}

/** The rectangle a scene may lay chrome out in: the viewport, less the
 *  hardware, less a uniform margin. */
export function safeBox(
  scene: Phaser.Scene, pad = 0, insets: Insets = safeAreaInsets(),
): { x: number; y: number; width: number; height: number } {
  const x = insets.left + pad
  const y = insets.top + pad
  return {
    x,
    y,
    width: Math.max(0, viewW(scene) - insets.left - insets.right - pad * 2),
    height: Math.max(0, viewH(scene) - insets.top - insets.bottom - pad * 2),
  }
}

/* ------------------------------------------------------------- card rows */

export interface RowItem { x: number; y: number; width: number; height: number }
export interface WrappedRow { items: RowItem[]; rows: number; width: number; height: number }

/**
 * A row of equal cards that WRAPS rather than overlapping.
 *
 * The failure this replaces is the one the loadout screen kept producing: n
 * cards divided into a fixed width, with the width per card allowed to fall
 * below what the content needs, so the cards ran into each other and the
 * player saw a smear. Here the card width has a floor; when the floor does not
 * divide into the width, the row becomes two rows.
 *
 * Centred per row, so a last row with fewer cards sits under the middle of the
 * one above rather than jammed left.
 *
 * Pure arithmetic. No scene, no Phaser, driven directly by the tests.
 */
export function wrapRow(
  count: number,
  box: { width: number; height: number },
  card: { minWidth: number; maxWidth?: number; height: number; gap: number },
): WrappedRow {
  const n = Math.max(0, Math.floor(count))
  if (n === 0) return { items: [], rows: 0, width: box.width, height: 0 }
  const gap = Math.max(0, card.gap)
  // How many fit on one row at the minimum width. At least one, always: a box
  // narrower than a single card gives one card per row rather than zero.
  const perRow = Math.max(1, Math.min(n, Math.floor((box.width + gap) / (card.minWidth + gap))))
  const rows = Math.ceil(n / perRow)
  const raw = (box.width - gap * (perRow - 1)) / perRow
  const width = Math.min(card.maxWidth ?? raw, raw)
  const items: RowItem[] = []
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / perRow)
    const inRow = Math.min(perRow, n - r * perRow)
    const rowWidth = inRow * width + (inRow - 1) * gap
    const startX = (box.width - rowWidth) / 2
    items.push({
      x: startX + (i % perRow) * (width + gap),
      y: r * (card.height + gap),
      width,
      height: card.height,
    })
  }
  return {
    items,
    rows,
    width: box.width,
    height: rows * card.height + (rows - 1) * gap,
  }
}

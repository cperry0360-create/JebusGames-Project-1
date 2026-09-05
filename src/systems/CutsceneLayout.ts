// Where a comic panel goes, and where the controls go so they never sit on it.
//
// WHAT WAS WRONG, and it is worth naming precisely because the scene's own
// comment already claimed to do the right thing. `CutsceneScene.layout` did
// compute a proper contain-fit and did centre the result — in CSS PIXELS. The
// scene never fitted its camera, so the camera sat at zoom 1 over a canvas
// measured in PHYSICAL pixels. On a phone at devicePixelRatio 3 that draws a
// panel sized for the viewport at a third of the viewport's size, with its
// centre a sixth of the way across: a small comic pinned to the top-left with
// black around it, which is exactly the report. At devicePixelRatio 1 the two
// spaces are the same number and it looked perfect, which is why it shipped.
//
// So the fix is two things and only the second one is here. The scene fits its
// camera (`fitUiCamera`), which puts it in the CSS-pixel space every layout in
// this game is written in. This file then answers the layout question properly:
//
// NEVER CROP. `Math.min` of the two ratios, always. A speech bubble in the
// corner of a panel IS the panel, so the axis that runs out first decides and
// the other one gets the game's own dark chrome. There is no cover-fit here and
// there must never be one.
//
// THE CONTROLS DO NOT SIT ON THE ART. That cannot be done by putting SKIP in a
// corner and hoping: at exactly 16:9 there is no letterbox band to put it in,
// and a corner is then on the picture.
//
// So the panel is fitted to the whole safe area first and the band is checked
// against it. ON A PHONE THAT COSTS NOTHING: a 16:9 panel in a portrait
// viewport leaves hundreds of pixels of letterbox, the band sits in it, and the
// panel is both centred and as large as it can be. Only when the viewport is
// close enough to 16:9 for the panel to reach the band — a desktop window, a
// wide landscape phone — is anything given up, and then a band is reserved from
// BOTH sides of that axis so the panel stays centred rather than being pushed
// down or across by half a control.
//
// WHICH EDGE the band comes off is measured rather than guessed: both are
// fitted and the one leaving the larger panel wins, which lands on the top in
// portrait and on the side in landscape without either being special-cased.
//
// THE ORDER OF THE THREE RULES IS THE DESIGN. Never crop, and never under a
// control, are absolute. Centred is absolute. "As large as fits" is what gives
// way, and the measured cost is in the report.
//
// Phaser-free, so every viewport in the brief can be checked without a canvas.

import type { Insets, Rect } from './HudLayout.ts'

export interface CutsceneConfig {
  /** Inside the safe area, on every edge. */
  margin: number
  /** Between the reserved band and the panel. */
  gap: number
  /** The SKIP control. At least 44x44 points, which is the platform's own
   *  minimum for a tap target and the brief's. A test holds it there. */
  skipWidth: number
  skipHeight: number
  /** The "2 / 5" readout, which shares the band with SKIP. */
  counterWidth: number
  counterHeight: number
}

export interface CutsceneLayoutInput {
  /** The viewport in CSS pixels. */
  width: number
  height: number
  /** The notch and the home indicator. Nothing is placed inside these. */
  insets: Insets
  /** The panel's source size. 1672x941 for every panel in the game today. */
  panelWidth: number
  panelHeight: number
}

export interface CutsceneLayout {
  /** Where the panel is drawn: contain-fitted and centred, never cropped. */
  panel: Rect
  /** The uniform scale applied to the source. Both axes, always. */
  scale: number
  /** The strip reserved for the controls. Disjoint from `panel` by
   *  construction — that is the whole reason it exists. */
  band: Rect
  skip: Rect
  counter: Rect
  /** Which edge the band came off. Reported for the tests and the harness. */
  bandEdge: 'top' | 'right'
}

/** A rectangle with a positive size, whatever it was asked for. A viewport can
 *  legitimately be smaller than the chrome we want to put in it. */
function positive(r: Rect): Rect {
  return { x: r.x, y: r.y, width: Math.max(1, r.width), height: Math.max(1, r.height) }
}

/** The largest the panel can be inside `area`, centred in it. */
function containFit(area: Rect, srcW: number, srcH: number): { panel: Rect; scale: number } {
  // NEVER max(). See the note at the top: a cover-fit crops, and the corner of
  // a comic panel is where the words are.
  const scale = Math.min(area.width / srcW, area.height / srcH)
  const w = srcW * scale
  const h = srcH * scale
  return {
    scale,
    panel: {
      x: area.x + (area.width - w) / 2,
      y: area.y + (area.height - h) / 2,
      width: w,
      height: h,
    },
  }
}

/**
 * The whole layout, for one viewport.
 *
 * Everything is derived from the safe rectangle: nothing is placed against the
 * raw viewport, so a notched phone gets no chrome under the housing and no
 * panel under the home indicator without any of that being a special case.
 */
export function cutsceneLayout(
  input: CutsceneLayoutInput, cfg: CutsceneConfig,
): CutsceneLayout {
  const { width: W, height: H, insets } = input
  const safe = positive({
    x: insets.left + cfg.margin,
    y: insets.top + cfg.margin,
    width: W - insets.left - insets.right - cfg.margin * 2,
    height: H - insets.top - insets.bottom - cfg.margin * 2,
  })

  // The two places the band could go.
  const bandTop: Rect = { x: safe.x, y: safe.y, width: safe.width, height: cfg.skipHeight }
  const bandRight: Rect = {
    x: safe.x + safe.width - cfg.skipWidth,
    y: safe.y,
    width: cfg.skipWidth,
    height: safe.height,
  }

  // THE FREE CASE, and on a phone it is always this one. The panel takes the
  // whole safe area; if its letterbox already clears a band, nothing is given
  // up at all and the panel is both centred and maximal.
  const free = containFit(safe, input.panelWidth, input.panelHeight)
  if (!overlaps(free.panel, bandTop)) return place(free, bandTop, true, cfg)
  if (!overlaps(free.panel, bandRight)) return place(free, bandRight, false, cfg)

  // Otherwise room has to be made. Taken off BOTH sides of the axis, so the
  // panel stays centred in the safe area: a band on one side only would push it
  // down or across by half a control, which on a nearly-16:9 window — where
  // there is barely any chrome to begin with — reads as a layout fault rather
  // than as a margin.
  const reserve = cfg.gap
  const withTop = containFit(positive({
    x: safe.x,
    y: safe.y + bandTop.height + reserve,
    width: safe.width,
    height: safe.height - (bandTop.height + reserve) * 2,
  }), input.panelWidth, input.panelHeight)
  const withRight = containFit(positive({
    x: safe.x + bandRight.width + reserve,
    y: safe.y,
    width: safe.width - (bandRight.width + reserve) * 2,
    height: safe.height,
  }), input.panelWidth, input.panelHeight)

  // The larger panel wins, and ties go to the top band: a control above the
  // comic reads as chrome, one beside it reads as part of the page.
  const useTop = withTop.scale >= withRight.scale
  return place(useTop ? withTop : withRight, useTop ? bandTop : bandRight, useTop, cfg)
}

/** Puts the two controls in the band, at opposite ends of it. */
function place(
  fit: { panel: Rect; scale: number }, band: Rect, useTop: boolean, cfg: CutsceneConfig,
): CutsceneLayout {

  // SKIP goes to the outside corner of the band — the top-right of a top band,
  // the top of a side band — so it is furthest from the reading and closest to
  // where a thumb already is.
  const skip: Rect = {
    x: useTop ? band.x + band.width - cfg.skipWidth : band.x,
    y: band.y,
    width: cfg.skipWidth,
    height: cfg.skipHeight,
  }
  // And the counter takes the other end of the same band, so neither of them is
  // ever on the art and the two are never on each other.
  const counter: Rect = useTop
    ? {
      x: band.x,
      y: band.y + (band.height - cfg.counterHeight) / 2,
      width: cfg.counterWidth,
      height: cfg.counterHeight,
    }
    : {
      x: band.x,
      y: band.y + band.height - cfg.counterHeight,
      width: cfg.counterWidth,
      height: cfg.counterHeight,
    }

  return { panel: fit.panel, scale: fit.scale, band, skip, counter, bandEdge: useTop ? 'top' : 'right' }
}

/** Whether two rectangles share any area. Used by the tests that keep the
 *  controls off the picture. */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width
    && a.y < b.y + b.height && b.y < a.y + a.height
}

/** Whether `inner` sits entirely within `outer`, to a pixel's tolerance. */
export function contains(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x - 0.001
    && inner.y >= outer.y - 0.001
    && inner.x + inner.width <= outer.x + outer.width + 0.001
    && inner.y + inner.height <= outer.y + outer.height + 0.001
}

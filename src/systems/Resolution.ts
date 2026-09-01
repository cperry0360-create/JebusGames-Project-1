// The one place the game knows about physical pixels.
//
// THE PROBLEM. Phaser's RESIZE scale mode sets `canvas.width` to the parent
// element's size in CSS pixels and ignores the scale manager's zoom — read
// `updateScale` in the Phaser source, the RESIZE branch does exactly that and
// nothing else. So on a phone reporting devicePixelRatio 3 the canvas held a
// third of the screen's linear resolution, a ninth of its pixels, and the
// compositor stretched it back up. Every sprite edge became a three-pixel
// stair and every thin line broke into dashes. RENDER-QUALITY.md has the
// measurements.
//
// THE FIX. NONE mode plus a zoom of 1/dpr. Phaser's own `resize` documents the
// behaviour we want: it sets the canvas *pixel* size to the values given and
// the canvas *CSS* size to those values times the zoom. Hand it physical
// pixels with a zoom of 1/dpr and the canvas is full resolution at the right
// physical size. `resize` also refreshes `displayScale`, which is what the
// input manager divides by, so pointer coordinates keep landing where the
// finger did.
//
// THE CONSEQUENCE, and the reason this file exists rather than a one-line
// config change. The game's coordinate space is now PHYSICAL pixels, so
// `scale.width` is three times what every layout in the game was written
// against. Rather than multiply forty constants by a device property — which
// would put the device in the middle of the typography, the HUD layout and the
// safe-area insets all at once — the conversion happens twice and only twice:
//
//   * `viewW` / `viewH` give the viewport back in CSS pixels, and every layout
//     keeps being written in those.
//   * `fitUiCamera` puts a UI camera at zoom `dpr`, so a scene laid out in CSS
//     pixels is drawn at full device resolution with no other change.
//
// The fixed-design menu screens need neither: `fitCameraToDesign` already
// derives its zoom from the viewport, so a larger viewport simply produces a
// larger zoom and they get sharper for free.

import Phaser from 'phaser'

/**
 * The ceiling on how much we will oversample.
 *
 * Three covers every iPhone and most Android flagships. Some devices report 4
 * or higher, and past three the extra pixels are past the eye's ability to
 * resolve them while the fill cost keeps rising with the square. This is a
 * performance guard, not a correctness one.
 */
const MAX_SCALE = 3

/** The device pixel ratio actually in use, clamped and never zero. */
export function deviceScale(): number {
  const raw = (globalThis as { devicePixelRatio?: number }).devicePixelRatio ?? 1
  if (!Number.isFinite(raw) || raw <= 0) return 1
  return Math.min(MAX_SCALE, Math.max(1, raw))
}

/**
 * The viewport in CSS pixels — what `scene.scale.width` used to mean.
 *
 * Every layout in the game is written in these. Nothing outside this module
 * and the camera helpers below should read `scale.width` directly.
 */
export function viewW(scene: Phaser.Scene): number {
  return scene.scale.width / deviceScale()
}

export function viewH(scene: Phaser.Scene): number {
  return scene.scale.height / deviceScale()
}

/**
 * Sizes the canvas to the parent element at full device resolution.
 *
 * Measured from the parent's own bounding box rather than `innerHeight`,
 * because the parent is `100dvh` and those two disagree for several frames
 * while Safari's URL bar collapses. Forcing `innerHeight` there makes the
 * canvas taller than the box it sits in.
 */
export function applyResolution(game: Phaser.Game): void {
  const dpr = deviceScale()
  const parent = game.scale.parent as unknown as HTMLElement | null
  const box = parent?.getBoundingClientRect?.()
  const g = globalThis as { innerWidth?: number; innerHeight?: number }
  const cssW = Math.max(1, Math.round(box?.width || g.innerWidth || 1))
  const cssH = Math.max(1, Math.round(box?.height || g.innerHeight || 1))

  // Only when it moves: setZoom refreshes the whole manager, and this is
  // called several times per rotation on purpose.
  if (game.scale.zoom !== 1 / dpr) game.scale.setZoom(1 / dpr)
  game.scale.resize(cssW * dpr, cssH * dpr)
}

/**
 * A UI camera that renders a CSS-pixel layout at full device resolution.
 *
 * Zoom is about the camera's centre, so centring it on the middle of the
 * logical viewport is what makes CSS-pixel (0,0) land on physical (0,0):
 * `(0 - w/2) * dpr + (w * dpr)/2 === 0`.
 */
export function fitUiCamera(
  scene: Phaser.Scene,
  cam: Phaser.Cameras.Scene2D.Camera = scene.cameras.main,
): void {
  cam.setZoom(deviceScale())
  cam.centerOn(viewW(scene) / 2, viewH(scene) / 2)
}

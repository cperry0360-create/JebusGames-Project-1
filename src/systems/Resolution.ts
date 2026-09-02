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
 * A world point, as the CSS pixels every layout in the game is written in.
 *
 * THIS EXISTS BECAUSE ITS ABSENCE COST THREE BUGS. The arithmetic is four
 * terms long and every call site wrote it out by hand:
 *
 *     (wx - cam.worldView.x) * cam.zoom + cam.x
 *
 * That is correct, and it yields CANVAS pixels — the world camera's zoom
 * carries the device ratio. Everything it was then compared against —
 * `viewW`/`viewH`, the HUD rectangles, the ring's usable area — is in CSS
 * pixels. At devicePixelRatio 1 the two are the same number and every check
 * passed; at 3 the anchor came out three times too large and the build ring
 * was clamped to the edge of the screen, 401px from the pad it belonged to.
 *
 * The same confusion, in the other direction, put the modal scrim over the
 * top-left quadrant, and, in a third form, made a harness probe report a
 * correctly-placed tower as off screen.
 *
 * So the conversion lives here, beside `viewW` and `viewH`, and returns what
 * they return. A call site that wants screen space now has one thing to reach
 * for and no arithmetic to get wrong.
 */
export function worldToScreen(
  scene: Phaser.Scene,
  wx: number,
  wy: number,
  cam: Phaser.Cameras.Scene2D.Camera = scene.cameras.main,
): { x: number; y: number } {
  const dpr = deviceScale()
  return {
    x: ((wx - cam.worldView.x) * cam.zoom + cam.x) / dpr,
    y: ((wy - cam.worldView.y) * cam.zoom + cam.y) / dpr,
  }
}

/**
 * A POINTER, in the layout's own space.
 *
 * `worldToScreen` was written to stop this class of bug and did not, because
 * it takes a WORLD point and a pointer is not one. `pointer.x`/`pointer.y` are
 * CANVAS pixels — at devicePixelRatio 3 they are three times the number every
 * layout in this codebase is written in — and the settings slider was built
 * AFTER `worldToScreen` existed, read `pointer.x` directly, and sat pinned at
 * 100% on any retina screen because every press resolved past the end of the
 * track. That is the fourth bug from this one confusion.
 *
 * So there are two helpers now and they cover the two directions:
 *
 *   - `worldToScreen(scene, wx, wy)` — a point ON THE MAP to CSS pixels.
 *   - `pointerToScreen(scene, pointer)` — a TOUCH OR CLICK to CSS pixels.
 *
 * Neither takes the other's argument, which is the point: reaching for the
 * wrong one now fails to compile rather than failing at devicePixelRatio 3 on
 * somebody's phone.
 *
 * `cam` is the camera the target was drawn by; the default is the scene's
 * main camera, which is what a HUD or a fitted menu is on.
 */
export function pointerToScreen(
  scene: Phaser.Scene,
  pointer: { x: number; y: number },
  cam: Phaser.Cameras.Scene2D.Camera = scene.cameras.main,
): { x: number; y: number } {
  // The camera's own inverse transform, which already accounts for its zoom
  // and scroll — the UI camera's zoom IS the device ratio, so this lands in
  // CSS pixels without a second division by it.
  const p = cam.getWorldPoint(pointer.x, pointer.y)
  return { x: p.x, y: p.y }
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

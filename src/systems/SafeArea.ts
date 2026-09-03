// The safe area, read from the browser and resolved to one edge.
//
// index.html sets `viewport-fit=cover`, so the canvas fills the whole display
// including the parts behind a notch and a home indicator. That is what we
// want for the map — full bleed means full bleed — but it means the HUD has to
// be told where the hardware is, or the peanut counter ends up under the notch
// and the pause button under the home indicator on every notched phone in
// landscape.
//
// `env(safe-area-inset-*)` is a CSS value with no JS equivalent, so index.html
// carries a hidden probe whose padding is set from those four values and we
// read the padding back. Zero everywhere it is unsupported or absent, which is
// exactly what a device with no insets should report anyway.
//
// WHY THERE IS A SECOND STEP.
//
// The sensor housing is on ONE side in landscape, and the browser reports it
// on BOTH. Measured: with a probe reporting left 64 / right 64, the drawer
// handle stopped 64px short of an edge with nothing behind it and the HUD sat
// inset 74px at both ends, which is exactly what a playthrough recording shows
// — a black bar down the left, live map down the right, and the chrome held
// off both.
//
// Each consumer was already applying each edge's own value to that edge; there
// is no max() and no shared constant anywhere downstream. The symmetry is in
// what the platform hands us, so this is where it has to be undone.
//
// A symmetric horizontal pair therefore means "one of these is the housing and
// the other is not". We keep the housing side whole and free the other.

import { NO_INSETS, housingSide, resolveInsets, type Insets } from './HudLayout.ts'
import presentation from '../data/presentation.json'

const PROBE_ID = 'safe-area'
const SAFE = presentation.safeArea

function px(value: string): number {
  const n = Number.parseFloat(value)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}

/** Straight off the probe, before anything is resolved. Reported by the
 *  harness so a run can say what the platform claimed as well as what we did
 *  with it. */
export function rawSafeAreaInsets(): Insets {
  try {
    const el = globalThis.document?.getElementById(PROBE_ID)
    if (!el) return { ...NO_INSETS }
    const s = globalThis.getComputedStyle(el)
    return {
      top: px(s.paddingTop),
      right: px(s.paddingRight),
      bottom: px(s.paddingBottom),
      left: px(s.paddingLeft),
    }
  } catch {
    // No document, no computed style, or a browser that dislikes the query.
    // A HUD in the corners is better than no HUD at all.
    return { ...NO_INSETS }
  }
}

function screenAngle(): number | null {
  const o = (globalThis as { screen?: { orientation?: { angle?: number } } }).screen?.orientation
  return typeof o?.angle === 'number' ? o.angle : null
}

/** The insets every layout should use: per edge, resolved onto the edge that
 *  has the hardware. */
export function safeAreaInsets(): Insets {
  const side = housingSide(screenAngle(), SAFE.housingAtAngle90 as 'left' | 'right')
  return resolveInsets(rawSafeAreaInsets(), side)
}

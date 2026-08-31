// The safe area, read from the browser.
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

import { NO_INSETS, type Insets } from './HudLayout.ts'

const PROBE_ID = 'safe-area'

function px(value: string): number {
  const n = Number.parseFloat(value)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}

export function safeAreaInsets(): Insets {
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

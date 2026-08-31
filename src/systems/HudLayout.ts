// Where every HUD element goes, as explicit rectangles.
//
// The map is full-bleed: it reaches all four edges and nothing is reserved
// from it. Kingdom Rush, which is the reference for this game's look, has no
// bars at all — a few small dark pills in the top-left, a settings button in
// the top-right, and the board underneath all of it.
//
// An earlier version of this file reserved a strip at the top and bottom and
// clipped the world camera to what was left. That did stop the overlaps, and
// it was the wrong fix: on a 390px-tall phone the two strips ate a third of
// the screen, and thick black bars look worse than the collisions they
// prevented.
//
// So overlap is solved by *layout* instead. Every element gets a rectangle,
// the rectangles are disjoint by construction, and a test checks that they
// stay disjoint at every viewport the game runs at. Elements sit over map art,
// which is fine — each one carries its own plate, stroke or backing, and that
// is how the reference does it.
//
// Phaser-free, so the arithmetic can be checked at sizes no desktop hands us.

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The safe area, in CSS pixels.
 *
 * A notched phone in landscape puts the notch on one side and the home
 * indicator along the bottom. `viewport-fit=cover` lets the canvas fill the
 * display, and these are what stop the HUD being placed underneath the
 * hardware. Zero everywhere on a device without any.
 */
export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

export interface LayoutInput {
  width: number
  height: number
  insets: Insets
  /** Measured from the art, not guessed: the three counter plates side by side. */
  countersWidth: number
  /** Measured from the run's hand: the ability icons and the gap between the
   *  drafted group and the hero's own. */
  abilitiesWidth: number
}

export interface LayoutConfig {
  marginX: number
  marginY: number
  plateHeight: number
  /** Gap between the top row and the readouts under it. */
  rowGap: number
  rowHeight: number
  iconHeight: number
  /** The mute and pause buttons in the bottom corners. */
  cornerButton: number
  /** Widest the start-wave button may be; it takes less when the counters and
   *  the insets leave less. */
  startWidth: number
  startMinWidth: number
}

export interface HudLayout {
  counters: Rect
  startButton: Rect
  /** Under the counters: the wave message, or the boss bar while one is up.
   *  They are mutually exclusive, so they share one rectangle. */
  messageRow: Rect
  /** Under the start button: the hero's name and health. */
  heroRow: Rect
  abilities: Rect
  mute: Rect
  pause: Rect
  /**
   * How much the counter row and the ability row had to shrink to fit.
   *
   * 1 on any screen wide enough. An iPhone SE in landscape with a notch has
   * 480 usable pixels, and three counter plates plus the narrowest useful
   * start button want 500 of them — so something has to give, and it is better
   * that it gives evenly than that two elements are drawn on top of each other.
   */
  counterScale: number
  abilityScale: number
  /**
   * Where a panel may open without covering any of the above — the build menu.
   * Not reserved from the map, which still draws through it; it is only a
   * hint about where chrome can go.
   */
  panelArea: Rect
}

export function hudLayout(input: LayoutInput, cfg: LayoutConfig): HudLayout {
  const { width: W, height: H, insets } = input
  const left = insets.left + cfg.marginX
  const right = W - insets.right - cfg.marginX
  const top = insets.top + cfg.marginY
  const bottom = H - insets.bottom - cfg.marginY

  // The counters give way first, because a slightly smaller pill is still
  // readable and an overlapping one is not.
  const topRoom = right - left - cfg.startMinWidth - cfg.marginX
  const countersW = Math.min(input.countersWidth, Math.max(0, topRoom))
  const counterScale = input.countersWidth > 0 ? countersW / input.countersWidth : 1
  const counters: Rect = {
    x: left, y: top,
    width: countersW,
    height: cfg.plateHeight * counterScale,
  }

  // The start button then takes what is left, down to its own floor: at 240px
  // fixed it ran into the wave counter on a 568px screen.
  const spare = right - (counters.x + counters.width) - cfg.marginX
  const startW = Math.max(cfg.startMinWidth, Math.min(cfg.startWidth, spare))
  const startButton: Rect = {
    x: right - startW, y: top, width: startW, height: cfg.plateHeight,
  }

  // Second row, split by x. Three things want it — the wave message, the boss
  // bar and the hero's health — and splitting by position rather than by
  // priority is what makes "they never collide" a property of the layout.
  const rowY = top + Math.max(counters.height, startButton.height) + cfg.rowGap
  const rowW = right - left
  const heroW = Math.max(96, Math.round(rowW * 0.3))
  const gap = 14
  const messageRow: Rect = {
    x: left, y: rowY, width: Math.max(60, rowW - heroW - gap), height: cfg.rowHeight,
  }
  const heroRow: Rect = {
    x: right - heroW, y: rowY, width: heroW, height: cfg.rowHeight,
  }

  // Bottom row: the two corner buttons hold the ends, the abilities the middle.
  const btn = cfg.cornerButton
  const mute: Rect = {
    x: left, y: bottom - btn, width: btn, height: btn,
  }
  const pause: Rect = {
    x: right - btn, y: bottom - btn, width: btn, height: btn,
  }
  // Centred between the two corner buttons, and shrunk if it does not fit
  // between them. Centring on the screen alone put the outermost icon on top
  // of mute on a narrow phone with a full hand.
  const abilityGap = 12
  const lo = mute.x + mute.width + abilityGap
  const hi = pause.x - abilityGap
  const room = Math.max(0, hi - lo)
  const abilitiesW = Math.min(input.abilitiesWidth, room)
  const abilityScale = input.abilitiesWidth > 0 ? abilitiesW / input.abilitiesWidth : 1
  const abilities: Rect = {
    x: lo + (room - abilitiesW) / 2,
    y: bottom - cfg.iconHeight * abilityScale,
    width: abilitiesW,
    height: cfg.iconHeight * abilityScale,
  }

  const panelTop = rowY + cfg.rowHeight + 8
  const panelArea: Rect = {
    x: insets.left + 6,
    y: panelTop,
    width: W - insets.left - insets.right - 12,
    height: Math.max(60, abilities.y - 8 - panelTop),
  }

  return {
    counters, startButton, messageRow, heroRow, abilities, mute, pause, panelArea,
    counterScale, abilityScale,
  }
}

/** Whether two rectangles share any area. */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width
    && a.y < b.y + b.height && b.y < a.y + a.height
}

/** Every pair of HUD rectangles that collides. Empty is the only valid answer;
 *  `panelArea` is excluded because it is a hint, not an element. */
export function collisions(layout: HudLayout): string[] {
  const named = Object.entries(layout)
    .filter(([k, v]) => k !== 'panelArea' && typeof v === 'object') as Array<[string, Rect]>
  const hits: string[] = []
  for (let i = 0; i < named.length; i++) {
    for (let j = i + 1; j < named.length; j++) {
      const [an, a] = named[i]!
      const [bn, b] = named[j]!
      if (overlaps(a, b)) hits.push(`${an} x ${bn}`)
    }
  }
  return hits
}

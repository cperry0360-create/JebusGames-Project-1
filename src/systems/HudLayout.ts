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
  /** The settings gear. Square, and it sets the height of the CANCEL button
   *  in the opposite corner too. */
  cornerButton: number
  /** CANCEL is a word, not a glyph, so it is wider than it is tall. */
  cancelWidth: number
  /** Widest the start-wave button may be; it takes less when the counters and
   *  the insets leave less. */
  startWidth: number
  startMinWidth: number
}

export interface HudLayout {
  counters: Rect
  startButton: Rect
  /** The right of the second row: the wave message, or the boss bar while one
   *  is up. They are mutually exclusive, so they share one rectangle. */
  messageRow: Rect
  /** The left of the second row, under the counters: the hero's name and
   *  health. On the LEFT deliberately — see the note where it is built. */
  heroRow: Rect
  abilities: Rect
  /**
   * The settings gear, at the RIGHT-HAND END OF THE TOP ROW. ONE corner
   * button, where there used to be two: a mute toggle with a stepped volume
   * readout in the bottom-left and a pause button in the bottom-right. Four
   * controls' worth of chrome on a phone screen, for settings that are opened
   * once and then left alone.
   *
   * It was in the bottom-right corner. The top is where a player looks for
   * it — Kingdom Rush, the reference for this game's look, puts it top-right
   * — and moving it there frees the bottom corner for CANCEL, which had been
   * floating over the middle of the board.
   *
   * The gear opens a dialog that pauses the game and holds all of it — three
   * sliders and the three ways out of a run.
   */
  settings: Rect
  /**
   * CANCEL, bottom-right, in the corner the gear vacated.
   *
   * It is only on the glass while an ability or a Restructure is armed, but it
   * is reserved from the layout ALWAYS. A button that appears into whatever
   * space happens to be free is a button that will one day appear on top of
   * something; the ability row gives up sixty pixels so that cannot happen.
   *
   * It used to be drawn at `viewW / 2` just above the ability icons, which is
   * over the board — and the board is where the player is being asked to tap.
   */
  cancel: Rect
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

  // THE TOP ROW, RIGHT TO LEFT: the settings gear, then START WAVE, then the
  // counters. The gear is measured out of the row before anything else is
  // fitted, so it can never be what gives way.
  const btn = cfg.cornerButton
  const settings: Rect = {
    // Vertically centred in the row: the gear is square and shorter than a
    // counter plate, and a 40px button sitting on the 44px row's top edge
    // reads as misaligned rather than as deliberate.
    x: right - btn, y: top + (cfg.plateHeight - btn) / 2, width: btn, height: btn,
  }
  const topRight = settings.x - cfg.marginX

  // The counters give way first, because a slightly smaller pill is still
  // readable and an overlapping one is not.
  const topRoom = topRight - left - cfg.startMinWidth - cfg.marginX
  const countersW = Math.min(input.countersWidth, Math.max(0, topRoom))
  const counterScale = input.countersWidth > 0 ? countersW / input.countersWidth : 1
  const counters: Rect = {
    x: left, y: top,
    width: countersW,
    height: cfg.plateHeight * counterScale,
  }

  // The start button then takes what is left, down to its own floor: at 240px
  // fixed it ran into the wave counter on a 568px screen.
  const spare = topRight - (counters.x + counters.width) - cfg.marginX
  const startW = Math.max(cfg.startMinWidth, Math.min(cfg.startWidth, spare))
  const startButton: Rect = {
    x: topRight - startW, y: top, width: startW, height: cfg.plateHeight,
  }

  // Second row, split by x. Three things want it — the wave message, the boss
  // bar and the hero's health — and splitting by position rather than by
  // priority is what makes "they never collide" a property of the layout.
  //
  // THE HERO BAR IS ON THE LEFT, and it used to be on the right. The new map
  // plate paints COURJAHAN'S TAVERN and its signboard into the map's top-right
  // corner, and at the minimum zoom the whole board is on screen — so the
  // map's top-right corner IS the screen's top-right corner, and the hero's
  // health bar sat on the painted sign for the entire run. Measured at
  // 844x390: the sign lands at screen x 572..722, the old hero row at 587..834.
  //
  // The left is where it stops being a collision at every zoom below maximum,
  // and it groups the hero's health with the counters, which are also his.
  // The message row inherits the right-hand end and can still reach the sign;
  // that is a line of stroked text, and the boss bar that shares the rectangle
  // carries its own plate and is only up for one wave in thirteen. A solid
  // plate parked there for the whole run is the thing worth moving.
  const rowY = top + Math.max(counters.height, startButton.height) + cfg.rowGap
  const rowW = right - left
  const heroW = Math.max(96, Math.round(rowW * 0.3))
  const gap = 14
  const heroRow: Rect = {
    x: left, y: rowY, width: heroW, height: cfg.rowHeight,
  }
  const messageRow: Rect = {
    x: left + heroW + gap, y: rowY,
    width: Math.max(60, rowW - heroW - gap), height: cfg.rowHeight,
  }

  // Bottom row: CANCEL on the right, the abilities to the left of it. This is
  // the corner the settings gear used to hold; the gear is in the top row now.
  const cancel: Rect = {
    x: right - cfg.cancelWidth, y: bottom - btn, width: cfg.cancelWidth, height: btn,
  }
  // Centred on the SCREEN, with the same width given up on both sides.
  //
  // Centring on the screen alone put the outermost icon on top of the corner
  // button on a narrow phone with a full hand. Taking the room off the right
  // only — which is where the button is — fixes the overlap and moves the row
  // 56px off centre, and a thumb row that is visibly not centred reads as a
  // layout fault. So the reservation is mirrored: CANCEL's width is taken off
  // both ends, the row stays centred, and `abilityScale` absorbs the loss.
  const abilityGap = 12
  const reserve = cfg.cancelWidth + abilityGap
  const lo = left + reserve
  const hi = right - reserve
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
    counters, startButton, messageRow, heroRow, abilities, settings, cancel,
    panelArea, counterScale, abilityScale,
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

/**
 * Whether a press at this screen point belongs to the HUD.
 *
 * The HUD is a separate scene, so its interactive objects never appear in the
 * world scene's hit list and the world's own "was this press taken by UI?"
 * check cannot see them. Every tap on an ability icon therefore also reached
 * the board — which meant tapping a second ability *cast the first one at the
 * bottom of the screen*, silently spending it. That is how a Server Nuke could
 * be consumed by a tap that never went near the lane.
 *
 * Only the rectangles that actually accept a press are listed. `panelArea` is
 * most of the board and `messageRow` is text, so neither takes a tap away from
 * the world.
 */
export function hudTakesPress(layout: HudLayout, x: number, y: number): boolean {
  const inside = (r: Rect): boolean =>
    x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height
  return inside(layout.abilities) || inside(layout.startButton)
    || inside(layout.settings) || inside(layout.cancel)
}

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

/**
 * Which horizontal edge the sensor housing is on, from the screen's rotation.
 *
 * The natural orientation of a phone is portrait with the housing along the
 * top edge. `screen.orientation.angle` is how far the content is rotated from
 * that, so a quarter turn puts the top edge on one side or the other:
 *
 *   90  -> the side `atAngle90` names, which presentation.json sets to left:
 *          landscape-primary is iOS `landscapeLeft`, home indicator on the
 *          right, so the device's top edge is on the left.
 *   270 -> the mirror of it.
 *
 * `null` for anything else — portrait, an unrotated tablet, or a browser with
 * no Screen Orientation API. Null means we do not know, and not knowing means
 * we keep both insets, which is what shipped before this and is merely
 * over-cautious rather than wrong.
 */
export function housingSide(
  angle: number | null,
  atAngle90: 'left' | 'right',
): 'left' | 'right' | null {
  if (angle === null || !Number.isFinite(angle)) return null
  const a = ((angle % 360) + 360) % 360
  if (a === 90) return atAngle90
  if (a === 270) return atAngle90 === 'left' ? 'right' : 'left'
  return null
}

/**
 * Resolves a symmetric horizontal report onto the edge that actually has
 * hardware behind it.
 *
 * Only a SYMMETRIC pair is touched. When the platform reports the two edges
 * differently it already knows something we do not, and it is trusted whole.
 *
 * The freed edge goes to ZERO rather than to some smaller corner allowance.
 * The rounded display corner is real, but it is a corner and this is a whole
 * edge, and the HUD already carries a 10px margin of its own that covers it. A
 * non-zero value here would leave the drawer handle short of the screen by
 * that much, which is the bug rather than a smaller version of the fix.
 */
export function resolveInsets(raw: Insets, side: 'left' | 'right' | null): Insets {
  const symmetric = raw.left > 0 && raw.left === raw.right
  if (!symmetric || side === null) return { ...raw }
  return side === 'left' ? { ...raw, right: 0 } : { ...raw, left: 0 }
}


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
  /** The hero portrait chip's square edge. A tap target: 44 is the floor and
   *  this is comfortably over it, because a mis-tap here moves the hero. */
  heroChip: number
  /** Between the chip and the nearest ability button. Deliberately generous:
   *  the two controls do different things and a thumb travelling the row must
   *  not find them adjacent. */
  heroChipGap: number
  /** The settings gear. Square. It used to set CANCEL's height as well; CANCEL
   *  has its own now, because it is not a peer of the gear — one is opened
   *  once a session and the other is the way out of a mode. */
  cornerButton: number
  /** CANCEL is a word AND a glyph, so it is wider than it is tall. */
  cancelWidth: number
  /** Taller than the gear. It is the way out of a mode the player entered by
   *  accident, and it is pressed with a thumb, in a hurry, on a moving board. */
  cancelHeight: number
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
  /**
   * THE HERO'S PORTRAIT CHIP, at the bottom beside the ability buttons.
   *
   * It replaces `heroRow`, a wide bar on the second row under the counters
   * that carried the hero's name and a segmented health bar. Two things were
   * wrong with it and only one was a layout problem. The layout problem: it
   * was a solid plate parked across the top of the board for the whole run, on
   * a map that is full-bleed by design. The other: the hero's health was drawn
   * in TWO places, there and on a bar over the sprite's own head, and neither
   * of them was where the player's thumb already was.
   *
   * So it is one control now, at the bottom, with the bar drawn ON the
   * portrait instead of beside it — and it is a control rather than a readout:
   * tapping it selects the hero, exactly as tapping his sprite does.
   */
  heroChip: Rect
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
   * CANCEL, in the BOTTOM-RIGHT CORNER, on the ability row's own line.
   *
   * It is only on the glass while there is something to cancel — an armed
   * ability, a rally order waiting for a tap, a tile picked in the control
   * drawer — but it is reserved from the layout ALWAYS. A button that appears
   * into whatever space happens to be free is a button that will one day
   * appear on top of something.
   *
   * IT HAS MOVED THREE TIMES AND THIS IS THE ONE THAT MATTERS. It began at
   * `viewW / 2` just above the ability icons, went to the bottom-right corner
   * the gear vacated, and was then moved up into the HUD band beside the
   * counters on the reasoning that nothing which is not part of the game world
   * belongs on the board.
   *
   * That reasoning put THE ONLY WAY OUT OF TARGETING MODE in the far corner
   * from the thumb that armed it. Playtesting found the button unreadable and
   * unreachable, and the player stuck. Tidiness lost: it is back at the bottom
   * of the screen, at the end of the row the ability icons are in, so the hand
   * that armed the ability is already there — and it is in the same reading
   * order as the icons, which is where the eye goes when a tap has just put
   * the game into a mode.
   *
   * THE PRICE, paid honestly: on a narrow screen the ability row gives way
   * rather than run under it (see `abilities` below), so a notched phone in
   * landscape draws smaller icons than it did. Smaller icons are survivable.
   * A player who cannot leave targeting mode is not.
   *
   * DOCKED to the display's right edge, like the drawer's handle — flush, no
   * margin, no rounded corner on that side. See `EdgeDock`. It keeps the
   * bottom margin, because the ability row it is aligned with keeps it.
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

  // THE SECOND ROW IS THE MESSAGE ROW AND NOTHING ELSE NOW.
  //
  // It used to be split by x between the wave message and the hero's health,
  // with the health on the left — it had been on the right, and the map plate
  // paints COURJAHAN'S TAVERN into the board's top-right corner, so at minimum
  // zoom the bar sat on the painted signboard for the entire run. Moving it
  // left fixed that collision and left the real problem: a solid plate across
  // the top of a map that is full-bleed by design, drawing a number the sprite
  // on the board was already showing.
  //
  // The hero's health went to the bottom, onto a portrait chip beside his own
  // buttons. So the row is one occupant again and takes its width back rather
  // than reserving a hole for something that is not there — which is the same
  // thing that happened when CANCEL left it.
  const rowY = top + Math.max(counters.height, startButton.height) + cfg.rowGap
  const rowW = right - left
  const messageRow: Rect = {
    x: left, y: rowY, width: rowW, height: cfg.rowHeight,
  }

  // CANCEL, flush to the display's right edge and sitting on the same baseline
  // as the ability icons. FLUSH means `W - insets.right`, not `right`, which
  // carries `marginX`: docked chrome takes no gap on the edge it is docked to.
  const cancel: Rect = {
    x: W - insets.right - cfg.cancelWidth,
    y: bottom - cfg.cancelHeight,
    width: cfg.cancelWidth,
    height: cfg.cancelHeight,
  }

  // THE BOTTOM ROW IS THE CHIP AND THE ICONS, CENTRED AS ONE GROUP.
  //
  // THE ABILITY ROW GIVES WAY TO CANCEL, and only as far as it has to. The
  // icons are centred in the whole row. On a screen with room to spare that
  // puts them nowhere near the corner and nothing is reserved at all —
  // 1280x720 keeps every icon at full size. On a narrow one the row would
  // reach under the button, so its half-width is capped at the distance from
  // the row's centre to CANCEL's left edge, which shrinks it SYMMETRICALLY and
  // leaves the icons centred. A one-sided reservation would keep them larger
  // and slide the whole hand off centre, which reads as a layout fault.
  //
  // THE ICONS STAY EXACTLY CENTRED AND THE CHIP SITS BESIDE THEM, which is
  // not the first thing tried and is the right one.
  //
  // Carrying the chip INSIDE the centred group — [chip][gap][icons] centred as
  // one — is tidier to write and pushes the icons 41px to the right of centre
  // on every screen. That row's position is tuned and long-standing, and
  // "where the hand sits" is not something a new readout gets to move. So the
  // chip is reserved from the row's half-width instead, exactly as CANCEL
  // already is on the other side: the icons give way symmetrically and stay
  // centred, and the chip takes the space that reservation freed.
  //
  // THE CHIP DOES NOT SHRINK WITH THE ICONS. `abilityScale` exists because a
  // smaller icon is survivable; a tap target under 44pt is not, and a mis-tap
  // on THIS one walks the hero into a fireball rather than wasting a cooldown.
  const lo = left
  const hi = right
  const centre = (lo + hi) / 2
  const chipBlock = cfg.heroChip + cfg.heroChipGap
  // Two reservations, and the row is capped by the tighter of them so it stays
  // centred: CANCEL on the right, the chip's block on the left.
  const halfRight = Math.max(0, cancel.x - cfg.marginX - centre)
  const halfLeft = Math.max(0, centre - lo - chipBlock)
  const abilitiesW = Math.min(input.abilitiesWidth, Math.min(halfLeft, halfRight) * 2)
  const abilityScale = input.abilitiesWidth > 0 ? abilitiesW / input.abilitiesWidth : 1
  const abilities: Rect = {
    x: centre - abilitiesW / 2,
    y: bottom - cfg.iconHeight * abilityScale,
    width: abilitiesW,
    height: cfg.iconHeight * abilityScale,
  }
  // Immediately left of the icons with the gap between, and clamped to the
  // margin so it can never run off the edge on a screen too narrow to honour
  // both. Bottom-aligned with them rather than centred on them: a row of
  // controls that share a bottom edge reads as one row, whatever the icons
  // have shrunk to.
  const heroChip: Rect = {
    x: Math.max(lo, abilities.x - chipBlock),
    y: bottom - cfg.heroChip,
    width: cfg.heroChip,
    height: cfg.heroChip,
  }

  // WHERE CHROME MAY GO: under everything in the HUD band, above the hand.
  //
  // The top is the text row again. CANCEL used to hang eighteen pixels below
  // it and push this down; it is at the bottom of the screen now, so the
  // drawer gets those eighteen pixels back.
  //
  // The bottom is `min` of the two things down there, and the `min` matters:
  // on a narrow screen `abilityScale` shrinks the icons below CANCEL's height,
  // so CANCEL is the taller of the pair and the lower bound.
  const panelTop = rowY + cfg.rowHeight + 8
  // The chip joins the `min`: it is the same height as a full-size icon row
  // and taller than a shrunk one, so on a narrow screen it is the lowest thing
  // a panel must stay clear of.
  const panelBottom = Math.min(abilities.y, cancel.y, heroChip.y)
  const panelArea: Rect = {
    x: insets.left + 6,
    y: panelTop,
    width: W - insets.left - insets.right - 12,
    height: Math.max(60, panelBottom - 8 - panelTop),
  }

  return {
    counters, startButton, messageRow, heroChip, abilities, settings, cancel,
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
    || inside(layout.settings) || inside(layout.cancel) || inside(layout.heroChip)
}

/**
 * Whether a GESTURE that starts at this screen point belongs to the HUD.
 *
 * A DIFFERENT QUESTION FROM `hudTakesPress`, and the difference is the whole
 * point. That one asks "does this TAP belong to a control?" and is deliberately
 * narrow: `messageRow` is a line of text and `panelArea` is most of the board,
 * so neither may take a tap away from the world.
 *
 * This one asks "is there SOLID CHROME under this finger?" — which is what
 * decides whether a drag may pan the map. Dragging on a painted counter plate
 * slid the board underneath it, because the plate is not a control and so was
 * never in the list above. It is still not a control; it is still opaque, and a
 * map that moves under opaque furniture reads as the furniture being a hole.
 *
 * So: every control, plus every plate. Not `messageRow`, which is stroked text
 * with nothing behind it, and not `panelArea`, which is a hint rather than an
 * element.
 */
export function hudBlocksGesture(layout: HudLayout, x: number, y: number): boolean {
  const inside = (r: Rect): boolean =>
    x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height
  return hudTakesPress(layout, x, y) || inside(layout.counters)
}

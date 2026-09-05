// Where the five hero cards go, and how big the character in each one is.
//
// WHY THIS IS ARITHMETIC IN ITS OWN FILE, like `HudLayout` and `AbilityBar`
// before it. The version this replaces computed the row inline in the scene
// from a chain of best-effort steps: take 42% of the card for the text, take
// what is left for the portraits, and floor the portrait at 24px so it is
// never zero. Every step was reasonable and the chain had no guarantee at the
// end of it, so when the text did not fit in its 42% the leftover went
// NEGATIVE and the floor kept a portrait alive inside a strip with negative
// height. That one number produced all four reported faults at once:
//
//   * the strip's top was below its own centre, so the portraits were drawn
//     ABOVE the card — over the HERO heading and over the subtitle;
//   * the 24px floor made the character unidentifiable;
//   * the name sat at `h / 2` of a negative `h`, on top of the portrait;
//   * the selection ring stroked a rectangle of negative height, which is why
//     it read as outlining the portrait rather than the card.
//
// So the row is solved rather than accumulated. Everything below is derived
// from ONE decision — how wide a card is — and the vertical extents are
// returned as rectangles that cannot overlap because they are built by adding
// heights together, not by subtracting one guess from another.
//
// Phaser-free, so the promise "nothing overlaps anything" is checkable at
// every viewport and every text size without a canvas.

import type { Rect } from './HudLayout.ts'

export interface HeroRowConfig {
  /** Between cards, horizontally and between wrapped rows. */
  gap: number
  /** Inside a card, around everything. */
  pad: number
  /** Between the portrait and the name under it. This is the "clear
   *  separation" the cards were reported as not having. */
  nameGap: number
  /**
   * The smallest a portrait may be and still be a picture of somebody.
   *
   * A HARD FLOOR WITH A CONSEQUENCE, unlike the 24px one it replaces. Below
   * this the row wraps to two lines rather than shrinking further, because a
   * card too small to identify a character is not a picker — it is five
   * identical smudges.
   */
  minPortrait: number
  /** The largest. Past this the cards are mostly empty and the row reads as
   *  five posters rather than as a control. */
  maxPortrait: number
}

export interface HeroRowInput {
  /** The width available for the whole row. */
  width: number
  /** How many heroes. Five today. */
  count: number
  /** The rendered height of a name label. MEASURED by the caller and passed
   *  in: how tall a string is at a given size is a font question, and this
   *  file cannot ask one. */
  nameHeight: number
}

export interface HeroRowLayout {
  /** One card per hero, in roster order, relative to the row's top-left. */
  cards: Rect[]
  /** The portrait box inside each card, in the same space. */
  portraits: Rect[]
  /** The name box inside each card, in the same space. */
  names: Rect[]
  /** The square edge every portrait is fitted into. */
  portrait: number
  /** 1 normally; 2 when five at `minPortrait` will not fit across. */
  rows: number
  /** The height the row needs. The caller sizes the section to this rather
   *  than handing down a share of a budget and hoping. */
  height: number
}

/** Cards per row, given how many will fit at the minimum size. */
function perRow(count: number, fit: number): number {
  if (fit >= count) return count
  // Two rows, as evenly as they divide: 3 and 2 rather than 4 and 1, so the
  // row reads as a grid rather than as a row with a remainder.
  return Math.ceil(count / 2)
}

/**
 * The row, solved.
 *
 * The order of the decisions is the point:
 *
 *   1. How many cards fit across at `minPortrait`? That decides `rows`, and
 *      it is the ONLY thing that decides it. Wrapping is a consequence of not
 *      fitting, never of a height running out.
 *   2. Given that many across, how wide is a card?
 *   3. The portrait is the card's width less its padding, clamped into the
 *      band. Clamped, so it is never below `minPortrait` and never above
 *      `maxPortrait`.
 *   4. The card's HEIGHT is then added up from its parts. It is not a share
 *      of anything and there is nothing left to go negative.
 */
export function heroRow(input: HeroRowInput, cfg: HeroRowConfig): HeroRowLayout {
  const n = Math.max(1, Math.floor(input.count))
  const minCard = cfg.minPortrait + cfg.pad * 2
  // How many of the smallest acceptable card fit across.
  const fit = Math.max(1, Math.floor((input.width + cfg.gap) / (minCard + cfg.gap)))
  const across = perRow(n, fit)
  const rows = Math.ceil(n / across)

  const cardW = Math.floor((input.width - cfg.gap * (across - 1)) / across)
  const portrait = Math.max(
    cfg.minPortrait,
    Math.min(cfg.maxPortrait, cardW - cfg.pad * 2),
  )
  const cardH = cfg.pad + portrait + cfg.nameGap + input.nameHeight + cfg.pad

  const cards: Rect[] = []
  const portraits: Rect[] = []
  const names: Rect[] = []
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / across)
    const c = i % across
    // The last row is centred when it is short, so 3-and-2 reads as a block
    // rather than as a row with a hole in the right-hand end.
    const inRow = Math.min(across, n - r * across)
    const rowW = inRow * cardW + (inRow - 1) * cfg.gap
    const x = (input.width - rowW) / 2 + c * (cardW + cfg.gap)
    const y = r * (cardH + cfg.gap)
    cards.push({ x, y, width: cardW, height: cardH })
    portraits.push({
      x: x + (cardW - portrait) / 2,
      y: y + cfg.pad,
      width: portrait,
      height: portrait,
    })
    names.push({
      x: x + cfg.pad,
      y: y + cfg.pad + portrait + cfg.nameGap,
      width: cardW - cfg.pad * 2,
      height: input.nameHeight,
    })
  }

  return {
    cards,
    portraits,
    names,
    portrait,
    rows,
    height: rows * cardH + (rows - 1) * cfg.gap,
  }
}

/**
 * The largest row that fits inside `maxHeight`.
 *
 * The caller has a ceiling — the hero block may not eat the whole screen — and
 * the row has a preferred size. Reconciling those by SUBTRACTING one from the
 * other is what produced the negative strip; reconciling them by trying sizes
 * and keeping the largest that fits cannot produce anything invalid, because
 * every candidate is a complete, self-consistent layout.
 *
 * Steps down one pixel at a time from `maxPortrait` and stops at
 * `minPortrait`. That floor is not negotiable: if even the smallest row is too
 * tall, the smallest row is what comes back and the CALLER has to find the
 * space, because a picker below it is not a picker. Six-and-a-bit dozen
 * iterations of pure arithmetic, once per render.
 */
export function fitHeroRow(
  input: HeroRowInput, cfg: HeroRowConfig, maxHeight: number,
): HeroRowLayout {
  let best = heroRow(input, { ...cfg, maxPortrait: cfg.minPortrait })
  for (let p = cfg.maxPortrait; p >= cfg.minPortrait; p--) {
    const row = heroRow(input, { ...cfg, maxPortrait: p })
    if (row.height <= maxHeight) return row
    best = row
  }
  return best
}

/**
 * The description block under the cards: a blurb beside the hero's two
 * buttons.
 *
 * The panel used to be three lines at the top of a tall empty box. It is not a
 * fixed share any more: the blurb takes the left, the two ability chips take a
 * fixed column on the right, and the block is as tall as the taller of them.
 *
 * `chipColumn` is a FRACTION rather than a width so a narrow screen gives the
 * two sides ground at the same rate — a fixed column would eat the blurb's
 * wrap width first and turn three lines into six.
 */
export interface DescriptionInput {
  width: number
  /** Measured height of the wrapped blurb at the chosen size. */
  blurbHeight: number
  /** Measured height of one ability chip: icon or label, whichever is taller. */
  chipHeight: number
  /** How many chips. Two: slot 1 and the hero power. */
  chips: number
}

export interface DescriptionConfig {
  /** Fraction of the width the chip column takes. */
  chipColumn: number
  /** Between the blurb and the chips, and between the chips. */
  gap: number
  /** Between an icon and its label. */
  iconGap: number
}

export interface DescriptionLayout {
  blurb: Rect
  chips: Rect[]
  height: number
}

export function heroDescription(
  input: DescriptionInput, cfg: DescriptionConfig,
): DescriptionLayout {
  const chipsW = Math.round(input.width * cfg.chipColumn)
  const blurbW = input.width - chipsW - cfg.gap
  const chipsH = input.chips * input.chipHeight + Math.max(0, input.chips - 1) * cfg.gap
  const height = Math.max(input.blurbHeight, chipsH)
  const chips: Rect[] = []
  for (let i = 0; i < input.chips; i++) {
    chips.push({
      x: input.width - chipsW,
      // Centred as a group against the taller side, so two short chips beside
      // a four-line blurb do not sit against its first line.
      y: (height - chipsH) / 2 + i * (input.chipHeight + cfg.gap),
      width: chipsW,
      height: input.chipHeight,
    })
  }
  return {
    blurb: { x: 0, y: (height - input.blurbHeight) / 2, width: blurbW, height: input.blurbHeight },
    chips,
    height,
  }
}

/** Whether two rectangles share any area. The same test `HudLayout` uses;
 *  re-exported here so the hero-row tests read against one definition. */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width
    && a.y < b.y + b.height && b.y < a.y + a.height
}

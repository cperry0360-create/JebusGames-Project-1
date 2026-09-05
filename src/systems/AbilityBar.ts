// The ability bar's layout, as one description that both the drawing and the
// hit-testing are read from.
//
// This bar has now broken twice, and both times for the same reason: the
// icons' positions and the rectangles you tap were computed in different
// places, from different inputs, and drifted apart.
//
//   1. The slots were pitched narrower than the icons drawn in them.
//   2. The Server Nuke's fifth icon. Two separate failures at once —
//      the row's width was measured once at scene creation, when the drop had
//      not happened, so five icons were laid out inside a rectangle centred
//      for four; and the string used to decide whether to rebuild the slots
//      listed the same abilities in a different order from the string it was
//      compared against, so once the drop landed the two never matched again
//      and the bar was destroyed and rebuilt on every single frame. A hit
//      rectangle that is destroyed every frame can never complete a tap, which
//      is why no ability could be used while tower panels still opened.
//
// PROTOTYPE-GAP item 24 names the rule this file exists to enforce: every
// interactive region is described once, and everything else — where the icon
// is drawn, where the frame is stroked, where the tap lands, how wide the row
// is, and whether the row needs rebuilding — is derived from that one
// description. There is no second place to keep in step.
//
// Phaser-free on purpose. The layout is arithmetic, and arithmetic that
// decides whether the game is playable should be testable without a canvas.

/** What a slot is, which decides its shape and what tapping it does. */
export type SlotKind = 'ability' | 'haymaker'

/** One slot, before it knows where it is. */
export interface SlotDef {
  id: string
  kind: SlotKind
  icon: string
  /** True for the hero's own actives, which are round medallions rather than
   *  rectangular arcade plates, and are pitched differently. */
  hero: boolean
}

/** One slot, placed. The icon, the frame, the cooldown sweep and the hit
 *  rectangle all come from this and nothing else. */
export interface SlotRegion extends SlotDef {
  /** Left edge of the slot's own column. */
  x: number
  /** Top edge of the icon box. */
  y: number
  /** This slot's width. The two shapes do not share a grid. */
  pitch: number
  /** Icon box height, after any shrink the layout applied. */
  boxH: number
  /** Centre, which is where the icon, the timer and the hit rectangle go. */
  cx: number
  cy: number
}

export interface BarMetrics {
  draftedPitch: number
  draftedIcon: number
  heroPitch: number
  heroIcon: number
  /** Between the drafted group and the hero group. */
  groupGap: number
}

export interface BarPlacement {
  /** Left edge of the row. */
  x: number
  /** Top edge of the row. */
  y: number
  /** Uniform shrink applied when the row will not fit between the corner
   *  buttons on a narrow phone. */
  scale: number
  /** Unscaled icon box height. */
  iconH: number
}

/**
 * The slots this run currently has, in bar order.
 *
 * This is the single source of the order. `slotSignature` is derived from it,
 * so the check for "has the hand changed?" can no longer disagree with the
 * bar it is checking — which is the bug that froze the whole row.
 *
 * Order: everything the run dealt first (the drafted actives, then the rare
 * drop if it has turned up), then the hero's own two. The shape is the signal,
 * so each group is kept whole rather than interleaved.
 */
export function slotDefs(
  abilities: string[],
  rareAbility: string | null | undefined,
  lookup: (id: string) => { icon: string } | undefined,
  heroSlots: SlotDef[],
): SlotDef[] {
  const defs: SlotDef[] = []
  for (const id of abilities) {
    const def = lookup(id)
    if (def) defs.push({ id, kind: 'ability', icon: def.icon, hero: false })
  }
  if (rareAbility) {
    const def = lookup(rareAbility)
    if (def) defs.push({ id: rareAbility, kind: 'ability', icon: def.icon, hero: false })
  }
  return defs.concat(heroSlots)
}

/** What the slots are, as one comparable value. Rebuild when it changes. */
export function slotSignature(defs: SlotDef[]): string {
  return defs.map((d) => d.id).join(',')
}

/** Whether a gap precedes slot `i`: the seam between the two groups. */
function gapBefore(defs: SlotDef[], i: number): boolean {
  return i > 0 && defs[i]!.hero && !defs[i - 1]!.hero
}

/**
 * The row's unscaled width.
 *
 * Derived by walking the same slots in the same order as `regions`, rather
 * than by counting each kind and multiplying. A count is a second description
 * of the layout and drifts from the first one: the version this replaces
 * assumed exactly two hero slots and was measured once, at scene creation,
 * before the rare drop existed.
 */
export function barWidth(defs: SlotDef[], bar: BarMetrics): number {
  let w = 0
  defs.forEach((d, i) => {
    if (gapBefore(defs, i)) w += bar.groupGap
    w += d.hero ? bar.heroPitch : bar.draftedPitch
  })
  return w
}

/**
 * Every slot, placed. The one description everything else reads.
 *
 * Regions are laid out left to right and never overlap: a slot's hit
 * rectangle spans exactly its own pitch, so a tap belongs to one slot or to
 * none, and the icon is centred in that same span.
 */
export function regions(
  defs: SlotDef[],
  bar: BarMetrics,
  place: BarPlacement,
): SlotRegion[] {
  const k = place.scale
  const boxH = place.iconH * k
  const out: SlotRegion[] = []
  let x = place.x
  defs.forEach((d, i) => {
    if (gapBefore(defs, i)) x += bar.groupGap * k
    const pitch = (d.hero ? bar.heroPitch : bar.draftedPitch) * k
    out.push({
      ...d,
      x,
      y: place.y,
      pitch,
      boxH,
      cx: x + pitch / 2,
      cy: place.y + boxH / 2,
    })
    x += pitch
  })
  return out
}

/** The icon box for a slot, which differs between the two shapes. */
export function iconBox(def: SlotDef, bar: BarMetrics, scale: number): number {
  return (def.hero ? bar.heroIcon : bar.draftedIcon) * scale
}

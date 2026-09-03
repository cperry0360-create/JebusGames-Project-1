// A row of buttons centred as a GROUP.
//
// Phaser-free, so "the row's centre equals the column's centre" can be proved
// at every size in CI rather than sampled in a browser.
//
// WHY IT EXISTS. The loadout screen's two buttons were placed at two hardcoded
// offsets from the screen's middle — one at centre+90 measuring 300 wide, the
// other at centre-190 measuring 240 — so the row spanned centre-310 to
// centre+240 and its own centre landed 35 units to the LEFT of everything else
// on the screen. Two independent offsets cannot stay centred: the moment the
// buttons are different widths, "start here and here" and "sit centred" are
// different instructions, and only one of them was written down.
//
// Measured before the change, at 844x390: the row's centre was 605 against a
// card column centred on 640. The same 35 units at devicePixelRatio 1 and at
// 3, which is what rules out the canvas-versus-CSS-pixel confusion this
// codebase has hit six times — a space error changes with the ratio and an
// arithmetic error does not.

export interface RowInput {
  /** The centre to align to. NOT the viewport's — the content column's, so the
   *  row stays right if the column is ever inset asymmetrically. */
  centreX: number
  /** Each label's natural rendered width, in the same units as everything else. */
  labelWidths: number[]
  /** Space inside a button, either side of its label. */
  padX: number
  /** Space between two buttons. */
  gap: number
  /** No button narrower than this, however short its label. */
  minWidth: number
  /** The widest the whole row may be — the content column. */
  maxTotal: number
}

export interface Row {
  /** ONE width for every button: the widest label's, so the row is
   *  symmetrical and the primary action is not visually smaller than the
   *  secondary one. */
  width: number
  gap: number
  /** Button centres, left to right. */
  centres: number[]
  /** What the row occupies, for the caller and for the test. */
  left: number
  right: number
  /** True when the pair had to be squeezed to fit `maxTotal`. Both shrink
   *  together — letting one give way is how they diverged in the first place. */
  squeezed: boolean
}

export function buttonRow(input: RowInput): Row {
  const n = Math.max(1, input.labelWidths.length)
  const widest = Math.max(...input.labelWidths, 0)
  let width = Math.max(input.minWidth, Math.ceil(widest + input.padX * 2))

  // TOO WIDE FOR THE COLUMN: shrink BOTH, never one.
  const gaps = input.gap * (n - 1)
  let squeezed = false
  if (n * width + gaps > input.maxTotal) {
    width = Math.max(1, Math.floor((input.maxTotal - gaps) / n))
    squeezed = true
  }

  const total = n * width + gaps
  const left = input.centreX - total / 2
  const centres: number[] = []
  for (let i = 0; i < n; i++) centres.push(left + width / 2 + i * (width + input.gap))
  return { width, gap: input.gap, centres, left, right: left + total, squeezed }
}

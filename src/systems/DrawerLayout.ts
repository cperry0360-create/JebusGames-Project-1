import type { Rect } from './HudLayout.ts'

/**
 * Where the control drawer and everything in it goes.
 *
 * Phaser-free, so every rectangle can be proved at every viewport in CI rather
 * than sampled in a browser. That is the same reason `RingLayout` is separate,
 * and it is worth more here: the drawer is a SCROLLING grid, and a scroll
 * offset is the easiest way in the world to compute a tap target that is not
 * where the picture is.
 *
 * THE DRAWER IS OPT-IN AND TEMPORARY. It sits behind a save flag beside the
 * build ring so the two can be compared on the same device; when that is
 * settled, one of them is deleted.
 */

/** Everything one breakpoint decides. Not just the width: see `widths`. */
export interface DrawerStep {
  minViewW: number
  width: number
  /** TOWERS / ACTIVE / PASSIVE. */
  tabBarHeight: number
  /** The pinned strip, which reserves its height whether or not it has
   *  anything in it. */
  detailHeight: number
  /** The strip's icon, square, on its left. */
  detailIcon: number
  /** Between the panel's stacked sections. */
  sectionGap: number
  /** Between the three tabs. */
  tabGap: number
}

export interface DrawerConfig {
  tabWidth: number
  tabHeight: number
  /**
   * The panel's whole budget by viewport width, WIDEST FIRST.
   *
   * A list rather than two numbers, because "152 at 844 and 118 at 568" is a
   * rule with a shape — narrower screens get a narrower drawer — and a rule
   * with a shape should be expressible without editing code. The first entry
   * whose `minViewW` the viewport meets wins; the last should be 0 so there
   * is always an answer.
   *
   * IT CARRIES THE HEIGHTS TOO, and it has to. The panel is 200px tall at
   * 844x390 and 130 at 568x320 — the HUD rows above and the ability strip
   * below decide that, not this file — so one set of chrome heights leaves
   * 18px of grid on the narrow screen, which is less than half a tile and so
   * no tappable tile at all.
   */
  widths: DrawerStep[]
  pad: number
  columns: number
  tileHeight: number
  tileGap: number
  tabLabels: string[]
}

export interface DrawerLayout {
  /** The always-visible tab, docked to the right edge. */
  tab: Rect
  /** The whole TOWERS / ACTIVE / PASSIVE bar. */
  tabBar: Rect
  /** One rectangle per tab, left to right, in the order of `cfg.tabLabels`. */
  tabs: Rect[]
  /** The pinned strip at the bottom. Present whether or not it has content:
   *  a strip that collapses when empty re-flows the grid under the finger at
   *  the moment a tile has just been tapped. */
  detail: Rect
  /** The strip's icon box, square, on its left. */
  detailIcon: Rect
  /** The strip's text column, to the right of the icon. */
  detailText: Rect
  /** The step this layout was built from, so a caller can size text against
   *  the same numbers rather than looking them up again. */
  step: DrawerStep
  /** The panel the tab expands. Zero width while collapsed is NOT modelled
   *  here — the panel's rectangle is where it would be, and the caller shows
   *  or hides it. */
  panel: Rect
  /** The scrolling viewport inside the panel: what the grid is seen through. */
  grid: Rect
  /**
   * One rectangle per tile, IN SCREEN SPACE, already offset by `scroll`.
   *
   * Screen space rather than grid-local on purpose. A tile's tap target and a
   * tile's picture have to be the same rectangle, and the surest way to make
   * them the same is for there to be only one of them.
   */
  tiles: Rect[]
  /** How tall the grid's contents are, scrolled or not. */
  contentHeight: number
  /** The largest scroll offset that still shows content. 0 when it all fits. */
  maxScroll: number
}

/** The whole budget for this viewport, from the data's breakpoint list. */
export function drawerStep(viewW: number, cfg: DrawerConfig): DrawerStep {
  for (const step of cfg.widths) if (viewW >= step.minViewW) return step
  return cfg.widths[cfg.widths.length - 1]!
}

/** The panel width for this viewport. */
export function drawerWidth(viewW: number, cfg: DrawerConfig): number {
  return drawerStep(viewW, cfg).width
}

/**
 * Whether a label fits its tab, given the width the font actually measured.
 *
 * Split out and Phaser-free so the RULE is testable even though the
 * measurement is not: a label that will not fit is replaced by a drawn glyph
 * rather than truncated, because "TOWE..." is worse than a picture.
 */
export function tabLabelFits(labelWidth: number, tabWidth: number, padding = 6): boolean {
  return labelWidth <= tabWidth - padding * 2
}

/**
 * `area` is the space the drawer may occupy — the HUD's `panelArea`, which is
 * already clear of the counters, the start button, the gear, the ability strip
 * and CANCEL. Handing it in rather than recomputing it is what keeps the
 * drawer and the HUD from disagreeing about where the free space is.
 */
export function drawerLayout(
  viewW: number,
  area: Rect,
  count: number,
  scroll: number,
  cfg: DrawerConfig,
  open = false,
  /**
   * The screen edge to dock against, in CSS pixels: the viewport's width less
   * any right-hand safe-area inset, and NOT `area.x + area.width`.
   *
   * `panelArea` carries a six-pixel cosmetic inset on each side, which is
   * right for a panel that floats inside it and wrong for a drawer, whose
   * whole claim is that it is attached to the edge. The handle sat six pixels
   * short of the display and read as a button parked near the edge rather than
   * as the drawer's own edge. Defaulted to the area's edge so an omitted
   * argument is the old behaviour rather than a silent zero.
   */
  dockRight = area.x + area.width,
): DrawerLayout {
  const panelW = drawerWidth(viewW, cfg)
  const panel: Rect = {
    x: dockRight - panelW,
    y: area.y,
    width: panelW,
    height: area.height,
  }
  /*
   * THE TAB TRAVELS WITH THE PANEL. Docked to the right edge while collapsed,
   * and immediately outside the panel's left edge while it is out.
   *
   * It used to stay on the right edge either way, which put it ON TOP of the
   * grid. At 568x320 the panel is 118 wide and the tab is 34: the tab's
   * rectangle covered the right-hand column's first two rows, and because the
   * tab is tested before the tiles — it has to be, two rectangles cannot share
   * a point and both be right — pressing the top-right tile closed the drawer
   * instead of picking a tower. At 844x390 the same overlap was a five-pixel
   * sliver that the tile's centre happened to miss, which is exactly the kind
   * of fault that ships.
   */
  const tab: Rect = {
    x: open ? panel.x - cfg.tabWidth : dockRight - cfg.tabWidth,
    y: area.y + (area.height - cfg.tabHeight) / 2,
    width: cfg.tabWidth,
    height: cfg.tabHeight,
  }

  /*
   * THE PANEL IS THREE STACKED SECTIONS, and only one of them scrolls.
   *
   * It was four. The first was a peanut counter, on the reasoning that the
   * player is spending the whole time this is open so the number belongs where
   * the prices are. It was a SECOND counter, and a screenshot from a level 3
   * playtest caught it reading 404 while the HUD read 408. One number in two
   * places is one number too many; the grid gets the height back.
   *
   *   tabBar   TOWERS / ACTIVE / PASSIVE, so each group gets the full height
   *            rather than a third of it when the other two are filled
   *   grid     the tiles, and the only thing that scrolls
   *   detail   what the selected tower is, pinned to the bottom
   *
   * The grid takes what is left, which on the narrow screen is not much and
   * is why every height here comes from the breakpoint rather than a constant.
   */
  const step = drawerStep(viewW, cfg)
  const innerX = panel.x + cfg.pad
  const innerW = panel.width - cfg.pad * 2
  let y = panel.y + cfg.pad

  const tabBar: Rect = { x: innerX, y, width: innerW, height: step.tabBarHeight }
  const n = Math.max(1, cfg.tabLabels.length)
  const tabW = (innerW - step.tabGap * (n - 1)) / n
  const tabs: Rect[] = []
  for (let i = 0; i < n; i++) {
    tabs.push({
      x: innerX + i * (tabW + step.tabGap), y: tabBar.y,
      width: tabW, height: tabBar.height,
    })
  }
  y += step.tabBarHeight + step.sectionGap

  const detail: Rect = {
    x: innerX,
    y: panel.y + panel.height - cfg.pad - step.detailHeight,
    width: innerW,
    height: step.detailHeight,
  }
  // A SMALL FIXED HORIZONTAL PAD, and the icon centred vertically.
  //
  // It used to pad horizontally by half the leftover height, which on the
  // wide strip is eleven pixels a side — and then gave the text column
  // everything to the strip's right edge, with no pad at all on that side.
  // The trait ran flush into the outline. Five each side leaves the text 87px
  // instead of 80, which is the difference between an eighteen-character
  // trait condensing to 0.62 and being cut.
  const padX = 5
  const detailIcon: Rect = {
    x: detail.x + padX,
    y: detail.y + (detail.height - step.detailIcon) / 2,
    width: step.detailIcon,
    height: step.detailIcon,
  }
  const textX = detailIcon.x + detailIcon.width + padX
  const detailText: Rect = {
    x: textX,
    y: detail.y + 2,
    width: Math.max(1, detail.x + detail.width - padX - textX),
    height: detail.height - 4,
  }

  const grid: Rect = {
    x: innerX,
    y,
    width: innerW,
    // Never negative, and never so small that a tile could not clear
    // `tileVisible`'s half — the caller reports it either way, and a grid of
    // zero is a drawer with nothing tappable in it.
    height: Math.max(0, detail.y - step.sectionGap - y),
  }

  const cols = Math.max(1, cfg.columns)
  const tileW = (grid.width - cfg.tileGap * (cols - 1)) / cols
  const rows = Math.ceil(count / cols)
  const contentHeight = rows > 0 ? rows * cfg.tileHeight + (rows - 1) * cfg.tileGap : 0
  const maxScroll = Math.max(0, contentHeight - grid.height)
  // Clamped here rather than at the call site, so a caller that scrolls past
  // the end gets the end rather than an empty grid.
  const at = Math.max(0, Math.min(maxScroll, scroll))

  const tiles: Rect[] = []
  for (let i = 0; i < count; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    tiles.push({
      x: grid.x + col * (tileW + cfg.tileGap),
      y: grid.y + row * (cfg.tileHeight + cfg.tileGap) - at,
      width: tileW,
      height: cfg.tileHeight,
    })
  }

  return {
    tab, panel, tabBar, tabs, detail, detailIcon, detailText,
    grid, tiles, contentHeight, maxScroll, step,
  }
}

/**
 * Whether a tile is far enough inside the grid to be tapped.
 *
 * A tile half-scrolled off the top is still DRAWN — it is clipped by the
 * grid's mask — and a tap that lands on the visible sliver is a real tap on a
 * real tile. What must never happen is a tile counted as reachable when none
 * of it is on screen, so this asks for a usable amount rather than a pixel.
 */
export function tileVisible(tile: Rect, grid: Rect, minFraction = 0.5): boolean {
  const top = Math.max(tile.y, grid.y)
  const bottom = Math.min(tile.y + tile.height, grid.y + grid.height)
  return (bottom - top) >= tile.height * minFraction
}

/** True when the point is inside the rectangle. Shared so the tab, the panel
 *  and every tile all answer the question the same way. */
export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height
}

/**
 * The scroll offset that brings tile `i` fully into view, from `scroll`.
 *
 * Used by the probe to reach every tile, and by a keyboard or a fling later.
 * Returns the CURRENT offset when the tile is already fully visible, so
 * calling it is never a jump.
 */
export function scrollToShow(
  index: number, scroll: number, cfg: DrawerConfig, grid: Rect, count: number,
): number {
  const cols = Math.max(1, cfg.columns)
  const rows = Math.ceil(count / cols)
  const contentHeight = rows > 0 ? rows * cfg.tileHeight + (rows - 1) * cfg.tileGap : 0
  const maxScroll = Math.max(0, contentHeight - grid.height)
  const row = Math.floor(index / cols)
  const top = row * (cfg.tileHeight + cfg.tileGap)
  const bottom = top + cfg.tileHeight
  let at = scroll
  if (top - at < 0) at = top
  else if (bottom - at > grid.height) at = bottom - grid.height
  return Math.max(0, Math.min(maxScroll, at))
}

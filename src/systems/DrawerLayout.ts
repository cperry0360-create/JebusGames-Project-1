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

export interface DrawerConfig {
  tabWidth: number
  tabHeight: number
  /**
   * Panel width by viewport width, WIDEST FIRST.
   *
   * A list rather than two numbers, because "152 at 844 and 118 at 568" is a
   * rule with a shape — narrower screens get a narrower drawer — and a rule
   * with a shape should be expressible without editing code. The first entry
   * whose `minViewW` the viewport meets wins; the last should be 0 so there
   * is always an answer.
   */
  widths: Array<{ minViewW: number; width: number }>
  pad: number
  columns: number
  tileHeight: number
  tileGap: number
}

export interface DrawerLayout {
  /** The always-visible tab, docked to the right edge. */
  tab: Rect
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

/** The panel width for this viewport, from the data's breakpoint list. */
export function drawerWidth(viewW: number, cfg: DrawerConfig): number {
  for (const step of cfg.widths) if (viewW >= step.minViewW) return step.width
  return cfg.widths[cfg.widths.length - 1]?.width ?? 0
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

  const grid: Rect = {
    x: panel.x + cfg.pad,
    y: panel.y + cfg.pad,
    width: panel.width - cfg.pad * 2,
    height: panel.height - cfg.pad * 2,
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

  return { tab, panel, grid, tiles, contentHeight, maxScroll }
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

// Where the ring's buttons go, and where its description panel goes.
//
// Phaser-free on purpose, and that is the whole point of the file. The ring
// has to be provably on screen for EVERY pad and EVERY built tower, at both
// ends of the zoom band, at both viewport sizes, for every tower type and
// every upgrade option — and a browser check can only ever sample that. Here
// the combinations are arithmetic, so the test can walk all of them and assert
// containment rather than spot-check a few and hope.
//
// The lesson behind that: a synthetic tap on a button 194px below the bottom
// of the screen "passes" happily, because the event is dispatched on the
// canvas rather than by a thumb. A test that only proves a handler fired
// proves nothing about whether a person can reach it. So position is the
// assertion, and these functions are what produce it.

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface RingConfig {
  /** The button plate, square, in CSS pixels. */
  buttonSize: number
  /** Gap between two neighbouring buttons at the ring's radius. */
  buttonGap: number
  /** The price badge under each button: its gap and its height. */
  priceGap: number
  priceHeight: number
  /** The smallest radius the ring will use, so two options do not sit almost
   *  on top of the thing they are about. */
  minRadius: number
  /** Clearance between the ring's outer edge and the panel beside it. */
  panelGap: number
  /** How far the ring may stretch sideways. Past about this it stops reading
   *  as a ring around the tower and starts reading as a row above it. */
  maxAspect: number
}

export interface RingButton {
  index: number
  /** Centre of the button PLATE. The price badge hangs below it. */
  x: number
  y: number
  /** The whole footprint — plate and price badge — which is what has to be on
   *  screen and what a tap has to be tested against. */
  bounds: Rect
}

export interface RingPlacement {
  /** Where the ring actually ended up. Equal to the anchor unless it had to be
   *  pushed inside the screen. */
  cx: number
  cy: number
  /** The ellipse the buttons sit on. Two radii, not one — see ringPlacement. */
  radiusX: number
  radiusY: number
  buttons: RingButton[]
  /** Everything the ring occupies. */
  bounds: Rect
  /** How far the ring had to move to fit. Non-zero means a leader line back to
   *  the tower is worth drawing. */
  shiftX: number
  shiftY: number
  /** True when the ring could not be made to fit at all — the area is smaller
   *  than the ring. The caller must say so rather than draw off screen. */
  overflowed: boolean
}

const TAU = Math.PI * 2

function rectOf(cx: number, cy: number, w: number, h: number): Rect {
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h }
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  }
}

export function contains(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x - 0.5
    && inner.y >= outer.y - 0.5
    && inner.x + inner.width <= outer.x + outer.width + 0.5
    && inner.y + inner.height <= outer.y + outer.height + 0.5
}

export function overlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width
    && a.y < b.y + b.height && b.y < a.y + a.height
}

/**
 * Whether two square plates of side `s` centred at these points overlap.
 *
 * Axis-aligned, because that is what the plates are and what the hit areas
 * are. This is the check the first version of this file got wrong: it spaced
 * the buttons by ARC LENGTH, reasoning that a gap along the circle is a gap
 * between the buttons. It is not. Two squares whose centres are 65px apart at
 * 60 degrees have a 33px horizontal gap and a 56px vertical one, and a 58px
 * plate overlaps its neighbour in both. The exhaustive placement test found it
 * on the six-tower ring.
 */
function platesClash(ax: number, ay: number, bx: number, by: number, s: number): boolean {
  return Math.abs(ax - bx) < s - 0.5 && Math.abs(ay - by) < s - 0.5
}

/**
 * Lays the buttons out around a point, then pushes the whole ring inside the
 * screen if any of it fell outside.
 *
 * The ring MOVES rather than deforming. An arc that redistributes itself to
 * dodge an edge changes which option is where depending on which pad was
 * tapped, and a menu whose buttons move around between uses is a menu the
 * player has to re-read every time. Moving the ring keeps the order fixed and
 * costs a leader line back to the tower.
 *
 * The first button is at the top and the rest run clockwise, so the primary
 * action — the first option the caller passes — is always in the same place.
 */
export function ringPlacement(
  anchorX: number,
  anchorY: number,
  count: number,
  cfg: RingConfig,
  area: Rect,
): RingPlacement {
  const footH = cfg.buttonSize + cfg.priceGap + cfg.priceHeight
  // The plate is centred on the ellipse; the badge hangs below it, so the
  // footprint's centre is half a badge lower than the plate's.
  const footDrop = (cfg.priceGap + cfg.priceHeight) / 2

  // AN ELLIPSE, NOT A CIRCLE, and that is forced by the shape of the space.
  // The HUD leaves a wide, short strip — 824x210 on the reference phone — and
  // a circle big enough to keep six plates apart is 242px across in BOTH
  // directions, which does not fit in 210. Stretching it sideways uses the
  // room that is actually there. It still reads as a ring around the tower;
  // it just is not a compass.
  const ryMax = Math.max(1, (area.height - footH) / 2)
  const rxMax = Math.max(1, (area.width - cfg.buttonSize) / 2)
  const aspect = Math.max(1, Math.min(cfg.maxAspect, rxMax / Math.max(1, ryMax)))

  const at = (i: number, rx: number, ry: number, cx: number, cy: number): [number, number] => {
    // First button at the top, the rest clockwise, so the option the caller
    // passes first is always in the same place. A menu whose buttons move
    // between uses is a menu that has to be re-read every time.
    const a = -Math.PI / 2 + (i * TAU) / Math.max(1, count)
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]
  }
  const clashes = (rx: number, ry: number): boolean => {
    for (let i = 0; i < count; i++) {
      const [ax, ay] = at(i, rx, ry, 0, 0)
      for (let j = i + 1; j < count; j++) {
        const [bx, by] = at(j, rx, ry, 0, 0)
        if (platesClash(ax, ay, bx, by, cfg.buttonSize)) return true
      }
    }
    return false
  }

  // Grow until the plates separate, or until there is nowhere left to grow.
  //
  // The exit condition is "neither radius moved", not "neither radius has
  // reached its cap". `rx` is capped by BOTH `rxMax` and `ry * aspect`, so it
  // can stop growing while still under `rxMax` — and a loop watching the caps
  // spun there forever. The exhaustive test hung on it, which is a better
  // place to find an infinite loop than a phone.
  // The floor is a PREFERENCE, not a guarantee, and it yields to the screen.
  // It exists so a ring does not hug the tower it is about; a phone with a
  // notch leaves 189px of usable height, which is less than the floor plus a
  // price badge, and a tighter ring there is better than a broken one.
  let ry = Math.min(cfg.minRadius, ryMax)
  let rx = Math.min(rxMax, ry * aspect)
  let tooTight = clashes(rx, ry)
  while (tooTight) {
    const nextRy = Math.min(ryMax, ry + 1)
    const nextRx = Math.min(rxMax, Math.max(nextRy, nextRy * aspect))
    if (nextRy === ry && nextRx === rx) break
    ry = nextRy
    rx = nextRx
    tooTight = clashes(rx, ry)
  }

  const place = (cx: number, cy: number): { buttons: RingButton[]; bounds: Rect } => {
    const buttons: RingButton[] = []
    let bounds: Rect | null = null
    for (let i = 0; i < count; i++) {
      const [x, y] = at(i, rx, ry, cx, cy)
      const b = rectOf(x, y + footDrop, cfg.buttonSize, footH)
      buttons.push({ index: i, x, y, bounds: b })
      bounds = bounds ? union(bounds, b) : b
    }
    return { buttons, bounds: bounds ?? rectOf(cx, cy, 0, 0) }
  }

  const first = place(anchorX, anchorY)
  const bw = first.bounds.width
  const bh = first.bounds.height
  const overflowed = tooTight || bw > area.width + 0.5 || bh > area.height + 0.5

  // Clamp the ring's own BOX into the area and move the centre by the same
  // amount. Clamping the centre against an inset area would be wrong whenever
  // the box is not symmetric about it, and the price badges make it not.
  let dx = 0
  let dy = 0
  if (bw > area.width + 0.5 || bh > area.height + 0.5) {
    // Cannot fit. Centre it, and let the caller report rather than pretend.
    dx = (area.x + area.width / 2) - (first.bounds.x + bw / 2)
    dy = (area.y + area.height / 2) - (first.bounds.y + bh / 2)
  } else {
    if (first.bounds.x < area.x) dx = area.x - first.bounds.x
    else if (first.bounds.x + bw > area.x + area.width) {
      dx = area.x + area.width - (first.bounds.x + bw)
    }
    if (first.bounds.y < area.y) dy = area.y - first.bounds.y
    else if (first.bounds.y + bh > area.y + area.height) {
      dy = area.y + area.height - (first.bounds.y + bh)
    }
  }

  const final = dx === 0 && dy === 0 ? first : place(anchorX + dx, anchorY + dy)
  return {
    cx: anchorX + dx,
    cy: anchorY + dy,
    radiusX: rx,
    radiusY: ry,
    buttons: final.buttons,
    bounds: final.bounds,
    shiftX: dx,
    shiftY: dy,
    overflowed,
  }
}

export type PanelSide = 'right' | 'left' | 'below' | 'above'

export interface PanelPlacement {
  x: number
  y: number
  side: PanelSide
  /** True when the panel ended up on top of the ring's buttons. Allowed, but
   *  only as a last resort — see panelPlacement. */
  overlapsRing: boolean
  /** True when the panel is covering the pad or tower it describes. Never
   *  allowed: the caller moves the ring instead. */
  coversAnchor: boolean
}

/**
 * Puts the panel beside the ring: whichever side has the most room, clamped so
 * it can never leave the area.
 *
 * "Decide from available space, not a fixed rule" — so the four sides are
 * scored by how much room each actually has, and the best one wins. A fixed
 * "always to the right" rule is what puts a panel half off the screen on the
 * one pad nearest the right edge, which is exactly the failure the old build
 * menu had at the bottom.
 *
 * TWO DIFFERENT KINDS OF COVERING, and the requirement only forbids one of
 * them. The panel must never cover the pad or tower it is describing — that is
 * the whole point of not being a centred modal. Overlapping the RING's own
 * buttons is a much smaller sin, and on the smallest notched phone it is
 * unavoidable: 568x320 leaves a 472x171 strip, a six-option ring is 270 wide
 * and the panel is 226, which is 510 of 472. So overlap is permitted and
 * reported; covering the anchor is not, and the caller moves the ring.
 */
export function panelPlacement(
  ring: Rect,
  anchorX: number,
  anchorY: number,
  panelW: number,
  panelH: number,
  area: Rect,
  cfg: RingConfig,
): PanelPlacement {
  const gap = cfg.panelGap
  const areaR = area.x + area.width
  const areaB = area.y + area.height
  const ringR = ring.x + ring.width
  const ringB = ring.y + ring.height

  const room: Record<PanelSide, number> = {
    right: areaR - (ringR + gap),
    left: (ring.x - gap) - area.x,
    below: areaB - (ringB + gap),
    above: (ring.y - gap) - area.y,
  }
  const need: Record<PanelSide, number> = {
    right: panelW, left: panelW, below: panelH, above: panelH,
  }

  const at = (side: PanelSide): { x: number; y: number } => {
    let x: number
    let y: number
    if (side === 'right') { x = ringR + gap; y = ring.y + ring.height / 2 - panelH / 2 }
    else if (side === 'left') { x = ring.x - gap - panelW; y = ring.y + ring.height / 2 - panelH / 2 }
    else if (side === 'below') { x = ring.x + ring.width / 2 - panelW / 2; y = ringB + gap }
    else { x = ring.x + ring.width / 2 - panelW / 2; y = ring.y - gap - panelH }
    return {
      x: Math.min(Math.max(x, area.x), Math.max(area.x, areaR - panelW)),
      y: Math.min(Math.max(y, area.y), Math.max(area.y, areaB - panelH)),
    }
  }

  // Horizontal first where either side fits: a panel beside the ring leaves the
  // lane above and below it visible, which is what the player is deciding
  // about. Above and below are the fallback for a tall, narrow screen.
  const order: PanelSide[] = ['right', 'left', 'below', 'above']
  let side = order.find((sd) => room[sd] >= need[sd]) ?? null

  if (side === null) {
    // Nothing fits cleanly. Take the side that keeps the panel off the ANCHOR,
    // preferring the one with the most slack — the pad has to stay visible
    // even when the panel has to sit over its own buttons.
    const ranked = [...order].sort((a, b) => (room[b] - need[b]) - (room[a] - need[a]))
    side = ranked.find((sd) => {
      const at2 = at(sd)
      return !rectHasPoint(at2.x, at2.y, panelW, panelH, anchorX, anchorY)
    }) ?? ranked[0]!
  }

  const pos = at(side)
  const box = { x: pos.x, y: pos.y, width: panelW, height: panelH }
  return {
    x: pos.x,
    y: pos.y,
    side,
    overlapsRing: overlap(box, ring),
    coversAnchor: rectHasPoint(pos.x, pos.y, panelW, panelH, anchorX, anchorY),
  }
}

function rectHasPoint(
  x: number, y: number, w: number, h: number, px: number, py: number,
): boolean {
  return px >= x && px <= x + w && py >= y && py <= y + h
}

/**
 * Places the ring AND its panel together, because they constrain each other.
 *
 * Placing the ring first and the panel afterwards is what the first version
 * did, and the exhaustive test caught the case it cannot handle: on a notched
 * 844x390 the usable strip is 736x189, a four-option ring is 309 wide, and a
 * ring sitting in the middle of that strip leaves 199px either side for a
 * 226px panel. Everything fits — 309 + 14 + 226 is 549 of 736 — but only if
 * the ring gets out of the way first.
 *
 * So when the panel has nowhere to go, the RING moves. It keeps its leader
 * line back to the tower, and the panel takes the space that opens up. The
 * ring moving is much cheaper than the panel covering the thing it describes.
 */
export function fitRingAndPanel(
  anchorX: number,
  anchorY: number,
  count: number,
  panelW: number,
  panelH: number,
  cfg: RingConfig,
  area: Rect,
): { ring: RingPlacement; panel: PanelPlacement } {
  let ring = ringPlacement(anchorX, anchorY, count, cfg, area)
  let panel = panelPlacement(ring.bounds, anchorX, anchorY, panelW, panelH, area, cfg)
  if (ring.overflowed) return { ring, panel }
  if (!panel.overlapsRing && !panel.coversAnchor) return { ring, panel }

  // How much room the panel needs beside the ring, and which way to push.
  const need = panelW + cfg.panelGap
  const roomRight = (area.x + area.width) - (ring.bounds.x + ring.bounds.width)
  const roomLeft = ring.bounds.x - area.x
  const push = roomRight >= roomLeft ? -(need - roomRight) : (need - roomLeft)
  if (Number.isFinite(push) && push !== 0) {
    const moved = ringPlacement(anchorX + push, anchorY, count, cfg, area)
    const retry = panelPlacement(moved.bounds, anchorX, anchorY, panelW, panelH, area, cfg)
    // Take the move when it improves things: clear of the ring is best, clear
    // of the anchor is the requirement.
    const better = (!retry.overlapsRing && !retry.coversAnchor)
      || (panel.coversAnchor && !retry.coversAnchor)
    if (better) {
      ring = moved
      // The ring was moved on purpose, so the leader line has to say so even
      // if the clamp itself did not need to shift anything.
      ring.shiftX = moved.cx - anchorX
      ring.shiftY = moved.cy - anchorY
      panel = retry
    }
  }
  return { ring, panel }
}

/**
 * The rectangle a panel and a ring may live in.
 *
 * Two things are subtracted from the viewport and both matter. The safe-area
 * insets, because a notch or a home indicator is not screen even though it has
 * coordinates; and the HUD's own panel area, because a ring over the ability
 * bar is a ring whose buttons fight the abilities for the same tap.
 */
export function usableArea(
  viewW: number,
  viewH: number,
  insets: { top: number; right: number; bottom: number; left: number },
  bands: { countersBottom: number; abilitiesTop: number },
  margin: number,
): Rect {
  const x = insets.left + margin
  const right = viewW - insets.right - margin
  // ABOVE THE ABILITY BAR, and that is the only band subtracted.
  //
  // The requirement names one thing the menu may never cover: the ability bar,
  // whose buttons would otherwise fight the ring's for the same tap. It does
  // not protect the counters, and protecting them anyway costs 48px — which on
  // a 568x320 screen is the difference between the description panel fitting
  // and the game telling the player it does not. A counter hidden for the
  // moment a menu is open is a fair price; a confirm button off the bottom of
  // the screen is not.
  const y = insets.top + margin
  const bottom = Math.min(viewH - insets.bottom, bands.abilitiesTop) - margin
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) }
}

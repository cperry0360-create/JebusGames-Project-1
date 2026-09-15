// Where the spawn and exit badges go, derived from a level's own lane data.
//
// NOTHING HERE IS AUTHORED PER LEVEL and nothing here names one. Every marker
// is a fact about the map that is already in the map: a lane an enemy can walk
// in from gets a spawn badge at its first waypoint, and a lane that runs to an
// exit gets an exit badge at its last. Re-tracing a plate moves them; adding a
// level adds them; a level 10 needs no line in this file.
//
// AN EXIT IS NOT THE SAME THING AS A FRAME EDGE. Level 9's door is at
// (1177, 329), a hundred pixels inside the right-hand edge, and it is an exit
// in the only sense that matters -- `merge === null`, so an enemy that reaches
// the end of that lane is out and has cost a life. It gets a badge like any
// other.
//
// Phaser-free, like Lanes.ts and HudLayout.ts and for the same two reasons: the
// arithmetic can be driven by a test without a scene, and the harness can ask
// it the same question the game does.

import { laneDefs, mainIdOf, type LaneSource } from './Lanes.ts'

export interface MarkerConfig {
  /** The badge's width in CSS pixels at default zoom. See markers.json. */
  badgeScreenWidth: number
  /** The arrow's centre, as a fraction of the badge's rendered width. */
  arrowOffset: number
  alpha: number
  /** How close two markers of one kind may be, in badge widths, before only
   *  one is drawn. */
  mergeWithin: number
  /**
   * How far ALONG ITS OWN LANE a badge sits from the lane's terminal waypoint,
   * in badge widths, toward the middle of the map. See markers.json.
   *
   * Optional so a config written before this existed still loads; absent is 0,
   * which is the old behaviour exactly.
   */
  insetBadgeWidths?: number
}

export type MarkerKind = 'spawn' | 'exit'

/** The painted plate's own size in world pixels. See `clampToPlate`. */
export interface WorldSize { width: number; height: number }

export interface Marker {
  kind: MarkerKind
  /** The badge's centre, in world pixels. The badge NEVER rotates. */
  x: number
  y: number
  /** The lane's direction of travel at this waypoint, in radians. The arrow
   *  rotates to it; the badge does not. */
  angle: number
  /** Which lanes this one badge stands for. More than one when two lanes share
   *  a mouth -- level 9's two entrances come out of one painted opening. */
  lanes: string[]
}

/**
 * A point `dist` world pixels along a polyline from one of its ends, with the
 * lane's direction of travel there.
 *
 * WHY A WALK AND NOT A CLAMP. `clampToPlate` below pulls a badge onto the
 * plate by pushing its CENTRE to half a badge width from the frame, which is
 * the shortest possible move and puts the badge hard against the edge -- and
 * the arrow, which sits 0.736 badge widths further along the direction of
 * travel, then hangs 0.236 of a badge width OFF the plate at every exit. Live
 * play reported the badges as half off-screen and easy to miss, and that is
 * the arithmetic of it.
 *
 * Walking the lane instead puts the badge on the road it belongs to rather
 * than on the nearest point of the frame, which is also where a player looks
 * for it: an inset measured along the lane follows the road's own curve in
 * through the mouth.
 *
 * `from` is which end to walk from; travel is always in increasing index
 * order, so a spawn walks FORWARD from waypoint 0 and an exit walks BACKWARD
 * from the last waypoint, and both report the forward heading of the segment
 * they land on. That keeps the arrow pointing the way the walk actually goes
 * at the badge's new position, which is what the brief asks for and is a
 * different answer from the terminal waypoint's heading whenever the road
 * bends inside the inset.
 */
function walkAlong(
  w: number[][], from: 'start' | 'end', dist: number,
): { x: number; y: number; angle: number } | null {
  const n = w.length
  if (n < 2) return null
  const forward = from === 'start'
  let left = Math.max(0, dist)
  // The index of the segment we are on, walked in the direction of the walk.
  let i = forward ? 0 : n - 2
  for (;;) {
    const a = w[i]!
    const b = w[i + 1]!
    const seg = Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!)
    const ang = Math.atan2(b[1]! - a[1]!, b[0]! - a[0]!)
    if (seg > 0 && left <= seg) {
      // `t` is measured from whichever end we entered this segment at.
      const t = forward ? left / seg : 1 - left / seg
      return { x: a[0]! + (b[0]! - a[0]!) * t, y: a[1]! + (b[1]! - a[1]!) * t, angle: ang }
    }
    left -= seg
    i += forward ? 1 : -1
    if (i < 0 || i > n - 2) {
      // THE LANE IS SHORTER THAN THE INSET. The far terminal is the most
      // inset this lane has, and it is still the right answer: a lane that
      // short has no interior to move into. Level 7's three 1,400 px
      // highways and level 3's 672 px trunk are both far longer than any
      // plausible inset, so this is a guard rather than a case.
      const end = forward ? w[n - 1]! : w[0]!
      const prev = forward ? w[n - 2]! : w[1]!
      const ang = forward
        ? Math.atan2(end[1]! - prev[1]!, end[0]! - prev[0]!)
        : Math.atan2(prev[1]! - end[1]!, prev[0]! - end[0]!)
      return { x: end[0]!, y: end[1]!, angle: ang }
    }
  }
}

/**
 * Every marker a level should draw, derived from its map.
 *
 * A LANE GETS A SPAWN BADGE WHEN IT IS AN ENTRANCE, and that is TWO tests
 * rather than one: nothing merges into it, OR it says `entrance: true`. It is
 * the same pair `validateLanes` uses, and using only the first half is wrong on
 * a level that ships today.
 *
 * LEVEL 6 IS THE COUNTEREXAMPLE AND IT COST A ROUND. Its `lower` lane is a
 * second independent way in -- it declares `entrance: true` and runs to its own
 * exit -- and the `flank` lane, the sneaky third spawn at the bottom edge,
 * merges INTO it at waypoint 23. So `lower` is fed by something and is still an
 * entrance, and the "nothing merges into it" test alone silently dropped its
 * badge: three spawns on the board, two drawn, and no error anywhere.
 *
 * AND THE MAIN LANE'S OWN `entrance` FLAG IS NOT EVIDENCE. `laneDefs`
 * synthesises `entrance: true` onto whichever lane is main, unconditionally,
 * because `validateLanes` needs it there -- so on levels 3, 4 and 5, where main
 * is the shared TRUNK that the two arms merge into and starts in the middle of
 * the board, that flag says "entrance" about a lane no enemy ever enters. Read
 * literally it put a spawn badge at (733, 378) on level 3, in the middle of the
 * map, on a piece of road that is the join. So the flag counts only on a lane
 * the MAP declared it on, and main falls back to the "nothing merges into it"
 * test, which is true of main on every level where it really is a way in.
 *
 * Level 8's `east` and `south` are both fed by `shared` and declare no
 * entrance, so neither is a spawn; level 9's `north` and `south` are both fed
 * by nothing and both are.
 *
 * A LANE GETS AN EXIT BADGE WHEN IT MERGES INTO NOTHING, which is exactly the
 * test the scene and the soak both use to decide that reaching its end costs a
 * life.
 */
export function markersFor(
  map: LaneSource, cfg: MarkerConfig, badgeWorld: number, world: WorldSize,
): Marker[] {
  const defs = laneDefs(map)
  const fedInto = new Set<string>()
  for (const d of defs) {
    const merge = d.merge
    if (!merge) continue
    for (const c of Array.isArray(merge) ? merge : [merge]) fedInto.add(c.into)
  }

  const main = mainIdOf(map)
  const out: Marker[] = []
  for (const d of defs) {
    const w = d.waypoints
    if (w.length < 2) continue

    const inset = badgeWorld * (cfg.insetBadgeWidths ?? 0)
    /**
     * THE INSET IS FOR AN OFF-PLATE TERMINAL AND ONLY FOR ONE.
     *
     * A lane's first and last waypoints are usually the computed GATEWAY
     * points -- (-60, y) and (1340, y) -- which is why the badges read as half
     * off-screen: there is no camera position that shows a badge at x = -60,
     * and the arrow at an exit hangs off the frame even after `clampToPlate`
     * pulls the badge in. That is the fault the inset fixes.
     *
     * An exit that is already ON the plate is a different thing. Level 9's
     * door is at (1177, 329), a hundred pixels inside the right-hand edge, and
     * the badge means "they get out HERE" -- so walking it 140 px back up the
     * road points it at a piece of lane that is not the exit. Measured: a
     * uniform inset moves that badge to (1064, 274). Applying the inset only
     * where the terminal is off the plate leaves it exactly where it was, and
     * costs nothing anywhere else, because every other terminal in the game is
     * a gateway.
     *
     * The alternative considered and not taken was "walk until the badge and
     * arrow are inside, then stop", which needs the arrow's rendered extent in
     * here -- and this module is deliberately ignorant of the art. To revert
     * to a uniform inset, delete this predicate and pass `inset`
     * unconditionally; `reports/2026-09-14-ui-cleanup.md` has the numbers for
     * both.
     */
    const offPlate = (pt: number[]): boolean =>
      pt[0]! < 0 || pt[1]! < 0 || pt[0]! > world.width || pt[1]! > world.height

    if (!fedInto.has(d.id) || (d.id !== main && d.entrance === true)) {
      // INSET ALONG THE LANE from waypoint 0, toward the middle of the map.
      // Waypoints run off the frame deliberately -- enemies arrive from
      // off-screen -- so waypoint 0 is typically outside the plate; the badge
      // belongs at the mouth the walk comes through, which is where the inset
      // puts it. The arrow still points the way the walk goes, measured at the
      // badge's own position rather than at the terminal.
      const at = walkAlong(w, 'start', offPlate(w[0]!) ? inset : 0)
      if (at !== null) out.push({ kind: 'spawn', x: at.x, y: at.y, angle: at.angle, lanes: [d.id] })
    }

    const merge = d.merge
    const isExit = merge === null || merge === undefined
      || (Array.isArray(merge) && merge.length === 0)
    if (isExit) {
      // INSET BACKWARD along the lane from its last waypoint. The arrow still
      // points along the direction of TRAVEL -- which at an exit means away
      // from the map, and deliberately not a separate sign: an arrow pointing
      // back inward at an exit would say the enemies come from there. It is
      // the inset that keeps that outward arrow on the plate.
      const at = walkAlong(w, 'end', offPlate(w[w.length - 1]!) ? inset : 0)
      if (at !== null) {
        out.push({ kind: 'exit', x: at.x, y: at.y, angle: at.angle, lanes: [d.id] })
      }
    }
  }
  return mergeNearby(out.map((m) => clampToPlate(m, badgeWorld, world)), cfg, badgeWorld)
}

/**
 * Pulls a badge back onto the painted plate.
 *
 * A DELIBERATE DEPARTURE FROM "AT THE LANE'S FIRST WAYPOINT", and it is the
 * difference between a feature and an invisible one. Waypoints run off the
 * frame on purpose -- enemies walk in from off-screen, so a lane's first point
 * is typically (-60, y) and its last (1340, y) -- and 29 OF THE 30 MARKERS
 * THESE RULES DERIVE FALL OUTSIDE THE 1280x720 PLATE. The world camera is
 * clamped to the plate horizontally, so a badge at x = -60 is not merely off to
 * one side: there is no camera position that shows it. Placed literally, the
 * whole layer would have been visible on exactly one marker in the game, level
 * 9's interior door.
 *
 * So the badge is clamped into the plate by half its own width, which puts it
 * just inside the mouth it belongs to -- about a road and a third in, which is
 * where a player looks for it anyway. ONLY THE POSITION MOVES: the angle is
 * still the lane's own heading at its own first or last waypoint, so the arrow
 * still points the way the walk actually goes, and `arrowAt` still measures
 * from wherever the badge ended up.
 *
 * An exit already inside the plate -- level 9's door at (1177, 329) -- is not
 * touched by this at all.
 */
function clampToPlate(m: Marker, badgeWorld: number, world: WorldSize): Marker {
  const half = badgeWorld / 2
  return {
    ...m,
    x: Math.min(Math.max(m.x, half), world.width - half),
    y: Math.min(Math.max(m.y, half), world.height - half),
  }
}

/**
 * Collapses markers of the same kind that sit within one badge width.
 *
 * Level 9 paints ONE mouth on its west edge and models the two arms behind it
 * as two entrance lanes, so both start at the same point. Two badges drawn
 * exactly on top of each other read as a rendering fault rather than as two
 * ways in, and the second one is not information -- the player cannot act on
 * which of two overlapping arms a packet took.
 *
 * The survivor keeps the FIRST marker's angle and gathers the names, so a
 * harness or a report can still say which lanes one badge stands for.
 */
function mergeNearby(all: Marker[], cfg: MarkerConfig, badgeWorld: number): Marker[] {
  // IN WORLD UNITS, which is what the markers' own coordinates are in.
  // `badgeScreenWidth` is CSS pixels at default zoom and using it directly here
  // compared a world distance against a screen one -- at the shipped 1.72 zoom
  // that is a threshold 72% too wide, which on level 6 is the difference
  // between two spawns 65 world pixels apart being two badges and being one.
  const within = badgeWorld * cfg.mergeWithin
  const kept: Marker[] = []
  for (const m of all) {
    const near = kept.find(
      (k) => k.kind === m.kind && Math.hypot(k.x - m.x, k.y - m.y) <= within,
    )
    if (near) near.lanes.push(...m.lanes)
    else kept.push({ ...m, lanes: [...m.lanes] })
  }
  return kept
}

/**
 * Where the arrow's centre goes for one marker, in world pixels.
 *
 * `badgeWorldWidth` rather than the config's screen width, because the caller
 * is the only one that knows the zoom the badge was actually drawn at.
 */
export function arrowAt(
  m: Marker, badgeWorldWidth: number, cfg: MarkerConfig,
): { x: number; y: number } {
  const d = badgeWorldWidth * cfg.arrowOffset
  return { x: m.x + Math.cos(m.angle) * d, y: m.y + Math.sin(m.angle) * d }
}

/** The badge's width in world pixels, from the screen width it is authored in. */
export function badgeWorldWidth(cfg: MarkerConfig, defaultZoom: number): number {
  return cfg.badgeScreenWidth / Math.max(defaultZoom, 0.0001)
}

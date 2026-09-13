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

/** The angle from `a` to `b`, or null when they are the same point. */
function heading(a: number[], b: number[]): number | null {
  const dx = b[0]! - a[0]!
  const dy = b[1]! - a[1]!
  if (dx === 0 && dy === 0) return null
  return Math.atan2(dy, dx)
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

    if (!fedInto.has(d.id) || (d.id !== main && d.entrance === true)) {
      // THE FIRST TWO WAYPOINTS, so the arrow points the way the walk goes --
      // INTO the map. Waypoints run off the frame deliberately (enemies arrive
      // from off-screen), so the first one is often outside the plate; that is
      // where the badge belongs, because that is where the walk begins.
      const a = heading(w[0]!, w[1]!)
      if (a !== null) out.push({ kind: 'spawn', x: w[0]![0]!, y: w[0]![1]!, angle: a, lanes: [d.id] })
    }

    const merge = d.merge
    const isExit = merge === null || merge === undefined
      || (Array.isArray(merge) && merge.length === 0)
    if (isExit) {
      // THE LAST TWO, so the arrow again points along the direction of travel
      // -- which at an exit means AWAY from the map. Same rule, opposite
      // reading, and deliberately not a separate sign: an arrow that pointed
      // back inward at an exit would say the enemies come from there.
      const a = heading(w[w.length - 2]!, w[w.length - 1]!)
      if (a !== null) {
        out.push({
          kind: 'exit', x: w[w.length - 1]![0]!, y: w[w.length - 1]![1]!, angle: a, lanes: [d.id],
        })
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

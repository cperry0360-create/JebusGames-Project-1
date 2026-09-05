// The lane enemies walk, in canvas pixels.
//
// The map is a single painted plate that fills the canvas, so canvas pixels
// are the map's own coordinate space and no tile conversion is involved. The
// waypoints were traced from the painted road by tools/trace_map.py; the first
// and last sit off-screen so enemies walk in through the arch and out through
// the gate.

export interface PathPoint {
  x: number
  y: number
}

export class Path {
  readonly points: PathPoint[]
  readonly totalLength: number
  private readonly cumulative: number[]

  constructor(waypoints: number[][]) {
    if (waypoints.length < 2) throw new Error('Path needs at least two waypoints')
    this.points = waypoints.map((w) => ({ x: w[0], y: w[1] }))

    this.cumulative = [0]
    let total = 0
    for (let i = 1; i < this.points.length; i++) {
      total += Math.hypot(
        this.points[i].x - this.points[i - 1].x,
        this.points[i].y - this.points[i - 1].y,
      )
      this.cumulative.push(total)
    }
    this.totalLength = total
  }

  /**
   * How far along the lane a given waypoint sits.
   *
   * Branching maps need this: a lane that merges into another one joins it at
   * a waypoint INDEX, and the enemy walking it needs the DISTANCE that index
   * stands at. Clamped, so a merge index past the end lands at the end rather
   * than off it.
   */
  distanceAtIndex(index: number): number {
    const i = Math.max(0, Math.min(Math.floor(index), this.cumulative.length - 1))
    return this.cumulative[i]!
  }

  /** Position at a distance travelled from the spawn end. Clamped at both ends. */
  pointAt(distance: number): PathPoint {
    if (distance <= 0) return { ...this.points[0] }
    if (distance >= this.totalLength) return { ...this.points[this.points.length - 1] }

    let i = 1
    while (i < this.cumulative.length && this.cumulative[i] < distance) i++

    const segStart = this.cumulative[i - 1]
    const segLength = this.cumulative[i] - segStart
    const t = segLength === 0 ? 0 : (distance - segStart) / segLength
    const a = this.points[i - 1]
    const b = this.points[i]
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
  }

  /** Facing in radians at a distance, so sprites point the way they travel. */
  angleAt(distance: number): number {
    const d = Math.min(Math.max(distance, 0), this.totalLength)
    let i = 1
    while (i < this.cumulative.length && this.cumulative[i] < d) i++
    const a = this.points[i - 1]
    const b = this.points[i]
    return Math.atan2(b.y - a.y, b.x - a.x)
  }

  /** Shortest distance from a point to the lane, for checking clearances. */
  distanceTo(x: number, y: number): number {
    let best = Infinity
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1]
      const b = this.points[i]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len2 = dx * dx + dy * dy
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2))
      best = Math.min(best, Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t)))
    }
    return best
  }
}

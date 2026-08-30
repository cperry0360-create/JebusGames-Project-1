// The lane enemies walk. Waypoints are tile-lattice coordinates (tile corners)
// rather than tile centres, because the road is two tiles wide and its
// centreline therefore runs along the boundary between two rows or columns.
// Every segment is axis-aligned, which keeps both the road tiling and the
// distance math trivial.

import { Grid } from './Grid.ts'

export interface PathPoint {
  x: number
  y: number
}

export interface TileRef {
  col: number
  row: number
}

export class Path {
  readonly points: PathPoint[]
  readonly totalLength: number
  private readonly cumulative: number[]
  private readonly waypoints: number[][]

  constructor(waypoints: number[][], grid: Grid) {
    if (waypoints.length < 2) throw new Error('Path needs at least two waypoints')
    this.waypoints = waypoints

    this.points = waypoints.map((w) => ({
      x: grid.originX + w[0] * grid.tileSize,
      y: grid.originY + w[1] * grid.tileSize,
    }))

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

  /**
   * Every tile the road covers, including tiles just off the grid so the
   * autotiler sees correct neighbours at the spawn and exit edges.
   */
  roadTiles(): TileRef[] {
    const seen = new Set<string>()
    const out: TileRef[] = []
    const push = (col: number, row: number): void => {
      const key = `${col},${row}`
      if (seen.has(key)) return
      seen.add(key)
      out.push({ col, row })
    }

    for (let i = 1; i < this.waypoints.length; i++) {
      const [x0, y0] = this.waypoints[i - 1]
      const [x1, y1] = this.waypoints[i]
      if (y0 === y1) {
        const [a, b] = x0 < x1 ? [x0, x1] : [x1, x0]
        for (let x = a; x < b; x++) {
          push(x, y0 - 1)
          push(x, y0)
        }
      } else {
        const [a, b] = y0 < y1 ? [y0, y1] : [y1, y0]
        for (let y = a; y < b; y++) {
          push(x0 - 1, y)
          push(x0, y)
        }
      }
    }
    return out
  }
}

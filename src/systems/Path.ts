// The single lane enemies walk. Waypoints are tile coordinates and every
// segment is axis-aligned, which keeps both the road tiles and the distance
// math trivial.

import { Grid } from './Grid.ts'

export interface PathPoint {
  x: number
  y: number
}

export class Path {
  readonly points: PathPoint[]
  readonly totalLength: number
  private readonly cumulative: number[]
  private readonly waypoints: number[][]
  private readonly grid: Grid

  constructor(waypoints: number[][], grid: Grid) {
    if (waypoints.length < 2) {
      throw new Error('Path needs at least two waypoints')
    }
    this.waypoints = waypoints
    this.grid = grid

    this.points = waypoints.map((w) => ({
      x: grid.centreX(w[0]),
      y: grid.centreY(w[1]),
    }))

    this.cumulative = [0]
    let total = 0
    for (let i = 1; i < this.points.length; i++) {
      const dx = this.points[i].x - this.points[i - 1].x
      const dy = this.points[i].y - this.points[i - 1].y
      total += Math.hypot(dx, dy)
      this.cumulative.push(total)
    }
    this.totalLength = total
  }

  /** Position at a distance travelled from the spawn end. Clamped at both ends. */
  pointAt(distance: number): PathPoint {
    if (distance <= 0) {
      return { x: this.points[0].x, y: this.points[0].y }
    }
    const last = this.points[this.points.length - 1]
    if (distance >= this.totalLength) {
      return { x: last.x, y: last.y }
    }

    let i = 1
    while (i < this.cumulative.length && this.cumulative[i] < distance) {
      i++
    }

    const segStart = this.cumulative[i - 1]
    const segLength = this.cumulative[i] - segStart
    const t = segLength === 0 ? 0 : (distance - segStart) / segLength
    const a = this.points[i - 1]
    const b = this.points[i]

    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    }
  }

  /** Every in-bounds tile the lane covers, for drawing road and for blocking
   *  tower placement. */
  tiles(): { col: number; row: number }[] {
    const waypoints = this.waypoints
    const grid = this.grid
    const seen = new Set<string>()
    const out: { col: number; row: number }[] = []

    const push = (col: number, row: number): void => {
      if (!grid.contains(col, row)) return
      const key = grid.key(col, row)
      if (seen.has(key)) return
      seen.add(key)
      out.push({ col, row })
    }

    for (let i = 1; i < waypoints.length; i++) {
      const [c0, r0] = waypoints[i - 1]
      const [c1, r1] = waypoints[i]
      const stepC = Math.sign(c1 - c0)
      const stepR = Math.sign(r1 - r0)
      let c = c0
      let r = r0
      push(c, r)
      while (c !== c1 || r !== r1) {
        c += stepC
        r += stepR
        push(c, r)
      }
    }

    return out
  }
}

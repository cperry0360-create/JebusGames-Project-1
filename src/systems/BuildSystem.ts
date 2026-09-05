// Placement rules for a painted map: towers go on hand-placed spots rather
// than on a grid. A spot is buildable when it exists and nothing stands there.

export interface BuildSpot {
  index: number
  x: number
  y: number
}

export class BuildSystem {
  readonly spots: BuildSpot[]
  private readonly radius: number
  private readonly occupied = new Set<number>()

  constructor(spots: number[][], radius: number) {
    this.spots = spots.map((s, index) => ({ index, x: s[0], y: s[1] }))
    this.radius = radius
  }

  /** The nearest spot within the click radius, free or not, or null. */
  spotAt(x: number, y: number): BuildSpot | null {
    let best: BuildSpot | null = null
    let bestDist = this.radius
    for (const s of this.spots) {
      const d = Math.hypot(s.x - x, s.y - y)
      if (d <= bestDist) {
        best = s
        bestDist = d
      }
    }
    return best
  }

  isFree(index: number): boolean {
    return index >= 0 && index < this.spots.length && !this.occupied.has(index)
  }

  occupy(index: number): void {
    this.occupied.add(index)
  }

  /** Frees a spot again — selling takes a tower off one. */
  release(index: number): void {
    this.occupied.delete(index)
  }

  freeSpots(): BuildSpot[] {
    return this.spots.filter((s) => this.isFree(s.index))
  }

  get towerCount(): number {
    return this.occupied.size
  }
}

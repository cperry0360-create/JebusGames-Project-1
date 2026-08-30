// Placement rules. Kept free of Phaser so the rules can be tested directly:
// a tile is buildable when it is on the grid, off the road, and empty.

import { Grid } from './Grid.ts'

export class BuildSystem {
  private readonly grid: Grid
  private readonly blocked = new Set<string>()
  private readonly occupied = new Set<string>()

  constructor(grid: Grid) {
    this.grid = grid
  }

  /** Marks a tile as permanently unbuildable — the road, for now. */
  block(col: number, row: number): void {
    this.blocked.add(this.grid.key(col, row))
  }

  isBuildable(col: number, row: number): boolean {
    if (!this.grid.contains(col, row)) return false
    const key = this.grid.key(col, row)
    return !this.blocked.has(key) && !this.occupied.has(key)
  }

  occupy(col: number, row: number): void {
    this.occupied.add(this.grid.key(col, row))
  }

  isOccupied(col: number, row: number): boolean {
    return this.occupied.has(this.grid.key(col, row))
  }

  get towerCount(): number {
    return this.occupied.size
  }
}

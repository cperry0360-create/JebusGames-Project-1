// Flat square grid. Orthogonal on purpose — the 3/4 look comes from the art
// and from Y-sorting, never from the coordinate math. No isometric conversion
// belongs in this file.

export interface Tile {
  col: number
  row: number
}

export class Grid {
  readonly cols: number
  readonly rows: number
  readonly tileSize: number
  readonly originX: number
  readonly originY: number

  constructor(cols: number, rows: number, tileSize: number, originX: number, originY: number) {
    this.cols = cols
    this.rows = rows
    this.tileSize = tileSize
    this.originX = originX
    this.originY = originY
  }

  get widthPx(): number {
    return this.cols * this.tileSize
  }

  get heightPx(): number {
    return this.rows * this.tileSize
  }

  /** World x of the centre of a column. Valid outside the grid too, so
   *  off-screen path waypoints resolve. */
  centreX(col: number): number {
    return this.originX + col * this.tileSize + this.tileSize / 2
  }

  centreY(row: number): number {
    return this.originY + row * this.tileSize + this.tileSize / 2
  }

  colAt(worldX: number): number {
    return Math.floor((worldX - this.originX) / this.tileSize)
  }

  rowAt(worldY: number): number {
    return Math.floor((worldY - this.originY) / this.tileSize)
  }

  contains(col: number, row: number): boolean {
    return col >= 0 && col < this.cols && row >= 0 && row < this.rows
  }

  key(col: number, row: number): string {
    return `${col},${row}`
  }
}

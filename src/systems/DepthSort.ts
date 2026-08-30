// The whole depth story for this game: things lower on the screen draw in
// front. One rule, applied every frame, instead of an isometric sort.

export const GROUND_DEPTH = -1000
export const GRID_DEPTH = -999
/** Nudges an object above others sharing its baseline (projectiles, effects). */
export const ABOVE = 0.5

export interface Sortable {
  y: number
  setDepth(value: number): unknown
}

export function ySort(obj: Sortable, bias = 0): void {
  obj.setDepth(obj.y + bias)
}

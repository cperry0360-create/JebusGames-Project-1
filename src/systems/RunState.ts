// What the title and draft screens decide, and the game scene consumes.
// A plain module rather than the Phaser registry so it can be read in tests.

export interface RunState {
  heroId: string
  abilities: string[]
  openingTowers: string[]
  /** Towers not drawn at the start, in the order they unlock later. */
  reserveTowers: string[]
  seed: number
}

const state: RunState = {
  heroId: 'cory',
  abilities: [],
  openingTowers: [],
  reserveTowers: [],
  seed: 1,
}

export function runState(): RunState {
  return state
}

export function setRunState(next: Partial<RunState>): void {
  Object.assign(state, next)
}

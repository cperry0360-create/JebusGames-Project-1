// What the title and draft screens decide, and the game scene consumes.
// A plain module rather than the Phaser registry so it can be read in tests.

import type { SavedRun } from './RunSave.ts'

export interface RunState {
  heroId: string
  abilities: string[]
  openingTowers: string[]
  /** Towers not drawn at the start, in the order they unlock later. */
  reserveTowers: string[]
  seed: number
  /**
   * A run to pick up where it was left, or null for a fresh one.
   *
   * The DECISION to resume belongs to the title screen — it is the screen that
   * offers it and the player who answers — so GameScene must not go looking
   * for a saved run on its own. It would resume one the player had just
   * declined by pressing START RUN. This is that answer, handed over.
   *
   * Consumed and cleared by GameScene on the first frame of the run, so
   * restarting the scene does not restore the same board a second time.
   */
  resumeFrom: SavedRun | null
}

const state: RunState = {
  heroId: 'cory',
  abilities: [],
  openingTowers: [],
  reserveTowers: [],
  seed: 1,
  resumeFrom: null,
}

export function runState(): RunState {
  return state
}

export function setRunState(next: Partial<RunState>): void {
  Object.assign(state, next)
}

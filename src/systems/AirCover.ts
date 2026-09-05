// Can this level actually shoot down what it sends?
//
// An air enemy that no tower in the player's hand can hit is not a hard wave,
// it is an unwinnable one: it walks the lane untouched and takes the lives
// with it. Nothing else in the game would say a word about that — the wave
// table and the tower list are separate files, and the connection between them
// only exists at runtime.
//
// THE DRAFT IS WHY THIS IS NOT OBVIOUS. Towers are drawn at random from a
// pool, so "this level unlocks an air-capable tower" is not a fact about the
// level, it is a probability. A rule that passed because a lucky hand COULD
// include one would be no rule at all.
//
// So the property checked is the guaranteed one: by the wave an air enemy
// first arrives, it must be IMPOSSIBLE to be holding an all-ground hand. With
// G ground-only towers in the pool and N towers in hand, a player can hold
// nothing but ground exactly when G >= N — so cover is guaranteed when G < N.
//
// Phaser-free, so tests and any future tool can both call it.

import type { DraftDef, EnemyDef, TowerDef, WavesDef } from '../types.ts'
import { AIR, GROUND, layerOf } from './Targeting.ts'
import { unlockedTowerCount } from './Draft.ts'

export interface AirCoverInput {
  /** For the message only. */
  levelId: string
  waves: WavesDef
  enemies: Record<string, EnemyDef>
  towers: Record<string, TowerDef>
  draft: DraftDef
}

/** True when this tower may shoot things in the air. */
export function hitsAir(t: TowerDef): boolean {
  return (t.targets ?? [GROUND]).includes(AIR)
}

/**
 * What is wrong with a level's air cover, as a list of sentences. Empty is
 * fine, which is every level that sends nothing airborne.
 */
export function airCoverProblems(input: AirCoverInput): string[] {
  const { levelId, waves, enemies, towers, draft } = input
  const problems: string[] = []

  // The pool a run can draw from, which is what draft.json weights name.
  const pool = Object.keys(draft.towerWeights).filter((id) => towers[id])
  const groundOnly = pool.filter((id) => !hitsAir(towers[id]!))

  for (const [i, wave] of waves.waves.entries()) {
    const airborne = wave.spawns
      .map((s) => s.enemy)
      .filter((id) => enemies[id] && layerOf(enemies[id]!) === AIR)
    if (airborne.length === 0) continue

    const named = [...new Set(airborne)].join(', ')

    if (pool.length === groundOnly.length) {
      problems.push(
        `${levelId} wave ${i + 1} sends ${named} into the air, and no tower in the draft pool ` +
        'can shoot air at all')
      continue
    }

    // How many towers the player is holding by the time this wave runs. The
    // wave INDEX is how many waves have been cleared when it starts.
    const inHand = unlockedTowerCount(draft, i)
    if (groundOnly.length >= inHand) {
      problems.push(
        `${levelId} wave ${i + 1} sends ${named} into the air, but a player can still be holding ` +
        `${inHand} tower${inHand === 1 ? '' : 's'} drawn entirely from the ` +
        `${groundOnly.length} ground-only ones (${groundOnly.join(', ')}), so the wave can be ` +
        'unwinnable through no fault of play')
    }
  }

  return problems
}

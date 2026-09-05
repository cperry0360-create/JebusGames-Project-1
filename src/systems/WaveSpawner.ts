// Drives spawning inside a single wave. Deciding when a wave is *cleared* is
// the scene's job, since that depends on enemies still alive on the field.

import type { WaveDef } from '../types.ts'

interface Group {
  enemy: string
  remaining: number
  interval: number
  /** Counts down the group's start delay first, then the spawn interval. */
  timer: number
  /** The lane this group walks in from, or undefined for the map's main lane.
   *  Carried rather than resolved here: the spawner does not know what lanes a
   *  map has, and should not. */
  lane: string | undefined
}

/** One enemy to put on the board, and where it comes in. */
export interface Spawn {
  enemy: string
  lane: string | undefined
}

export class WaveSpawner {
  private groups: Group[] = []

  begin(wave: WaveDef): void {
    this.groups = wave.spawns.map((s) => ({
      enemy: s.enemy,
      remaining: s.count,
      interval: s.interval,
      timer: s.delay,
      lane: s.lane,
    }))
  }

  get done(): boolean {
    return this.groups.every((g) => g.remaining <= 0)
  }

  get remaining(): number {
    return this.groups.reduce((a, g) => a + Math.max(0, g.remaining), 0)
  }

  /** Advances the clock and reports everything that should spawn now, each
   *  with the lane it walks in from. */
  update(dt: number): Spawn[] {
    const spawned: Spawn[] = []
    for (const g of this.groups) {
      if (g.remaining <= 0) continue
      g.timer -= dt
      // A long frame can owe more than one unit; pay them all out.
      while (g.timer <= 0 && g.remaining > 0) {
        spawned.push({ enemy: g.enemy, lane: g.lane })
        g.remaining--
        g.timer += g.interval
      }
    }
    return spawned
  }
}

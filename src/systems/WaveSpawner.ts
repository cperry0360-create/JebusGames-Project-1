// Drives spawning inside a single wave. Deciding when a wave is *cleared* is
// the scene's job, since that depends on enemies still alive on the field.

import type { WaveDef } from '../types.ts'

interface Group {
  enemy: string
  remaining: number
  interval: number
  /** Counts down the group's start delay first, then the spawn interval. */
  timer: number
}

export class WaveSpawner {
  private groups: Group[] = []

  begin(wave: WaveDef): void {
    this.groups = wave.spawns.map((s) => ({
      enemy: s.enemy,
      remaining: s.count,
      interval: s.interval,
      timer: s.delay,
    }))
  }

  get done(): boolean {
    return this.groups.every((g) => g.remaining <= 0)
  }

  get remaining(): number {
    return this.groups.reduce((a, g) => a + Math.max(0, g.remaining), 0)
  }

  /** Advances the clock and reports every enemy id that should spawn now. */
  update(dt: number): string[] {
    const spawned: string[] = []
    for (const g of this.groups) {
      if (g.remaining <= 0) continue
      g.timer -= dt
      // A long frame can owe more than one unit; pay them all out.
      while (g.timer <= 0 && g.remaining > 0) {
        spawned.push(g.enemy)
        g.remaining--
        g.timer += g.interval
      }
    }
    return spawned
  }
}

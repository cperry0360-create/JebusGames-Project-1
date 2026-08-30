// Drives spawning inside a single wave. Deciding when a wave is *cleared* is
// the scene's job, since that depends on enemies still alive on the field.

import type { WaveDef } from '../types.ts'

export interface PendingSpawn {
  enemy: string
  remaining: number
  interval: number
  timer: number
}

export class WaveSpawner {
  private queue: PendingSpawn[] = []

  /** Load a wave. Nothing spawns until update() runs. */
  begin(wave: WaveDef): void {
    this.queue = wave.spawns.map((s) => ({
      enemy: s.enemy,
      remaining: s.count,
      interval: s.interval,
      // First unit of each group arrives immediately.
      timer: 0,
    }))
  }

  get done(): boolean {
    return this.queue.every((q) => q.remaining <= 0)
  }

  /** Advances the clock and reports every enemy id that should spawn now. */
  update(dt: number): string[] {
    const spawned: string[] = []
    for (const q of this.queue) {
      if (q.remaining <= 0) continue
      q.timer -= dt
      // A long frame can owe more than one unit; pay them all out.
      while (q.timer <= 0 && q.remaining > 0) {
        spawned.push(q.enemy)
        q.remaining--
        q.timer += q.interval
      }
    }
    return spawned
  }
}

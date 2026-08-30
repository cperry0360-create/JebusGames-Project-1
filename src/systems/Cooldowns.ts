// Ability cooldown bookkeeping. Free of Phaser so the HUD's timers and the
// "can I cast this" rule are testable.

export class Cooldowns {
  private readonly remaining = new Map<string, number>()
  private readonly length = new Map<string, number>()

  register(id: string, seconds: number): void {
    this.length.set(id, seconds)
    this.remaining.set(id, 0)
  }

  tick(dt: number): void {
    for (const [id, left] of this.remaining) {
      if (left > 0) this.remaining.set(id, Math.max(0, left - dt))
    }
  }

  ready(id: string): boolean {
    return (this.remaining.get(id) ?? 0) <= 0
  }

  start(id: string): void {
    this.remaining.set(id, this.length.get(id) ?? 0)
  }

  secondsLeft(id: string): number {
    return this.remaining.get(id) ?? 0
  }

  /** 0 when just cast, 1 when ready — what the HUD draws. */
  progress(id: string): number {
    const total = this.length.get(id) ?? 0
    if (total <= 0) return 1
    return 1 - (this.remaining.get(id) ?? 0) / total
  }
}

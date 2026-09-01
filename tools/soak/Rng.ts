// Seeded RNG for the soak.
//
// Every failure the soak reports carries the seed that produced it, and the
// seed has to be enough to reproduce it exactly — so nothing in the simulated
// run may reach for Math.random. mulberry32: small, fast, well-distributed
// enough for this, and identical across runs and machines.

export interface Rng {
  (): number
  int(maxExclusive: number): number
  pick<T>(items: T[]): T
  shuffled<T>(items: T[]): T[]
}

export function makeRng(seed: number): Rng {
  let a = seed >>> 0
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const rng = next as Rng
  rng.int = (n) => Math.floor(next() * n)
  rng.pick = (items) => items[Math.floor(next() * items.length)]!
  rng.shuffled = (items) => {
    const out = items.slice()
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1))
      ;[out[i], out[j]] = [out[j]!, out[i]!]
    }
    return out
  }
  return rng
}

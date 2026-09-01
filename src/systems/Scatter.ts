// Where the decoration goes, decided once from a seed.
//
// Fifteen props on a hand-placed map is fifteen positions somebody has to
// maintain, and a hand-placed map cannot answer "is this too dense?" without
// being redone. This computes the layout instead, from a fixed seed, so the
// board is identical every run and every session — and so "more" or "fewer"
// is one number rather than an afternoon.
//
// Phaser-free, and returns plain placements. The scene turns them into
// sprites. That keeps every rule here — surface, spacing, exclusion — checkable
// in Node, which matters because "nothing overlaps the path" is exactly the
// kind of claim a screenshot can appear to support and be wrong about.

/** Which ground a prop is drawn to sit on. */
export type Surface = 'grass' | 'dirt' | 'either'

export interface ScatterKind {
  /** Manifest key. */
  key: string
  surface: Surface
  /** Relative frequency inside its tier. */
  weight: number
  /** Hard cap on the whole map. Rare props carry a small one. */
  max?: number
  /** Radius this prop claims, in world px, for spacing against its neighbours. */
  radius: number
}

export interface ScatterRules {
  /** How many placements to attempt. Fewer land: an attempt that breaks a rule
   *  is dropped rather than nudged, because nudging is how a prop ends up on
   *  the path. */
  attempts: number
  /** Minimum gap between two props, on top of their own radii. */
  minGapPx: number
  /** How far a grass prop must stay from the centre of the lane. */
  pathClearancePx: number
  /** How close to the lane centre a dirt prop must be. */
  dirtBandPx: number
  /** Keep-out radius around a build spot. */
  buildSpotClearPx: number
  /** Keep-out radius around the first and last on-map waypoints. */
  endClearPx: number
  /** Inset from the map edge, which is painted trees on every side. */
  edgeInsetPx: number
}

export interface Rect { x: number; y: number; w: number; h: number }

export interface Placement {
  key: string
  x: number
  y: number
  /** Radians. A few degrees only; these are objects lying on the ground, not
   *  spinning. */
  rotation: number
  /** Multiplier on the prop's render scale. */
  scale: number
}

export interface ScatterInput {
  worldWidth: number
  worldHeight: number
  /** The lane's waypoints, in order. */
  waypoints: number[][]
  buildSpots: number[][]
  /** Painted furniture: the tavern, the pond, the arch, the gate, the sign. */
  exclude: Rect[]
  kinds: ScatterKind[]
  rules: ScatterRules
  /** How much a placement's scale may vary, as a fraction. */
  scaleJitter: number
  /** How far a placement may rotate, in degrees. */
  rotateDegrees: number
}

/** Deterministic, self-contained, and not the draft's RNG: the scatter must
 *  not move because the draft drew a different card. */
export function scatterRng(seed: number): () => number {
  let s = (seed >>> 0) || 1
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
}

/** Shortest distance from a point to a polyline. */
export function distanceToPath(x: number, y: number, waypoints: number[][]): number {
  let best = Infinity
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1]!
    const b = waypoints[i]!
    const dx = b[0]! - a[0]!
    const dy = b[1]! - a[1]!
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]!) * dx + (y - a[1]!) * dy) / len2))
    const px = a[0]! + dx * t
    const py = a[1]! + dy * t
    best = Math.min(best, Math.hypot(x - px, y - py))
  }
  return best
}

function inRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}

/**
 * Places the scatter.
 *
 * Rejection sampling: pick a point, pick a prop that suits the ground under
 * it, and keep it only if it breaks no rule. Nothing is ever moved to make it
 * fit — a nudged prop is how one ends up half on the lane — so the density
 * knob is `attempts`, and the count that lands is reported rather than
 * promised.
 */
export function scatter(input: ScatterInput, seed: number): Placement[] {
  const rng = scatterRng(seed)
  const r = input.rules
  const placed: Placement[] = []
  const radii: number[] = []
  const counts = new Map<string, number>()

  const onMap = input.waypoints.filter(
    (p) => p[0]! >= 0 && p[0]! <= input.worldWidth,
  )
  const ends = [onMap[0], onMap[onMap.length - 1]].filter(Boolean) as number[][]

  for (let i = 0; i < r.attempts; i++) {
    const x = r.edgeInsetPx + rng() * (input.worldWidth - r.edgeInsetPx * 2)
    const y = r.edgeInsetPx + rng() * (input.worldHeight - r.edgeInsetPx * 2)

    // Painted furniture first: it is the cheapest test and rejects the most.
    if (input.exclude.some((rect) => inRect(x, y, rect))) continue
    if (input.buildSpots.some((s) => Math.hypot(x - s[0]!, y - s[1]!) < r.buildSpotClearPx)) continue
    if (ends.some((e) => Math.hypot(x - e[0]!, y - e[1]!) < r.endClearPx)) continue

    const d = distanceToPath(x, y, input.waypoints)
    // What ground is this? Grass props carry grass in their bases and would
    // put a tuft of it in the middle of the lane; dirt props carry dirt and
    // would put a puddle in a field.
    const onDirt = d <= r.dirtBandPx
    const onGrass = d >= r.pathClearancePx
    if (!onDirt && !onGrass) continue

    const eligible = input.kinds.filter((k) => {
      if (k.max !== undefined && (counts.get(k.key) ?? 0) >= k.max) return false
      if (k.surface === 'either') return true
      return k.surface === 'dirt' ? onDirt : onGrass
    })
    if (eligible.length === 0) continue

    const total = eligible.reduce((a, k) => a + k.weight, 0)
    let pick = rng() * total
    let kind = eligible[eligible.length - 1]!
    for (const k of eligible) {
      pick -= k.weight
      if (pick <= 0) { kind = k; break }
    }

    // Spacing, against what is already down. Checked last because it is the
    // only test that grows with the number placed.
    let clash = false
    for (let j = 0; j < placed.length; j++) {
      const gap = kind.radius + radii[j]! + r.minGapPx
      if (Math.hypot(x - placed[j]!.x, y - placed[j]!.y) < gap) { clash = true; break }
    }
    if (clash) continue

    placed.push({
      key: kind.key,
      x,
      y,
      rotation: ((rng() * 2 - 1) * input.rotateDegrees) * Math.PI / 180,
      // Never negative and never flipped vertically: these have light baked
      // into them and an upside-down rock reads as a hole.
      scale: 1 + (rng() * 2 - 1) * input.scaleJitter,
    })
    radii.push(kind.radius)
    counts.set(kind.key, (counts.get(kind.key) ?? 0) + 1)
  }
  return placed
}

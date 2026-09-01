// The crossfade, as arithmetic.
//
// Two decks and nothing else. A crossfade is the outgoing deck ramping down
// while the incoming one ramps up, and then they swap roles — so however many
// scene changes happen, there are never three sources and never a third track
// underneath the two you can hear. That is the property the "no audio leaks
// across scene shutdown" requirement is really asking for, and it is a
// property of this type rather than something every scene has to remember.
//
// Phaser-free and DOM-free on purpose. The thing that goes wrong in music code
// is bookkeeping — a deck reused while still fading, a track crossfaded into
// itself and restarted, a source left streaming at volume zero for the rest of
// the session — and none of that needs a browser to test.

export interface DeckState {
  /** Track id, or null when the deck is free. */
  id: string | null
  /** Where the ramp is going, 0..1. */
  target: number
  /** Where it is now. */
  level: number
}

export interface MixState {
  decks: [DeckState, DeckState]
  /** Which deck is the one the game currently wants to hear. */
  front: 0 | 1
}

export function newMix(): MixState {
  return {
    decks: [
      { id: null, target: 0, level: 0 },
      { id: null, target: 0, level: 0 },
    ],
    front: 0,
  }
}

/** What the game currently wants to hear, whatever is still fading out. */
export function currentId(m: MixState): string | null {
  const d = m.decks[m.front]
  return d.target > 0 ? d.id : null
}

/** Every deck holding a source. Never longer than two, by construction. */
export function loaded(m: MixState): string[] {
  return m.decks.filter((d) => d.id !== null).map((d) => d.id as string)
}

/**
 * Asks for a track.
 *
 * Returns the deck that must be STARTED, or -1 for nothing to do. Asking for
 * the track already on the front deck is explicitly nothing to do: crossfading
 * a track into itself restarts it, and the battle track has to run across
 * Title and Loadout unbroken.
 */
export function request(m: MixState, id: string | null): number {
  const cur = m.decks[m.front]
  if (id !== null && cur.id === id) {
    // Already here. Make sure it is rising rather than fading out — a fast
    // there-and-back (Game -> Title -> Game) must not leave it on its way
    // down.
    cur.target = 1
    return -1
  }
  cur.target = 0
  if (id === null) return -1

  const next = (1 - m.front) as 0 | 1
  m.decks[next] = { id, target: 1, level: 0 }
  m.front = next
  return next
}

/**
 * Advances both ramps by one step.
 *
 * Returns the decks that have finished fading out and whose sources must be
 * released. A deck left at level 0 with a source attached goes on streaming
 * for the rest of the session, which is the leak this returns in order to
 * prevent.
 */
export function step(m: MixState, stepAmount: number): number[] {
  const release: number[] = []
  for (let i = 0; i < m.decks.length; i++) {
    const d = m.decks[i]!
    if (d.level === d.target) {
      if (d.level === 0 && d.id !== null && i !== m.front) release.push(i)
      continue
    }
    d.level = d.target > d.level
      ? Math.min(d.target, d.level + stepAmount)
      : Math.max(d.target, d.level - stepAmount)
    if (d.level === 0 && d.target === 0 && d.id !== null) release.push(i)
  }
  for (const i of release) m.decks[i] = { id: null, target: 0, level: 0 }
  return release
}

/** True while any ramp is still moving. */
export function settling(m: MixState): boolean {
  return m.decks.some((d) => d.level !== d.target)
}

/** The gain a deck should output, before the player's own volume. */
export function deckGain(d: DeckState, trackGain: number): number {
  return d.level * trackGain
}

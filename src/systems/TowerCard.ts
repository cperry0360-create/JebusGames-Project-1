/**
 * What the ledger card says. Phaser-free, so it can be proved rather than
 * sampled.
 *
 * THE CARD THIS REPLACES had a title, a paragraph of prose, five stat rows,
 * a cost row, and an adaptive ladder that shrank the body font, then the row
 * height, then the title, and only then gave up and dropped the prose. Four
 * levers, all of them protecting a paragraph that answered nothing the numbers
 * did not — and a panel whose height nobody could predict, because it depended
 * on how long a sentence happened to be.
 *
 * The ledger is fixed: a name, three numbers, one phrase, one button. Its
 * height is arithmetic, so the ladder is gone with the prose it existed for.
 *
 * The rules that live here:
 *
 *   - dps is DERIVED, not stored. damage x shots per second, rounded. It
 *     replaces the separate Damage and Rate rows, and `towers.json` keeps both
 *     numbers exactly as they were — this is a display derivation and changes
 *     no balance.
 *   - rate survives as the third number because it still decides how a tower
 *     fares against armour: armour is subtracted per SHOT, so two towers with
 *     the same dps do very different things to a Buckethead.
 *   - and rate is therefore the number that goes when there is not room for
 *     three, because it is the one the other two can be reasoned from.
 */

import type { TowerDef, TowerSpec } from '../types.ts'
import { statAt } from './Upgrades.ts'

/** Limits enforced by `tests/towercard.test.ts` over towers.json. A limit that
 *  lives only in a document gets violated by the fourth tower. */
export const LIMITS = { name: 12, trait: 18, statLabel: 6, buttonVerb: 8 } as const

export interface CardStat {
  /** At most `LIMITS.statLabel` characters. */
  label: string
  value: string
  /**
   * What this becomes if the pending purchase goes through, when it changes.
   *
   * Absent means the number is unaffected and renders plain. Present means the
   * card shows the current value muted and this one in the accent colour, so
   * "what does this upgrade buy?" is answerable without reading a sentence.
   */
  next?: string
}

export interface CardContent {
  name: string
  trait: string
  stats: CardStat[]
  /** The verb and the price as ONE control: "Build 80p", "Sell +45p". */
  button: string
}

/** Shots per second. Zero for a tower that does not shoot. */
export function shotsPerSecond(fireInterval: number): number {
  return fireInterval > 0 ? 1 / fireInterval : 0
}

/** damage x shots per second, rounded to a whole number. */
export function dpsOf(damage: number, fireInterval: number): number {
  return Math.round(damage * shotsPerSecond(fireInterval))
}

/** One decimal, and no trailing `.0`: "1.5" and "2", never "2.0". */
function n1(v: number): string {
  return String(Math.round(v * 10) / 10)
}

/**
 * The three numbers for a tower at a given tier and branch.
 *
 * A SUPPORT TOWER IS THE ONE EXCEPTION, and it has to be: Beacon's damage,
 * range and fireInterval are all literally 0 in the data, so "dps 0, range 0,
 * rate 0" is three slots saying nothing. It reports what it actually does —
 * the damage bonus it grants and the radius it grants it over — and drops the
 * third slot exactly as the narrow case does.
 */
export function statsFor(def: TowerDef, tier: number, spec: TowerSpec | null): CardStat[] {
  const specId = spec?.id ?? null
  if (def.supportRadius > 0) {
    const boost = statAt(def, tier, 'supportDamageBonus', specId)
    return [
      { label: 'boost', value: `+${Math.round(boost * 100)}%` },
      { label: 'range', value: String(Math.round(statAt(def, tier, 'supportRadius', specId))) },
    ]
  }
  const damage = statAt(def, tier, 'damage', specId)
  const interval = statAt(def, tier, 'fireInterval', specId)
  return [
    { label: 'dps', value: String(dpsOf(damage, interval)) },
    { label: 'range', value: String(Math.round(statAt(def, tier, 'range', specId))) },
    { label: 'rate', value: n1(shotsPerSecond(interval)) },
  ]
}

/**
 * Marks up `to` against `from`: every number that changes carries its new
 * value, every number that does not renders plain.
 *
 * Matched by LABEL rather than by index, so a support tower's two slots and a
 * gun's three cannot be compared against each other by position.
 */
export function withChanges(from: CardStat[], to: CardStat[]): CardStat[] {
  return from.map((s) => {
    const after = to.find((t) => t.label === s.label)
    if (!after || after.value === s.value) return { label: s.label, value: s.value }
    return { label: s.label, value: s.value, next: after.value }
  })
}

/**
 * The verb and the price as one string.
 *
 * A refund is signed, because "+45p" and "45p" mean opposite things to a
 * peanut count and the button is the last thing read before it happens.
 */
export function buttonLabel(verb: string, price: number, refund = false): string {
  if (price === 0) return verb
  return refund ? `${verb} +${price}p` : `${verb} ${price}p`
}

/**
 * The stats that fit in `width`.
 *
 * Three numbers want three columns and two hairlines. Below `minPerStat` a
 * column is too narrow for a value and its label side by side, so the last
 * number goes — `rate` first, by the ordering above.
 */
export function statsThatFit(stats: CardStat[], width: number, minPerStat: number): CardStat[] {
  const room = Math.max(1, Math.floor(width / minPerStat))
  return stats.slice(0, Math.max(1, Math.min(stats.length, room)))
}

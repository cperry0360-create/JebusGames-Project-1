import { lossRate, topPayout } from './Scratch.ts'
import type { AbilityDef } from '../types.ts'

/**
 * What an active actually does, in one line of mechanics.
 *
 * Assembled from the ability's own numbers rather than written out, so it
 * cannot drift when one of them is retuned, and so a new ability describes
 * itself without anybody remembering to write copy for it.
 *
 * Phaser-free on purpose: it lives here rather than in the scene that draws it
 * so it can be checked without a browser.
 */
export function abilityLine(def: AbilityDef): string {
  const effect: string[] = []
  if (def.damage > 0) {
    effect.push(`${def.damage} damage${def.radius > 0 ? `, ${def.radius} radius` : ''}`)
  }
  if (def.summonCount > 0) effect.push(`${def.summonCount} blockers for ${def.duration}s`)
  if (def.slowFactor > 0) {
    effect.push(`slows to ${Math.round(def.slowFactor * 100)}% for ${def.duration}s`)
  }
  // A gamble is described as one. Quoting the range alone read as a promise,
  // and the old range could not lose.
  if (def.outcomes?.length) {
    const best = topPayout(def.outcomes)
    const loses = Math.round(lossRate(def.outcomes) * 100)
    effect.push(`up to ${best} peanuts · ${loses}% pay nothing`)
  }
  if (effect.length === 0 && def.radius > 0) effect.push(`${def.radius} radius`)
  return `${effect.join(' · ')} · ${def.cooldown}s cooldown`
}

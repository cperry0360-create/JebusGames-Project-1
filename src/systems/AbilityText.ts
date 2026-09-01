import { lossRate, topPayout } from './Scratch.ts'
import type { AbilityDef, TowerDef } from '../types.ts'

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
/**
 * A non-breaking space, used between a value and its unit.
 *
 * Phaser wraps on ordinary spaces, so "14s cooldown" and "110 radius" were
 * splitting across lines with the number stranded at the end of one and its
 * unit alone at the start of the next. Binding the pair means a wrap can
 * happen around the phrase but never inside it.
 */
const NB = '\u00a0'

/** A value and a suffix that is punctuation, not a word: `14` + `s` -> `14s`.
 *  No separator at all, so nothing can wrap between them. */
function tight(value: number | string, suffix: string): string {
  return `${value}${suffix}`
}

/** A value and a word: `85` + `damage` -> `85 damage`, joined by a
 *  non-breaking space so it reads as a phrase and never splits across lines. */
function bound(value: number | string, word: string): string {
  return `${value}${NB}${word}`
}

export function abilityLine(def: AbilityDef): string {
  const effect: string[] = []
  if (def.damage > 0) {
    effect.push(`${bound(def.damage, 'damage')}${def.radius > 0 ? `, ${bound(def.radius, 'radius')}` : ''}`)
  }
  if (def.summonCount > 0) {
    effect.push(`${bound(def.summonCount, 'blockers')} for ${tight(def.duration, 's')}`)
  }
  if (def.slowFactor > 0) {
    effect.push(`slows to ${Math.round(def.slowFactor * 100)}% for ${tight(def.duration, 's')}`)
  }
  // A gamble is described as one. Quoting the range alone read as a promise,
  // and the old range could not lose.
  if (def.outcomes?.length) {
    const best = topPayout(def.outcomes)
    const loses = Math.round(lossRate(def.outcomes) * 100)
    effect.push(`up to ${bound(best, 'peanuts')} · ${loses}% pay nothing`)
  }
  if (effect.length === 0 && def.radius > 0) effect.push(bound(def.radius, 'radius'))
  // An ability whose effect is not expressible in its own stat block — the
  // Server Nuke deletes the board, which is damage 0 and radius 0 — carries
  // one written line instead. Everything else still describes itself.
  if (effect.length === 0 && def.blurb) effect.push(def.blurb)
  // A rare drop with no listed numbers still has to say something rather
  // than open with a dangling separator.
  const body = effect.length > 0 ? `${effect.join(' · ')} · ` : ''
  return `${body}${bound(tight(def.cooldown, 's'), 'cooldown')}`
}

/**
 * A tower's headline numbers, for the loadout card.
 *
 * The tower cards showed a name and a price while the ability cards showed
 * full mechanics, so the player was asked to choose between two things
 * described to completely different depths.
 */
export function towerStats(def: TowerDef): string {
  const rate = (1 / def.fireInterval).toFixed(1)
  if (def.supportRadius > 0) {
    return `${bound(def.supportRadius, 'radius')} · +${Math.round(def.supportDamageBonus * 100)}% damage`
  }
  return `${bound(def.damage, 'dmg')} · ${bound(def.range, 'range')} · ${tight(rate, '/s')}`
}

/**
 * What the tower does that the numbers alone do not say.
 *
 * Derived rather than written, for the same reason `abilityLine` is: a tower
 * whose splash radius is retuned to zero should stop claiming to splash
 * without anybody remembering to edit a string.
 */
export function towerLine(def: TowerDef): string {
  const traits: string[] = []
  if (def.supportRadius > 0) return 'Buffs every tower standing inside it. Cannot attack.'
  if (def.splashRadius > 0) traits.push(`hits everything within ${tight(def.splashRadius, 'px')}`)
  if (def.slowFactor > 0) traits.push(`slows what it hits to ${Math.round(def.slowFactor * 100)}%`)
  if (def.ignoresArmor) traits.push('ignores armour entirely')
  else if (def.armorPierce > 0) traits.push(`cuts ${bound(def.armorPierce, 'armour')}`)
  if (traits.length === 0) {
    traits.push(def.archetype === 'aoe' ? 'hits a group' : 'picks off one target at a time')
  }
  const s = traits.join(', ')
  return s.charAt(0).toUpperCase() + s.slice(1) + '.'
}

// Human Resources: an enemy that gives the enemies around it armour.
//
// THE BEACON'S MECHANISM, READ THE OTHER WAY ROUND. A Beacon tower buffs the
// towers inside its radius; HR buffs the enemies inside its own. The important
// half is where the number lands: `Enemy.effectiveArmor`, which is the single
// place armour is turned into damage taken, so every damage path on the board —
// towers, soldiers, abilities, the hero's fists — respects the aura without any
// of them knowing it exists.
//
// RECOMPUTED, NOT APPLIED AND UNWOUND. The scene asks this every frame from
// whatever HR is alive, the same way `syncStatusMarkers` asks every enemy what
// is true of it rather than remembering what it was told. An aura that is
// applied on spawn and removed on death leaks the moment something dies in a
// way the remover did not expect — which is the bug the status markers were
// rewritten to avoid, and it cost a marker sitting on the board for a whole run.
//
// Phaser-free on purpose: who is standing near whom is arithmetic.

import type { LevelRules } from './Levels.ts'

/** Level 8's `armorAura` block, once it is known to be one. */
export interface ArmorAuraRules {
  radius: number
  armorBonus: number
}

/** A thing that can project an aura: a position, and whether it is still up. */
export interface AuraSource {
  x: number
  y: number
  alive: boolean
}

/**
 * This level's aura rules, or null.
 *
 * Null for every level that names no rules file, which is the scoping the whole
 * mechanic depends on: an HR walking on another level would project nothing.
 */
export function armorAuraRules(rules: LevelRules | null): ArmorAuraRules | null {
  const a = (rules as { armorAura?: Partial<ArmorAuraRules> } | null)?.armorAura
  if (!a) return null
  if (!(typeof a.radius === 'number' && a.radius > 0)) return null
  if (!(typeof a.armorBonus === 'number' && a.armorBonus > 0)) return null
  return { radius: a.radius, armorBonus: a.armorBonus }
}

/**
 * The armour bonus at one point, given the sources on the board.
 *
 * THE LARGEST IN RANGE, NOT THE SUM, which is the same answer slows and the
 * Beacon already give: a pack with four HR in it would otherwise carry +16
 * armour and be immune to most of the tower pool, and "kill HR first" would
 * become "kill all four HR first or do nothing at all". One HR is a decision;
 * four stacking is a wall.
 *
 * A dead source projects nothing, and a source is never its own beneficiary —
 * the caller excludes it, because HR's own armour is on its row.
 */
export function auraArmorAt(
  point: { x: number; y: number },
  sources: readonly AuraSource[],
  rules: ArmorAuraRules,
): number {
  const r2 = rules.radius * rules.radius
  for (const s of sources) {
    if (!s.alive) continue
    const dx = s.x - point.x
    const dy = s.y - point.y
    if (dx * dx + dy * dy <= r2) return rules.armorBonus
  }
  return 0
}

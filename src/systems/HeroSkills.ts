// The hero's ability buttons: which slots exist, what is in them, and when
// each one may be pressed.
//
// Phaser-free like Heroes.ts and Transform.ts, and for the same reason: "is
// this button pressable right now" is a rule, not a rendering, and a rule that
// decides whether a button works should be testable without a canvas.
//
// THERE USED TO BE EXACTLY TWO SLOTS AND THE GATE WAS THE INDEX. `SLOT1` and
// `SLOT2` were module constants, `slot2Usable` was the powered-form gate, and
// slot 2 was powered-only BECAUSE IT WAS SLOT 2. Courtland has three
// abilities, two of them gated, so both assumptions are gone: the ids are
// generated from a hero's own list, and the gate is `poweredOnly` on the
// ability.

import type { HeroAbilityDef, HeroDef } from '../types.ts'
import type { SlotDef } from './AbilityBar.ts'
import { heroDef, resolveHeroId } from './Heroes.ts'

/**
 * THE SLOT IDS ARE SLOT NAMES, NOT ABILITY NAMES.
 *
 * The ability bar keys cooldowns, hit rectangles and its own rebuild check off
 * a slot id. Keying those off the ability -- 'haymaker', 'bark' -- would change
 * the bar's signature every time the player picked a different hero, which is
 * the exact condition that once destroyed and rebuilt the row every frame. The
 * slots are the same positions whoever is standing in them; only their
 * contents change.
 */
const PREFIX = 'heroSlot'

/** The id of the hero slot at `index` (0-based). */
export function heroSlotId(index: number): string {
  return `${PREFIX}${index + 1}`
}

export function isHeroSlot(id: string): boolean {
  return heroSlotIndex(id) >= 0
}

/**
 * Which slot an id names, or -1 if it names none.
 *
 * The reverse of `heroSlotId`, and the reason the HUD's press handler no
 * longer compares against a constant: a tap on a hero medallion resolves to an
 * INDEX into the hero's own list, so a hero with three abilities needs no new
 * branch anywhere.
 */
export function heroSlotIndex(id: string): number {
  if (!id.startsWith(PREFIX)) return -1
  const n = Number(id.slice(PREFIX.length))
  return Number.isInteger(n) && n >= 1 ? n - 1 : -1
}

/** Every slot id this hero has, in bar order. */
export function heroSlotIds(hero: HeroDef): string[] {
  return hero.abilities.map((_, i) => heroSlotId(i))
}

/** The abilities of the hero with this id, in bar order. */
export function abilitiesOf(heroId: string): HeroAbilityDef[] {
  return heroDef(resolveHeroId(heroId))!.abilities
}

/**
 * The ability in a slot, or null when the hero has no such slot.
 *
 * NULL IS REACHABLE and it is why this returns one. A run started with a
 * three-ability hero and resumed after that hero lost an ability would ask for
 * a slot that no longer exists, and so would a stale hit rectangle in the
 * frame between two heroes. A `!` here would be a crash in both.
 */
export function abilityInSlot(heroId: string, slot: string): HeroAbilityDef | null {
  const i = heroSlotIndex(slot)
  const list = abilitiesOf(heroId)
  return i >= 0 && i < list.length ? list[i]! : null
}

/** What a slot holds, for anything that only needs a name and an icon. */
export function slotContents(heroId: string, slot: string): { name: string; icon: string } {
  const a = abilityInSlot(heroId, slot)
  return a ?? { name: '', icon: '' }
}

/**
 * Whether an ability may be pressed.
 *
 * THE POWERED FORM IS THE WHOLE GATE for anything that declares
 * `poweredOnly`. Such an ability is greyed out and inert in base form, lights
 * up the moment the hero transforms, and greys again on death -- `powered` is
 * false again after a revive, so nothing here has to know about dying
 * separately from being down.
 */
export function abilityUsable(
  ability: HeroAbilityDef, powered: boolean, heroDown: boolean,
): boolean {
  if (heroDown) return false
  return !ability.poweredOnly || powered
}

/**
 * Total damage an ability deals to a single target it hits, over its whole
 * life.
 *
 * The soak needs this and so does any comparison between heroes: Ember's 22 is
 * not comparable with Star Rain's 15 until the burn and the twelve strikes are
 * in the same number.
 *
 * IT IS A CEILING FOR A SCATTER. Star Rain's twelve strikes land over an area
 * and one enemy standing in it takes only the ones that land near it, so this
 * number is what the whole volley is worth rather than what any one enemy
 * takes -- which is the honest way to compare it against a single blow.
 *
 * A HELD BEAM IS ITS WHOLE BUDGET. `holdSeconds` of ticks every `tickSeconds`
 * is what the ability is worth if the player holds it to the end, which is the
 * same "what is the most this can do" the scatter's ceiling reports.
 */
export function abilityDamage(a: HeroAbilityDef): number {
  if (a.effect === 'laser') {
    const ticks = a.tickSeconds > 0 ? Math.floor(a.holdSeconds / a.tickSeconds) : 0
    return a.damage * ticks
  }
  return a.damage * a.hits + a.burnPerSecond * a.burnSeconds
}

/** True when the ability is centred on the hero rather than aimed at somebody. */
export function isAreaSkill(a: HeroAbilityDef): boolean {
  return a.effect === 'burst' || a.effect === 'howl' || a.effect === 'rain'
}

/** The reach that matters for this ability, whichever field carries it. */
export function skillReach(a: HeroAbilityDef): number {
  if (a.activation === 'targeted') return a.castRadius
  if (a.effect === 'laser') return a.range
  return isAreaSkill(a) ? a.radius : a.range
}

/**
 * The hero's slots for the bar, in order.
 *
 * Built from the hero's own def rather than from an id, because both callers
 * already hold the def and looking it up again is a second chance to disagree
 * about who the hero is.
 */
export function heroSlotDefs(hero: HeroDef): SlotDef[] {
  return hero.abilities.map((a, i) => (
    { id: heroSlotId(i), kind: 'heroSlot' as const, icon: a.icon, hero: true }
  ))
}

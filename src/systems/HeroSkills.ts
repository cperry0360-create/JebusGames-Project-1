// The two hero buttons: which slots exist, what is in them, and when each one
// may be pressed.
//
// Phaser-free like Heroes.ts and Transform.ts, and for the same reason: "is
// slot 2 pressable right now" is a rule, not a rendering, and a rule that
// decides whether a button works should be testable without a canvas.

import type { HeroDef, HeroPowerDef, HeroSkillDef } from '../types.ts'
import type { SlotDef } from './AbilityBar.ts'
import { heroDef, resolveHeroId } from './Heroes.ts'

/**
 * THE SLOT IDS ARE SLOT NAMES, NOT ABILITY NAMES.
 *
 * The ability bar keys cooldowns, hit rectangles and its own rebuild check off
 * a slot id. Keying those off the ability -- 'haymaker', 'bark' -- would change
 * the bar's signature every time the player picked a different hero, which is
 * the exact condition that once destroyed and rebuilt the row every frame. The
 * slots are the same two whoever is standing in them; only their contents
 * change.
 */
export const SLOT1 = 'heroSlot1'
export const SLOT2 = 'heroSlot2'
export const HERO_SLOT_IDS: readonly string[] = [SLOT1, SLOT2]

export function isHeroSlot(id: string): boolean {
  return id === SLOT1 || id === SLOT2
}

export function slot1Of(heroId: string): HeroSkillDef {
  return heroDef(resolveHeroId(heroId))!.slot1
}

export function slot2Of(heroId: string): HeroPowerDef {
  return heroDef(resolveHeroId(heroId))!.slot2
}

/** What a slot holds, for anything that only needs a name and an icon. */
export function slotContents(heroId: string, slot: string): { name: string; icon: string } {
  return slot === SLOT2 ? slot2Of(heroId) : slot1Of(heroId)
}

/**
 * Whether slot 2 may be pressed.
 *
 * THE POWERED FORM IS THE WHOLE GATE. It is greyed out and inert in base form,
 * lights up the moment the hero transforms, and greys again on death --
 * `powered` is false again after a revive, so nothing here has to know about
 * dying separately from being down.
 */
export function slot2Usable(powered: boolean, heroDown: boolean): boolean {
  return powered && !heroDown
}

/** Slot 1 is always available; only being down takes it away. */
export function slot1Usable(heroDown: boolean): boolean {
  return !heroDown
}

/**
 * Total damage a skill deals to a single target it hits, over its whole life.
 *
 * The soak needs this and so does any comparison between heroes: Ember's 22 is
 * not comparable with Star Rain's 15 until the burn and the twelve strikes are
 * in the same number.
 *
 * IT IS A CEILING FOR A SCATTER. Star Rain's twelve strikes land over an area
 * and one enemy standing in it takes only the ones that land near it, so this
 * number is what the whole volley is worth rather than what any one enemy
 * takes -- which is the honest way to compare it against a single blow.
 */
export function skillDamage(s: HeroSkillDef): number {
  return s.damage * s.hits + s.burnPerSecond * s.burnSeconds
}

/** True when the skill is centred on the hero rather than aimed at somebody. */
export function isAreaSkill(s: HeroSkillDef): boolean {
  return s.effect === 'burst' || s.effect === 'howl' || s.effect === 'rain'
}

/** The reach that matters for this skill, whichever field carries it. */
export function skillReach(s: HeroSkillDef): number {
  return isAreaSkill(s) ? s.radius : s.range
}

/**
 * The two hero slots for the bar, in order.
 *
 * Built from the hero's own def rather than from an id, because both callers
 * already hold the def and looking it up again is a second chance to disagree
 * about who the hero is.
 */
export function heroSlotDefs(hero: HeroDef): SlotDef[] {
  return [
    { id: SLOT1, kind: 'heroSlot', icon: hero.slot1.icon, hero: true },
    { id: SLOT2, kind: 'heroSlot', icon: hero.slot2.icon, hero: true },
  ]
}

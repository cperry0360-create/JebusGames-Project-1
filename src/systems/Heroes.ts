// The roster: who can be picked, what they look like, and who was picked last.
//
// Phaser-free like the other systems modules. Which heroes exist, which sprite
// a hero wears in which form, whether it has a walk sheet and what the save
// remembers are all decidable without a scene, and the tests read them here.

import type { HeroDef } from '../types.ts'
import heroesData from '../data/heroes.json' with { type: 'json' }
import artData from '../data/art.json' with { type: 'json' }
import { loadSave, writeSave } from './Save.ts'

const DATA = heroesData as unknown as Record<string, HeroDef>
const ROSTER = (artData as unknown as {
  hero: { roster: Record<string, { base: string; powered: string | null;
                                  walk: string[] | null; attack: string[] | null }> }
}).hero.roster

/** Every hero id, in the order heroes.json lists them. Underscored keys are
 *  notes rather than heroes. */
export const HERO_IDS: string[] = Object.keys(DATA).filter((k) => !k.startsWith('_'))

/**
 * The hero a run plays when nothing has said otherwise.
 *
 * First in the file rather than a hardcoded 'cory', so reordering heroes.json
 * cannot silently disagree with the code -- the same rule Levels.ts uses for
 * DEFAULT_LEVEL_ID. Cory is first, which is what makes him the default, and
 * what makes a save with no choice in it play the game as it was tuned.
 */
export const DEFAULT_HERO_ID: string = HERO_IDS[0]!

export function heroDef(id: string): HeroDef | null {
  return HERO_IDS.includes(id) ? DATA[id]! : null
}

/** An id that is certainly a hero. An unknown one resolves to the default
 *  rather than throwing: a save naming a hero that was renamed should play
 *  Cory, not fail to boot. */
export function resolveHeroId(id: string | null | undefined): string {
  return id && HERO_IDS.includes(id) ? id : DEFAULT_HERO_ID
}

export function heroList(): Array<{ id: string; def: HeroDef }> {
  return HERO_IDS.map((id) => ({ id, def: DATA[id]! }))
}

/**
 * The sprite a hero wears in a given form.
 *
 * A hero with no powered art keeps its own picture -- Cory is the case, and
 * deliberately: `ultimateSprite` is already his DAD MODE look, so spending it
 * on the powered form would leave Last Stand with no visual of its own. He
 * still transforms; the burst and the damage reduction are what say so.
 */
export function heroSprite(id: string, powered: boolean): string {
  const entry = ROSTER[resolveHeroId(id)]
  if (!entry) return DATA[DEFAULT_HERO_ID]!.bodySprite
  return (powered && entry.powered) ? entry.powered : entry.base
}

/** True when this hero has powered art to change into. */
export function hasPoweredArt(id: string): boolean {
  return Boolean(ROSTER[resolveHeroId(id)]?.powered)
}

/**
 * How tall this hero's art should be drawn, in world pixels, or undefined to
 * take whatever its art entry asks for.
 *
 * ONE HERO USES IT AND THAT IS THE POINT. Every other sprite in the game is
 * sized by the manifest, because how big a picture is drawn is a fact about
 * the picture. Cory's powered form is the exception: the Rivian is 1.51:1, so
 * at the height the other nine hero pictures are drawn at it would be 181px
 * across -- wider than the road it drives over and half again the widest hero
 * -- and shrinking it is a decision about THIS HERO rather than about that
 * file. So the number sits with the hero, art.json carries no `displayHeight`
 * for that key, and there is exactly one copy of it.
 *
 * A hero with no `poweredHeight` gets undefined and is sized by its art, which
 * is what the other four do and what every hero did before this.
 */
export function heroHeight(id: string, powered: boolean): number | undefined {
  if (!powered) return undefined
  const def = DATA[resolveHeroId(id)]
  return def?.poweredHeight
}

/**
 * A hero's walk frames, or null when it has none.
 *
 * NULL IS WHAT DRIVES THE BOB. A hero with no sheet is one picture that would
 * slide across the field, so Hero.ts bobs it instead; a hero with a sheet
 * animates and is not bobbed. The condition is the sheet's presence rather
 * than a flag, so dropping real frames into art.json's roster later turns the
 * bob off by itself and there is nothing to remember.
 */
export function walkFramesFor(id: string): string[] | null {
  const set = ROSTER[resolveHeroId(id)]?.walk
  return set && set.length > 0 ? set : null
}

export function attackFramesFor(id: string): string[] | null {
  const set = ROSTER[resolveHeroId(id)]?.attack
  return set && set.length > 0 ? set : null
}

/* ------------------------------------------------------------- the choice */

/** The hero the player last picked, or the default if they never have. */
export function chosenHero(): string {
  return resolveHeroId(loadSave().heroId)
}

/** Remembers a pick. Every other save field is preserved. */
export function chooseHero(id: string): void {
  const save = loadSave()
  writeSave({ ...save, heroId: resolveHeroId(id) })
}

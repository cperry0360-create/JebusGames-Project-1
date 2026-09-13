// Which SKIN the towers on this board are wearing.
//
// A skin is a whole-board reskin of the tower art: the same towers, the same
// stats, the same silhouettes' worth of tier art, painted for a different
// world. art.json's `towerSkins` holds one entry per skin — a `keys` map from
// the ordinary manifest key to the skinned one, and a `levels` list of the
// level ids that wear it — and this module is the only thing that reads it.
//
// THE LEVEL IS THE ONLY SWITCH, and it is deliberately the only one. Nothing
// about a tower, a tier, a hero or a save decides this; a board either sits on
// a level in a skin's `levels` list or it does not. That is what keeps the
// loadout screen, the tower drawer, the world map and every menu on the
// original art without a single one of them knowing a skin exists — they pass
// no level id, and `skinnedSprite` with no level id is the identity function.
//
// NO PHASER, AND NOT BY ACCIDENT — the same reason `LevelArt.ts` carries that
// note. `npm install` answers 403 in the agent environment, so a test that
// reaches `phaser` cannot execute at all, only be read as text. The pairing
// rule this module rests on (every skinned key has an original and every
// original a skinned key, and both files ship) is exactly the kind of thing a
// regex cannot check, so it lives where a test can run it. The one part that
// does need a scene — falling back when a texture did not load — is in
// `Art.ts` as `skinnedTexture`, on top of this.

import type { ArtDef } from '../types.ts'
// With the import attribute, which LevelArt.ts also carries: Node's own
// type-stripping runner requires it, and needing it is the point — the test
// imports this module for real rather than reading it as text.
import artData from '../data/art.json' with { type: 'json' }

const art = artData as ArtDef

export interface SkinDef {
  /** Level ids that wear this skin. Empty means the skin is parked. */
  levels: string[]
  /** Ordinary manifest key -> skinned manifest key. */
  keys: Record<string, string>
}

const SKINS: Record<string, SkinDef> = (art.towerSkins ?? {}) as Record<string, SkinDef>

/** Every skin the manifest defines, by name. */
export const SKIN_NAMES: string[] = Object.keys(SKINS)

/** One skin's definition, or null if nothing by that name is defined. */
export function skinDef(name: string): SkinDef | null {
  return SKINS[name] ?? null
}

/**
 * Every skinned key in the manifest, across every skin.
 *
 * `LevelArt.ts` reads this to classify all of them as level art, so boot loads
 * none of it — a skin nobody is wearing must cost nothing.
 */
export const SKINNED_KEYS: string[] = [...new Set(
  Object.values(SKINS).flatMap((s) => Object.values(s.keys ?? {})),
)]

/** Every key that HAS a skinned counterpart, across every skin. */
export const SKINNABLE_KEYS: string[] = [...new Set(
  Object.values(SKINS).flatMap((s) => Object.keys(s.keys ?? {})),
)]

/** Whether this key is one skin's version of another key. */
export function isSkinnedKey(key: string): boolean {
  return SKINNED_KEYS.includes(key)
}

/**
 * The name of the skin this level wears, or null for the original art.
 *
 * A level may appear in at most one skin's `levels` list; `towerskins.test.ts`
 * fails if two claim the same level, because "which one wins" is not a
 * question worth having an answer to.
 */
export function skinForLevel(levelId: string | null | undefined): string | null {
  if (!levelId) return null
  for (const [name, def] of Object.entries(SKINS)) {
    if ((def.levels ?? []).includes(levelId)) return name
  }
  return null
}

/**
 * The sprite key to draw for `key` on this level.
 *
 * Falls back to `key` itself in every uncertain case — no level id, a level
 * wearing no skin, a key the skin does not remap, or a skinned key whose file
 * is not in the manifest. A skin is decoration: a missing one must cost the
 * player the reskin and nothing else, so there is no path through here that
 * returns something the loader cannot ask for.
 */
export function skinnedSprite(key: string, levelId: string | null | undefined): string {
  const name = skinForLevel(levelId)
  if (name === null) return key
  return skinnedKeyIn(name, key)
}

/**
 * What one NAMED skin paints `key` as, with no level involved.
 *
 * Split out from `skinnedSprite` so it can be tested, and that is not a
 * cosmetic reason. `levels` is empty today — the machine art is for levels 9
 * and 10 and neither exists — so every level-aware call goes down the "no skin"
 * branch and returns its argument. A test written only against `skinnedSprite`
 * would therefore pass just as well against a `keys` table that was empty, or
 * wrong, or pointed the two misleading names at each other's files. This is the
 * remap itself, and it is exercised for real.
 */
export function skinnedKeyIn(skinName: string, key: string): string {
  const skinned = SKINS[skinName]?.keys?.[key]
  if (skinned === undefined) return key
  // The manifest is the last word on whether the art exists to be asked for.
  // `Art.skinnedTexture` asks the harder question — did it actually load —
  // because only a scene can answer that.
  return skinned in art.files ? skinned : key
}

/**
 * WHICH LEVEL THE BOARD IS ACTUALLY RUNNING, for the drawing side.
 *
 * The loading side is handed a level id — `queueLevelArt` and `freeLevelArt`
 * both take one. A tower being built halfway through a wave is not: `Tower`'s
 * constructor takes a position, a def and a spot, and widening it to carry a
 * level id would put the board's identity into every placement call site for
 * the sake of one texture name.
 *
 * So GameScene sets it once, from `this.level.id` — the RESOLVED level, the
 * same value `levelArtKeys` classified the art with. That matters more than it
 * looks: `runState().levelId` is what a FRESH run was asked to play, and a
 * resumed run ignores it in favour of the level in the save. Drawing from that
 * field would let a resumed level 3 run ask for skin textures that the level
 * it actually loaded never fetched, which is a missing texture on the board.
 *
 * Cleared on shutdown, beside the rest of the run-scoped state, so a menu
 * after a skinned run is back on the original art rather than holding the last
 * board's skin. Same shape and same lifecycle as `Watchdog.setRunActive` and
 * `Diagnostics.provideState`.
 */
let activeLevelId: string | null = null

export function setSkinLevel(levelId: string | null): void {
  activeLevelId = levelId
}

/** The level the board is running, or null outside a run. */
export function skinLevel(): string | null {
  return activeLevelId
}

/**
 * The sprite key to draw for `key` on the board that is running right now.
 *
 * The identity function outside a run, which is what keeps every menu, the
 * loadout screen and the tower drawer on the original art without knowing a
 * skin exists.
 */
export function activeSkinnedSprite(key: string): string {
  return skinnedSprite(key, activeLevelId)
}

/**
 * The skinned keys a level needs loading, or none at all.
 *
 * `LevelArt.levelArtKeys` adds these to what a level asks for, so a board
 * wearing a skin pays for the skin and a board that is not pays nothing. Only
 * keys whose file is in the manifest are returned, for the same reason
 * `skinnedSprite` falls back: the loader must never be handed a key that has
 * no path.
 */
export function skinArtForLevel(levelId: string | null | undefined): string[] {
  const name = skinForLevel(levelId)
  if (name === null) return []
  return Object.values(SKINS[name]?.keys ?? {}).filter((k) => k in art.files)
}

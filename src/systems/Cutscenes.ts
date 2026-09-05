// Which comic plays before which level, and whether it has been seen.
//
// Phaser-free on purpose, like the other systems modules: which panels a level
// has, what counts as seen, and whether the data names a level that exists are
// all decidable without a scene, and the tests read them directly.
//
// THE SCENE IS THIN AND THIS IS WHERE THE RULES ARE. CutsceneScene draws panels
// and counts taps; everything about WHEN a cutscene plays, what order the
// panels come in and when the seen flag is written lives here.

import cutsceneData from '../data/cutscenes.json' with { type: 'json' }
import artData from '../data/art.json' with { type: 'json' }
import { LEVELS } from './Levels.ts'
import { loadSave, writeSave } from './Save.ts'

const DATA = cutsceneData as unknown as { levels: Record<string, string[]> }
const ASSET_ROOT = (artData as unknown as { assetRoot: string }).assetRoot

/** The panels a level opens with, in order. Empty for a level with no comic. */
export function panelsFor(levelId: string): string[] {
  return DATA.levels[levelId] ?? []
}

/** Every level that has a cutscene at all. */
export function levelsWithCutscenes(): string[] {
  return Object.keys(DATA.levels)
}

/** The URL a panel loads from: the asset root plus its path, the same way
 *  ArtLoader resolves art.json's files. */
export function panelUrl(path: string): string {
  return `${ASSET_ROOT}${path}`
}

/**
 * The texture key a panel is loaded under.
 *
 * Derived from the path rather than authored, so adding a panel is one line in
 * cutscenes.json and never a second line anywhere else.
 */
export function panelKey(path: string): string {
  return `cutscene:${path}`
}

/** True once this level's comic has been watched or skipped. */
export function hasSeen(levelId: string): boolean {
  return loadSave().seenCutscenes.includes(levelId)
}

/**
 * Whether a run on this level should open with its comic.
 *
 * A level with no entry never has one, and a level whose comic has been seen
 * does not replay it — which is what makes the level select's replay control a
 * separate path rather than a flag on this one.
 */
export function shouldPlay(levelId: string): boolean {
  return panelsFor(levelId).length > 0 && !hasSeen(levelId)
}

/**
 * Marks a level's comic seen. Every other save field is preserved.
 *
 * WRITTEN WHEN THE COMIC IS OVER, not when it starts: a player who closed the
 * tab on panel two should get it again, and one who pressed Skip should not.
 * Both of those are the same rule -- the flag records that the comic REACHED
 * ITS END, however it got there.
 */
export function markSeen(levelId: string): void {
  const save = loadSave()
  if (save.seenCutscenes.includes(levelId)) return
  writeSave({ ...save, seenCutscenes: [...save.seenCutscenes, levelId] })
}

/** Forgets every seen flag, so every comic plays again. The developer control
 *  on the diagnostics screen; nothing in normal play calls it. */
export function forgetAllCutscenes(): void {
  writeSave({ ...loadSave(), seenCutscenes: [] })
}

/**
 * What is wrong with cutscenes.json, as a list of sentences. Empty means fine.
 *
 * CHECKED RATHER THAN TRUSTED because every one of these is silent until a
 * player hits it. A key that is not a level id is a comic that never plays and
 * says nothing about it; an empty list is a cutscene that would be marked seen
 * without a panel ever being drawn; a panel path outside the cutscenes folder
 * would 404 at the moment the player pressed BEGIN.
 *
 * The python map checkers cannot do this one -- they read a painted plate, and
 * this is data about data -- so it is here, and a test fails the build on it.
 */
export function cutsceneProblems(): string[] {
  const problems: string[] = []
  const known = new Set(LEVELS.map((l) => l.id))
  for (const [id, panels] of Object.entries(DATA.levels)) {
    if (!known.has(id)) {
      problems.push(
        `cutscenes.json has panels for "${id}", which is not a level in levels.json ` +
        `(${[...known].join(', ')})`)
      continue
    }
    if (!Array.isArray(panels) || panels.length === 0) {
      problems.push(`${id}'s cutscene has no panels, so it would be marked seen without playing`)
      continue
    }
    for (const p of panels) {
      if (typeof p !== 'string' || !p.startsWith('cutscenes/')) {
        problems.push(`${id} names a panel "${p}" outside the cutscenes folder`)
      }
    }
    if (new Set(panels).size !== panels.length) {
      problems.push(`${id} shows the same panel twice`)
    }
  }
  return problems
}

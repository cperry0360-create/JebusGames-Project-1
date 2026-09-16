// Which comic plays before a level, after one, and between two of its waves.
//
// Phaser-free on purpose, like the other systems modules: which panels a level
// has, and whether the data names a level that exists, are both decidable
// without a scene, and the tests read them directly.
//
// A CUTSCENE PLAYS EVERY TIME ITS LEVEL STARTS. It used to play once and then
// be suppressed by a `seenCutscenes` list in the save, which cost a save field,
// a replay badge on the level select, a developer control to clear the flags,
// and a rule about exactly when the flag was written. Skip is one tap, so the
// replay it was all protecting against costs a player almost nothing -- and
// the four mechanisms protecting them from it cost more than that to keep
// correct. `shouldPlay` is now the same question as "does this level have a
// comic".
//
// THE SCENE IS THIN AND THIS IS WHERE THE RULES ARE. CutsceneScene draws panels
// and counts taps; everything about WHEN a cutscene plays, what order the
// panels come in and when the seen flag is written lives here.
//
// THREE MAPS, NOT ONE WITH FLAGS ON IT. `levels` is what plays BEFORE a level,
// `outros` is what plays when one is WON, and `midWave` is what plays BETWEEN
// two of its waves. Every reader of `levels` -- CutsceneScene's `init`,
// `shouldPlay`, the loadout hand-over -- means exactly the first of those, and
// the second and third are not things a list can also say. The cost of a third
// map is one lookup; the cost of overloading the first is every one of those
// readers having to ask which kind it got.

import cutsceneData from '../data/cutscenes.json' with { type: 'json' }
import artData from '../data/art.json' with { type: 'json' }
import { LEVELS, loadLevel } from './Levels.ts'

const DATA = cutsceneData as unknown as {
  levels: Record<string, string[]>
  outros?: Record<string, string[]>
  midWave?: Record<string, Record<string, string[]>>
  _unplaced?: Record<string, { source: string; was: string; shows: string }>
  _retired?: { files: string[] }
}
const ASSET_ROOT = (artData as unknown as { assetRoot: string }).assetRoot

/** The panels a level opens with, in order. Empty for a level with no comic. */
export function panelsFor(levelId: string): string[] {
  return DATA.levels[levelId] ?? []
}

/**
 * The panels a level CLOSES with, in order. Empty for a level with no outro.
 *
 * A SECOND MAP RATHER THAN A FLAG ON THE FIRST, because the two answer
 * different questions and one list cannot. `levels` is "what plays before this
 * level starts" and every consumer of it -- CutsceneScene's `init`,
 * `shouldPlay`, LoadoutScene's hand-over -- reads it as exactly that. Level 9
 * ends by opening the way to level 10, and that panel is neither level 9's
 * opening nor, while level 10 has no row in levels.json, anything level 10 can
 * carry.
 *
 * Held to the same rules as `levels` by `cutsceneProblems`: a known level, a
 * non-empty list, panels under `cutscenes/`, no repeats.
 */
export function outroPanelsFor(levelId: string): string[] {
  return DATA.outros?.[levelId] ?? []
}

/**
 * The comic that plays between wave `wave` and the one after it, in order.
 *
 * `wave` is ONE-BASED -- the number the HUD shows -- so `midWavePanelsFor
 * ('level4', 6)` is the comic that plays once wave 6 is cleared and before
 * wave 7 spawns. Empty for every other boundary, which is almost all of them.
 *
 * A THIRD MAP RATHER THAN A SHAPE ON THE FIRST TWO, for the reason `outros`
 * is a second one: these answer different questions and a list cannot. A
 * level's opening, its ending and its interruptions are three independent
 * facts, and every reader of `levels` means "before this level starts".
 */
export function midWavePanelsFor(levelId: string, wave: number): string[] {
  return DATA.midWave?.[levelId]?.[String(wave)] ?? []
}

/** Every wave of `levelId` that has a comic after it, ascending. */
export function midWaveWaves(levelId: string): number[] {
  return Object.keys(DATA.midWave?.[levelId] ?? {})
    .map(Number).filter((n) => Number.isInteger(n)).sort((a, b) => a - b)
}

/** Every level that interrupts itself with a comic at all. */
export function levelsWithMidWaveCutscenes(): string[] {
  return Object.keys(DATA.midWave ?? {})
}

/**
 * The comics that exist and play nowhere, by name.
 *
 * NAMED SO AN UNREFERENCED-ASSET SWEEP CANNOT EAT THEM. `eda11dc` took
 * fourteen tower WebPs out of public/ for being unreferenced while the branch
 * that needed them was open, and the merge silently did not put them back --
 * CLAUDE.md carries the write-up as a standing fact. A file named here is
 * referenced, and a test checks each one is still on disk.
 */
export function unplacedComics(): Array<{ id: string; source: string; was: string; shows: string }> {
  return Object.entries(DATA._unplaced ?? {}).map(([id, v]) => ({ id, ...v }))
}

/** The retired panels, kept out of the deploy but not deleted. */
export function retiredPanels(): string[] {
  return DATA._retired?.files ?? []
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

/**
 * Whether a run on this level should open with its comic.
 *
 * A level with no entry in cutscenes.json has no comic; every level that has
 * one plays it on every start. There is deliberately no second condition:
 * this used to also ask whether the comic had been seen, and that one extra
 * clause is what the save field, the replay badge and the developer reset
 * control all existed to serve.
 */
export function shouldPlay(levelId: string): boolean {
  return panelsFor(levelId).length > 0
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
  // BOTH MAPS, through one loop. `outros` is checked by exactly the rules
  // `levels` is, because every way it can be wrong is a way `levels` can be
  // wrong and the failure is as silent: a key that is not a level is a comic
  // nothing plays, and a path outside cutscenes/ is a 404 at the moment the
  // player has just won.
  const entries = [
    ...Object.entries(DATA.levels).map((e) => [...e, 'cutscene'] as const),
    ...Object.entries(DATA.outros ?? {}).map((e) => [...e, 'outro'] as const),
    // AND THE MID-WAVE SCHEDULE, flattened to the same shape. Every way a
    // wave-keyed list can be wrong is a way `levels` can be wrong, plus one
    // more -- the wave number itself -- which is checked separately below.
    ...Object.entries(DATA.midWave ?? {}).flatMap(([id, byWave]) =>
      Object.entries(byWave ?? {}).map(([w, panels]) =>
        [id, panels, `wave ${w} cutscene`] as const)),
  ]
  for (const [id, panels, kind] of entries) {
    if (!known.has(id)) {
      problems.push(
        `cutscenes.json has ${kind} panels for "${id}", which is not a level in levels.json ` +
        `(${[...known].join(', ')})`)
      continue
    }
    if (!Array.isArray(panels) || panels.length === 0) {
      problems.push(`${id}'s ${kind} has an empty panel list, so it would open a comic with nothing in it`)
      continue
    }
    for (const p of panels) {
      if (typeof p !== 'string' || !p.startsWith('cutscenes/')) {
        problems.push(`${id}'s ${kind} names a panel "${p}" outside the cutscenes folder`)
      }
    }
    if (new Set(panels).size !== panels.length) {
      problems.push(`${id}'s ${kind} shows the same panel twice`)
    }
  }

  // THE WAVE NUMBER, which is the one thing only this map can get wrong.
  //
  // A comic keyed to a wave the level does not have never plays and never says
  // so -- the exact silence every other rule here exists to break. And the LAST
  // wave is the same failure wearing a valid number: clearing it ends the run,
  // so `checkWaveOver` takes the run-ends branch and the boundary this comic
  // was scheduled on is never reached.
  for (const [id, byWave] of Object.entries(DATA.midWave ?? {})) {
    if (!known.has(id)) continue
    let waves = 0
    try {
      waves = loadLevel(id).waveTable.waves.length
    } catch {
      // A level whose map or wave table will not load is another test's
      // problem; it is not evidence about this file.
      continue
    }
    for (const key of Object.keys(byWave ?? {})) {
      const n = Number(key)
      if (!Number.isInteger(n) || n < 1) {
        problems.push(`${id} schedules a cutscene after wave "${key}", which is not a wave number`)
      } else if (n > waves) {
        problems.push(`${id} schedules a cutscene after wave ${n}, and it only has ${waves} waves`)
      } else if (n === waves) {
        problems.push(
          `${id} schedules a cutscene after wave ${n}, its LAST wave -- clearing it ends the run, `
          + 'so that boundary never comes')
      }
    }
  }
  return problems
}

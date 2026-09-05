/**
 * Everything that outlives a run.
 *
 * Only settings so far. It is deliberately tiny and deliberately total: read
 * once, write on change, and never throw. localStorage is unavailable in a
 * private window and in some embedded contexts, and a game that will not boot
 * because it could not remember a volume slider is a worse game than one that
 * forgets it.
 */

const KEY = 'courjahan.save.v1'

/** The three things the player can set the level of, independently. */
export type Channel = 'sfx' | 'music' | 'voice'

export interface SaveData {
  /**
   * Sound-effects volume, 0 to 1.
   *
   * Named `volume` because that is what it was when it was the only one, and
   * renaming a saved key throws away every player's setting for the sake of a
   * tidier name.
   */
  volume: number
  /** Music volume, 0 to 1. Separate, because music is the one thing a player
   *  turns down without wanting to lose the game's own sounds. */
  musicVolume: number
  /** Voice-line volume, 0 to 1. */
  voiceVolume: number
  muted: boolean
  /**
   * How many runs have been cleared, ever.
   *
   * The Server Nuke is meant to be a reward for finishing the game once, and
   * this is the only thing standing between a first-time player and it. Kept
   * as a count rather than a flag so a later unlock can ask for more than one.
   */
  runsCleared: number
  /**
   * Banner Points banked across every run ever played, won or lost.
   *
   * Nothing spends them yet — the Banner tree is Phase 2. They accrue now so
   * that the total on the results screen is a real number with a history
   * behind it on the day there is something to spend it on, rather than a
   * counter that starts at zero the moment the tree ships.
   */
  bannerPoints: number
  /**
   * The last crash report, as text.
   *
   * Kept in the save so it survives the reload that a freeze or an error
   * forces. Without this the evidence is gone by the time anyone can be told
   * about it, which is exactly how the boss-fight freeze was reported with
   * nothing attached.
   */
  lastReport: string
  /**
   * FEATURE FLAG: the new control drawer instead of the build ring.
   *
   * Off by default, and TEMPORARY SCAFFOLDING. It exists so the two can be
   * compared on the same device minutes apart rather than argued about from
   * memory, and when the comparison is settled one of the two paths is
   * deleted and this field goes with it.
   *
   * It lives in the save beside the volume channels because it is the same
   * kind of thing — a preference the player set, which should survive a
   * reload — and because a build-time flag cannot be compared minutes apart.
   */
  controlDrawer: boolean
  /**
   * Level ids whose opening comic has been watched or skipped.
   *
   * A list rather than a count, because "have I seen level 2's" is the
   * question and a number cannot answer it. It lives here beside
   * `runsCleared` for the same reason that does: it is a fact about the
   * player rather than about a run, and it has to survive one.
   */
  seenCutscenes: string[]
  /**
   * The hero the player last chose, preselected on the next run.
   *
   * An empty string means they never have, and the roster resolves that to
   * the default -- which is Cory, so a save from before the row existed plays
   * exactly the game it always did.
   */
  heroId: string
}

export const DEFAULT_SAVE: SaveData = {
  volume: 0.7, musicVolume: 1, voiceVolume: 1,
  muted: false, runsCleared: 0, bannerPoints: 0, lastReport: '',
  controlDrawer: false, seenCutscenes: [], heroId: '',
}

/** localStorage is small and shared; a report is truncated rather than
 *  allowed to fill it and start throwing on every write. */
export const MAX_REPORT_CHARS = 12000

function count(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0
}

function clamp01(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.max(0, Math.min(1, v))
    : fallback
}

export function loadSave(): SaveData {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (!raw) return { ...DEFAULT_SAVE }
    const parsed = JSON.parse(raw) as Partial<SaveData>
    return {
      volume: clamp01(parsed.volume, DEFAULT_SAVE.volume),
      // Both default to full rather than to the old single value. A save
      // written before there were three sliders has one number in it, and it
      // was the SFX slider — reusing it for music would silently move the
      // music balance for everyone who had ever touched the old control.
      musicVolume: clamp01(parsed.musicVolume, DEFAULT_SAVE.musicVolume),
      voiceVolume: clamp01(parsed.voiceVolume, DEFAULT_SAVE.voiceVolume),
      muted: parsed.muted === true,
      runsCleared: count(parsed.runsCleared),
      bannerPoints: count(parsed.bannerPoints),
      lastReport: typeof parsed.lastReport === 'string'
        ? parsed.lastReport.slice(0, MAX_REPORT_CHARS)
        : '',
      // `=== true` rather than a truthy check: a save written before the flag
      // existed has `undefined` here, and the default is OFF.
      controlDrawer: parsed.controlDrawer === true,
      // Validated element by element, not trusted for being an array. A save
      // hand-edited or written by an older build can hold anything here, and a
      // non-string in the list would compare false against every level id
      // forever -- a comic that silently never plays again.
      // A string or nothing. Validated rather than trusted for the same reason
      // the cutscene list is: a save can hold anything, and a hero id that is
      // not a hero resolves to the default at the point of use rather than
      // being repaired here -- one place decides what an unknown id means.
      heroId: typeof parsed.heroId === 'string' ? parsed.heroId : '',
      seenCutscenes: Array.isArray(parsed.seenCutscenes)
        ? [...new Set(parsed.seenCutscenes.filter((v): v is string => typeof v === 'string'))]
        : [],
    }
  } catch {
    // Unreadable, unparseable or unavailable: start fresh rather than fail.
    return { ...DEFAULT_SAVE }
  }
}

export function writeSave(data: SaveData): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(data))
  } catch {
    // Storage full, blocked, or absent. The setting still applies this session.
  }
}

/** True once the player has finished a run, which is what unlocks the nuke. */
export function hasClearedARun(): boolean {
  return loadSave().runsCleared > 0
}

/** Called when a run is won. Every other field is preserved. */
export function recordRunCleared(): void {
  const save = loadSave()
  writeSave({ ...save, runsCleared: save.runsCleared + 1 })
}

/** Banks a run's Banner Points and returns the new lifetime total, which is
 *  the number the results screen shows. Negative and fractional awards are
 *  refused rather than banked. */
export function addBannerPoints(earned: number): number {
  const save = loadSave()
  const total = save.bannerPoints + count(earned)
  writeSave({ ...save, bannerPoints: total })
  return total
}

/** Every Banner Point banked so far. */
export function bannerTotal(): number {
  return loadSave().bannerPoints
}

/** Keeps a crash report across a reload. Every other field is preserved. */
export function rememberReport(text: string): void {
  const save = loadSave()
  writeSave({ ...save, lastReport: text.slice(0, MAX_REPORT_CHARS) })
}

/** The last crash report, or an empty string if nothing has gone wrong. */
export function storedReport(): string {
  return loadSave().lastReport
}

export function clearStoredReport(): void {
  const save = loadSave()
  writeSave({ ...save, lastReport: '' })
}

/* ------------------------------------------------------------ the flag */

/**
 * Whether the new control drawer replaces the build ring, right now.
 *
 * Read at the moment it is needed rather than cached, so toggling it in the
 * settings dialog takes effect without restarting the run — which is the
 * whole point of a runtime flag: the two can be compared on the same device
 * minutes apart, on the same board, with the same peanuts.
 */
export function controlDrawerOn(): boolean {
  return loadSave().controlDrawer
}

export function setControlDrawer(on: boolean): void {
  writeSave({ ...loadSave(), controlDrawer: on })
}

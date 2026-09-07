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
   * The hero the player last chose, preselected on the next run.
   *
   * An empty string means they never have, and the roster resolves that to
   * the default -- which is Cory, so a save from before the row existed plays
   * exactly the game it always did.
   */
  heroId: string
  /**
   * WHICH LEVELS HAVE BEEN BEATEN, by id.
   *
   * The field `runsCleared` could never be. It counts runs and not which
   * levels they were on, so `isLevelCleared` had to DERIVE an answer -- a
   * level counted as beaten once enough runs had been cleared to open the one
   * after it -- and clearing level 1 three times therefore marked levels 1, 2
   * and 3 beaten and opened level 4. `Levels.isLevelCleared` carried that as a
   * documented limitation and levels.json carried two more notes about raising
   * a threshold to work around it. This is the new save field those notes said
   * fixing it properly would take.
   *
   * `runsCleared` STAYS. It is what unlocks the Server Nuke -- "you have
   * finished a run" is a genuinely different question from "you have beaten
   * this level" -- and it is a lifetime counter that a per-level list cannot
   * reproduce, since a level beaten twice is one entry here and two runs there.
   *
   * Order is the order they were first beaten. Nothing reads the order, but a
   * list that is appended to is trivially inspectable in a bug report, and a
   * Set would not survive `JSON.stringify` at all.
   */
  clearedLevels: string[]
  /**
   * The difficulty every run is played on.
   *
   * GLOBAL, NOT PER LEVEL. A per-level setting would mean a campaign played
   * across three difficulties with no single answer to "how are you finding
   * it", and it would have to be shown on every node of the world map to be
   * honest about itself. One setting, changed on the level select screen,
   * fixed for the length of a level once it has started.
   *
   * An empty string means the player has never chosen, and
   * `resolveDifficultyId` turns that into the default -- which multiplies
   * everything by 1, so a save from before this existed plays exactly the game
   * it always did.
   */
  difficultyId: string
  /**
   * THE BEST CAKE COUNT EACH LEVEL HAS EVER PAID, and what it was earned on.
   *
   * Keyed by level id. A better result overwrites; a worse one does not — a
   * player who three-caked level 2 and then replayed it badly has still
   * three-caked level 2, and a record that could go down would make replaying
   * a finished level a risk instead of a reason.
   *
   * The difficulty id rides along because "three cakes" means something
   * different on Lazy Dad Mode than on Try Hard and the map node says which.
   * It is the difficulty of the run that SET the record, not the current
   * setting, which is why it is stored beside the count rather than looked up.
   *
   * CAKES EARNED ON ANY DIFFICULTY COUNT. The comparison is on the count alone
   * and never on the mode — ranking modes here would mean a Lazy Dad three
   * silently refusing to record, which is a save quietly disagreeing with the
   * screen that just congratulated the player.
   *
   * A plain object rather than a Map: this is written straight through
   * `JSON.stringify`, and a Map serialises to `{}`.
   */
  cakes: Record<string, CakeRecord>
}

/** One level's best result. */
export interface CakeRecord {
  count: number
  /** The difficulty the record was set on. '' on a record from a save written
   *  before difficulty existed. */
  difficultyId: string
}

export const DEFAULT_SAVE: SaveData = {
  volume: 0.7, musicVolume: 1, voiceVolume: 1,
  muted: false, runsCleared: 0, bannerPoints: 0, lastReport: '',
  controlDrawer: false, heroId: '', clearedLevels: [], difficultyId: '', cakes: {},
}

/** localStorage is small and shared; a report is truncated rather than
 *  allowed to fill it and start throwing on every write. */
export const MAX_REPORT_CHARS = 12000

function count(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0
}

/**
 * Which levels a save says have been beaten, MIGRATING one that predates the
 * field.
 *
 * An older save has `runsCleared: N` and no list, and the answer it used to
 * give was derived: level i counted as beaten once enough runs had been
 * cleared to open level i+1, and the thresholds were 0, 1, 2, 3. That makes
 * level i beaten exactly when N > i, which is exactly "the first N levels".
 * So a player who had cleared three runs keeps levels 1, 2 and 3 marked and
 * finds level 4 open, which is what that save already showed them.
 *
 * It is not a perfect reconstruction and it cannot be -- the information was
 * never recorded, which is the whole reason for the field. Somebody who
 * cleared level 1 three times is credited with levels 2 and 3 they never
 * played. That is what the old model already believed and already unlocked, so
 * the migration takes nothing away from anyone; it just stops the belief
 * getting any more wrong from here.
 *
 * Entries are kept as written rather than checked against the level registry.
 * A level that was renamed leaves a dead id, and a dead id gates nothing and
 * unlocks nothing -- whereas dropping unknown ids would mean a save touched by
 * a build with an extra level silently loses that level's progress.
 */
function clearedFrom(parsed: Partial<SaveData>): string[] {
  const listed = parsed.clearedLevels
  if (Array.isArray(listed)) {
    const out: string[] = []
    for (const v of listed) if (typeof v === 'string' && v !== '' && !out.includes(v)) out.push(v)
    return out
  }
  return MIGRATION_ORDER.slice(0, count(parsed.runsCleared))
}

/**
 * The level order the migration above reads, oldest first.
 *
 * A LITERAL, AND DELIBERATELY NOT `LEVELS.map(l => l.id)`. This module must
 * not import the level registry -- Save is read by everything and Levels
 * imports every map and wave table in the game -- and, more importantly, a
 * migration describes the PAST. It has to keep meaning the same thing after a
 * level is inserted, renamed or reordered, and a live registry would quietly
 * re-migrate every old save differently the day that happened.
 */
const MIGRATION_ORDER = ['level1', 'level2', 'level3', 'level4']

/**
 * The cake records a save holds, cleaned rather than trusted.
 *
 * THERE IS NO MIGRATION AND THERE CANNOT BE. A save from before cakes existed
 * knows which levels were beaten and nothing whatever about how many lives
 * were left when they were, and a guess would put a number on a map node that
 * the player never earned. So an older save arrives with no records, its map
 * nodes show empty cakes, and one replay of a level it has already beaten
 * fills them in. That is a smaller lie than crediting three cakes to a run
 * nobody watched.
 *
 * Unlike `clearedFrom`, a record for an unknown level is DROPPED rather than
 * kept: a dead entry in `clearedLevels` gates nothing, but a dead cake record
 * is a row in a table the world map iterates and would be carried forever with
 * nothing able to show or clear it.
 */
function cakesFrom(parsed: Partial<SaveData>): Record<string, CakeRecord> {
  const raw = parsed.cakes
  const out: Record<string, CakeRecord> = {}
  if (raw === null || typeof raw !== 'object') return out
  for (const [id, rec] of Object.entries(raw as Record<string, unknown>)) {
    if (id === '' || rec === null || typeof rec !== 'object') continue
    const n = count((rec as CakeRecord).count)
    if (n <= 0) continue
    const mode = (rec as CakeRecord).difficultyId
    out[id] = { count: n, difficultyId: typeof mode === 'string' ? mode : '' }
  }
  return out
}

function clamp01(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.max(0, Math.min(1, v))
    : fallback
}

/**
 * Reads the save, field by field.
 *
 * IT NAMES EVERY FIELD IT WANTS AND COPIES NOTHING ELSE, which is what makes a
 * retired field a non-event: `seenCutscenes` was here until cutscenes started
 * playing every time, and a save written by an older build still carries it.
 * That save loads exactly as before -- the key is simply not read, no
 * validation runs against it, and the next `writeSave` drops it. A loader that
 * spread `parsed` would have had to be taught to forget it instead.
 */
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
      // A string or nothing. Validated rather than trusted, because a save can
      // hold anything: a hero id that is not a hero resolves to the default at
      // the point of use rather than being repaired here, so one place decides
      // what an unknown id means.
      heroId: typeof parsed.heroId === 'string' ? parsed.heroId : '',
      clearedLevels: clearedFrom(parsed),
      // Validated as a string and no further, like `heroId`: an id that is not
      // a mode resolves to the default at the point of use rather than being
      // repaired here.
      difficultyId: typeof parsed.difficultyId === 'string' ? parsed.difficultyId : '',
      cakes: cakesFrom(parsed),
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

/**
 * Called when a run is won: the lifetime counter, and the level itself.
 *
 * TWO FACTS, ONE WRITE. `runsCleared` is the lifetime count the Server Nuke
 * unlock asks about; `clearedLevels` is what opens the next level. They are
 * recorded together because they are recorded at the same moment, and two
 * calls is two chances for one of them to be forgotten on a new code path.
 *
 * The level id is optional so a caller that genuinely has no level -- there is
 * none today, but a future endless mode would -- still banks the run.
 */
export function recordRunCleared(levelId?: string): void {
  const save = loadSave()
  const cleared = levelId && !save.clearedLevels.includes(levelId)
    ? [...save.clearedLevels, levelId]
    : save.clearedLevels
  writeSave({ ...save, runsCleared: save.runsCleared + 1, clearedLevels: cleared })
}

/**
 * Banks a level's cake count if it beats what is already there.
 *
 * Returns what the level now stands at, so the caller can show the record
 * rather than re-reading the save to find out.
 *
 * BETTER OVERWRITES, WORSE DOES NOT, and equal does not either — re-recording
 * an equal count would rewrite the difficulty id, quietly demoting a Try Hard
 * three-cake to whatever the player last played on.
 */
export function recordCakes(levelId: string, count_: number, difficultyId: string): number {
  const save = loadSave()
  const had = save.cakes[levelId]?.count ?? 0
  const earned = count(count_)
  if (levelId === '' || earned <= had) return had
  writeSave({
    ...save,
    cakes: { ...save.cakes, [levelId]: { count: earned, difficultyId } },
  })
  return earned
}

/** Every level's best cake count, keyed by level id. */
export function cakeRecords(): Record<string, CakeRecord> {
  return loadSave().cakes
}

/** One level's best, or zero if it has never paid out. */
export function cakesEarned(levelId: string): number {
  return loadSave().cakes[levelId]?.count ?? 0
}

/** The levels beaten so far, in the order they were first beaten. */
export function clearedLevels(): string[] {
  return loadSave().clearedLevels
}

/**
 * The chosen difficulty, or '' if the player has never picked one.
 *
 * Deliberately NOT resolved here. This module must not import Difficulty --
 * it is read by everything and a save that could not load because a
 * difficulty file was malformed would be a game that could not boot -- and
 * resolving in one place at the point of use is the rule `heroId` already
 * follows.
 */
export function savedDifficulty(): string {
  return loadSave().difficultyId
}

/** Remembers the difficulty. Every other field is preserved. */
export function setDifficulty(id: string): void {
  writeSave({ ...loadSave(), difficultyId: id })
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

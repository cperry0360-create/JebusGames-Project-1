import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const url = (p: string) => new URL(p, import.meta.url)
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')
/**
 * The same file with its comments taken out.
 *
 * Needed by the two "this name is gone" checks below, and for the reason the
 * repository already strips comments elsewhere: the notes explaining what
 * `runsClearedToUnlock` was and quoting the caption it produced are the
 * comments doing their job. A check that failed on them would be a check that
 * can only pass once the record of why the change happened is deleted.
 */
const code = (p: string): string => src(p)
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

/**
 * A localStorage that lives in this process, so the save can be driven.
 *
 * Save.ts reads `globalThis.localStorage` at the moment it is needed rather
 * than caching a reference, which is what makes this possible at all — and it
 * does that because a real browser can take the API away (a private window),
 * not for testability. Installed once for the whole file; every test that uses
 * it seeds the key it wants first, because tests in one file share a process.
 */
const KEY = 'courjahan.save.v1'
const store = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) },
}

const { loadSave, recordRunCleared, DEFAULT_SAVE } = await import('../src/systems/Save.ts')
const { LEVELS, isLevelUnlocked, nextLevelId, furthestUnlocked }
  = await import('../src/systems/Levels.ts')

const seed = (raw: unknown): void => {
  if (raw === undefined) store.delete(KEY)
  else store.set(KEY, JSON.stringify(raw))
}

/* ------------------------------------------------------------ the migration */

test('a save from before clearedLevels keeps the progress it already showed', () => {
  // THE OLD MODEL, RECONSTRUCTED. `runsCleared` was the only record, and
  // `isLevelCleared` derived an answer from it: level i counted as beaten once
  // enough runs had been cleared to open level i+1, against thresholds of
  // 0, 1, 2, 3. That makes level i beaten exactly when N > i — the first N
  // levels — and that is what the migration reproduces, so nobody logs in to
  // find the campaign has forgotten them.
  for (const n of [0, 1, 2, 3, 4, 9]) {
    seed({ ...DEFAULT_SAVE, runsCleared: n, clearedLevels: undefined })
    const got = loadSave().clearedLevels
    assert.deepEqual(got, ['level1', 'level2', 'level3', 'level4'].slice(0, n),
      `a save with ${n} cleared runs migrated to ${JSON.stringify(got)}`)
  }
})

test('the migration reproduces exactly the levels the old save had open', () => {
  // Said as the property rather than as the list: whatever the old derivation
  // would have UNLOCKED, the migrated save unlocks too. This is the check that
  // would fail if the level order or the thresholds were ever different from
  // what the migration assumes.
  // LEVEL 5 IS IN THE TABLE EVEN THOUGH THE OLD SAVE FORMAT PREDATES IT, and
  // the entry has to be here rather than defaulted. `?? 0` would say a level
  // added after the migration was written was open at zero cleared runs, which
  // is the whole campaign unlocked for anybody upgrading -- the exact failure
  // `unlockedBy` replaced `runsClearedToUnlock` to prevent. The migration
  // marks the first N levels cleared, so level 5 opens when level 4 is
  // cleared, which is N >= 4.
  // LEVEL 6 IS `Infinity`, AND THAT IS THE POINT OF THE TABLE. `MIGRATION_ORDER`
  // in Save.ts is the literal ['level1'..'level4'] and is frozen on purpose --
  // a migration describes the past, so it does not grow when a level is added.
  // A migrated save therefore never records level 5 as cleared, and level 6 is
  // `unlockedBy: 'level5'`, so no old save can open it however many runs it had
  // cleared. Writing 5 here instead would assert the opposite and fail, which
  // is how this entry was arrived at rather than guessed.
  const oldThresholds: Record<string, number> = {
    level1: 0, level2: 1, level3: 2, level4: 3, level5: 4, level6: Infinity,
  }
  for (let n = 0; n <= 5; n++) {
    seed({ ...DEFAULT_SAVE, runsCleared: n, clearedLevels: undefined })
    const cleared = loadSave().clearedLevels
    for (const l of LEVELS) {
      const wasOpen = n >= (oldThresholds[l.id] ?? 0)
      assert.equal(isLevelUnlocked(l.id, cleared), wasOpen,
        `at ${n} cleared runs ${l.id} was ${wasOpen ? 'open' : 'shut'} and is now the opposite`)
    }
  }
})

test('a save that already has the list is read, not re-migrated', () => {
  // The migration must fire ONCE. A save that has been written by this build
  // carries the list, and re-deriving it from `runsCleared` would overwrite a
  // real record with a guess — and would do it on every single load.
  seed({ ...DEFAULT_SAVE, runsCleared: 9, clearedLevels: ['level3'] })
  assert.deepEqual(loadSave().clearedLevels, ['level3'])
  // An empty list is a record too: somebody who has cleared runs in an endless
  // mode and beaten no level. It must not fall back to the count.
  seed({ ...DEFAULT_SAVE, runsCleared: 4, clearedLevels: [] })
  assert.deepEqual(loadSave().clearedLevels, [])
})

test('a corrupt list is cleaned rather than trusted or thrown away', () => {
  seed({ ...DEFAULT_SAVE, clearedLevels: ['level1', 42, '', 'level1', null, 'level2'] })
  assert.deepEqual(loadSave().clearedLevels, ['level1', 'level2'],
    'junk entries and duplicates survive into the unlock check')
  // NOT a list at all: fall back to the migration, which is the case a save
  // written by an older build actually is.
  seed({ ...DEFAULT_SAVE, runsCleared: 2, clearedLevels: 'level1' })
  assert.deepEqual(loadSave().clearedLevels, ['level1', 'level2'])
})

test('an unknown level id in the save is kept rather than dropped', () => {
  // A level that was renamed leaves a dead id. A dead id gates nothing and
  // unlocks nothing, so keeping it costs nothing — where DROPPING unknown ids
  // would mean a save touched by a build with an extra level silently loses
  // that level's progress the next time it is opened by this one.
  seed({ ...DEFAULT_SAVE, clearedLevels: ['level1', 'level99'] })
  assert.deepEqual(loadSave().clearedLevels, ['level1', 'level99'])
  assert.equal(isLevelUnlocked('level2', loadSave().clearedLevels), true)
})

/* ------------------------------------------------------------- the recording */

test('winning records the run and the level, once each', () => {
  seed(undefined)
  assert.deepEqual(loadSave().clearedLevels, [])
  recordRunCleared('level1')
  assert.equal(loadSave().runsCleared, 1)
  assert.deepEqual(loadSave().clearedLevels, ['level1'])

  // BEATING IT AGAIN COUNTS THE RUN AND NOT THE LEVEL. Both halves matter: the
  // Server Nuke's gate is a lifetime count of runs and has to keep rising,
  // and the unlock list is a set and must not grow duplicates that a `length`
  // somewhere would one day read as progress.
  recordRunCleared('level1')
  assert.equal(loadSave().runsCleared, 2)
  assert.deepEqual(loadSave().clearedLevels, ['level1'])

  recordRunCleared('level2')
  assert.deepEqual(loadSave().clearedLevels, ['level1', 'level2'])
  // No level named: the run still banks. There is no such caller today, but an
  // endless mode would be one and must not corrupt the list to use it.
  recordRunCleared()
  assert.equal(loadSave().runsCleared, 4)
  assert.deepEqual(loadSave().clearedLevels, ['level1', 'level2'])
})

test('beating the campaign in order opens it in order, one at a time', () => {
  seed(undefined)
  for (const [i, l] of LEVELS.entries()) {
    const cleared = loadSave().clearedLevels
    assert.equal(furthestUnlocked(cleared).id, l.id,
      `after beating ${i} levels, START RUN would begin ${furthestUnlocked(cleared).id}`)
    recordRunCleared(l.id)
  }
})

/* ------------------------------------------------- the end-of-level screens */

test('the victory screen offers a way forward, and the defeat screen a way back', () => {
  const game = src('scenes/GameScene.ts')
  const end = /\n {2}(?:private )?endRun\(phase[\s\S]*?\n {2}\}/.exec(game)
  assert.ok(end, 'endRun is gone')
  const body = end[0]

  // A WIN OFFERS FOUR THINGS AND A LOSS THREE. The screen used to offer TRY
  // AGAIN and QUIT TO TITLE on both — which on a win is a dead end: replay
  // this level, or stop playing.
  for (const label of ['NEXT LEVEL', 'REPLAY', 'LEVEL SELECT', 'MAIN MENU']) {
    assert.ok(body.includes(`'${label}'`), `the victory screen does not offer ${label}`)
  }
  assert.ok(body.includes("'RETRY'"), 'the defeat screen does not offer RETRY')
  // The defeat screen must NOT offer a next level: losing does not advance.
  const loss = body.slice(body.indexOf(': ['))
  assert.ok(!/NEXT LEVEL/.test(loss.slice(loss.indexOf('RETRY'))),
    'losing offers a next level')
})

test('NEXT LEVEL goes to the loadout, not back through the world map', () => {
  const game = src('scenes/GameScene.ts')
  const go = /private goToLevel\([\s\S]*?\n {2}\}/.exec(game)
  assert.ok(go, 'there is no next-level route at all')
  assert.match(go[0], /this\.scene\.start\('Loadout'\)/,
    'NEXT LEVEL does not go straight into the next level')
  assert.ok(!/WorldMap/.test(go[0]),
    'NEXT LEVEL routes through the map, so the player has to find the node it just named')
  // The hand goes with the level. The loadout screen only deals when there is
  // none, so a stale hand would follow the player into the next level.
  assert.match(go[0], /openingTowers: \[\], abilities: \[\], reserveTowers: \[\]/,
    'the next level inherits the last one\'s hand')
  // And REPLAY names the level rather than inheriting whatever the run state
  // holds, which can now have been changed by NEXT LEVEL.
  const again = /private tryAgain\([\s\S]*?\n {2}\}/.exec(game)!
  assert.match(again[0], /levelId: this\.level\.id/,
    'REPLAY replays whatever level the run state happens to name')
})

test('the last built level offers LEVEL SELECT instead of a dead NEXT LEVEL', () => {
  // TWENTY ROAD SLOTS, FOUR LEVELS. Past the last one there is nothing to go
  // to, and the button must not point at a COMING SOON node. It is REPLACED
  // rather than disabled: a greyed-out control that cannot say why is a
  // question the screen poses instead of answering.
  assert.equal(nextLevelId(LEVELS[LEVELS.length - 1]!.id), null)

  const game = src('scenes/GameScene.ts')
  const end = /\n {2}(?:private )?endRun\(phase[\s\S]*?\n {2}\}/.exec(game)![0]
  assert.match(end, /const next = won \? nextLevelId\(this\.level\.id\) : null/,
    'the victory screen does not ask whether there IS a next level')
  assert.match(end, /next\s*\n?\s*\?\s*\{ label: 'NEXT LEVEL'/,
    'NEXT LEVEL is offered unconditionally')
  assert.match(end, /More levels coming soon/,
    'nothing tells the player why there is no next level')
  // Not disabled anywhere: `enabled: false` on this panel would be the dead
  // button this is meant to avoid.
  assert.ok(!/NEXT LEVEL[\s\S]{0,80}enabled: false/.test(end),
    'NEXT LEVEL is disabled rather than replaced')
})

test('the world map caption names the level, not a number of runs', () => {
  const map = src('scenes/WorldMapScene.ts')
  const line = /private drawUnlockLine\([\s\S]*?\n {2}\}/.exec(map)
  assert.ok(line, 'the unlock caption is gone')
  assert.match(line[0], /Clear \$\{prereq\.name\.toUpperCase\(\)\} to unlock/,
    'the caption does not name the level that opens this one')
  // The three strings this replaced. "Clear 2 runs" is true of the arithmetic
  // and no use to a player: two runs of WHAT?
  const live = code('scenes/WorldMapScene.ts')
  for (const dead of ['Clear a run', 'runs} to unlock', 'runsClearedToUnlock']) {
    assert.ok(!live.includes(dead), `the world map still says "${dead}"`)
  }
})

test('nothing anywhere still gates on a count of cleared runs', () => {
  // The count itself STAYS — it is what unlocks the Server Nuke, and "you have
  // finished a run" is a different question from "you have beaten this level".
  // What must not come back is a LEVEL gated on it.
  for (const f of ['systems/Levels.ts', 'systems/WorldRoad.ts',
    'scenes/WorldMapScene.ts', 'scenes/TitleScene.ts']) {
    assert.ok(!/runsClearedToUnlock/.test(code(f)),
      `${f} still reads runsClearedToUnlock`)
  }
  const levels = JSON.parse(readFileSync(url('../src/data/levels.json'), 'utf8'))
  for (const l of levels.levels) {
    assert.equal(l.runsClearedToUnlock, undefined, `${l.id} still carries a run threshold`)
  }
  // And the Server Nuke's own gate is untouched.
  assert.match(src('systems/Save.ts'), /export function hasClearedARun/)
})

/* ------------------------------------- the world map falling through to a level */

test('a release the world map never saw the press for cannot start a level', () => {
  /*
   * BUG A, AND IT WAS NEITHER OF THE TWO THINGS IT LOOKED LIKE.
   *
   * Pressing WORLD MAP on the title screen opened a level's loadout instead of
   * the map. Not a pending route and not the save migration: `plateButton`
   * fires on POINTERDOWN, so the title screen hands over on the press, the map
   * builds its road under a finger that is still down, and the RELEASE lands
   * on whatever node the layout has just put beneath it. `dragged` cannot
   * catch that -- a press this scene never saw has travelled zero distance by
   * definition, which reads as a clean tap.
   *
   * It looked intermittent and was not. The map opens scrolled to the furthest
   * unlocked level: on a fresh save the road is clamped at slot one and
   * nothing is under the button; the moment a level is beaten a node is
   * centred exactly where the finger already is.
   */
  const map = src('scenes/WorldMapScene.ts')
  assert.match(map, /private pressedHere = false/, 'the straddle guard is gone')
  assert.match(map, /if \(!this\.pressedHere\) return/,
    'a node acts on a release this screen never saw the press for')
  assert.match(map, /this\.pressedHere = true/, 'nothing ever sets the guard')

  // AND IT IS RESET IN create(), not only at the field. Phaser reuses the
  // scene instance, so a field initialiser runs once in the lifetime of the
  // game; BACK hands over on the press, so the scene shuts down with the flag
  // still true and its delayed clear never fires. Fixing only the first entry
  // left the SECOND one broken, which is how the bug was originally described.
  const create = /\n  create\(\): void \{[\s\S]*?\n  \}/.exec(map)
  assert.ok(create, 'WorldMapScene.create is gone')
  assert.match(create[0], /this\.pressedHere = false/,
    'the gesture state is not reset on re-entry, so the second visit is unguarded')
  assert.match(create[0], /this\.dragged = 0/, 'the drag distance survives a re-entry')
})

test('the world map is a destination, not a router', () => {
  // The prime suspect in the brief was a stored level or a pending route left
  // behind by NEXT LEVEL. There is none, and this is what keeps it that way:
  // the only thing that starts a level from this screen is a tap on a node.
  const map = src('scenes/WorldMapScene.ts')
  const create = /\n  create\(\): void \{[\s\S]*?\n  \}/.exec(map)![0]
  assert.ok(!/scene\.start\('Loadout'\)|scene\.start\('Game'\)/.test(create),
    'the world map routes onward as it opens')
  // NEXT LEVEL sets the run state and goes straight to the loadout. It must
  // not leave anything behind that a later visit to the map could replay.
  const game = src('scenes/GameScene.ts')
  const go = /private goToLevel\([\s\S]*?\n  \}/.exec(game)![0]
  assert.match(go, /this\.scene\.start\('Loadout'\)/, 'NEXT LEVEL no longer opens the loadout')
  assert.ok(!/pending|queued|nextRoute/i.test(go),
    'NEXT LEVEL stores a pending route, which a later screen could replay')
})

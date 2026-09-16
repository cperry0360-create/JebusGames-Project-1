import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/**
 * THE COMIC THAT PLAYS BETWEEN TWO WAVES, and the four promises it makes.
 *
 *   1. The clock genuinely stops -- read either side of it, below.
 *   2. It only fires at a wave boundary with an empty board, and waits if
 *      anything is still walking.
 *   3. Leaving, restarting or losing during one cleans up.
 *   4. The soak runner never sees it at all.
 *
 * WHAT THIS FILE CAN AND CANNOT SEE. No test in this repository imports Phaser
 * -- CLAUDE.md's standing fact -- so `scene.pause()`, which is what actually
 * takes GameScene out of the update list, cannot be executed here. Two things
 * follow. The RULE is tested for real, against the shipping `simDelta` and
 * `midWaveBoundaryOpen` in systems/MidWave.ts, by driving a loop and reading
 * the clock. The WIRING is tested as text, because that is the only thing text
 * can honestly claim -- and the frame is the third leg: `tools/harness/run.sh
 * midwave` is the only thing in this repository that can watch one play.
 */

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

const { simDelta, midWaveBoundaryOpen } = await import('../src/systems/MidWave.ts')
const {
  midWavePanelsFor, midWaveWaves, levelsWithMidWaveCutscenes, cutsceneProblems,
} = await import('../src/systems/Cutscenes.ts')
const { loadLevel, LEVELS } = await import('../src/systems/Levels.ts')

const GAME_SPEED = JSON.parse(src('src/data/rules.json')).pacing.gameSpeed

/* --------------------------------------------------------------- the clock */

/**
 * A stand-in for everything GameScene advances on `dt`.
 *
 * Deliberately a bundle rather than one number: "the clock stopped" is a claim
 * about enemies, towers, cooldowns AND the wave timer, and a gate that reached
 * three of the four would look identical to one that reached all of them at
 * the only resolution a single counter has.
 */
function world() {
  return {
    /** Total simulated seconds. */
    clock: 0,
    /** How far a walker has gone, at one unit per simulated second. */
    enemyAt: 0,
    /** A tower's cooldown, counting down. */
    cooldown: 3,
    /** The spawner's timer for the next group. */
    spawnIn: 2.5,
    /** Real seconds, which keep running: the camera and the shake are on them. */
    real: 0,
    step(realDelta: number, at: { hitPaused: boolean; comicOpen: boolean }) {
      this.real += realDelta
      const dt = simDelta(realDelta, { ...at, gameSpeed: GAME_SPEED })
      this.clock += dt
      this.enemyAt += dt
      this.cooldown -= dt
      this.spawnIn -= dt
      return dt
    },
    reading() {
      return [this.clock, this.enemyAt, this.cooldown, this.spawnIn].join('|')
    },
  }
}

test('the clock is byte-identical either side of a comic, and the real one is not', () => {
  const w = world()
  // Sixty frames of a wave running, so nothing below is measured from zero.
  for (let i = 0; i < 60; i++) w.step(1 / 60, { hitPaused: false, comicOpen: false })

  const before = w.reading()
  const realBefore = w.real
  assert.ok(w.clock > 0, 'the world never started, so stopping it proves nothing')

  // NINE HUNDRED FRAMES OF COMIC -- fifteen seconds, about as long as three
  // panels take to read. Every one of them is served: this is the frame-in
  // -flight case, multiplied, which is the only thing `comicOpen` is for.
  for (let i = 0; i < 900; i++) {
    const dt = w.step(1 / 60, { hitPaused: false, comicOpen: true })
    assert.equal(dt, 0, `frame ${i} of the comic advanced the simulation by ${dt}`)
  }

  assert.equal(w.reading(), before, 'the world moved while the comic was up')
  assert.ok(w.real > realBefore + 14,
    'the real clock stopped too, so the reading proves nothing about the gate')

  // AND IT PICKS UP EXACTLY WHERE IT LEFT OFF, rather than catching up. A gate
  // that banked the skipped time would teleport every enemy on the board the
  // frame the comic closed, which is the hit pause's own failure mode.
  const one = w.step(1 / 60, { hitPaused: false, comicOpen: false })
  assert.ok(Math.abs(one - GAME_SPEED / 60) < 1e-12,
    `the first frame back advanced ${one}, not one frame's worth`)
  assert.ok(Math.abs(w.clock - (Number(before.split('|')[0]) + one)) < 1e-12,
    'the comic banked its frames and paid them out on resume')
})

test('the comic gate and the hit pause are the same expression, not two', () => {
  // Either alone stops it; both together stop it once. A second place that
  // scales a delta is a second place for the simulation and the camera to
  // drift apart, which is why there is one function.
  for (const hitPaused of [false, true]) {
    for (const comicOpen of [false, true]) {
      const dt = simDelta(0.016, { hitPaused, comicOpen, gameSpeed: GAME_SPEED })
      assert.equal(dt, hitPaused || comicOpen ? 0 : 0.016 * GAME_SPEED,
        `hitPaused=${hitPaused} comicOpen=${comicOpen}`)
    }
  }
  // The speed multiplier is applied here and nowhere else on the way through.
  assert.equal(simDelta(1, { hitPaused: false, comicOpen: false, gameSpeed: 1.4 }), 1.4)
})

/* ------------------------------------------------------- the boundary rule */

test('a comic waits for the board rather than opening over it', () => {
  const open = (enemiesAlive: number, phase: string, comicOpen = false) =>
    midWaveBoundaryOpen({ enemiesAlive, phase, comicOpen })

  assert.equal(open(0, 'ready'), true, 'an empty board at a boundary refuses the comic')
  // ANYTHING STILL WALKING HOLDS IT. A wave ends when what it SENT is dead, so
  // a boss's summoned children that do not hold the wave are alive across the
  // boundary -- that is the case this clause is for, and it is not theoretical.
  for (const alive of [1, 2, 40]) {
    assert.equal(open(alive, 'ready'), false, `${alive} enemies did not hold the comic`)
  }
  // And it is a WAVE BOUNDARY, not any quiet moment: mid-wave with the field
  // briefly empty between two spawn groups is not one.
  assert.equal(open(0, 'wave'), false, 'a comic can open in the middle of a wave')
  assert.equal(open(0, 'won'), false, 'a comic can open over a won run')
  assert.equal(open(0, 'lost'), false, 'a comic can open over a lost run')
  // One at a time.
  assert.equal(open(0, 'ready', true), false, 'a second comic can open over the first')
})

/* ------------------------------------------------------------ the schedule */

test('every mid-wave comic lands the wave before its character walks on', () => {
  /*
   * THE WHOLE POINT OF THE FEATURE, checked against the wave tables rather
   * than against the brief that asked for it. A comic that introduces an enemy
   * has to play on the boundary BEFORE that enemy's first spawn; one wave
   * earlier is a stranger arriving, one wave later is an introduction to
   * somebody the player has already killed.
   */
  const introduces: Record<string, [string, number]> = {
    // level:wave -> [enemy, the wave it first spawns on]
    'level3:12': ['unicornBoss', 13],
    'level4:6': ['glitchLich', 7],
    'level9:3': ['hatGtt', 4],
    'level9:7': ['cancer', 8],
    'level9:11': ['noPilot', 12],
    'level9:15': ['perplexed', 16],
  }
  const scheduled: string[] = []
  for (const id of levelsWithMidWaveCutscenes()) {
    for (const w of midWaveWaves(id)) scheduled.push(`${id}:${w}`)
  }
  assert.deepEqual(scheduled.sort(), Object.keys(introduces).sort(),
    'the schedule and the list of introductions have drifted apart')

  for (const [key, [enemy, spawnsOn]] of Object.entries(introduces)) {
    const [id, w] = key.split(':')
    const wave = Number(w)
    assert.equal(wave + 1, spawnsOn,
      `${id}'s ${enemy} comic plays after wave ${wave}, and it spawns on ${spawnsOn}`)

    // AND THE SPAWN WAVE IS READ OFF THE TABLE, not trusted. This is the check
    // the brief asked to be run by hand before wiring; running it here is what
    // stops a later wave-table edit moving an enemy out from under its comic.
    const waves = loadLevel(id!).waveTable.waves
    const firstAt = waves.findIndex((row) => JSON.stringify(row).includes(`"${enemy}"`)) + 1
    assert.equal(firstAt, spawnsOn,
      `${enemy} now first spawns on ${id} wave ${firstAt}, not ${spawnsOn}; `
      + 'move its comic to the wave before')

    // A comic is at least one panel and they are all under cutscenes/.
    const panels = midWavePanelsFor(id!, wave)
    assert.ok(panels.length >= 1, `${key} schedules no panels`)
    for (const p of panels) assert.match(p, /^cutscenes\//, `${key} names ${p}`)
  }
})

test('level 2 and level 10 deliberately have no mid-wave comic', () => {
  /*
   * NOT AN OMISSION. Both final bosses are a boss rather than a mini-boss,
   * both levels already have an opening or an ending, and level 2 is the 53%
   * level where another interruption before the fight that kills everyone is
   * the last thing it needs.
   *
   * LEVEL 10 IS THE ONE WITH A MECHANICAL CONFLICT AS WELL, and it is worth
   * stating rather than implying: its form swap is armed for wave 7 and its
   * float for wave 13, both from `armVlaudeSchedule` which `startWave` calls,
   * and a comic on either boundary would put a panel over a telegraph the
   * player is meant to read.
   */
  assert.deepEqual(midWaveWaves('level2'), [])
  assert.deepEqual(midWaveWaves('level10'), [])
  const game = src('src/scenes/GameScene.ts')
  assert.match(game, /this\.armVlaudeSchedule\(\)/,
    'the level 10 schedule has moved, so this conflict needs re-checking')
})

test('the schedule cannot name a wave the level does not have', () => {
  // The shipped file passes, which is the assertion that fails the build if
  // someone adds a bad key.
  assert.deepEqual(cutsceneProblems(), [])

  // And the rule is real rather than vacuous: every level's LAST wave is
  // rejected, because clearing it ends the run and that boundary never comes.
  for (const l of LEVELS) {
    const waves = loadLevel(l.id).waveTable.waves.length
    assert.ok(waves > 1, `${l.id} has ${waves} waves`)
    for (const w of midWaveWaves(l.id)) {
      assert.ok(w >= 1 && w < waves,
        `${l.id} schedules a comic after wave ${w} of ${waves}`)
    }
  }
})

/* --------------------------------------------------------------- the wiring */

test('the run is paused and given back, rather than restarted', () => {
  const game = src('src/scenes/GameScene.ts')
  const open = game.slice(game.indexOf('private openDueComic()'))
  const body = open.slice(0, open.indexOf('\n  }'))

  // PAUSED BEFORE LAUNCHED. Both scenes: the HUD's START WAVE button would
  // otherwise be pressable through the comic.
  assert.match(body, /this\.scene\.pause\(\)/, 'the run is not paused for the comic')
  assert.match(body, /this\.scene\.pause\('Hud'\)/, 'the HUD is left live under the comic')
  assert.ok(body.indexOf('this.scene.pause()') < body.indexOf("this.scene.launch('Cutscene'"),
    'the comic is launched before the run is paused')
  // LAUNCH, NOT START. `start` would tear this scene down and the run with it.
  assert.match(body, /this\.scene\.launch\('Cutscene'/, 'the comic replaces the run')
  assert.match(body, /resume: \['Game', 'Hud'\]/,
    'the comic is not told to hand the run back')

  // CLAIMED, so the stuck guard leaves it alone. An unowned pause is recovered
  // after six seconds, which is less than three panels take to read.
  assert.match(body, /enterGate\('comic'/, 'the comic pause is unowned')
  const end = game.slice(game.indexOf('private endMidWaveComic('))
  assert.match(end.slice(0, end.indexOf('\n  }')), /leaveGate\('comic'/,
    'the comic gate is never given back')
})

test('the comic is resumed through the one event every hand-back raises', () => {
  const game = src('src/scenes/GameScene.ts')
  // RESUME rather than a callback into the comic: the stuck guard's recovery,
  // the rotate gate lowering and the tab coming forward all resume this scene
  // too, and none of them would call a callback.
  assert.match(game, /Phaser\.Scenes\.Events\.RESUME, \(\) => \{[\s\S]{0,600}endMidWaveComic\('read'\)/,
    'the comic flag is not cleared when the run comes back')
})

test('leaving, restarting or losing during a comic cleans up', () => {
  const game = src('src/scenes/GameScene.ts')
  // SHUTDOWN covers leaving to the title, the world map, the loadout and a
  // scene restart -- every one of them stops this scene, and none of them
  // would otherwise stop the comic sitting on top of it.
  const shutdown = game.slice(game.indexOf("this.events.once('shutdown', () => {\n      // FIRST."))
  assert.match(shutdown.slice(0, 900), /endMidWaveComic\('shutdown'\)/,
    'a run abandoned mid-panel leaves the comic on the glass')
  // And a loss.
  const endRun = game.slice(game.indexOf("endRun(phase: 'won' | 'lost')"))
  assert.match(endRun.slice(0, 900), /endMidWaveComic\('run ended'\)/,
    'the results dialog can open behind a comic panel')

  // The comic scene is STOPPED on those paths rather than left to resume into
  // a scene that no longer exists.
  const end = game.slice(game.indexOf('private endMidWaveComic('))
  assert.match(end.slice(0, end.indexOf('\n  }')), /this\.scene\.stop\('Cutscene'\)/,
    'the comic scene is never stopped')
})

test('every panel texture is handed back when the comic ends', () => {
  /*
   * A LEAK WITH A NUMBER ON IT. A panel is decoded to raw RGBA -- 553x941 is
   * 2.08 MB -- and Phaser's texture manager is global, so before this every
   * panel a session ever looked at stayed resident until the tab died. Level 9
   * now plays fifteen of them in one run.
   *
   * ON SHUTDOWN rather than in the exit, because a comic can also end by being
   * stopped from outside -- the three paths in the test above -- and those do
   * not go through `handOver`.
   */
  const scene = src('src/scenes/CutsceneScene.ts')
  assert.match(scene, /private releaseTextures\(\): void \{[\s\S]{0,400}this\.textures\.remove\(key\)/,
    'the panel textures are never removed')
  assert.match(scene, /Phaser\.Scenes\.Events\.SHUTDOWN, \(\) => this\.releaseTextures\(\)/,
    'the release is not wired to shutdown')
  // EVERY load goes through `claim`, or a panel loaded by one of the three
  // other paths would not be on the list to release.
  assert.equal((scene.match(/this\.load\.image\(/g) ?? []).length, 1,
    'a panel is loaded outside claim(), so its texture is never released')
  assert.match(scene, /private claim\(path: string\): void \{[\s\S]{0,300}this\.load\.image\(/)
})

/* ----------------------------------------------------------------- the soak */

test('the soak runner cannot see a cutscene at all', () => {
  /*
   * "Any pause it cannot clear is an infinite hang, and any pause it CAN clear
   * must still not change a single outcome."
   *
   * IT IS TRUE BY CONSTRUCTION AND THAT IS WORTH PINNING. tools/soak is a
   * headless simulator: it never builds a scene, so there is nothing to pause
   * and nothing to tap through. What could break that is an import -- if the
   * simulator ever reached for Cutscenes.ts, a schedule lookup would be one
   * edit away from a wave boundary that waits for a player who is not there.
   */
  for (const f of ['tools/soak/Sim.ts', 'tools/soak/run.ts', 'tools/soak/level.ts',
    'tools/soak/heroes.ts', 'tools/soak/eli.ts', 'tools/soak/audit.ts']) {
    const code = src(f)
    for (const banned of ['Cutscene', 'MidWave', 'midWave', 'comic']) {
      assert.ok(!code.includes(banned), `${f} reaches for ${banned}`)
    }
  }
  // And the simulator does not import the scene layer at all, which is the
  // property that makes the paragraph above hold for anything added later.
  const sim = src('tools/soak/Sim.ts')
  assert.ok(!/from '.*\/scenes\//.test(sim), 'the simulator imports a scene')
})

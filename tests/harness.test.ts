import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const url = (p: string) => new URL(p, import.meta.url)
const read = (p: string) => readFileSync(url(`../${p}`), 'utf8')

const INDEX = read('tools/harness/index.html')
const SERVER = read('tools/harness/server.py')
const RUN = read('tools/harness/run.sh')

/* ------------------------------------------------- the guard that was missing */

test('a harness scenario that throws cannot report success', () => {
  /*
   * THE MOST EXPENSIVE BUG THIS REPOSITORY HAS HAD, and it was one line.
   *
   *   try { await run() } catch (e) { note('DIRECTOR ERROR: ' + e.message) }
   *
   * A scenario touched a deleted API, threw on its first line, had the throw
   * turned into a log entry nobody read, posted /done as though it had
   * finished, and `run.sh` returned 0. ELEVEN scenarios were in that state at
   * once — `ui`, `rockets`, `regressions`, `poor`, `typegame`, `fx`, `icons`,
   * `phone`, `stun`, `full13` and `buildall` — several of them for weeks,
   * including the only one that plays a run end to end.
   *
   * The whole chain has to hold, so all three links are asserted here: the
   * page records the error, the server exits non-zero for it, and run.sh
   * passes that code on instead of forcing 0.
   */
  assert.match(INDEX, /let directorError = null/,
    'the director no longer records the error it caught')
  assert.match(INDEX, /catch \(e\) \{\s*\n\s*directorError = \{/,
    'a thrown scenario is swallowed again rather than recorded')
  assert.match(INDEX, /scenario, bootFailed: bootBroken, directorError, log,/,
    'the error is recorded but never reaches the report the server reads')

  assert.match(SERVER, /err = rep\.get\('directorError'\)/,
    'the server does not look for a thrown scenario')
  assert.match(SERVER, /sys\.exit\(1\)/, 'a thrown scenario no longer fails the run')
  assert.match(SERVER, /TIMEOUT[\s\S]{0,120}sys\.exit\(2\)/,
    'a scenario that never finishes still passes')

  assert.match(RUN, /STATUS=\$\?/, 'run.sh does not capture the server\'s exit code')
  assert.match(RUN, /exit \$STATUS/, 'run.sh forces its own exit code again')
  assert.ok(!/\nexit 0\s*$/.test(RUN), 'run.sh ends on an unconditional exit 0')
})

test('a harness scenario that finds a fault cannot report success either', () => {
  // The other half. The throw guard stops a scenario passing when it never
  // ran; this stops one passing when it ran and did not like what it saw.
  // The convention was already in the scenarios — a fault is a line beginning
  // '*** ' and a bad run ends on 'RESULT *** n faults ***' — and it was only
  // ever printed. A DISTINCT exit code, because "this check is broken" and
  // "this check works and the product failed it" are different answers.
  assert.match(SERVER, /startswith\('\*\*\* '\) or ln\.startswith\('RESULT \*\*\*'\)/,
    'the server no longer reads the fault convention the scenarios write')
  assert.match(SERVER, /SCENARIO REPORTED FAULTS[\s\S]{0,400}sys\.exit\(5\)/,
    'a scenario that reported faults exits 0 again')
})

/* ------------------------------------------- containment, asserted generally */

test('the containment check covers both menu screens, and both rules', () => {
  /*
   * THE COVERAGE THAT WAS MISSING, and the reason it is general.
   *
   * Three layout bugs reached the live site through green CI: the missing
   * ability art, the tower panel, and the loadout's ability strip drawn on its
   * own panel's bottom border with the second icon clipped by it. Each was
   * found afterwards by a person looking at a picture of one screen, and each
   * fix was specific to that screen -- so the next screen was uncovered again.
   *
   * `screens` cannot catch this class. Its four faults are OFF (past the
   * viewport edge), NOTCH, SMALL and OVER (two things colliding), and "drawn
   * outside the panel it belongs to" is none of them: a chip on its card's
   * bottom rail is inside the viewport, clear of the notch, big enough, and
   * overlapping nothing but a painted frame that is not an audited object.
   *
   * So `contain` asserts two rules that do not know which screen they are on:
   * nothing outside the viewport, no child outside its parent panel. This test
   * is what stops the scenario being deleted, gutted, or quietly narrowed to
   * one screen again -- the exact failure mode the `screens` audit had when it
   * stopped driving the tower panel and nobody noticed for weeks.
   */
  assert.match(INDEX, /if \(scenario === 'contain'\) \{/,
    'the containment scenario is gone')

  // BOTH SCREENS THE BRIEF NAMES. The loadout is checked once per hero,
  // because the heroes no longer describe the same number of things and the
  // three-chip case is the one that escaped its panel.
  assert.match(INDEX, /await checkScene\('Loadout', 'loadout-' \+ hid\)/,
    'the containment check no longer walks the loadout per hero')
  assert.match(INDEX, /await checkScene\('WorldMap', 'worldmap'\)/,
    'the containment check no longer covers the level select screen')

  // BOTH RULES. Either one alone passed on the tree that shipped the bug.
  assert.match(INDEX, /--- 1\. the viewport/, 'the viewport rule is gone')
  assert.match(INDEX, /--- 2\. the panel/, 'the parent-panel rule is gone')

  // AND IT STILL REPORTS FAULTS THE WAY THE SERVER READS THEM, or a scenario
  // that finds everything exits 0 and the check is decoration. See the two
  // tests above for the chain this hangs off.
  assert.match(INDEX, /const fail6 = \(m\) => \{ faults6\+\+; note\('   \*\*\* ' \+ m\) \}/,
    'the containment scenario no longer writes the fault convention')
  assert.match(INDEX, /containment fault\(s\) at ' \+ VP\.w/,
    'the containment scenario no longer ends on a RESULT the server can fail on')
})

/* --------------------------------------------- the deleted UI, still deleted */

test('no scenario drives the build menu or the tower panel', () => {
  /*
   * BOTH CONTROLS ARE GONE. `BuildMenu` became the radial `TowerRing` and
   * `TowerPanel` went with it, and `g.menu` / `g.panel` have been undefined
   * ever since. Every scenario that still reached for one was blind.
   *
   * Matched on CODE only: the comments left behind explain what was removed
   * and why, and a check that failed on them would be a check that can only
   * pass once the record of the repair is deleted.
   */
  const code = INDEX.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '')
  // A REAL REFERENCE, not a substring. `g.ring.panelBounds` contains the
  // characters "g.panel" and a naive `includes` calls the repaired ring
  // scenarios offenders — which is a check that can only be satisfied by
  // renaming working code.
  for (const dead of ['menu', 'panel']) {
    const ref = new RegExp(`(?<![\\w.])[gG]\\.${dead}\\b`)
    const hit = ref.exec(code)
    assert.ok(!hit,
      `a scenario drives g.${dead}, which was deleted with the build menu: ${
        code.slice(Math.max(0, (hit?.index ?? 0) - 60), (hit?.index ?? 0) + 60)}`)
  }
  // And the shared helper that replaced them is still the one way in, so a
  // new scenario cannot hand-roll a build and rot the same way.
  assert.match(INDEX, /async function build\(spotIndex, towerIndex = 0\)/,
    'the shared build() helper is gone; scenarios will hand-roll it again')
  assert.match(INDEX, /if \(!g\.ring\) \{ note\(`build@\$\{spotIndex\}: the ring did not open`\)/,
    'build() no longer reports when the ring refuses to open')
})

test('every scenario the repair touched is still declared', () => {
  // Nine were repaired and two deleted. This is what stops a later pass
  // quietly dropping one of the repaired ones instead of maintaining it.
  for (const s of ['ui', 'rockets', 'regressions', 'typegame', 'fx',
    'phone', 'stun', 'full13', 'buildall', 'towerpanel', 'towerring', 'afford', 'scrim']) {
    assert.ok(INDEX.includes(`scenario === '${s}'`), `the ${s} scenario is gone`)
  }
  // And the two that were deleted stay deleted, with their reasons in place.
  for (const s of ['poor', 'icons']) {
    assert.ok(!INDEX.includes(`scenario === '${s}'`),
      `${s} is back; it was deleted because the control it drove no longer exists`)
  }
  assert.match(INDEX, /`poor` WAS HERE AND IS DELETED/,
    'the note explaining why `poor` went is gone')
  assert.match(INDEX, /`icons` WAS HERE AND IS DELETED/,
    'the note explaining why `icons` went, and what coverage it took, is gone')
})

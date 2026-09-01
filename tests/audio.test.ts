import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const audio = read('audio'), towers = read('towers'), abilities = read('abilities')
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')

test('every cue points at a file that exists', () => {
  for (const [cue, def] of Object.entries(audio.cues) as [string, any][]) {
    const path = `public/${audio.root}${def.file}.${def.format}`
    assert.ok(existsSync(url(`../${path}`)), `cue "${cue}" -> ${path} is missing`)
  }
  assert.ok(Object.keys(audio.cues).length >= 30, 'suspiciously few sounds')
})

test('every cue is mixed and voice-capped', () => {
  for (const [cue, def] of Object.entries(audio.cues) as [string, any][]) {
    assert.ok(def.gain > 0 && def.gain <= 1, `cue "${cue}" has a gain of ${def.gain}`)
    assert.ok(Number.isInteger(def.maxVoices) && def.maxVoices >= 1,
      `cue "${cue}" has no voice cap`)
    // A big wave is the only place this matters, and it is exactly where an
    // uncapped cue turns the mix to mud.
    assert.ok(def.maxVoices <= 4, `cue "${cue}" can stack ${def.maxVoices} deep`)
  }
})

test('every firing tower has its own distinct sound', () => {
  const firing = Object.entries(towers as Record<string, { supportRadius: number }>)
    .filter(([, t]) => t.supportRadius === 0)
    .map(([id]) => id)
  assert.ok(firing.length >= 5, 'expected several firing towers')
  const files = new Set<string>()
  for (const id of firing) {
    const cue = audio.cues[`tower-${id}`]
    assert.ok(cue, `tower "${id}" has no fire sound`)
    files.add(cue.file)
  }
  assert.equal(files.size, firing.length,
    'two towers share a fire sound, so they are indistinguishable in a wave')
})

test('every ability has its own cast sound', () => {
  const files = new Set<string>()
  for (const id of Object.keys(abilities)) {
    const cue = audio.cues[`cast-${id.toLowerCase()}`]
    assert.ok(cue, `ability "${id}" has no cast sound`)
    files.add(cue.file)
  }
  assert.equal(files.size, Object.keys(abilities).length,
    'two abilities share a cast sound')
})

test('the brief\'s whole event list is covered', () => {
  const required = [
    'hit-a', 'death', 'build', 'upgrade', 'broke', 'error',
    'click', 'hover', 'wave-start', 'wave-cleared',
    'life-lost', 'last-life', 'last-stand', 'boss', 'won', 'lost',
  ]
  for (const cue of required) assert.ok(audio.cues[cue], `no cue for "${cue}"`)
})

test('the Last Stand is the loudest thing in the game', () => {
  // It is the hero's one transformation. Nothing should sit above it.
  const ls = audio.cues['last-stand'].gain
  for (const [cue, def] of Object.entries(audio.cues) as [string, any][]) {
    assert.ok(def.gain <= ls, `"${cue}" (${def.gain}) is mixed above the Last Stand (${ls})`)
  }
})

test('losing the last life sounds different from losing one of many', () => {
  assert.notEqual(audio.cues['life-lost'].file, audio.cues['last-life'].file)
  const game = src('scenes/GameScene.ts')
  assert.match(game, /lives <= 0 \? 'last-life' : 'life-lost'/,
    'the last life should pick its own cue')
})

test('volume and mute are persisted, and never throw', () => {
  const save = src('systems/Save.ts')
  assert.match(save, /localStorage/, 'settings are not persisted')
  // A private window has no localStorage. A game that will not boot because it
  // could not remember a volume is worse than one that forgets it.
  const guarded = save.split('try {').length - 1
  assert.ok(guarded >= 2, 'every storage access should be inside a try')
  assert.match(save, /catch/, 'storage failures must be swallowed')
})

test('the audio manager caps voices and survives a blocked context', () => {
  const mgr = src('systems/Audio.ts')
  assert.match(mgr, /claimVoice/, 'no voice limiting')
  assert.match(mgr, /scene\.sound\.locked/, 'a locked audio context should be a no-op')
  assert.match(mgr, /catch/, 'a cue that will not play must not crash the game')
})

test('the CC0 audio is credited', () => {
  assert.match(audio.credit, /Kenney/i)
  assert.match(audio.credit, /CC0|synthesis|synthesised/i)
  const credits = read('credits')
  const roll = JSON.stringify(credits.blocks)
  assert.match(roll, /Kenney/, 'the credits roll should name Kenney for the audio too')
  assert.match(roll, /audio/i, 'the roll should say what Kenney supplied, audio included')
})

// ------------------------------------------------------ leaving and returning

test('no audio call can escape as an unhandled rejection', () => {
  // The tester's crash: iOS suspends the AudioContext when the tab goes to the
  // background, and on return `resume()` rejects with "Failed to start the
  // audio device". Nobody caught it, so the diagnostics — correctly —
  // reported the game as crashed. Sound failing must never do that.
  const audio = src('systems/Audio.ts')
  assert.match(audio, /guardAudioPromises/, 'nothing guards the context promises')
  // Wrapping only our own calls is not enough: Phaser calls context.resume()
  // in its unlock and focus paths with no handler on either.
  assert.match(audio, /proto\[name\] = function guarded/,
    'the guard does not cover calls the engine makes')
  assert.match(audio, /disableAudio\(/, 'a refused device does not disable audio')
  // And `void ctx.resume()` is exactly the shape that started this: void does
  // not catch a rejection.
  assert.ok(!/void ctx\.resume\(\)/.test(audio), 'an unguarded resume is back')
})

test('play is silent rather than loud when the device is gone', () => {
  const audio = src('systems/Audio.ts')
  assert.match(audio, /if \(muted \|\| volume <= 0 \|\| unavailable\) return/,
    'play still tries to sound a cue after the device was refused')
})

test('backgrounding is a state the game enters, not something that happens to it', () => {
  const life = src('systems/Lifecycle.ts')
  for (const evt of ['visibilitychange', 'pagehide', 'pageshow']) {
    assert.ok(life.includes(evt), `nothing listens for ${evt}`)
  }
  // iOS can take the WebGL context too; without preventDefault it never comes
  // back and every draw afterwards throws on a null context.
  assert.match(life, /webglcontextlost/, 'a lost graphics context is unhandled')
  assert.match(life, /e\.preventDefault\(\)/, 'the context loss is not made recoverable')
  assert.match(life, /webglcontextrestored/, 'nothing resumes after a restore')
  // A run the player paused must not be resumed by coming back to the tab.
  assert.match(life, /getScenes\(true\)/,
    'the lifecycle would resume scenes it did not pause')
  assert.match(life, /pauseOnBlur = false/,
    "the engine's own focus handling is still racing this one")
})

test('a paused run is not reported as a frozen one', () => {
  // The watchdog fires after three seconds without a heartbeat. Behind the
  // pause dialog, the portrait overlay and a backgrounded tab the loop stops
  // beating on purpose, and crying freeze at each would bury the real report.
  const game = src('scenes/GameScene.ts')
  assert.match(game, /Events\.PAUSE, \(\) => setRunActive\(false\)/,
    'pausing the scene leaves the watchdog armed')
  assert.match(game, /Events\.RESUME, \(\) => setRunActive\(true\)/,
    'resuming the scene leaves the watchdog disarmed')
})

// ------------------------------------------------------------- the goblin line

/**
 * "Only the very first enemy to emerge from the entrance archway in a run."
 *
 * Four separate ways to get that wrong, and each has bitten something in this
 * codebase before: per enemy, per wave, per spawn rather than per emergence,
 * and once ever rather than once per run.
 */
test('the goblin says his line once per run, at the arch, not at the spawn', () => {
  const game = src('scenes/GameScene.ts')
  const enemy = src('entities/Enemy.ts')

  // Hung off the emergence, which is the tick the fade-in starts — not the
  // constructor, which runs off the plate behind the stonework.
  assert.match(game, /enemy\.onEmerge = \(\) => \{/,
    'the line is not hung off the arch emergence')
  assert.doesNotMatch(game, /play\(this, 'goblin-spawn'\)[\s\S]{0,40}new Enemy/,
    'the line plays at the spawn, before there is anything to see')
  assert.match(enemy, /onEmerge: \(\(\) => void\) \| null/, 'Enemy has no emergence hook')

  // Fired exactly once per enemy: the handler is taken and cleared BEFORE it
  // is called, so a re-entrant call cannot find it still set.
  const emerge = enemy.slice(enemy.indexOf('private applyEmergence'))
  assert.match(emerge.slice(0, emerge.indexOf('\n  }')),
    /const fn = this\.onEmerge\s*\n\s*this\.onEmerge = null\s*\n\s*fn\?\.\(\)/,
    'the emergence hook is not cleared before it is called, so it can fire twice')

  // Once per RUN. The flag is reset when a run is set up, so a second run
  // greets the player again.
  assert.match(game, /private greeted = false/, 'nothing remembers the line was said')
  assert.match(game, /\n\s*this\.greeted = false\n/, 'the flag is never reset, so run two is silent')

  // And claimed inside the callback, not at the spawn: an enemy that dies
  // short of the mouth must not take the run's only greeting with it.
  const hook = game.slice(game.indexOf('if (!this.greeted) {'))
  const body = hook.slice(0, hook.indexOf('\n        }') + 1)
  assert.match(body, /onEmerge = \(\) => \{[\s\S]*this\.greeted = true/,
    'the flag is claimed at the spawn rather than at the arch')
})

test('a voice line is balanced as a group, and long enough to need its own hold', () => {
  const cue = audio.cues['goblin-spawn']
  assert.ok(cue, 'the goblin line is not in the manifest')

  // Its own level relative to the other effects, so a second line can be added
  // without re-tuning the first by hand.
  assert.ok(cue.bus, 'the voice line has no bus, so it can only be balanced one cue at a time')
  assert.ok(audio.buses?.[cue.bus] > 0, `bus "${cue.bus}" has no level`)
  const mgr = src('systems/Audio.ts')
  assert.match(mgr, /AUDIO\.buses\?\.\[def\.bus\]/, 'the bus level is never applied')

  // 1.44s against a default hold of 900ms. Left on the default the cue would
  // be counted as finished while it is still sounding, and a second trigger
  // inside that window would lay a second copy over the first.
  assert.ok(cue.durationMs >= 1440, 'the goblin line does not declare how long it runs')
  const hold = Number(/const VOICE_MS = (\d+)/.exec(mgr)?.[1])
  assert.ok(cue.durationMs > hold,
    'this cue is shorter than the default hold, so declaring a duration means nothing')
  assert.match(mgr, /claimVoice\(cue, def\.maxVoices, def\.durationMs \?\? VOICE_MS\)/,
    'the declared duration is not used, so the voice cap counts a sounding cue as free')

  // Nothing in the game stops a playing sound, so the line cannot be cut off
  // by something firing over it. That is a property worth holding onto.
  for (const f of ['systems/Audio.ts', 'scenes/GameScene.ts', 'scenes/HudScene.ts']) {
    assert.doesNotMatch(src(f), /sound\.stopAll\(|sound\.removeAll\(/,
      `${f} stops every sound, which would cut the voice line off mid-word`)
  }
})

test('a cue whose file did not load is reported, and never played', () => {
  // The same treatment the art has. Silence from a 404 and silence from a cue
  // nobody fired are indistinguishable from the outside, and that is an
  // evening spent looking in the wrong place.
  const mgr = src('systems/Audio.ts')
  assert.match(mgr, /export function missingCues\(/, 'nothing can tell which cues failed to load')
  assert.match(mgr, /if \(!scene\.cache\.audio\.exists\(cue\)\) return/,
    'a missing cue is still played, and burns its voice cap doing it')

  const boot = src('scenes/BootScene.ts')
  assert.match(boot, /FILE_LOAD_ERROR/, 'a failed load is not noticed')
  assert.match(boot, /missingCues\(this\)/, 'boot never checks which cues arrived')
  assert.match(boot, /\[audio\] MISSING CUES:/, 'a missing cue is not reported')
  assert.match(boot, /missingAudio\.length > 0\) this\.showMissingBanner\(\)/,
    'a missing cue is not surfaced anywhere the player or tester can see it')
  // Reported, never fatal: boot still starts the game.
  const create = boot.slice(boot.indexOf('create(): void {'))
  assert.ok(!/\n\s+return\b/.test(create.slice(0, create.indexOf('\n  }'))),
    'the audio check gave boot a way to refuse to start the game')
})

test('Elijah is credited for the line he recorded', () => {
  const credits = read('credits')
  const cards = credits.blocks.filter((b: any) => b.kind === 'card')
  const eli = cards.find((c: any) => c.name === 'ELIJAH')
  assert.ok(eli, 'the voice actor has no card in the roll')
  assert.ok(eli.roles.some((r: string) => /voice/i.test(r)), 'his card does not say what he did')
  // The same treatment Courtland and Han have: a card of his own, not a line
  // in a list.
  for (const name of ['COURTLAND', 'HAN']) {
    assert.ok(cards.some((c: any) => c.name === name), `${name}'s card went missing`)
  }
  const attributions = readFileSync(url('../ATTRIBUTIONS.md'), 'utf8')
  assert.match(attributions, /Elijah/, 'the voice line is not recorded in ATTRIBUTIONS.md')
})

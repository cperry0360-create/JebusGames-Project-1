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

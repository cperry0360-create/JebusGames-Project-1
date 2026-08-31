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

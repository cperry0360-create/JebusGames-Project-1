import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { currentId, loaded, newMix, request, settling, step } from '../src/systems/MusicMix.ts'

const url = (p: string) => new URL(p, import.meta.url)
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')
const MUSIC = JSON.parse(readFileSync(url('../src/data/music.json'), 'utf8'))
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))

/** Runs a fade to completion, returning the decks released along the way. */
function settle(m: ReturnType<typeof newMix>): number[] {
  const released: number[] = []
  let guard = 0
  while (settling(m) && guard++ < 1000) released.push(...step(m, 0.05))
  released.push(...step(m, 0.05))
  return released
}

test('what plays where is data, not code', () => {
  for (const key of ['Title', 'Loadout', 'Game']) {
    assert.ok(MUSIC.screens[key], `no track assigned to ${key}`)
    assert.ok(MUSIC.tracks[MUSIC.screens[key]], `${key} names a track that does not exist`)
  }
  // Title and Loadout are the same track on purpose: it has to carry across.
  assert.equal(MUSIC.screens.Title, MUSIC.screens.Loadout,
    'the title and loadout screens play different tracks, so it cannot carry across')
  for (const scene of ['TitleScene', 'LoadoutScene', 'GameScene', 'CreditsScene']) {
    const s = src(`scenes/${scene}.ts`)
    assert.match(s, /musicForScene\('/, `${scene} does not ask the data what to play`)
    assert.ok(!/new Audio\(|sound\.play\('music/.test(s), `${scene} starts music itself`)
  }
})

test('every track file is really there, and its name is URL-safe', () => {
  for (const [id, t] of Object.entries(MUSIC.tracks) as [string, any][]) {
    const path = `public/${MUSIC.root}${t.file}.${t.format}`
    assert.ok(existsSync(url(`../${path}`)), `${id} -> ${path} is missing`)
    // The upload arrived as "Of Far Different Nature - Electric Dream
    // (CC-BY).mp3", and the goblin line as "sfx_goblin_spawn.wav". Spaces and
    // parentheses in a public/ path need
    // percent-encoding and break the moment somebody builds the URL by
    // concatenation, which is exactly how the manifest builds it.
    assert.match(t.file, /^[a-z0-9_]+$/,
      `${id}'s filename "${t.file}" is not safe to put in a URL unescaped`)
  }
})

test('asking for the track already playing does not restart it', () => {
  // This is the whole Title -> Loadout requirement. Crossfading a track into
  // itself restarts it from the top, which is precisely what must not happen.
  const m = newMix()
  assert.ok(request(m, 'battle') >= 0, 'the first request did not start anything')
  settle(m)
  const before = { ...m.decks[m.front]! }
  assert.equal(request(m, 'battle'), -1, 'the same track was started a second time')
  assert.equal(m.decks[m.front]!.id, before.id)
  assert.equal(m.decks[m.front]!.level, 1, 'the running track was knocked off full volume')
  assert.equal(loaded(m).length, 1, 'a second copy of the same track was loaded')
})

test('a crossfade overlaps, and lands on exactly one track', () => {
  const m = newMix()
  request(m, 'battle')
  settle(m)
  request(m, 'airportAttack')
  // Mid-fade both are audible; that is what makes it a crossfade and not a cut.
  step(m, 0.25)
  const mid = m.decks.filter((d) => d.level > 0)
  assert.equal(mid.length, 2, 'the change was a cut, not a crossfade')
  settle(m)
  assert.deepEqual(loaded(m), ['airportAttack'])
  assert.equal(currentId(m), 'airportAttack')
})

test('nothing accumulates over a long session', () => {
  // The requirement: title, loadout, a full level, back to title, three times.
  // The property that has to hold is that no source is ever left attached, so
  // there is never a third track streaming under the two you can hear.
  const m = newMix()
  const seen: number[] = []
  for (let run = 0; run < 3; run++) {
    for (const scene of ['Title', 'Loadout', 'Game', 'Title']) {
      request(m, MUSIC.screens[scene])
      settle(m)
      seen.push(loaded(m).length)
      assert.ok(loaded(m).length <= 1,
        `${loaded(m).length} tracks left loaded after ${scene} on run ${run + 1}`)
    }
  }
  assert.deepEqual([...new Set(seen)], [1], 'the number of loaded tracks moved between runs')
})

test('a deck that has faded out is released, not left streaming silently', () => {
  const m = newMix()
  request(m, 'battle')
  settle(m)
  request(m, 'airportAttack')
  const released = settle(m)
  assert.ok(released.length >= 1, 'the outgoing deck was never released')
  assert.equal(loaded(m).length, 1, 'the silent track is still attached')
})

test('a fast there-and-back leaves the track rising, not fading', () => {
  // Game -> Title -> Game inside one crossfade. The middle request must not
  // leave the original on its way down.
  const m = newMix()
  request(m, 'airportAttack')
  settle(m)
  request(m, 'battle')
  step(m, 0.2)
  request(m, 'airportAttack')
  settle(m)
  assert.equal(currentId(m), 'airportAttack')
  assert.equal(m.decks[m.front]!.level, 1, 'the track it came back to is not at full volume')
  assert.equal(loaded(m).length, 1)
})

test('the two tracks are levelled against each other, not by one number', () => {
  const gains = Object.values(MUSIC.tracks).map((t: any) => t.gain)
  assert.ok(gains.every((g) => g > 0), 'a gain is zero or negative')
  assert.notEqual(gains[0], gains[1],
    'both tracks use the same gain, which is the thing that was asked not to happen')

  // A gain ABOVE 1 is allowed, and is not an oversight.
  //
  // Airport Attack is a MIDI render sitting 9.7 dB quieter than the mastered
  // track it shares the game with, so matching them needs boost, not cut. That
  // is only possible because the soundtrack runs through a Web Audio gain
  // node — an HTMLAudioElement's `volume` throws above 1. So a gain over 1
  // carries an obligation: the element path has to be clamped separately, and
  // the node has a ceiling of its own.
  const music = src('systems/Music.ts')
  const ceiling = Number(/MAX_NODE_GAIN = ([\d.]+)/.exec(music)?.[1])
  assert.ok(Number.isFinite(ceiling), 'Music.ts has no ceiling on the gain node')
  for (const [id, t] of Object.entries(MUSIC.tracks) as [string, any][]) {
    assert.ok(t.gain <= ceiling,
      `${id} asks for ${t.gain}, above the gain node's own ceiling of ${ceiling}`)
  }
  assert.match(music, /nodes\[i\] \? MAX_NODE_GAIN : 1/,
    'the element path is not clamped to 1, so an unrouted deck would throw on a boosted track')
})

test('music obeys mute, the volume slider, the gesture and the tab', () => {
  const m = src('systems/Music.ts')
  assert.match(m, /isMuted\(\)/, 'music ignores the mute control')
  // ITS OWN slider, not the effects'. Music is the one thing a player turns
  // down without wanting to lose the game's own sounds.
  assert.match(m, /getVolume\('music'\)/, 'music rides the sound-effects slider')
  // Its own gain on top of the player's, so it mixes independently of SFX.
  assert.match(m, /MUSIC\.tracks\[d\.id\]\?\.gain/, 'music has no level of its own')
  // iOS: nothing before a gesture, and a refused play() is not a crash.
  assert.match(m, /if \(broken \|\| !unlocked\) return/, 'music can start before a user gesture')
  assert.match(m, /started\.catch/, 'a refused play() is unhandled')
  // Streams rather than decoding: an HTMLAudioElement, not a Phaser sound.
  assert.match(m, /new Audio\(\)/, 'music is not streamed')
  assert.ok(!/scene\.sound\.add|this\.sound\.add/.test(m), 'music went through Phaser, which decodes it whole')

  const life = src('systems/Lifecycle.ts')
  assert.match(life, /pauseMusic\(\)/, 'music does not pause when the tab is backgrounded')
  assert.match(life, /resumeMusic\(\)/, 'music does not resume when the tab comes back')
})

test('the two tracks land at the same perceived level', () => {
  // "By ear" was not available, so they were matched by measurement: the RMS
  // of each track's loudest half, in 300ms windows, decoded in the browser.
  // Those measurements are recorded in the data, so this can check the gains
  // against them rather than against a number somebody remembered.
  const t = MUSIC.tracks
  const outputDb = (x: any) => x.loudHalfRmsDb + 20 * Math.log10(x.gain)
  const levels = Object.values(t).map((x: any) => outputDb(x))
  const spread = Math.max(...levels) - Math.min(...levels)
  assert.ok(spread <= 1.5,
    `the tracks are ${spread.toFixed(1)} dB apart; one will be obviously louder than the other`)
  // And nothing clips: peak plus gain has to stay under full scale.
  for (const [id, x] of Object.entries(t) as [string, any][]) {
    const peak = x.peakDb + 20 * Math.log10(x.gain)
    assert.ok(peak < -1, `${id} peaks at ${peak.toFixed(1)} dBFS, which leaves no headroom`)
  }
})

/**
 * WHY MUSIC WAS SILENT ON AN IPAD WHILE THE EFFECTS PLAYED.
 *
 * A bare HTMLAudioElement outputs on iOS's ringer channel, which the hardware
 * silent switch mutes; Web Audio does not. The effects are Phaser sounds on
 * Web Audio and the soundtrack was a bare element, so one device muted half
 * the game. These guard the two halves of the fix and the reporting path that
 * made the original report undiagnosable from the outside.
 */
test('the soundtrack shares the Web Audio graph rather than playing on its own', () => {
  const music = src('systems/Music.ts')
  // Routed through the same context the sound effects use, so both land on
  // the same output and the silent switch reaches neither.
  assert.match(music, /createMediaElementSource/,
    'the soundtrack plays straight out of the element, where the ringer switch mutes it')
  assert.match(music, /audioContext\(\)/, 'it makes its own context instead of sharing Phaser\'s')
  assert.match(src('systems/Audio.ts'), /export function audioContext\(\)/,
    'the shared context is not reachable')

  // Still streaming. Decoding a 9MB track into Web Audio is the thing this
  // module exists to avoid, and createMediaElementSource does not do that.
  assert.match(music, /new Audio\(\)/, 'the element is gone, so the track is being decoded whole')
  assert.doesNotMatch(music, /decodeAudioData/, 'the soundtrack is being decoded into memory')

  // And the routing is best-effort: a browser that refuses must fall back to
  // the element rather than lose the music.
  const fn = /function route\([\s\S]*?\n\}/.exec(music)
  assert.ok(fn, 'the routing helper is gone')
  assert.match(fn[0], /catch/, 'a browser that refuses to route loses the music entirely')
  assert.match(music, /const routed = nodes\[i\]/, 'the level is not applied to both paths')
})

test('the gesture is taken from the DOM, not from Phaser input', () => {
  const music = src('systems/Music.ts')
  // Phaser queues DOM pointer events and dispatches them from its update
  // loop, a frame later and in a different task. iOS requires play() during
  // the gesture itself.
  assert.match(music, /doc\.addEventListener\(ev, go/,
    'the unlock still rides on Phaser input, which is dispatched a frame late')
  assert.match(music, /'pointerdown', 'touchend', 'mousedown', 'keydown'/,
    'not every gesture kind unlocks the soundtrack')
  // Not once: a rejected play() resets `unlocked` so the next tap retries, and
  // a spent listener would make the retry impossible.
  assert.doesNotMatch(/doc\.addEventListener\(ev, go[^)]*\)/.exec(music)?.[0] ?? '', /once: true/,
    'the retry after a rejected play() can never fire')
  assert.match(src('main.ts'), /installMusicGesture\(\)/, 'the DOM listener is never installed')
})

test('a load failure is surfaced instead of swallowed', () => {
  const music = src('systems/Music.ts')
  assert.match(music, /el\.addEventListener\('error'/,
    'nothing listens for a load error, so a missing or undecodable track is silent')
  // Every MediaError code is turned into something a player can act on.
  for (const code of [1, 2, 3, 4]) {
    assert.ok(new RegExp(`code === ${code}`).test(music), `MediaError ${code} has no message`)
  }
  assert.match(music, /export function musicProblem\(\)/, 'the reason cannot be read back')
  assert.match(music, /export function onMusicProblem\(/, 'no screen can be told')
  // A refusal the browser named is reported; a missing gesture is not, since
  // it retries.
  assert.match(music, /name !== 'NotAllowedError'/,
    'a missing gesture would be reported as a failure on every first load')

  // And it reaches the player.
  const title = src('scenes/TitleScene.ts')
  assert.match(title, /onMusicProblem\(sayMusic\)/, 'the title screen never shows the reason')
  assert.match(title, /No music: /, 'the message does not say what is wrong')
  assert.match(title, /setVisible\(false\)/,
    'the notice is shown even when the music is fine')
})

test('the level 1 track repeats with a gap and a fade, not a cut', () => {
  // It ends on a fade and does not meet its own beginning, so a native loop
  // cuts from silence straight into a downbeat.
  const t = MUSIC.tracks[MUSIC.screens.Game]
  assert.ok(t.loop, 'the level track does not repeat at all')
  assert.ok(t.loopGapMs > 0, 'the repeat is a hard cut: no gap')
  assert.ok(t.loopFadeMs > 0, 'it comes back at full level rather than fading in')

  const m = src('systems/Music.ts')
  // The element must NOT loop itself where a gap is asked for; the gap and the
  // fade are ours, and el.loop would jump the queue.
  assert.match(m, /el\.loop = def\.loop && !gapped/,
    'the element loops itself, so the gap and fade never happen')
  assert.match(m, /addEventListener\('ended'/, 'nothing notices the track ending')
  // A track change during the gap replaces the element; the old one must not
  // restart over the new.
  assert.match(m, /if \(els\[startDeck\] !== el\) return/,
    'a track changed during the gap would be played over by the old one')

  // THE BUG THE HARNESS FOUND. Zeroing loopFade without pushing it to the
  // graph left the gain node at full through the gap, so the restarted track's
  // first 50ms — its downbeat — played at full level before the ramp's first
  // tick pulled it down. Measured: 1.071 at the restart, 0.153 a tick later.
  const ended = m.slice(m.indexOf("addEventListener('ended'"))
  const handler = ended.slice(0, ended.indexOf('loopTimers[startDeck] = setTimeout'))
  assert.match(handler, /loopFade\[startDeck\] = 0[\s\S]*applyLevels\(\)/,
    'the fade is zeroed but never applied, so the repeat arrives at full level')
})

test('music sits about eleven decibels under the voice lines', () => {
  // MEASURED, not judged. Every level here is the RMS of a file's loudest half
  // in 300ms windows, which is roughly what the ear responds to, times what
  // the mixer multiplies it by.
  //
  //   before   music -15.4 dBFS   voice -15.7 dBFS   music 0.3 dB LOUDER
  //   after    music -26.4 dBFS   voice -15.7 dBFS   music 11.0 dB under
  //
  // The busGain is where the balance lives rather than the slider's default,
  // so the slider can sit at 100% and still be right: a control that has to
  // default to 28% to sound correct reads as broken.
  const music = read('music')
  const audio = read('audio')
  const bus = music.busGain
  assert.ok(typeof bus === 'number' && bus > 0, 'music has no bus gain')

  const db = (x: number): number => 20 * Math.log10(x)
  const trackOut = Object.entries(music.tracks).map(([id, t]: [string, any]) => {
    assert.ok(typeof t.loudHalfRmsDb === 'number',
      `track "${id}" records no measured level, so this cannot be checked`)
    return { id, out: t.loudHalfRmsDb + db(t.gain * bus) }
  })
  // The tracks stay levelled with each other; the bus moves them together.
  const spread = Math.max(...trackOut.map((t) => t.out)) - Math.min(...trackOut.map((t) => t.out))
  assert.ok(spread < 0.5,
    `the tracks come out ${spread.toFixed(1)} dB apart: `
    + trackOut.map((t) => `${t.id} ${t.out.toFixed(1)}`).join(', '))

  // The voice lines, from their own measured levels — the same arithmetic
  // audio.test.ts holds them to.
  const voiceBus = audio.buses.voice
  const voices = Object.entries(audio.cues)
    .filter(([, c]: [string, any]) => c.bus === 'voice')
    .map(([name, c]: [string, any]) => {
      const measured = /(-?\d+\.\d+) dBFS over its loudest half/.exec(c._note ?? '')
      assert.ok(measured, `"${name}" does not record the level it was measured at`)
      return Number(measured![1]) + db(c.gain * voiceBus)
    })
  const voiceOut = voices.reduce((a, b) => a + b, 0) / voices.length
  const musicOut = trackOut.reduce((a, t) => a + t.out, 0) / trackOut.length
  const under = voiceOut - musicOut
  assert.ok(under >= 10 && under <= 12,
    `music is ${under.toFixed(1)} dB under the voice lines; the target is 10 to 12`)
})

test('the three channels are separate, and separately remembered', () => {
  // Music is the one thing a player turns down without wanting to lose the
  // game's own sounds, and a recorded line is a different kind of sound again.
  const save = src('systems/Save.ts')
  const audio = src('systems/Audio.ts')
  for (const field of ['musicVolume', 'voiceVolume']) {
    assert.match(save, new RegExp(`${field}: number`), `the save cannot remember ${field}`)
    assert.match(save, new RegExp(`${field}: clamp01\\(parsed\\.${field}`),
      `${field} is not validated on the way in`)
  }
  // The old single key keeps its name. Renaming it would throw away every
  // player's setting for the sake of a tidier name.
  assert.match(save, /volume: clamp01\(parsed\.volume/, 'the sound-effects key was renamed')
  assert.match(audio, /const volumes: Record<Channel, number>/, 'there is still one master volume')
  assert.match(audio, /getVolume\(channel: Channel = 'sfx'\)/,
    'getVolume cannot be asked about a channel')
  assert.match(audio, /const channel: Channel = def\.bus === VOICE_BUS \? 'voice' : 'sfx'/,
    'a cue does not know which channel it rides')
})

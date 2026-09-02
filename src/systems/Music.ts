// The soundtrack.
//
// Deliberately NOT Phaser sounds. Two reasons, both load-bearing:
//
//   1. Streaming. These files are 5MB and 9MB. Phaser's Web Audio path decodes
//      a whole track into memory as raw PCM before it will play a note of it —
//      nine megabytes of MP3 is roughly a hundred megabytes decoded, which on a
//      phone is the difference between a game that starts and one that is
//      killed. An HTMLAudioElement streams; it starts playing while the rest is
//      still arriving.
//
//   2. Lifetime. Music has to survive a scene change: the battle track plays
//      across Title and Loadout and must not restart between them. A Phaser
//      sound belongs to a scene's sound manager and a scene that shuts down
//      takes it with it. This module is game-wide and owns exactly two
//      elements, so "only one track is ever audible" is a property of the type
//      rather than something every scene has to remember.
//
// SFX stay on Phaser. They are short, they want to be decoded, and they want
// per-scene lifetime.

import musicData from '../data/music.json' with { type: 'json' }
import { stamped } from './Build.ts'
import { audioContext, getVolume, isMuted } from './Audio.ts'
import {
  currentId, deckGain, loaded, newMix, request, settling, step,
} from './MusicMix.ts'

export interface TrackDef {
  file: string
  format: string
  /** Levelled by MEASUREMENT against the other tracks — the RMS of each
   *  track's loudest half. Multiplies busGain and the player's music slider. */
  gain: number
  loop: boolean
  /** Silence between the end and the restart, for a track that fades out and
   *  therefore cannot loop seamlessly. 0 or absent means a native loop. */
  loopGapMs?: number
  /** How long the restart takes to come back up. */
  loopFadeMs?: number
  title: string
  artist: string
  license: string
  source: string
  verified: boolean
}

const MUSIC = musicData as unknown as {
  root: string
  crossfadeMs: number
  /** Every track, multiplied by this before the player's music slider. It is
   *  where the balance against the voice lines lives; see music.json. */
  busGain?: number
  tracks: Record<string, TrackDef>
  screens: Record<string, string>
}

export const TRACKS = MUSIC.tracks
export const SCREEN_TRACKS = MUSIC.screens

/** The elements, one per deck slot. The bookkeeping lives in MusicMix. */
const els: Array<HTMLAudioElement | null> = [null, null]
/**
 * Each deck's Web Audio output stage, when the element could be routed.
 *
 * WHY THIS EXISTS. An HTMLAudioElement playing on its own goes out through
 * iOS's *ringer* channel, which the hardware silent switch mutes. Web Audio
 * does not. So on an iPad with the side switch set to Mute the sound effects
 * played and the soundtrack did not, on the same build and the same URL — the
 * effects are Phaser sounds on Web Audio and the music was a bare element.
 *
 * Routing the element through `createMediaElementSource` keeps the streaming
 * (the point of using an element for a 9MB file) while moving the OUTPUT onto
 * the Web Audio graph, where the switch does not reach it.
 *
 * Null entries mean the routing was not possible and the element is playing
 * on its own; `applyLevels` handles both.
 */
const nodes: Array<{ source: MediaElementAudioSourceNode; gain: GainNode } | null> = [null, null]
/** Whether routing has been attempted for the element in each slot.
 *  `createMediaElementSource` throws if called twice on one element, so the
 *  retry below has to know it has already tried. */
const routeTried = [false, false]
const mix = newMix()

/** Set once the player has actually gestured. Nothing plays before it. */
let unlocked = false
/** What the game asked for, whether or not it could be started yet. */
let wanted: string | null = null
/** Set while the tab is in the background. */
let backgrounded = false
let ticker: ReturnType<typeof setInterval> | null = null
/** Turned off for good if the browser will not give us audio. */
let broken = false
/**
 * Why the soundtrack is not playing, in words a player can act on, or ''.
 *
 * Surfaced rather than swallowed. What cannot be detected from here is the one
 * cause most likely to be behind a silent iPad — the hardware ring/silent
 * switch — because nothing in the web platform reports it. The Web Audio
 * routing above is the mitigation for that; this is for everything that DOES
 * announce itself.
 */
let problem = ''
let onProblem: ((why: string) => void) | null = null

/** What to say if the player asks why there is no music. Empty when fine. */
export function musicProblem(): string {
  return problem
}

/** Told when music becomes unavailable, so a screen can say so. */
export function onMusicProblem(fn: ((why: string) => void) | null): void {
  onProblem = fn
  if (fn && problem) fn(problem)
}

function fail(why: string): void {
  if (problem) return
  problem = why
  console.warn('[music]', why)
  onProblem?.(why)
}

const TICK_MS = 50
/** How far above unity a routed deck may be driven. Enough to lift a quiet
 *  render onto the same footing as a mastered one, and not enough to clip
 *  anything mastered sensibly in the first place. */
const MAX_NODE_GAIN = 2

/**
 * Per-deck fade multiplier for a looping restart, 0..1.
 *
 * Separate from the crossfade level, which belongs to MusicMix and describes
 * moving BETWEEN tracks. This describes one track coming back round.
 */
const loopFade = [1, 1]
const loopTimers: Array<ReturnType<typeof setTimeout> | null> = [null, null]

function clearLoopTimer(i: number): void {
  const t = loopTimers[i]
  if (t !== null && t !== undefined) { clearTimeout(t); loopTimers[i] = null }
}

function urlFor(def: TrackDef): string {
  return stamped(`${MUSIC.root}${def.file}.${def.format}`)
}

function applyLevels(): void {
  // THE MUSIC'S OWN SLIDER, not the effects'. Music is the one thing a player
  // turns down without wanting to lose the game's own sounds.
  const master = isMuted() || broken ? 0 : getVolume('music')
  for (let i = 0; i < els.length; i++) {
    const el = els[i]
    const d = mix.decks[i]!
    if (!el) continue
    // The bus sits under the slider so the slider can be at 100% and still be
    // balanced. Measured: the two tracks are levelled with each other at
    // -15.4 dBFS and the four voice lines land at -15.7, so music was three
    // tenths of a decibel LOUDER than a person talking. See music.json.
    const bus = MUSIC.busGain ?? 1
    const gain = (d.id ? (MUSIC.tracks[d.id]?.gain ?? 1) : 1) * bus
    // The ceiling differs by path. A gain node can go above 1, which is what
    // lets a quiet MIDI render sit level with a mastered track; an element's
    // volume throws above 1. Clamped per path rather than to the lower of the
    // two, or the quiet track could never be brought up.
    const raw = deckGain(d, gain) * master * loopFade[i]!
    const level = Math.max(0, Math.min(nodes[i] ? MAX_NODE_GAIN : 1, raw))
    // The context can arrive after the element did — Phaser creates it on the
    // first gesture, and a track can be asked for in the same tick. Routing a
    // moment late is silent and correct; never routing is the bug.
    if (!nodes[i] && !routeTried[i]) route(i, el)
    try {
      const routed = nodes[i]
      if (routed) {
        // The element stays at 1 and the graph carries the level. Setting both
        // would multiply them, and the crossfade would run twice as steep.
        el.volume = 1
        routed.gain.gain.value = level
      } else {
        el.volume = level
      }
    } catch {
      // A detached element or a closed context. Nothing to do; the next swap
      // replaces both.
    }
  }
}

/**
 * Puts one deck's element on the Web Audio graph, if the browser will.
 *
 * Deliberately best-effort. `createMediaElementSource` throws if the element
 * has already been routed, and is missing on some older engines; a browser
 * that refuses simply keeps the element's own output, which is what the game
 * had before. It is never worth losing the music to gain the routing.
 */
function route(i: number, el: HTMLAudioElement): void {
  const ctx = audioContext()
  if (!ctx || typeof ctx.createMediaElementSource !== 'function') return
  routeTried[i] = true
  try {
    const source = ctx.createMediaElementSource(el)
    const gain = ctx.createGain()
    gain.gain.value = 0
    source.connect(gain)
    gain.connect(ctx.destination)
    nodes[i] = { source, gain }
  } catch {
    nodes[i] = null
  }
}

/**
 * Steps both fades. Runs on a plain interval rather than a scene's update, so
 * a crossfade that starts as one scene ends is not cut off half way by that
 * scene going away.
 */
function tick(): void {
  const amount = TICK_MS / Math.max(1, MUSIC.crossfadeMs)
  // The state machine says which decks finished fading out; releasing them is
  // what stops a silent track streaming for the rest of the session.
  for (const i of step(mix, amount)) release(i)
  applyLevels()
  if (!settling(mix)) stopTicker()
}

/** Stops and detaches one deck's element. */
function release(i: number): void {
  const routed = nodes[i]
  if (routed) {
    try { routed.source.disconnect() } catch { /* already gone */ }
    try { routed.gain.disconnect() } catch { /* already gone */ }
    nodes[i] = null
  }
  routeTried[i] = false
  const el = els[i]
  if (!el) return
  try { el.pause() } catch { /* already gone */ }
  el.src = ''
  el.removeAttribute('src')
  try { el.load() } catch { /* fine */ }
  els[i] = null
}

function startTicker(): void {
  if (ticker !== null) return
  ticker = setInterval(tick, TICK_MS)
}

function stopTicker(): void {
  if (ticker === null) return
  clearInterval(ticker)
  ticker = null
}

/**
 * Marks the page as having had its user gesture.
 *
 * iOS will not start audio before one, and calling play() earlier does not
 * queue it — it rejects. So the request is remembered and started here.
 */
export function unlockMusic(): void {
  if (unlocked) return
  unlocked = true
  if (wanted) playTrack(wanted)
}

/**
 * Listens for the gesture on the DOM itself, not through Phaser's input.
 *
 * This is the second half of the iOS story. Phaser unlocks its own Web Audio
 * context from listeners it puts on `document.body`, which run inside the
 * gesture's own call stack. The soundtrack was unlocked from
 * `scene.input.once('pointerdown')` — and Phaser QUEUES DOM pointer events and
 * dispatches them from its update loop, a frame later and in a different task.
 * Safari's rule is that `play()` must be called during the gesture, so the
 * soundtrack was relying on the transient-activation window still being open.
 * Usually it is. On a slow first frame it is not, and the effects come up
 * while the music does not.
 *
 * Not `once`: a rejected play() puts `unlocked` back to false so the next real
 * tap can retry, and a spent listener would make that retry impossible.
 */
export function installMusicGesture(): void {
  const doc = globalThis.document
  if (!doc) return
  const go = (): void => { unlockMusic() }
  for (const ev of ['pointerdown', 'touchend', 'mousedown', 'keydown']) {
    doc.addEventListener(ev, go, { capture: true, passive: true })
  }
}

/** What the game currently wants to hear. Used by the harness. */
export function currentTrack(): string | null {
  return currentId(mix)
}

/** Every deck holding a source. Never longer than 2, by construction. */
export function audibleTracks(): string[] {
  return loaded(mix)
}

/** How many audio elements exist. The harness watches this across runs: it is
 *  what "no sounds accumulate" means. `new Audio()` is never added to the
 *  document, so counting `document.querySelectorAll('audio')` finds nothing
 *  and proves nothing. */
export function liveElementCount(): number {
  return els.filter((e) => e !== null).length
}

/** How far into the current track we are, in seconds. The harness uses it to
 *  prove Title -> Loadout did not restart the track. */
export function currentPosition(): number {
  for (let i = 0; i < els.length; i++) {
    if (mix.decks[i]?.id === currentId(mix) && els[i]) return els[i]!.currentTime
  }
  return 0
}

/** The current track's length in seconds, or 0 while it is still loading. */
export function currentDuration(): number {
  for (let i = 0; i < els.length; i++) {
    const el = els[i]
    if (mix.decks[i]?.id === currentId(mix) && el) {
      return Number.isFinite(el.duration) ? el.duration : 0
    }
  }
  return 0
}

/**
 * Whether the element is looping ITSELF.
 *
 * False for a gapped track, and that is the point: the gap and the fade back
 * in are ours, and `el.loop` would cut from the tail's silence straight into
 * the downbeat. The harness checks this rather than trusting the config, since
 * the two disagreeing is exactly the bug.
 */
export function loopAttribute(): boolean {
  for (let i = 0; i < els.length; i++) {
    if (mix.decks[i]?.id === currentId(mix) && els[i]) return els[i]!.loop
  }
  return false
}

/**
 * Jumps the current track. FOR THE HARNESS ONLY.
 *
 * The loop seam is 91 seconds into the track, and a check that waits 91
 * seconds for it is a check nobody runs — which is how an unverified claim
 * about the seam would end up in the changelog. Nothing in the game calls this.
 */
export function seekCurrent(seconds: number): void {
  for (let i = 0; i < els.length; i++) {
    if (mix.decks[i]?.id === currentId(mix) && els[i]) {
      try {
        els[i]!.currentTime = Math.max(0, seconds)
      } catch { /* not seekable yet */ }
      return
    }
  }
}

/** What each deck is actually outputting. For the harness: "only one track is
 *  ever audible" is a claim about these numbers. */
export function deckReport(): Array<{ id: string | null; volume: number; paused: boolean }> {
  return els.map((el, i) => ({
    id: mix.decks[i]?.id ?? null,
    // The EFFECTIVE level, not the element's. Once a deck is routed through
    // the Web Audio graph its element sits at 1 and the gain node carries the
    // fade, so reading el.volume would report every deck as full — and "only
    // one track is ever audible" is a claim about these numbers.
    volume: el ? (nodes[i] ? nodes[i]!.gain.gain.value : el.volume) : 0,
    paused: el ? el.paused : true,
  }))
}

/** Which decks are on the Web Audio graph. The harness checks this is the
 *  path in use, since it is the whole reason the iPad was silent. */
export function routedDecks(): boolean[] {
  return nodes.map((n) => n !== null)
}

/**
 * Plays a track, crossfading from whatever is playing.
 *
 * Asking for the track that is already playing is a no-op — which is what
 * carries the battle track across Title -> Loadout unbroken. Crossfading a
 * track into itself would restart it, which is exactly what must not happen.
 */
export function playTrack(id: string | null): void {
  wanted = id
  if (broken || !unlocked) return

  const startDeck = request(mix, id)
  if (startDeck < 0) {
    // Either nothing to do, or the same track was asked for again — which is
    // what carries the battle track across Title -> Loadout unbroken.
    startTicker()
    applyLevels()
    return
  }

  const def = id ? MUSIC.tracks[id] : undefined
  if (!def) return
  // The slot may still hold the element from an earlier change; it is reused
  // rather than stacked, which is what caps this at two elements forever.
  release(startDeck)

  const el = new Audio()
  // Streams: the browser fetches as it plays rather than decoding the whole
  // file up front. Nine megabytes of MP3 is about a hundred decoded.
  el.preload = 'auto'
  // A track that ends on a fade does not meet its own beginning, so a native
  // loop cuts from silence straight into a downbeat. Where the data asks for a
  // gap, the element does NOT loop itself: it is restarted after a pause and
  // faded back in, which reads as the piece coming round again.
  const gapped = def.loop && (def.loopGapMs ?? 0) > 0
  el.loop = def.loop && !gapped
  // iOS will not play an element inline without this, and a soundtrack is
  // never a full-screen video.
  el.setAttribute('playsinline', '')
  el.crossOrigin = 'anonymous'
  el.src = urlFor(def)
  el.volume = 0
  els[startDeck] = el

  // A LOAD FAILURE USED TO BE SILENT. Nothing listened for `error`, so a 404,
  // a codec the device will not take, or a stalled transfer left the game
  // playing nothing with no way to find out why — which is indistinguishable
  // from every other reason music might not be audible, and made this exact
  // report impossible to diagnose from the outside.
  el.addEventListener('error', () => {
    const code = el.error?.code
    const why = code === 1 ? 'the download was aborted'
      : code === 2 ? 'the network dropped it'
        : code === 3 ? 'this device cannot decode it'
          : code === 4 ? 'the file is missing or the format is unsupported'
            : 'the browser gave no reason'
    fail(`could not load ${def.file}.${def.format}: ${why}`)
  }, { once: true })

  if (gapped) {
    el.addEventListener('ended', () => {
      // Only if this element still owns the slot. A track change during the
      // gap replaces it, and the old one must not restart over the new.
      if (els[startDeck] !== el) return
      clearLoopTimer(startDeck)
      loopFade[startDeck] = 0
      // Pushed to the graph NOW, not when the ramp's first tick arrives.
      // Without this the gain node stays at full through the gap, and the
      // restarted track's first 50ms — its downbeat — plays at full level
      // before the fade takes over. Measured in the harness: the level read
      // 1.071 at the restart and 0.153 a tick later, which is the hard cut
      // this gap exists to avoid, moved 50ms to the right.
      applyLevels()
      loopTimers[startDeck] = setTimeout(() => {
        if (els[startDeck] !== el) return
        try {
          el.currentTime = 0
          const again = el.play()
          if (again && typeof again.catch === 'function') again.catch(() => { /* refused */ })
        } catch { /* the element went away underneath us */ }
        const stepUp = TICK_MS / Math.max(1, def.loopFadeMs ?? 1)
        const ramp = setInterval(() => {
          if (els[startDeck] !== el) { clearInterval(ramp); return }
          loopFade[startDeck] = Math.min(1, (loopFade[startDeck] ?? 0) + stepUp)
          applyLevels()
          if ((loopFade[startDeck] ?? 1) >= 1) clearInterval(ramp)
        }, TICK_MS)
      }, def.loopGapMs ?? 0)
    })
  }

  route(startDeck, el)

  const started = el.play()
  if (started && typeof started.catch === 'function') {
    // A rejected play() is the browser refusing, not a crash — most often a
    // gesture we thought we had and did not. Remembered, and retried on the
    // next real one.
    started.catch((err: unknown) => {
      unlocked = false
      release(startDeck)
      mix.decks[startDeck] = { id: null, target: 0, level: 0 }
      const name = (err as { name?: string } | null)?.name
      // NotAllowedError is a missing gesture and will be retried; anything
      // else is a refusal the player should be told about.
      if (name && name !== 'NotAllowedError') {
        fail(`the browser refused to play the soundtrack (${name})`)
      }
    })
  }
  applyLevels()
  startTicker()
}

/** The track this scene should be playing, or null to leave it alone. */
export function trackForScene(key: string): string | null {
  return MUSIC.screens[key] ?? null
}

/**
 * Called by every scene as it starts. A scene with no entry keeps whatever is
 * playing rather than stopping it, so adding a scene does not silence the game.
 */
export function musicForScene(key: string): void {
  const id = trackForScene(key)
  if (id === null) return
  playTrack(id)
}

/** Stops everything, immediately. For teardown, not for a scene change. */
export function stopMusic(): void {
  for (let i = 0; i < els.length; i++) {
    release(i)
    mix.decks[i] = { id: null, target: 0, level: 0 }
  }
  wanted = null
  stopTicker()
}

/** Backgrounded: pause where we are rather than tearing down, so coming back
 *  resumes the same bar rather than restarting the track. */
export function pauseMusic(): void {
  backgrounded = true
  for (const el of els) {
    if (!el) continue
    try { el.pause() } catch { /* fine */ }
  }
}

export function resumeMusic(): void {
  if (!backgrounded) return
  backgrounded = false
  if (broken || !unlocked) return
  for (let i = 0; i < els.length; i++) {
    const el = els[i]
    if (!el || mix.decks[i]!.level <= 0) continue
    const p = el.play()
    if (p && typeof p.catch === 'function') p.catch(() => { /* refused; stay quiet */ })
  }
}

/** The mute control and the volume slider both land here. */
export function refreshMusicVolume(): void {
  applyLevels()
}

/** Audio has been declared unusable; never try again. */
export function disableMusic(): void {
  broken = true
  stopMusic()
}

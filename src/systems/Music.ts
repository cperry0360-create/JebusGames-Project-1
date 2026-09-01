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
import { getVolume, isMuted } from './Audio.ts'
import {
  currentId, deckGain, loaded, newMix, request, settling, step,
} from './MusicMix.ts'

export interface TrackDef {
  file: string
  format: string
  /** Levelled by ear against the other tracks. Multiplies the player's volume. */
  gain: number
  loop: boolean
  title: string
  artist: string
  license: string
  source: string
  verified: boolean
}

const MUSIC = musicData as unknown as {
  root: string
  crossfadeMs: number
  tracks: Record<string, TrackDef>
  screens: Record<string, string>
}

export const TRACKS = MUSIC.tracks
export const SCREEN_TRACKS = MUSIC.screens

/** The elements, one per deck slot. The bookkeeping lives in MusicMix. */
const els: Array<HTMLAudioElement | null> = [null, null]
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

const TICK_MS = 50

function urlFor(def: TrackDef): string {
  return stamped(`${MUSIC.root}${def.file}.${def.format}`)
}

function applyLevels(): void {
  const master = isMuted() || broken ? 0 : getVolume()
  for (let i = 0; i < els.length; i++) {
    const el = els[i]
    const d = mix.decks[i]!
    if (!el) continue
    const gain = d.id ? (MUSIC.tracks[d.id]?.gain ?? 1) : 1
    try {
      el.volume = Math.max(0, Math.min(1, deckGain(d, gain) * master))
    } catch {
      // A detached element. Nothing to do; the next swap replaces it.
    }
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

/** What each deck is actually outputting. For the harness: "only one track is
 *  ever audible" is a claim about these numbers. */
export function deckReport(): Array<{ id: string | null; volume: number; paused: boolean }> {
  return els.map((el, i) => ({
    id: mix.decks[i]?.id ?? null,
    volume: el ? el.volume : 0,
    paused: el ? el.paused : true,
  }))
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
  el.loop = def.loop
  el.src = urlFor(def)
  el.volume = 0
  els[startDeck] = el

  const started = el.play()
  if (started && typeof started.catch === 'function') {
    // A rejected play() is the browser refusing, not a crash — most often a
    // gesture we thought we had and did not. Remembered, and retried on the
    // next real one.
    started.catch(() => {
      unlocked = false
      release(startDeck)
      mix.decks[startDeck] = { id: null, target: 0, level: 0 }
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

import Phaser from 'phaser'
import type { AudioDef } from '../types.ts'
import audioData from '../data/audio.json'
import { logEvent } from './Diagnostics.ts'
import { loadSave, writeSave } from './Save.ts'
import { stamped } from './Build.ts'

/**
 * Every sound in the game goes through here.
 *
 * Three things this has to get right:
 *
 *   - **It must never break the game.** A blocked audio context, a codec the
 *     browser will not decode, a cue that failed to load — all of it is caught
 *     and dropped. Sound is a nicety; the wave keeps coming either way.
 *
 *   - **It must not turn a big wave into noise.** Five towers firing four
 *     times a second is twenty shots a second, and twenty copies of one sample
 *     stacked on top of each other is not louder, it is mud. Every cue has a
 *     voice cap, and a cue already at its cap is dropped rather than queued.
 *
 *   - **It must remember the player's choice.** Volume and mute live in save
 *     data and are applied to the whole mix, not to individual cues.
 *
 * Per-cue `gain` is the mix — how loud that sound sits against the others —
 * and is fixed. The player's volume multiplies it.
 */

const AUDIO = audioData as AudioDef

export const CUE_KEYS = Object.keys(AUDIO.cues)
export type Cue = string

/** How long a cue is considered to still be sounding, when the browser will
 *  not tell us. Kenney's one-shots are all well under this. */
const VOICE_MS = 900

let volume = 0.7
let muted = false
/** Cue -> timestamps of the copies currently counted as sounding. */
const voices = new Map<Cue, number[]>()

/**
 * True once the browser has refused to give us an audio device and we have
 * stopped asking. The game keeps running; it just runs silently.
 *
 * This is the iOS case the tester hit: backgrounding the tab suspends the
 * AudioContext, and on return `resume()` can reject with "Failed to start the
 * audio device". A rejected promise nobody handles is an unhandled rejection,
 * which the crash reporter — correctly — reports as a crash.
 */
let unavailable = false
let noticeHandler: ((reason: string) => void) | null = null

export function audioUnavailable(): boolean {
  return unavailable
}

/** Where to say so. Set by the boot path; the game does not depend on it. */
export function onAudioUnavailable(fn: ((reason: string) => void) | null): void {
  noticeHandler = fn
}

export function disableAudio(reason: string): void {
  if (unavailable) return
  unavailable = true
  logEvent('audio', `disabled: ${reason}`)
  try {
    noticeHandler?.(reason)
  } catch {
    // A notice that cannot be shown is not worth a crash either.
  }
}

/**
 * Makes every AudioContext promise safe, whoever calls it.
 *
 * Wrapping our own calls is not enough. Phaser's sound manager calls
 * `context.resume().then(...)` in its unlock path and again when the page
 * regains focus, with no rejection handler on either — so on iOS the game can
 * be taken down by a line of code inside the engine that we do not call and
 * cannot reach. Patching the prototype once, before the game is constructed,
 * covers our calls and the engine's with the same guarantee.
 *
 * The returned promise still resolves, so a caller's `.then` still runs and
 * nothing hangs waiting on it. What it can no longer do is reject.
 */
export function guardAudioPromises(): void {
  const Ctx = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext
    ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx?.prototype) return
  const proto = Ctx.prototype as unknown as Record<string, unknown> & { __guarded?: boolean }
  if (proto.__guarded) return
  proto.__guarded = true

  for (const name of ['resume', 'suspend', 'close'] as const) {
    const original = proto[name] as ((this: AudioContext) => Promise<void>) | undefined
    if (typeof original !== 'function') continue
    proto[name] = function guarded(this: AudioContext): Promise<void> {
      try {
        const result = original.call(this)
        // Older WebKit returns undefined rather than a promise.
        if (!result || typeof result.catch !== 'function') return Promise.resolve()
        return result.catch((err: unknown) => {
          if (name === 'resume') disableAudio(messageOf(err))
        })
      } catch (err) {
        if (name === 'resume') disableAudio(messageOf(err))
        return Promise.resolve()
      }
    }
  }
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message
  return typeof err === 'string' ? err : 'the browser refused the audio device'
}

/** The live context, if there is one. Phaser only has one under Web Audio. */
function contextOf(scene: Phaser.Scene | Phaser.Game): AudioContext | undefined {
  const sound = (scene as Phaser.Scene).sound ?? (scene as Phaser.Game).sound
  return (sound as { context?: AudioContext } | undefined)?.context
}

export function initAudio(): void {
  const save = loadSave()
  volume = save.volume
  muted = save.muted
}

/**
 * Browsers refuse to start an audio context until the page has had a real user
 * gesture. Phaser tracks that itself, but the context can still be left
 * suspended, so the first click also asks for it explicitly. Once is enough.
 */
export function unlockAudio(scene: Phaser.Scene): void {
  const resume = (): void => {
    void resumeAudio(scene)
  }
  scene.input.once('pointerdown', resume)
  scene.input.keyboard?.once('keydown', resume)
}

/**
 * Starts or restarts the audio device. Never throws and never rejects.
 *
 * Resolves true when sound is usable afterwards. A false means the browser
 * would not give us a device; the caller carries on without one.
 */
export async function resumeAudio(scene: Phaser.Scene | Phaser.Game): Promise<boolean> {
  if (unavailable) return false
  try {
    const ctx = contextOf(scene)
    if (!ctx) return true
    if (ctx.state === 'suspended') await ctx.resume()
    // A context still suspended after a resume is one the browser is holding
    // shut — usually because there has been no gesture yet. Not a failure.
    return !unavailable && ctx.state === 'running'
  } catch (err) {
    disableAudio(messageOf(err))
    return false
  }
}

/**
 * Stops the audio device on the way out. Never throws.
 *
 * Suspending deliberately is what keeps the resume predictable: a context the
 * browser suspended behind our back on iOS comes back in a state Phaser does
 * not expect, and that is where the unhandled rejection came from.
 */
export function suspendAudio(scene: Phaser.Scene | Phaser.Game): void {
  try {
    const sound = (scene as Phaser.Scene).sound ?? (scene as Phaser.Game).sound
    sound?.pauseAll()
  } catch {
    // Nothing playing, or no sound system yet.
  }
  try {
    const ctx = contextOf(scene)
    if (ctx && ctx.state === 'running') void ctx.suspend()
  } catch {
    // Suspending is a courtesy; failing to is not a problem.
  }
}

export function queueAudio(scene: Phaser.Scene): void {
  for (const [cue, def] of Object.entries(AUDIO.cues)) {
    scene.load.audio(cue, stamped(`${AUDIO.root}${def.file}.${def.format}`))
  }
}

export function getVolume(): number {
  return volume
}

export function isMuted(): boolean {
  return muted
}

export function setVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v))
  writeSave({ ...loadSave(), volume, muted })
}

export function setMuted(v: boolean): void {
  muted = v
  writeSave({ ...loadSave(), volume, muted })
}

export function toggleMuted(): boolean {
  setMuted(!muted)
  return muted
}

/** True when this cue has room for another copy right now. */
function claimVoice(cue: Cue, cap: number): boolean {
  const now = Date.now()
  const live = (voices.get(cue) ?? []).filter((t) => now - t < VOICE_MS)
  if (live.length >= cap) {
    voices.set(cue, live)
    return false
  }
  live.push(now)
  voices.set(cue, live)
  return true
}

/**
 * Plays a cue. `scale` is a per-call adjustment on top of the cue's own mix —
 * for a quieter version of the same sound, not for balancing it, which belongs
 * in audio.json.
 */
export function play(scene: Phaser.Scene, cue: Cue, scale = 1): void {
  if (muted || volume <= 0 || unavailable) return
  const def = AUDIO.cues[cue]
  if (!def) return
  if (!claimVoice(cue, def.maxVoices)) return

  try {
    if (scene.sound.locked) return
    scene.sound.play(cue, { volume: def.gain * scale * volume })
  } catch {
    // A cue that will not play is not worth a crash.
  }
}

/** Cycles a group of interchangeable cues, so repeated hits do not machine-gun
 *  one sample. Returns the cue it played. */
const rotation = new Map<string, number>()

export function playRotating(scene: Phaser.Scene, group: string, cues: Cue[], scale = 1): void {
  const i = (rotation.get(group) ?? 0) % cues.length
  rotation.set(group, i + 1)
  play(scene, cues[i], scale)
}

/** Forgets every counted voice. Called between scenes so a cue capped during a
 *  lost run is not still capped on the next one. */
export function resetVoices(): void {
  voices.clear()
  rotation.clear()
}

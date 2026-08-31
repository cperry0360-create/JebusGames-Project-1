import Phaser from 'phaser'
import type { AudioDef } from '../types.ts'
import audioData from '../data/audio.json'
import { loadSave, writeSave } from './Save.ts'

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
    try {
      const ctx = (scene.sound as { context?: AudioContext }).context
      if (ctx && ctx.state === 'suspended') void ctx.resume()
    } catch {
      // Not a Web Audio manager, or the browser said no. Either is survivable.
    }
  }
  scene.input.once('pointerdown', resume)
  scene.input.keyboard?.once('keydown', resume)
}

export function queueAudio(scene: Phaser.Scene): void {
  for (const [cue, def] of Object.entries(AUDIO.cues)) {
    scene.load.audio(cue, `${AUDIO.root}${def.file}.${def.format}`)
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
  writeSave({ volume, muted })
}

export function setMuted(v: boolean): void {
  muted = v
  writeSave({ volume, muted })
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
  if (muted || volume <= 0) return
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

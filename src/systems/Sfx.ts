// Sound cues. The audio hosts are unreachable from the build environment, so
// these WAVs are synthesised offline by tools/mksfx.py rather than downloaded.

import Phaser from 'phaser'

export const SFX_KEYS = ['sfx-dadmode', 'sfx-build', 'sfx-leak', 'sfx-cast'] as const
export type SfxKey = (typeof SFX_KEYS)[number]

export function queueSfx(scene: Phaser.Scene): void {
  for (const key of SFX_KEYS) scene.load.audio(key, `assets/audio/${key}.wav`)
}

/** Never let a missing or blocked audio context break the game loop. */
export function play(scene: Phaser.Scene, key: SfxKey, volume = 1): void {
  try {
    if (scene.sound.locked) return
    scene.sound.play(key, { volume })
  } catch {
    // Audio is a nicety; a failure here must not stop play.
  }
}

import Phaser from 'phaser'
import { gameConfig } from './config.ts'
import { installOrientationGate } from './systems/Orientation.ts'
import { applyResolution } from './systems/Resolution.ts'
import { installErrorPanel, report, setReloadHandler } from './systems/ErrorPanel.ts'
import { logEvent, setBuildLabel } from './systems/Diagnostics.ts'
import { installWatchdog } from './systems/Watchdog.ts'
import { guardAudioPromises } from './systems/Audio.ts'
import { installLifecycle } from './systems/Lifecycle.ts'
import { disableMusic, installMusicGesture, refreshMusicVolume, unlockMusic } from './systems/Music.ts'
import { onAudioGesture, onAudioMixChanged, onAudioUnavailable } from './systems/Audio.ts'
import { VERSION_LABEL } from './systems/Build.ts'

// First, before anything can throw. A game that dies on the way up has to say
// so; the alternative is the black screen this replaces.
installErrorPanel()
;(globalThis as unknown as { __errorPanelReady?: boolean }).__errorPanelReady = true
// Before the game exists, so the engine's own audio calls are already covered
// by the time it makes any. Sound must never be able to take the game down.
guardAudioPromises()
setBuildLabel(VERSION_LABEL)
logEvent('boot', VERSION_LABEL)

/**
 * Phaser measures and rasterises text the moment a scene creates it, so the
 * game must not start until the bundled fonts are actually available.
 * Otherwise the first frames render in a fallback face and never re-layout.
 */
async function waitForFonts(): Promise<void> {
  if (!('fonts' in document)) return
  // One face. The other two in the Kenney package were declared, preloaded
  // and never referenced by a style — 58 KB the player waited on for nothing.
  try {
    await document.fonts.load('16px KenneyFuture')
    await document.fonts.ready
  } catch {
    // A missing font is a cosmetic problem, not a reason to refuse to boot.
  }
}

/**
 * Stands the game up, and everything that has to be installed around it.
 *
 * A FUNCTION RATHER THAN A STRAIGHT LINE, because it has to be possible to run
 * twice. A backgrounded page on iOS can come back with a WebGL context that is
 * gone and does not return; the lifecycle waits for it, and past its deadline
 * the only honest options are to rebuild the game or to leave the player
 * looking at a rectangle that cannot draw. Everything below is per-game state
 * and is re-installed with it; the module-level installs above are not, and
 * stay where they are.
 */
function boot(): Phaser.Game {
  const game = new Phaser.Game(gameConfig)
  // Before any scene measures anything. The scale mode is NONE, so nothing
  // else sizes the canvas and the first frame would otherwise be drawn at the
  // 1280x720 config size regardless of the device.
  applyResolution(game)
  setReloadHandler(() => globalThis.location.reload())

  // Leaving the tab and coming back is a state the game enters deliberately:
  // the run stops, the audio device is released, and both are picked back up
  // in a known order. Without this, iOS suspending the AudioContext on the way
  // out crashed the game on the way in.
  installLifecycle(game, {
    // The last resort. `destroy(true)` takes the old canvas out of the DOM,
    // which matters: without it the rebuilt game is parented beside a dead
    // canvas that still covers the screen.
    recreate: () => {
      logEvent('lifecycle', 'rebuilding the game after an unrecoverable context loss')
      try {
        game.destroy(true, false)
      } catch {
        // Half-destroyed is still better than not destroyed; carry on and
        // build the new one.
      }
      setCurrent(boot())
    },
  })
  // The soundtrack rides on its own elements, so the mute control and the
  // volume slider have to reach it explicitly.
  onAudioMixChanged(refreshMusicVolume)
  onAudioGesture(unlockMusic)
  // And directly on the DOM as well. Phaser's input is dispatched from its
  // update loop rather than from the gesture, which on iOS is the difference
  // between play() being allowed and being rejected.
  installMusicGesture()
  onAudioUnavailable(() => disableMusic())

  // A freeze carries no exception, so nothing else in the diagnostics would
  // notice it. This is the only thing that does.
  installWatchdog((stalled) => {
    report('frozen', `the game loop stopped for ${(stalled / 1000).toFixed(1)}s`, '')
  })

  // The game is landscape. Portrait gets an overlay and a paused game rather
  // than a rotated canvas: rotating would put pointer coordinates in a
  // different frame from the one the browser reports them in.
  installOrientationGate(game)
  return game
}

/**
 * The live game. Replaced, not mutated, by a rebuild.
 *
 * Published on `globalThis` beside `__errorPanelReady`, because the harness
 * has to be able to reach the game it is driving — and after a rebuild that is
 * a different object from the one it started with. A scenario that held the
 * first one would be driving a destroyed game and reporting that nothing
 * happened.
 */
let current: Phaser.Game | undefined
function setCurrent(game: Phaser.Game): void {
  current = game
  ;(globalThis as unknown as { __game?: Phaser.Game }).__game = current
}

async function start(): Promise<void> {
  await waitForFonts()
  document.getElementById('boot')?.remove()
  setCurrent(boot())
}

void start()

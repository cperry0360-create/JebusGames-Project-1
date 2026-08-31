import Phaser from 'phaser'
import { gameConfig } from './config.ts'
import { installOrientationGate } from './systems/Orientation.ts'
import { installErrorPanel, report, setReloadHandler } from './systems/ErrorPanel.ts'
import { logEvent, setBuildLabel } from './systems/Diagnostics.ts'
import { installWatchdog } from './systems/Watchdog.ts'
import { VERSION_LABEL } from './systems/Build.ts'

// First, before anything can throw. A game that dies on the way up has to say
// so; the alternative is the black screen this replaces.
installErrorPanel()
;(globalThis as unknown as { __errorPanelReady?: boolean }).__errorPanelReady = true
setBuildLabel(VERSION_LABEL)
logEvent('boot', VERSION_LABEL)

/**
 * Phaser measures and rasterises text the moment a scene creates it, so the
 * game must not start until the bundled fonts are actually available.
 * Otherwise the first frames render in a fallback face and never re-layout.
 */
async function waitForFonts(): Promise<void> {
  if (!('fonts' in document)) return
  const faces = ['KenneyFuture', 'KenneyFutureNarrow', 'KenneyMiniSquare']
  try {
    await Promise.all(faces.map((f) => document.fonts.load(`16px ${f}`)))
    await document.fonts.ready
  } catch {
    // A missing font is a cosmetic problem, not a reason to refuse to boot.
  }
}

async function start(): Promise<void> {
  await waitForFonts()
  document.getElementById('boot')?.remove()
  const game = new Phaser.Game(gameConfig)
  setReloadHandler(() => globalThis.location.reload())

  // A freeze carries no exception, so nothing else in the diagnostics would
  // notice it. This is the only thing that does.
  installWatchdog((stalled) => {
    report('frozen', `the game loop stopped for ${(stalled / 1000).toFixed(1)}s`, '')
  })

  // The game is landscape. Portrait gets an overlay and a paused game rather
  // than a rotated canvas: rotating would put pointer coordinates in a
  // different frame from the one the browser reports them in.
  installOrientationGate(game)
}

void start()

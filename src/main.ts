import Phaser from 'phaser'
import { gameConfig } from './config.ts'

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
  new Phaser.Game(gameConfig)
}

void start()

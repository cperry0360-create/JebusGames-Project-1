import Phaser from 'phaser'
import display from './data/display.json'
import { BootScene } from './scenes/BootScene.ts'
import { SplashScene } from './scenes/SplashScene.ts'
import { TitleScene } from './scenes/TitleScene.ts'
import { CreditsScene } from './scenes/CreditsScene.ts'
import { WorldMapScene } from './scenes/WorldMapScene.ts'
import { LoadoutScene } from './scenes/LoadoutScene.ts'
import { GameScene } from './scenes/GameScene.ts'
import { HudScene } from './scenes/HudScene.ts'
import { DiagnosticsScene } from './scenes/DiagnosticsScene.ts'

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: display.width,
  height: display.height,
  backgroundColor: display.backgroundColor,
  // Every character is authored at about 2x its render size, so the GPU is
  // always minifying. Bilinear is the right filter for that and point
  // sampling is the wrong one: NEAREST on a 2x source drops every other
  // pixel, which is what turns a 4px outline into a broken dotted line.
  //
  // `pixelArt: false` already implies this, but it implies it by omission,
  // and a future `pixelArt: true` for one sprite would silently point-filter
  // the whole cast. Both are stated so the intent survives.
  pixelArt: false,
  antialias: true,
  // Positions only. This rounds where a sprite is drawn, never how it is
  // sampled, so it does not fight the filter above.
  roundPixels: true,
  scale: {
    // NONE, and driven by hand from Resolution.ts. It was RESIZE, which makes
    // the canvas the viewport — but RESIZE sets `canvas.width` to the parent's
    // CSS size and ignores zoom, so the canvas held a third of the pixels a
    // retina phone has and the compositor stretched it back up. NONE plus a
    // zoom of 1/dpr is the only combination Phaser 3 offers that gives a
    // full-resolution canvas at the right physical size.
    //
    // The world is still 1280x720 and the camera still moves over it; what
    // changed is that a screen pixel is now a device pixel.
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.NO_CENTER,
    width: display.width,
    height: display.height,
  },
  input: { activePointers: 3 },
  scene: [
    BootScene, SplashScene, TitleScene, CreditsScene, WorldMapScene, LoadoutScene,
    GameScene, HudScene, DiagnosticsScene,
  ],
}

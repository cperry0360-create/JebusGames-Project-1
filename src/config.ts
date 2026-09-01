import Phaser from 'phaser'
import display from './data/display.json'
import { BootScene } from './scenes/BootScene.ts'
import { SplashScene } from './scenes/SplashScene.ts'
import { TitleScene } from './scenes/TitleScene.ts'
import { CreditsScene } from './scenes/CreditsScene.ts'
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
    // RESIZE, not FIT: the canvas becomes the viewport instead of a fixed
    // 1280x720 box letterboxed inside it. The world stays 1280x720 and the
    // camera moves over it, so no gameplay coordinate changes.
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
    width: display.width,
    height: display.height,
  },
  input: { activePointers: 3 },
  scene: [
    BootScene, SplashScene, TitleScene, CreditsScene, LoadoutScene,
    GameScene, HudScene, DiagnosticsScene,
  ],
}

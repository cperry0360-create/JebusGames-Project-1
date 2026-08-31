import Phaser from 'phaser'
import display from './data/display.json'
import { BootScene } from './scenes/BootScene.ts'
import { SplashScene } from './scenes/SplashScene.ts'
import { TitleScene } from './scenes/TitleScene.ts'
import { CreditsScene } from './scenes/CreditsScene.ts'
import { LoadoutScene } from './scenes/LoadoutScene.ts'
import { GameScene } from './scenes/GameScene.ts'
import { HudScene } from './scenes/HudScene.ts'

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: display.width,
  height: display.height,
  backgroundColor: display.backgroundColor,
  pixelArt: false,
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
  scene: [BootScene, SplashScene, TitleScene, CreditsScene, LoadoutScene, GameScene, HudScene],
}

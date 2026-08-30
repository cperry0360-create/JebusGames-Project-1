import Phaser from 'phaser'
import display from './data/display.json'
import { BootScene } from './scenes/BootScene.ts'
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
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, GameScene, HudScene],
}

import Phaser from 'phaser'
import display from './data/display.json'
import { BootScene } from './scenes/BootScene'

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: display.width,
  height: display.height,
  backgroundColor: display.backgroundColor,
  // Placeholder art is pixel-ish; nearest-neighbour keeps it crisp when scaled.
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  scene: [BootScene],
}

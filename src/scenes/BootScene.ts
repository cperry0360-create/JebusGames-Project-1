import Phaser from 'phaser'
import display from '../data/display.json'

/**
 * Phase 1 scaffold. Draws nothing but the background and a title so we can
 * confirm the build, the deploy and the canvas all work end to end.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }

  create(): void {
    const { width, height } = this.scale

    this.add
      .text(width / 2, height / 2, 'Courjahan Defense', {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: '48px',
        color: '#f4e9d8',
      })
      .setOrigin(0.5)

    this.add
      .text(width / 2, height / 2 + 48, `${display.width}x${display.height} · Phase 1`, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#f4e9d8',
      })
      .setOrigin(0.5)
      .setAlpha(0.6)
  }
}

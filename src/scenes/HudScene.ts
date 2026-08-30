import Phaser from 'phaser'
import displayData from '../data/display.json'
import { GameScene } from './GameScene.ts'

/** UI lives in its own scene so the world can Y-sort freely without the HUD
 *  ever landing in the middle of the sort order. */
export class HudScene extends Phaser.Scene {
  private world!: GameScene
  private goldText!: Phaser.GameObjects.Text
  private livesText!: Phaser.GameObjects.Text
  private waveText!: Phaser.GameObjects.Text
  private message!: Phaser.GameObjects.Text
  private heroLabel!: Phaser.GameObjects.Text
  private heroBar!: Phaser.GameObjects.Graphics
  private startBox!: Phaser.GameObjects.Rectangle
  private startLabel!: Phaser.GameObjects.Text

  constructor() {
    super('Hud')
  }

  create(): void {
    this.world = this.scene.get('Game') as GameScene
    const W = displayData.width

    this.add.rectangle(0, 0, W, 64, 0x14181f, 0.94).setOrigin(0, 0)
    this.add.rectangle(0, 63, W, 2, 0x3b4552).setOrigin(0, 0)

    this.goldText = this.add.text(16, 10, '', {
      fontFamily: 'monospace', fontSize: '20px', color: '#f2d06b',
    })
    this.livesText = this.add.text(150, 10, '', {
      fontFamily: 'monospace', fontSize: '20px', color: '#ff8f7a',
    })
    this.waveText = this.add.text(290, 10, '', {
      fontFamily: 'monospace', fontSize: '20px', color: '#f6ecd9',
    })
    this.message = this.add.text(16, 38, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#c2ab84',
    })

    this.buildStartButton()

    this.heroLabel = this.add.text(W - 16, 8, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#f6ecd9',
    }).setOrigin(1, 0)
    this.heroBar = this.add.graphics()

    this.add.text(W - 16, displayData.height - 18, 'art: Kenney Tower Defense (Top-Down), CC0', {
      fontFamily: 'monospace', fontSize: '11px', color: '#f6ecd9',
    }).setOrigin(1, 0).setAlpha(0.4)
  }

  private buildStartButton(): void {
    const x = 620
    this.startBox = this.add
      .rectangle(x, 12, 190, 40, 0x2f6b38, 1)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x6cc24a)
      .setInteractive({ useHandCursor: true })

    this.startLabel = this.add.text(x + 95, 24, 'START WAVE', {
      fontFamily: 'monospace', fontSize: '15px', color: '#f6ecd9',
    }).setOrigin(0.5, 0)

    this.startBox.on('pointerdown', () => this.world.startWave())
    this.startBox.on('pointerover', () => {
      if (this.world.status.phase === 'ready') this.startBox.setFillStyle(0x3f8a4a, 1)
    })
    this.startBox.on('pointerout', () => this.refreshStartButton())
  }

  private refreshStartButton(): void {
    const ready = this.world.status.phase === 'ready'
    this.startBox.setFillStyle(ready ? 0x2f6b38 : 0x2a3340, 1)
    this.startBox.setStrokeStyle(2, ready ? 0x6cc24a : 0x3b4552)
    this.startLabel.setColor(ready ? '#f6ecd9' : '#6f7a86')
  }

  update(): void {
    const s = this.world.status

    this.goldText.setText(`${s.gold}g`)
    this.livesText.setText(`♥ ${s.lives}`)
    const wave = Math.min(s.wave + 1, s.waveCount)
    this.waveText.setText(`Wave ${wave}/${s.waveCount}`)
    this.message.setText(s.message)

    this.refreshStartButton()
    if (s.phase === 'ready') {
      this.startLabel.setText(`START WAVE ${wave}`)
    } else if (s.phase === 'wave') {
      this.startLabel.setText(`${s.waveName}  ·  ${s.enemiesLeft} left`)
    } else {
      this.startLabel.setText(s.phase === 'won' ? 'CLEARED' : 'OVERRUN')
    }

    this.drawHeroBar(s)
  }

  private drawHeroBar(s: GameScene['status']): void {
    const w = 160
    const x = displayData.width - 16 - w
    const y = 30

    let state = ''
    if (s.heroDown) state = ' — DOWN'
    else if (s.lastStand) state = ' — DAD MODE'
    this.heroLabel.setText(`${s.heroName}${state}`)
    this.heroLabel.setColor(s.lastStand ? '#ff5a3c' : '#f6ecd9')

    const ratio = Phaser.Math.Clamp(s.heroHealth / Math.max(s.heroMax, 1), 0, 1)
    this.heroBar.clear()
    this.heroBar.fillStyle(0x000000, 0.5).fillRect(x, y, w, 12)
    this.heroBar.fillStyle(s.heroDown ? 0x5a5a5a : s.lastStand ? 0xff5a3c : 0x4fa3e3, 1)
    this.heroBar.fillRect(x + 1, y + 1, (w - 2) * ratio, 10)
    // The 25% mark, so the Last Stand threshold is legible before it fires.
    const markX = x + 1 + (w - 2) * 0.25
    this.heroBar.lineStyle(1, 0xf6ecd9, 0.7).lineBetween(markX, y, markX, y + 12)
  }
}

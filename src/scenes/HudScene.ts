import Phaser from 'phaser'
import displayData from '../data/display.json'
import { GameScene } from './GameScene.ts'

/** UI lives in its own scene so the world can Y-sort freely without the HUD
 *  ever landing in the middle of the sort order. */
export class HudScene extends Phaser.Scene {
  private world!: GameScene
  private readout!: Phaser.GameObjects.Text
  private message!: Phaser.GameObjects.Text
  private heroLabel!: Phaser.GameObjects.Text
  private heroBar!: Phaser.GameObjects.Graphics
  private buttons: Array<{
    id: string
    cost: number
    box: Phaser.GameObjects.Rectangle
    label: Phaser.GameObjects.Text
  }> = []

  constructor() {
    super('Hud')
  }

  create(): void {
    this.world = this.scene.get('Game') as GameScene

    this.add.rectangle(0, 0, displayData.width, 56, 0x14181f, 0.92).setOrigin(0, 0)

    this.readout = this.add.text(14, 8, '', {
      fontFamily: 'monospace',
      fontSize: '17px',
      color: '#f6ecd9',
    })

    this.message = this.add.text(14, 31, '', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#c2ab84',
    })

    this.buildTowerButtons()

    this.heroLabel = this.add.text(displayData.width - 14, 8, '', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#f6ecd9',
    }).setOrigin(1, 0)
    this.heroBar = this.add.graphics()

    if (this.world.usingPlaceholderArt()) {
      this.add.text(displayData.width - 14, displayData.height - 20, 'placeholder art — drop the Kenney pack in public/assets/kenney/', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#f6ecd9',
      }).setOrigin(1, 0).setAlpha(0.45)
    }
  }

  private buildTowerButtons(): void {
    let x = 470
    this.world.towerDefs().forEach((entry, i) => {
      const width = 200
      const box = this.add
        .rectangle(x, 8, width, 40, 0x2a3340, 0.95)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0x4a5666)
        .setInteractive({ useHandCursor: true })

      const label = this.add.text(x + 10, 15, `${i + 1}. ${entry.def.name}  ${entry.def.cost}g`, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#f6ecd9',
      })

      box.on('pointerdown', () => {
        this.world.selectTower(this.world.status.selected === entry.id ? null : entry.id)
      })

      this.buttons.push({ id: entry.id, cost: entry.def.cost, box, label })
      x += width + 12
    })
  }

  update(): void {
    const s = this.world.status

    const wave = Math.min(s.wave + 1, s.waveCount)
    const timer = s.phase === 'countdown' ? `  next in ${Math.ceil(s.countdown)}s` : ''
    this.readout.setText(`${s.gold}g   lives ${s.lives}   wave ${wave}/${s.waveCount}${timer}`)
    this.message.setText(s.message)

    for (const b of this.buttons) {
      const selected = s.selected === b.id
      const affordable = s.gold >= b.cost
      b.box.setFillStyle(selected ? 0x3f6a3a : 0x2a3340, 0.95)
      b.box.setStrokeStyle(2, selected ? 0x8fd07a : 0x4a5666)
      b.label.setColor(affordable ? '#f6ecd9' : '#7d7568')
    }

    this.drawHeroBar(s)
  }

  private drawHeroBar(s: GameScene['status']): void {
    const w = 150
    const x = displayData.width - 14 - w
    const y = 28

    let state = ''
    if (s.heroDown) state = ' — DOWN'
    else if (s.lastStand) state = ' — DAD MODE'
    this.heroLabel.setText(`${s.heroName}${state}`)
    this.heroLabel.setColor(s.lastStand ? '#ff5a3c' : '#f6ecd9')

    const ratio = Phaser.Math.Clamp(s.heroHealth / Math.max(s.heroMax, 1), 0, 1)
    this.heroBar.clear()
    this.heroBar.fillStyle(0x000000, 0.5).fillRect(x, y, w, 10)
    this.heroBar.fillStyle(s.heroDown ? 0x5a5a5a : s.lastStand ? 0xff5a3c : 0x4fa3e3, 1)
    this.heroBar.fillRect(x + 1, y + 1, (w - 2) * ratio, 8)

    // The 25% mark, so the Last Stand threshold is legible before it fires.
    const markX = x + 1 + (w - 2) * 0.25
    this.heroBar.lineStyle(1, 0xf6ecd9, 0.6).lineBetween(markX, y, markX, y + 10)
  }
}

import Phaser from 'phaser'
import displayData from '../data/display.json'
import { queueArt, SPRITE_KEYS } from '../systems/ArtLoader.ts'

/** Loads the Kenney pack, then hands over to the game. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }

  preload(): void {
    const cx = displayData.width / 2
    const cy = displayData.height / 2

    const label = this.add.text(cx, cy - 30, 'Courjahan Defense', {
      fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '40px', color: '#f6ecd9',
    }).setOrigin(0.5)

    const barBg = this.add.rectangle(cx, cy + 30, 320, 14, 0x14181f).setStrokeStyle(2, 0x4a5666)
    const bar = this.add.rectangle(cx - 158, cy + 30, 0, 10, 0x6cc24a).setOrigin(0, 0.5)

    this.load.on(Phaser.Loader.Events.PROGRESS, (v: number) => bar.setSize(316 * v, 10))
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      console.error(`[art] failed to load "${file.key}" from ${file.url}`)
    })
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      label.destroy()
      barBg.destroy()
      bar.destroy()
    })

    queueArt(this)
  }

  create(): void {
    const missing = SPRITE_KEYS.filter((k) => !this.textures.exists(k))
    if (missing.length > 0) {
      // Better a loud message than a screen of invisible sprites.
      console.error('[art] missing textures:', missing.join(', '))
      this.add.text(40, 40, `Missing art:\n${missing.join('\n')}`, {
        fontFamily: 'monospace', fontSize: '14px', color: '#ff6b5a',
      })
      return
    }
    this.scene.start('Game')
    this.scene.launch('Hud')
  }
}

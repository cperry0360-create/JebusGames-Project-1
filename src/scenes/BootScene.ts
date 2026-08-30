import Phaser from 'phaser'
import displayData from '../data/display.json'
import { queueArt, SPRITE_KEYS } from '../systems/ArtLoader.ts'
import { queueSfx } from '../systems/Sfx.ts'
import { COLOR, FONT_DISPLAY } from '../ui/Theme.ts'

/** Loads the Kenney art and the synthesised cues, then hands over to the title. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }

  preload(): void {
    const cx = displayData.width / 2
    const cy = displayData.height / 2

    const label = this.add.text(cx, cy - 34, 'COURJAHAN DEFENSE', {
      fontFamily: FONT_DISPLAY, fontSize: '40px', color: COLOR.ink,
    }).setOrigin(0.5)

    const bar = this.add.rectangle(cx - 158, cy + 30, 0, 10, 0x6cc24a).setOrigin(0, 0.5)
    const frame = this.add.rectangle(cx, cy + 30, 320, 14).setStrokeStyle(2, 0x4a5666)

    this.load.on(Phaser.Loader.Events.PROGRESS, (v: number) => bar.setSize(316 * v, 10))
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      console.error(`[assets] failed to load "${file.key}" from ${file.url}`)
    })
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      label.destroy()
      bar.destroy()
      frame.destroy()
    })

    queueArt(this)
    queueSfx(this)
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
    this.scene.start('Title')
  }
}

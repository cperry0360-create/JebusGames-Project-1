import Phaser from 'phaser'
import { getVolume, isMuted, play, setVolume, toggleMuted } from '../systems/Audio.ts'
import { iconPlate } from './Plate.ts'
import { COLOR, FONT_UI } from './Theme.ts'

/**
 * The settings, such as they are: mute, and a volume that steps rather than
 * slides.
 *
 * A drag slider is the wrong control for a corner of a tower defense screen —
 * it is fiddly on a trackpad and impossible to hit mid-wave — so the speaker
 * toggles mute and the two small buttons beside it step the volume. Both are
 * written straight to save data, so the setting survives the run and the tab.
 *
 * The speaker is drawn rather than an asset, because there is no speaker in
 * any of the packs and a letter M would be worse.
 */
export class AudioToggle {
  private readonly plate: ReturnType<typeof iconPlate>
  private readonly glyph: Phaser.GameObjects.Graphics
  private readonly readout: Phaser.GameObjects.Text
  readonly parts: Phaser.GameObjects.GameObject[] = []

  /**
   * `bottomLimit` is the bottom of whatever coordinate space this is drawn in.
   * It defaults to the viewport, which is right for the HUD; a fitted menu is
   * laid out against the 1280x720 design box and has to say so, or the clamp
   * below measures against the wrong number and throws the readout into the
   * middle of the screen.
   */
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    size = 40,
    bottomLimit = scene.scale.height,
  ) {
    this.plate = iconPlate(scene, x, y, size, size)
    this.glyph = scene.add.graphics()
    const hit = scene.add.rectangle(x, y, size, size, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true })
    hit.on('pointerdown', () => {
      const muted = toggleMuted()
      // The click has to be audible on the way back on, and silent on the way
      // off, which means playing it after the state change either way.
      if (!muted) play(scene, 'click')
      this.refresh()
    })
    hit.on('pointerover', () => this.plate.setActive(true))
    hit.on('pointerout', () => this.plate.setActive(!isMuted()))

    const step = (dx: number, label: string, delta: number): Phaser.GameObjects.Text => {
      const t = scene.add.text(x + dx, y, label, {
        fontFamily: FONT_UI, fontSize: '22px', color: COLOR.ink,
        fontStyle: 'bold', stroke: '#0d1016', strokeThickness: 4,
      }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      t.on('pointerdown', () => {
        setVolume(Math.round((getVolume() + delta) * 10) / 10)
        play(scene, 'click')
        this.refresh()
      })
      return t
    }
    const down = step(size * 0.78, '−', -0.1)
    const up = step(size * 1.32, '+', 0.1)

    this.readout = scene.add.text(x + size * 1.05, y + size * 0.52, '', {
      fontFamily: FONT_UI, fontSize: '15px', color: COLOR.dim,
      stroke: '#0d1016', strokeThickness: 3,
    }).setOrigin(0.5, 0)
    // The toggle sits in the bottom-left corner, and the readout hangs below
    // it — far enough below, at some sizes, to fall off the bottom of the
    // screen. Clamped here rather than by tuning each caller's Y, so it cannot
    // come back the next time one of them moves.
    const overhang = this.readout.getBounds().bottom - bottomLimit + 6
    if (overhang > 0) this.readout.y -= overhang

    this.parts.push(...this.plate.parts, this.glyph, hit, down, up, this.readout)
    this.refresh()
  }

  setDepth(depth: number): void {
    for (const p of this.parts) (p as Phaser.GameObjects.Image).setDepth?.(depth)
  }

  private refresh(): void {
    const muted = isMuted()
    // Lit means sound is on. Muted is the plate switched off, which is what
    // an unlit button means everywhere else in the game.
    this.plate.setActive(!muted)
    this.readout.setText(muted ? 'MUTED' : `${Math.round(getVolume() * 100)}%`)
    this.drawSpeaker(muted)
  }

  /** A speaker cone, with the sound waves replaced by a slash when muted. */
  private drawSpeaker(muted: boolean): void {
    const { x, y } = this.plate.plate
    const g = this.glyph
    const c = muted ? 0x8b939c : 0xf6ecd9
    g.clear()
    g.fillStyle(c, 1)
    g.fillRect(x - 9, y - 4, 5, 8)
    g.beginPath()
    g.moveTo(x - 4, y - 4)
    g.lineTo(x + 2, y - 10)
    g.lineTo(x + 2, y + 10)
    g.lineTo(x - 4, y + 4)
    g.closePath()
    g.fillPath()

    g.lineStyle(2, c, 1)
    if (muted) {
      g.lineBetween(x + 4, y - 6, x + 12, y + 6)
      g.lineBetween(x + 12, y - 6, x + 4, y + 6)
    } else {
      g.beginPath()
      g.arc(x + 2, y, 7, -0.9, 0.9)
      g.strokePath()
      g.beginPath()
      g.arc(x + 2, y, 11, -0.8, 0.8)
      g.strokePath()
    }
  }
}

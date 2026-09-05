import Phaser from 'phaser'
import { isMuted, nudgeAllVolumes, overallVolume, play, toggleMuted } from '../systems/Audio.ts'
import { iconPlate } from './Plate.ts'
import { COLOR, FONT_UI } from './Theme.ts'
import { viewH } from '../systems/Resolution.ts'
import { tapFloor } from '../systems/Layout.ts'

/**
 * The title screen's audio control: mute, and a volume that steps rather than
 * slides.
 *
 * It moves all three channels together. The in-run settings dialog is where
 * music, effects and voice are balanced against each other; this is the one
 * knob a player reaches for before a run has started, and it should behave
 * like one.
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
    bottomLimit = viewH(scene),
  ) {
    // THE PLATE IS THE ART; THE TAP TARGET IS BIGGER THAN THE ART.
    //
    // This screen is composed against the design box and fitted, so at 844x390
    // the whole box renders at 54% and this 40-unit plate is 22 CSS pixels --
    // half the 44pt minimum. The two step glyphs were worse: they were bare
    // Text objects made interactive, so their hit area was the ink of a single
    // character, 9x16.
    //
    // Growing the plate would change the screen's look for a rule about
    // fingers, so the painted plate keeps `size` and an invisible rectangle
    // around it carries the touch. `tapFloor` only grows it where the fit is
    // small, so a desktop window is untouched.
    const tap = tapFloor(scene, size)
    this.plate = iconPlate(scene, x, y, size, size)
    this.glyph = scene.add.graphics()
    const hit = scene.add.rectangle(x, y, tap, tap, 0xffffff, 0.001)
      .setName('audio:mute')
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
      }).setOrigin(0.5)
      // The glyph draws; a rectangle the size of a fingertip takes the tap.
      const box = scene.add.rectangle(x + dx, y, tap, tap, 0xffffff, 0.001)
        .setName(`audio:${delta < 0 ? 'down' : 'up'}`)
        .setInteractive({ useHandCursor: true })
      box.on('pointerdown', () => {
        // ALL THREE CHANNELS. This used to call setVolume, whose default
        // channel is `sfx`, so turning the volume down here left the music and
        // the recorded lines untouched — with the soundtrack playing over the
        // title, the control did almost nothing you could hear.
        nudgeAllVolumes(delta)
        play(scene, 'click')
        this.refresh()
      })
      return t
    }
    // SPACED BY THE TAP TARGET, not by the plate. At `size * 0.78` and
    // `size * 1.32` the three hit rectangles would sit 0.54 of a plate apart
    // and overlap each other completely once each is 44pt wide, so a tap on
    // "louder" would land on "quieter".
    const down = step(tap * 1.0, '−', -0.1)
    const up = step(tap * 2.0, '+', 0.1)

    // On the same line as the two step buttons rather than under them. Below
    // them it ran into the minus sign at small plate sizes, and cost a second
    // row of height in a band that does not have one.
    this.readout = scene.add.text(x + tap * 3.0, y, '', {
      fontFamily: FONT_UI, fontSize: '15px', color: COLOR.dim,
      stroke: '#0d1016', strokeThickness: 3,
    }).setOrigin(0, 0.5)
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
    this.readout.setText(muted ? 'MUTED' : `${Math.round(overallVolume() * 100)}%`)
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

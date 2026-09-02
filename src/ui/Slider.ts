import Phaser from 'phaser'
import { COLOR, FONT_UI } from './Theme.ts'
import { pointerToScreen } from '../systems/Resolution.ts'
import presentationData from '../data/presentation.json'

const CFG = presentationData.settings

/** The three glyphs, drawn rather than loaded: there is no note, no speaker
 *  and no mouth in any of the packs, and a letter would be worse. */
export type SliderIcon = 'music' | 'sfx' | 'voice'

/**
 * One labelled volume slider: icon, name, filled track, round handle, percent.
 *
 * THE WHOLE ROW IS THE CONTROL, not the handle. A 22px circle is under half
 * what a thumb can reliably land on, and chasing one along a track on a phone
 * is the kind of fiddliness that made the old stepped +/- buttons look like a
 * good idea. A press anywhere on the row jumps the handle to it and starts a
 * drag, so the handle is a readout rather than a target.
 *
 * Phaser-free arithmetic is not possible here — it draws — but the mapping
 * between a press and a value is one line and is tested through the component
 * the same way the ring's is: by position, in the browser, at both viewports.
 */
export class Slider {
  readonly parts: Phaser.GameObjects.GameObject[] = []
  /** The row's hit area, so a test can find it and press it. */
  readonly hit: Phaser.GameObjects.Rectangle
  private readonly bar: Phaser.GameObjects.Graphics
  private readonly readout: Phaser.GameObjects.Text
  private readonly trackX: number
  private readonly trackW: number
  private readonly midY: number
  private value: number

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    label: string,
    icon: SliderIcon,
    value: number,
    private readonly onChange: (v: number) => void,
  ) {
    this.value = Math.max(0, Math.min(1, value))
    this.midY = y + CFG.rowHeight / 2

    const glyph = scene.add.graphics()
    drawIcon(glyph, icon, x + CFG.iconSize / 2, this.midY, CFG.iconSize)
    this.parts.push(glyph)

    const labelX = x + CFG.iconSize + 8
    const name = scene.add.text(labelX, this.midY, label, {
      fontFamily: FONT_UI, fontSize: `${CFG.labelSize}px`, fontStyle: 'bold',
      color: COLOR.ink, letterSpacing: 1,
    }).setOrigin(0, 0.5)
    this.parts.push(name)

    // The track starts after the widest label rather than after this one, so
    // the three rows line up with each other.
    this.trackX = labelX + CFG.labelColumn
    this.trackW = Math.max(40, width - (this.trackX - x) - CFG.valueWidth - 8)

    this.bar = scene.add.graphics()
    this.parts.push(this.bar)

    this.readout = scene.add.text(x + width, this.midY, '', {
      fontFamily: FONT_UI, fontSize: `${CFG.valueSize}px`, fontStyle: 'bold',
      color: COLOR.amber,
    }).setOrigin(1, 0.5)
    this.parts.push(this.readout)

    this.hit = scene.add
      .rectangle(x + width / 2, this.midY, width, CFG.rowHeight, 0xffffff, 0.001)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true, draggable: true })
    this.hit.name = `settings:${icon}`
    this.parts.push(this.hit)

    // THE POINTER, IN THE SAME SPACE AS THE TRACK, and this is the fourth time
    // that sentence has been the fix. `pointer.x` is CANVAS pixels — at
    // devicePixelRatio 3 it is three times the number the layout is written
    // in, so every press resolved past the right-hand end and the slider sat
    // pinned at 100%.
    //
    // This file was written AFTER `worldToScreen` was added to stop exactly
    // this, and still got it wrong, because that helper takes a point on the
    // MAP and a pointer is not one. `pointerToScreen` is the missing half of
    // the pair; see Resolution.ts.
    //
    // Caught because the probe asserted the VALUE moved rather than that the
    // handler fired. A handler firing would have looked perfect.
    const at = (p: Phaser.Input.Pointer): number => pointerToScreen(scene, p).x
    const set = (px: number): void => {
      const t = (px - this.trackX) / this.trackW
      this.value = Math.max(0, Math.min(1, t))
      this.draw()
      this.onChange(this.value)
    }
    this.hit.on('pointerdown', (p: Phaser.Input.Pointer) => set(at(p)))
    this.hit.on('drag', (p: Phaser.Input.Pointer) => set(at(p)))
    // A drag that leaves the row keeps setting the value: letting go of a
    // slider because your thumb strayed 3px off the track is not a gesture
    // anybody means.
    this.hit.on('dragend', (p: Phaser.Input.Pointer) => set(at(p)))

    this.draw()
  }

  private draw(): void {
    const h = CFG.trackHeight
    const y = this.midY - h / 2
    this.bar.clear()
    this.bar.fillStyle(0x0d1016, 0.9)
    this.bar.fillRoundedRect(this.trackX, y, this.trackW, h, h / 2)
    this.bar.fillStyle(0x4fa3e3, 1)
    this.bar.fillRoundedRect(this.trackX, y, Math.max(h, this.trackW * this.value), h, h / 2)
    const hx = this.trackX + this.trackW * this.value
    this.bar.fillStyle(0x0d1016, 1).fillCircle(hx, this.midY, CFG.handleRadius)
    this.bar.fillStyle(0xf6ecd9, 1).fillCircle(hx, this.midY, CFG.handleRadius - 3)
    this.readout.setText(`${Math.round(this.value * 100)}%`)
  }
}

function drawIcon(g: Phaser.GameObjects.Graphics, kind: SliderIcon, cx: number, cy: number, size: number): void {
  const s = size / 2
  g.fillStyle(0xf6ecd9, 1)
  g.lineStyle(2, 0xf6ecd9, 1)
  if (kind === 'music') {
    // A quaver: a stem with a filled head.
    g.fillRect(cx + s * 0.15, cy - s, 2.5, s * 1.5)
    g.fillCircle(cx + s * 0.05, cy + s * 0.55, s * 0.42)
    g.beginPath()
    g.moveTo(cx + s * 0.15, cy - s)
    g.lineTo(cx + s * 0.8, cy - s * 0.6)
    g.strokePath()
    return
  }
  if (kind === 'sfx') {
    // A speaker cone with two arcs.
    g.fillTriangle(cx - s * 0.15, cy - s * 0.55, cx - s * 0.15, cy + s * 0.55, cx - s * 0.8, cy)
    g.fillRect(cx - s * 0.85, cy - s * 0.28, s * 0.5, s * 0.56)
    for (const r of [s * 0.45, s * 0.75]) {
      g.beginPath()
      g.arc(cx - s * 0.1, cy, r, -Math.PI / 3, Math.PI / 3)
      g.strokePath()
    }
    return
  }
  // A head in profile with a sound arc: the voice lines.
  g.fillCircle(cx - s * 0.25, cy - s * 0.3, s * 0.36)
  g.fillTriangle(
    cx - s * 0.75, cy + s * 0.8, cx + s * 0.25, cy + s * 0.8, cx - s * 0.25, cy + s * 0.05,
  )
  g.beginPath()
  g.arc(cx + s * 0.15, cy - s * 0.2, s * 0.6, -Math.PI / 3, Math.PI / 3)
  g.strokePath()
}

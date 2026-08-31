import Phaser from 'phaser'
import { platePanel, plateButton } from './Plate.ts'
import { COLOR, FONT_DISPLAY, FONT_UI } from './Theme.ts'
import { play } from '../systems/Audio.ts'

/**
 * A modal panel on the dialog plate.
 *
 * Anything that spends the player's peanuts asks first. The sign bribe used to
 * take them on a single tap with no prompt, which is exactly the kind of thing
 * a misjudged tap should never be able to do.
 *
 * It owns its own input blocker, so a tap anywhere outside the panel is
 * swallowed rather than reaching the map underneath — a confirm dialog you can
 * accidentally build a tower through is not a confirm dialog.
 */

export interface DialogRow {
  label: string
  value: string
  /** Draws the value in the warm colour, for a cost or a gain. */
  accent?: boolean
}

export interface DialogOptions {
  title: string
  /** A line under the title, for flavour or a warning. */
  subtitle?: string
  rows?: DialogRow[]
  /** The action button. Omitted for an informational panel. */
  confirm?: { label: string; onPick: () => void; enabled?: boolean }
  /** A second action beside confirm, for a panel that offers two things —
   *  upgrading a tower and selling it are not the same button. */
  extra?: { label: string; onPick: () => void; enabled?: boolean }
  /** The way out. Always present: a dialog with no cancel is a trap. */
  cancelLabel?: string
  onCancel?: () => void
  width?: number
  /** How much the world behind is dimmed. A confirm can afford to darken the
   *  screen; a panel opened mid-wave should not hide the wave. */
  dim?: number
}

const ROW_H = 22
/** Space above the title, inside the plate's own chrome. */
const TOP_PAD = 46
/** Space below the body for the button row plus the plate's bottom chrome,
 *  which on this plate reaches ~73px in and would otherwise sit over them. */
const BUTTON_BAND = 128

type Weight = 'primary' | 'secondary'

export class Dialog {
  private readonly scene: Phaser.Scene
  /** Public so a test can find a button by its label rather than by a
   *  coordinate that moves whenever the panel gains a row. */
  readonly layer: Phaser.GameObjects.Container
  private readonly blocker: Phaser.GameObjects.Rectangle
  private closed = false
  private closedHandler?: () => void

  constructor(scene: Phaser.Scene, x: number, y: number, depth: number, opts: DialogOptions) {
    this.scene = scene
    const w = opts.width ?? 540

    // Swallows every tap that is not on the dialog itself, and dismisses on
    // one. A panel that only its own button can close is a trap over a live
    // battlefield: the wave keeps coming while the player hunts for the way
    // out. The tap is still consumed, so dismissing never also acts on the map.
    this.blocker = scene.add
      .rectangle(0, 0, scene.scale.width * 2, scene.scale.height * 2, 0x000000, opts.dim ?? 0.45)
      .setOrigin(0.5)
      .setInteractive()
    this.blocker.on('pointerdown', () => this.close())

    this.layer = scene.add.container(x, y).setDepth(depth).setScale(0.86)
    scene.tweens.add({ targets: this.layer, scale: 1, duration: 170, ease: 'Back.easeOut' })
    play(scene, 'open')

    // The body is built first and measured, then the plate is sized around it.
    // Assuming a one-line subtitle put a wrapped flavour line through the first
    // stat row.
    const body: Phaser.GameObjects.GameObject[] = []
    let ty = 0

    const title = scene.add.text(0, ty, opts.title, {
      fontFamily: FONT_DISPLAY, fontSize: '22px', color: COLOR.ink,
    }).setOrigin(0.5, 0)
    body.push(title)
    ty += title.height + 8

    if (opts.subtitle) {
      const sub = scene.add.text(0, ty, opts.subtitle, {
        fontFamily: FONT_UI, fontSize: '13px', color: COLOR.dim,
        align: 'center', wordWrap: { width: w - 130 },
      }).setOrigin(0.5, 0)
      body.push(sub)
      ty += sub.height + 12
    }

    // Label left, value right, against the panel's inner face.
    const inset = w / 2 - 84
    for (const row of opts.rows ?? []) {
      body.push(scene.add.text(-inset, ty, row.label, {
        fontFamily: FONT_UI, fontSize: '13px', color: COLOR.dim,
      }).setOrigin(0, 0))
      body.push(scene.add.text(inset, ty, row.value, {
        fontFamily: FONT_UI, fontSize: '14px',
        color: row.accent ? COLOR.amber : COLOR.ink,
      }).setOrigin(1, 0))
      ty += ROW_H
    }

    // One row of buttons, laid out from however many there are, so a panel with
    // a sell button does not have to know where cancel ended up. Labels carry
    // no numbers: the costs are already on their own rows above, and a label
    // long enough to hold one overflows its plate.
    const row: Array<{ label: string; onPick: () => void; enabled?: boolean; weight: Weight }> = []
    if (opts.confirm) row.push({ ...opts.confirm, weight: 'primary' })
    if (opts.extra) row.push({ ...opts.extra, weight: 'secondary' })
    row.push({
      label: opts.cancelLabel ?? (row.length > 0 ? 'CANCEL' : 'CLOSE'),
      onPick: () => opts.onCancel?.(),
      weight: 'secondary',
    })

    const h = TOP_PAD + ty + BUTTON_BAND
    const top = -h / 2
    for (const o of body) (o as Phaser.GameObjects.Text).y += top + TOP_PAD

    const parts: Phaser.GameObjects.GameObject[] = [
      ...platePanel(scene, -w / 2, top, w, h),
      ...body,
    ]

    // Placed under the body rather than up from the bottom edge, so the plate's
    // chrome grows below them instead of over them.
    const btnY = top + TOP_PAD + ty + 34
    const gap = 12
    const bw = Math.min(170, (w - 56 - gap * (row.length - 1)) / row.length)
    const total = row.length * bw + (row.length - 1) * gap
    row.forEach((b, i) => {
      const bx = -total / 2 + bw / 2 + i * (bw + gap)
      // 13px: the plate's end caps eat ~62px of a 150px button, and a longer
      // label at 15px runs under them.
      const btn = plateButton(scene, bx, btnY, bw, 46, b.label,
        () => { b.onPick(); this.close() }, 13, b.weight)
      if (b.enabled === false) btn.setEnabled(false)
      parts.push(...btn.parts)
    })

    this.layer.add(parts)
    this.blocker.setDepth(depth - 1)
  }

  get active(): boolean {
    return !this.closed
  }

  /** The blocker and the panel, for a scene that renders screen space on its
   *  own camera. Both must be handed over or the dialog pans with the map. */
  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.blocker, this.layer]
  }

  /**
   * True when this tap belongs to the dialog, so the world ignores it.
   *
   * Deliberately still true for the tap that *closed* the dialog. Phaser hit-
   * tests before it dispatches, so a press on a dialog button reaches the
   * button first — which closes the dialog — and then reaches the scene's own
   * handler with the dialog already gone. Testing `active` there let the same
   * click confirm a purchase and then order the hero on the map behind it. The
   * captured hit list still holds the blocker, so it is the reliable signal.
   */
  owns(objects: Phaser.GameObjects.GameObject[]): boolean {
    if (objects.includes(this.blocker)) return true
    // Phaser's input is topOnly by default, so a press on a dialog button puts
    // only that button in the hit list, never the blocker underneath it. The
    // layer still holds the button here — close() destroys it on the tween,
    // not on the press — so this is what actually catches the closing tap.
    return objects.some((o) => this.layer.list?.includes(o))
  }

  /** Called once the dialog has gone, so the scene can hand input back. */
  onClosed(fn: () => void): void {
    this.closedHandler = fn
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    play(this.scene, 'close')
    this.closedHandler?.()
    this.blocker.destroy()
    this.scene.tweens.add({
      targets: this.layer, alpha: 0, scale: 0.9, duration: 150,
      onComplete: () => this.layer.destroy(true),
    })
  }
}

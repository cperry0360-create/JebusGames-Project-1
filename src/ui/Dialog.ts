import Phaser from 'phaser'
import { platePanel, plateButton } from './Plate.ts'
import { BODY_SPACING, COLOR, FONT_DISPLAY, FONT_UI } from './Theme.ts'
import { play } from '../systems/Audio.ts'
import { viewH, viewW } from '../systems/Resolution.ts'

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

/**
 * One side of a fork.
 *
 * A choice between two permanent options is not a list of stats, and rendering
 * it as one is what broke the tier-3 panel: the two specializations were two
 * label/value rows, so a long stat string ran leftward across its own label
 * and straight into the next option's name. Each option gets its own card
 * instead — name, stats, price, button — so there is no shared line for two
 * options to collide on.
 */
export interface DialogChoice {
  name: string
  /** The stat list, one point per line. Never one long string: a string is
   *  what has to be wrapped, and wrapping is what overlapped. */
  lines: string[]
  cost: string
  /** How long the tower spends building it. */
  takes: string
  /** The button. Defaults to the option's own name. */
  label?: string
  onPick: () => void
  enabled?: boolean
}

export interface DialogOptions {
  title: string
  /** A line under the title, for flavour or a warning. */
  subtitle?: string
  rows?: DialogRow[]
  /** Two (or more) mutually exclusive options, each in its own card with its
   *  own button. Replaces confirm/extra: the choice *is* the action. */
  choices?: DialogChoice[]
  /** One number set large above the rows, for a panel that has a headline
   *  rather than a list — the Banner Points a run paid out. */
  headline?: { label: string; value: string }
  /** The action button. Omitted for an informational panel. */
  confirm?: { label: string; onPick: () => void; enabled?: boolean }
  /** A second action beside confirm, for a panel that offers two things —
   *  upgrading a tower and selling it are not the same button. */
  extra?: { label: string; onPick: () => void; enabled?: boolean }
  /**
   * A LIST of ways out, replacing confirm/extra/cancel entirely.
   *
   * The end-of-level screens are what this is for. A win offers four things —
   * next level, replay, level select, main menu — and confirm plus extra plus
   * cancel is three, in a fixed order, with the last one always styled as the
   * way out. Bolting a fourth on would have meant a `third?:` field and then a
   * `fourth?:`, each with its own name for what is really the same thing.
   *
   * They WRAP, at two per row. Four 122px buttons in one row on a 580px panel
   * is legible on a desktop and unreadable once the panel scales itself down
   * to fit a 375px-wide phone, which it does — so a long list becomes a grid
   * rather than a thinner row. Two per row keeps every button the width the
   * two-button panels already use.
   *
   * The FIRST is the primary unless one says otherwise: on these screens the
   * thing the player almost always wants is the first thing offered.
   */
  actions?: Array<{ label: string; onPick: () => void; enabled?: boolean; weight?: Weight }>
  /** The way out. Always present: a dialog with no cancel is a trap. */
  cancelLabel?: string
  onCancel?: () => void
  width?: number
  /** How much the world behind is dimmed. A confirm can afford to darken the
   *  screen; a panel opened mid-wave should not hide the wave. */
  dim?: number
  /**
   * Whether a tap outside the panel closes it. True everywhere except the
   * results screen: the run is over there, so dismissing would leave the
   * player on a dead board with no way off it. The blocker still swallows the
   * tap either way.
   */
  dismissable?: boolean
}

const ROW_H = 26
/** Inside a choice card, between its edge and its contents. */
const CARD_PAD = 14
/** Between two choice cards. Wide enough to read as separation rather than as
 *  a gap in one list. */
const CARD_GAP = 16
const CHOICE_BTN_H = 44
/** Space left around a panel that had to be scaled down to fit. */
const MARGIN = 24
/** Space above the title, inside the plate's own chrome. */
const TOP_PAD = 54
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
  /** How much the panel had to shrink to fit the viewport. 1 on any screen
   *  tall enough to hold it. */
  private fit = 1

  constructor(scene: Phaser.Scene, x: number, y: number, depth: number, opts: DialogOptions) {
    this.scene = scene
    const w = opts.width ?? 580

    // Swallows every tap that is not on the dialog itself, and dismisses on
    // one. A panel that only its own button can close is a trap over a live
    // battlefield: the wave keeps coming while the player hunts for the way
    // out. The tap is still consumed, so dismissing never also acts on the map.
    //
    // Centred on the viewport centre, NOT on (0, 0). Centring on the corner and
    // relying on being oversize covers the whole screen only at
    // devicePixelRatio 1: the UI camera's zoom is the device ratio, so at 3 the
    // rect's right edge lands at half the canvas and the dim stops there. Same
    // fault, same fix as ScratchCard's. Measured by corner luminance, which is
    // what tests/scrim.test.ts and the harness scenario "scrim" now assert.
    this.blocker = scene.add
      .rectangle(viewW(scene) / 2, viewH(scene) / 2,
        viewW(scene) * 1.5, viewH(scene) * 1.5, 0x000000, opts.dim ?? 0.45)
      .setOrigin(0.5)
      .setInteractive()
    if (opts.dismissable !== false) this.blocker.on('pointerdown', () => this.close())

    this.layer = scene.add.container(x, y).setDepth(depth)
    play(scene, 'open')

    // The body is built first and measured, then the plate is sized around it.
    // Assuming a one-line subtitle put a wrapped flavour line through the first
    // stat row.
    const body: Phaser.GameObjects.GameObject[] = []
    let ty = 0

    // Sized up and set in the sans. At 26px the display face turned THE LINE
    // BROKE into THE LINE BROHE; a title the player has to decode is worse
    // than one that is merely a different typeface.
    const title = scene.add.text(0, ty, opts.title, {
      fontFamily: FONT_UI, fontSize: '30px', fontStyle: 'bold',
      color: COLOR.ink, letterSpacing: 1,
    }).setOrigin(0.5, 0)
    body.push(title)
    ty += title.height + 8

    if (opts.subtitle) {
      const sub = scene.add.text(0, ty, opts.subtitle, {
        fontFamily: FONT_UI, fontSize: '16px', color: COLOR.dim, ...BODY_SPACING,
        align: 'center', wordWrap: { width: w - 110 },
      }).setOrigin(0.5, 0)
      body.push(sub)
      ty += sub.height + 12
    }

    // The headline, if there is one: the number first and large, its label
    // under it. A results screen has one number that matters and a list of
    // numbers that explain it, and they should not look alike.
    if (opts.headline) {
      const big = scene.add.text(0, ty, opts.headline.value, {
        fontFamily: FONT_DISPLAY, fontSize: '58px', color: COLOR.amber,
      }).setOrigin(0.5, 0)
      body.push(big)
      ty += big.height + 2
      const cap = scene.add.text(0, ty, opts.headline.label, {
        fontFamily: FONT_UI, fontSize: '15px', color: COLOR.dim,
        fontStyle: 'bold', letterSpacing: 3,
      }).setOrigin(0.5, 0)
      body.push(cap)
      ty += cap.height + 20
    }

    // Label left, value right, against the panel's inner face.
    const inset = w / 2 - 84
    for (const row of opts.rows ?? []) {
      body.push(scene.add.text(-inset, ty, row.label, {
        fontFamily: FONT_UI, fontSize: '16px', color: COLOR.dim,
      }).setOrigin(0, 0))
      body.push(scene.add.text(inset, ty, row.value, {
        fontFamily: FONT_UI, fontSize: '16px', fontStyle: 'bold',
        color: row.accent ? COLOR.amber : COLOR.ink,
      }).setOrigin(1, 0))
      ty += ROW_H
    }

    // The fork, if there is one: one card per option, side by side, each with
    // its own name, its own stats, its own price and its own button. Measured
    // first and levelled afterwards — two cards of different heights read as
    // one option being the bigger offer, which is a claim the panel should not
    // be making on its own.
    const picks: Array<{ x: number; y: number; w: number; c: DialogChoice }> = []
    if (opts.choices?.length) {
      const n = opts.choices.length
      const inner = w - 96
      const colW = (inner - CARD_GAP * (n - 1)) / n
      const cards: Phaser.GameObjects.Rectangle[] = []
      let tallest = 0

      opts.choices.forEach((c, i) => {
        const cx = -inner / 2 + i * (colW + CARD_GAP) + colW / 2
        // Pushed first so the card draws behind its own contents: the
        // container renders in the order it was given.
        const card = scene.add.rectangle(cx, ty, colW, 10, COLOR.panelHi)
          .setOrigin(0.5, 0)
          .setStrokeStyle(2, COLOR.panelEdge)
        body.push(card)
        cards.push(card)

        let by = ty + CARD_PAD
        const name = scene.add.text(cx, by, c.name.toUpperCase(), {
          fontFamily: FONT_UI, fontSize: '19px', fontStyle: 'bold',
          color: COLOR.amber, letterSpacing: 1,
          align: 'center', wordWrap: { width: colW - CARD_PAD * 2 },
        }).setOrigin(0.5, 0)
        body.push(name)
        by += name.height + 8

        // One line per point, left-aligned under a centred name, because a
        // stat list is read down and a heading is read across.
        const stats = scene.add.text(cx - colW / 2 + CARD_PAD, by,
          c.lines.map((l) => `\u00b7 ${l}`).join('\n'), {
            fontFamily: FONT_UI, fontSize: '15px', color: COLOR.ink,
            wordWrap: { width: colW - CARD_PAD * 2 }, ...BODY_SPACING,
          }).setOrigin(0, 0)
        body.push(stats)
        by += stats.height + 10

        const price = scene.add.text(cx, by, `${c.cost}   ${c.takes}`, {
          fontFamily: FONT_UI, fontSize: '15px', color: COLOR.dim,
          align: 'center', wordWrap: { width: colW - CARD_PAD * 2 },
        }).setOrigin(0.5, 0)
        body.push(price)
        by += price.height + CARD_PAD

        tallest = Math.max(tallest, by - ty)
        picks.push({ x: cx, y: 0, w: colW - CARD_PAD * 2, c })
      })

      const cardH = tallest + CHOICE_BTN_H + CARD_PAD
      // Origin re-set after the resize: a shape recomputes its display origin
      // from its size, so setting it before would leave the card half a card
      // out of place.
      cards.forEach((card) => card.setSize(colW, cardH).setOrigin(0.5, 0))
      // Buttons on one line across both cards, inside the card they belong to.
      for (const p of picks) p.y = ty + tallest + CHOICE_BTN_H / 2
      ty += cardH + 14
    }

    // One row of buttons, laid out from however many there are, so a panel with
    // a sell button does not have to know where cancel ended up. Labels carry
    // no numbers: the costs are already on their own rows above, and a label
    // long enough to hold one overflows its plate.
    const row: Array<{ label: string; onPick: () => void; enabled?: boolean; weight: Weight }> = []
    if (opts.actions && opts.actions.length > 0) {
      // The explicit list wins outright. A panel that supplied both would be
      // saying two different things about its own way out.
      opts.actions.forEach((a, i) => {
        row.push({ ...a, weight: a.weight ?? (i === 0 ? 'primary' : 'secondary') })
      })
    } else {
      if (opts.confirm) row.push({ ...opts.confirm, weight: 'primary' })
      if (opts.extra) row.push({ ...opts.extra, weight: 'secondary' })
      row.push({
        label: opts.cancelLabel ?? (row.length > 0 ? 'CANCEL' : 'CLOSE'),
        onPick: () => opts.onCancel?.(),
        weight: 'secondary',
      })
    }

    // Two per row past two buttons, so a four-way panel is a grid. Each extra
    // row costs the panel its own height, which the plate has to grow for.
    const perRow = row.length > 2 ? 2 : row.length
    const rows = Math.max(1, Math.ceil(row.length / perRow))
    const h = TOP_PAD + ty + BUTTON_BAND + (rows - 1) * (48 + 12)
    const top = -h / 2
    for (const o of body) (o as Phaser.GameObjects.Text).y += top + TOP_PAD

    const parts: Phaser.GameObjects.GameObject[] = [
      ...platePanel(scene, -w / 2, top, w, h),
      ...body,
    ]

    for (const p of picks) {
      const btn = plateButton(scene, p.x, top + TOP_PAD + p.y, p.w, CHOICE_BTN_H,
        (p.c.label ?? p.c.name).toUpperCase(), () => { p.c.onPick(); this.close() }, 15)
      if (p.c.enabled === false) btn.setEnabled(false)
      parts.push(...btn.parts)
    }

    // Placed under the body rather than up from the bottom edge, so the plate's
    // chrome grows below them instead of over them.
    const btnY = top + TOP_PAD + ty + 34
    const gap = 12
    const bw = Math.min(170, (w - 56 - gap * (perRow - 1)) / perRow)
    row.forEach((b, i) => {
      // Laid out row by row, and the LAST row is centred on its own count: an
      // odd fifth button belongs under the middle of the four above it rather
      // than hanging off the left.
      const r = Math.floor(i / perRow)
      const inThisRow = Math.min(perRow, row.length - r * perRow)
      const col = i % perRow
      const total = inThisRow * bw + (inThisRow - 1) * gap
      const bx = -total / 2 + bw / 2 + col * (bw + gap)
      const by = btnY + r * (48 + gap)
      // The plate's end caps eat about 62px of the button's width, so the
      // label has less room than the plate suggests. plateButton holds the
      // legibility floor; the panel got wider to pay for it.
      const btn = plateButton(scene, bx, by, bw, 48, b.label,
        () => { b.onPick(); this.close() }, 15, b.weight)
      if (b.enabled === false) btn.setEnabled(false)
      parts.push(...btn.parts)
    })

    this.layer.add(parts)
    this.blocker.setDepth(depth - 1)

    // A phone in landscape can be 320px tall. A panel with a headline and five
    // rows is taller than that, and a panel that runs off the screen takes its
    // buttons with it — which on the results screen would be a dead end. So
    // the whole panel is scaled to fit rather than trusted to be short enough.
    this.fit = Math.min(1, (viewH(scene) - MARGIN) / h, (viewW(scene) - MARGIN) / w)
    this.layer.setScale(this.fit * 0.86)
    scene.tweens.add({
      targets: this.layer, scale: this.fit, duration: 170, ease: 'Back.easeOut',
    })
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
      targets: this.layer, alpha: 0, scale: this.fit * 0.9, duration: 150,
      onComplete: () => this.layer.destroy(true),
    })
  }
}

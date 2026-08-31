import Phaser from 'phaser'
import creditsData from '../data/credits.json'
import displayData from '../data/display.json'
import { BODY_SPACING, COLOR, FONT_DISPLAY, FONT_UI } from '../ui/Theme.ts'
import { ART, fitContentHeight } from '../systems/Art.ts'
import { fitCameraToDesign } from '../ui/FitCamera.ts'
import { play } from '../systems/Audio.ts'

const W = displayData.width
const H = displayData.height

/** Where the roll's columns sit: role on the left, name on the right. */
const ROLE_X = 300
const NAME_X = W - 300
const LINE_H = 38

/** Claude is the one name in the roll that is not Cory. That is the joke, so
 *  it gets a colour nothing else in the roll uses. */
const CLAUDE_COLOUR = '#7fd4ff'

interface Block {
  kind: string
  text?: string
  lines?: string[]
  role?: string
  name?: string
  accent?: string
  art?: string
  height?: number
}

/**
 * The credits roll.
 *
 * A long slow scroll rather than a page, because the length is the joke: the
 * cast list is almost entirely one man, and it goes on far past the point
 * where that is funny, which is where it becomes funny again. It ends on the
 * three boys' names assembling into the title, which is the only part of this
 * screen that is not a joke and needs the run-up to land.
 *
 * Tapping anywhere skips out. Nobody should be held here.
 *
 * The roll is set in the sans throughout and the display face appears exactly
 * once, on the names and the title they spell. That is partly restraint — the
 * one place the game's own typeface shows up is the one moment that matters —
 * and partly necessity: KenneyFuture's K still reads as an H at 40px, which
 * turned "SPECIAL THANKS" into "SPECIAL THANHS" and "JUST KIDDING" into
 * something worse. At the 54px and 92px of the payoff its letterforms hold.
 */
export class CreditsScene extends Phaser.Scene {
  roll!: Phaser.GameObjects.Container
  tween?: Phaser.Tweens.Tween

  constructor() {
    super('Credits')
  }

  create(): void {
    fitCameraToDesign(this)
    this.add.rectangle(0, 0, W, H, 0x10161d).setOrigin(0, 0)
    this.decorateBackdrop()

    this.roll = this.add.container(0, H)
    const height = this.build()

    // One long scroll from just off the bottom to just past the top. Linear:
    // credits that ease are credits that look like they are buffering.
    this.tween = this.tweens.add({
      targets: this.roll,
      y: -height,
      duration: creditsData.scrollSeconds * 1000,
      ease: 'Linear',
      onComplete: () => this.leave(),
    })

    // The whole screen is the skip target, which is why there is no button.
    this.add.rectangle(0, 0, W, H, 0xffffff, 0.001).setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.leave())
    this.input.keyboard?.on('keydown-ESC', () => this.leave())

    const hint = this.add.text(W / 2, H - 26, 'TAP TO SKIP', {
      fontFamily: FONT_UI, fontSize: '22px', color: COLOR.dim, letterSpacing: 2,
    }).setOrigin(0.5).setAlpha(0.5)
    this.tweens.add({ targets: hint, alpha: 0.16, duration: 1600, yoyo: true, repeat: -1 })
  }

  private leave(): void {
    this.tween?.stop()
    play(this, 'click')
    this.scene.start('Title')
  }

  /** Lays every block out top to bottom and returns how tall the roll ended up. */
  private build(): number {
    let y = 0
    for (const raw of creditsData.blocks as Block[]) {
      switch (raw.kind) {
        case 'gap':
          y += raw.height ?? 0
          break
        case 'logo':
          y += this.logo(raw.art as 'jebusGames' | 'cpPlays', raw.height ?? 160, y)
          break
        case 'label':
          y += this.centred(raw.text ?? '', y, 26, COLOR.dim, FONT_UI, 3)
          break
        case 'heading':
          y += this.centred(raw.text ?? '', y, 38, COLOR.amber, FONT_UI, 4, true)
          break
        case 'big':
          y += this.centred(raw.text ?? '', y, 92, COLOR.amber, FONT_DISPLAY, 4)
          break
        case 'note':
          y += this.centred(raw.text ?? '', y, 24, COLOR.dim, FONT_UI, 0)
          break
        case 'shout':
          for (const line of raw.lines ?? []) {
            y += this.centred(line, y, 44, COLOR.ink, FONT_UI, 2, true)
          }
          break
        case 'names':
          y += this.names(y)
          break
        default:
          y += this.credit(raw, y)
      }
    }
    return y
  }

  private centred(
    text: string, y: number, size: number, colour: string,
    family: string, spacing: number, bold = false,
  ): number {
    const t = this.add.text(W / 2, y, text, {
      fontFamily: family, fontSize: `${size}px`, color: colour,
      fontStyle: bold ? 'bold' : '',
      align: 'center', ...BODY_SPACING, letterSpacing: spacing,
      wordWrap: { width: W - 160 },
    }).setOrigin(0.5, 0)
    this.roll.add(t)
    return t.height + Math.round(size * 0.35)
  }

  /**
   * One role/name pair with dot leaders between them.
   *
   * The dots are what make a credits roll read as a credits roll, and they
   * have to be measured rather than guessed: the roles here run from "Grass"
   * to "Assistant to the Associate Executive Producer".
   */
  private credit(b: Block, y: number): number {
    const claude = b.accent === 'claude'
    const role = this.add.text(ROLE_X, y, b.role ?? '', {
      fontFamily: FONT_UI, fontSize: '24px', color: COLOR.dim,
    }).setOrigin(0, 0)
    const name = this.add.text(NAME_X, y, b.name ?? '', {
      fontFamily: FONT_UI, fontSize: '24px', fontStyle: 'bold',
      color: claude ? CLAUDE_COLOUR : COLOR.ink,
    }).setOrigin(1, 0)

    const dots = this.add.text(0, y, '', {
      fontFamily: FONT_UI, fontSize: '24px', color: COLOR.dim,
    }).setOrigin(0, 0).setAlpha(0.4)
    const from = ROLE_X + role.width + 12
    const to = NAME_X - name.width - 12
    if (to > from) {
      // Measured once against a single dot, then repeated to fill exactly.
      dots.setText('.')
      const unit = Math.max(dots.width, 1)
      dots.setText('.'.repeat(Math.max(0, Math.floor((to - from) / unit))))
      dots.setX(from)
    }
    this.roll.add([role, dots, name])
    return LINE_H
  }

  /**
   * The payoff: three names in birth order with the letters that spell the
   * title lit, everything else dimmed. Laid out as one measured row so the
   * gold letters line up as a single word across three names.
   */
  private names(y: number): number {
    const size = 54
    const parts: Array<{ text: string; lit: boolean }> = []
    for (const n of creditsData.names as Array<{ pre?: string; lit: string; rest: string }>) {
      if (n.pre) parts.push({ text: n.pre, lit: false })
      parts.push({ text: n.lit, lit: true })
      if (n.rest) parts.push({ text: n.rest, lit: false })
      parts.push({ text: '   ', lit: false })
    }
    parts.pop()

    // Built at the origin first so each piece can be measured, then the whole
    // row is shifted to centre it. Guessing the width of a mixed-case string
    // in two colours is how these end up off-centre.
    const made = parts.map((p) => this.add.text(0, y, p.text, {
      fontFamily: FONT_DISPLAY, fontSize: `${size}px`,
      color: p.lit ? COLOR.amber : COLOR.dim,
    }).setOrigin(0, 0).setAlpha(p.lit ? 1 : 0.55))
    const total = made.reduce((a, t) => a + t.width, 0)
    let x = W / 2 - total / 2
    for (const t of made) {
      t.setX(x)
      x += t.width
    }
    this.roll.add(made)
    return size + 26
  }

  private logo(which: 'jebusGames' | 'cpPlays', height: number, y: number): number {
    const key = ART.brand[which]
    const img = this.add.image(W / 2, y, key).setOrigin(0.5, 0)
    fitContentHeight(img, key, height)
    this.roll.add(img)
    return height + 20
  }

  private decorateBackdrop(): void {
    const rng = new Phaser.Math.RandomDataGenerator(['credits'])
    const g = this.add.graphics()
    for (let i = 0; i < 22; i++) {
      g.fillStyle(0x1b2430, 0.55)
      g.fillCircle(rng.between(0, W), rng.between(0, H), rng.between(30, 120))
    }
  }
}

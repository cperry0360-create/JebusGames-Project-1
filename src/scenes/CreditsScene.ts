import Phaser from 'phaser'
import creditsData from '../data/credits.json'
import musicData from '../data/music.json'
import displayData from '../data/display.json'
import { BODY_SPACING, COLOR, FONT_DISPLAY, FONT_UI } from '../ui/Theme.ts'
import { ART, fitContentHeight } from '../systems/Art.ts'
import { fitCameraToDesign } from '../ui/FitCamera.ts'
import { play } from '../systems/Audio.ts'
import { musicForScene } from '../systems/Music.ts'

const W = displayData.width
const H = displayData.height

/** Where the roll's columns sit: role on the left, name on the right. */
const ROLE_X = 250
const NAME_X = W - 250
const LINE_H = 46

/** Air around a division header. A header that sits as close to the credits
 *  above it as to its own is not a header, it is another line. */
const DIV_ABOVE = 64
const DIV_BELOW = 34
const DIV_RULE_W = 300

/** Air above and below an aside, so it does not read as another credit. */
const NOTE_AIR = 14

/** How long the roll stops when a card reaches the middle. Long enough to
 *  read two roles, short enough not to feel broken. */
const CARD_HOLD_MS = 1500

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
  /** A `card` block's roles. */
  roles?: string[]
}

/** Track attributions. Creative Commons tracks must name the artist and the
 *  licence, so this is data rather than copy in a scene. */
const MUSIC = musicData as unknown as {
  tracks: Record<string, {
    title: string; artist: string; source?: string; license?: string; artistUrl?: string
    rendering?: string
  }>
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
 * Two things about the order, both load-bearing. It is broken into department
 * headers rather than run as one column, which is what makes a roll read as a
 * production rather than as a list. And every department for the first third
 * is Cory, so that the real credits — Claude, ChatGPT, Gemini — arrive as
 * relief. Putting them first, which is where a cast list would normally start,
 * throws the joke away before it has been made.
 *
 * Tapping anywhere skips out. Nobody should be held here.
 *
 * The roll is set in the sans throughout and the display face appears exactly
 * once, on the names and the title they spell — the 54px row and the 92px
 * word, both well above the floor in Theme.ts. That is the game's rule now
 * rather than a local workaround, and it happens to be the right restraint
 * anyway: the one place the game's own typeface shows up is the one moment
 * that matters.
 */
export class CreditsScene extends Phaser.Scene {
  roll!: Phaser.GameObjects.Container
  tween?: Phaser.Tweens.Tween
  /** Where each card sits in the roll, so the scroll can stop on it. */
  cardStops: number[] = []

  constructor() {
    super('Credits')
  }

  create(): void {
    // What plays here is data; see music.json. A scene not listed keeps
    // whatever is already playing, which is what carries the battle track
    // across Title -> Loadout without a restart.
    musicForScene('Credits')
    fitCameraToDesign(this)
    this.add.rectangle(0, 0, W, H, 0x10161d).setOrigin(0, 0)
    this.decorateBackdrop()

    this.roll = this.add.container(0, H)
    const height = this.build()

    // One long scroll from just off the bottom to just past the top. Linear:
    // credits that ease are credits that look like they are buffering.
    // One long scroll, with a beat at each card.
    //
    // The roll is 12,444px tall. At the 60s it is set to, that is 219 px/sec
    // and a credit line is on screen for 0.21 seconds — you cannot read a name
    // in that. Which is fine for eighty lines that all say CORY, and not fine
    // for the two that do not. So the scroll stops for a moment when a card
    // reaches the middle. The motion still totals `scrollSeconds`; the holds
    // are on top of it, which is why the roll runs a few seconds over rather
    // than the cards flying past inside it.
    const stops = this.cardStops.map((cy) => H / 2 - cy).sort((a, b) => b - a)
    const total = creditsData.scrollSeconds * 1000
    const legs: Array<{ to: number; hold: number }> = []
    let from = H
    for (const at of stops) {
      if (at >= from || at <= -height) continue
      legs.push({ to: at, hold: CARD_HOLD_MS })
      from = at
    }
    legs.push({ to: -height, hold: 0 })

    const span = H + height
    let leg = 0
    const runLeg = (): void => {
      const l = legs[leg]
      if (!l) { this.leave(); return }
      leg++
      this.tween = this.tweens.add({
        targets: this.roll,
        y: l.to,
        duration: Math.max(1, total * (Math.abs(this.roll.y - l.to) / span)),
        ease: 'Linear',
        onComplete: () => {
          if (l.hold > 0) this.time.delayedCall(l.hold, runLeg)
          else runLeg()
        },
      })
    }
    runLeg()

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
    this.cardStops = []
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
        case 'division':
          y += this.division(raw.text ?? '', y)
          break
        case 'big':
          y += this.centred(raw.text ?? '', y, 92, COLOR.amber, FONT_DISPLAY, 4)
          break
        case 'note': {
          // A note is an aside on the credit above it, so it is set apart from
          // both neighbours; its own lines stay tight, as one paragraph.
          const body = (raw.lines ?? [raw.text ?? '']).join('\n')
          y += NOTE_AIR + this.centred(body, y + NOTE_AIR, 24, COLOR.dim, FONT_UI, 0) + NOTE_AIR
          break
        }
        case 'shout':
          for (const line of raw.lines ?? []) {
            y += this.centred(line, y, 44, COLOR.ink, FONT_UI, 2, true)
          }
          break
        case 'names':
          y += this.names(y)
          break
        case 'card': {
          const h = this.card(raw.name ?? '', raw.roles ?? [], y)
          this.cardStops.push(y + h / 2)
          y += h
          break
        }
        case 'tracks':
          y += this.tracks(y)
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
      fontFamily: FONT_UI, fontSize: '26px', color: COLOR.dim,
    }).setOrigin(0, 0)
    const name = this.add.text(NAME_X, y, b.name ?? '', {
      fontFamily: FONT_UI, fontSize: '26px', fontStyle: 'bold',
      color: claude ? CLAUDE_COLOUR : COLOR.ink,
    }).setOrigin(1, 0)

    // Leaders are drawn on the type's own baseline block, nudged down so they
    // sit on the line rather than through the middle of the words.
    const dots = this.add.text(0, y + 3, '', {
      fontFamily: FONT_UI, fontSize: '26px', color: COLOR.dim,
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
  /**
   * A name with its own card.
   *
   * Every role in this roll is CORY, and the joke only works if the two
   * exceptions are exceptions. Set larger, boxed, and with air either side, so
   * Courtland and Han land rather than scrolling past inside a list of
   * eighty identical lines.
   */
  private card(name: string, roles: string[], y: number): number {
    const pad = 18
    const roleSize = 26
    const h = pad * 2 + 52 + roles.length * (roleSize + 8)
    const w = 520
    const box = this.add.rectangle(W / 2, y + h / 2, w, h, 0x121820, 0.55)
    box.setStrokeStyle(2, 0xf2d06b, 0.45)
    this.roll.add(box)

    let ty = y + pad
    ty += this.centred(name, ty, 52, COLOR.amber, FONT_DISPLAY, 3)
    for (const role of roles) {
      ty += this.centred(role, ty + 4, roleSize, COLOR.ink, FONT_UI, 1)
    }
    return h
  }

  /**
   * Track attributions, read from music.json.
   *
   * Creative Commons tracks have to name the artist and the licence, and that
   * is a legal obligation rather than a courtesy — so it is data, and a track
   * can be added the day it is chosen without anybody editing a scene.
   */
  private tracks(y: number): number {
    let ty = y
    for (const t of Object.values(MUSIC.tracks)) {
      ty += this.centred(t.title, ty, 30, COLOR.ink, FONT_UI, 1)
      ty += this.centred(t.artist, ty + 2, 26, COLOR.amber, FONT_UI, 1)
      // Where the artist asked to be pointed at, which is not always where the
      // track was found. syncopika asks for his Bandcamp; CC BY only obliges
      // the name and the licence, so this is a request honoured rather than a
      // condition met, and it belongs under his name rather than in the
      // provenance line with the licence.
      if (t.artistUrl) ty += this.centred(t.artistUrl, ty + 2, 22, COLOR.amber, FONT_UI, 0)
      const provenance = [t.source, t.license].filter(Boolean).join('  ·  ')
      if (provenance) ty += this.centred(provenance, ty + 2, 22, COLOR.dim, FONT_UI, 0)
      // How a track got from what the artist published to what the game plays.
      // Airport Attack was released as a MIDI file: what ships here is a render
      // of it, and the soundfont that did the rendering carries its own licence.
      if (t.rendering) ty += this.centred(t.rendering, ty + 2, 20, COLOR.dim, FONT_UI, 0)
      ty += 26
    }
    return ty - y
  }

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

  /**
   * A studio mark on its own line.
   *
   * `fitContentHeight` anchors a logo on the *centre* of its artwork, because
   * that is what every other caller wants. It also overwrites any origin set
   * before it, which is what put the CP Plays mark half a logo higher than the
   * layout thought and straight through "IN COLLABORATION WITH". So the centre
   * is placed deliberately, half a logo below the top of the block it occupies.
   */
  private logo(which: 'jebusGames' | 'cpPlays', height: number, y: number): number {
    const key = ART.brand[which]
    const img = this.add.image(W / 2, y + height / 2, key)
    fitContentHeight(img, key, height)
    this.roll.add(img)
    return height
  }

  /**
   * A department header: PEANUT LOGISTICS, GNOME AFFAIRS, and so on.
   *
   * Deliberately not the same as the section headings that announce SPECIAL
   * THANKS — smaller, wider-tracked, and underscored with a short rule — so
   * that scrolling past one reads as "new department" rather than "the credits
   * have started again". The air above and below is what makes the roll parse
   * as a set of lists instead of one long undifferentiated column.
   */
  private division(text: string, y: number): number {
    const top = y + DIV_ABOVE
    const t = this.add.text(W / 2, top, text, {
      fontFamily: FONT_UI, fontSize: '30px', color: COLOR.amber,
      fontStyle: 'bold', letterSpacing: 6, align: 'center',
    }).setOrigin(0.5, 0)
    const ruleY = top + t.height + 14
    const rule = this.add.rectangle(W / 2, ruleY, DIV_RULE_W, 2, 0xf2d06b, 0.35)
      .setOrigin(0.5, 0)
    this.roll.add([t, rule])
    return DIV_ABOVE + t.height + 14 + rule.height + DIV_BELOW
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

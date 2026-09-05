import Phaser from 'phaser'
import type { AbilityDef, DraftDef, HeroDef, TowerDef } from '../types.ts'
import displayData from '../data/display.json'
import { chooseHero, chosenHero, heroList } from '../systems/Heroes.ts'
import towersData from '../data/towers.json'
import abilitiesData from '../data/abilities.json'
import draftData from '../data/draft.json'
import { draftAbilities, draftOpeningTowers, makeRng, reserveTowers } from '../systems/Draft.ts'
import { runState, setRunState } from '../systems/RunState.ts'
import { shouldPlay } from '../systems/Cutscenes.ts'
import { towerWeightsFor } from '../systems/Levels.ts'
import { BODY_SPACING, COLOR, FONT_DISPLAY, FONT_UI, uiSize } from '../ui/Theme.ts'
import { panelInset, plateButton, platePanel, type PlateButton } from '../ui/Plate.ts'
import { buttonRow } from '../systems/ButtonRow.ts'
import { fitInBox } from '../systems/Art.ts'
import { fitCameraToDesign } from '../ui/FitCamera.ts'
import { abilityLine, towerLine, towerStats } from '../systems/AbilityText.ts'
import { ART, renderFor } from '../systems/Art.ts'
import presentationData from '../data/presentation.json'
import { play } from '../systems/Audio.ts'
import { musicForScene } from '../systems/Music.ts'
import { viewH, viewW } from '../systems/Resolution.ts'

const TOWERS = towersData as Record<string, TowerDef>
const ABILITIES = abilitiesData as Record<string, AbilityDef>
const DRAFT = draftData as DraftDef

const W = displayData.width
const H = displayData.height
const LO = presentationData.loadout

/**
 * One card on the loadout screen.
 *
 * Every card is built the same way — a plate, then its face drawn into a
 * container that sits on top of it — because this screen is going to become a
 * row of face-down cards the player taps to turn over. Keeping the face in its
 * own container means that change is: create a back, hide `face`, and show it
 * on tap. Nothing about the layout or the content has to move.
 */
interface Card {
  /** Everything the card draws, for adding to the scene's layer. */
  parts: Phaser.GameObjects.GameObject[]
  /** Just the face, which is what a reveal would uncover. */
  face: Phaser.GameObjects.Container
  reveal(): void
}

/**
 * The loadout: the hero, the towers and the actives this run was dealt, on one
 * screen before the map.
 *
 * This replaces a two-step draft that showed abilities on one screen and
 * towers on another, which made the player click through the same information
 * twice and never showed them the whole hand at once.
 */
export class LoadoutScene extends Phaser.Scene {
  private layer!: Phaser.GameObjects.Container
  private cards: Card[] = []

  constructor() {
    super('Loadout')
  }

  create(): void {
    // What plays here is data; see music.json. A scene not listed keeps
    // whatever is already playing, which is what carries the battle track
    // across Title -> Loadout without a restart.
    musicForScene('Loadout')
    // Fixed UI camera: the design box is fitted into the viewport so nothing
    // is cut off, and no gesture is bound to it. Menus never pan or zoom.
    fitCameraToDesign(this)

    this.rerollsLeft = DRAFT.rerollsPerRun
    // Deal only when there is no hand yet. Re-dealing on every create meant
    // the screen could not be shown twice without changing what it showed —
    // and it silently overwrote any hand set from outside, which is how the
    // exhaustive layout check ended up measuring dealt hands rather than the
    // fourteen it thought it was forcing. Title clears the hand when a run
    // starts, so a fresh run still gets a fresh draw.
    if (runState().openingTowers.length === 0) this.deal(runState().seed)
    // The remembered pick, applied before the first render. A save with no
    // choice in it resolves to the default, which is Cory -- so a player who
    // never touches the row plays exactly the game that was tuned.
    if (!runState().heroId) setRunState({ heroId: chosenHero() })

    this.contentWidth = this.drawBackdrop()
    this.render()
  }

  /** How many redeals are left. One per run; see the reroll button. */
  private rerollsLeft = 0
  /** Whether the next render's cards fly in. Only a reroll sets it. */
  private animateArrival = false
  /** Bumped per reroll and mixed into the seed, so a redeal is still a
   *  function of the run's seed and the same seed always plays out the same
   *  way — a reroll is a second card off a known deck, not a random one. */
  private dealNumber = 0

  /**
   * Deals a whole loadout: hero, both towers, both specials.
   *
   * One function rather than a first-deal path and a reroll path, so a reroll
   * cannot draw from a different pool or apply a different rule than the
   * opening hand did.
   */
  private deal(seed: number): void {
    const rng = makeRng(seed)

    // THE HERO IS NOT DEALT. It used to be drawn with everything else, back
    // when there was one of them and a draw was indistinguishable from a
    // constant. With five it is a decision, so it is made by the player in the
    // HERO row and remembered in the save -- and reroll, below, redeals the
    // towers and the specials and leaves it alone.
    // Server Nuke is a mid-run drop, never a starting hand.
    const pool = Object.keys(ABILITIES).filter((id) => ABILITIES[id].draftable)
    const abilities = draftAbilities(pool, DRAFT.abilitiesDrawn, rng)
    // The shared pool plus whatever this level adds. The Ima Dummy Tower is
    // level 1's only, so levels 2 and 3 draw exactly what they were tuned
    // against and the weight is a fact about the level rather than the tower.
    const weights = towerWeightsFor(runState().levelId, DRAFT.towerWeights)
    const towerPool = Object.entries(TOWERS)
      .filter(([id]) => weights[id] !== undefined)
      .map(([id, t]) => ({ id, weight: weights[id]!, archetype: t.archetype }))
    const opening = draftOpeningTowers(towerPool, DRAFT, rng)
    const reserve = reserveTowers(towerPool, opening, rng)
    setRunState({ abilities, openingTowers: opening, reserveTowers: reserve })
  }

  /**
   * A second deal, once per run.
   *
   * The whole hand at once and never a slot at a time: per-slot rerolls turn
   * a draft into a shopping trip, and the point of the screen is that the run
   * dealt you this and you play it.
   */
  private reroll(): void {
    if (this.rerollsLeft <= 0) return
    this.rerollsLeft -= 1
    this.dealNumber += 1
    play(this, 'upgrade')

    // The old cards leave before the new ones arrive, so the change is a
    // change and not a silent substitution the player can miss.
    const going = this.cards.map((c) => c.face)
    let done = 0
    const rebuild = (): void => {
      done += 1
      if (done < going.length) return
      this.redeal()
    }
    if (going.length === 0) { this.redeal(); return }
    going.forEach((face, i) => {
      this.tweens.add({
        targets: face, alpha: 0, scaleY: 0.86, y: face.y - 10,
        duration: LO.rerollFadeMs, delay: i * LO.rerollStaggerMs, ease: 'Quad.easeIn',
        onComplete: rebuild,
      })
    })
  }

  /** The second half of a reroll: draw a new hand and fly it in. */
  private redeal(): void {
    this.deal(runState().seed + this.dealNumber * 7919)
    this.animateArrival = true
    this.render()
    this.animateArrival = false
  }

  /** How wide the panels may be, decided by the illustration behind them.
   *  Public so a harness run can check the layout against it. */
  contentWidth = LO.maxContentWidth
  /** The row, for the harness: a centring bug is a position, and a position
   *  has to be read off the real objects. */
  buttonsForProbe: PlateButton[] = []
  /** Where the illustration is clear, in design coordinates. */
  safeBand = { left: 0, right: W }

  /**
   * The painted loadout room, scaled to cover, with the panels kept inside the
   * part of it the artist left clear.
   *
   * Two things this has to get right. The camera is a CONTAIN fit of the
   * 1280x720 design box, so on a wide phone it shows more than 1280 design
   * units across and a backdrop sized to the design box would leave the
   * illustration short of the edges — it is sized to what the camera can
   * actually see instead.
   *
   * And the illustration is composed: a workbench, an armour stand and a mower
   * down the left, a cooler, a stack of tyres and a tarp down the right, and a
   * deliberately open middle. Panels are held inside that middle rather than
   * spanning the full width, so they never sit on top of the furniture.
   *
   * Returns the width the panels may use. Falls back to the flat dark ground
   * if the file is not in the manifest or has not loaded.
   */
  private drawBackdrop(): number {
    const key = ART.ui.loadoutBackdrop
    const has = !!key && this.textures.exists(key)
    if (!has) {
      // The screen this replaces. Still correct, just not painted.
      this.add.rectangle(W / 2, H / 2, W * 3, H * 3, 0x10161d)
      this.safeBand = { left: 0, right: W }
      return LO.maxContentWidth
    }

    // What the camera can see, in design units.
    const zoom = this.cameras.main.zoom || 1
    const visW = Math.max(W, viewW(this) / zoom)
    const visH = Math.max(H, viewH(this) / zoom)

    const cfg = renderFor(key)
    const srcW = cfg.contentWidth ?? 1920
    const srcH = cfg.contentHeight ?? 1080
    // Cover: the larger of the two ratios, so neither axis is left short.
    const scale = Math.max(visW / srcW, visH / srcH)
    const drawW = srcW * scale

    const bg = this.add.image(W / 2, H / 2, key).setScale(scale)
    // A light hand. The illustration is already dark, and the 45% first asked
    // for flattened it to a grey rectangle; the panels carry their own opacity
    // instead. See `panelAlpha`.
    this.add.rectangle(W / 2, H / 2, visW + 4, visH + 4, 0x000000, LO.overlayAlpha)
    void bg

    // The clear middle, mapped from the illustration onto the screen. Kept
    // symmetrical about the centre so the title and the button stay centred:
    // the usable half-width is whichever side runs out first.
    const left = W / 2 - drawW / 2 + LO.safeLeft * drawW
    const right = W / 2 - drawW / 2 + LO.safeRight * drawW
    const half = Math.min(W / 2 - left, right - W / 2)
    this.safeBand = { left, right }
    // A margin, because the band edge is where the furniture STARTS: a card
    // whose frame stops exactly on it is already touching the tyres. Measured
    // off the running screen — the cards land where this says they will, with
    // no nine-slice bleed past the box.
    return Phaser.Math.Clamp(
      half * 2 - LO.safeMargin, LO.minContentWidth, LO.maxContentWidth,
    )
  }


  /**
   * The screen, laid out from the VIEWPORT down.
   *
   * This used to run top to bottom and put the buttons wherever the content
   * finished. On a 568x320 phone the content finished at y=931 in a 720-unit
   * box, so BEGIN THE RUN was 227px below the bottom of the screen and the
   * player could not start a run at all.
   *
   * So the order is inverted. The title, the headings and the button row take
   * their fixed space first; the cards get exactly what is left and are fitted
   * INTO it. The cards can never push a button off the screen because the
   * buttons were placed before the cards were measured.
   */
  private render(): void {
    this.layer?.destroy(true)
    this.layer = this.add.container(0, 0)
    this.cards = []
    const run = runState()

    const title = this.add.text(W / 2, 8, 'YOUR LOADOUT', {
      fontFamily: FONT_DISPLAY, fontSize: '44px', color: COLOR.ink,
      stroke: '#0d1016', strokeThickness: 6,
    }).setOrigin(0.5, 0)
    // Nothing on this screen said the hand was dealt rather than chosen, so a
    // player who drew two single-target towers had no way to know that was the
    // draw and not the game's opinion of how it should be played.
    const drawn = this.add.text(W / 2, title.y + title.height - 2, LO.copy.drawnAtRandom, {
      fontFamily: FONT_UI, fontSize: '22px', color: COLOR.dim,
      stroke: '#0d1016', strokeThickness: 4,
    }).setOrigin(0.5, 0)
    this.layer.add([title, drawn])

    // THE BUTTONS GO FIRST, at a fixed distance from the bottom of the design
    // box. Nothing computed after this can move them.
    const by = H - LO.buttonMargin - LO.buttonHeight / 2
    this.buildButtons(by)

    // What is left, after the heading each section carries.
    const top = drawn.y + drawn.height + 10
    const headingH = this.headingHeight()
    const budget = (by - LO.buttonHeight / 2 - LO.buttonGap) - top
      - headingH * 3 - LO.sectionGap * 2

    const share = LO.rowShares
    const heights = {
      hero: Math.floor(budget * share.hero),
      towers: Math.floor(budget * share.towers),
      specials: Math.floor(budget * share.specials),
    }

    let y = top
    y = this.heroSection(run.heroId, y, heights.hero) + LO.sectionGap
    y = this.towerSection(run.openingTowers, y, heights.towers) + LO.sectionGap
    this.abilitySection(run.abilities, y, heights.specials)

    // Every card is face-up for now. The reveal lands here.
    for (const c of this.cards) c.reveal()
  }

  /** How tall a section heading and its gap are. Measured once so the budget
   *  above is arithmetic rather than a guess. */
  private headingHeight(): number {
    const probe = this.add.text(0, 0, 'TOWERS', {
      fontFamily: FONT_UI, fontSize: '22px', letterSpacing: 3,
    })
    const h = probe.height + LO.headingGap
    probe.destroy()
    return h
  }

  /**
   * The centre everything on this screen aligns to.
   *
   * The card column is kept symmetrical about the middle — `drawBackdrop`
   * takes whichever side of the painted safe band runs out first — so this is
   * the middle today. It is a named thing rather than a `W / 2` repeated at
   * each call site so that if the column is ever inset asymmetrically, the
   * cards and the buttons move together instead of drifting apart.
   */
  get contentCentre(): number {
    return W / 2
  }

  /** A label's natural rendered width, measured rather than assumed. */
  private labelWidth(text: string, size: number): number {
    const probe = this.add.text(0, 0, text, {
      fontFamily: FONT_UI, fontSize: `${uiSize(size)}px`, fontStyle: 'bold', letterSpacing: 1,
    })
    const w = probe.width
    probe.destroy()
    return w
  }

  /**
   * The two buttons, at a y the cards cannot argue with, CENTRED AS A GROUP.
   *
   * They used to sit at two hardcoded offsets from the middle — one 300 wide
   * at centre+90, one 240 wide at centre-190 — so the row spanned centre-310
   * to centre+240 and its own centre fell 35 units left of every card above
   * it. Two independent offsets cannot stay centred once the widths differ.
   *
   * Both take the width the wider label needs, so the row is symmetrical and
   * BEGIN THE RUN is not visually smaller than the reroll beside it. See
   * `buttonRow` for what happens when that pair will not fit the column.
   */
  private buildButtons(by: number): void {
    const beginLabel = 'BEGIN THE RUN'
    const left = this.rerollsLeft
    const rerollLabel = `${LO.copy.rerollLabel} (${left} left)`
    const row = buttonRow({
      centreX: this.contentCentre,
      labelWidths: [this.labelWidth(rerollLabel, 22), this.labelWidth(beginLabel, 24)],
      padX: LO.buttonPadX,
      gap: LO.buttonGap,
      minWidth: LO.buttonMinWidth,
      maxTotal: this.contentWidth,
    })
    const reroll = plateButton(this, row.centres[0]!, by, row.width, LO.buttonHeight,
      rerollLabel, () => this.reroll(), 22)
    const begin = plateButton(this, row.centres[1]!, by, row.width, LO.buttonHeight,
      beginLabel, () => {
        // The HUD is not launched here any more; GameScene starts its own.
        // Two callers had to remember and only this one did, which left every
        // resumed run without a HUD. See GameScene.create.
        //
        // THE COMIC GOES HERE, not on the resume path. This is where a run
        // BEGINS; TitleScene and WorldMapScene both hand back to 'Game'
        // directly when they resume a saved one, and a comic in front of a
        // run already under way would be showing the opening twice.
        const level = runState().levelId
        if (shouldPlay(level)) {
          this.scene.start('Cutscene', { levelId: level, then: 'Game' })
          return
        }
        this.scene.start('Game')
      }, 24)
    // Spent, it stays on the screen greyed rather than disappearing: a button
    // that vanishes takes the knowledge that the option existed with it.
    if (left <= 0) reroll.setEnabled(false)
    this.buttonsForProbe = [reroll, begin]
    this.layer.add([...reroll.parts, ...begin.parts])
  }

  /** A section heading. Returns the y its content should start at. */
  private heading(text: string, y: number): number {
    const t = this.add.text(W / 2, y, text, {
      fontFamily: FONT_UI, fontSize: '22px', color: COLOR.amber, letterSpacing: 3,
      stroke: '#0d1016', strokeThickness: 4,
    }).setOrigin(0.5, 0)
    this.layer.add(t)
    return y + t.height + LO.headingGap
  }

  /** Builds a plate with an empty face container on top, ready to fill. */
  private card(x: number, y: number, w: number, h: number): Card {
    // A solid fill behind the plate, not a heavier overlay over the
    // illustration. The painted room is already dark and dimming it further
    // flattens it; the panels are what has to stay readable, so they carry
    // their own opacity and the art keeps its contrast.
    const backing = this.add
      .rectangle(x + w / 2, y + h / 2, w - 10, h - 10, 0x121820, LO.panelAlpha)
      .setOrigin(0.5)
    const plate = platePanel(this, x, y, w, h)
    const face = this.add.container(x + w / 2, y)
    const parts: Phaser.GameObjects.GameObject[] = [backing, ...plate, face]
    this.layer.add(parts)
    const index = this.cards.length
    const c: Card = {
      parts,
      face,
      // Instant on the opening hand; animated after a reroll, so a redeal is
      // visibly a redeal rather than the same screen with different words on
      // it. When the cards start face-down this becomes the flip, and nothing
      // that builds a face has to know about it.
      reveal: () => {
        if (!this.animateArrival) { face.setAlpha(1); return }
        face.setAlpha(0).setScale(1, 0.86).setY(face.y - 10)
        this.tweens.add({
          targets: face, alpha: 1, scaleY: 1, y: face.y + 10,
          duration: LO.rerollFadeMs * 1.6, delay: index * LO.rerollStaggerMs,
          ease: 'Back.easeOut',
        })
      },
    }
    this.cards.push(c)
    return c
  }

  /**
   * The HERO row: every hero on one card, one tap, and the choice remembered.
   *
   * NOT A DEAL. It used to be one card showing whatever the draft handed you,
   * which was indistinguishable from a constant while there was one hero. With
   * five it is the decision this screen exists for, so every hero is on it,
   * the pick is a tap, and REROLL -- which redeals the towers and the specials
   * -- leaves it alone.
   *
   * ONE CARD WITH A PICKER STRIP, not five cards. Five cards across the 720px
   * content column is 130px each, and a 63-character description in a 114px
   * text column needs six lines: it only fits at about 11px, and this screen's
   * own floor is 18px because the whole design box is fitted down to the
   * viewport. So the portraits and the names sit in a strip -- every hero
   * visible, tappable and highlighted -- and the selected hero's description
   * and ability names are written underneath at full width, where they are
   * read at the same size as every other card's body.
   */
  private heroSection(selectedId: string, top: number, height: number): number {
    const y = this.heading('HERO', top)
    const w = this.contentWidth
    const c = this.card(W / 2 - w / 2, y, w, height)
    const frame = this.frameInsetFor(w, height)
    const pad = Math.max(LO.cardPad, Math.ceil(Math.max(frame.left, frame.right)))
    const padT = Math.max(LO.cardPad, Math.ceil(frame.top))
    const padB = Math.max(LO.cardPad, Math.ceil(frame.bottom))
    const innerW = w - pad * 2
    const innerH = height - padT - padB

    const roster = heroList()
    const selected = roster.find((h) => h.id === selectedId) ?? roster[0]!

    // The blurb and the kit, at the largest size on the shared ladder that
    // fits the third of the card they are allowed. Built first, because what
    // is left over is what the portraits get.
    const textRoom = Math.floor(innerH * 0.42)
    let text: { parts: Phaser.GameObjects.Text[]; total: number } | null = null
    for (const size of LO.bodySizes) {
      text?.parts.forEach((p) => p.destroy())
      const blurb = this.add.text(0, 0, selected.def.blurb, {
        fontFamily: FONT_UI, fontSize: `${size}px`, color: COLOR.dim, ...BODY_SPACING,
        align: 'center', wordWrap: { width: innerW },
      }).setOrigin(0.5, 0)
      // BOTH BUTTONS, in bar order. It used to read "Haymaker · DAD MODE",
      // which was the slot-1 name beside the Last Stand name -- and every hero
      // carried both of those strings verbatim, so the line said the same
      // thing on all five cards.
      const kit = this.add.text(0, 0,
        `${selected.def.slot1.name} · ${selected.def.slot2.name}`, {
          fontFamily: FONT_UI, fontSize: `${size}px`, color: COLOR.good,
          align: 'center', wordWrap: { width: innerW },
        }).setOrigin(0.5, 0)
      text = { parts: [blurb, kit], total: blurb.height + 2 + kit.height }
      if (text.total <= textRoom) break
    }
    const t = text as NonNullable<typeof text>

    const gap = LO.heroCardGap
    const tileW = Math.floor((innerW - gap * (roster.length - 1)) / roster.length)
    const stripH = innerH - t.total - 6
    const left = -w / 2 + pad

    for (const [i, { id, def }] of roster.entries()) {
      const cx = left + i * (tileW + gap) + tileW / 2
      c.face.add(this.heroTile(def, id, id === selected.id, cx, -height / 2 + padT, tileW, stripH))
    }

    let ty = height / 2 - padB - t.total
    for (const [i, p] of t.parts.entries()) {
      p.setY(ty)
      ty += p.height + (i === 0 ? 2 : 0)
    }
    c.face.add(t.parts)
    return y + height
  }

  /**
   * One hero in the picker strip: a portrait, a name, and a tap.
   *
   * The name stays on the bottom rung of the shared type ladder rather than
   * being shrunk to fit a tile -- a label nobody can read is not a picker.
   */
  private heroTile(
    hero: HeroDef, id: string, selected: boolean,
    cx: number, top: number, w: number, h: number,
  ): Phaser.GameObjects.Container {
    const tile = this.add.container(cx, top + h / 2)
    // The bottom rung of the shared ladder, stepped down only as far as this
    // tile needs. MEASURED rather than assumed: a name's width is a font
    // question, and this is the one place that can ask it.
    const rung = LO.bodySizes[LO.bodySizes.length - 1]!
    let name!: Phaser.GameObjects.Text
    for (let size = rung; size >= LO.heroNameMin; size--) {
      name?.destroy()
      name = this.add.text(0, 0, hero.name.toUpperCase(), {
        fontFamily: FONT_UI, fontSize: `${size}px`, fontStyle: 'bold',
        color: selected ? COLOR.amber : COLOR.ink, align: 'center',
        wordWrap: { width: w },
      }).setOrigin(0.5, 1)
      if (name.width <= w - 4 || size === LO.heroNameMin) break
    }
    name.setY(h / 2 - 2)

    const box = Math.max(24, Math.min(LO.heroPortrait, Math.min(w - 8, h - name.height - 6)))
    const portrait = this.add.image(0, -h / 2 + box / 2 + 2, hero.portraitSprite)
    fitInBox(portrait, hero.portraitSprite, box)
    tile.add([portrait, name])

    // THE HIGHLIGHT IS A RING PLUS A COLOUR PLUS A TICK, deliberately three
    // things: a border alone is easy to miss on a phone at arm's length, and
    // this is the one control on the screen that changes what the run is.
    if (selected) {
      const ring = this.add.graphics()
      ring.lineStyle(3, 0xf0a830, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 8)
      const tick = this.add.text(w / 2 - 4, -h / 2, '\u2713', {
        fontFamily: FONT_UI, fontSize: `${rung}px`, fontStyle: 'bold', color: COLOR.amber,
      }).setOrigin(1, 0)
      tile.add([ring, tick])
    } else {
      tile.setAlpha(0.72)
    }

    const hit = this.add.rectangle(0, 0, w, h, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true })
    hit.on('pointerdown', () => this.pickHero(id))
    tile.add(hit)
    return tile
  }

  /**
   * Takes a hero, remembers it, and redraws.
   *
   * Written to the save immediately rather than on BEGIN: a player who backs
   * out to the title and comes back should find their pick still made, and the
   * run state is cleared on the way through.
   */
  private pickHero(id: string): void {
    if (runState().heroId === id) return
    play(this, 'upgrade')
    chooseHero(id)
    setRunState({ heroId: id })
    this.render()
  }




  /**
   * One card face, for every card in both rows.
   *
   * The two rows used to be two different components. The tower face put its
   * icon in a left column and then drew its stats and description CENTRED
   * across the whole card, so the text ran back under the icon; the specials
   * face did the same thing with no stat line, and its description started at
   * y=78 while the icon reached y=95, so the words were drawn straight over
   * the picture and out past the card's own border.
   *
   * The fix is not a nudge, it is a column. The icon owns a fixed-width strip
   * on the left and nothing else is ever drawn inside it; everything else is
   * left-aligned in the strip beside it and wrapped to that strip's width. A
   * card cannot overflow because no text is ever given a width the card does
   * not have.
   */
  private cardFace(
    cw: number,
    ch: number,
    icon: (cx: number, cy: number, box: number) => Phaser.GameObjects.GameObject[],
    name: string,
    cost: string | null,
    stats: string | null,
    body: string,
  ): { parts: Phaser.GameObjects.GameObject[] } {
    // Padded against the painted frame, not the box — but only against the
    // part of it that is a rail. The nine-slice's corner bracket reaches 144px
    // into the source art, and padding by all of it threw away a tenth of a
    // small card on each side, which is what made the cards tall enough to
    // push the buttons off the screen.
    const frame = this.frameInsetFor(cw, ch)
    const pad = Math.max(LO.cardPad, Math.ceil(frame.left))
    const padR = Math.max(LO.cardPad, Math.ceil(frame.right))
    const padT = Math.max(LO.cardPad, Math.ceil(frame.top))
    const padB = Math.max(LO.cardPad, Math.ceil(frame.bottom))
    // The icon column scales with the card rather than being a fixed 62px on
    // every screen. On a wide viewport that left the art small in a column
    // with room to spare; on a narrow one a fixed wide column would eat the
    // text. Bounded at both ends so it can do neither.
    const col = Math.round(Math.max(LO.cardIconColumnMin,
      Math.min(LO.cardIconColumnMax, cw * LO.cardIconColumnShare)))
    const tx = -cw / 2 + pad + col
    const tw = cw - pad - col - padR
    const room = ch - padT - padB

    // ONE size for the whole card, chosen so the name, the stats and the body
    // all fit together. Fitting only the body was not enough: on a narrow
    // phone the stats line wraps to three lines on its own and there is
    // nothing left for the description, so the body overflowed by 43px at a
    // size the ladder thought was fine.
    let built: { name: Phaser.GameObjects.Text; stats: Phaser.GameObjects.Text | null;
      body: Phaser.GameObjects.Text; total: number } | null = null
    for (const size of LO.bodySizes) {
      built?.name.destroy(); built?.stats?.destroy(); built?.body.destroy()
      const n = this.add.text(tx, 0, name.toUpperCase(), {
        fontFamily: FONT_UI, fontSize: `${size}px`, color: COLOR.ink, fontStyle: 'bold',
        wordWrap: { width: tw },
      }).setOrigin(0, 0)
      const st = stats === null ? null : this.add.text(tx, 0, stats, {
        fontFamily: FONT_UI, fontSize: `${size}px`, color: COLOR.ink,
        wordWrap: { width: tw },
      }).setOrigin(0, 0)
      const bd = this.add.text(tx, 0, body, {
        fontFamily: FONT_UI, fontSize: `${size}px`, color: COLOR.dim, ...BODY_SPACING,
        wordWrap: { width: tw },
      }).setOrigin(0, 0)
      const total = n.height + 4 + (st ? st.height + 3 : 0) + bd.height
      built = { name: n, stats: st, body: bd, total }
      if (total <= room) break
    }
    const b = built as NonNullable<typeof built>

    // Laid out from the top of the padded area, centred if there is slack.
    let ty = padT + Math.max(0, (room - b.total) / 2)
    b.name.setY(ty); ty += b.name.height + 4
    if (b.stats) { b.stats.setY(ty); ty += b.stats.height + 3 }
    b.body.setY(ty)

    const box = col - 8
    // Centred in its column, vertically as well as horizontally. The icons
    // used to sit at a fixed y near the top, which put them against the frame
    // and made them read as different sizes from card to card.
    const iconCx = -cw / 2 + pad + col / 2
    const iconCy = ch / 2 - (cost === null ? 0 : 10)
    const costText = cost === null ? null : this.add.text(
      iconCx, iconCy + box / 2 + 4, cost, {
        fontFamily: FONT_UI, fontSize: '22px', color: COLOR.amber, fontStyle: 'bold',
      },
    ).setOrigin(0.5, 0)

    return {
      parts: [
        ...icon(iconCx, iconCy, box),
        b.name, b.body,
        ...(costText ? [costText] : []),
        ...(b.stats ? [b.stats] : []),
      ],
    }
  }

  /**
   * An icon centred in a box it can never spill out of.
   *
   * `fitInBox` scales by the manifest's CONTENT extents, which is right for
   * matching art of different source sizes — but a padded canvas then renders
   * wider than the box it was given, and the Write-Off tower's did exactly
   * that: its art reached out of the icon column and under the card's own
   * text. This clamps on what is actually drawn.
   */
  private boxedIcon(key: string, cx: number, cy: number, box: number): Phaser.GameObjects.Image {
    const img = this.add.image(cx, cy, key)
    fitInBox(img, key, box)
    const over = Math.max(img.displayWidth, img.displayHeight)
    if (over > box) img.setScale(img.scaleX * (box / over), img.scaleY * (box / over))
    return img
  }

  /** The painted frame's inner rail for a card of this size. Exposed so a
   *  harness run measures against the frame the player sees. */
  frameInsetFor(w: number, h = 140): { left: number; right: number; top: number; bottom: number } {
    const f = panelInset(this, w, h)
    const k = LO.frameInsetShare
    return { left: f.left * k, right: f.right * k, top: f.top * k, bottom: f.bottom * k }
  }

  /**
   * The two opening towers, described to the same depth as the specials.
   */
  private towerSection(ids: string[], top: number, height: number): number {
    const y = this.heading('TOWERS', top)
    return this.cardRow(ids, y, height, (id, cw, ch) => {
      const def = TOWERS[id]!
      return this.cardFace(
        cw, ch,
        // fitInBox, not towerIcon: towerIcon is BOTTOM-anchored and takes a
        // baseline, so passing it the box centre hung every tower icon above
        // the middle and against the frame. fitInBox centres the art and
        // scales its longest side to exactly the box, so a wide tower and a
        // tall one occupy the same square — which is what made them look
        // like different sizes from card to card.
        (cx, cy, box) => [this.boxedIcon(def.sprite, cx, cy, box)],
        def.name, `${def.cost}`, towerStats(def), towerLine(def),
      )
    })
  }

  private abilitySection(ids: string[], top: number, height: number): number {
    const y = this.heading('SPECIALS', top)
    return this.cardRow(ids, y, height, (id, cw, ch) => {
      const def = ABILITIES[id]!
      return this.cardFace(
        cw, ch,
        (cx, cy, box) => [this.boxedIcon(def.icon, cx, cy, box)],
        def.name, null, null, abilityLine(def),
      )
    })
  }

  /**
   * A row of equal cards, at the height the screen can spare.
   *
   * The height is GIVEN. It used to be measured from the tallest card, which
   * is how the row grew until the buttons left the screen; now the row is told
   * what it has and each face fits itself into it.
   */
  private cardRow(
    ids: string[],
    y: number,
    height: number,
    build: (id: string, cw: number, ch: number) => { parts: Phaser.GameObjects.GameObject[] },
  ): number {
    const gap = 22
    const n = Math.max(1, ids.length)
    const cw = Math.floor((this.contentWidth - gap * (n - 1)) / n)
    const total = n * cw + (n - 1) * gap

    ids.forEach((id, i) => {
      const x = W / 2 - total / 2 + i * (cw + gap)
      const c = this.card(x, y, cw, height)
      c.face.add(build(id, cw, height).parts)
    })
    return y + height
  }
}


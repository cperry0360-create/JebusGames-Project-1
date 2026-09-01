import Phaser from 'phaser'
import type { AbilityDef, DraftDef, HeroDef, TowerDef } from '../types.ts'
import displayData from '../data/display.json'
import heroesData from '../data/heroes.json'
import towersData from '../data/towers.json'
import abilitiesData from '../data/abilities.json'
import draftData from '../data/draft.json'
import { draftAbilities, draftOpeningTowers, makeRng, reserveTowers } from '../systems/Draft.ts'
import { runState, setRunState } from '../systems/RunState.ts'
import { BODY_SPACING, COLOR, FONT_DISPLAY, FONT_UI } from '../ui/Theme.ts'
import { panelInset, plateButton, platePanel } from '../ui/Plate.ts'
import { towerIcon } from '../ui/TowerIcon.ts'
import { fitInBox } from '../systems/Art.ts'
import { fitCameraToDesign } from '../ui/FitCamera.ts'
import { abilityLine, towerLine, towerStats } from '../systems/AbilityText.ts'
import { ART, renderFor } from '../systems/Art.ts'
import presentationData from '../data/presentation.json'
import { play } from '../systems/Audio.ts'

const HEROES = heroesData as Record<string, HeroDef>
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
    // Fixed UI camera: the design box is fitted into the viewport so nothing
    // is cut off, and no gesture is bound to it. Menus never pan or zoom.
    fitCameraToDesign(this)

    this.rerollsLeft = DRAFT.rerollsPerRun
    this.deal(runState().seed)

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

    // Phase 1 has one hero, so this draws Cory every time. It is written as a
    // draw anyway: the reroll is specified as rerolling the hero too, and the
    // day a second hero lands this needs no edit.
    const heroPool = Object.keys(HEROES)
    const heroId = heroPool[Math.floor(rng() * heroPool.length)] ?? 'cory'

    // Server Nuke is a mid-run drop, never a starting hand.
    const pool = Object.keys(ABILITIES).filter((id) => ABILITIES[id].draftable)
    const abilities = draftAbilities(pool, DRAFT.abilitiesDrawn, rng)
    const towerPool = Object.entries(TOWERS).map(([id, t]) => ({
      id, weight: DRAFT.towerWeights[id], archetype: t.archetype,
    }))
    const opening = draftOpeningTowers(towerPool, DRAFT, rng)
    const reserve = reserveTowers(towerPool, opening, rng)
    setRunState({ heroId, abilities, openingTowers: opening, reserveTowers: reserve })
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
    const visW = Math.max(W, this.scale.width / zoom)
    const visH = Math.max(H, this.scale.height / zoom)

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

  /** The painted frame's inner inset for a card of this width. Exposed so a
   *  harness run measures against the frame the player sees rather than the
   *  box behind it. */
  frameInsetFor(w: number): { left: number; right: number; top: number; bottom: number } {
    return panelInset(this, w, 120)
  }

  private render(): void {
    this.layer?.destroy(true)
    this.layer = this.add.container(0, 0)
    this.cards = []
    const run = runState()
    const hero = HEROES[run.heroId] ?? HEROES.cory

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

    // Laid out top to bottom with one gap between sections rather than three
    // hand-picked y values, so the rhythm cannot drift when a card changes
    // height. Each section returns the y it finished at.
    // The plate's chrome reaches about 10px above the box it is given, so a
    // heading set tight against a card is drawn underneath its frame. The gap
    // clears the chrome rather than the box.
    let y = 72 + 20
    y = this.heroSection(hero, y) + LO.sectionGap
    y = this.towerSection(run.openingTowers, y) + LO.sectionGap
    y = this.abilitySection(run.abilities, y) + LO.sectionGap

    // Two buttons on one row: the reroll is a choice about this screen, so it
    // belongs beside the button that leaves it rather than tucked in a corner.
    // Follows the content. It used to be clamped to the bottom of the screen,
    // which does not make room — it just draws the buttons on top of the last
    // row of cards, and on a 568x320 phone that is exactly what it did. If the
    // stack ever grows past the box the layout test catches it, which is a
    // failure worth seeing rather than one hidden under a button.
    // +36, not +22: `y` is the bottom of the card's BOX, and the plate's
    // nine-slice chrome hangs about 14px below that. Measuring to the box put
    // the button row three pixels inside the last card.
    const by = y + 36
    const begin = plateButton(this, W / 2 + 90, by, 300, LO.buttonHeight, 'BEGIN THE RUN', () => {
      this.scene.start('Game')
      this.scene.launch('Hud')
    }, 24)
    const left = this.rerollsLeft
    const reroll = plateButton(this, W / 2 - 190, by, 240, LO.buttonHeight,
      `${LO.copy.rerollLabel} (${left} left)`, () => this.reroll(), 22)
    // Spent, it stays on the screen greyed rather than disappearing: a button
    // that vanishes takes the knowledge that the option existed with it. And
    // greyed now means genuinely inert — a disabled plate is off the input
    // list, so it cannot be pressed and cannot swallow a press either.
    if (left <= 0) reroll.setEnabled(false)
    this.layer.add([...reroll.parts, ...begin.parts])

    // Every card is face-up for now. The reveal lands here.
    for (const c of this.cards) c.reveal()
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

  private heroSection(hero: HeroDef, top: number): number {
    const y = this.heading('HERO', top)
    const w = this.contentWidth
    const x = W / 2 - w / 2

    // The portrait is sized first, because it is what sets the card's height.
    // It used to be 96px in a 136px card, floated left of a text block that
    // started 150px in — a small picture with a gap either side of it.
    const portraitBox = 104
    // Against the painted frame, like every other card. Padded by a flat 12
    // it put CORY 19px above the frame's top rail and his kit 19px below the
    // bottom one — the worst overflow on the screen, and one that no random
    // draw could ever miss, yet three passes did.
    const frame = panelInset(this, w, 140)
    const pad = Math.max(12, Math.ceil(Math.max(frame.left, frame.top, frame.bottom)) + 2)
    const textX = -w / 2 + pad + portraitBox + 18

    const name = this.add.text(textX, 0, hero.name.toUpperCase(), {
      fontFamily: FONT_UI, fontSize: '30px', fontStyle: 'bold', color: COLOR.ink,
      letterSpacing: 2,
    }).setOrigin(0, 0)
    const line = this.add.text(textX, 0, hero.blurb, {
      fontFamily: FONT_UI, fontSize: '22px', color: COLOR.dim, ...BODY_SPACING,
      wordWrap: { width: w - pad - portraitBox - 18 - pad },
    }).setOrigin(0, 0)
    const kit = this.add.text(textX, 0, `${hero.haymaker.name}  ·  ${hero.restructure.name}`, {
      fontFamily: FONT_UI, fontSize: '22px', color: COLOR.good, letterSpacing: 1,
    }).setOrigin(0, 0)

    // Height from the content, then the text block centred against the
    // portrait rather than pinned to the top of the card.
    const stack = name.height + 4 + line.height + 6 + kit.height
    const h = Math.max(portraitBox + pad * 2, stack + pad * 2)
    const c = this.card(x, y, w, h)

    let ty = (h - stack) / 2
    name.setY(ty); ty += name.height + 4
    line.setY(ty); ty += line.height + 6
    kit.setY(ty)

    const portrait = this.add.image(-w / 2 + pad + portraitBox / 2, h / 2, hero.portraitSprite)
    fitInBox(portrait, hero.portraitSprite, portraitBox)
    c.face.add([portrait, name, line, kit])
    return y + h
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
    icon: (cx: number, cy: number, box: number) => Phaser.GameObjects.GameObject[],
    name: string,
    cost: string | null,
    stats: string | null,
    body: string,
  ): { parts: Phaser.GameObjects.GameObject[]; bottom: number } {
    // Padded against the painted frame, not against the box. The frame's
    // corners reach in further than the box edge, so a hand-picked 9px put the
    // cost on top of the chrome — which is exactly what was reported, and what
    // measuring against the backing rectangle could never see.
    const frame = panelInset(this, cw, 120)
    const pad = Math.max(LO.cardPad, Math.ceil(frame.left) + 2)
    const padR = Math.max(LO.cardPad, Math.ceil(frame.right) + 2)
    // The frame is not square. Its top rail is deeper than its side rails, so
    // padding the top by the LEFT inset put every card's name one pixel onto
    // the chrome — on all fourteen entries, at both viewports.
    const padT = Math.max(LO.cardPad, Math.ceil(frame.top) + 2)
    const col = LO.cardIconColumn
    const tx = -cw / 2 + pad + col
    const tw = cw - pad - col - padR

    // The price goes UNDER the icon, not beside the name. Sharing the name's
    // line cost it 37px of a 200px column on a small phone, which was enough
    // to wrap "WITHHOLDING TOWER" onto a second line and make the whole row
    // 26px taller than it needed to be. The icon column has the height going
    // spare, and a picture with a price under it is a price tag.
    const box = LO.cardIconBox
    const costText = cost === null ? null : this.add.text(
      -cw / 2 + pad + col / 2, padT + box + 4, cost, {
        fontFamily: FONT_UI, fontSize: '22px', color: COLOR.amber, fontStyle: 'bold',
      },
    ).setOrigin(0.5, 0)
    const nameText = this.add.text(tx, padT, name.toUpperCase(), {
      fontFamily: FONT_UI, fontSize: '22px', color: COLOR.ink, fontStyle: 'bold',
      wordWrap: { width: tw },
    }).setOrigin(0, 0)

    let ty = padT + nameText.height + 6
    const statsText = stats === null ? null : this.add.text(tx, ty, stats, {
      fontFamily: FONT_UI, fontSize: '22px', color: COLOR.ink,
      wordWrap: { width: tw },
    }).setOrigin(0, 0)
    if (statsText) ty += statsText.height + 4

    const bodyText = this.add.text(tx, ty, body, {
      fontFamily: FONT_UI, fontSize: '22px', color: COLOR.dim, ...BODY_SPACING,
      wordWrap: { width: tw },
    }).setOrigin(0, 0)

    const parts = [
      ...icon(-cw / 2 + pad + col / 2, padT + box / 2, box),
      nameText, bodyText,
    ]
    if (costText) parts.push(costText)
    if (statsText) parts.push(statsText)

    // The taller of the two columns decides the card, so a short description
    // never crops the icon and a tall one never runs off the plate.
    // The bottom inset is larger than the top one: the plate's chrome reaches
    // further in at the foot than at the head, and a last line set to the same
    // padding as the first sits on the frame.
    const iconColumnBottom = padT + box + (costText ? 4 + costText.height : 0)
    return {
      parts,
      bottom: Math.max(ty + bodyText.height, iconColumnBottom)
        + Math.max(LO.cardPadBottom, Math.ceil(frame.bottom) + 2),
    }
  }

  /**
   * The two opening towers, described to the same depth as the specials.
   *
   * They used to show a name and a price while the ability cards showed full
   * mechanics, so the player was asked to compare two things that had been
   * explained to completely different depths.
   */
  private towerSection(ids: string[], top: number): number {
    const y = this.heading('TOWERS', top)
    return this.cardRow(ids, y, (id, cw) => {
      const def = TOWERS[id]!
      return this.cardFace(
        cw,
        (cx, cy, box) => towerIcon(this, cx, cy, def.sprite, box),
        def.name, `${def.cost}`, towerStats(def), towerLine(def),
      )
    })
  }

  private abilitySection(ids: string[], top: number): number {
    const y = this.heading('SPECIALS', top)
    return this.cardRow(ids, y, (id, cw) => {
      const def = ABILITIES[id]!
      return this.cardFace(
        cw,
        (cx, cy, box) => {
          const img = this.add.image(cx, cy, def.icon)
          fitInBox(img, def.icon, box)
          return [img]
        },
        def.name, null, null, abilityLine(def),
      )
    })
  }

  /**
   * A row of equal cards.
   *
   * Every face is built first, its natural height measured, and the tallest
   * decides the row. The two special cards were 162px against the towers'
   * 104px and the grid read as broken; a row whose height is picked per card
   * always will.
   */
  private cardRow(
    ids: string[],
    y: number,
    build: (id: string, cw: number) => { parts: Phaser.GameObjects.GameObject[]; bottom: number },
  ): number {
    const gap = 22
    const n = Math.max(1, ids.length)
    const cw = Math.floor((this.contentWidth - gap * (n - 1)) / n)
    const total = n * cw + (n - 1) * gap

    // Built before any card exists, so the row's height is known before the
    // plates are drawn.
    const built = ids.map((id) => build(id, cw))
    const h = Math.max(...built.map((b) => b.bottom), 96)

    ids.forEach((_id, i) => {
      const x = W / 2 - total / 2 + i * (cw + gap)
      const c = this.card(x, y, cw, h)
      c.face.add(built[i]!.parts)
    })
    return y + h
  }
}

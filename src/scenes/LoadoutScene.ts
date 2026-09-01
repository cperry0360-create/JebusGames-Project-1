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
import { plateButton, platePanel } from '../ui/Plate.ts'
import { towerIcon } from '../ui/TowerIcon.ts'
import { fitInBox } from '../systems/Art.ts'
import { fitCameraToDesign } from '../ui/FitCamera.ts'
import { abilityLine, towerLine, towerStats } from '../systems/AbilityText.ts'
import { ART, renderFor } from '../systems/Art.ts'
import presentationData from '../data/presentation.json'

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

    const run = runState()
    const rng = makeRng(run.seed)

    // Server Nuke is a mid-run drop, never a starting hand.
    const pool = Object.keys(ABILITIES).filter((id) => ABILITIES[id].draftable)
    const abilities = draftAbilities(pool, DRAFT.abilitiesDrawn, rng)
    const towerPool = Object.entries(TOWERS).map(([id, t]) => ({
      id, weight: DRAFT.towerWeights[id], archetype: t.archetype,
    }))
    const opening = draftOpeningTowers(towerPool, DRAFT, rng)
    const reserve = reserveTowers(towerPool, opening, rng)
    setRunState({ abilities, openingTowers: opening, reserveTowers: reserve })

    this.contentWidth = this.drawBackdrop()
    this.render()
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

  private render(): void {
    this.layer?.destroy(true)
    this.layer = this.add.container(0, 0)
    this.cards = []
    const run = runState()
    const hero = HEROES[run.heroId] ?? HEROES.cory

    this.add.text(W / 2, 8, 'YOUR LOADOUT', {
      fontFamily: FONT_DISPLAY, fontSize: '44px', color: COLOR.ink,
      stroke: '#0d1016', strokeThickness: 6,
    }).setOrigin(0.5, 0)

    // Laid out top to bottom with one gap between sections rather than three
    // hand-picked y values, so the rhythm cannot drift when a card changes
    // height. Each section returns the y it finished at.
    // The plate's chrome reaches about 10px above the box it is given, so a
    // heading set tight against a card is drawn underneath its frame. The gap
    // clears the chrome rather than the box.
    let y = 72
    y = this.heroSection(hero, y) + LO.sectionGap
    y = this.towerSection(run.openingTowers, y) + LO.sectionGap
    y = this.abilitySection(run.abilities, y) + LO.sectionGap

    const b = plateButton(this, W / 2, Math.min(y + 30, H - 34), 300, 54, 'BEGIN THE RUN', () => {
      this.scene.start('Game')
      this.scene.launch('Hud')
    }, 24)
    this.layer.add(b.parts)

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
    const c: Card = {
      parts,
      face,
      // Instant today. When the cards start face-down this becomes the flip,
      // and nothing that builds a face has to know about it.
      reveal: () => face.setAlpha(1),
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
    const pad = 12
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
   * The two opening towers, described to the same depth as the specials.
   *
   * They used to show a name and a price while the ability cards showed full
   * mechanics, so the player was asked to compare two things that had been
   * explained to completely different depths.
   */
  private towerSection(ids: string[], top: number): number {
    const y = this.heading('TOWERS', top)
    return this.cardRow(ids, y, (id, cw) => {
      const def = TOWERS[id]
      const icon = towerIcon(this, -cw / 2 + 52, 66, def.sprite, 62)
      // The price is measured first so the name can be wrapped to what is
      // left. Escalation Clause is long enough to run straight under its own
      // cost otherwise.
      const cost = this.add.text(cw / 2 - 12, 12, `${def.cost}`, {
        fontFamily: FONT_UI, fontSize: '22px', color: COLOR.amber, fontStyle: 'bold',
      }).setOrigin(1, 0)
      const name = this.add.text(-cw / 2 + 96, 12, def.name.toUpperCase(), {
        fontFamily: FONT_UI, fontSize: '22px', color: COLOR.ink, fontStyle: 'bold',
        wordWrap: { width: cw - 96 - 12 - cost.width - 14 },
      }).setOrigin(0, 0)
      const bandBottom = Math.max(78, 12 + name.height + 10)
      const stats = this.add.text(0, bandBottom, towerStats(def), {
        fontFamily: FONT_UI, fontSize: '22px', color: COLOR.ink,
        align: 'center', wordWrap: { width: cw - 20 },
      }).setOrigin(0.5, 0)
      const what = this.add.text(0, bandBottom + stats.height + 4, towerLine(def), {
        fontFamily: FONT_UI, fontSize: '22px', color: COLOR.dim, ...BODY_SPACING,
        align: 'center', wordWrap: { width: cw - 20 },
      }).setOrigin(0.5, 0)
      return {
        parts: [...icon, name, cost, stats, what],
        bottom: bandBottom + stats.height + 4 + what.height + 12,
      }
    })
  }

  private abilitySection(ids: string[], top: number): number {
    const y = this.heading('SPECIALS', top)
    return this.cardRow(ids, y, (id, cw) => {
      const def = ABILITIES[id]
      const icon = this.add.image(-cw / 2 + 52, 62, def.icon)
      fitInBox(icon, def.icon, 66)
      const name = this.add.text(-cw / 2 + 96, 12, def.name.toUpperCase(), {
        fontFamily: FONT_UI, fontSize: '22px', color: COLOR.ink, fontStyle: 'bold',
      }).setOrigin(0, 0)
      const what = this.add.text(0, 78, abilityLine(def), {
        fontFamily: FONT_UI, fontSize: '22px', color: COLOR.dim, ...BODY_SPACING,
        align: 'center', wordWrap: { width: cw - 20 },
      }).setOrigin(0.5, 0)
      return { parts: [icon, name, what], bottom: 78 + what.height + 12 }
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

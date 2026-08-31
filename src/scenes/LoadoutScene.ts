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
import { abilityLine } from '../systems/AbilityText.ts'

const HEROES = heroesData as Record<string, HeroDef>
const TOWERS = towersData as Record<string, TowerDef>
const ABILITIES = abilitiesData as Record<string, AbilityDef>
const DRAFT = draftData as DraftDef

const W = displayData.width
const H = displayData.height

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

    this.add.rectangle(0, 0, W, H, 0x10161d).setOrigin(0, 0)
    this.render()
  }

  private render(): void {
    this.layer?.destroy(true)
    this.layer = this.add.container(0, 0)
    this.cards = []
    const run = runState()
    const hero = HEROES[run.heroId] ?? HEROES.cory

    this.add.text(W / 2, 24, 'YOUR LOADOUT', {
      fontFamily: FONT_DISPLAY, fontSize: '44px', color: COLOR.ink,
    }).setOrigin(0.5, 0)

    this.heroSection(hero, 76)
    this.towerSection(run.openingTowers, 258)
    this.abilitySection(run.abilities, 408)

    const b = plateButton(this, W / 2, 656, 320, 58, 'BEGIN THE RUN', () => {
      this.scene.start('Game')
      this.scene.launch('Hud')
    }, 26)
    this.layer.add(b.parts)

    // Every card is face-up for now. The reveal lands here.
    for (const c of this.cards) c.reveal()
  }

  /** A section heading, in the amber the whole game uses for labels. */
  private heading(text: string, y: number): void {
    this.layer.add(this.add.text(W / 2, y, text, {
      fontFamily: FONT_UI, fontSize: '22px', color: COLOR.amber, letterSpacing: 3,
    }).setOrigin(0.5, 0))
  }

  /** Builds a plate with an empty face container on top, ready to fill. */
  private card(x: number, y: number, w: number, h: number): Card {
    const plate = platePanel(this, x, y, w, h)
    const face = this.add.container(x + w / 2, y)
    const parts: Phaser.GameObjects.GameObject[] = [...plate, face]
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

  private heroSection(hero: HeroDef, y: number): void {
    this.heading('HERO', y)
    const w = 720
    const h = 136
    const x = W / 2 - w / 2
    const c = this.card(x, y + 34, w, h)

    const portrait = this.add.image(-w / 2 + 76, h / 2, hero.portraitSprite)
    fitInBox(portrait, hero.portraitSprite, 96)
    const name = this.add.text(-w / 2 + 150, 20, hero.name.toUpperCase(), {
      fontFamily: FONT_UI, fontSize: '34px', fontStyle: 'bold', color: COLOR.ink,
      letterSpacing: 2,
    }).setOrigin(0, 0)
    const line = this.add.text(-w / 2 + 150, 60, hero.blurb, {
      fontFamily: FONT_UI, fontSize: '22px', color: COLOR.dim, ...BODY_SPACING,
      wordWrap: { width: w - 190 },
    }).setOrigin(0, 0)
    const kit = this.add.text(-w / 2 + 150, h - 24, `${hero.haymaker.name}  ·  ${hero.restructure.name}`, {
      fontFamily: FONT_UI, fontSize: '22px', color: COLOR.good, letterSpacing: 1,
    }).setOrigin(0, 0.5)
    c.face.add([portrait, name, line, kit])
  }

  private towerSection(ids: string[], y: number): void {
    this.heading('TOWERS', y)
    const cw = 340
    const gap = 28
    const total = ids.length * cw + (ids.length - 1) * gap
    ids.forEach((id, i) => {
      const def = TOWERS[id]
      const x = W / 2 - total / 2 + i * (cw + gap)
      const c = this.card(x, y + 32, cw, 104)
      // towerIcon returns the sprite plus its base plate, not one object.
      const icon = towerIcon(this, -cw / 2 + 62, 60, def.sprite, 74)
      const name = this.add.text(-cw / 2 + 116, 34, def.name.toUpperCase(), {
        fontFamily: FONT_UI, fontSize: '22px', color: COLOR.ink, fontStyle: 'bold',
      }).setOrigin(0, 0)
      const cost = this.add.text(-cw / 2 + 116, 66, `${def.cost} peanuts`, {
        fontFamily: FONT_UI, fontSize: '22px', color: COLOR.amber,
      }).setOrigin(0, 0)
      c.face.add([...icon, name, cost])
    })
  }

  private abilitySection(ids: string[], y: number): void {
    this.heading('SPECIALS', y)
    const cw = 340
    const gap = 28
    const total = ids.length * cw + (ids.length - 1) * gap
    ids.forEach((id, i) => {
      const def = ABILITIES[id]
      const x = W / 2 - total / 2 + i * (cw + gap)
      const c = this.card(x, y + 32, cw, 162)
      const icon = this.add.image(-cw / 2 + 60, 58, def.icon)
      fitInBox(icon, def.icon, 72)
      const name = this.add.text(-cw / 2 + 112, 30, def.name.toUpperCase(), {
        fontFamily: FONT_UI, fontSize: '22px', color: COLOR.ink, fontStyle: 'bold',
      }).setOrigin(0, 0)
      const what = this.add.text(-cw / 2 + 22, 86, abilityLine(def), {
        fontFamily: FONT_UI, fontSize: '22px', color: COLOR.dim, ...BODY_SPACING,
        align: 'center', wordWrap: { width: cw - 44 },
      }).setOrigin(0, 0)
      c.face.add([icon, name, what])
    })
  }
}

import Phaser from 'phaser'
import type { AbilityDef, DraftDef, TowerDef } from '../types.ts'
import displayData from '../data/display.json'
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

const TOWERS = towersData as Record<string, TowerDef>
const ABILITIES = abilitiesData as Record<string, AbilityDef>
const DRAFT = draftData as DraftDef

/** The size the ability cards were drawn for. */
// How far above a card's bottom edge its stats line sits. The plate art
// carries a thick chrome band at these sizes; inside this margin the text
// lands on the frame rather than on the panel.
const CARD_FOOT = 42
const ABILITY_ICON_H = 84

/**
 * Two steps in one screen: the abilities you drew, then the towers you opened
 * with. Both are shown before the map so the run has a shape before it starts.
 */
export class DraftScene extends Phaser.Scene {
  private step: 'abilities' | 'towers' = 'abilities'
  private layer!: Phaser.GameObjects.Container

  constructor() {
    super('Draft')
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
    const opening = draftOpeningTowers(
      Object.entries(TOWERS).map(([id, t]) => ({ id, weight: DRAFT.towerWeights[id], archetype: t.archetype })),
      DRAFT,
      rng,
    )
    const reserve = reserveTowers(
      Object.entries(TOWERS).map(([id, t]) => ({ id, weight: DRAFT.towerWeights[id], archetype: t.archetype })),
      opening,
      rng,
    )
    setRunState({ abilities, openingTowers: opening, reserveTowers: reserve })

    this.add.rectangle(0, 0, displayData.width, displayData.height, 0x10161d).setOrigin(0, 0)
    this.step = 'abilities'
    this.render()
  }

  private render(): void {
    this.layer?.destroy(true)
    this.layer = this.add.container(0, 0)
    const run = runState()
    const W = displayData.width

    const isAbilities = this.step === 'abilities'
    const title = isAbilities ? 'YOUR ABILITIES' : 'YOUR OPENING TOWERS'
    const sub = isAbilities
      ? `Two of ${Object.values(ABILITIES).filter((a) => a.draftable).length} actives, drawn for this run. They do not change.`
      : `Two of ${Object.keys(TOWERS).length} towers. A third arrives after wave ${DRAFT.unlockAfterWave[0]}, a fourth after wave ${DRAFT.unlockAfterWave[1]}.`

    this.layer.add(this.add.text(W / 2, 78, title, {
      fontFamily: FONT_DISPLAY, fontSize: '44px', color: COLOR.ink, stroke: '#0d1016', strokeThickness: 6,
    }).setOrigin(0.5))
    this.layer.add(this.add.text(W / 2, 128, sub, {
      fontFamily: FONT_UI, fontSize: '22px', color: COLOR.dim, ...BODY_SPACING,
      align: 'center', wordWrap: { width: 1120 },
    }).setOrigin(0.5))

    const ids = isAbilities ? run.abilities : run.openingTowers
    const cardW = 380
    const gap = 30
    const totalW = ids.length * cardW + (ids.length - 1) * gap
    ids.forEach((id, i) => {
      const x = W / 2 - totalW / 2 + i * (cardW + gap)
      if (isAbilities) this.abilityCard(x, 172, cardW, id)
      else this.towerCard(x, 172, cardW, id)
    })

    if (!isAbilities && run.reserveTowers.length > 0) {
      this.layer.add(this.add.text(W / 2, 580, 'Still in the pool: ' +
        run.reserveTowers.map((id) => TOWERS[id].name).join(', '), {
        fontFamily: FONT_UI, fontSize: '22px', color: COLOR.dim,
      }).setOrigin(0.5).setAlpha(0.8))
    }

    const b = plateButton(this, W / 2, 638, 300, 60,
      isAbilities ? 'NEXT: TOWERS' : 'BEGIN THE RUN',
      () => {
        if (this.step === 'abilities') {
          this.step = 'towers'
          this.render()
        } else {
          this.scene.start('Game')
          this.scene.launch('Hud')
        }
      }, 26)
    this.layer.add(b.parts)
  }

  private abilityCard(x: number, y: number, w: number, id: string): void {
    const def = ABILITIES[id]
    const h = 266
    this.layer.add(platePanel(this, x, y, w, h))
    // The cards carry their own frames, so nothing is drawn behind them.
    const icon = this.add.image(x + w / 2, y + 88, def.icon)
    fitInBox(icon, def.icon, ABILITY_ICON_H)
    this.layer.add(icon)
    this.layer.add(this.add.text(x + w / 2, y + 158, def.name.toUpperCase(), {
      fontFamily: FONT_DISPLAY, fontSize: '30px', color: COLOR.ink,
    }).setOrigin(0.5))
    this.layer.add(this.add.text(x + w / 2, y + h - CARD_FOOT, this.abilityStats(def), {
      fontFamily: FONT_UI, fontSize: '22px', color: COLOR.amber, align: 'center',
    }).setOrigin(0.5))
  }

  private abilityStats(def: AbilityDef): string {
    const bits: string[] = [`${def.cooldown}s cooldown`]
    if (def.payoutMax > 0) bits.push(`${def.payoutMin}-${def.payoutMax} peanuts`)
    if (def.damage > 0) bits.push(`${def.damage} damage`)
    if (def.summonCount > 0) bits.push(`${def.summonCount} gnomes`)
    if (def.slowFactor > 0) bits.push(`slow to ${Math.round(def.slowFactor * 100)}%`)
    return bits.join('   ·   ')
  }

  private towerCard(x: number, y: number, w: number, id: string): void {
    const def = TOWERS[id]
    const h = 300
    this.layer.add(platePanel(this, x, y, w, h))
    this.layer.add(towerIcon(this, x + w / 2, y + 96, def.sprite, 104))
    this.layer.add(this.add.text(x + w / 2, y + 160, def.name.toUpperCase(), {
      fontFamily: FONT_DISPLAY, fontSize: '30px', color: COLOR.ink,
    }).setOrigin(0.5))
    this.layer.add(this.add.text(x + w / 2, y + 194, def.archetype, {
      fontFamily: FONT_UI, fontSize: '22px', color: COLOR.good,
    }).setOrigin(0.5))
    const stats = def.supportRadius > 0
      ? `${def.cost}p   ·   +${Math.round(def.supportDamageBonus * 100)}% nearby`
      : `${def.cost}p   ·   ${def.damage} dmg   ·   ${def.range} range`
    this.layer.add(this.add.text(x + w / 2, y + h - CARD_FOOT, stats, {
      fontFamily: FONT_UI, fontSize: '22px', color: COLOR.amber,
    }).setOrigin(0.5))
  }
}

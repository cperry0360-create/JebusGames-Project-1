import Phaser from 'phaser'
import type { AbilityDef, DraftDef, TowerDef } from '../types.ts'
import displayData from '../data/display.json'
import towersData from '../data/towers.json'
import abilitiesData from '../data/abilities.json'
import draftData from '../data/draft.json'
import { draftAbilities, draftOpeningTowers, makeRng, reserveTowers } from '../systems/Draft.ts'
import { runState, setRunState } from '../systems/RunState.ts'
import { COLOR, FONT_DISPLAY, FONT_UI, button, panel } from '../ui/Theme.ts'
import { towerIcon } from '../ui/TowerIcon.ts'
import { fitInBox } from '../systems/Art.ts'

const TOWERS = towersData as Record<string, TowerDef>
const ABILITIES = abilitiesData as Record<string, AbilityDef>
const DRAFT = draftData as DraftDef

/** The size the ability cards were drawn for. */
const ABILITY_ICON_H = 64

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
    this.layer.add(this.add.text(W / 2, 130, sub, {
      fontFamily: FONT_UI, fontSize: '15px', color: COLOR.dim,
    }).setOrigin(0.5))

    const ids = isAbilities ? run.abilities : run.openingTowers
    const cardW = 300
    const gap = 40
    const totalW = ids.length * cardW + (ids.length - 1) * gap
    ids.forEach((id, i) => {
      const x = W / 2 - totalW / 2 + i * (cardW + gap)
      if (isAbilities) this.abilityCard(x, 180, cardW, id)
      else this.towerCard(x, 180, cardW, id)
    })

    if (!isAbilities && run.reserveTowers.length > 0) {
      this.layer.add(this.add.text(W / 2, 500, 'Still in the pool: ' +
        run.reserveTowers.map((id) => TOWERS[id].name).join(', '), {
        fontFamily: FONT_UI, fontSize: '13px', color: COLOR.dim,
      }).setOrigin(0.5).setAlpha(0.75))
    }

    const b = button(this, W / 2, 618, 280, 56,
      isAbilities ? 'NEXT: TOWERS' : 'BEGIN THE RUN',
      () => {
        if (this.step === 'abilities') {
          this.step = 'towers'
          this.render()
        } else {
          this.scene.start('Game')
          this.scene.launch('Hud')
        }
      }, 22)
    this.layer.add(b.parts)
  }

  private abilityCard(x: number, y: number, w: number, id: string): void {
    const def = ABILITIES[id]
    const h = 280
    this.layer.add(panel(this, x, y, w, h, { fill: COLOR.panelHi }))
    // The cards carry their own frames, so nothing is drawn behind them.
    const icon = this.add.image(x + w / 2, y + 74, def.icon)
    fitInBox(icon, def.icon, ABILITY_ICON_H)
    this.layer.add(icon)
    this.layer.add(this.add.text(x + w / 2, y + 128, def.name.toUpperCase(), {
      fontFamily: FONT_DISPLAY, fontSize: '24px', color: COLOR.ink,
    }).setOrigin(0.5))
    this.layer.add(this.add.text(x + w / 2, y + 162, def.flavor, {
      fontFamily: FONT_UI, fontSize: '13px', color: COLOR.dim,
      align: 'center', wordWrap: { width: w - 40 },
    }).setOrigin(0.5, 0))
    this.layer.add(this.add.text(x + w / 2, y + 236, this.abilityStats(def), {
      fontFamily: FONT_UI, fontSize: '13px', color: COLOR.amber, align: 'center',
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
    const h = 280
    this.layer.add(panel(this, x, y, w, h, { fill: COLOR.panelHi }))
    this.layer.add(towerIcon(this, x + w / 2, y + 112, def.sprite, 104))
    this.layer.add(this.add.text(x + w / 2, y + 132, def.name.toUpperCase(), {
      fontFamily: FONT_DISPLAY, fontSize: '22px', color: COLOR.ink,
    }).setOrigin(0.5))
    this.layer.add(this.add.text(x + w / 2, y + 158, def.archetype, {
      fontFamily: FONT_UI, fontSize: '12px', color: COLOR.good,
    }).setOrigin(0.5))
    this.layer.add(this.add.text(x + w / 2, y + 184, def.flavor, {
      fontFamily: FONT_UI, fontSize: '12px', color: COLOR.dim,
      align: 'center', wordWrap: { width: w - 40 },
    }).setOrigin(0.5, 0))
    const stats = def.supportRadius > 0
      ? `${def.cost}p   ·   +${Math.round(def.supportDamageBonus * 100)}% nearby`
      : `${def.cost}p   ·   ${def.damage} dmg   ·   ${def.range} range`
    this.layer.add(this.add.text(x + w / 2, y + 250, stats, {
      fontFamily: FONT_UI, fontSize: '13px', color: COLOR.amber,
    }).setOrigin(0.5))
  }
}

import Phaser from 'phaser'
import { GameScene } from './GameScene.ts'
import type { RulesDef } from '../types.ts'
import presentationData from '../data/presentation.json'
import rulesData from '../data/rules.json'
import { COLOR, FONT_UI } from '../ui/Theme.ts'
import { ART, fitInBox, renderFor } from '../systems/Art.ts'
import { greyKey } from '../systems/Desaturate.ts'
import { plateButton, type PlateButton } from '../ui/Plate.ts'
import { AudioToggle } from '../ui/AudioToggle.ts'
import { iconPlate } from '../ui/Plate.ts'
import { Dialog } from '../ui/Dialog.ts'
import { play, resumeAudio } from '../systems/Audio.ts'
import { hudLayout, NO_INSETS, type HudLayout, type Rect } from '../systems/HudLayout.ts'
import { safeAreaInsets } from '../systems/SafeArea.ts'
import { hudInteractive } from '../systems/Layers.ts'
import {
  barWidth, iconBox, regions, slotDefs, slotSignature,
  type BarMetrics, type SlotDef, type SlotRegion,
} from '../systems/AbilityBar.ts'
import { onSceneResize, sceneIsLive } from '../systems/SceneEvents.ts'
import { fitUiCamera, viewH, viewW } from '../systems/Resolution.ts'

/**
 * A placed slot's Phaser objects, and the region they were all built from.
 *
 * The region is carried rather than copied field by field: the icon, the
 * frame, the sweep and the hit rectangle are every one of them positioned
 * from `region`, so there is no second set of coordinates to fall out of step
 * with the first. See `systems/AbilityBar.ts` for why that matters here
 * specifically.
 */
interface SlotView {
  region: SlotRegion
  frame: Phaser.GameObjects.Graphics
  sweep: Phaser.GameObjects.Graphics
  icon: Phaser.GameObjects.Image
  timer: Phaser.GameObjects.Text
  hit: Phaser.GameObjects.Rectangle
}

const HUD = presentationData.hud
/** Shared with GameScene, so the scene that draws chrome and the scene that
 *  keeps clear of it are working from one set of numbers. */
const LAYOUT = HUD.layout
const RULES = rulesData as unknown as RulesDef
/** Icons are drawn 64px tall, as the art was made for. They carry their own
 *  frames, so nothing is drawn behind them. */
const ICON_H = 64

/** How faint the empty reserved socket is. See drawSlots. */
const SOCKET = presentationData.abilityBar.emptySocket as {
  fillAlpha: number; strokeAlpha: number; strokeWidth: number; inset: number
}

/** UI lives in its own scene so the world can Y-sort freely without the HUD
 *  ever landing in the middle of the sort order. */
export class HudScene extends Phaser.Scene {
  private world!: GameScene
  private peanutsText!: Phaser.GameObjects.Text
  private livesText!: Phaser.GameObjects.Text
  private waveText!: Phaser.GameObjects.Text
  private message!: Phaser.GameObjects.Text
  private heroLabel!: Phaser.GameObjects.Text
  private heroBar!: Phaser.GameObjects.Graphics
  /** Every element's rectangle. Disjoint by construction, checked by a test. */
  private layout: HudLayout = hudLayout(
    { width: 1280, height: 720, insets: NO_INSETS, countersWidth: 0, abilitiesWidth: 0 },
    LAYOUT,
  )
  private countersWidth = 0
  /** Width of each counter plate's printable field, so a number that outgrows
   *  it shrinks instead of running off the plate. */
  private peanutsField = 999
  private livesField = 999
  private waveField = 999
  private bossBar!: Phaser.GameObjects.Graphics
  private bossLabel!: Phaser.GameObjects.Text
  private startBtn!: PlateButton
  private panel?: Dialog
  private paused = false
  slots: SlotView[] = []
  private slotsBuilt = false
  /** Last frame's DAD MODE state, so the arrival of a new option can be
   *  announced once rather than every frame. */
  private lastStandWas = false
  /** Which abilities the slots were built for, so a rare drop rebuilds them. */
  private slotKeys = ''
  /** Last drawn values, so a change can be shown rather than just displayed. */
  private lastPeanuts = -1
  private lastLives = -1

  constructor() {
    super('Hud')
  }

  create(): void {
    // A rotate or a URL-bar collapse changes the viewport, and every position
    // below is measured from it. Rebuilding is cheaper to keep correct than
    // repositioning thirty objects by hand.
    // Via the helper, so it comes off on DESTROY as well as SHUTDOWN. A scene
    // removed outright never emits SHUTDOWN, and the hand-rolled pair here
    // only listened for that one.
    onSceneResize(this, () => { if (sceneIsLive(this)) this.relayout() })

    // The HUD is laid out in CSS pixels — typography floors, plate sizes and
    // the safe-area insets are all in them — and drawn at device resolution.
    fitUiCamera(this)

    this.world = this.scene.get('Game') as GameScene
    this.slots = []
    this.slotsBuilt = false
    this.slotKeys = ''
    this.lastPeanuts = -1
    this.lastLives = -1
    const W = viewW(this)
    const H = viewH(this)

    // Where everything goes, worked out once. The map is full-bleed underneath
    // all of it — there are no bars — so nothing collides because the
    // rectangles are disjoint, not because space was taken away from the board.
    // The counters and the ability row are measured before the layout runs,
    // since both are sized by art and by the run's hand rather than by a
    // constant.
    const insets = safeAreaInsets()
    this.countersWidth = this.measureCounters()
    this.layout = hudLayout(
      {
        width: W, height: H, insets,
        countersWidth: this.countersWidth,
        abilitiesWidth: this.measureAbilities(),
      },
      LAYOUT,
    )
    const L = this.layout

    // Top-left: the three counter pills.
    this.buildCounters(L.counters)

    // Top-right: the start-wave button.
    this.buildStartButton(L.startButton)

    // Under the counters: the wave message, or the boss bar while one is up.
    // Never both — they share the rectangle and take turns.
    this.message = this.add.text(L.messageRow.x, L.messageRow.y, '', {
      fontFamily: FONT_UI, fontSize: '15px', color: COLOR.ink,
      stroke: '#0d1016', strokeThickness: 4,
      // One line: a wrapped sentence would grow down into the board.
      wordWrap: { width: L.messageRow.width },
      maxLines: 1,
    })
    this.bossBar = this.add.graphics()
    this.bossLabel = this.add.text(0, 0, '', {
      fontFamily: FONT_UI, fontSize: '15px', color: COLOR.ink,
      fontStyle: 'bold', stroke: '#0d1016', strokeThickness: 4, letterSpacing: 1,
    }).setOrigin(0.5, 0.5)

    // Under the start button: the hero's name and health. The bar is created
    // first so the name draws on top of it — Phaser orders by creation, not by
    // which draw method ran last, and at full health the fill covered the name
    // completely.
    this.heroBar = this.add.graphics()
    this.heroLabel = this.add.text(0, 0, '', {
      fontFamily: FONT_UI, fontSize: '15px', color: COLOR.ink,
      stroke: '#0d1016', strokeThickness: 4,
    }).setOrigin(1, 0.5)

    // Bottom corners and centre.
    new AudioToggle(this, L.mute.x + L.mute.width / 2, L.mute.y + L.mute.height / 2,
      L.mute.width - 8)
    this.buildPauseButton(L.pause.x + L.pause.width / 2, L.pause.y + L.pause.height / 2)
  }

  /**
   * The slots this run currently holds, in bar order.
   *
   * Everything downstream — the row's width, the icons, the hit rectangles,
   * and the check for whether the bar needs rebuilding — comes from this one
   * call, so none of them can be laid out for a different hand than the others.
   */
  private currentSlotDefs(): SlotDef[] {
    const s = this.world.status
    const hero = this.world.heroDef()
    const heroSlots: SlotDef[] = [
      { id: 'haymaker', kind: 'haymaker', icon: hero.haymaker.icon, hero: true },
      { id: 'restructure', kind: 'restructure', icon: hero.restructure.icon, hero: true },
    ]
    return slotDefs(
      s.abilities,
      s.rareAbility,
      (id) => this.world.abilityDef(id),
      heroSlots,
    )
  }

  /** The ability row's width, from the hand this run was dealt. Needed before
   *  the slots are built, because the layout places them. */
  private measureAbilities(): number {
    return barWidth(this.currentSlotDefs(), presentationData.abilityBar as BarMetrics)
  }

  /** A counter number, scaled down if it no longer fits its plate's field. */
  private setCounter(t: Phaser.GameObjects.Text, value: string, field: number): void {
    if (t.text === value) return
    t.setScale(1)
    t.setText(value)
    if (t.width > field) t.setScale(Math.max(0.6, field / t.width))
  }

  /**
   * The counter plates. Each already carries its icon and an empty dark field;
   * the number goes in that field, whose position is measured in the manifest
   * rather than guessed, so a replaced plate needs no code change.
   */
  /** Lays the counter plates out and reports where the row ends. */
  /** How wide the three plates are, from the manifest. The layout needs this
   *  before anything is drawn, and the drawing needs the same answer. */
  private counterWidths(): number[] {
    const keys = ART.ui.counters
    return ['peanuts', 'lives', 'wave'].map((name) => {
      const cfg = renderFor(keys[name])
      return (cfg.contentWidth ?? 232) * (LAYOUT.plateHeight / (cfg.contentHeight ?? 96))
    })
  }

  /** Unscaled: the layout decides how much of this the row actually gets. */
  private measureCounters(): number {
    const w = this.counterWidths()
    return w.reduce((a, b) => a + b, 0) + HUD.plateGap * (w.length - 1)
  }

  private buildCounters(box: Rect): void {
    const keys = ART.ui.counters
    const order: Array<[string, () => Phaser.GameObjects.Text, string]> = [
      ['peanuts', () => this.peanutsText, COLOR.amber],
      ['lives', () => this.livesText, COLOR.danger],
      ['wave', () => this.waveText, COLOR.ink],
    ]
    let x = box.x
    const top = box.y
    for (const [name, , colour] of order) {
      const key = keys[name]
      const cfg = renderFor(key)
      const scale = (LAYOUT.plateHeight / (cfg.contentHeight ?? 96)) * this.layout.counterScale
      const plateW = (cfg.contentWidth ?? 232) * scale

      const plate = this.add.image(x, top, key).setOrigin(0, 0)
      plate.setScale(scale)

      // Defaults only matter for a plate whose field was never measured; the
      // three real ones all carry theirs.
      const text = this.add.text(
        x + (cfg.fieldLeft ?? 0.3) * plateW + HUD.numberMargin,
        top + (cfg.fieldCentreY ?? 0.5) * box.height,
        '',
        {
          fontFamily: FONT_UI,
          fontSize: `${Math.round(HUD.numberSize * this.layout.counterScale)}px`,
          fontStyle: 'bold', color: colour,
        },
      ).setOrigin(0, 0.5)

      // The field the number is printed into, so a five-glyph wave counter
      // cannot run off the end of its own plate.
      const field = plateW * (1 - (cfg.fieldLeft ?? 0.3)) - HUD.numberMargin * 2
      if (name === 'peanuts') { this.peanutsText = text; this.peanutsField = field }
      else if (name === 'lives') { this.livesText = text; this.livesField = field }
      else { this.waveText = text; this.waveField = field }

      x += plateW + HUD.plateGap * this.layout.counterScale
    }
  }


  /**
   * Pause lives here rather than in GameScene, because it pauses GameScene:
   * a panel drawn by a paused scene cannot be tweened, pressed or closed.
   */
  private buildPauseButton(x: number, y: number): void {
    const plate = iconPlate(this, x, y, 40, 40)
    const g = this.add.graphics()
    g.fillStyle(0xf6ecd9, 1)
    g.fillRect(x - 7, y - 8, 5, 16)
    g.fillRect(x + 2, y - 8, 5, 16)
    const hit = this.add.rectangle(x, y, 44, 44, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true })
    hit.on('pointerover', () => plate.setActive(true))
    hit.on('pointerout', () => plate.setActive(false))
    hit.on('pointerdown', () => this.openPause())
  }

  /**
   * The pause dialog.
   *
   * The guard here is `this.paused && this.panel`, not `this.paused`, and the
   * difference is the whole bug. The dim backdrop of a Dialog closes it on a
   * tap unless it is told otherwise — deliberately, so a panel over a live
   * battlefield is never a trap. But `close()` is not `onCancel`: it takes the
   * dialog away without running the handler, so tapping beside the PAUSED
   * panel left `paused` true and GameScene paused with nothing on screen, and
   * the old `if (this.paused) return` then refused to reopen the one control
   * that could undo it. A frozen board and a dead pause button.
   *
   * Two independent fixes, because either alone would leave the trap set for
   * the next dialog that pauses something: this panel is not dismissable at
   * all, AND a `paused` flag with no panel behind it is now treated as the
   * thing that is wrong rather than as a reason to do nothing.
   */
  private openPause(): void {
    if (this.paused && this.panel) return
    this.paused = true
    play(this, 'open')
    this.scene.pause('Game')
    this.showPanel({
      title: 'PAUSED',
      subtitle: 'The wave is stopped. Nothing moves until you resume.',
      confirm: { label: 'RESUME', onPick: () => this.resumeGame() },
      extra: { label: 'RESTART', onPick: () => this.restartRun() },
      cancelLabel: 'QUIT',
      onCancel: () => this.confirmQuit(),
      // A paused world is left only on purpose. Every other dialog may be
      // waved away because the game carries on underneath it; this one IS the
      // way the game carries on.
      dismissable: false,
      dim: 0.55,
    })
  }

  /** A dialog owned by the HUD, so it keeps working while Game is paused. */
  private showPanel(opts: ConstructorParameters<typeof Dialog>[4]): void {
    this.panel?.close()
    this.panel = new Dialog(this, viewW(this) / 2, viewH(this) / 2, 90000, opts)
    this.panel.onClosed(() => { this.panel = undefined })
  }

  private resumeGame(): void {
    this.paused = false
    // A tap is a user gesture, which is the only thing that can start an audio
    // device the browser suspended while the tab was away. Resuming here means
    // a player who backgrounds the game and hits RESUME gets its sound back.
    void resumeAudio(this)
    this.scene.resume('Game')
  }

  private restartRun(): void {
    this.scene.resume('Game')
    this.scene.get('Game').scene.restart()
    this.scene.restart()
  }

  /** Quitting throws the run away, so it asks first. */
  private confirmQuit(): void {
    this.showPanel({
      title: 'QUIT TO TITLE?',
      subtitle: 'This run ends here. Towers, upgrades and peanuts are lost.',
      confirm: { label: 'QUIT', onPick: () => this.quitToTitle() },
      cancelLabel: 'KEEP PLAYING',
      onCancel: () => this.resumeGame(),
      // Reached from the pause dialog, so the world is paused behind it and
      // the same trap applies.
      dismissable: false,
      dim: 0.6,
    })
  }

  private quitToTitle(): void {
    this.scene.resume('Game')
    this.scene.stop('Game')
    this.scene.start('Title')
  }

  /** Tears the HUD down and builds it again at the new viewport size. */
  private relayout(): void {
    this.scene.restart()
  }

  /**
   * Re-runs the layout for a hand that has changed size.
   *
   * A rare drop makes the row wider mid-run, and the row is centred between
   * the two corner buttons — so its rectangle has to be measured again or the
   * new icon is laid out in space that was never reserved. Only the layout is
   * recomputed; the rest of the HUD has not moved, and restarting the scene to
   * add one icon would throw away the boss bar and every running tween.
   */
  private relayoutAbilities(): void {
    this.layout = hudLayout(
      {
        width: viewW(this),
        height: viewH(this),
        insets: safeAreaInsets(),
        countersWidth: this.countersWidth,
        abilitiesWidth: this.measureAbilities(),
      },
      LAYOUT,
    )
  }

  private buildStartButton(box: Rect): void {
    const x = box.x
    const y = box.y
    const w = box.width
    const h = box.height
    this.startBtn = plateButton(this, x + w / 2, y + h / 2, w, h, '',
      () => this.world.startWave(), 16)
  }

  /**
   * Builds the bar from one region list.
   *
   * Everything positioned here — icon, frame, cooldown sweep, hit rectangle —
   * reads the same `SlotRegion`. Nothing recomputes a coordinate.
   */
  private buildSlots(): void {
    for (const s of this.slots) {
      s.frame.destroy(); s.sweep.destroy(); s.icon.destroy()
      s.timer.destroy(); s.hit.destroy()
    }
    this.slots = []

    // No key letters. This is a touch game; Q W E R meant nothing on a phone
    // and the labels were four more things crowding a 64px icon.
    const bar = presentationData.abilityBar as BarMetrics
    const defs = this.currentSlotDefs()
    this.slotKeys = slotSignature(defs)

    // The layout may have shrunk the row to keep it off the corner buttons on
    // a narrow phone; the icons follow it rather than being drawn at a size
    // the rectangle does not have room for.
    const k = this.layout.abilityScale
    const placed = regions(defs, bar, {
      x: this.layout.abilities.x,
      y: this.layout.abilities.y,
      scale: k,
      iconH: ICON_H,
    })

    for (const region of placed) {
      const frame = this.add.graphics()
      const icon = this.add.image(region.cx, region.cy, region.icon)
      fitInBox(icon, region.icon, iconBox(region, bar, k))
      const sweep = this.add.graphics()
      const timer = this.add.text(region.cx, region.cy, '', {
        fontFamily: FONT_UI, fontSize: `${Math.round(19 * k)}px`,
        fontStyle: 'bold', color: COLOR.ink,
        stroke: '#0d1016', strokeThickness: 5,
      }).setOrigin(0.5)
      const hit = this.add
        .rectangle(region.cx, region.cy, region.pitch, region.boxH, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true })
      hit.on('pointerdown', () => {
        // Guarded here as well as by the hit area. Taking the rectangle out of
        // hit-testing is the real fix, but it happens in drawSlots, and a
        // handler that trusts the frame before it to have run is exactly the
        // kind of gap this bar has now been through twice.
        if (!this.slotShown(region, this.world.status)) return
        if (region.kind === 'ability') this.world.armAbility(region.id)
        else if (region.kind === 'haymaker') this.world.castHaymaker()
        else this.world.armRestructure()
      })

      this.slots.push({ region, frame, sweep, icon, timer, hit })
    }
  }

  update(): void {
    // The HUD is a separate scene and renders AFTER the world, so no depth the
    // world can ask for will put a dialog above the ability bar. Dimming to
    // 30% was the old answer and it was not one: the icons still drew over the
    // results panel, over both its buttons, and they were still tappable.
    //
    // So the HUD stands down completely while a world modal is up — not drawn
    // and not interactive. Both come off the same call, so it is not possible
    // to hide it and leave it live, which is the shape the earlier bugs took.
    //
    // Its own pause dialog is unaffected: that is a HUD modal, and it lives
    // here precisely so it keeps working while GameScene is paused. The
    // question asked is about the WORLD's modals.
    const live = hudInteractive(this.world.modalOpen)
    this.cameras.main.setVisible(live)
    // Phaser types the scene's input plugin as always present; it is not, in
    // the frame before the scene is fully booted.
    if (this.input) this.input.enabled = live
    if (!live) return

    const s = this.world.status

    // A refusal is consumed once: the world raises it, the HUD shows it.
    if (s.alert) {
      this.toast(s.alert)
      s.alert = ''
    }
    // Scene creation order is not guaranteed, so wait for the game scene to
    // have populated its status before drawing anything that depends on it.
    if (s.heroName === '') return
    // Both sides of this comparison are now the same function of the same
    // state. The version it replaces built one string in bar order and the
    // other with the rare drop moved to the end, so from the moment the Server
    // Nuke landed the two could never match: the bar was destroyed and rebuilt
    // every frame, and a hit rectangle that does not survive a frame can never
    // complete a tap. That is what made the whole row dead to touch while
    // tower panels went on opening normally.
    const wanted = slotSignature(this.currentSlotDefs())
    if (!this.slotsBuilt || wanted !== this.slotKeys) {
      // The row is also re-measured, not just re-built. A fifth icon is wider
      // than the rectangle the layout reserved for four at scene creation, and
      // laying five slots inside it is what split the bar into two groups with
      // a gap down the middle.
      this.relayoutAbilities()
      this.buildSlots()
      this.slotsBuilt = true
    }

    // A new option arriving mid-fight has to be noticed, or the player never
    // learns it is there.
    if (s.lastStand && !this.lastStandWas) this.flashSlot('restructure')
    this.lastStandWas = s.lastStand

    this.setCounter(this.peanutsText, `${s.peanuts}`, this.peanutsField)
    this.setCounter(this.livesText, `${s.lives}`, this.livesField)
    // Money and lives are the two numbers a player watches, so a change has to
    // announce itself rather than quietly appear.
    if (this.lastPeanuts >= 0 && s.peanuts !== this.lastPeanuts) {
      this.bump(this.peanutsText, s.peanuts > this.lastPeanuts ? '#ffffff' : COLOR.danger, COLOR.amber)
      if (s.peanuts > this.lastPeanuts) this.floatUp(`+${s.peanuts - this.lastPeanuts}`, COLOR.amber)
    }
    if (this.lastLives >= 0 && s.lives < this.lastLives) {
      this.bump(this.livesText, '#ffffff', COLOR.danger)
    }
    this.lastPeanuts = s.peanuts
    this.lastLives = s.lives
    this.setCounter(this.waveText, `${Math.min(s.wave + 1, s.waveCount)}/${s.waveCount}`, this.waveField)
    this.message.setText(s.message)

    this.drawBossBar(s)
    this.drawStartButton(s)
    this.drawSlots(s)
    this.drawHeroBar(s)
  }

  /**
   * The boss bar, in the left region of the top band's second row.
   *
   * It takes the same region the wave message uses, and the message is hidden
   * while it is up: a full-width bar centred across the top used to run
   * through the wave counter on one side and the start button on the other,
   * and pushing the message out of its way pushed it into the board.
   *
   * The name is drawn *inside* the bar rather than under it, because a label
   * on its own line is another row the band would have to be tall enough for.
   */
  private drawBossBar(s: GameScene['status']): void {
    this.bossBar.clear()
    const boss = Boolean(s.bossName)
    // One region, one occupant.
    this.message.setVisible(!boss)
    if (!boss) {
      this.bossLabel.setText('')
      return
    }
    const region = this.layout.messageRow
    const h = region.height - 2
    const x = region.x
    const y = region.y
    const w = region.width
    const ratio = Phaser.Math.Clamp(s.bossHealth / Math.max(s.bossMax, 1), 0, 1)

    this.bossBar.fillStyle(0x0d1016, 0.82).fillRoundedRect(x - 3, y - 3, w + 6, h + 6, 5)
    this.bossBar.fillStyle(0x3a1f1c, 1).fillRect(x, y, w, h)
    this.bossBar.fillStyle(0xff5a3c, 1).fillRect(x, y, w * ratio, h)
    this.bossBar.lineStyle(2, 0xff8f7a, 1).strokeRoundedRect(x - 3, y - 3, w + 6, h + 6, 5)
    // The two marks where he starts taxing harder, so the phases are legible.
    for (const t of HUD.bossPhaseMarks) {
      this.bossBar.lineStyle(2, 0x0d1016, 0.8).lineBetween(x + w * t, y, x + w * t, y + h)
    }
    this.bossLabel.setText(s.bossName.toUpperCase())
    this.bossLabel.setPosition(x + w / 2, y + h / 2)
  }

  /**
   * A refusal, shown above the ability bar where the tap happened.
   *
   * The guidance line lives in the opposite corner and is easy to miss, so a
   * tap that could not do anything looked like a dead button. This puts the
   * reason under the player's own thumb for a moment and then gets out of the
   * way.
   */
  private toast(text: string): void {
    this.activeToast?.destroy()
    const label = this.add.text(viewW(this) / 2, this.layout.abilities.y - 6, text, {
      fontFamily: FONT_UI, fontSize: '17px', color: COLOR.ink,
      fontStyle: 'bold', align: 'center',
      wordWrap: { width: viewW(this) - 80 },
    }).setOrigin(0.5, 1).setDepth(500)
    const pad = 14
    const pill = this.add.rectangle(
      label.x, label.y - label.height / 2,
      label.width + pad * 2, label.height + pad * 0.8,
      0x0d1016, 0.82,
    ).setOrigin(0.5).setDepth(499)
    const parts: Phaser.GameObjects.GameObject[] = [pill, label]
    this.activeToast = this.add.container(0, 0, parts).setDepth(499)
    this.tweens.add({
      targets: this.activeToast, alpha: 0, delay: 1500, duration: 420,
      onComplete: () => { this.activeToast?.destroy(); this.activeToast = undefined },
    })
  }

  private activeToast?: Phaser.GameObjects.Container

  /** A short pop on a number that just changed, then back to its own colour. */
  private bump(text: Phaser.GameObjects.Text, flash: string, base: string): void {
    this.tweens.killTweensOf(text)
    text.setColor(flash)
    text.setScale(1)
    this.tweens.add({
      targets: text, scale: 1.25, duration: 90, yoyo: true, ease: 'Quad.easeOut',
      onComplete: () => text.setColor(base),
    })
  }

  private floatUp(label: string, colour: string): void {
    const t = this.add.text(this.peanutsText.x + 6, 34, label, {
      fontFamily: FONT_UI, fontSize: '18px', fontStyle: 'bold', color: colour,
    })
    this.tweens.add({
      targets: t, y: 14, alpha: 0, duration: 700, ease: 'Quad.easeOut',
      onComplete: () => t.destroy(),
    })
  }

  private drawStartButton(s: GameScene['status']): void {
    // Only pressable between waves. Mid-wave it becomes a readout, which is
    // exactly what the disabled plate is for.
    this.startBtn.setEnabled(s.phase === 'ready')

    if (s.phase === 'ready') {
      const n = Math.min(s.wave + 1, s.waveCount)
      // The clock is on the button because the button is the thing it is
      // counting down to, and the bonus is beside it because that is the whole
      // argument for pressing it now rather than letting it run out.
      const left = Math.ceil(s.readyCountdown)
      if (left > 0) {
        const bonus = Math.floor(s.readyCountdown) * RULES.pacing.earlyStartPeanutsPerSecond
        // Three things on one plate. Separated by middots rather than double
        // spaces so the line is as short as it can be and still parse.
        this.startBtn.setLabel(`WAVE ${n} · ${left}s${bonus > 0 ? ` · +${bonus}` : ''}`)
      } else {
        this.startBtn.setLabel(`START WAVE ${n}`)
      }
    }
    else if (s.phase === 'wave') this.startBtn.setLabel(`${s.waveName} · ${s.enemiesLeft} left`)
    else this.startBtn.setLabel(s.phase === 'won' ? 'CLEARED' : 'OVERRUN')
  }

  /**
   * The cards carry their own frames, so nothing is drawn behind them. A
   * cooldown darkens the icon and sweeps a dial over it; an ability that is
   * not castable at all is swapped for its greyscale copy, which reads as
   * switched off rather than as merely dim.
   */
  private drawSlots(s: GameScene['status']): void {
    for (const slot of this.slots) {
      const r = slot.region

      // An empty reserved slot. Drawn as a recessed socket rather than left
      // blank — a hole in the middle of the bar reads as a rendering fault —
      // and deliberately not as a greyed-out copy of the icon, which would say
      // "this is here but unavailable" when the truth is that it does not
      // exist yet.
      const shown = this.slotShown(r, s)
      slot.icon.setVisible(shown)
      slot.timer.setVisible(shown)

      // Inert means inert. `input.enabled = false` was not enough on its own:
      // it leaves the rectangle registered, still hit-tested for hover, still
      // carrying the hand cursor, and still swallowing the press so nothing
      // under it sees the tap either. disableInteractive takes it out of the
      // input list; setVisible(false) makes Phaser's own willRender check
      // exclude it as well, so there are two independent reasons it can never
      // be reached rather than one flag that has to be right every frame.
      if (slot.hit.visible !== shown) {
        slot.hit.setVisible(shown)
        if (shown) slot.hit.setInteractive({ useHandCursor: true })
        else slot.hit.disableInteractive()
      }

      if (!shown) {
        slot.sweep.clear()
        slot.frame.clear()
        // A hole in the middle of the bar reads as a rendering fault, so the
        // slot is not left blank — but the socket that stands in for it must
        // not read as a button either. It is a recess: no bright rim, no
        // plate, a shade darker than the bar it sits in and drawn well inside
        // the space a live icon would fill. Alphas are in presentation.json
        // because "faint enough" is a judgement made by looking at it.
        const e = SOCKET
        slot.frame.fillStyle(0x000000, e.fillAlpha)
        slot.frame.lineStyle(e.strokeWidth, 0xf6ecd9, e.strokeAlpha)
        // It takes the shape of the slot it stands in for: a circle among the
        // round hero medallions, a rounded rect among the drafted plates.
        if (r.hero) {
          slot.frame.fillCircle(r.cx, r.cy, r.boxH / 2 - e.inset)
          slot.frame.strokeCircle(r.cx, r.cy, r.boxH / 2 - e.inset)
        } else {
          const i = e.inset
          slot.frame.fillRoundedRect(r.x + i, r.y + i - 4, r.pitch - i * 2, r.boxH - i * 2 + 8, 8)
          slot.frame.strokeRoundedRect(r.x + i, r.y + i - 4, r.pitch - i * 2, r.boxH - i * 2 + 8, 8)
        }
        continue
      }
      const ready = this.world.cooldowns.ready(r.id)
      const usable = this.slotUsable(r, s)
      const armed = s.pendingAbility === r.id
        || (r.kind === 'restructure' && s.mode === 'restructure')
      const left = this.world.cooldowns.secondsLeft(r.id)

      const base = this.world.abilityIcon(r.id) ?? slot.icon.texture.key
      const wantKey = usable ? base : greyKey(base)
      if (this.textures.exists(wantKey) && slot.icon.texture.key !== wantKey) {
        slot.icon.setTexture(wantKey)
        fitInBox(slot.icon, base, r.boxH)
      }
      slot.icon.setTint(ready && usable ? 0xffffff : 0x8a8a8a)

      // Armed reads as a glow around the card rather than a plate behind it,
      // and it follows the card's own shape: a ring for the round hero
      // medallions, a rounded rect for the rectangular drafted plates. A box
      // drawn around a circle is exactly the kind of thing that makes two
      // deliberately different shapes look like one of them is a mistake.
      slot.frame.clear()
      if (armed) {
        slot.frame.lineStyle(3, COLOR.accent, 0.95)
        if (r.hero) {
          slot.frame.strokeCircle(r.cx, r.cy, r.boxH / 2 + 3)
        } else {
          slot.frame.strokeRoundedRect(r.x + 4, r.y - 2, r.pitch - 8, r.boxH + 4, 8)
        }
      }

      slot.timer.setText(ready ? '' : String(Math.ceil(left)))

      slot.sweep.clear()
      if (!ready) {
        const p = this.world.cooldowns.progress(r.id)
        slot.sweep.fillStyle(0x000000, 0.5)
        slot.sweep.slice(
          r.cx, r.cy, r.boxH * 0.42,
          Phaser.Math.DegToRad(-90 + 360 * p), Phaser.Math.DegToRad(270), false,
        )
        slot.sweep.fillPath()
      }
    }
  }

  /** A brief highlight on one slot, for an ability that has just appeared. */
  private flashSlot(id: string): void {
    const slot = this.slots.find((sl) => sl.region.id === id)
    if (!slot) return
    play(this, 'upgrade')
    const r = slot.region
    const ring = this.add.graphics().setDepth(9000)
    slot.icon.setScale(slot.icon.scale * 1.4)
    this.tweens.add({
      targets: slot.icon, scaleX: slot.icon.scaleX / 1.4, scaleY: slot.icon.scaleY / 1.4,
      duration: 260, ease: 'Back.easeOut',
    })
    this.tweens.addCounter({
      from: 0, to: 1, duration: 900,
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0
        ring.clear()
        ring.lineStyle(3, 0xf2d06b, 1 - t)
        ring.strokeCircle(r.cx, r.cy, r.boxH / 2 + 2 + t * 18)
      },
      onComplete: () => ring.destroy(),
    })
  }

  /** Castable at all, ignoring cooldown: the hero has to be up for his own
   *  actives, and a rare drop is only usable while it is held. */
  private slotUsable(slot: SlotRegion, s: GameScene['status']): boolean {
    if (slot.kind === 'restructure') return s.lastStand && !s.heroDown
    if (slot.kind !== 'ability') return !s.heroDown
    if (slot.id === s.rareAbility) return true
    return s.abilities.includes(slot.id)
  }

  /**
   * Whether a slot's icon is on the glass at all.
   *
   * Restructure only exists during DAD MODE. Its slot is NOT removed when it
   * is gone — the bar is laid out from a fixed list of ids, so every other
   * icon keeps its exact position whether or not this one is showing. A bar
   * that reflows mid-fight causes misfires, and misfiring the Server Nuke
   * costs a run.
   */
  private slotShown(slot: SlotRegion, s: GameScene['status']): boolean {
    return slot.kind !== 'restructure' || s.lastStand
  }

  /**
   * The hero's name and health, in the right region of the second row.
   *
   * Name on the bar rather than above it, for the same reason the boss's is:
   * a second line is a taller band, and on a phone the band is taken out of
   * the board.
   */
  private drawHeroBar(s: GameScene['status']): void {
    const region = this.layout.heroRow
    const x = region.x
    const w = region.width
    const h = region.height - 2
    const y = region.y

    let state = ''
    // The countdown belongs on the bar as well as on the ground: the player
    // is watching the lane, not the patch of grass he comes back to.
    if (s.heroDown) state = ` · BACK IN ${Math.max(0, Math.ceil(s.heroReviveIn))}s`
    else if (s.lastStand) state = ' · DAD MODE'
    this.heroLabel.setText(`${s.heroName}${state}`)
    this.heroLabel.setColor(s.lastStand ? COLOR.fire : COLOR.ink)
    this.heroLabel.setPosition(x + w - 4, y + h / 2)
    this.heroLabel.setOrigin(1, 0.5)

    const ratio = Phaser.Math.Clamp(s.heroHealth / Math.max(s.heroMax, 1), 0, 1)
    const bar = HUD.heroBar
    this.heroBar.clear()
    // OPAQUE, AND EDGED. It was a 55% black wash, which is the thing the
    // report was actually about: the painted tavern signboard showed through
    // the bar and the bar showed through the signboard, and neither was
    // readable. Moving it helps and cannot solve it — measured, there is no
    // screen position the camera cannot put painted art under — so the bar
    // carries its own plate now, the way every other piece of HUD does.
    this.heroBar.fillStyle(bar.backing, bar.backingAlpha)
    this.heroBar.fillRoundedRect(x, y, w, h, bar.radius)
    this.heroBar.lineStyle(bar.edgeWidth, bar.edge, 1)
    this.heroBar.strokeRoundedRect(x, y, w, h, bar.radius)
    this.heroBar.fillStyle(s.heroDown ? 0x5a5a5a : s.lastStand ? 0xff5a3c : 0x4fa3e3, 1)
    this.heroBar.fillRoundedRect(x + 2, y + 2, Math.max(0, (w - 4) * ratio), h - 4, 4)
    // The 25% mark, so the Last Stand threshold is legible before it fires.
    const markX = x + 2 + (w - 4) * 0.25
    this.heroBar.lineStyle(1, COLOR.panelEdge, 0.9).lineBetween(markX, y, markX, y + h)
  }
}

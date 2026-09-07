import Phaser from 'phaser'
import { GameScene } from './GameScene.ts'
import type { RulesDef } from '../types.ts'
import presentationData from '../data/presentation.json'
import rulesData from '../data/rules.json'
import { COLOR, FONT_UI } from '../ui/Theme.ts'
import { ART, fitInBox, fitInRect, renderFor } from '../systems/Art.ts'
import { greyKey } from '../systems/Desaturate.ts'
import { plateButton, type PlateButton } from '../ui/Plate.ts'
import { iconPlate } from '../ui/Plate.ts'
import { SettingsPanel } from '../ui/SettingsPanel.ts'
import { Dialog } from '../ui/Dialog.ts'
import { play, resumeAudio } from '../systems/Audio.ts'
import { hudLayout, NO_INSETS, type HudLayout, type Rect } from '../systems/HudLayout.ts'
import { safeAreaInsets } from '../systems/SafeArea.ts'
import { hudInteractive } from '../systems/Layers.ts'
import {
  barWidth, iconBox, regions, slotDefs, slotSignature,
  type BarMetrics, type SlotDef, type SlotRegion,
} from '../systems/AbilityBar.ts'
import { SLOT2, heroSlotDefs, slot2Usable } from '../systems/HeroSkills.ts'
import { onSceneResize, sceneIsLive } from '../systems/SceneEvents.ts'
import { fitUiCamera, viewH, viewW } from '../systems/Resolution.ts'
import { enterGate, leaveGate, noteInputAccepted } from '../systems/InputGates.ts'

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
  private heroBar!: Phaser.GameObjects.Graphics
  /** The hero's name, on the bar. See the note where it is created. */
  private heroLabel!: Phaser.GameObjects.Text
  /** Every element's rectangle. Disjoint by construction, checked by a test. */
  /**
   * Where every HUD element sits, MEASURED.
   *
   * Public because GameScene reads it: the camera gate has to know where the
   * counters and the ability bar actually are, and their widths come from the
   * plates and the icons, which only this scene has. GameScene used to compute
   * its own copy with both widths set to zero, which made the counters a
   * rectangle of zero width and let a drag on them pan the map.
   */
  layout: HudLayout = hudLayout(
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
  /** Public for the harness, which has to be able to put the HUD back into a
   *  known state between checks -- a modal reports the whole screen as chrome,
   *  so one left open makes every later check pass without testing anything. */
  panel?: Dialog
  paused = false
  /** Public for the harness, which presses its way through it. */
  settings?: SettingsPanel
  slots: SlotView[] = []
  private slotsBuilt = false
  /** Last frame's DAD MODE state, so the arrival of a new option can be
   *  announced once rather than every frame. */
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

    // Any press this scene dispatched. The HUD keeps working while GameScene
    // is paused, so it is the better witness of the two: if even this stops
    // hearing taps, the whole UI has gone, not just the board.
    this.input.on('pointerdown', () => noteInputAccepted())

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

    // Under the counters: the boss bar, and nothing else.
    //
    // THE WHITE INSTRUCTION BAR IS GONE. It carried one line of guidance --
    // "Tap a build pad to place a tower, then START WAVE.", "Wave cleared, +35
    // peanuts. Build or reposition..." -- permanently, across the top of the
    // board, on a phone screen. Everything it said that a player still needs
    // at the moment it happens goes through `toast` instead, which appears
    // under their own thumb and then leaves; everything it said that was
    // teaching waits for a tutorial. The rectangle stays, because the boss bar
    // uses it for one wave in thirteen.
    this.bossBar = this.add.graphics()
    this.bossLabel = this.add.text(0, 0, '', {
      fontFamily: FONT_UI, fontSize: '15px', color: COLOR.ink,
      fontStyle: 'bold', stroke: '#0d1016', strokeThickness: 4, letterSpacing: 1,
    }).setOrigin(0.5, 0.5)

    // Under the start button: the hero's health.
    //
    // THE MODE LABEL IS GONE AND THE NAME IS BACK, which is not where this
    // ended up the first time. It read "Cory · DAD MODE" and the mode half was
    // wrong for four heroes out of five -- `lastStand.name` is the string
    // "DAD MODE" in all five entries of heroes.json -- so both halves were
    // taken off together. That left a blue segmented bar in the top left with
    // nothing on it at all, and it was reported as exactly that: an
    // unlabelled bar nobody could name. A bar with no label is not more honest
    // than a bar with a wrong one, it is only quieter.
    //
    // So the name comes back and the mode does not. The name was never the
    // untrue half, and "you already chose him" is an argument about the
    // loadout screen rather than about a bar the player looks at mid-wave with
    // a boss on the board. The two ticks across it are the two thresholds --
    // the transformation at half and Last Stand at a quarter -- and they are
    // what makes it look segmented; with the name on it they read as marks on
    // a health bar rather than as three mystery cells.
    this.heroBar = this.add.graphics()
    this.heroLabel = this.add.text(0, 0, '', {
      fontFamily: FONT_UI, fontSize: '15px', color: COLOR.ink, fontStyle: 'bold',
      stroke: '#0d1016', strokeThickness: 4, letterSpacing: 1,
    }).setOrigin(0, 0.5)

    // Bottom corners and centre.
    this.buildSettingsButton(L.settings)
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
    return slotDefs(
      s.abilities,
      s.rareAbility,
      (id) => this.world.abilityDef(id),
      heroSlotDefs(hero),
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

      // THE ONLY PEANUT ON THE CHIP.
      //
      // It used to be the second one. The plate is a single 232x96 image and a
      // plain white OUTLINE peanut was painted into its left end -- a
      // placeholder from before the game had peanut art -- and this drew the
      // real painted peanut on top of it, so the chip carried both and the
      // white one poked out from behind. No draw call made the white one:
      // it was in the picture, which is why nothing in code could be deleted
      // to fix it. tools/clear_peanut_plate.py flattened that end back to the
      // plate's own field colour; the plate is now a frame and an empty field
      // and this is the whole icon.
      //
      // Placed in the box art.json measures off the heart PAINTED into the
      // lives plate, so the drawn icon and the painted one keep the same
      // margins as each other -- which is the thing a player actually reads,
      // two chips side by side.
      if (name === 'peanuts' && this.textures.exists(ART.ui.peanut)) {
        const box = ART.ui.counterIcon
        const plateH = plate.displayHeight
        const peanut = this.add.image(
          x + (box.left + box.width / 2) * plateH,
          top + (box.top + box.height / 2) * plateH,
          ART.ui.peanut,
        )
        fitInRect(peanut, ART.ui.peanut, box.width * plateH, box.height * plateH)
      }

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
  /**
   * THE ONE CORNER CONTROL. There were four: a mute toggle, a minus, a plus
   * and a percentage in the bottom-left, and a pause button in the
   * bottom-right — chrome sitting on the board for a whole run, for settings a
   * player opens once and leaves alone.
   *
   * The gear is drawn rather than loaded: there is no gear in any of the packs
   * and a letter would be worse, which is the same reason the old speaker was
   * drawn.
   */
  private buildSettingsButton(box: Rect): void {
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    const plate = iconPlate(this, x, y, box.width, box.height)
    const g = this.add.graphics()
    const r = box.width * 0.26
    g.fillStyle(0xf6ecd9, 1)
    // Eight teeth around a ring, then a hole punched through the middle with
    // the plate's own colour rather than an erase — Graphics has no cut-out.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      g.fillRect(x + Math.cos(a) * r - 2.5, y + Math.sin(a) * r - 2.5, 5, 5)
    }
    g.fillCircle(x, y, r)
    g.fillStyle(0x1b222c, 1).fillCircle(x, y, r * 0.42)
    const hit = this.add.rectangle(x, y, box.width + 4, box.height + 4, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true })
    hit.name = 'hud:settings'
    hit.on('pointerover', () => plate.setActive(true))
    hit.on('pointerout', () => plate.setActive(false))
    hit.on('pointerdown', () => this.openSettings())
  }

  /**
   * The settings dialog, which pauses the game.
   *
   * The guard is `this.paused && this.settings`, not `this.paused`, and the
   * difference is a bug that already happened once with the pause dialog: a
   * `paused` flag with no panel behind it is the thing that is wrong, not a
   * reason to refuse to reopen the one control that can undo it. A frozen
   * board and a dead settings button.
   */
  openSettings(): void {
    if (this.paused && this.settings) return
    this.paused = true
    play(this, 'open')
    // ANNOUNCED, because this pauses GameScene. A pause nothing claims is
    // indistinguishable from a soft lock; a pause with an owner is the
    // player's to close, and the stuck guard leaves it alone.
    enterGate('settings', { wave: this.world.status.wave, mode: this.world.status.mode })
    this.scene.pause('Game')
    this.settings?.close()
    this.settings = new SettingsPanel(this, 90000, {
      onHome: () => this.confirmQuit(),
      onRestart: () => { this.closeSettings(); this.restartRun() },
      onContinue: () => { this.closeSettings(); this.resumeGame() },
      // Applied to the running scene, not stored for the next one. The flag
      // exists so the two control schemes can be compared on the same board
      // seconds apart, and a change that needs a restart is not that.
      onFlagChanged: () => this.world.applyControlScheme(),
    })
  }

  private closeSettings(): void {
    this.settings?.close()
    this.settings = undefined
    leaveGate('settings')
  }

  /**
   * Whether the HUD has a modal of its own up — the pause and settings panels.
   *
   * Read by GameScene, which cannot see this scene's objects: a scene's hit
   * list holds only its own. Without this the camera rig heard drags on the
   * settings sliders and panned the board behind the dialog.
   */
  get modalOpen(): boolean {
    return this.paused || this.panel !== undefined
  }

  /** A dialog owned by the HUD, so it keeps working while Game is paused. */
  private showPanel(opts: ConstructorParameters<typeof Dialog>[4]): void {
    this.panel?.close()
    this.panel = new Dialog(this, viewW(this) / 2, viewH(this) / 2, 90000, opts)
    enterGate('dialog', { title: opts.title ?? '?' })
    this.panel.onClosed(() => {
      this.panel = undefined
      leaveGate('dialog')
    })
  }

  private resumeGame(): void {
    this.paused = false
    leaveGate('settings')
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
    this.closeSettings()
    this.showPanel({
      title: 'QUIT TO TITLE?',
      subtitle: 'This run ends here. Towers, upgrades and peanuts are lost.',
      confirm: { label: 'QUIT', onPick: () => this.quitToTitle() },
      cancelLabel: 'KEEP PLAYING',
      // Back to the settings panel, not straight into the game: the player
      // came here through it and pressing the way out of a confirmation should
      // not also resume the run.
      onCancel: () => this.openSettings(),
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
        else if (region.id === SLOT2) this.world.castHeroSlot2()
        else this.world.castHeroSlot1()
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
    // One region, one occupant -- and since the instruction bar went, the boss
    // bar is the region's only occupant. Nothing to hide any more.
    if (!boss) {
      this.bossLabel.setText('')
      return
    }
    // SIZED FROM DATA, CENTRED IN THE REGION. It used to take the region's
    // width outright, which on an 844px screen is 563px — 67% of the width,
    // the full remaining span of the row, a slab across the top for one wave
    // in thirteen. `bossBarWidth` and `bossBarHeight` existed in
    // presentation.json the whole time and NOTHING READ THEM: two tuning
    // numbers that could not tune anything. They are wired now, and the region
    // is a bound rather than a size — the bar never outgrows the rectangle the
    // layout guarantees is free, and on a narrow phone it is the width that
    // gives way rather than the boss's name.
    const region = this.layout.messageRow
    const h = Math.min(HUD.bossBarHeight, region.height - 2)
    const w = Math.min(HUD.bossBarWidth, region.width)
    const x = region.x + (region.width - w) / 2
    const y = region.y + (region.height - h) / 2
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
      // TWO THINGS, NOT THREE. It read `WAVE 2 · 3s · +4`, and the seconds were
      // the least useful of the three: a countdown the player cannot change,
      // next to the number that says what changing it is worth. The bonus is
      // the whole argument for pressing now rather than waiting, so the bonus
      // is what stays.
      const bonus = Math.floor(s.readyCountdown) * RULES.pacing.earlyStartPeanutsPerSecond
      this.startBtn.setLabel(bonus > 0 ? `WAVE ${n} · +${bonus}` : `START WAVE ${n}`)
    }
    // NO WAVE NAME. It read `The Gathering · 6 left`, and the name was a
    // flavour string in waves.json that told the player nothing they could act
    // on while it took the width that the count needed.
    else if (s.phase === 'wave') {
      this.startBtn.setLabel(`WAVE ${Math.min(s.wave + 1, s.waveCount)} · ${s.enemiesLeft} left`)
    }
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
      const left = this.world.cooldowns.secondsLeft(r.id)

      // THE STATE COMES FROM THE GAME, NEVER FROM THE PICTURE.
      //
      // It used to come from both, and the picture was winning. The ten hero
      // icons were placeholders with the words TEMP and LOCKED painted into
      // them, so slot 2 read as locked in every state there is -- including
      // the one where the hero has transformed and the power is ready, which
      // is the moment the button exists for. Worse, it read as locked while
      // being pressable, because what actually gates the tap is `slotUsable`
      // and that was answering correctly the whole time.
      //
      // Nothing in the art says anything now. Three states, three treatments:
      //
      //   unavailable  the greyscale copy, at full brightness. A real
      //                desaturation, because Phaser's tint MULTIPLIES: a
      //                tinted colour icon goes dark and stays colourful, which
      //                reads as "in shadow" rather than as "switched off".
      //                The copies are built at boot from art.json's `greyable`
      //                list -- the ten hero icons were missing from it, so
      //                `greyKey` named a texture that had never been made, the
      //                swap was skipped, and the only thing saying LOCKED was
      //                the word painted into the placeholder.
      //   cooling      the colour icon, dimmed, under the sweep and a count.
      //   ready        the colour icon, undimmed.
      const base = this.world.abilityIcon(r.id) ?? slot.icon.texture.key
      const wantKey = usable ? base : greyKey(base)
      if (this.textures.exists(wantKey) && slot.icon.texture.key !== wantKey) {
        slot.icon.setTexture(wantKey)
        fitInBox(slot.icon, base, r.boxH)
      }
      // The greyscale copy is already the "off" state; dimming it as well
      // makes an unavailable button darker than a cooling one, which inverts
      // the reading -- the thing you cannot use at all looked further away
      // than the thing that is nearly back.
      const greyed = slot.icon.texture.key !== base
      slot.icon.setTint(ready || greyed ? 0xffffff : 0x8a8a8a)

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

  /** Castable at all, ignoring cooldown: the hero has to be up for his own
   *  actives, and a rare drop is only usable while it is held. */
  private slotUsable(slot: SlotRegion, s: GameScene['status']): boolean {
    // SLOT 2 IS GREY UNTIL THE HERO HAS TRANSFORMED. Not hidden: the player
    // should be able to see that the power exists and read its icon while it
    // is out of reach, which is the difference between a locked door and a
    // wall. `slotUsable` false swaps the icon for its greyscale copy and takes
    // the tap with it, so it cannot be pressed by accident either.
    if (slot.id === SLOT2) return slot2Usable(s.heroPowered, s.heroDown)
    if (slot.kind !== 'ability') return !s.heroDown
    if (slot.id === s.rareAbility) return true
    return s.abilities.includes(slot.id)
  }

  /**
   * Whether a slot's icon is on the glass at all.
   *
   * Every slot is, now that Restructure is gone: it was the one ability that
   * came and went mid-fight, and its slot was kept in the layout even while
   * hidden so nothing else moved. The bar is still laid out from a fixed list
   * of ids for that reason -- a bar that reflows mid-fight causes misfires,
   * and misfiring the Server Nuke costs a run -- but nothing hides any more.
   */
  private slotShown(_slot: SlotRegion, _s: GameScene['status']): boolean {
    return true
  }

  /**
   * The hero's health, in the left region of the second row.
   *
   * NO NAME AND NO MODE LABEL. It read "Cory · DAD MODE" -- and it read DAD
   * MODE for Courtland, Han, Eli and Bailey too, because `lastStand.name` is
   * that literal string in all five entries of heroes.json. The name told the
   * player something they chose one screen ago about the only hero on the
   * board; the mode told four of them something false. A hero who is down
   * still needs the countdown, so that is what is left, on the bar itself.
   */
  private drawHeroBar(s: GameScene['status']): void {
    const region = this.layout.heroRow
    const x = region.x
    const w = region.width
    const h = region.height - 2
    const y = region.y

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
    // BOTH THRESHOLDS, from `status.heroMarks`, which is data both ways.
    // There was one tick here at a hardcoded 0.25 -- the LAST STAND threshold,
    // still live -- and the transformation at 0.5, which is the bigger moment
    // of the two, had no mark at all.
    for (const mark of s.heroMarks) {
      const markX = x + 2 + (w - 4) * mark
      this.heroBar.lineStyle(1, COLOR.panelEdge, 0.9).lineBetween(markX, y, markX, y + h)
    }
    // OVER THE FILL, not beside the bar: there is no room beside it at
    // 568x320, and the stroke is what keeps it readable over the blue, the
    // grey of a hero who is down and the red of Last Stand alike.
    this.heroLabel.setText(s.heroName.toUpperCase())
    this.heroLabel.setPosition(x + 8, y + h / 2)
  }
}

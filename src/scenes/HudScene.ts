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
import { heroChipContent, hudLayout, NO_INSETS, type HudLayout, type Rect } from '../systems/HudLayout.ts'
import { safeAreaInsets } from '../systems/SafeArea.ts'
import { hudInteractive } from '../systems/Layers.ts'
import {
  barWidth, iconBox, regions, slotDefs, slotSignature,
  type BarMetrics, type SlotDef, type SlotRegion,
} from '../systems/AbilityBar.ts'
import { abilityInSlot, abilityUsable, heroSlotDefs, isHeroSlot } from '../systems/HeroSkills.ts'
import { onSceneResize, sceneIsLive } from '../systems/SceneEvents.ts'
import { fitUiCamera, viewH, viewW } from '../systems/Resolution.ts'
import { enterGate, leaveGate, noteInputAccepted } from '../systems/InputGates.ts'
import { realSeconds } from '../systems/GameTime.ts'

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
/**
 * THE ABILITY ROW'S ICON BOX, in CSS px, FROM THE DATA.
 *
 * It was `const ICON_H = 64` here, `iconHeight: 64` in presentation.json and a
 * bare `iconH: 64` in GameScene's `abilitySlotFor` -- three copies of one
 * tunable, two of them in TypeScript, which hard rule 1 exists to stop. They
 * agreed until 2026-09-17, when the row was pulled in and only the JSON knew.
 * The layout sizes `abilities.height` from `iconHeight`, so the copy here is
 * the one that decides what is DRAWN inside the rectangle the layout reserved:
 * they cannot be allowed to be different numbers.
 */
const ICON_H = LAYOUT.iconHeight

/**
 * How far a press may travel and still count as a tap, in CSS pixels.
 *
 * THE WORLD MAP'S NUMBER, and deliberately the same one. That screen is
 * dragged with the finger that picks a level and solves it exactly this way;
 * the board is dragged with the finger that presses the hero chip, which is
 * the identical problem. Two different slops would mean a gesture that
 * scrolls one screen selects on the other.
 */
const TAP_SLOP = 10

/** How faint the empty reserved socket is. See drawSlots. */
const SOCKET = presentationData.abilityBar.emptySocket as {
  fillAlpha: number; strokeAlpha: number; strokeWidth: number; inset: number
}

/** UI lives in its own scene so the world can Y-sort freely without the HUD
 *  ever landing in the middle of the sort order. */
/**
 * The stacked readouts in the top-left corner, in drawing order. TWO of them,
 * and the wave is not one.
 *
 * THE WAVE PLATE WAS HERE FOR ONE DAY. It was added on 2026-09-17 on the
 * reasoning that the run's numbers belong together in the corner a player
 * already reads -- which is right -- while a start button in the OPPOSITE
 * corner went on drawing `▶ 2/13 +20` on its own label, because a button that
 * starts wave 2 has to say which wave it starts. Both changes were correct
 * separately. Together they printed the wave count twice.
 *
 * The merge keeps one element and it is the CONTROL, directly under this
 * stack: `buildWaveControl`. A readout may shrink to 16px because nothing taps
 * it; the thing that starts the wave may not, so of the two copies only one
 * could ever have been deleted. The top-right corner is the settings gear and
 * nothing else now.
 *
 * `art.json`'s `ui.counters.wave` plate is unused again, and kept, exactly as
 * it was kept through the last period it was not drawn. `tests/wavecount.test.ts`
 * is what stops the count coming back to this list.
 */
const READOUTS = ['peanuts', 'lives'] as const

/**
 * One counter readout, as a pill that grows with the number in it.
 *
 * WHY THREE PIECES. The plate is a single painted image: a rounded frame with
 * an icon at the left and a dark field to its right, and art.json measures the
 * field's edges as `fieldLeft` and `fieldRight`. Scaling the whole image to fit
 * a wider number would stretch the icon and the rounded ends with it. So the
 * image is cut at those two edges into a left cap (frame and icon), a middle
 * (the field, and the only piece that stretches) and a right cap (the frame's
 * other end) -- a three-slice, and the only stretched piece is a flat dark
 * field where stretching is invisible.
 *
 * WHY IT GROWS BY DIGIT COUNT AND NOT BY PIXEL WIDTH. The peanut count changes
 * on most kills, and a pill that breathes on every kill is worse than one that
 * is slightly too wide. Quantising on the number of glyphs means it changes
 * width when the number crosses a power of ten and at no other time.
 */
interface Pill {
  key: string
  left: Phaser.GameObjects.Image
  mid: Phaser.GameObjects.Image
  right: Phaser.GameObjects.Image
  text: Phaser.GameObjects.Text
  /** Source pixels: the whole plate, and the two caps. */
  srcW: number
  srcH: number
  capL: number
  capR: number
  /** Drawn scale, and the pill's top-left on the glass. */
  scale: number
  x: number
  y: number
  /** Padding inside the field, each side, in CSS px. */
  pad: number
  /** The field at the plate's own natural width, and the widest it may grow. */
  minField: number
  maxField: number
  /** The field right now. */
  field: number
  /**
   * The scale the number is drawn at to fit its field.
   *
   * HELD RATHER THAN RECOMPUTED, because `bump` has to tween AROUND it. The
   * bump used to `setScale(1)` and yoyo back to 1, which threw away whatever
   * `setCounter` had computed -- so a number that had been shrunk to fit was
   * drawn at full size from the next change onward, and `setCounter` would not
   * put it back because it returns early when the text has not changed. That
   * is the mechanism live play reported: 800 fits, you earn peanuts, and 1012
   * is drawn unshrunk with its last digit over the border.
   */
  fit: number
}

export class HudScene extends Phaser.Scene {
  private world!: GameScene
  /** The number in each pill. Read by `floatUp` and by the harness's
   *  `counters` scenario, which measures them against their own fields. */
  get peanutsText(): Phaser.GameObjects.Text { return this.peanutsPill.text }
  get livesText(): Phaser.GameObjects.Text { return this.livesPill.text }
  /**
   * The hero's portrait chip: the picture, the health over it, the frame
   * round it and the rectangle that takes the tap.
   *
   * ONE OBJECT PER JOB AND NO SECOND SOURCE OF TRUTH. The portrait's texture
   * comes from the same `heroDef` the loadout card reads, the form it shows
   * comes from the same `heroPowered` that greys slot 2, and the bar's ratio
   * comes from the same `heroHealth` the sprite's own bar uses.
   */
  private chipPlate!: Phaser.GameObjects.Graphics
  private chipPortrait!: Phaser.GameObjects.Image
  private chipBar!: Phaser.GameObjects.Graphics
  private chipLabel!: Phaser.GameObjects.Text
  private chipHit!: Phaser.GameObjects.Rectangle
  /**
   * The texture the portrait is currently wearing, so it is swapped on a
   * transformation rather than re-fitted every frame.
   *
   * IT IS ABOUT THE SPRITE, SO IT IS CLEARED WHEN THE SPRITE IS. A Phaser
   * scene instance is constructed once and `create()` runs again on every
   * restart, so a field initialised here survives a level change while the
   * object it describes does not — which is the whole of the stray
   * exclamation mark on the ability bar. See `buildHeroChip`.
   */
  private chipKey = ''
  /**
   * The SQUARE the portrait was last fitted into, beside the key it was fitted
   * for. Cleared with `chipKey` and for the same reason: a cached comparison
   * has to name every input the cached work depends on, and this one had only
   * the texture. -1 is not a size, so the first draw always fits.
   */
  private chipFit = -1
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
  /**
   * The two readouts, as three-slice pills that grow with their content.
   *
   * SET IN `buildCounters`, READ IN `update` AND IN `bump`. The old pair of
   * fields here was just a printable WIDTH each, and a number wider than it was
   * shrunk to fit -- which is the fix the brief rules out, and which was not
   * even happening: see `setCounter`.
   */
  private peanutsPill!: Pill
  private livesPill!: Pill
  private bossBar!: Phaser.GameObjects.Graphics
  private bossLabel!: Phaser.GameObjects.Text
  /** The run's difficulty, read off the run rather than off the save — see
   *  `GameStatus.difficultyId`. */
  /**
   * THE WAVE CONTROL, under the two readouts in the top-left stack.
   *
   * It is `waveBtn` rather than `startBtn` because starting a wave is only one
   * of the things it says: mid-wave it is a disabled plate reading the wave
   * count and what is left of it, and at the end of a run it reads CLEARED or
   * OVERRUN. The harness reads this field by name in four scenarios.
   */
  private waveBtn!: PlateButton
  /** Public for the harness, which has to be able to put the HUD back into a
   *  known state between checks -- a modal reports the whole screen as chrome,
   *  so one left open makes every later check pass without testing anything. */
  panel?: Dialog
  paused = false
  /** Public for the harness, which presses its way through it. */
  settings?: SettingsPanel
  slots: SlotView[] = []
  private slotsBuilt = false
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
    // THE EXIT THAT CANNOT BE FORGOTTEN. Every other way out of a run calls
    // `releaseHudModals` for itself; this is what covers the ones nobody
    // thought of, `relayout`'s own restart among them. See that method.
    this.events.once('shutdown', () => this.releaseHudModals())
    // And a new run of this scene owns no modal, whatever the last one left
    // behind: the panel, the dialog and the objects behind both went with the
    // scene run that drew them, so only the references are dropped here.
    this.paused = false
    this.settings = undefined
    this.panel = undefined
    this.wireHeldAbility()

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

    // Under them, still top-left: the control that starts a wave.
    this.buildWaveControl(L.waveControl)

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

    // THE DIFFICULTY LABEL IS GONE FROM THE GAME SCREEN.
    //
    // It printed the mode name -- `YEAH, I GAME` -- in dim text at the left
    // end of the second row, over the map, for the whole run. It is the same
    // class of thing as the hero's name and the DAD MODE badge, both of which
    // were taken off this screen in earlier passes and for the same reason: a
    // fact that is chosen BEFORE the level and cannot change during it does
    // not need a permanent readout on the board. It is on the level select
    // screen, in `presentation.difficultyChip`, which is where it is chosen.

    // Bottom-left of the ability row: the hero's portrait, with his health on
    // it. See `buildHeroChip`.
    this.buildHeroChip(L.heroChip)

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
  private setCounter(pill: Pill, value: string): void {
    if (pill.text.text === value) return
    pill.text.setScale(1)
    pill.text.setText(value)
    // GROW THE PILL FIRST, then fit the number into whatever field that gave.
    // The other order shrinks a number that did not need shrinking.
    this.stretchPill(pill, this.fieldForGlyphs(pill, value.length))
    const room = pill.field - pill.pad * 2
    pill.fit = pill.text.width > room ? Math.max(0.6, room / pill.text.width) : 1
    pill.text.setScale(pill.fit)
  }

  /**
   * How wide the field has to be to hold `n` glyphs, in CSS px.
   *
   * MEASURED WITH `8`s rather than with the number itself, so the answer
   * depends only on how MANY glyphs there are. Digits are not all the same
   * width in this face, so measuring the real string would make the pill a
   * pixel wider for 1888 than for 1111 -- a wobble nobody asked for.
   */
  private fieldForGlyphs(pill: Pill, n: number): number {
    const probe = this.add.text(0, 0, '8'.repeat(Math.max(1, n)), {
      fontFamily: FONT_UI,
      fontSize: `${Math.round(LAYOUT.readoutNumberSize * this.layout.counterScale)}px`,
      fontStyle: 'bold',
    })
    const w = probe.width
    probe.destroy()
    return Math.min(pill.maxField, Math.max(pill.minField, w + pill.pad * 2))
  }

  /**
   * Sets the pill's field width and re-places everything that hangs off it.
   *
   * The left cap never moves. The middle is the only piece whose width
   * changes, and the right cap and the number follow it.
   */
  private stretchPill(pill: Pill, field: number): void {
    pill.field = field
    const capL = pill.capL * pill.scale
    const h = pill.srcH * pill.scale
    pill.mid.setPosition(pill.x + capL, pill.y)
    pill.mid.setDisplaySize(field, h)
    pill.right.setPosition(pill.x + capL + field, pill.y)
    pill.right.setDisplaySize(pill.capR * pill.scale, h)
    pill.text.setPosition(pill.x + capL + pill.pad, pill.y + h / 2)
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
    return READOUTS.map((name) => {
      const cfg = renderFor(keys[name])
      const srcW = cfg.contentWidth ?? 232
      const srcH = cfg.contentHeight ?? 96
      const scale = LAYOUT.readoutHeight / srcH
      // THE GROWN WIDTH, NOT THE PAINTED ONE. The layout reserves the corner
      // before anything is drawn and the number in the pill changes all run,
      // so what has to be reserved is the WIDEST the pill can get -- the plate
      // with its field stretched to hold `readoutDigits` glyphs. Reserving the
      // painted width and then growing past it is what would put the pill
      // under the wave control.
      const fieldLeft = cfg.fieldLeft ?? 0.3
      const fieldRight = cfg.fieldRight ?? 0.94
      const capL = fieldLeft * srcW
      const capR = srcW - fieldRight * srcW
      const natural = (fieldRight - fieldLeft) * srcW * scale
      const pad = LAYOUT.readoutFieldPad * LAYOUT.readoutHeight
      const widest = Math.max(natural, this.glyphWidth(LAYOUT.readoutDigits) + pad * 2)
      return (capL + capR) * scale + widest
    })
  }

  /**
   * The width of `n` digits at the readout's own size, in CSS px.
   *
   * A throwaway Text object, because Phaser has no way to measure a string
   * without one and this runs twice per layout rather than per frame.
   */
  private glyphWidth(n: number): number {
    const probe = this.add.text(0, 0, '8'.repeat(Math.max(1, n)), {
      fontFamily: FONT_UI,
      fontSize: `${Math.round(LAYOUT.readoutNumberSize * this.layout.counterScale)}px`,
      fontStyle: 'bold',
    })
    const w = probe.width
    probe.destroy()
    return w
  }

  /**
   * Unscaled: the layout decides how much of this the corner actually gets.
   *
   * THE WIDEST, NOT THE SUM. The three plates used to be laid side by side and
   * this returned their total, which is what made the top row span the screen.
   * Two of them are stacked now, so the width the corner needs is the wider of
   * the pair -- and the wave counter is not in this group at all; it is read
   * off the control in the opposite corner, which had to say which wave it was
   * starting anyway.
   */
  private measureCounters(): number {
    return Math.max(...this.counterWidths())
  }

  private buildCounters(box: Rect): void {
    const keys = ART.ui.counters
    // TWO, AND `READOUTS` IS THE LIST. The colours are paired with the names
    // here rather than in that list because the list is what `readouts.test.ts`
    // counts against `hud.layout.readoutCount`, and a list of tuples is not a
    // list of readouts. Peanuts is amber because it is spendable and lives is
    // red because losing them ends the run; the wave is neither of those and is
    // not here at all -- it is the control under this stack.
    const order: Array<[string, string]> = [
      ['peanuts', COLOR.amber],
      ['lives', COLOR.danger],
    ]
    const x = box.x
    let top = box.y
    for (const [name, colour] of order) {
      const key = keys[name]
      const cfg = renderFor(key)
      const srcW = cfg.contentWidth ?? 232
      const srcH = cfg.contentHeight ?? 96
      const scale = (LAYOUT.readoutHeight / srcH) * this.layout.counterScale
      const fieldLeft = cfg.fieldLeft ?? 0.3
      const fieldRight = cfg.fieldRight ?? 0.94
      const capL = fieldLeft * srcW
      const capR = srcW - fieldRight * srcW
      const pad = LAYOUT.readoutFieldPad * srcH * scale

      // THE THREE SLICES, as sub-frames of the one texture.
      //
      // Added once per texture and guarded: `Texture.add` on a name that is
      // already there is a no-op that logs, and this runs again on every
      // resize.
      const tex = this.textures.get(key)
      const cut = (frame: string, fx: number, fw: number): string => {
        if (!tex.has(frame)) tex.add(frame, 0, fx, 0, fw, srcH)
        return frame
      }
      const fL = cut('pill-l', 0, capL)
      const fM = cut('pill-m', capL, srcW - capL - capR)
      const fR = cut('pill-r', srcW - capR, capR)

      const left = this.add.image(x, top, key, fL).setOrigin(0, 0).setScale(scale)
      const mid = this.add.image(x, top, key, fM).setOrigin(0, 0)
      const right = this.add.image(x, top, key, fR).setOrigin(0, 0)

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
      // ON THE LEFT CAP, which is the piece that never moves and never
      // stretches -- so growing the pill cannot drag the icon with it.
      if (name === 'peanuts' && this.textures.exists(ART.ui.peanut)) {
        // `box` SHADOWS THE PARAMETER, deliberately and as it always did: the
        // icon's box is the only one this block is about, and
        // tests/interaction.test.ts pins the `fitInRect` call by its text --
        // two dimensions, not one, because the peanut is 1.25:1 and the box is
        // 0.96:1 and a single-number fit cannot put one in the other.
        const box = ART.ui.counterIcon
        const plateH = srcH * scale
        const peanut = this.add.image(
          x + (box.left + box.width / 2) * plateH,
          top + (box.top + box.height / 2) * plateH,
          ART.ui.peanut,
        )
        fitInRect(peanut, ART.ui.peanut, box.width * plateH, box.height * plateH)
      }

      const text = this.add.text(x, top, '', {
        fontFamily: FONT_UI,
        fontSize: `${Math.round(LAYOUT.readoutNumberSize * this.layout.counterScale)}px`,
        fontStyle: 'bold', color: colour,
      }).setOrigin(0, 0.5)

      const natural = (srcW - capL - capR) * scale
      const pill: Pill = {
        key, left, mid, right, text,
        srcW, srcH, capL, capR, scale, x, y: top, pad,
        minField: natural,
        // THE WIDEST IT MAY GROW, and the layout has reserved exactly this --
        // see `counterWidths`. `readoutDigits` is what the game can reach:
        // peanuts is the only readout that gets near it, and 99,999 is well
        // past anything a run pays out.
        maxField: Math.max(natural, this.glyphWidth(LAYOUT.readoutDigits) + pad * 2),
        field: natural,
        fit: 1,
      }
      this.stretchPill(pill, natural)
      if (name === 'peanuts') this.peanutsPill = pill
      else this.livesPill = pill

      // DOWN, not across. This one line is the shape change.
      top += srcH * scale + LAYOUT.readoutGap * this.layout.counterScale
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
    // PADDED TO THE TAP FLOOR. The disc is drawn at `cornerButton` because a
    // 44px one fills the 44px row corner to corner and reads as a slab; the
    // rectangle a thumb actually lands on is the floor. See
    // `layout._cornerButtonTapPad`.
    const pad = LAYOUT.cornerButtonTapPad
    const hit = this.add.rectangle(x, y, box.width + pad, box.height + pad, 0xffffff, 0.001)
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

  /**
   * Lets go of a pause this scene is holding, whatever put it there.
   *
   * THE SOFT LOCK THIS FIXES. `paused` is a field on a scene Phaser REUSES:
   * one instance is built at boot and `create()` runs again on every run.
   * Nothing reset it, and the two ways out of the settings panel that are not
   * CONTINUE -- RESTART and HOME -- both stopped this scene with it still set.
   * The next run therefore started with `modalOpen` true, and `modalOpen` is
   * what GameScene asks, through `hudModalOpen`, before acting on ANY press:
   * `chromeUnderPointer` answered yes to every tap on the board, so no tower
   * could be placed, no special could be cast and the hero could not be
   * ordered -- while the waves, which start themselves on a countdown, went on
   * spawning and the counters went on ticking. Nothing was drawn, because the
   * panel had gone with the scene that drew it; there was no exception and
   * nothing to dismiss.
   *
   * So the flag is dropped at every exit rather than at the one that happened
   * to be tested, and `shutdown` is the exit that cannot be forgotten: a run
   * of this scene may not end while it still claims a modal.
   *
   * THE WORLD IS HANDED BACK TOO. `openSettings` paused GameScene on this
   * scene's behalf and only this scene will resume it, so a HUD that stops
   * while holding the pause would leave a board frozen with no owner. Asked
   * rather than assumed: resuming a scene that is not paused is not what this
   * means, and after QUIT the world has already been stopped.
   */
  private releaseHudModals(): void {
    this.settings?.close()
    this.settings = undefined
    this.panel?.close()
    this.panel = undefined
    if (!this.paused) return
    this.paused = false
    leaveGate('settings')
    if (this.scene.isPaused('Game')) this.scene.resume('Game')
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

  /**
   * RESTART, from the pause menu.
   *
   * THE HUD GOES DOWN AND THE BOARD PUTS IT BACK, rather than both restarting
   * side by side. GameScene has a `preload` now — it fetches the level's plate
   * on the way in, because holding all five for the life of the tab is the
   * memory that was killing iOS Safari — so its `create()` is deferred behind
   * the loader. Restarting this scene in the same breath ran the HUD's
   * `create()` first, and the HUD is built out of GameScene's run state: the
   * hand, the hero, the counters. There was no run yet, and it threw.
   *
   * `GameScene.create()` launches the HUD itself once it has a run to
   * describe, which makes that the one ordering that cannot race.
   */
  private restartRun(): void {
    this.releaseHudModals()
    this.scene.resume('Game')
    this.scene.stop()
    this.scene.get('Game').scene.restart()
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
    this.releaseHudModals()
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

  /**
   * THE WAVE CONTROL: the bottom row of the top-left stack, and the only thing
   * in that corner a finger is meant to land on.
   *
   * IT WEARS THE SAME PAINTED PLATE AS EVERY OTHER BUTTON IN THE GAME, which
   * is the whole reason it is a `plateButton` rather than a fourth pill. A
   * counter pill and a button plate are two different pieces of art, and a
   * control that wore the pill would be a 44px-tall readout -- the one thing
   * this corner must not look like now that the readouts above it are 16px. It
   * also gets the plate's hover tint, its click sound and its disabled plate
   * for free, and those three ARE the affordance.
   */
  private buildWaveControl(box: Rect): void {
    const x = box.x
    const y = box.y
    const w = box.width
    const h = box.height
    this.waveBtn = plateButton(this, x + w / 2, y + h / 2, w, h, '',
      () => this.world.startWave(), LAYOUT.waveLabelSize)
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
        // ONE CALL FOR EVERY HERO SLOT. It used to compare the slot id against
        // `SLOT2` and dispatch to one of two methods, which is the assumption
        // a hero with three abilities breaks: the third would have been read
        // as slot 1 and cast the wrong thing.
        if (region.kind === 'ability') this.world.armAbility(region.id)
        else this.world.castHeroSlot(region.id)
      })

      this.slots.push({ region, frame, sweep, icon, timer, hit })
    }
  }

  /**
   * THE HELD ABILITY'S DRAG, wired once for the whole scene rather than once
   * per button.
   *
   * A held beam is pressed on a 76px medallion at the bottom of the screen and
   * AIMED by dragging out over the board, so the pointer leaves the rectangle
   * that started it on the first frame of the gesture. A `pointermove` on the
   * hit rectangle would stop firing the moment the aim became interesting, and
   * a `pointerup` on it would never arrive at all -- the finger comes up over
   * the map. Both therefore belong to the scene's input plugin, which hears
   * the pointer wherever it is.
   *
   * `pointerupoutside` is the one a phone actually delivers when the finger
   * leaves the canvas, and `gameout` covers a mouse dragged off the window.
   * All three land on the same call, and `releaseHeldAbility` is a no-op when
   * nothing is held -- an escape that has to check first is an escape somebody
   * will forget to check for.
   */
  private wireHeldAbility(): void {
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.isDown) this.world.aimHeldAbility(p)
    })
    this.input.on('pointerup', () => this.world.releaseHeldAbility())
    this.input.on('pointerupoutside', () => this.world.releaseHeldAbility())
    this.input.on('gameout', () => this.world.releaseHeldAbility())
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

    this.setCounter(this.peanutsPill, `${s.peanuts}`)
    this.setCounter(this.livesPill, `${s.lives}`)
    // Money and lives are the two numbers a player watches, so a change has to
    // announce itself rather than quietly appear.
    if (this.lastPeanuts >= 0 && s.peanuts !== this.lastPeanuts) {
      this.bump(this.peanutsPill, s.peanuts > this.lastPeanuts ? '#ffffff' : COLOR.danger, COLOR.amber)
      if (s.peanuts > this.lastPeanuts) this.floatUp(`+${s.peanuts - this.lastPeanuts}`, COLOR.amber)
    }
    if (this.lastLives >= 0 && s.lives < this.lastLives) {
      this.bump(this.livesPill, '#ffffff', COLOR.danger)
    }
    this.lastPeanuts = s.peanuts
    this.lastLives = s.lives
    this.drawBossBar(s)
    this.drawWaveControl(s)
    this.drawSlots(s)
    this.drawHeroChip(s)
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
  /**
   * A number that just changed, flashed and swelled.
   *
   * AROUND `pill.fit`, NOT AROUND 1, AND THAT IS THE BUG THIS FIXES. It read
   * `text.setScale(1)` and tweened to a flat `1.25` with `yoyo`, so it landed
   * back on 1 -- discarding whatever scale `setCounter` had computed to make
   * the number fit. And `setCounter` returns early when the text has not
   * changed, so nothing put it back: from the first change onward the number
   * was drawn at full size. That is the mechanism live play reported. 800 fits
   * the painted field either way; 1012 does not, and was drawn unshrunk with
   * its last digit across the border.
   *
   * The pill grows now, so `fit` is 1 almost always -- but "almost always" is
   * exactly the kind of thing that stops being true, and a bump that throws
   * away a fit is wrong whether or not anything currently needs one.
   */
  private bump(pill: Pill, flash: string, base: string): void {
    const text = pill.text
    this.tweens.killTweensOf(text)
    text.setColor(flash)
    text.setScale(pill.fit)
    this.tweens.add({
      targets: text, scale: pill.fit * 1.25, duration: 90, yoyo: true, ease: 'Quad.easeOut',
      onComplete: () => { text.setColor(base); text.setScale(pill.fit) },
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

  /**
   * THE WAVE CONTROL'S FOUR STATES, and every one of them names the wave.
   *
   * That is the point of the merge: the count is drawn HERE and nowhere else
   * on the HUD, so a state that dropped it would take the wave number off the
   * screen entirely. `tests/wavecount.test.ts` holds it to one place; this
   * method is what makes that one place enough.
   *
   *   ready, clock running   `▶ 2/13 +20`   pressable, pays the bonus
   *   ready, no clock        `▶ 1/13`       pressable, pays nothing
   *   wave running           `2/13 · 18`    disabled plate, 18 still coming
   *   run over               `CLEARED` / `OVERRUN`
   *
   * The play glyph is on the two pressable states only. A greyed plate with a
   * play glyph on it is a button saying press me and refusing, which is worse
   * than no glyph at all.
   */
  private drawWaveControl(s: GameScene['status']): void {
    // Only pressable between waves. Mid-wave it becomes a readout, which is
    // exactly what the disabled plate is for.
    this.waveBtn.setEnabled(s.phase === 'ready')

    // CLAMPED, because the last wave's spawner leaves `wave` one past the end
    // for a frame and `14/13` is a rendering fault as far as a player is
    // concerned.
    const n = Math.min(s.wave + 1, s.waveCount)
    if (s.phase === 'ready') {
      // THE WORD `START` IS NOT ON IT.
      //
      // It read `WAVE 2 · 3s · +4` and then `START WAVE 2`, and the plate had to
      // be 168px wide to hold the longest of those. What the word START was
      // doing is already done twice over -- by the plate's own enabled state,
      // which greys out the moment the wave is running, and by the play glyph.
      // Dropping it is what let the control come down to 132 without the
      // number or the bonus getting any smaller.
      //
      // WAVE 1 AND A RESUMED WAVE 1 CARRY NO CLOCK, so there is no bonus to
      // show and the plate reads `▶ 1/13`. Not an empty plate and not a
      // `+0`: a zero bonus is a promise of nothing, and the count is what the
      // player needs there anyway.
      const bonus = Math.floor(s.readyCountdown) * RULES.pacing.earlyStartPeanutsPerSecond
      this.waveBtn.setLabel(bonus > 0 ? `▶ ${n}/${s.waveCount} +${bonus}` : `▶ ${n}/${s.waveCount}`)
    }
    // NO WAVE NAME. It read `The Gathering · 6 left`, and the name was a
    // flavour string in waves.json that told the player nothing they could act
    // on while it took the width that the count needed.
    //
    // THE COUNT AND WHAT IS LEFT OF THE WAVE, which is the pair this control
    // carried before the wave counter was briefly split off into a readout of
    // its own. `18 LEFT` alone was right for the one day the stack above was
    // also printing `2/13`; with the readout gone it would take the wave number
    // off the screen for the whole of every wave.
    else if (s.phase === 'wave') {
      this.waveBtn.setLabel(`${n}/${s.waveCount} · ${s.enemiesLeft}`)
    }
    else this.waveBtn.setLabel(s.phase === 'won' ? 'CLEARED' : 'OVERRUN')
  }

  /**
   * The cards carry their own frames, so nothing is drawn behind them. A
   * cooldown darkens the icon and sweeps a dial over it; an ability that is
   * not castable at all is swapped for its greyscale copy, which reads as
   * switched off rather than as merely dim.
   */
  private drawSlots(s: GameScene['status']): void {
    // The same two the row was BUILT from, so the icon is re-fitted to the
    // same box it was first placed in. Read here rather than per slot: a
    // lookup inside a loop over every slot, every frame, for two values that
    // cannot change between iterations.
    const bar = presentationData.abilityBar as BarMetrics
    const k = this.layout.abilityScale
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
      //
      // THE SWAP NEVER LEAVES A SLOT UNFITTED, and that is the bug this shape
      // fixes rather than the states above.
      //
      // It used to read `if (exists(wantKey) && key !== wantKey)` and do BOTH
      // the setTexture and the fitInBox inside. So when the wanted texture did
      // not exist -- which is exactly what happens to `<icon>-grey` when the
      // icon itself failed to load, because nothing builds a greyscale copy of
      // a texture that is not there -- the whole block was skipped, the sprite
      // kept the texture and the SCALE it was constructed with, and the
      // 256-pixel stand-in drew at 256 pixels in a 56-pixel slot. On an iPad
      // that is a yellow exclamation mark four times the size of every other
      // control, lying across the board.
      //
      // Two rules now, and they are separate on purpose:
      //   1. never ask for a texture that does not exist -- fall back to the
      //      colour icon, which is wrong-looking but present and legible,
      //      rather than to nothing;
      //   2. FIT WHATEVER WAS ACTUALLY SET, every time it changes. A stand-in
      //      is fitted by the same call as real art, so it can only ever be
      //      the size of the slot it is standing in for.
      const base = this.world.abilityIcon(r.id) ?? slot.icon.texture.key
      const grey = greyKey(base)
      const wantKey = usable ? base
        : (this.textures.exists(grey) ? grey : base)
      if (slot.icon.texture.key !== wantKey && this.textures.exists(wantKey)) {
        slot.icon.setTexture(wantKey)
      }
      // Fitted against the key the sprite is ACTUALLY wearing, not against the
      // one that was wanted. Those differ whenever a fallback is in play, and
      // fitting by a key the sprite is not showing is how a stand-in ends up
      // sized for the art it replaced rather than for its own canvas.
      // SIZED BY `iconBox`, NOT BY THE SLOT'S FULL BOX. `boxH` is the row's
      // height and `pitch` is the column's width -- together they are the
      // rectangle a THUMB lands on, and an icon drawn to fill it leaves no gap
      // between one picture and the next. `draftedIcon` and `heroIcon` are the
      // picture; they existed the whole time and this line did not read them,
      // so the two keys could not tune anything. It went unseen while the box
      // was 64 in a 72 pitch, because 8px of accidental slack looks like a
      // gap. At a 56 pitch it would have been none.
      fitInBox(slot.icon, slot.icon.texture.key, iconBox(r, bar, k))
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
    // A `poweredOnly` ABILITY IS GREY UNTIL THE HERO HAS TRANSFORMED. Not
    // hidden: the player should be able to see that the ability exists and
    // read its icon while it is out of reach, which is the difference between
    // a locked door and a wall. `slotUsable` false swaps the icon for its
    // greyscale copy and takes the tap with it, so it cannot be pressed by
    // accident either. It was keyed on the slot INDEX -- slot 2 and only slot
    // 2 -- and Courtland has two gated abilities in slots 2 and 3.
    if (isHeroSlot(slot.id)) {
      const a = abilityInSlot(this.world.heroId, slot.id)
      return a ? abilityUsable(a, s.heroPowered, s.heroDown) : false
    }
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
   * The hero's portrait chip, built once.
   *
   * THE ART IS THE LOADOUT CARD'S ART, referenced rather than copied. Both
   * read `heroDef().portraitSprite`; there is no second key and no second
   * file, so a change to the card changes this with it. That was the explicit
   * requirement and it is also the only version that stays true — a duplicate
   * key is a duplicate that drifts.
   */
  private buildHeroChip(box: Rect): void {
    const C = HUD.heroChip
    const at = heroChipContent(box, C.edgeWidth)
    this.chipPlate = this.add.graphics()
    // Placed at the box's centre; the texture and the fit are done in
    // `drawHeroChip`, which is also what swaps it when the hero transforms.
    //
    // AND THE POSITION HERE IS ONLY A STARTING POINT. Every frame re-places
    // all three of these from the LIVE box -- see `drawHeroChip`. They used to
    // be placed here and nowhere else, which is the whole of the Server Nuke
    // bug: the plate moved with the layout and the hero did not.
    this.chipPortrait = this.add.image(at.cx, at.cy, ART.generated.iconMissing)
    // A NEW SPRITE HAS NO HISTORY, AND THE CACHE HAS TO BE TOLD.
    //
    // `chipKey` is what stops `drawHeroChip` re-fitting the portrait every
    // frame, and it is a plain field on a scene instance Phaser constructs
    // ONCE and re-`create()`s on every restart. So on the second level of a
    // session it still held the portrait key of the first — and since a player
    // takes the same hero from one level to the next, the very next
    // `drawHeroChip` found `key === chipKey`, skipped the branch, and left
    // this brand-new image wearing the 256px missing-icon stand-in it was
    // constructed with, unfitted, lying across the ability bar.
    //
    // That is the same shape as the bug in `drawSlots` and it is the same
    // rule that closes it: fit whatever was actually set. Clearing the cache
    // alongside the sprite is how that rule reaches a cached comparison —
    // `''` is not a texture key, so the first draw always sets and fits.
    this.chipKey = ''
    this.chipFit = -1
    this.chipBar = this.add.graphics()
    this.chipLabel = this.add.text(at.cx, at.cy, '', {
      fontFamily: FONT_UI, fontSize: '19px', color: COLOR.ink, fontStyle: 'bold',
      stroke: '#0d1016', strokeThickness: 5,
    }).setOrigin(0.5)

    // THE TAP, WITH THE WORLD MAP'S DRAG RULE.
    //
    // The board pans under the same finger that presses this, so a press that
    // TRAVELLED is a scroll and must not also select the hero. The world map
    // solves it by measuring how far the pointer moved and acting on release
    // rather than on press; the same rule, and the same slop, are used here.
    // Without it, every drag that happened to start on the chip would post the
    // hero somewhere — and the next tap on the map would move him there.
    this.chipHit = this.add.rectangle(
      at.cx, at.cy, box.width, box.height, 0xffffff, 0.001,
    ).setInteractive({ useHandCursor: true })
    let downAt = { x: 0, y: 0 }
    let travelled = 0
    this.chipHit.on('pointerdown', (p: Phaser.Input.Pointer) => {
      downAt = { x: p.x, y: p.y }
      travelled = 0
    })
    this.chipHit.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return
      travelled = Math.max(travelled, Math.hypot(p.x - downAt.x, p.y - downAt.y))
    })
    this.chipHit.on('pointerup', () => {
      if (travelled > TAP_SLOP) return
      this.world.selectHero()
    })
    void C
  }

  /**
   * The chip, every frame: which form, how hurt, and whether he is coming back.
   *
   * THREE STATES AND THEY ARE ALL READ OFF GAME STATE.
   *
   *   up          the current form's portrait, full colour, with a health bar
   *               across the bottom of it.
   *   damaged     the same, with the bar shorter and coloured for Last Stand
   *               when that is running.
   *   down        the portrait desaturated and dimmed, the bar replaced by the
   *               respawn countdown in seconds, and the tap refused — the
   *               world already refuses it, and the chip says why rather than
   *               looking pressable and doing nothing.
   *
   * The FORM comes from `s.heroPowered`, which is the same field that decides
   * whether slot 2 is greyed out — not a flag of its own. A separate flag is
   * how the button and the portrait come to disagree about which hero is on
   * the board.
   */
  private drawHeroChip(s: GameScene['status']): void {
    const C = HUD.heroChip
    const box = this.layout.heroChip
    const hero = this.world.heroDef()

    // THE SPRITE TRACKS ITS BOX. Everything below this line already read
    // `box` -- the plate and the bar are redrawn from it every frame -- and
    // the portrait, the countdown label and the tap rectangle did not: they
    // were placed once in `buildHeroChip` and left there.
    //
    // `relayoutAbilities` moves this box mid-run. The Server Nuke is the one
    // thing that does it: the drop ADDS a medallion, the row is re-measured
    // wider, and a CENTRED row that grows pushes its own left edge left --
    // taking `heroChip.x` with it, since the chip is reserved against it. The
    // plate moved half a drafted pitch left and the hero stayed, which is
    // further than the box is wide from its centre, so he was drawn outside
    // it. See `heroChipContent` for the whole reading.
    //
    // Cheap enough to do unconditionally: three `setPosition` calls on objects
    // that are already being redrawn. The FIT is the one thing guarded, by the
    // box's width rather than by a frame counter -- `fitInBox` is the
    // expensive half and the width only changes when the layout does.
    const at = heroChipContent(box, C.edgeWidth)
    this.chipPortrait.setPosition(at.cx, at.cy)
    this.chipLabel.setPosition(at.cx, at.cy)
    this.chipHit.setPosition(at.cx, at.cy)
    // THE TAP RECTANGLE'S SIZE, ONLY WHEN IT CHANGES, AND RE-ARMED WITH IT.
    //
    // `setSize` moves the rectangle that is DRAWN; the rectangle that is
    // HIT-TESTED was built by `setInteractive` from the size the object had at
    // the time, and resizing does not reach it. So the two are re-armed
    // together, which is the same rule as the fit above: a cached thing is
    // refreshed against everything it depends on.
    //
    // Nothing resizes the chip today -- `hud.layout.heroChip` is a constant 60
    // and only the chip's POSITION moves -- so this is guarded rather than
    // unconditional, because `setInteractive` on every frame is real work.
    // It is here at all so the pass that makes the chip's size a function of
    // the viewport does not have to find this out from a dead tap target.
    if (this.chipHit.width !== box.width || this.chipHit.height !== box.height) {
      this.chipHit.setSize(box.width, box.height)
      this.chipHit.setInteractive({ useHandCursor: true })
    }

    // THE SAME KEY THE LOADOUT CARD DRAWS, in the form he is currently in.
    // `portraitSprite` is the base picture; the powered form is the same key
    // the sprite on the board swaps to, so the chip and the board cannot show
    // different heroes.
    const want = s.heroPowered && hero.poweredSprite ? hero.poweredSprite : hero.portraitSprite
    const key = this.textures.exists(want) ? want : ART.generated.iconMissing
    // THE FIT IS CACHED ON THE KEY *AND* THE BOX. On the key alone it survived
    // a layout that changed the chip's size, which is the same class of fault
    // as the position: a cached comparison that does not name everything the
    // cached work depends on. Nothing in the game resizes the chip today; the
    // pass that does would find the portrait fitted for the old square.
    if (key !== this.chipKey || at.fit !== this.chipFit) {
      this.chipKey = key
      this.chipFit = at.fit
      this.chipPortrait.setTexture(key)
      // Fitted inside the chip less its frame, by the art's own content box —
      // so a hero whose canvas has more empty space than another's is still
      // drawn the same size as them.
      fitInBox(this.chipPortrait, key, at.fit)
    }

    // A hero who is down is a different picture of the same hero: dimmed and
    // drained rather than hidden, because the chip is also the countdown and
    // a blank square cannot carry one.
    this.chipPortrait.setTint(s.heroDown ? C.downTint : 0xffffff)
    this.chipPortrait.setAlpha(s.heroDown ? C.downAlpha : 1)

    this.chipPlate.clear()
    this.chipPlate.fillStyle(C.backing, C.backingAlpha)
    this.chipPlate.fillRoundedRect(box.x, box.y, box.width, box.height, C.radius)
    // SELECTED IS A RING ON THE CHIP, matching the ring on his feet. The two
    // are the same state and the player is looking at one of them.
    this.chipPlate.lineStyle(C.edgeWidth, this.world.heroIsSelected ? C.selectedEdge : C.edge, 1)
    this.chipPlate.strokeRoundedRect(box.x, box.y, box.width, box.height, C.radius)

    // The health bar, ACROSS THE BOTTOM OF THE PORTRAIT rather than beside it.
    const bw = box.width - C.barInset * 2
    const bh = C.barHeight
    const bx = box.x + C.barInset
    const by = box.y + box.height - C.barInset - bh
    this.chipBar.clear()
    if (s.heroDown) {
      // THE RESPAWN STATE, DEFINED: no bar at all, because an empty bar and a
      // full one look the same at nine pixels tall and the number is what the
      // player actually needs. Rounded UP and floored at 1, so it never reads
      // 0 while he is still gone.
      //
      // IN REAL SECONDS, through the same conversion the ground marker uses.
      // `reviveIn` is in GAME seconds and the clock runs at 1.4x, so 25 in the
      // data is 17.9 on the player's watch. There are two countdowns on screen
      // now — this one and the marker on the spot he fell — and two countdowns
      // that disagree are worse than either alone. They read the same number
      // because they do the same conversion.
      this.chipLabel.setText(`${Math.max(1, Math.ceil(realSeconds(s.heroReviveIn, 1)))}`)
      this.chipLabel.setPosition(box.x + box.width / 2, box.y + box.height / 2)
    } else {
      this.chipLabel.setText('')
      const ratio = Phaser.Math.Clamp(s.heroHealth / Math.max(s.heroMax, 1), 0, 1)
      this.chipBar.fillStyle(0x14181f, 0.92)
      this.chipBar.fillRoundedRect(bx - 1, by - 1, bw + 2, bh + 2, 3)
      this.chipBar.fillStyle(s.heroPowered ? 0xff5a3c : 0x4fa3e3, 1)
      this.chipBar.fillRect(bx, by, bw * ratio, bh)
      // THE THRESHOLD, from `status.heroMarks`, which is data. There were two
      // marks -- the transformation at half and Last Stand at a quarter -- for
      // what is one event now, and the quarter was the one a player noticed.
      // Still a list, so this draws whatever it is given without knowing what
      // any of it means.
      for (const mark of s.heroMarks) {
        this.chipBar.lineStyle(1, COLOR.panelEdge, 0.9)
          .lineBetween(bx + bw * mark, by, bx + bw * mark, by + bh)
      }
    }
  }
}
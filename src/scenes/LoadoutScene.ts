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
import { fitHeroRow, heroDescription } from '../systems/HeroRow.ts'
import type { Rect } from '../systems/HudLayout.ts'
import { fitCameraToDesign } from '../ui/FitCamera.ts'
import { abilityLine, towerLine, towerStats } from '../systems/AbilityText.ts'
import { ART, renderFor } from '../systems/Art.ts'
import presentationData from '../data/presentation.json'
import { play } from '../systems/Audio.ts'
import { musicForScene } from '../systems/Music.ts'
import { logEvent } from '../systems/Diagnostics.ts'
import {
  columnWidth, minDesign, stackSections, tapFloor, useTwoColumns, visibleDesignBox,
  type StackSection,
} from '../systems/Layout.ts'

const TOWERS = towersData as Record<string, TowerDef>
const ABILITIES = abilitiesData as Record<string, AbilityDef>
const DRAFT = draftData as DraftDef

const W = displayData.width
const H = displayData.height
const LO = presentationData.loadout

/** Between two cards in a row. Named because the measurers need the same
 *  number the drawer uses to work out how wide one card gets. */
const CARD_GAP = 22

/**
 * How the hero block arranges its portrait row and its description.
 *
 * `under` is the arrangement this screen has always had. The other two are
 * what it reflows to when the vertical budget runs out on a wide, short
 * viewport, and each is measured before it is taken:
 *
 *   `beside`        the whole description moves up next to the portraits. The
 *                   block is as tall as the taller of the two rather than the
 *                   sum. Needs the most width: the row still has to hold five
 *                   portraits on one line beside a readable blurb column.
 *   `chips-beside`  only the ability chips move up; the blurb stays under the
 *                   row with the block's full width, which costs it one line
 *                   instead of the chip column's whole height. Needs far less
 *                   width and, where the wider one does not fit, saves more.
 */
type HeroLayout = 'under' | 'beside' | 'chips-beside'

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
  /**
   * The card's own rectangle IN FACE COORDINATES, which is the only honest way
   * to place anything inside it.
   *
   * `face` has a MIXED ANCHOR -- centred horizontally, top-aligned vertically
   * -- and that asymmetry cost the loadout screen its layout. `heroSection`
   * offset its row by `-height / 2 + padT`, correct for a centred anchor and
   * half a block too high for this one, which put five hero cards on top of
   * the title, the subtitle and the HERO heading on every viewport. It was
   * invisible for two sessions because the row's own geometry was right; only
   * the anchor it was measured from was wrong.
   *
   * So the anchor is not something a caller works out any more. `top` is 0 and
   * `left` is -width / 2, stated rather than derived.
   */
  inner: { left: number; top: number; width: number; height: number }
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
  /**
   * The three content sections, separate from the fixed chrome.
   *
   * THE TITLE, THE SUBTITLE AND THE BUTTONS DO NOT SCROLL, and they must not
   * be masked either -- masking `layer` to the content band took all three off
   * the screen, which is a worse bug than the one the scroll was added to fix.
   * `target` is what `heading` and `card` draw into, so the split costs those
   * two nothing.
   */
  private stack!: Phaser.GameObjects.Container
  private target!: Phaser.GameObjects.Container
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
    //
    // THIS DIVIDED A CSS-PIXEL VIEWPORT BY A PHYSICAL-PIXEL CAMERA ZOOM, which
    // are two different spaces, and came out about three times too small -- so
    // it fell through to the `W`/`H` floor and painted the room to the design
    // box rather than to the screen. On an 844x390 phone the camera sees 1558
    // design units of width and the backdrop covered 1280 of them, leaving a
    // black band down each side of the illustration. `visibleDesignBox` does
    // the conversion in the one place that owns it.
    const vis = visibleDesignBox(this)
    const visW = vis.width
    const visH = vis.height

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
    this.stack?.destroy(true)
    this.layer = this.add.container(0, 0)
    this.stack = this.add.container(0, 0)
    this.target = this.layer
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
    //
    // AND THEY RESERVE WHAT THEY ACTUALLY TAKE. `plateButton` applies the 44pt
    // tap floor, which on a phone makes a 48-unit button 81 units tall -- so
    // reserving `LO.buttonHeight` here left the cards a budget 33 units too
    // generous and the specials' description ran into BEGIN THE RUN. Asking
    // `tapFloor` the same question the button will ask is what keeps the two
    // in step.
    const buttonH = tapFloor(this, LO.buttonHeight)
    const by = H - LO.buttonMargin - buttonH / 2
    this.buildButtons(by, buttonH)

    /*
     * THE SCREEN IS A STACK THAT FLOWS, and every section is measured before
     * anything is placed.
     *
     * WHAT THIS REPLACES, because the shape of the mistake is the point. The
     * three content sections were handed SHARES of a budget -- 62% of it to the
     * hero block at most, then 53/47 of the remainder to the towers and the
     * specials -- and each one drew whatever it had into the height it was
     * given. A card whose text needed more than its share did not push the
     * next section down, because nothing downstream was listening: it drew
     * past its own edge and over the heading below it. Four collisions on one
     * screen, and a share is what makes every one of them possible.
     *
     * Now each section says what it NEEDS, `stackSections` reconciles those
     * against the room available, and each one is placed at the bottom of the
     * one above. The headings are sections too -- that is what stops a label
     * being overlapped from either side, because it owns a band of the stack
     * rather than sitting in a gap between two things that were sized
     * independently.
     */
    const top = drawn.y + drawn.height + 10
    const available = (by - buttonH / 2 - LO.buttonGap) - top

    // What each block wants. The hero block is solved against a generous
    // ceiling so `natural` is what it would take if nothing else needed room;
    // its floor is what it takes when squeezed as hard as it can be.
    const small = LO.bodySizes[LO.bodySizes.length - 1]!

    /*
     * ONE COLUMN OR TWO, and the screen decides by measuring rather than by
     * asking how wide the viewport is.
     *
     * WHAT THIS FIXES. Everything on this screen is composed against the fixed
     * 1280x720 design box, and every tap target inside it carries a 44 CSS
     * pixel floor -- which costs MORE design units the shorter the viewport,
     * because the box is scaled down to fit. At 2.26:1 the buttons alone eat
     * eighty units that cost forty-five on a desktop, the stack runs out of
     * vertical room, and the specials are masked away below the fold. The
     * horizontal budget is untouched the whole time.
     *
     * NOT SOLVED BY SCALING THE SCREEN DOWN. That is on record here as the
     * wrong answer: a panel scaled to fit a phone put its own buttons at about
     * 24 CSS pixels, and the standing note says the answer is a shorter panel
     * rather than a smaller one. Scaling this screen makes the tower stats and
     * the ability labels unreadable and trades one complaint for another.
     *
     * So it REFLOWS. The towers and the specials go side by side, and the hero
     * block puts its description beside the portrait row instead of under it.
     * Both cost width, which is what there is; neither costs a font size.
     */
    const stackedFloor = this.stackedFloor(run, small)
    const headingH = this.headingHeight()
    const needsRoom = stackedFloor > available

    // THE HERO BLOCK PICKS THE SHORTEST ARRANGEMENT THAT IS STILL LEGIBLE,
    // by solving all three and comparing, rather than by a rule about the
    // viewport's shape.
    //
    // Three things disqualify a candidate however short it looks. It has to be
    // NEEDED -- a screen that already fits is not rearranged. Its portrait
    // row has to stay on ONE line: `fitHeroRow` wraps to two rather than going
    // below `minPortrait`, and two rows of cards beside a description is
    // taller than one row above it, so the reflow would make the thing it was
    // meant to fix worse. Both were measured on the way here: at 62% of the
    // block to the row, "Mind Control" went out through the panel's rail; at
    // 52% the five portraits wrapped.
    //
    // AND EVERY HERO CARD IS A BUTTON, so it owes the same 44 CSS pixels every
    // other control on this screen owes. `minPortrait` is a floor in DESIGN
    // units and the tap floor is a floor in CSS pixels, and on a short viewport
    // those are different numbers: at 667x375 `beside` left the row 5 cards of
    // 43 CSS px, one pixel under, which is a fault the design-unit floor cannot
    // see. A card that cannot be tapped is worse than a screen that scrolls,
    // so the arrangement loses and the block goes back under the row.
    const minTapW = minDesign(this)
    const candidates: HeroLayout[] = needsRoom
      ? ['beside', 'chips-beside', 'under'] : ['under']
    const plans = candidates.map((m) => ({ mode: m, plan: this.heroPlan(run.heroId, 0, m) }))
    const usable = plans.filter((c) => c.plan.row.rows === 1
      && c.plan.row.cards.every((r) => r.width >= minTapW))
    const heroLayout: HeroLayout = (usable.length ? usable : plans)
      .reduce((best, c) => (c.plan.height < best.plan.height ? c : best)).mode

    // AND THE DEALT ROWS REFLOW ON THEIR OWN TERMS, WHICH IS A DIFFERENT
    // QUESTION AND A DIFFERENT ANSWER.
    //
    // Side by side, each column lays its own two cards ACROSS its half-band,
    // so the dealt block is one card deep instead of two. It buys the second
    // heading, the gap under it, and a whole card's height; it costs each card
    // half its width, and a card half as wide wraps its stats into more lines.
    //
    // THE OTHER READING WAS TRIED AND MEASURED, and it never wins. Stacking
    // each column's cards DOWN keeps a card the full width of its column --
    // within a pixel of what it has today -- but leaves the block two cards
    // deep, exactly as deep as stacked, so all it can buy is one heading while
    // it pays a card gap and a slightly narrower card. Across all four audited
    // viewports it came out TALLER than the arrangement it was meant to
    // replace: 325 against 319, 343/345, 343/345 and 377/371. Laid across, the
    // same four read 279/319, 331/345, 279/345 and 357/371.
    const colW = columnWidth(this.contentWidth, LO.columnGap)
    const stackedCardW = this.cardWidthFor(2)
    // Two cards ACROSS a half-band, which is what a column holds.
    const columnCardW = this.cardWidthFor(2, colW)
    const dealtStackedFloor =
      this.dealtFloor(run, stackedCardW, small, false) + headingH * 2 + LO.sectionGap
    const dealtColumnsFloor = this.dealtFloor(run, columnCardW, small, true) + headingH
    const wide = needsRoom && useTwoColumns({
      stackedFloor: dealtStackedFloor,
      columnsFloor: dealtColumnsFloor,
      // THE CARD, not the column, is what has to stay readable. `minColumn`
      // guarded the band and the band is not what shrinks: laid across, a
      // 391-unit column holds two 184-unit cards, and it is those the player
      // reads a tower's stats off.
      column: columnCardW,
      minColumn: LO.minDealtCard,
      minSaving: LO.minReflowSaving,
    })
    // The band each block is laid out in. One column is the whole width
    // centred; two are halves either side of the middle.
    const leftBand = { cx: W / 2 - (colW + LO.columnGap) / 2, width: colW }
    const rightBand = { cx: W / 2 + (colW + LO.columnGap) / 2, width: colW }
    const cardW = wide ? columnCardW : stackedCardW

    const heroWant = this.heroPlan(run.heroId, available, heroLayout).height
    // Solved against a ceiling of nothing, which is what makes it the block's
    // true floor rather than a number somebody picked.
    const heroFloor = this.heroPlan(run.heroId, 0, heroLayout).height
    const towerWant = this.towerNeeds(run.openingTowers, cardW)
    const towerFloor = this.towerNeeds(run.openingTowers, cardW, small)
    const specialWant = this.abilityNeeds(run.abilities, cardW)
    const specialFloor = this.abilityNeeds(run.abilities, cardW, small)

    // TWO COLUMNS ARE ONE SECTION IN THE STACK. The towers and the specials
    // share a heading row and a band, so the stack sees one band as tall as
    // the taller COLUMN rather than two bands stacked -- which is the whole of
    // what the reflow buys vertically: the second heading and the gap under
    // it, at no cost to a card's width.
    const dealtWant = wide
      ? this.dealtFloor(run, cardW, LO.bodySizes[0]!, true) : towerWant
    const dealtFloor = wide ? this.dealtFloor(run, cardW, small, true) : towerFloor

    const sections: StackSection[] = [
      { natural: headingH, gapAfter: 0 },
      { natural: heroWant, min: Math.min(heroWant, heroFloor), gapAfter: LO.sectionGap },
      { natural: headingH, gapAfter: 0 },
      { natural: dealtWant, min: Math.min(dealtWant, dealtFloor), gapAfter: LO.sectionGap },
    ]
    if (!wide) {
      sections.push(
        { natural: headingH, gapAfter: 0 },
        { natural: specialWant, min: Math.min(specialWant, specialFloor) },
      )
    }
    const laid = stackSections(sections, top, available)

    const [heroLabel, heroAt, dealtLabel, dealtAt, specialLabel, specialAt] = laid.tops
    const [, heroH, , dealtH, , specialH] = laid.heights

    this.target = this.stack
    this.heading('HERO', heroLabel!)
    this.heroSection(run.heroId, heroAt!, heroH!, heroLayout)
    if (wide) {
      // Both headings on the same line, each over its own column.
      this.heading('TOWERS', dealtLabel!, leftBand.cx)
      this.heading('SPECIALS', dealtLabel!, rightBand.cx)
      this.towerSection(run.openingTowers, dealtAt!, dealtH!, leftBand)
      this.abilitySection(run.abilities, dealtAt!, dealtH!, rightBand)
    } else {
      this.heading('TOWERS', dealtLabel!)
      this.towerSection(run.openingTowers, dealtAt!, dealtH!)
      this.heading('SPECIALS', specialLabel!)
      this.abilitySection(run.abilities, specialAt!, specialH!)
    }
    this.target = this.layer

    // A stack that still does not fit after every section has been squeezed to
    // its floor SCROLLS. It is reported as well as handled: a screen that has
    // to scroll on a phone is a design problem, and one that scrolls silently
    // is a design problem nobody knows about.
    // Published for the harness, which checks that what a section was GIVEN
    // covers what it ASKED FOR -- a card drawing past its own frame is a
    // number, and this is the number.
    this.stackPlan = {
      available, headingH, cardW, wide, heroLayout, stackedFloor,
      // BOTH SIDES OF THE REFLOW'S DECISION, so a log can say why it declined
      // rather than only that it did.
      dealtStackedFloor, dealtColumnsFloor, colW,
      contentWidth: this.contentWidth,
      // THE PLAN THAT WAS DRAWN, recorded by `heroSection` rather than solved
      // again here. Solving it again asks a different question -- at a taller
      // ceiling `fitHeroRow` grows the portraits and wraps to two lines, and
      // `heroSection` re-solves at a ceiling of nothing when that happens --
      // so an independent solve reported `rows=2` for a block that draws one.
      rowsInHeroRow: this.heroRowsDrawn,
      heroWant, heroFloor, towerWant, towerFloor, specialWant, specialFloor,
      granted: { hero: heroH!, towers: dealtH!, specials: wide ? dealtH! : specialH! },
      overflow: laid.overflow,
      // The band the content is clipped to, so the harness can tell a card
      // that is masked away from a card that is overlapping something.
      band: { top, height: available },
    }

    this.installScroll(laid.overflow, top, available)

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
  private buildButtons(by: number, buttonH: number): void {
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
    const reroll = plateButton(this, row.centres[0]!, by, row.width, buttonH,
      rerollLabel, () => this.reroll(), 22)
    const begin = plateButton(this, row.centres[1]!, by, row.width, buttonH,
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

  /** A section heading. Returns the y its content should start at.
   *
   *  `cx` is the centre it is written on, which is the screen's middle in the
   *  stacked arrangement and a column's middle when the screen has reflowed
   *  into two. */
  private heading(text: string, y: number, cx: number = W / 2): number {
    const t = this.add.text(cx, y, text, {
      fontFamily: FONT_UI, fontSize: '22px', color: COLOR.amber, letterSpacing: 3,
      stroke: '#0d1016', strokeThickness: 4,
    }).setOrigin(0.5, 0)
    this.target.add(t)
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
    // Centred horizontally, top-aligned vertically. See `Card.inner`: the
    // asymmetry is deliberate (a row of cards is laid out from its centre and
    // filled from its top) and it is the reason `inner` exists.
    const face = this.add.container(x + w / 2, y)
    const parts: Phaser.GameObjects.GameObject[] = [backing, ...plate, face]
    this.target.add(parts)
    const index = this.cards.length
    const c: Card = {
      parts,
      face,
      inner: { left: -w / 2, top: 0, width: w, height: h },
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
   * The HERO row: every hero on its own card, one tap, and the pick remembered.
   *
   * NOT A DEAL. It used to be one card showing whatever the draft handed you,
   * which was indistinguishable from a constant while there was one hero. With
   * five it is the decision this screen exists for, so every hero is on it,
   * the pick is a tap, and REROLL -- which redeals the towers and the specials
   * -- leaves it alone.
   *
   * IT WAS A STRIP OF TILES AND IT IS A ROW OF CARDS. The tiles were sized by
   * subtraction: the description took 42% of the panel and the portraits took
   * whatever was left. On a short screen "whatever was left" went negative,
   * and every one of the four faults playtesting reported came out of that one
   * number -- portraits drawn above the card and over the heading, portraits
   * at the 24px floor, names on top of them, and a selection ring stroking a
   * rectangle of negative height. `systems/HeroRow.ts` solves the row instead,
   * and this section is sized to what the row needs rather than to a share of
   * a budget.
   *
   * `cap` is a ceiling, not an allocation: the block takes what its content
   * needs and the caller gives the remainder to the two dealt rows.
   */
  /**
   * What the ONE-COLUMN arrangement needs when squeezed as hard as it goes.
   *
   * The input to the reflow decision, and it has to be measured rather than
   * guessed: every section's floor is a question about wrapped text at a given
   * width, which only a scene can answer. Solved at the stacked widths -- the
   * full content width, the description under the row -- because that is the
   * arrangement being asked about.
   *
   * The gaps are counted too. A floor that ignored them would say the stack
   * fits by exactly the room between its sections, which is the arithmetic
   * that goes wrong by a hair and reflows a screen that did not need it.
   */
  /**
   * What the two dealt rows need at their floor, stacked or side by side.
   *
   * Side by side they SHARE a band, so the pair costs the taller of the two
   * and one heading; stacked they cost the sum and two headings. Both are
   * measured at the card width that arrangement would actually use, which is
   * the whole point -- a narrower card is a taller card.
   */
  private dealtFloor(
    run: { openingTowers: string[]; abilities: string[] },
    cardW: number, small: number, sideBySide: boolean,
  ): number {
    const towers = this.towerNeeds(run.openingTowers, cardW, small)
    const specials = this.abilityNeeds(run.abilities, cardW, small)
    if (!sideBySide) return towers + specials
    // Each column lays ITS OWN cards across its half-band, so a column is one
    // card deep and the pair is as tall as the taller of the two. `cardW` is
    // already the half-band card -- see the caller.
    return Math.max(towers, specials)
  }

  /**
   * The widest ability label on the roster, rendered.
   *
   * Measured across EVERY hero rather than the selected one, so the chip
   * column is the same width whoever is highlighted and the block does not
   * change shape as the player moves along the row -- the same reason the chip
   * COUNT is the roster's longest list.
   */
  private widestAbilityLabel(roster: ReturnType<typeof heroList>): number {
    const size = LO.heroDescription.chipNameSize
    let w = 0
    for (const { def } of roster) {
      for (const a of def.abilities) {
        const probe = this.add.text(0, 0, a.name, {
          fontFamily: FONT_UI, fontSize: `${size}px`, fontStyle: 'bold',
        })
        w = Math.max(w, probe.width)
        probe.destroy()
      }
    }
    return Math.ceil(w)
  }

  private stackedFloor(
    run: { heroId: string; openingTowers: string[]; abilities: string[] },
    small: number,
  ): number {
    return this.heroPlan(run.heroId, 0, 'under').height
      + this.dealtFloor(run, this.cardWidthFor(2), small, false)
      + this.headingHeight() * 3 + LO.sectionGap * 2
  }

  /**
   * SOLVES the hero block for a given ceiling, and draws nothing.
   *
   * Split out of `heroSection` so the stack can ask what this block NEEDS
   * before deciding where anything goes. Every number the drawer uses comes
   * back from here, so the block that is measured and the block that is drawn
   * cannot be two different blocks.
   */
  private heroPlan(selectedId: string, cap: number, mode: HeroLayout = 'under'): {
    height: number; pad: number; padT: number
    row: ReturnType<typeof fitHeroRow>
    desc: ReturnType<typeof heroDescription>
    bodySize: number
    roster: ReturnType<typeof heroList>
    selected: ReturnType<typeof heroList>[number]
    /**
     * Where the blurb and the FIRST chip go, relative to the padded area's
     * top-left, and how big a chip's box is.
     *
     * ABSOLUTE, NOT AN OFFSET TO ADD TO `desc`. The first version handed back
     * a block origin for the drawer to add `desc.blurb.x` and `desc.chips[i].x`
     * to, and `chips-beside` -- where the chip column's own x inside `desc` is
     * already the whole width less the column -- added the same number twice
     * and drew the chips 428 units off the side of the panel. There is one
     * place that resolves a position now and it is here.
     */
    blurbAt: { x: number; y: number; width: number }
    chipsAt: { x: number; y: number; width: number; height: number; pitch: number }
  } {
    const w = this.contentWidth
    const frame = this.frameInsetFor(w, cap)
    // THE SIDE CLEARANCE, AND WHO PAYS FOR IT.
    //
    // Bare text reaches this block's left and right edges -- the blurb's first
    // character on one side, the longest ability label on the other -- and at
    // `cardPad`'s nine pixels both were drawn with the panel's painted rail
    // through them. "Mind Control" lost its last letter at 667x375 and the H
    // of "Holds the line" lost its stem at 1400x708. Exactly the defect the
    // chips had at the BOTTOM, on the other axis, and `cardPadBottom` is the
    // number that fixed that one.
    //
    // WHERE THE CLEARANCE IS TAKEN FROM DEPENDS ON THE ARRANGEMENT, because
    // the portrait row's slack does. Laid out UNDER the row, the row has the
    // whole block and five cards to spare, so the block simply pads wider and
    // everything inside it moves in together. Laid out BESIDE it, the row is
    // within a few units of wrapping to two lines -- widening the padding
    // there sent 667x375 back to the stacked arrangement and its overflow from
    // 73 to 153 -- so the block keeps `cardPad` and the DESCRIPTION shifts
    // inside it instead: the chip column left by `railR`, the blurb right by
    // `railL`, out of the gaps rather than out of the row.
    const wideSides = mode === 'under'
    const clearL = Math.max(LO.cardPadBottom, Math.ceil(frame.left))
    const clearR = Math.max(LO.cardPadBottom, Math.ceil(frame.right))
    const pad = wideSides ? clearL : Math.max(LO.cardPad, Math.ceil(frame.left))
    const padSideR = wideSides ? clearR : Math.max(LO.cardPad, Math.ceil(frame.right))
    const railR = wideSides ? 0 : Math.max(0, clearR - padSideR)
    const railL = wideSides ? 0 : Math.max(0, clearL - pad)
    const padT = Math.max(LO.cardPad, Math.ceil(frame.top))
    // THE BOTTOM IS `cardPadBottom` RATHER THAN `cardPad`, here and in
    // `cardGeometry` -- every panel on the screen keeps the same clearance.
    //
    // `frameInsetFor` is deliberately a FRACTION of the painted frame -- see
    // `LO.frameInsetShare` -- so content is allowed to sit partway into the
    // rail. That is right for the tower and special cards, whose last line is
    // text on a dark backing and never reaches it. It is wrong here now that
    // the last thing in the block is a 28px circular badge: at nine pixels of
    // clearance Courtland's third chip was drawn with the plate's bottom rail
    // running straight through it, and the picture showed it while every
    // number said the block fitted -- the audit's four faults are OFF, NOTCH,
    // SMALL and OVER, and none of them is "drawn on the frame".
    //
    // `cardPadBottom` was already in presentation.json and read by nothing at
    // all. It is what this needed.
    const padB = Math.max(LO.cardPadBottom, Math.ceil(frame.bottom))
    const innerW = w - pad - padSideR

    const roster = heroList()
    const selected = roster.find((h) => h.id === selectedId) ?? roster[0]!

    // MEASURED, not assumed: how tall a name renders is a font question and
    // this is the only place that can ask one. Every card gets the same
    // height, from the tallest label, so five cards are five equal cards.
    const nameSize = LO.bodySizes[LO.bodySizes.length - 1]!
    const nameHeight = Math.max(...roster.map((h) => {
      const probe = this.add.text(0, 0, h.def.name.toUpperCase(), {
        fontFamily: FONT_UI, fontSize: `${nameSize}px`, fontStyle: 'bold',
      })
      const t = probe.height
      probe.destroy()
      return t
    }))

    // THE ORDER HERE IS THE GUARANTEE, and the order is: measure what cannot
    // shrink, take it off the ceiling, and give what is left to the thing that
    // can. The row is the elastic part; the description is not — two ability
    // chips do not wrap, and a blurb at the bottom of the type ladder is as
    // small as the blurb gets.
    //
    // Nothing here is computed by subtracting one guess from another, which is
    // the arithmetic that went negative and threw the portraits over the
    // heading.
    const descCfg = LO.heroDescription
    // ONE LINE PER CHIP. Two lines each made the pair 124px tall at a generous
    // font lead — half the block, for two short strings — and squeezed the row
    // that the block exists to show. The state a reserved power is in goes in
    // the name's own string instead; see `heroBlurb`.
    const chipH = Math.max(descCfg.iconSize, this.probeHeight(descCfg.chipNameSize))
    // HOW MANY CHIPS IS THE ROSTER'S ANSWER, NOT TWO. Courtland has three
    // abilities and the other four have two, and this used to be the literal
    // 2 -- which would have laid the block out one chip short and drawn his
    // third over whatever was beneath it. The MAXIMUM rather than the selected
    // hero's own count, so the block is the same height whoever is highlighted
    // and the card does not jump as the player moves along the row.
    const chipCount = Math.max(...roster.map((h) => h.def.abilities.length))
    const chipsH = chipH * chipCount + descCfg.gap * (chipCount - 1)
    // BESIDE THE ROW, OR UNDER IT.
    //
    // Under is the arrangement this screen has always had, and it costs the
    // block the WHOLE height of the description on top of the whole height of
    // the portrait row. On a short viewport that is most of what there is --
    // and the horizontal budget is sitting unused, because the portraits do
    // not need the full width. Beside, the block is as tall as the taller of
    // the two rather than the sum, and the description simply gets a narrower
    // column: its blurb wraps to more lines and its chips are unchanged.
    // WHAT EACH COLUMN NEEDS, MEASURED, rather than a share of the block.
    //
    // A share is exactly the machinery this file threw out -- `rowShares` and
    // `heroSectionMaxShare` are gone and the tests keep them gone -- and it
    // fails here in both directions: 62% to the row squeezed "Mind Control"
    // out through the panel's rail, and 52% wrapped the five portraits onto
    // two lines, which made the block taller than leaving the description
    // under it.
    //
    // So the DESCRIPTION asks for what its content needs -- the widest ability
    // label plus its icon, and a blurb column that is not one word per line --
    // and the portrait row gets everything else. If what is left will not hold
    // five portraits on ONE line, laying them beside each other has bought
    // nothing and `heroSection` is told so; see `heroBeside`.
    const chipsNeed = descCfg.iconSize + descCfg.iconGap + this.widestAbilityLabel(roster)
    const descNeed = chipsNeed + descCfg.gap + LO.heroBlurbMinWidth
    // WHAT THE DESCRIPTION TAKES OUT OF THE ROW'S WIDTH, per arrangement.
    // `beside` moves the whole description up next to the portraits; the
    // narrower `chips-beside` moves only the chip column and leaves the blurb
    // underneath, where it has the block's full width and costs one line.
    const asideW = mode === 'beside' ? descNeed : mode === 'chips-beside' ? chipsNeed : 0
    const rowW = asideW > 0 ? Math.max(0, innerW - asideW - LO.columnGap) : innerW
    const descW = mode === 'beside' ? innerW - rowW - LO.columnGap : innerW
    // The blurb's column, which the ladder never changes: it is a fraction of
    // the width, so the smallest size gives the shortest possible block.
    const chipsWidth = mode === 'under' ? undefined : chipsNeed
    const blurbW = heroDescription(
      { width: descW, blurbHeight: 0, chipHeight: chipH, chips: chipCount, chipsWidth },
      descCfg,
    ).blurb.width
    const sizes = LO.bodySizes
    // MEASURED THE WAY IT IS DRAWN. `heroBlurb` tightens the wrap with
    // `wrapWithin` so the rendered line -- letterSpacing and all -- stays in
    // its column, and that tightening can cost a line. Measuring with the
    // plain wrap and drawing with the tightened one reserved one line less
    // than the blurb takes, and at 1400x708 the last line was drawn with the
    // hero panel's bottom rail through it.
    const blurbHeightAt = (size: number): number => {
      const w2 = Math.max(40, blurbW)
      const probe = this.wrapWithin(this.add.text(0, 0, selected.def.blurb, {
        fontFamily: FONT_UI, fontSize: `${size}px`, ...BODY_SPACING,
        wordWrap: { width: w2 },
      }), w2)
      const h = probe.height
      probe.destroy()
      return h
    }
    const descFloor = Math.max(chipsH, blurbHeightAt(sizes[sizes.length - 1]!))

    const rowCfg = LO.heroRow
    // BESIDE, THE ROW KEEPS THE WHOLE CEILING. Stacked it has to leave the
    // description's floor behind; side by side the two are independent and the
    // block is as tall as whichever is taller, so taking the description's
    // height off the row's ceiling would be reserving room twice.
    const row = fitHeroRow(
      { width: rowW, count: roster.length, nameHeight }, rowCfg,
      mode === 'beside'
        ? cap - padT - padB
        : cap - padT - padB - LO.sectionGap - (mode === 'chips-beside' ? 0 : descFloor),
    )

    // The blurb then takes the largest size on the ladder that still fits what
    // the row left behind. The smallest always fits, because the room was
    // reserved from it.
    const roomForText = mode === 'beside'
      ? cap - padT - padB
      : cap - padT - padB - row.height - LO.sectionGap
    let bodySize = sizes[sizes.length - 1]!
    let desc = heroDescription(
      { width: descW, blurbHeight: descFloor, chipHeight: chipH, chips: chipCount, chipsWidth },
      descCfg,
    )
    for (const size of sizes) {
      const next = heroDescription(
        { width: descW, blurbHeight: blurbHeightAt(size), chipHeight: chipH,
          chips: chipCount, chipsWidth }, descCfg,
      )
      bodySize = size
      desc = next
      if (next.height <= roomForText) break
    }

    // The chip column's own extent, which `chips-beside` needs separately
    // from the description block's: beside the row, the chips are as tall as
    // themselves rather than as tall as a block they share with the blurb.
    const chipsH2 = chipH * chipCount + descCfg.gap * (chipCount - 1)
    const blurbH = desc.blurb.height
    const height = mode === 'beside'
      ? padT + Math.max(row.height, desc.height) + padB
      : mode === 'chips-beside'
        ? padT + Math.max(row.height, chipsH2) + LO.sectionGap + blurbH + padB
        : padT + row.height + LO.sectionGap + desc.height + padB
    // Beside: to the right of the row, and top-aligned with it rather than
    // centred, so the first ability chip lines up with the top of the
    // portraits instead of floating in the middle of a taller block.
    // RESOLVED HERE, ONCE. `desc` places the blurb and the chip column inside
    // a block; these place that block inside the card, and the two are added
    // together now rather than by the drawer.
    const chipBox = desc.chips[0] ?? { x: 0, y: 0, width: 0, height: chipH }
    // SHIFTED LEFT BY THE RAIL, not narrowed by it. Narrowing the description
    // reflows the blurb onto another line, which makes the block taller and
    // costs the stack more than the clearance is worth -- 904x400 went from an
    // overflow of 0 to 16 that way. Moving it takes the clearance out of
    // `columnGap` instead, where there is room for it and nothing to reflow.
    //
    // Only the arrangements that put the chips beside the row need it: laid
    // out UNDER, the chip column is a 36% share of the block rather than a
    // measured fit, so the longest label still stops well short of its own
    // column's edge.
    const asideX = rowW + LO.columnGap - railR
    const blurbAt = mode === 'beside'
      ? { x: asideX + desc.blurb.x, y: desc.blurb.y, width: desc.blurb.width }
      : mode === 'chips-beside'
        ? { x: railL, y: Math.max(row.height, chipsH2) + LO.sectionGap,
            width: desc.blurb.width }
        : { x: desc.blurb.x + railL, y: row.height + LO.sectionGap + desc.blurb.y,
            width: desc.blurb.width }
    const chipsAt = mode === 'under'
      ? { x: chipBox.x, y: row.height + LO.sectionGap + chipBox.y,
          width: chipBox.width, height: chipBox.height, pitch: chipH + descCfg.gap }
      : mode === 'beside'
        ? { x: asideX + chipBox.x, y: chipBox.y,
            width: chipBox.width, height: chipBox.height, pitch: chipH + descCfg.gap }
        : { x: asideX, y: 0,
            width: chipsNeed, height: chipBox.height, pitch: chipH + descCfg.gap }
    return { height, pad, padT, row, desc, bodySize, roster, selected, blurbAt, chipsAt }
  }

  /**
   * The HERO row: every hero on its own card, the pick remembered, and the
   * chosen hero described under it.
   *
   * Draws the plan `heroPlan` solved. `height` is given rather than decided
   * here, because the stack has already reconciled it with everything else on
   * the screen.
   */
  private heroSection(
    selectedId: string, top: number, height: number, mode: HeroLayout = 'under',
  ): number {
    const w = this.contentWidth
    // SOLVED AT THE HEIGHT IT ACTUALLY GOT, and re-solved at the tightest
    // possible ceiling if that still wants more room than it was given.
    //
    // The floor was measured with `heroPlan(id, 0)` and the block is drawn
    // with `heroPlan(id, granted)` -- two different ceilings, so two different
    // splits between the portrait row and the description. When the stack
    // granted exactly the floor, the drawing solve came back wanting a taller
    // block than the card it was about to be drawn into, and the last line of
    // the blurb was cut off by the panel's own edge.
    let plan = this.heroPlan(selectedId, height, mode)
    if (plan.height > height) plan = this.heroPlan(selectedId, 0, mode)
    this.heroRowsDrawn = plan.row.rows
    const { pad, padT, row, bodySize, roster, selected, blurbAt, chipsAt } = plan
    const c = this.card(W / 2 - w / 2, top, w, Math.max(height, plan.height))
    // BOTH OFFSETS COME FROM THE CARD, not from w and h. `left` was derived
    // correctly and `rowTop` was derived as `-height / 2 + padT` -- right for a
    // centred anchor, and half the block too high for this one. That put the
    // five hero cards over the title, the subtitle and the HERO heading at
    // every viewport, which is the overlap playtesting kept reporting.
    const left = c.inner.left + pad
    const rowTop = c.inner.top + padT

    for (const [i, { id, def }] of roster.entries()) {
      c.face.add(this.heroCard(
        def, id, id === selected.id,
        { x: left + row.cards[i]!.x, y: rowTop + row.cards[i]!.y },
        row.cards[i]!, row.portraits[i]!, row.names[i]!,
      ))
    }

    c.face.add(this.heroBlurb(selected.def, left, rowTop, blurbAt, chipsAt, bodySize))
    return top + height
  }

  /**
   * Lets the content stack be dragged when it is taller than the room it has.
   *
   * ONLY WHEN IT OVERFLOWS. `overflow` is zero on every viewport measured so
   * far, so this installs nothing and the screen behaves exactly as it did;
   * it exists so that the failure mode of a stack that does not fit is
   * SCROLLING rather than sections drawing through each other, which is what
   * the shares used to do.
   *
   * The layer is dragged rather than a camera scrolled: the camera is the
   * fitted design box and moving it would move the title, the buttons and the
   * painted room with the cards.
   */
  private installScroll(overflow: number, top: number, available: number): void {
    this.scrollMax = Math.max(0, Math.ceil(overflow))
    this.scrollAt = 0
    if (this.scrollMax <= 0) return
    logEvent('loadout', `content overflows by ${this.scrollMax}px; the screen scrolls`)

    // Clipped to the band between the subtitle and the buttons, so a dragged
    // card never appears over either.
    const mask = this.add.graphics().setVisible(false)
    mask.fillStyle(0xffffff).fillRect(0, top, W, available)
    this.stack.setMask(mask.createGeometryMask())

    // AND IT SAYS SO. A card clipped in half by an invisible edge reads as a
    // broken screen, not as a screen with more on it -- the player has no
    // reason to try dragging something that looks like a rendering fault. A
    // soft fade along the bottom of the band is the affordance: content that
    // dissolves rather than content that is cut.
    // BANDS, NOT A GRADIENT. `fillGradientStyle` varies the COLOUR across a
    // shape and leaves the alpha alone, so a transparent-to-opaque fade drawn
    // that way renders as nothing at all -- which is what it did here. Six
    // strips of rising alpha is the same picture and always draws.
    const fadeH = LO.scrollFadeHeight
    const fade = this.add.graphics()
    const steps = 6
    for (let i = 0; i < steps; i++) {
      fade.fillStyle(0x10161d, ((i + 1) / steps) * LO.scrollFadeAlpha)
      fade.fillRect(0, top + available - fadeH + (i * fadeH) / steps, W, fadeH / steps + 1)
    }
    this.layer.add(fade)

    let from = 0
    let at = 0
    const move = (dy: number): void => {
      this.scrollAt = Phaser.Math.Clamp(this.scrollAt + dy, -this.scrollMax, 0)
      this.stack.y = this.scrollAt
    }
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { at = p.y; from = this.scrollAt })
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return
      const cam = this.cameras.main
      this.scrollAt = Phaser.Math.Clamp(from + (p.y - at) / cam.zoom, -this.scrollMax, 0)
      this.stack.y = this.scrollAt
    })
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      move(dy > 0 ? -LO.scrollStep : LO.scrollStep)
    })
  }

  /** How far the stack can be dragged, and where it currently is. Both zero
   *  when everything fits, which is every viewport measured so far. */
  private scrollMax = 0
  private scrollAt = 0

  /** How many lines the portrait row was drawn on. Recorded by `heroSection`
   *  for the harness, because only the drawer knows which of the two solves
   *  it ended up using. */
  private heroRowsDrawn = 1

  /** What the stack asked for and what it got. For the harness. */
  stackPlan?: {
    available: number; headingH: number; cardW: number
    /** Whether the screen reflowed into two columns, and what the one-column
     *  arrangement would have needed. Published so a harness run can say WHY
     *  a screen chose the shape it did rather than inferring it from a
     *  picture. */
    wide: boolean; heroLayout: HeroLayout; stackedFloor: number
    dealtStackedFloor: number; dealtColumnsFloor: number; colW: number
    contentWidth: number; rowsInHeroRow: number
    heroWant: number; heroFloor: number
    towerWant: number; towerFloor: number
    specialWant: number; specialFloor: number
    granted: { hero: number; towers: number; specials: number }
    overflow: number
    band: { top: number; height: number }
  }

  /** One rendered text height at a size, for the layout to add up. */
  private probeHeight(size: number): number {
    const probe = this.add.text(0, 0, 'Hg', { fontFamily: FONT_UI, fontSize: `${size}px` })
    const h = probe.height
    probe.destroy()
    return h
  }

  /**
   * Holds a wrapped paragraph inside the column it was measured for.
   *
   * PHASER'S WORD WRAP DOES NOT KNOW ABOUT `letterSpacing`. It breaks lines on
   * the font's own advance widths and the spacing is added afterwards, at
   * render — so a line wrapped to exactly `width` comes out `letterSpacing`
   * times its character count WIDER than the box the layout reserved for it.
   * Every body text on this screen carries `BODY_SPACING`, and the hero blurb
   * is the one with a neighbour: `heroDescription` leaves an 8px gutter
   * between the blurb column and the ability chips, and forty-odd characters
   * of spacing walks straight through it and into the icons.
   *
   * So the wrap width is CORRECTED against what was actually drawn, rather
   * than trusted. Two passes are enough — pulling the wrap in by the overshoot
   * moves at most one word to the next line — and the loop is bounded anyway,
   * because a text that cannot be made narrower must not become an infinite
   * one.
   */
  private wrapWithin(t: Phaser.GameObjects.Text, width: number): Phaser.GameObjects.Text {
    let wrap = width
    for (let pass = 0; pass < 3 && t.width > width; pass++) {
      wrap -= Math.ceil(t.width - width)
      if (wrap < 20) break
      t.setWordWrapWidth(wrap)
    }
    return t
  }

  /**
   * Holds a single unwrapped string inside its column, by shrinking it.
   *
   * The ability chip labels have no wrap and never should: "Mind Control"
   * broken over two lines is a different control from "Mind Control" on one,
   * and the chip's height is a fixed part of the block's arithmetic. What they
   * had instead was no bound at all — the label was drawn at whatever width
   * the string needed, out of a column that is a fixed 36% of the card, so a
   * longer name simply ran out through the panel's right rail.
   *
   * Scaled rather than re-sized: `setScale` on a Text is a transform and
   * leaves the glyph cache alone, which is the same thing the HUD's counters
   * do when a number outgrows its plate. The floor stops a very long name
   * becoming unreadable instead of overflowing — at which point the honest
   * answer is a shorter name, and the harness's containment check will still
   * pass while the picture says the name is too long.
   */
  private fitWithin(t: Phaser.GameObjects.Text, width: number): Phaser.GameObjects.Text {
    if (t.width > width) t.setScale(Math.max(0.7, width / t.width))
    return t
  }

  /**
   * One hero card: a plate, the character on it, and the name under them.
   *
   * THE CARD IS THE TARGET AND THE CARD IS THE HIGHLIGHT. The ring used to be
   * stroked around a strip whose height could be negative, which is why it
   * read as framing only the portrait. It is stroked around the card's own
   * rectangle now -- the same rectangle the hit area uses and the same one the
   * layout returned -- so the three cannot disagree.
   */
  private heroCard(
    hero: HeroDef, id: string, selected: boolean,
    at: { x: number; y: number },
    card: Rect, portrait: Rect, name: Rect,
  ): Phaser.GameObjects.Container {
    // Positioned at the card's top-left; everything inside is an offset from
    // the rectangles the layout handed down, so nothing is placed twice.
    const g = this.add.container(at.x, at.y)
    const dx = card.x
    const dy = card.y

    // A PLATE PER CARD, so a hero card carries the same visual weight as a
    // tower card. The strip it replaces drew nothing behind a tile at all,
    // which is most of why five portraits in a row read as a filmstrip rather
    // than as five things to choose between.
    const P = LO.heroCard
    const plate = this.add.graphics()
    plate.fillStyle(selected ? P.fillSelected : P.fill, P.fillAlpha)
    plate.fillRoundedRect(0, 0, card.width, card.height, P.radius)
    plate.lineStyle(P.edgeWidth, selected ? P.edgeSelected : P.edge, 1)
    plate.strokeRoundedRect(0.5, 0.5, card.width - 1, card.height - 1, P.radius)
    g.add(plate)

    const img = this.add.image(
      portrait.x - dx + portrait.width / 2,
      portrait.y - dy + portrait.height / 2,
      hero.portraitSprite,
    )
    fitInBox(img, hero.portraitSprite, portrait.width)

    // HELD INSIDE ITS OWN CARD. The name had no width bound -- no wrap, no
    // clamp -- so COURTLAND, the longest on the roster, ran out of its card
    // and into HAN's on any viewport where the row is tight. `heroRow` already
    // measures the box the name gets; this is what keeps the glyphs inside it.
    const label = this.fitWithin(this.add.text(
      name.x - dx + name.width / 2, name.y - dy, hero.name.toUpperCase(), {
        fontFamily: FONT_UI, fontSize: `${LO.bodySizes[LO.bodySizes.length - 1]!}px`,
        fontStyle: 'bold', color: selected ? COLOR.amber : COLOR.ink, align: 'center',
      }).setOrigin(0.5, 0), name.width)
    g.add([img, label])

    if (selected) {
      const ring = this.add.graphics()
      ring.lineStyle(LO.heroCard.ringWidth, LO.heroCard.edgeSelected, 1)
        .strokeRoundedRect(0, 0, card.width, card.height, LO.heroCard.radius)
      // A CORNER BADGE, ON THE ARTWORK ON PURPOSE, and it says so -- the same
      // declaration the tower cards' price carries. See `setData('overlaps')`
      // there: the harness's containment check flags two things drawn on a
      // card that run into each other, and a tick in the corner of the card it
      // is ticking is a decision rather than a collision.
      const tick = this.add.text(card.width - 4, 2, '\u2713', {
        fontFamily: FONT_UI, fontSize: `${LO.bodySizes[LO.bodySizes.length - 1]!}px`,
        fontStyle: 'bold', color: COLOR.amber,
      }).setOrigin(1, 0).setData('overlaps', true)
      g.add([ring, tick])
    } else {
      g.setAlpha(0.72)
    }

    const hit = this.add.rectangle(card.width / 2, card.height / 2,
      card.width, card.height, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true })
    hit.on('pointerdown', () => this.pickHero(id))
    g.add(hit)
    return g
  }


  /**
   * The description block: the blurb, and the hero's two buttons beside it.
   *
   * It was three lines at the top of a box that was mostly empty. The space is
   * used now -- both ability icons with their names, which is the thing a
   * player actually chooses between once they have looked at the pictures.
   */
  private heroBlurb(
    hero: HeroDef, left: number, top: number,
    blurbAt: { x: number; y: number; width: number },
    chipsAt: { x: number; y: number; width: number; height: number; pitch: number },
    size: number,
  ): Phaser.GameObjects.GameObject[] {
    const D = LO.heroDescription
    const out: Phaser.GameObjects.GameObject[] = []
    // HELD INSIDE ITS OWN COLUMN. `heroDescription` leaves a gutter between
    // the blurb and the chips, and `letterSpacing` is not counted by Phaser's
    // word wrap -- so the drawn line was wider than the column it was measured
    // for and ran into the ability icons. See `wrapWithin`.
    out.push(this.wrapWithin(this.add.text(
      left + blurbAt.x, top + blurbAt.y, hero.blurb, {
        fontFamily: FONT_UI, fontSize: `${size}px`, color: COLOR.dim, ...BODY_SPACING,
        wordWrap: { width: blurbAt.width },
      }).setOrigin(0, 0), blurbAt.width))

    // EVERY ABILITY THIS HERO HAS. It was `[hero.slot1, hero.slot2]`, a pair,
    // which is one chip short for Courtland. `desc.chips` is laid out for the
    // roster's longest list, so a hero with fewer simply leaves the last box
    // empty rather than the block resizing under the row.
    for (const [i, slot] of hero.abilities.entries()) {
      const box = { width: chipsAt.width, height: chipsAt.height }
      const x = left + chipsAt.x
      const y = top + chipsAt.y + i * chipsAt.pitch
      // A SLOT THAT IS RESERVED SAYS SO. Cory's second button read "Loophole"
      // for a whole build -- a name from a tower branch, on an ability that
      // does not exist yet. The name is the real one now and the STATE is
      // beside it, so an unimplemented power reads as coming rather than as
      // broken.
      const ready = slot.effect !== null
      if (this.textures.exists(slot.icon)) {
        const icon = this.add.image(x + D.iconSize / 2, y + box.height / 2, slot.icon)
        fitInBox(icon, slot.icon, D.iconSize)
        if (!ready) icon.setAlpha(0.5)
        out.push(icon)
      }
      // AND THE LABEL IS HELD INSIDE THE CHIP COLUMN. It had no width bound
      // at all -- no wrap, no clamp -- so a name longer than the column's
      // 36% share was drawn straight out through the panel's right rail.
      const tx = x + D.iconSize + D.iconGap
      const labelW = Math.max(20, box.width - D.iconSize - D.iconGap)
      out.push(this.fitWithin(this.add.text(
        tx, y + (box.height - this.probeHeight(D.chipNameSize)) / 2,
        ready ? slot.name : `${slot.name} (soon)`, {
          fontFamily: FONT_UI, fontSize: `${D.chipNameSize}px`, fontStyle: 'bold',
          color: ready ? COLOR.good : COLOR.dim,
        }).setOrigin(0, 0), labelW))
    }
    return out
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
  /**
   * A card's inner geometry: where the text column starts, how wide it is, and
   * how much vertical room the content has.
   *
   * SHARED BY THE MEASURER AND THE DRAWER, and that is the whole point. The
   * height a row needs and the height a face draws into have to be answers to
   * the same arithmetic, or the row is sized against one layout and filled
   * with another -- which is how a card's last line ended up under the heading
   * of the section below it.
   *
   * Padded against the painted frame, not the box -- but only against the part
   * of it that is a rail. The nine-slice's corner bracket reaches 144px into
   * the source art, and padding by all of it threw away a tenth of a small
   * card on each side.
   */
  private cardGeometry(cw: number, ch: number): {
    pad: number; padR: number; padT: number; padB: number
    col: number; tx: number; tw: number; room: number
  } {
    const frame = this.frameInsetFor(cw, ch)
    const pad = Math.max(LO.cardPad, Math.ceil(frame.left))
    const padR = Math.max(LO.cardPad, Math.ceil(frame.right))
    const padT = Math.max(LO.cardPad, Math.ceil(frame.top))
    // THE SAME BOTTOM CLEARANCE EVERY PANEL ON THIS SCREEN KEEPS.
    //
    // This was `cardPad`, nine pixels, and the tower card's price badge and
    // its last line were both drawn with the plate's painted rail running
    // through them -- the identical defect the hero block's ability chips had,
    // on a different card, found the same way: by looking at the picture.
    // `frameInsetFor` is deliberately only a FRACTION of the painted frame, so
    // nine pixels is inside the paint rather than clear of it.
    //
    // One number for every panel is also what makes the harness's containment
    // check honest: it asserts that each card keeps the clearance the screen
    // DECLARES, and a number read by one drawer out of two is a rule with an
    // exception nobody can see.
    const padB = Math.max(LO.cardPadBottom, Math.ceil(frame.bottom))
    // The icon column scales with the card rather than being a fixed 62px on
    // every screen. On a wide viewport that left the art small in a column
    // with room to spare; on a narrow one a fixed wide column would eat the
    // text. Bounded at both ends so it can do neither.
    const col = Math.round(Math.max(LO.cardIconColumnMin,
      Math.min(LO.cardIconColumnMax, cw * LO.cardIconColumnShare)))
    return {
      pad, padR, padT, padB, col,
      tx: -cw / 2 + pad + col,
      tw: cw - pad - col - padR,
      room: ch - padT - padB,
    }
  }

  /**
   * The height this card needs to hold its content at the LARGEST size on the
   * ladder -- which is what the row asks for before anything squeezes it.
   *
   * Measured off the same probes `cardFace` uses and the same geometry, so a
   * row sized by this and filled by that agree. The icon column counts too: a
   * card shorter than its own icon is a card with art hanging out of it.
   */
  private cardNeeds(
    cw: number, name: string, cost: string | null, stats: string | null, body: string,
    size: number = LO.bodySizes[0]!,
  ): number {
    // A nominal height for the frame inset, which barely varies with it; the
    // answer is re-derived from the real height when the card is drawn.
    const g = this.cardGeometry(cw, LO.cardProbeHeight)
    const tw = Math.max(20, g.tw)
    // WRAPPED THE WAY THE CARD DRAWS IT, which is `wrapWithin` and not a bare
    // `wordWrap`: Phaser wraps on the unspaced advance and BODY_SPACING widens
    // the rendered line afterwards, so a line wrapped at `tw` renders wider
    // than `tw`. Measuring with the plain wrap and drawing with the tightened
    // one made the measured height a line short on a narrow card.
    const probe = (text: string, extra: object = {}): number => {
      const t = this.wrapWithin(this.add.text(0, 0, text, {
        fontFamily: FONT_UI, fontSize: `${size}px`, wordWrap: { width: tw }, ...extra,
      }), tw)
      const h = t.height
      t.destroy()
      return h
    }
    const textH = probe(name.toUpperCase(), { fontStyle: 'bold' })
      + 4 + (stats === null ? 0 : probe(stats) + 3)
      + probe(body, BODY_SPACING)
    // THE TEXT DECIDES THE HEIGHT, NOT THE ICON. The icon is a square of the
    // column's width, and the column is a SHARE of the card's width -- so on a
    // wide screen a card 338 units across wanted a 118-unit icon and therefore
    // a 181-unit card, for eleven words of text. That is the icon dictating
    // the layout of the screen. It is clamped to whatever room the card ends
    // up with instead (see `cardFace`), so it never asks for height here.
    void cost
    return Math.ceil(g.padT + textH + g.padB)
  }

  private cardFace(
    cw: number,
    ch: number,
    icon: (cx: number, cy: number, box: number) => Phaser.GameObjects.GameObject[],
    name: string,
    cost: string | null,
    stats: string | null,
    body: string,
  ): { parts: Phaser.GameObjects.GameObject[] } {
    const { pad, padT, col, tx, tw, room } = this.cardGeometry(cw, ch)

    // ONE size for the whole card, chosen so the name, the stats and the body
    // all fit together. Fitting only the body was not enough: on a narrow
    // phone the stats line wraps to three lines on its own and there is
    // nothing left for the description, so the body overflowed by 43px at a
    // size the ladder thought was fine.
    let built: { name: Phaser.GameObjects.Text; stats: Phaser.GameObjects.Text | null;
      body: Phaser.GameObjects.Text; total: number } | null = null
    for (const size of LO.bodySizes) {
      built?.name.destroy(); built?.stats?.destroy(); built?.body.destroy()
      // `wrapWithin`, NOT a bare `wordWrap`. Phaser wraps on the unspaced
      // advance, so a line wrapped at `tw` renders wider than `tw` by roughly
      // one letterSpacing per character -- and on a full-width card that is a
      // few pixels into the padding, while on a 184-unit card in a two-column
      // arrangement it is the tower's last line printed out through the card's
      // right rail and into the card beside it. Same bug at every width; only
      // the narrow card made it visible.
      const n = this.wrapWithin(this.add.text(tx, 0, name.toUpperCase(), {
        fontFamily: FONT_UI, fontSize: `${size}px`, color: COLOR.ink, fontStyle: 'bold',
        wordWrap: { width: tw },
      }).setOrigin(0, 0), tw)
      const st = stats === null ? null : this.wrapWithin(this.add.text(tx, 0, stats, {
        fontFamily: FONT_UI, fontSize: `${size}px`, color: COLOR.ink,
        wordWrap: { width: tw },
      }).setOrigin(0, 0), tw)
      const bd = this.wrapWithin(this.add.text(tx, 0, body, {
        fontFamily: FONT_UI, fontSize: `${size}px`, color: COLOR.dim, ...BODY_SPACING,
        wordWrap: { width: tw },
      }).setOrigin(0, 0), tw)
      const total = n.height + 4 + (st ? st.height + 3 : 0) + bd.height
      built = { name: n, stats: st, body: bd, total }
      if (total <= room) break
    }
    const b = built as NonNullable<typeof built>

    // THE LADDER CAN RUN OUT, and when it did the card kept the smallest size
    // and simply overflowed: the tower cards' last line ran out under the
    // SPECIALS heading and the specials' cooldown line was cut off by the
    // bottom of the screen. The blurb is the elastic part, so it is clipped to
    // the lines that actually fit rather than allowed to spill onto whatever
    // is drawn next.
    if (b.total > room) {
      const fixed = b.name.height + 4 + (b.stats ? b.stats.height + 3 : 0)
      const line = b.body.height / Math.max(1, b.body.getWrappedText().length)
      const lines = Math.max(1, Math.floor((room - fixed) / Math.max(1, line)))
      b.body.setStyle({ maxLines: lines })
      b.total = fixed + b.body.height
    }

    // Laid out from the top of the padded area, centred if there is slack.
    let ty = padT + Math.max(0, (room - b.total) / 2)
    b.name.setY(ty); ty += b.name.height + 4
    if (b.stats) { b.stats.setY(ty); ty += b.stats.height + 3 }
    b.body.setY(ty)

    // THE ICON COLUMN IS SOLVED, NOT STACKED. The icon took the full column and
    // the price hung off its bottom edge at a fixed offset, so on a short card
    // the badge was drawn below the card entirely; clamping it back inside
    // then put it on top of the artwork. Both are the same mistake -- two
    // things sharing a column with only one of them measured.
    //
    // So the price is measured first, the icon gets what is left, and the pair
    // is centred in the padded area together.
    // The icon keeps the whole column -- these are the only pictures on the
    // screen and shrinking them to make room for a three-character price is a
    // bad trade. The price is a TAG ON THE CORNER, sitting on the bottom of
    // the icon the way a price tag does, and anchored to the padded area's own
    // bottom edge so it is inside the card at every card height.
    //
    // It used to hang off the icon's bottom at a fixed offset instead, which
    // on a short card drew it below the card entirely and put it on the
    // SPECIALS heading underneath.
    const iconCx = -cw / 2 + pad + col / 2
    // CLAMPED TO THE ROOM. The box was `col - 8` outright, so on a card
    // shorter than its own icon column the art was drawn taller than the card
    // and hung out of the bottom of it.
    const box = Math.max(12, Math.min(col - 8, room - (cost === null ? 0 : 26)))
    const iconCy = padT + room / 2
    // THE PRICE SITS ON THE ARTWORK ON PURPOSE, and it says so.
    //
    // `setData('overlaps', true)` is read by the harness's containment check,
    // which flags any two things drawn on a card that run into each other --
    // the rule that catches a paragraph walking into an ability icon. A price
    // tag lying across the bottom of the picture it is the price of is the one
    // deliberate overlap on this screen, and the honest place to record that
    // is here, beside the decision, rather than as a tower-shaped exception
    // inside the harness.
    const costText = cost === null ? null : this.add.text(
      iconCx, padT + room, cost, {
        fontFamily: FONT_UI, fontSize: '22px', color: COLOR.amber, fontStyle: 'bold',
        stroke: '#0d1016', strokeThickness: 5,
      },
    ).setOrigin(0.5, 1).setData('overlaps', true)

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
  /** What one tower card needs to hold its content. */
  private towerNeeds(ids: string[], cw: number, size?: number): number {
    return Math.max(...ids.map((id) => {
      const def = TOWERS[id]!
      return this.cardNeeds(cw, def.name, `${def.cost}`, towerStats(def), towerLine(def), size)
    }))
  }

  private towerSection(
    ids: string[], top: number, height: number,
    band?: { cx: number; width: number },
  ): number {
    return this.cardRow(ids, top, height, (id, cw, ch) => {
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
    }, band)
  }

  /** What one special card needs to hold its content. */
  private abilityNeeds(ids: string[], cw: number, size?: number): number {
    return Math.max(...ids.map((id) => {
      const def = ABILITIES[id]!
      return this.cardNeeds(cw, def.name, null, null, abilityLine(def), size)
    }))
  }

  private abilitySection(
    ids: string[], top: number, height: number,
    band?: { cx: number; width: number },
  ): number {
    return this.cardRow(ids, top, height, (id, cw, ch) => {
      const def = ABILITIES[id]!
      return this.cardFace(
        cw, ch,
        (cx, cy, box) => [this.boxedIcon(def.icon, cx, cy, box)],
        def.name, null, null, abilityLine(def),
      )
    }, band)
  }

  /**
   * A row of equal cards, at the height the screen can spare.
   *
   * The height is GIVEN. It used to be measured from the tallest card, which
   * is how the row grew until the buttons left the screen; now the row is told
   * what it has and each face fits itself into it.
   */
  /** The width one card gets in a row of `n`. The measurers need it before a
   *  single card exists. */
  private cardWidthFor(n: number, width: number = this.contentWidth): number {
    return Math.floor((width - CARD_GAP * (Math.max(1, n) - 1)) / Math.max(1, n))
  }

  /**
   * A row of cards inside a horizontal band.
   *
   * `band` is the width and centre the row is laid out in. It was always the
   * full content width centred on the screen; it is a parameter now because
   * the wide arrangement puts the towers in the left half and the specials in
   * the right, and a row that could only ever centre itself on `W / 2` cannot
   * be half of a screen.
   */
  private cardRow(
    ids: string[],
    y: number,
    height: number,
    build: (id: string, cw: number, ch: number) => { parts: Phaser.GameObjects.GameObject[] },
    band: { cx: number; width: number } = { cx: W / 2, width: this.contentWidth },
  ): number {
    const n = Math.max(1, ids.length)
    const cw = this.cardWidthFor(n, band.width)
    const total = n * cw + (n - 1) * CARD_GAP

    ids.forEach((id, i) => {
      const x = band.cx - total / 2 + i * (cw + CARD_GAP)
      const c = this.card(x, y, cw, height)
      c.face.add(build(id, cw, height).parts)
    })
    return y + height
  }
}


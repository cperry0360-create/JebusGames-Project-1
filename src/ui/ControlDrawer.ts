import Phaser from 'phaser'
import presentationData from '../data/presentation.json'
import { COLOR, FONT_UI, uiSize } from './Theme.ts'
import { fitInBox } from '../systems/Art.ts'
import { pointerToScreen } from '../systems/Resolution.ts'
import { dockedSlab } from './EdgeDock.ts'
import {
  type DrawerConfig, type DrawerLayout, drawerLayout, inRect, scrollToShow,
  tabLabelFits, tileVisible,
} from '../systems/DrawerLayout.ts'
import { ART } from '../systems/Art.ts'
import type { Rect } from '../systems/HudLayout.ts'

const CFG = presentationData.drawer as unknown as DrawerConfig & {
  tileRadius: number
  iconFraction: number
  priceSize: number
  lockSize: number
  lockFill: number
  lockEdge: number
  dragSlop: number
  scrollbarWidth: number
  scrollbarFill: number
  dimAlpha: number
  slab: number
  tileFill: number
  tileFillSelected: number
  outline: number
  outlineWidth: number
  chevron: number
  selectedEdge: number
  tabLabelSize: number
  tabFillActive: number
  tabFillIdle: number
  tabLabelActive: number
  tabLabelIdle: number
  headerSize: number
  headerIcon: number
  detailNameSize: number
  detailStatSize: number
  detailTraitSize: number
  detailLabelColor: number
}

/** How long a trait phrase may be. Longer than this and it would wrap, and a
 *  strip this short has no second line to wrap onto. */
const TRAIT_MAX = 18

/** What the pinned strip says about one tower. Supplied by the scene, so the
 *  drawer never reads tower data and the strip and the ledger card cannot
 *  disagree about what a tower's dps is. */
export interface DrawerDetail {
  name: string
  sprite: string
  /** Two or three of them: a support tower has no rate. */
  stats: Array<{ label: string; value: string }>
  trait: string
}

/**
 * The control drawer: a tab on the right edge that expands a panel of tiles.
 *
 * OPT-IN AND TEMPORARY. It sits behind the `controlDrawer` save flag beside
 * the build ring so the two can be compared on the same device minutes apart,
 * on the same board, with the same peanuts. When that comparison is settled,
 * one of the two is deleted and this file may well be the one.
 *
 * FIRST SLICE: the six active units and nothing else. No passives, no
 * consumables, no upgrade screen — those depend on this working and are
 * separate items.
 *
 * A tile carries ARTWORK AND A PRICE. No name, no rule line, no stat row: the
 * ledger card already answers "what does this do?", and a grid of six things
 * answers "which one?" faster with pictures than with prose.
 *
 * The look is the painted board's, not a web panel's: flat colour, thick dark
 * outlines, chunky rounded forms. No bevelled metal, no cyan edge, no gradient
 * chrome, no translucent hairline.
 */

export interface DrawerTile {
  id: string
  /** The tower sprite. Drawn as-is, so the grid reads as the board does. */
  sprite: string
  price: number
  affordable: boolean
  locked: boolean
}

export interface ControlDrawerOptions {
  /** Where the drawer may live: the HUD's panelArea, already clear of every
   *  other piece of chrome. Re-read on every layout so a rotate lands. */
  area: () => Rect
  viewW: () => number
  /** The screen edge to dock against: viewport width less the right inset.
   *  Not the usable area's edge — see `drawerLayout`'s `dockRight`. */
  dockRight: () => number
  /**
   * The camera that DRAWS the drawer, for converting a pointer into the
   * space its rectangles are written in.
   *
   * Handed in rather than assumed. `scene.cameras.main` is the WORLD camera —
   * it pans and zooms — and converting through it returned a point on the map
   * for a rectangle laid out in CSS pixels, so every press missed. The probe
   * found the hit object correctly and the handler then looked in the wrong
   * place, which is the sixth appearance of this one confusion and the first
   * where the target was right and the SPACE was wrong.
   */
  camera: () => Phaser.Cameras.Scene2D.Camera
  tiles: () => DrawerTile[]
  /** The wallet, for the header. The player is spending the whole time this is
   *  open, so the number belongs where the prices are. */
  peanuts: () => number
  /** What the selected tile is, for the pinned strip. Null when nothing is
   *  selected, which draws an empty strip rather than removing it. */
  detailFor: (id: string) => DrawerDetail | null
  /** A tile was picked, or unpicked. The scene turns this into pulsing nodes. */
  onSelect: (id: string | null) => void
}

export class ControlDrawer {
  readonly layer: Phaser.GameObjects.Container
  private readonly scene: Phaser.Scene
  private readonly opts: ControlDrawerOptions
  private readonly tabG: Phaser.GameObjects.Graphics
  private readonly panelG: Phaser.GameObjects.Graphics
  private readonly gridLayer: Phaser.GameObjects.Container
  private readonly maskG: Phaser.GameObjects.Graphics
  /** The scroll hint, on its own layer ABOVE the grid. Drawn on `panelG` it
   *  was underneath the tiles, which cover the grid's right edge entirely. */
  private readonly scrollG: Phaser.GameObjects.Graphics
  /** The header, the tab bar and the detail strip: everything in the panel
   *  that is NOT the scrolling grid, and so is not under the grid's mask. */
  private readonly chromeG: Phaser.GameObjects.Graphics
  private readonly chromeLayer: Phaser.GameObjects.Container
  private readonly hit: Phaser.GameObjects.Rectangle
  /** Public so the harness can measure every rectangle rather than infer it
   *  from a screenshot. */
  layout: DrawerLayout
  /** Public so the harness can name a tile without re-deriving the list the
   *  drawer is actually showing. */
  tiles: DrawerTile[] = []
  /** Where the tap targets are, in CSS pixels, for the scene and the probe.
   *  ONE list: the picture and the target come from the same rectangles. */
  tileRects: Rect[] = []

  /**
   * What the drawer decided about each tab label, for the probe.
   *
   * Exposed rather than re-derived. The first version of the probe measured
   * the labels itself, in `KenneyFuture` — which is the DISPLAY face and not
   * what this draws in — and reported that "TOWERS" needs 54px when the face
   * it actually renders in needs rather less. A probe that re-derives a
   * decision is a probe that can disagree with the thing it is checking.
   */
  get tabLabelReport(): Array<{ label: string; width: number; tabWidth: number; fits: boolean }> {
    return (CFG.tabLabels ?? []).map((label, i) => {
      const tabWidth = this.layout.tabs[i]?.width ?? 0
      const width = this.labelWidth(label)
      return { label, width, tabWidth, fits: tabLabelFits(width, tabWidth) }
    })
  }

  /** The hit rectangle's current box, for the probe: a target that is drawn
   *  correctly and hit-tested elsewhere is the failure worth naming. */
  get hitBox(): Rect {
    return { x: this.hit.x, y: this.hit.y, width: this.hit.width, height: this.hit.height }
  }

  open = false
  scroll = 0
  selected: string | null = null
  /** True while the flag is on. A drawer that is off draws and hits nothing. */
  enabled = false
  /** Set by `press`, consumed by `claimsPress`. See `claimsPress`. */
  private tookPress = false
  /** Which tab is showing. Only TOWERS is populated, so this is 0 and stays
   *  0 until the other two groups exist — but the bar, the hit-testing and
   *  the layout are all indexed by it already. */
  activeTab = 0
  /** Rendered label widths, measured once. See `labelWidth`. */
  private readonly labelWidths = new Map<string, number>()
  /** Where the finger went down, and where it was last seen, in CSS pixels.
   *  Null when no press is in flight. */
  private dragFrom: number | null = null
  private dragLast = 0
  /** True once the finger has travelled past `dragSlop`: this gesture is a
   *  scroll, and its release must not pick anything. */
  private dragged = false
  /** The tile the finger went down on, picked on release if it never became
   *  a drag. */
  private downOn: number | null = null

  constructor(scene: Phaser.Scene, depth: number, opts: ControlDrawerOptions) {
    this.scene = scene
    this.opts = opts
    this.layer = scene.add.container(0, 0).setDepth(depth)
    this.panelG = scene.add.graphics()
    this.gridLayer = scene.add.container(0, 0)
    this.maskG = scene.add.graphics().setVisible(false)
    this.scrollG = scene.add.graphics()
    this.chromeG = scene.add.graphics()
    this.chromeLayer = scene.add.container(0, 0)
    this.tabG = scene.add.graphics()
    // ONE interactive rectangle over the whole drawer, and the tap is resolved
    // against the laid-out boxes inside it. Six interactive tiles plus a tab
    // would be seven objects whose positions have to be kept in step with the
    // seven rectangles the layout already computed — and the two drifting
    // apart is exactly the bug class this codebase keeps hitting.
    this.hit = scene.add.rectangle(0, 0, 10, 10, 0xffffff, 0.001)
      .setOrigin(0, 0).setInteractive()
    this.hit.name = 'drawer:hit'
    this.hit.on('pointerdown', (p: Phaser.Input.Pointer) => this.press(p))
    this.hit.on('pointermove', (p: Phaser.Input.Pointer) => this.drag(p))
    this.hit.on('pointerup', (p: Phaser.Input.Pointer) => this.release(p))
    // A finger that leaves the drawer mid-drag ends the gesture rather than
    // picking whatever it started on when it comes back.
    this.hit.on('pointerout', () => { this.dragFrom = null; this.downOn = null })
    this.layer.add([this.panelG, this.gridLayer, this.scrollG,
      this.chromeG, this.chromeLayer, this.tabG, this.hit])
    this.gridLayer.setMask(this.maskG.createGeometryMask())
    this.layout = drawerLayout(opts.viewW(), opts.area(), 0, 0, CFG, false, opts.dockRight())
    this.refresh()
  }

  /** Every object the camera split has to be told about. */
  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.layer, this.maskG]
  }

  /** True when a press at this point lands on the drawer AS IT IS NOW. */
  owns(x: number, y: number): boolean {
    if (!this.enabled) return false
    return inRect(this.layout.tab, x, y)
      || (this.open && inRect(this.layout.panel, x, y))
  }

  /**
   * Whether the press the scene is currently processing belonged to the
   * drawer. This, not `owns`, is what the board must ask.
   *
   * THE DRAWER ACTS ON A PRESS BEFORE THE SCENE ASKS ABOUT IT. A game
   * object's own `pointerdown` runs before the scene-level one, and picking a
   * tile collapses the panel — so by the time the board asks `owns`, the
   * rectangle the tap landed in is gone and the answer is false. The board
   * then scored a tap on a tile as a tap on bare ground and cancelled the
   * pick it had just made, in the same tap: the drawer selected a tower and
   * unselected it in 4ms, and the probe reported "the scene did not learn the
   * pick".
   *
   * Reading CONSUMES the record, so the flag can never outlive one press even
   * if the matching pointerup never arrives.
   */
  claimsPress(x: number, y: number): boolean {
    const took = this.tookPress
    this.tookPress = false
    return took || this.owns(x, y)
  }

  /**
   * The same answer, WITHOUT consuming the record.
   *
   * The camera rig has to ask the same question and it asks first: it listens
   * at the scene level and Phaser delivers scene-level handlers in the order
   * they were registered, which puts the rig ahead of the board. If the rig
   * asked `claimsPress` it would eat the record and the board — the thing the
   * record exists for — would then be told the press was not the drawer's.
   *
   * So there are two readers and exactly one of them consumes. Ownership is
   * still recorded in ONE place, `press`, which is the property that matters.
   */
  ownsPress(x: number, y: number): boolean {
    return this.tookPress || this.owns(x, y)
  }

  setEnabled(on: boolean): void {
    if (this.enabled === on) return
    this.enabled = on
    if (!on) { this.open = false; this.select(null) }
    this.refresh()
  }

  /** Opens or closes the panel. The tab stays either way. Closing cancels
   *  the pick — see `setOpen`. */
  toggle(): void {
    this.setOpen(!this.open)
  }

  /** Collapses to the tab, cancelling the pick with it. */
  collapse(): void {
    this.setOpen(false)
  }

  /**
   * CLOSING THE DRAWER CANCELS WHATEVER IS PICKED.
   *
   * The pulsing rings on the board and the CANCEL button are this drawer's
   * selection, shown somewhere else. A shut drawer with a live selection is a
   * mode with no visible handle on it: the board is telling the player it is
   * waiting for a tap and the thing that put it there is gone.
   *
   * This is also why a pick no longer collapses the panel. It used to, so the
   * board would be clear for the tap that follows — but a collapse IS a close,
   * and a close that keeps the selection is precisely the orphaned state
   * above. The panel stays out while a tile is picked. It holds the right-hand
   * 118 to 152 pixels and the board pans under it, which is the price of the
   * selection being visible in the same place it was made.
   *
   * PUBLIC, and deliberately not a toggle. Tapping an empty node opens the
   * drawer to ask which tower goes there, and a second node tapped while the
   * panel is already out must move the selection rather than shut the panel —
   * so the scene asks for `setOpen(true)`, which is a no-op when it already
   * is, and never for `toggle()`.
   */
  setOpen(next: boolean): void {
    if (this.open === next) return
    this.open = next
    if (!next) this.select(null)
    this.refresh()
  }

  select(id: string | null): void {
    if (this.selected === id) return
    this.selected = id
    this.opts.onSelect(id)
    this.refresh()
  }

  /** Scrolls so tile `index` is fully in view. Used by a drag, and by the
   *  probe, which has to reach every tile to claim every tile is reachable. */
  scrollToTile(index: number): void {
    this.scroll = scrollToShow(index, this.scroll, CFG, this.layout.grid, this.tiles.length)
    this.refresh()
  }

  scrollBy(dy: number): void {
    this.scroll = Math.max(0, Math.min(this.layout.maxScroll, this.scroll + dy))
    this.refresh()
  }

  /**
   * A press, resolved against the laid-out boxes.
   *
   * `pointerToScreen` rather than `p.x`: pointer coordinates are CANVAS
   * pixels and every rectangle here is in CSS pixels.
   *
   * And through the UI CAMERA, not `scene.cameras.main`. The main camera on
   * GameScene is the world camera; converting through it gives a point on the
   * map, and the drawer's rectangles are screen furniture. The first run of
   * the drawer probe found the hit object perfectly and then compared it
   * against a pointer 1,400 world pixels away.
   */
  private press(p: Phaser.Input.Pointer): void {
    if (!this.enabled) return
    const { x, y } = pointerToScreen(this.scene, p, this.opts.camera())
    // Recorded BEFORE anything moves, because what happens next moves it.
    this.tookPress = this.owns(x, y)
    if (inRect(this.layout.tab, x, y)) { this.toggle(); return }
    if (!this.open) return

    // The tab bar takes its own presses and starts no drag. Only TOWERS is
    // populated, so every tab is either already active or disabled and none
    // of them does anything yet — but the press has to STOP here rather than
    // fall through to the grid, or a tap on PASSIVE would begin a scroll.
    if (inRect(this.layout.tabBar, x, y)) return
    // Same for the pinned strip: it is a readout, not a control.
    if (inRect(this.layout.detail, x, y)) return
    if (inRect(this.layout.header, x, y)) return

    // A drag only ever starts inside the grid, which is the only thing that
    // scrolls.
    if (!inRect(this.layout.grid, x, y)) return
    this.dragFrom = y
    this.dragLast = y
    this.dragged = false
    this.downOn = null
    for (const [i, r] of this.tileRects.entries()) {
      if (!inRect(r, x, y)) continue
      if (!tileVisible(r, this.layout.grid, 0.5)) continue
      this.downOn = i
      return
    }
  }

  /**
   * A finger moving over the open panel scrolls the grid.
   *
   * Without this the grid does not scroll at all. `scrollToTile` exists and
   * the probe called it, so every tile "was reachable" — by the harness. At
   * 568x320 the panel is 148 tall and the content is 202, so a player could
   * see four of the six towers and had no way to reach the other two.
   */
  private drag(p: Phaser.Input.Pointer): void {
    if (!this.enabled || !this.open || this.dragFrom === null || !p.isDown) return
    const { y } = pointerToScreen(this.scene, p, this.opts.camera())
    const step = y - this.dragLast
    this.dragLast = y
    if (Math.abs(y - this.dragFrom) > CFG.dragSlop) this.dragged = true
    // Dragging up reveals what is below, so the offset moves against the
    // finger. `scrollBy` clamps, so a fling past the end stops at the end.
    if (this.dragged && step !== 0) this.scrollBy(-step)
  }

  /**
   * The pick happens on RELEASE, not on press, so a scroll that starts on a
   * tile does not also buy it.
   */
  private release(p: Phaser.Input.Pointer): void {
    const on = this.downOn
    const scrolled = this.dragged
    this.dragFrom = null
    this.downOn = null
    this.dragged = false
    if (!this.enabled || !this.open || scrolled || on === null) return
    const r = this.tileRects[on]
    const tile = this.tiles[on]
    // Re-checked at release: the grid may have moved under the finger.
    if (!r || !tile || tile.locked || !tileVisible(r, this.layout.grid, 0.5)) return
    const { x, y } = pointerToScreen(this.scene, p, this.opts.camera())
    if (!inRect(r, x, y)) return
    // Tapping the selected tile again cancels. The other cancels are a tap on
    // bare ground and closing the drawer, which the scene and `setOpen` own.
    this.select(this.selected === tile.id ? null : tile.id)
  }

  /** Rebuilds the whole drawer from the current state. Cheap: a handful of
   *  Graphics calls and at most twelve objects in the grid. */
  refresh(): void {
    this.tiles = this.enabled ? this.opts.tiles() : []
    this.layout = drawerLayout(this.opts.viewW(), this.opts.area(), this.tiles.length,
      this.scroll, CFG, this.open, this.opts.dockRight())
    this.tileRects = this.layout.tiles

    this.panelG.clear()
    this.scrollG.clear()
    this.tabG.clear()
    this.chromeG.clear()
    this.chromeLayer.removeAll(true)
    this.gridLayer.removeAll(true)
    this.maskG.clear()

    if (!this.enabled) {
      this.layer.setVisible(false)
      this.hit.setSize(1, 1).setPosition(-100, -100)
      return
    }
    this.layer.setVisible(true)

    const { tab, panel, grid } = this.layout

    // The hit area covers the tab, plus the panel when it is out. Sized from
    // the same rectangles the drawing uses.
    // The union of the tab and, when it is out, the panel. Taken from the two
    // rectangles rather than assumed, because the tab moves to the panel's
    // outside edge when it opens.
    const box = this.open
      ? {
        x: Math.min(panel.x, tab.x),
        y: Math.min(panel.y, tab.y),
        w: Math.max(panel.x + panel.width, tab.x + tab.width) - Math.min(panel.x, tab.x),
        h: Math.max(panel.y + panel.height, tab.y + tab.height) - Math.min(panel.y, tab.y),
      }
      : { x: tab.x, y: tab.y, w: tab.width, h: tab.height }
    this.hit.setPosition(box.x, box.y).setSize(box.w, box.h)
    this.hit.input!.hitArea.setTo(0, 0, box.w, box.h)

    if (this.open) {
      // Docked, like the handle: the panel's right side IS the screen's right
      // side, and a rounded corner or an outline there describes a shape with
      // something behind it.
      dockedSlab(this.panelG, panel, 'right', {
        fill: CFG.slab, outline: CFG.outline,
        outlineWidth: CFG.outlineWidth, radius: CFG.tileRadius,
      })
      this.maskG.fillStyle(0xffffff, 1)
      this.maskG.fillRect(grid.x, grid.y, grid.width, grid.height)
      for (const [i, tile] of this.tiles.entries()) this.drawTile(tile, this.layout.tiles[i]!)
      this.scrollbar(grid)
      this.drawHeader()
      this.drawTabs()
      this.drawDetail()
    }

    // The tab last, so it sits over the panel's edge and reads as its handle.
    //
    // THE PANEL'S OWN MATERIAL, and docked. It was a flat orange rounded
    // rectangle with a black chevron — a different fill from the drawer, all
    // four corners rounded, and six pixels short of the display — so it read
    // as a separate button parked near the edge instead of as the drawer's
    // edge. Same slab, same outline, rounded on the left only, and hard
    // against the screen while it is closed.
    if (this.open) {
      // Out with the panel, so both its vertical edges are real edges.
      this.slab(this.tabG, tab, CFG.slab)
    } else {
      dockedSlab(this.tabG, tab, 'right', {
        fill: CFG.slab, outline: CFG.outline,
        outlineWidth: CFG.outlineWidth, radius: CFG.tileRadius,
      })
    }
    this.chevron(tab)
  }

  /* ------------------------------------------------ the three new sections */

  /**
   * The wallet, in the drawer's own header.
   *
   * The player is spending the entire time this panel is open and every tile
   * carries a price, so the number they are spending belongs beside them
   * rather than only in the corner counter their thumb is covering.
   */
  private drawHeader(): void {
    const s = this.scene
    const r = this.layout.header
    const icon = ART.ui.peanut
    let x = r.x
    if (s.textures.exists(icon)) {
      const img = s.add.image(r.x + CFG.headerIcon / 2, r.y + r.height / 2, icon)
      img.setDisplaySize(CFG.headerIcon, CFG.headerIcon)
      this.chromeLayer.add(img)
      x += CFG.headerIcon + 4
    }
    const t = s.add.text(x, r.y + r.height / 2, String(this.opts.peanuts()), {
      fontFamily: FONT_UI, fontSize: `${uiSize(CFG.headerSize)}px`, fontStyle: 'bold',
      color: COLOR.amber, stroke: '#120d09', strokeThickness: 3,
    }).setOrigin(0, 0.5)
    this.chromeLayer.add(t)
  }

  /**
   * TOWERS / ACTIVE / PASSIVE.
   *
   * ONLY THE FIRST IS POPULATED, and the other two are built now anyway. The
   * point of the bar arriving before its contents is that filling it later is
   * data rather than a layout change — the panel's heights, the grid's
   * remaining room and the scroll that falls out of it are all decided here
   * and settled now, rather than being re-derived when the other two groups
   * turn up.
   *
   * A label that will not fit becomes a glyph rather than "TOWE...". Which
   * happens is a measurement, not a guess: the label is measured against the
   * tab it has to sit in.
   */
  private drawTabs(): void {
    const s = this.scene
    const labels = CFG.tabLabels ?? []
    for (const [i, r] of this.layout.tabs.entries()) {
      const label = labels[i] ?? ''
      const active = i === this.activeTab
      this.chromeG.fillStyle(active ? CFG.tabFillActive : CFG.tabFillIdle, 1)
      this.chromeG.fillRoundedRect(r.x, r.y, r.width, r.height, 5)
      this.chromeG.lineStyle(2, CFG.outline, 1)
      this.chromeG.strokeRoundedRect(r.x, r.y, r.width, r.height, 5)

      const colour = active ? CFG.tabLabelActive : CFG.tabLabelIdle
      if (tabLabelFits(this.labelWidth(label), r.width)) {
        const t = s.add.text(r.x + r.width / 2, r.y + r.height / 2, label, {
          fontFamily: FONT_UI, fontSize: `${uiSize(CFG.tabLabelSize)}px`,
          fontStyle: 'bold', letterSpacing: 1,
          color: `#${colour.toString(16).padStart(6, '0')}`,
        }).setOrigin(0.5)
        this.chromeLayer.add(t)
      } else {
        this.tabGlyph(i, r, colour)
      }
    }
  }

  /**
   * A tab's icon, for when its word will not fit.
   *
   * Drawn rather than an asset, for the same reason the chevron and the
   * padlock are: there is no icon for "passive" in any pack, and three
   * primitives in the drawer's own thick-outline vocabulary read better than
   * three borrowed glyphs that do not match each other.
   */
  private tabGlyph(i: number, r: Rect, colour: number): void {
    const g = this.scene.add.graphics()
    const cx = r.x + r.width / 2
    const cy = r.y + r.height / 2
    const k = Math.min(r.width, r.height) * 0.34
    g.fillStyle(colour, 1)
    g.lineStyle(2, colour, 1)
    if (i === 0) {
      // A turret: a squat body with a barrel on top.
      g.fillRoundedRect(cx - k, cy - k * 0.1, k * 2, k * 1.1, 2)
      g.fillRoundedRect(cx - k * 0.3, cy - k, k * 0.6, k * 0.9, 2)
    } else if (i === 1) {
      // A bolt: active things go off.
      g.beginPath()
      g.moveTo(cx + k * 0.2, cy - k)
      g.lineTo(cx - k * 0.6, cy + k * 0.15)
      g.lineTo(cx, cy + k * 0.15)
      g.lineTo(cx - k * 0.2, cy + k)
      g.lineTo(cx + k * 0.6, cy - k * 0.15)
      g.lineTo(cx, cy - k * 0.15)
      g.closePath()
      g.fillPath()
    } else {
      // A shield: passive things sit there.
      g.beginPath()
      g.moveTo(cx - k * 0.8, cy - k * 0.8)
      g.lineTo(cx + k * 0.8, cy - k * 0.8)
      g.lineTo(cx + k * 0.8, cy)
      g.lineTo(cx, cy + k)
      g.lineTo(cx - k * 0.8, cy)
      g.closePath()
      g.fillPath()
    }
    this.chromeLayer.add(g)
  }

  /**
   * The pinned strip: what the selected tower is.
   *
   * It REPLACES the floating panel for the build case. With the drawer on,
   * nothing in the build flow is positioned against a pad any more — the
   * picture, the price, the name, the numbers and the trait are all in one
   * rectangle that is always in the same place, so there is no placement to
   * get wrong and no placement measurement to keep.
   *
   * The price is NOT repeated here: it is already on the tile, and the tile
   * is what the eye came from.
   *
   * Empty when nothing is selected, and still there. Collapsing it would
   * re-flow the grid under the finger at the exact moment a tile has just
   * been tapped.
   */
  private drawDetail(): void {
    const s = this.scene
    const r = this.layout.detail
    this.chromeG.fillStyle(CFG.tileFill, 1)
    this.chromeG.fillRoundedRect(r.x, r.y, r.width, r.height, CFG.tileRadius)
    this.chromeG.lineStyle(2, CFG.outline, 1)
    this.chromeG.strokeRoundedRect(r.x, r.y, r.width, r.height, CFG.tileRadius)

    const detail = this.selected ? this.opts.detailFor(this.selected) : null
    if (!detail) return

    const box = this.layout.detailIcon
    if (s.textures.exists(detail.sprite)) {
      const art = s.add.image(box.x + box.width / 2, box.y + box.height / 2, detail.sprite)
      fitInBox(art, detail.sprite, box.width)
      this.chromeLayer.add(art)
    }

    const col = this.layout.detailText

    /*
     * THE ROWS ARE 15px BECAUSE EVERYTHING IS.
     *
     * `uiSize` clamps to typography.minUiSize, which is 15, so there is no
     * such thing as a "small label" in screen-space UI here — a caption is
     * the same height as the number it captions. Three captions at 15px need
     * about 100px and this column is 92 at 844x390 and 68 at 568x320, so the
     * labels the brief asked for cannot be drawn at all without going under a
     * floor that exists for reading a phone at arm's length.
     *
     * So the strip carries what fits, in a FIXED ORDER — dps, range, rate,
     * which is the order `statsFor` returns and the order the ledger card
     * shows them in — and the trait only where there is a third row for it.
     */
    const line = uiSize(CFG.detailNameSize) + 2
    const rows = Math.max(1, Math.floor(col.height / line))
    const grey = `#${CFG.detailLabelColor.toString(16).padStart(6, '0')}`

    const put = (row: number, text: string, colour: string, size: number) => {
      const t = s.add.text(col.x, col.y + line * row + line / 2, text, {
        fontFamily: FONT_UI, fontSize: `${uiSize(size)}px`, fontStyle: 'bold', color: colour,
      }).setOrigin(0, 0.5)
      this.squeeze(t, col.width)
      this.chromeLayer.add(t)
      return t
    }

    put(0, detail.name, COLOR.ink, CFG.detailNameSize)
    // The numbers, in `statsFor`'s order. A support tower returns two rather
    // than three, so the count comes from the data.
    put(1, detail.stats.map((v) => v.value).join('  '), COLOR.amber, CFG.detailStatSize)
    if (rows >= 3) {
      // NEVER WRAPS. Clamped rather than wrapped: there is no fourth row.
      const trait = detail.trait.length > TRAIT_MAX
        ? detail.trait.slice(0, TRAIT_MAX)
        : detail.trait
      put(2, trait, grey, CFG.detailTraitSize)
    }
  }

  /**
   * Squeezes a line horizontally to fit, WITHOUT going under the type floor.
   *
   * Phaser can scale the glyphs on one axis, which keeps the height — and so
   * the legibility floor — while narrowing the line. Reducing the font size
   * instead would walk straight under `minUiSize`, which is the one thing the
   * typography rules do not allow.
   */
  private squeeze(t: Phaser.GameObjects.Text, width: number): void {
    if (t.width <= width || t.width === 0) return
    // 0.6 is the floor, and the trait line is what sets it: eighteen
    // characters at the 15px type floor is about 135px against an 80px
    // column, which is 0.59. Below that the letters close up into each other,
    // so anything still too wide past this is cut rather than crushed.
    const k = width / t.width
    t.setScale(Math.max(0.6, k), 1)
    if (k >= 0.6) return
    let text = t.text
    while (text.length > 1 && t.displayWidth > width) {
      text = text.slice(0, -1)
      t.setText(text)
    }
  }

  /**
   * How wide a tab label renders, measured once and remembered.
   *
   * Measured rather than counted: whether "TOWERS" fits a 44px tab at 10px
   * bold is a question about the font, and the answer decides label-or-glyph.
   * Cached because `refresh` runs on every frame of a scroll drag and three
   * throwaway Text objects per frame is not free.
   */
  private labelWidth(label: string): number {
    const hit = this.labelWidths.get(label)
    if (hit !== undefined) return hit
    const probe = this.scene.add.text(0, 0, label, {
      fontFamily: FONT_UI, fontSize: `${uiSize(CFG.tabLabelSize)}px`,
      fontStyle: 'bold', letterSpacing: 1,
    })
    // NOT divided by the device ratio, and it was for one run.
    //
    // `uiSize` looks like the scaling helper and is not: it CLAMPS a size to
    // the legibility floor and does nothing else, so a Text made through it
    // measures in the same CSS pixels every rectangle here is written in. The
    // division made the width three times too small on a retina screen and
    // one times too small everywhere else, which is why the fix showed up as
    // the two ratios disagreeing — 71.0 at dpr 1 against 23.7 at dpr 3 — and
    // that disagreement is the signature of exactly the bug it was meant to
    // be fixing.
    const w = probe.width
    probe.destroy()
    this.labelWidths.set(label, w)
    return w
  }

  /**
   * A hint that there is more, shown only when there is.
   *
   * Not a control: it is too thin to grab and dragging the grid is the
   * gesture. It exists because at 568x320 the panel looks complete while two
   * of the six towers are below its bottom edge.
   */
  private scrollbar(grid: Rect): void {
    const max = this.layout.maxScroll
    if (max <= 0) return
    const w = CFG.scrollbarWidth
    const h = Math.max(16, grid.height * (grid.height / this.layout.contentHeight))
    const y = grid.y + (grid.height - h) * (this.scroll / max)
    this.scrollG.fillStyle(CFG.scrollbarFill, 0.75)
    this.scrollG.fillRoundedRect(grid.x + grid.width - w, y, w, h, w / 2)
  }

  /** A chunky rounded slab with a thick dark outline. The whole visual
   *  vocabulary of the drawer is this one shape at three sizes. */
  private slab(g: Phaser.GameObjects.Graphics, r: Rect, fill: number): void {
    g.fillStyle(fill, 1)
    g.fillRoundedRect(r.x, r.y, r.width, r.height, CFG.tileRadius)
    g.lineStyle(CFG.outlineWidth, CFG.outline, 1)
    g.strokeRoundedRect(r.x, r.y, r.width, r.height, CFG.tileRadius)
  }

  /** Which way the tab will move the panel, as two thick strokes. Drawn
   *  rather than an icon: there is no chevron in any pack and a letter would
   *  be worse. */
  private chevron(tab: Rect): void {
    const cx = tab.x + tab.width / 2
    const cy = tab.y + tab.height / 2
    const s = 7
    const dir = this.open ? 1 : -1
    // Light, because the handle is the drawer's dark slab now rather than an
    // orange plate. A near-black chevron on it was invisible.
    this.tabG.lineStyle(CFG.outlineWidth, CFG.chevron, 1)
    this.tabG.beginPath()
    this.tabG.moveTo(cx - s * dir, cy - s)
    this.tabG.lineTo(cx + s * dir, cy)
    this.tabG.lineTo(cx - s * dir, cy + s)
    this.tabG.strokePath()
  }

  private drawTile(tile: DrawerTile, r: Rect): void {
    const s = this.scene
    const picked = this.selected === tile.id
    const g = s.add.graphics()
    g.fillStyle(picked ? CFG.tileFillSelected : CFG.tileFill, 1)
    g.fillRoundedRect(r.x, r.y, r.width, r.height, CFG.tileRadius)
    g.lineStyle(CFG.outlineWidth, picked ? CFG.selectedEdge : CFG.outline, 1)
    g.strokeRoundedRect(r.x, r.y, r.width, r.height, CFG.tileRadius)
    this.gridLayer.add(g)

    // DIMMED, NOT HIDDEN, when it cannot be afforded: what you are saving for
    // is information, and a tile that vanishes takes the answer with it.
    const dim = !tile.affordable || tile.locked
    const box = r.height * CFG.iconFraction
    if (s.textures.exists(tile.sprite)) {
      const art = s.add.image(r.x + r.width / 2, r.y + box / 2 + 3, tile.sprite)
      fitInBox(art, tile.sprite, box)
      if (dim) art.setAlpha(CFG.dimAlpha)
      this.gridLayer.add(art)
    }

    const price = s.add.text(r.x + r.width / 2, r.y + r.height - 4, String(tile.price), {
      fontFamily: FONT_UI, fontSize: `${uiSize(CFG.priceSize)}px`, fontStyle: 'bold',
      color: tile.affordable ? COLOR.amber : COLOR.danger,
      stroke: '#120d09', strokeThickness: 3,
    }).setOrigin(0.5, 1)
    if (tile.locked) price.setVisible(false)
    this.gridLayer.add(price)

    if (tile.locked) {
      // A padlock, drawn: a shackle over a body, in the same thick outline as
      // everything else here.
      const lx = r.x + r.width / 2
      const ly = r.y + r.height / 2
      const w = CFG.lockSize
      // LIGHT, over the dimmed art. It was drawn in `COLOR.panelEdge` —
      // 0x3d4a59, from the bevelled-plate palette this drawer does not use —
      // on a 0x4a3a2a tile: it rendered every frame and could not be seen in
      // any screenshot at either ratio. Colours live in the data with the
      // rest of the drawer's.
      const lock = s.add.graphics()
      lock.fillStyle(CFG.lockEdge, 1)
      lock.fillRoundedRect(lx - w * 0.44, ly - w * 0.26, w * 0.88, w * 0.66, 4)
      lock.lineStyle(Math.max(2, w * 0.14), CFG.lockFill, 1)
      lock.beginPath()
      lock.arc(lx, ly - w * 0.22, w * 0.26, Math.PI, 0, false)
      lock.strokePath()
      lock.fillStyle(CFG.lockFill, 1)
      lock.fillRoundedRect(lx - w * 0.36, ly - w * 0.18, w * 0.72, w * 0.5, 3)
      this.gridLayer.add(lock)
    }
  }

  destroy(): void {
    this.gridLayer.removeAll(true)
    this.layer.destroy(true)
    this.maskG.destroy()
  }
}

import Phaser from 'phaser'
import presentationData from '../data/presentation.json'
import { COLOR, FONT_UI, uiSize } from './Theme.ts'
import { fitInBox } from '../systems/Art.ts'
import { pointerToScreen } from '../systems/Resolution.ts'
import { dockedSlab } from './EdgeDock.ts'
import {
  type DrawerConfig, type DrawerLayout, drawerLayout, inRect, scrollToShow, tileVisible,
} from '../systems/DrawerLayout.ts'
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
  tabFill: number
  chevron: number
  selectedEdge: number
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
  private readonly hit: Phaser.GameObjects.Rectangle
  /** Public so the harness can measure every rectangle rather than infer it
   *  from a screenshot. */
  layout: DrawerLayout
  private tiles: DrawerTile[] = []
  /** Where the tap targets are, in CSS pixels, for the scene and the probe.
   *  ONE list: the picture and the target come from the same rectangles. */
  tileRects: Rect[] = []

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
    this.layer.add([this.panelG, this.gridLayer, this.scrollG, this.tabG, this.hit])
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
   */
  private setOpen(next: boolean): void {
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

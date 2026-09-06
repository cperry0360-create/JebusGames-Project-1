import Phaser from 'phaser'
import type { ScratchOutcome } from '../systems/Scratch.ts'
import { NukeEarnedOverlay, NukeLaunchOverlay } from '../ui/NukeOverlays.ts'
import type {
  AbilityDef, DraftDef, EnemyDef, HeroDef, HeroPowerDef, HeroSkillDef, RulesDef, TowerDef,
  TowerSpec, WavesDef,
} from '../types.ts'
import displayData from '../data/display.json'
import rulesData from '../data/rules.json'
import towersData from '../data/towers.json'
import enemiesData from '../data/enemies.json'
import { DEFAULT_HERO_ID, heroDef as heroDef_, resolveHeroId } from '../systems/Heroes.ts'
import {
  SLOT1, SLOT2, heroSlotDefs, isAreaSkill, isHeroSlot, slotContents,
} from '../systems/HeroSkills.ts'
import abilitiesData from '../data/abilities.json'
import draftData from '../data/draft.json'

import { loadLevel, type Level } from '../systems/Levels.ts'
import { LaneNetwork } from '../systems/Lanes.ts'
import { Path } from '../systems/Path.ts'
import { BuildSystem } from '../systems/BuildSystem.ts'
import type { BuildSpot } from '../systems/BuildSystem.ts'
import { WaveSpawner } from '../systems/WaveSpawner.ts'
import { withinRadius, pickNearest } from '../systems/Targeting.ts'
import { GROUND_DEPTH } from '../systems/DepthSort.ts'
import { boardBounds, coverZoom, openingView } from '../systems/CameraMath.ts'
import { distanceAtX, type EmergeConfig } from '../systems/Gateway.ts'
import { makeRng } from '../systems/Draft.ts'
import { dashArcs, HeroMarkers, type MarkersDef } from '../systems/HeroMarkers.ts'
import { ART, applyRender, fitContentHeight, fitContentWidth, soldierSprite } from '../systems/Art.ts'
import { EFFECT_MS, playEffect, sizeForRadius } from '../systems/Effects.ts'
import { Cooldowns } from '../systems/Cooldowns.ts'
import { unlockedTowerCount } from '../systems/Draft.ts'
import { runState, setRunState } from '../systems/RunState.ts'
import { castAbility } from '../systems/AbilityRunner.ts'
import { PRESENTATION, floatingDamage, hitPause } from '../systems/Presentation.ts'
import { cueLeadInMs, play, playRotating, resetVoices } from '../systems/Audio.ts'
import { Enemy } from '../entities/Enemy.ts'
import type { Blocker } from '../entities/Enemy.ts'
import { Tower } from '../entities/Tower.ts'
import { Hero } from '../entities/Hero.ts'
import { Fighter } from '../entities/Fighter.ts'
import { Soldier } from '../entities/Soldier.ts'
import { defaultRally, rallyFromTap, soldierStations, type RallySpot } from '../systems/Rally.ts'
import { Projectile } from '../entities/Projectile.ts'
import { ScratchCard } from '../ui/ScratchCard.ts'
import { BODY_SPACING, COLOR, FONT_DISPLAY, FONT_UI, hexColour } from '../ui/Theme.ts'
import { platePanel, plateButton, type PlateButton } from '../ui/Plate.ts'
import { dockedSlab } from '../ui/EdgeDock.ts'
import { SignBribe } from '../ui/SignBribe.ts'
import { fitAspect, placeSign } from '../systems/SignPlacement.ts'
import { CameraRig } from '../systems/CameraRig.ts'
import { Dialog, type DialogOptions } from '../ui/Dialog.ts'
import { TowerRing, type RingOption } from '../ui/TowerRing.ts'
import { type CardStat, statsFor, withChanges } from '../systems/TowerCard.ts'
import { usableArea } from '../systems/RingLayout.ts'
import {
  BASE_TIER, nextStep, sellValue, specById, specIcon, statAt,
} from '../systems/Upgrades.ts'
import { openingPurse } from '../systems/Economy.ts'
import {
  addBannerPoints, controlDrawerOn, hasClearedARun, recordRunCleared,
} from '../systems/Save.ts'
import { bannerPointsFor, verdictFor, type RunOutcome } from '../systems/Banner.ts'
import { waveOutcome } from '../systems/Wave.ts'
// No loadRun here on purpose: whether to resume is the title screen's
// question to ask, and it arrives through RunState.resumeFrom.
import { clearRun, saveRun, type SavedRun } from '../systems/RunSave.ts'
import { TRANSFORM_BELOW } from '../systems/Transform.ts'
import { logEvent, provideState } from '../systems/Diagnostics.ts'
import { heartbeat, setRunActive } from '../systems/Watchdog.ts'
import {
  hudBlocksGesture, hudLayout, NO_INSETS, type HudLayout, type Rect,
} from '../systems/HudLayout.ts'
import { TargetingMode, type ExitReason } from '../systems/TargetingMode.ts'
import {
  hazardExpired, makeHazard, powerRefusal, rainPoints, tickHazard,
  withinCastRange, withinDash, type Hazard, type PowerRefusal,
} from '../systems/HeroPowers.ts'
import { expandingRing, hazardBand, lineSweep, strike, type HazardArt } from '../systems/HeroFx.ts'
import { cameraAcceptsGestures, LAYER } from '../systems/Layers.ts'
import { barWidth, regions, slotDefs, type BarMetrics } from '../systems/AbilityBar.ts'
import { safeAreaInsets } from '../systems/SafeArea.ts'
import { onSceneResize, sceneIsLive } from '../systems/SceneEvents.ts'
import { musicForScene } from '../systems/Music.ts'
import {
  deviceScale, fitUiCamera, pointerToScreen, viewH, viewW, worldToScreen,
} from '../systems/Resolution.ts'
import { CastCursor } from '../ui/CastCursor.ts'
import { ControlDrawer, type DrawerDetail, type DrawerTile } from '../ui/ControlDrawer.ts'
import { bothUnits, realSeconds } from '../systems/GameTime.ts'

/** The HUD's layout constants, shared with HudScene so both agree. */
const LAYOUT = PRESENTATION.hud.layout

const RULES = rulesData as RulesDef
const TOWERS = towersData as Record<string, TowerDef>
// `as unknown as`, the same way Heroes.ts casts its own roster. `artFacing` is
// a string literal union in the type and a plain `string` in the JSON, and TS
// will not bridge that in one step.
const ENEMIES = enemiesData as unknown as Record<string, EnemyDef>
const ABILITIES = abilitiesData as Record<string, AbilityDef>
const DRAFT = draftData as DraftDef

export type Phase = 'ready' | 'wave' | 'won' | 'lost'
/** What a click means right now. */
export type Mode = 'normal' | 'targeting'

export interface GameStatus {
  peanuts: number
  lives: number
  wave: number
  waveCount: number
  phase: Phase
  mode: Mode
  enemiesLeft: number
  heroName: string
  heroHealth: number
  heroMax: number
  heroDown: boolean
  /** Seconds until he is back, or 0 when he is up. The HUD counts it down. */
  heroReviveIn: number
  lastStand: boolean
  unlockedTowers: string[]
  abilities: string[]
  /** The rare drop, once it has dropped. Null before, and again after use. */
  rareAbility: string | null
  /** The boss on the field, for the bar across the top. Null when there is none. */
  bossName: string
  bossHealth: number
  bossMax: number
  pendingAbility: string | null
  /** Whether the hero has transformed. Slot 2 is gated on it, and the HUD
   *  reads it rather than reaching into the hero. */
  heroPowered: boolean
  /**
   * The health fractions worth marking on the hero's bar, ascending.
   *
   * THERE ARE TWO THRESHOLDS AND THE BAR ONLY EVER SHOWED ONE. The tick was a
   * hardcoded 0.25, and 0.25 is the LAST STAND threshold from the hero's own
   * `lastStand.healthThreshold` -- still a live mechanic. The TRANSFORMATION
   * is a separate rule at 0.5 (`heroTransform.belowHealth` in rules.json) and
   * had no mark at all, so the more consequential of the two was the invisible
   * one. Both are marked now, and both come from data: a hero with a different
   * Last Stand threshold moves its own tick with no code change.
   */
  heroMarks: number[]
  /** Seconds until the next wave starts by itself. 0 when nothing is counting. */
  readyCountdown: number
  /** Run totals, for the results screen. Kills counts enemies killed by any
   *  means; earned counts peanuts taken in, not peanuts recovered by selling. */
  kills: number
  peanutsEarned: number
  /**
   * A refusal the player needs to see *now*, raised where their finger is
   * rather than in the guidance line. The HUD shows it once and clears it.
   *
   * Tapping a hero ability that could not fire used to set only `message`, a
   * small line in the opposite corner of the screen — so the tap looked like
   * it had done nothing at all and the slot read as dead.
   */
  alert: string
}

/** Wave banners and rare-drop notices, above the board and below any panel. */
const OVERLAY_DEPTH = LAYER.announcement
/** A modal's content. See systems/Layers.ts for the whole order and for why
 *  depth alone cannot put this above the HUD. */
const TICKET_DEPTH = LAYER.modal
/** Ground markings are ellipses, not circles: the map is painted in 3/4. */
const PAD_SQUASH = 0.62

/**
 * Where the hero starts, on every level.
 *
 * The middle of the board. The world is `display.json`'s box on every map, so
 * this is one number rather than a measurement per painting -- see the note at
 * the point of use for why the per-map value went.
 */
const HERO_START: readonly [number, number] = [displayData.width / 2, displayData.height / 2]

/**
 * The clock on slot 2, until the power that goes in it has one of its own.
 *
 * It is registered rather than left unregistered so the slot draws like a slot
 * -- a button with no cooldown behind it is a button the bar cannot render the
 * same way as its neighbours. Nothing starts it yet.
 */
/** Live Spike Strips, with the art each one owns. See `tickHazards`. */
interface LiveHazard { state: Hazard; art: HazardArt }

/** One blue for both hero markers: they are two halves of one idea, and two
 *  blues would read as two systems. */
const MARKER_BLUE = 0x4fa3e3

export class GameScene extends Phaser.Scene {
  readonly status: GameStatus = {
    peanuts: 0, lives: 0, wave: 0, waveCount: 0,
    phase: 'ready', mode: 'normal', enemiesLeft: 0,
    heroName: '', heroHealth: 0, heroMax: 0, heroDown: false, heroReviveIn: 0,
    heroPowered: false,
    lastStand: false,
    unlockedTowers: [], abilities: [], rareAbility: null, pendingAbility: null,
    readyCountdown: 0, heroMarks: [],
    kills: 0, peanutsEarned: 0,
    alert: '',
    bossName: '', bossHealth: 0, bossMax: 0,
  }

  readonly cooldowns = new Cooldowns()

  private lane!: Path
  /** Every lane this map has, and how they join. One lane on a single-lane
   *  map, which is every level that exists today. */
  private lanes!: LaneNetwork
  private build!: BuildSystem
  /** Public so the probe can drive the bribe through the real swap. Undefined
   *  on a level whose map declares no signs — see `buildSign`. */
  sign?: SignBribe
  private cancelBtn!: PlateButton
  /** The docked slab CANCEL is drawn on. Its own object, because the painted
   *  button plate cannot have a square corner. */
  private cancelSlab!: Phaser.GameObjects.Graphics
  /** The X, drawn rather than loaded: there is no cancel glyph in the packs
   *  and a letter would read as a letter. Same reasoning as the settings gear. */
  private cancelGlyph!: Phaser.GameObjects.Graphics
  /**
   * WHAT THE BOARD IS WAITING FOR, if anything.
   *
   * The one owner of the mode. `status.mode` and `status.pendingAbility` are
   * mirrors of it, written in `syncTargeting` and nowhere else, because the HUD
   * and the save format read those and neither should have to know about this
   * class. Public so the harness can drive the escapes it is here to guarantee.
   */
  readonly targeting = new TargetingMode()
  /** Spike Strips on the board. Plain data plus its art, ticked in `update`
   *  rather than on a timer each: a timer outlives the run that made it. */
  private readonly hazards: LiveHazard[] = []
  /** The standing highlight over the area a tap is legal in. See
   *  `drawTargetArea`: on a touch device this is the ONLY thing that says the
   *  game is waiting, because there is no pointer to draw a cursor under. */
  private targetArea!: Phaser.GameObjects.Graphics
  private dialog?: Dialog
  /** The tower panel. Non-modal and anchored beside its tower, so the range
   *  ring it is asking about stays visible behind it. */
  /** THE tower menu: the ring, for a pad and for a built tower alike. */
  private ring?: TowerRing
  /** True while the upgrade button is hovered or held, which brightens the
   *  projected range ring. */
  private previewingUpgrade = false
  /** How to re-price the open ring. Set with it, cleared when it closes. */
  private ringOptions?: () => RingOption[]
  /** Last known affordability of the open drawer's tiles, so a rebuild only
   *  happens when one of them actually flipped. */
  private drawerAfford: boolean[] = []
  /** Public so a harness run can read the camera's state. */
  rig!: CameraRig
  /** Everything drawn in screen space rather than on the map. The main
   *  camera ignores it, so it neither pans nor zooms. */
  private uiCam!: Phaser.Cameras.Scene2D.Camera
  /**
   * Where the HUD's elements sit. Public so anything the scene draws in screen
   * space can keep clear of them without guessing.
   *
   * IT COMES FROM THE HUD, and that is the fix for the counters panning the
   * map. This scene used to compute its own copy with `countersWidth: 0` and
   * `abilitiesWidth: 0` -- the widths are MEASURED from the plates and the
   * icons, and only HudScene has them -- so `layout.counters` here was a
   * rectangle of zero width. The camera gate then asked "is this press inside
   * the counters?" of a rectangle nothing can be inside, and a drag starting
   * on the peanut counter panned the map.
   *
   * That is why the previous fix held for the drawer and not for these: the
   * PREDICATE was unified and the GEOMETRY it consults was not. One layout,
   * owned by the scene that can measure it.
   *
   * `ownLayout` is the fallback for the frames before the HUD exists, and for
   * the harness scenarios that run GameScene without it.
   */
  get layout(): HudLayout {
    const hud = this.scene?.get('Hud') as unknown as { layout?: HudLayout } | null
    return hud?.layout ?? this.ownLayout
  }

  private ownLayout: HudLayout = hudLayout(
    { width: 1280, height: 720, insets: NO_INSETS, countersWidth: 0, abilitiesWidth: 0 },
    LAYOUT,
  )
  private readonly screenSpace: Phaser.GameObjects.GameObject[] = []
  /** Set at press time when the press belonged to a menu, ticket or dialog. */
  private pressTakenByUi = false
  /** Held still for a beat on a big impact. See `skillPunch`. Public so a
   *  harness run can assert the pause happened rather than infer it. */
  hitPaused = false
  /** Child count at the last camera split, so new objects get assigned. */
  private splitAt = -1
  private spawner!: WaveSpawner
  private hero!: Hero

  /**
   * The level being played: its map, its wave table, its plate.
   *
   * Set on the first line of `create` from the run state, so every method
   * below reads one level for the whole scene and a restart picks up whatever
   * the title screen chose. It is not read at construction time — a Phaser
   * scene is constructed once and started many times, and a level chosen at
   * construction would be the same level for the rest of the session.
   */
  private level!: Level

  private enemies: Enemy[] = []
  private towers: Tower[] = []
  private shots: Projectile[] = []
  private fighters: Fighter[] = []
  /**
   * One per Ima Dummy Tower: its lads, and the point they hold.
   *
   * Kept beside the towers rather than on them because a Tower is a display
   * object for a building, and these are display objects for people standing
   * somewhere else entirely.
   */
  private garrisons: Array<{ tower: Tower; rally: RallySpot | null; soldiers: Soldier[] }> = []
  /** The marker under the selected tower's rally point. */
  private rallyMark?: Phaser.GameObjects.Graphics

  /** One marker per build spot, created once and then shown or hidden. */
  private pads: Phaser.GameObjects.Image[] = []
  /** Where the arch lets go and where the gate stops them, in lane distance. */
  private gateway!: {
    laneHalfWidth: number
    mouthDistance: number
    gateDistance: number
    stopDistance: number
    emerge: EmergeConfig
  }
  /** Cropped out of the map plate at scene start; see createArchOccluders. */
  /** Public for the harness, which counts them and reads their depth. */
  archOccluders: Phaser.GameObjects.Image[] = []
  /** Whether the goblin has already said his line this run. One per RUN, not
   *  per wave and not per enemy. */
  private greeted = false
  /** Whether the Politician has said his. Once per run, on the boss becoming
   *  visible. Wave 13 spawns one boss, but the flag is what makes that a
   *  property rather than an assumption about the wave table. */
  private politicianSpoke = false
  /** Which spot keeps the full DO NOT BUILD HERE sign. The rest get the quiet
   *  marker; see createPads. Public so a harness run can check there is
   *  exactly one and that it is the one nearest the entrance. */
  signSpotIndex = 0
  private markerLayer!: Phaser.GameObjects.Graphics
  /** The pulsing ring on every node that will take the drawer's pick. Its own
   *  layer because the pads' scale and tint are both already spoken for. */
  private eligibleLayer!: Phaser.GameObjects.Graphics
  /** The dashed circle showing what an upgrade would make this tower's reach.
   *  Its own layer, because rangeRing is cleared and redrawn constantly. */
  private projectedRing!: Phaser.GameObjects.Graphics
  /** The valid/invalid marker under the pointer while a summon is armed.
   *  Public so the harness can read which state it is in. */
  castCursor!: CastCursor
  /**
   * The opt-in control drawer, behind the `controlDrawer` save flag.
   *
   * Built every run whether the flag is on or not, and switched by
   * `setEnabled`. A drawer that is off draws nothing and hits nothing, and
   * building it either way is what lets the flag be flipped in the settings
   * dialog and take effect on the same board seconds later.
   *
   * Public for the harness, which drives the whole placement flow.
   */
  drawer!: ControlDrawer
  /** The tower the drawer has selected, waiting for a node. */
  drawerPick: string | null = null
  /**
   * A node chosen BEFORE a tower, waiting for one.
   *
   * The drawer's flow runs both ways now. Picking a tower and then a node was
   * the only order it supported, and tapping an empty node with the drawer
   * shut did nothing at all — which reads as a dead control, not as a rule.
   */
  pendingSpot: BuildSpot | null = null
  /** Banners waiting for the slot, and whether the slot is taken. One at a
   *  time; see announce(). */
  private readonly bannerQueue: Array<{ text: string; color: string }> = []
  private bannerShowing = false

  /** The seconds left on the revive, drawn on the spot he comes back to.
   *  A Text rather than part of markerLayer, which can only draw shapes. */
  private reviveLabel!: Phaser.GameObjects.Text
  /** The legal drop corridor while a path-only summon is armed. Its own layer
   *  because markerLayer is cleared and redrawn every frame by the rally
   *  marker, which wiped the band the moment it was painted. */
  /** The wash over the stretch of lane a SELECTED TOWER covers. It used to
   *  double as the summon-targeting band; that band is gone (see CastCursor)
   *  and this is all it does now, so it is named for it. */
  private laneWash!: Phaser.GameObjects.Graphics
  private hoverSpot: BuildSpot | null = null
  private heroSelected = false
  /** The selection ring and the move order. Three states, and it owns the
   *  timing of all of them; see HeroMarkers. */
  private readonly markers = new HeroMarkers(PRESENTATION.heroMarkers as MarkersDef)
  private rangeRing!: Phaser.GameObjects.Graphics
  private targetRing!: Phaser.GameObjects.Graphics
  /** Public so the probe can read which tower a tap selected. */
  selected: Tower | null = null
  /** Public so a harness run can assert the modal contract from outside. */
  ticket: ScratchCard | null = null
  /** The Server Nuke's two moments. Both are modals; see ui/NukeOverlays.ts. */
  nukeEarned: NukeEarnedOverlay | null = null
  nukeLaunch: NukeLaunchOverlay | null = null
  /** One Server Nuke per run, dropped or not. */
  private nukeUsed = false
  /** Enemies that reached the exit during the current wave. Reset at its
   *  start; non-zero means the wave was survived rather than cleared. */
  private escapedThisWave = 0
  /** Last logged hero state and boss phase, so each is written on change
   *  rather than every frame. */
  private lastHeroState = ''
  private lastBossPhase = -1
  /** The half-opacity tower shown on the pad while a build option is chosen.
   *  Never drawn without a pad to stand on. */
  private ghost?: Phaser.GameObjects.Image
  /**
   * True while the Server Nuke's wind-up is running. Every ability is refused
   * during it, so nothing else can be fired into the flash.
   *
   * It is also the bug behind "I could not use any ability on the Politician":
   * Phaser reuses the scene object across restarts, so a run that ended, was
   * quit, or was restarted during the 2.2s wind-up destroyed the tween without
   * ever firing its onComplete — and left this true for every later run in the
   * same page session. Cleared in create() now, and backstopped by castUntil.
   */
  private casting = false
  /** When the current wind-up must be over by. A cast that outlives this has
   *  lost its tween, and the flag is cleared rather than trusted. */
  private castUntil = 0

  constructor() {
    super('Game')
  }

  create(): void {
    // Before anything else: everything below reads this. A resumed run plays
    // the level it was saved on, a fresh one plays whatever the title screen
    // picked, and an id neither recognises falls back to the default rather
    // than throwing on the first frame — see Levels.resolveLevelId.
    this.level = loadLevel(runState().resumeFrom?.level ?? runState().levelId)

    // What plays here is data; see music.json. A scene not listed keeps
    // whatever is already playing, which is what carries the battle track
    // across Title -> Loadout without a restart.
    musicForScene('Game')
    // create() runs again on restart, so every field carrying state from the
    // previous run has to be cleared here, not just declared above.
    this.enemies = []
    this.towers = []
    this.shots = []
    this.fighters = []
    this.garrisons = []
    this.hoverSpot = null
    this.selected = null
    this.heroSelected = false
    this.ticket?.destroy()
    this.ticket = null

    const run = runState()
    const heroDef = heroDef_(run.heroId) ?? heroDef_(DEFAULT_HERO_ID)!

    resetVoices()

    // Created before anything registers itself as screen space.
    //
    // Its VIEWPORT is the canvas, so it is sized in physical pixels; its
    // COORDINATE SPACE is CSS pixels, which is what fitUiCamera arranges by
    // zooming it to the device scale. Screen-space UI is laid out in CSS
    // pixels exactly as before and drawn at full device resolution.
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height)
    this.uiCam.setName('ui')
    fitUiCamera(this, this.uiCam)
    this.applyBands()
    // Registered through the scene, not straight onto the ScaleManager.
    //
    // The ScaleManager belongs to the GAME and outlives every run. This was
    // `this.scale.on('resize', () => ...)` with no matching `off` and no name
    // to pass to one, so each run left another arrow function closed over a
    // dead scene on a live emitter. Backgrounding the app calls
    // `ScaleManager.refresh()`, which emits `resize` into all of them, and the
    // dead ones threw on `this.cameras.main`.
    onSceneResize(this, () => {
      if (!sceneIsLive(this)) return
      if (this.uiCam) {
        this.uiCam.setSize(this.scale.width, this.scale.height)
        fitUiCamera(this, this.uiCam)
      }
      // A panel composed against the old viewport is re-centred against the
      // new one. The camera moves on a resize; without this the content does
      // not, and an open panel drifts towards an edge by half the difference.
      this.nukeLaunch?.recentre(viewW(this), viewH(this))
      this.nukeEarned?.recentre(viewW(this), viewH(this))
      this.applyBands()
    })

    // The lane network first; `lane` stays the MAIN lane, which is what the
    // board bounds, the sign placement and the gateway distances are all
    // measured against, exactly as before.
    this.lanes = new LaneNetwork(this.level.map)
    this.lane = this.lanes.main.path
    // The arch mouth and the two edges of the open gate's gap are measured off
    // the painted plate as map positions; the enemy walks in lane distance.
    // Converted once here rather than per enemy per frame.
    //
    // Both ends are OPTIONAL. Level 1 has an arch to walk out of and an open
    // gate to dissolve in; level 2's lane simply runs off both edges of the
    // plate, so there is nothing to emerge from and nothing to vanish into.
    // The defaults say exactly that:
    //   no entrance -> mouth at distance 0 with a zero-length fade, so an
    //     enemy is at full opacity and full size from its first frame.
    //   no exit -> the gap sits at the very end of the lane, so nothing ever
    //     starts fading (applyVanish returns early below gateDistance) and the
    //     enemy leaks on reaching the end, which is where it walks off-plate.
    const map = this.level.map
    const laneEnd = this.lane.totalLength
    this.gateway = {
      // Measured, not chosen: the painted road is 38 world pixels across, and
      // until now nothing but the band-drawing code read that number.
      laneHalfWidth: map.roadWidth / 2,
      mouthDistance: map.entrance ? distanceAtX(map.waypoints, map.entrance.emergeFromX) : 0,
      gateDistance: map.exit ? distanceAtX(map.waypoints, map.exit.gateX) : laneEnd,
      stopDistance: map.exit ? distanceAtX(map.waypoints, map.exit.vanishX) : laneEnd,
      emerge: map.entrance
        ? { fadeMs: map.entrance.fadeMs, startScale: map.entrance.startScale }
        : { fadeMs: 0, startScale: 1 },
    }
    this.build = new BuildSystem(this.level.map.buildSpots, this.level.map.spotRadius)
    this.spawner = new WaveSpawner()

    this.drawPlate()
    this.buildSign()

    this.markerLayer = this.add.graphics().setDepth(GROUND_DEPTH + 6)
    // Above the pads and below everything that stands on them, so the mark
    // reads as being ON the node rather than over the board.
    // UNDER THE PAD ART, which sits at GROUND_DEPTH + 5. It was at +6, over
    // the top of the marker it is highlighting, which is most of why a warm
    // ellipse read as an interface decal rather than as light on the grass.
    this.eligibleLayer = this.add.graphics().setDepth(GROUND_DEPTH + 2)
    this.projectedRing = this.add.graphics().setDepth(GROUND_DEPTH + 5)
    // A world object: it marks a place on the map, so it pans and zooms with
    // it. Its SIZE is divided by the zoom, so it stays constant on the glass.
    this.castCursor = new CastCursor(this, OVERLAY_DEPTH + 2)

    // THE DRAWER, behind its flag. `panelArea` is the space the HUD already
    // guarantees is clear of the counters, START WAVE, the gear, the ability
    // strip and CANCEL, so the drawer cannot cover any of them by
    // construction rather than by a check somebody remembers to run.
    this.drawer = new ControlDrawer(this, OVERLAY_DEPTH + 3, {
      area: () => this.layout.panelArea,
      viewW: () => viewW(this),
      // The camera that DRAWS it. Not `cameras.main`, which is the world.
      camera: () => this.uiCam,
      // The display's edge, not the usable area's: a drawer docks to the
      // screen. `panelArea` insets by six for chrome that floats inside it.
      dockRight: () => viewW(this) - safeAreaInsets().right,
      tiles: () => this.drawerTiles(),
      detailFor: (id) => this.drawerDetail(id),
      onSelect: (id) => {
        this.drawerPick = id
        // A NODE WAS ASKED FIRST: this tap is the answer, so build there
        // rather than leaving the player to tap the node they just tapped.
        // A CLOSE OR A DESELECT DROPS THE WAITING NODE WITH IT. There must be
        // no state in which a ring is pulsing and the drawer is shut, and a
        // node held with nothing to answer it is exactly that state.
        if (!id) this.pendingSpot = null
        if (id && this.pendingSpot) {
          const spot = this.pendingSpot
          this.pendingSpot = null
          this.placeFromDrawer(spot)
          return
        }
        // A pick is a cancellable state like an armed ability, so it lights
        // the same button. Closing the drawer clears the pick, which turns
        // the button off again — there is no path that leaves one without
        // the other.
        this.refreshCancel()
        this.drawSpots()
      },
    })
    // SCREEN SPACE, like every other piece of chrome GameScene draws. Without
    // this the drawer's rectangles are in CSS pixels and the world camera is
    // hit-testing them in WORLD coordinates — the tab draws where it should
    // and takes no presses, which is exactly what the probe found.
    this.asScreenSpace(this.drawer.objects)
    this.drawer.setEnabled(controlDrawerOn())
    this.reviveLabel = this.add.text(0, 0, '', {
      fontFamily: FONT_UI, fontSize: '20px', fontStyle: 'bold', color: COLOR.ink,
      stroke: '#0d1016', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(GROUND_DEPTH + 7).setVisible(false)
    this.laneWash = this.add.graphics().setDepth(GROUND_DEPTH + 4)
    // A WORLD object: it marks part of the map, so it pans and zooms with it.
    // Above the lane wash, because both can be up at once — an Ima Dummy Tower
    // is selected, its covered lane is painted, and now its rally area is being
    // asked for on top of that.
    this.targetArea = this.add.graphics().setDepth(GROUND_DEPTH + 5)
    this.rangeRing = this.add.graphics().setDepth(OVERLAY_DEPTH)
    this.targetRing = this.add.graphics().setDepth(OVERLAY_DEPTH + 1)

    // THE CENTRE OF THE BOARD, ON EVERY LEVEL. It used to be a per-map
    // `heroStart` measured against each painting, which meant every new map
    // owed a measurement and level 2 shipped one that put his head off the top
    // of the screen. The centre needs no measurement and cannot be wrong in
    // that way: the world is 1280x720 on every level, and a hero whose feet are
    // at 360 and who stands about 120 px tall reaches y=240, well inside it.
    this.hero = new Hero(this, HERO_START[0], HERO_START[1],
      heroDef, resolveHeroId(run.heroId))
    this.hero.on('revived', () => {
      play(this, 'build')
      logEvent('hero', 'revived where he fell')
      this.status.alert = `${heroDef.name} is back up.`
    })
    // The DAD MODE sting, on the frame the SUV appears rather than on the
    // frame he starts changing. Once per run by construction: the
    // transformation cannot re-arm inside an encounter.
    //
    // It follows the voice line rather than preceding it, which is what makes
    // it step back for it — the duck only reaches a cue that STARTS during a
    // line. See announceLastStand for the timing, and the voice bus in
    // Audio.ts for the rule.
    this.hero.on('transformed', () => {
      play(this, 'last-stand', 0.85)
      logEvent('hero', 'DAD MODE transformation complete')
    })
    // THE TRANSFORMATION HANDS THE POWER BACK. Slot 2 is gated on the powered
    // form, so a hero who changes with the clock half-run has a button that
    // has just become usable and is not usable yet — which reads as the gate
    // being broken rather than as a cooldown. Changing IS the recharge.
    this.hero.on('powered', () => {
      this.cooldowns.reset(SLOT2)
      logEvent('hero-power', `${heroDef.slot2.name} ready: ${heroDef.name} powered up`)
    })

    // A floor rather than a constant: the opening instruction is to build a
    // tower, so the purse has to cover the cheapest one this run actually drew.
    this.setPeanuts(openingPurse(
      RULES.startingPeanuts,
      RULES.startingPeanutsMargin,
      run.openingTowers.map((id) => TOWERS[id].cost),
    ))
    this.status.lives = RULES.startingLives
    this.status.wave = 0
    this.status.kills = 0
    this.status.peanutsEarned = 0
    this.status.phase = 'ready'
    // The mode, not the mirror. `syncTargeting` further down writes
    // `status.mode`, and it is the only thing that does.
    this.targeting.cancel('replaced')
    this.status.waveCount = this.level.waveTable.waves.length
    this.status.enemiesLeft = 0
    this.status.heroName = heroDef.name
    this.status.heroMax = heroDef.maxHealth
    this.status.heroHealth = heroDef.maxHealth
    this.status.heroDown = false
    this.status.heroPowered = false
    // Ascending, so the HUD draws them without knowing what either one means.
    // Both from data: the transformation from rules.json, Last Stand from this
    // hero's own entry in heroes.json.
    this.status.heroMarks = [heroDef.lastStand.healthThreshold, TRANSFORM_BELOW]
      .filter((v) => v > 0 && v < 1)
      .sort((a, b) => a - b)
    this.status.heroReviveIn = 0
    this.status.lastStand = false
    this.status.pendingAbility = null
    this.casting = false
    this.castUntil = 0
    this.status.abilities = [...run.abilities]
    // The rare drop does not survive a run, and is never drafted into one.
    this.status.rareAbility = null
    this.greeted = false
    this.politicianSpoke = false
    this.status.bossName = ''
    this.status.bossHealth = 0
    this.status.bossMax = 0
    this.nukeUsed = false
    this.status.unlockedTowers = run.openingTowers.slice(0, DRAFT.towersAtStart)

    // A run picked up where it was left. Everything above set a fresh run up;
    // this puts the saved one back over the top of it, and it happens here —
    // after the board, the hero and the purse exist, and before the countdown
    // is armed — because it rewrites what the countdown is counting towards.
    if (run.resumeFrom) {
      const saved = run.resumeFrom
      // Consumed once. A scene restart is not a second resume.
      setRunState({ resumeFrom: null })
      this.restoreRun(saved)
    }

    this.armReadyCountdown()

    for (const id of this.status.abilities) this.cooldowns.register(id, ABILITIES[id].cooldown)
    this.cooldowns.register(RULES.serverNuke.abilityId, ABILITIES[RULES.serverNuke.abilityId].cooldown)
    this.cooldowns.register(SLOT1, heroDef.slot1.cooldown)
    // The hero's own number, not a constant in here. All five are 12.5s; the
    // point is that changing it is a data edit.
    this.cooldowns.register(SLOT2, heroDef.slot2.cooldown)

    // THE WAY OUT OF EVERY MODE THE BOARD CAN BE IN.
    //
    // Arming an ability used to be escapable only with ESC or a right-click,
    // neither of which exists on a touch device. This button was added as the
    // touch route, and then playtesting found it DEAD — a tap on it did
    // nothing at all — and the mode it was the only exit from was a soft-lock.
    //
    // WHY IT WAS DEAD, because the shape of the mistake is worth keeping. The
    // loop below used to run over `cancelBtn.parts`, and `parts` is every
    // piece of the button INCLUDING ITS HIT RECTANGLE. Hiding the painted
    // plate art therefore hid the hit rectangle too, and Phaser's
    // `inputCandidate` excludes anything that would not render from the hit
    // test — so the rectangle was in the input list, its handler was wired,
    // its `input.enabled` flag was being set correctly by `setCancelVisible`,
    // and it could never be hit. The three usual suspects were all innocent:
    // nothing was on top of it, the handler was attached, and the flag was
    // right. It was `setVisible(false)` on the target itself.
    //
    // So the plates are named now (`plates`) and the loop cannot reach the
    // rectangle or the label by accident. See `plateButton`.
    //
    // WHERE IT IS. Bottom-right, on the ability row's own line, docked to the
    // display's right edge — see `HudLayout.cancel` for why it left the HUD
    // band it had been tidied into. DRAWN, NOT PLATED: the painted button
    // plate carries four rounded corners and a docked edge takes none, so it
    // wears the drawer's slab like the drawer's handle does. See `EdgeDock`.
    const cb = this.layout.cancel
    const CN = PRESENTATION.hud.cancel
    this.cancelSlab = this.add.graphics().setDepth(OVERLAY_DEPTH + 5)
    dockedSlab(this.cancelSlab, cb, 'right', {
      fill: CN.fill, outline: CN.outline, outlineWidth: CN.outlineWidth, radius: CN.radius,
    })
    // Built centred on the slab, so its hit rectangle covers the slab exactly.
    // The LABEL is then nudged right to make room for the glyph; the target is
    // not, because a target that is 15px off its own button is the next bug.
    this.cancelBtn = plateButton(this, cb.x + cb.width / 2, cb.y + cb.height / 2,
      cb.width, cb.height, CN.label,
      () => this.clearSelection('button'), CN.labelSize, 'secondary')
    this.cancelBtn.text.setX(cb.x + cb.width / 2 + CN.glyphSize)
    // The painted plate art goes for good — the slab is the button's surface
    // now. `plates` and not `parts`: see above.
    for (const plate of this.cancelBtn.plates) {
      (plate as Phaser.GameObjects.Image).setVisible(false)
    }
    for (const part of this.cancelBtn.parts) {
      (part as Phaser.GameObjects.Image).setDepth?.(OVERLAY_DEPTH + 6)
    }
    this.cancelBtn.text.setDepth(OVERLAY_DEPTH + 6).setColor(hexColour(CN.labelColour))
    // An X beside the word. A cancel that is only a word has to be read; a
    // cancel with a glyph is recognised, which is the difference between
    // finding the way out in a hurry and hunting for it.
    this.cancelGlyph = this.add.graphics().setDepth(OVERLAY_DEPTH + 6)
    this.drawCancelGlyph(cb, CN)
    this.asScreenSpace([this.cancelSlab, this.cancelGlyph, ...this.cancelBtn.parts])
    this.syncTargeting()

    // The camera goes on last, so bounds are set against a world that is
    // fully built. The world stays 1280x720; only the view moves.
    // Gestures belong to the run and die with it, so nothing can pan or zoom
    // on a menu after the scene stops.
    this.events.once('shutdown', () => {
      this.rig?.destroy()
      // A Spike Strip is scene state with a Graphics behind it; the scene is
      // restarted rather than rebuilt, so anything left here outlives the run.
      this.clearHazards()
    })
    // WHERE THE RUN OPENS: the whole board, not the hero.
    //
    // It used to open at the design zoom centred on the hero's start, which
    // frames about a third of the lane — the player could not see where
    // enemies enter, where the pads are, or where the gate is, which is the
    // one thing a tower defense player needs before the first wave.
    //
    // Note the camera does NOT follow anything, then or now: the rig's centre
    // is written by the constructor and by gestures, and by nothing else. The
    // wave screenshots of empty grass were this same fault — the camera sat
    // where the hero STARTED while the hero walked off — not a follow that
    // undid the opening frame.
    const board = boardBounds(
      this.level.map.waypoints, this.level.map.buildSpots, this.level.map.roadWidth, this.level.map.spotRadius,
      displayData.width, displayData.height, displayData.camera.openingMargin,
    )
    const cam0 = this.cameras.main
    const opening = openingView(
      cam0.width, cam0.height, board,
      coverZoom(cam0.width, cam0.height, displayData.width, displayData.height),
      displayData.camera.maxZoom * deviceScale(),
    )
    this.rig = new CameraRig(this, {
      worldWidth: displayData.width,
      worldHeight: displayData.height,
      startX: opening.x,
      startY: opening.y,
      startZoom: opening.zoom,
      // Scaled by the device ratio. These are screen pixels per world unit,
      // and a screen pixel is a device pixel now, so a band written against
      // CSS pixels would show three times as much map on a retina phone.
      // Cover zoom needs no such treatment: it is derived from the camera's
      // own size, which is already physical.
      defaultZoom: displayData.camera.defaultZoom * deviceScale(),
      maxZoom: displayData.camera.maxZoom * deviceScale(),
      minZoom: displayData.camera.minZoom * deviceScale(),
      boundsMarginPx: displayData.camera.boundsMarginPx,
      tapSlopPx: displayData.camera.tapSlopPx,
      panSpeed: displayData.camera.panSpeed,
      pinchDamping: displayData.camera.pinchDamping,
      followLambda: displayData.camera.followLambda,
      zoomLambda: displayData.camera.zoomLambda,
      momentumDecay: displayData.camera.momentumDecay,
      momentumMinSpeed: displayData.camera.momentumMinSpeed,
      // The gate. See `chromeUnderPointer` for why the rig has to ask rather
      // than each overlay having to remember to switch the rig off.
      claims: (p, over) => this.chromeUnderPointer(p, over),
    })

    this.refreshMenuOptions()
    this.setupInput()
    this.createPads()

    // What a crash report says about the run. Registered here and cleared on
    // shutdown, so a report taken from a menu does not describe a dead scene.
    provideState(() => ({
      scene: 'Game',
      phase: this.status.phase,
      wave: `${this.status.wave + 1}/${this.status.waveCount}`,
      lives: this.status.lives,
      peanuts: this.status.peanuts,
      kills: this.status.kills,
      enemies: this.enemies.length,
      towers: this.towers.length,
      boss: this.status.bossName || 'none',
      bossHealth: Math.round(this.status.bossHealth),
      hero: `${this.status.heroDown ? 'down' : 'up'} ${Math.round(this.status.heroHealth)}/${this.status.heroMax}`,
      abilities: this.status.abilities.join(','),
      rare: this.status.rareAbility ?? 'none',
      casting: this.casting,
      mode: this.status.mode,
      pending: this.status.pendingAbility ?? 'none',
      // Read defensively: the snapshot is taken on shutdown, and Phaser's own
      // plugins tear down before this handler runs. A state provider that
      // throws there loses the whole state, which is the one thing a report
      // taken after the run has to carry.
      //
      // Reported as a word rather than as 0 when the camera has gone. The
      // fallback used to be `?? 0`, which made "the camera was torn down" and
      // "the camera really was at zoom 0" the same line in a crash report —
      // and the second of those would be a serious bug worth chasing, so the
      // two must not look alike. Zoom is floored at cover zoom by `clampZoom`
      // and cannot reach 0 in play; a test asserts that.
      //
      // THREE NUMBERS, NOT ONE. The camera's `zoom` is DEVICE pixels per world
      // unit; the ceiling in display.json is 2.37 CSS pixels per world unit,
      // multiplied by the device ratio where the rig is built. A crash report
      // that printed only the raw number read as "zoom 4.825 against a 2.37
      // ceiling", which looked like a camera bug and was a units mismatch: on
      // a dpr-3 device 4.825 is a design zoom of 1.608, below the 1.72
      // default. Print the ratio and the design-space value beside it so that
      // reading is not available to anyone again.
      zoom: this.cameras?.main
        ? Number(this.cameras.main.zoom.toFixed(3))
        : 'unavailable (camera torn down)',
      dpr: deviceScale(),
      zoomDesign: this.cameras?.main
        ? Number((this.cameras.main.zoom / deviceScale()).toFixed(3))
        : 'unavailable (camera torn down)',
      zoomCeilingDesign: displayData.camera.maxZoom,
      escapedThisWave: this.escapedThisWave,
    }))
    // THE HUD BELONGS TO THE RUN, so the run starts it.
    //
    // It used to be launched by whoever started this scene, and only one of
    // the two callers did it: LoadoutScene launched it after `start('Game')`
    // and TitleScene's resume path did not. A resumed run therefore played
    // with no HudScene at all — no counters, no start-wave button, no
    // settings, no ability bar — while the world underneath it restored
    // perfectly, which is why it read as "the UI is broken" rather than as
    // "a scene is missing".
    //
    // Owned here instead, because there is no path into a run that does not
    // come through this create(). Guarded so a scene restart does not launch a
    // second copy over the first.
    if (!this.scene.isActive('Hud')) this.scene.launch('Hud')

    setRunActive(true)
    logEvent('scene', 'Game started')
    // A paused run is not a frozen one. The loop legitimately stops beating
    // behind the pause dialog, behind the portrait overlay and while the tab
    // is in the background, and a watchdog that cried freeze at each of those
    // would bury the one report that matters.
    this.events.on(Phaser.Scenes.Events.PAUSE, () => setRunActive(false))
    this.events.on(Phaser.Scenes.Events.RESUME, () => setRunActive(true))
    this.events.once('shutdown', () => {
      setRunActive(false)
      provideState(null)
    })
  }

  // ---------------------------------------------------------------- setup

  /**
   * The map is one painted plate rather than tiles. It is 16:9 like the
   * canvas, so it scales to fill with no letterboxing and canvas pixels are
   * the map's own coordinate space.
   */
  private drawPlate(): void {
    const plate = this.add.image(0, 0, ART.map[this.level.map.plate]).setOrigin(0, 0).setDepth(GROUND_DEPTH)
    this.createArchOccluders()
    plate.setDisplaySize(displayData.width, displayData.height)
  }

  /**
   * The signs. Every board is painted into the plate blank, and the lettering
   * is an overlay drawn on top of it in the rectangle map.json records, rotated
   * to match the board. They sort by their own foot like everything else.
   *
   * The innkeeper's is the only one with a state — the bribe swaps its texture.
   * The tavern's hangs from a beam and never changes, so it is a plain image
   * with nothing bound to it.
   */
  private buildSign(): void {
    const w = displayData.width
    const h = displayData.height
    const map = this.level.map

    // Signs are scenery a level either has or does not. Level 2 is a corridor
    // with no village in it and no boards to letter, so they are built only
    // where the map declares them and `sign` stays undefined otherwise — the
    // tap path checks.
    if (map.signs) {
      this.sign = new SignBribe(this, map.signs.held, w, h, RULES.signBribe)
      this.sign.setDepth(this.sign.depthY)

      const tavernArt = this.textures.get(ART.prop.signTavern).getSourceImage()
      const tavern = fitAspect(placeSign(map.signs.tavern, w, h),
        tavernArt.width / tavernArt.height)
      this.add.image(tavern.x, tavern.y, ART.prop.signTavern)
        .setDisplaySize(tavern.width, tavern.height)
        .setRotation(tavern.rotationRad)
        .setDepth(tavern.footY)
    }
  }

  /**
   * Paying the villager. He buys nothing — no stats, no tower, no advantage —
   * so the only thing that changes is the sign and the size of your wallet.
   */
  private tapSign(): void {
    const sign = this.sign
    if (!sign) return
    const cfg = RULES.signBribe
    switch (sign.tap(this.status.peanuts)) {
      case 'done':
        this.status.alert = cfg.paidToast
        return
      case 'broke':
        play(this, 'broke')
        this.status.alert = cfg.brokeToast
        return
      default:
        break
    }

    // Ask before spending. This used to take the peanuts on the tap itself.
    this.openDialog({
      title: cfg.confirmTitle,
      subtitle: cfg.confirmBody,
      rows: [
        { label: 'Cost', value: `${cfg.cost} peanuts`, accent: true },
        { label: 'You have', value: `${this.status.peanuts} peanuts` },
        { label: 'You get', value: 'A better sign' },
      ],
      confirm: {
        label: cfg.confirmLabel,
        onPick: () => {
          // Re-check: the tax or a tower could have taken the peanuts while the
          // dialog was open, since the wave keeps running underneath it.
          if (this.status.peanuts < cfg.cost) {
            play(this, 'broke')
            this.status.alert = cfg.brokeToast
            return
          }
          this.setPeanuts(this.status.peanuts - cfg.cost)
          sign.pay()
          play(this, 'peanuts', 0.9)
          this.status.alert = cfg.paidToast
        },
      },
    })
  }

  /**
   * The map fills the screen, corner to corner.
   *
   * There is deliberately no `setViewport` here. An earlier version inset the
   * world camera by a reserved strip at the top and bottom so that no game
   * object could be drawn into the HUD. It worked, and it was the wrong trade:
   * on a phone the two strips cost a third of the screen, and Kingdom Rush —
   * which is the reference — has no bars at all. The HUD floats over the board
   * instead, and the overlaps are solved in HudLayout by giving every element
   * a rectangle of its own.
   */
  private applyBands(): void {
    // Belt as well as braces. The listener is unregistered on shutdown now,
    // but a `resize` already queued when the scene stopped can still be
    // delivered afterwards — so this has to survive being called once more
    // rather than trusting that it never will be.
    if (!sceneIsLive(this)) return
    // Two different units, deliberately, and this is the one place in the game
    // where both appear in the same function.
    //
    // The world camera's VIEWPORT is the canvas, so it is physical pixels: set
    // it in CSS pixels and the world renders into the top-left ninth of a
    // retina canvas. The HUD band arithmetic below is a LAYOUT, so it is CSS
    // pixels, like every other layout in the game.
    this.cameras.main.setViewport(0, 0, this.scale.width, this.scale.height)
    this.ownLayout = hudLayout(
      {
        width: viewW(this), height: viewH(this),
        insets: safeAreaInsets(), countersWidth: 0, abilitiesWidth: 0,
      },
      LAYOUT,
    )
    this.rig?.viewportChanged()
  }

  /**
   * A pointer's position on the map.
   *
   * Not `pointer.worldX`: that is resolved against whichever camera Phaser
   * decided the pointer was over, and this scene has two — with the world
   * camera now inset by the top band, picking the wrong one puts every tap a
   * band's height out. Asking the world camera directly cannot be ambiguous.
   */
  private worldAt(p: Phaser.Input.Pointer): { x: number; y: number } {
    return this.cameras.main.getWorldPoint(p.x, p.y)
  }

  /**
   * Marks objects as screen space: fixed size, fixed position, drawn only by
   * the UI camera. Anything the player is meant to press belongs here, or it
   * would slide and shrink as the map is panned and zoomed under it.
   */
  private asScreenSpace(objects: Phaser.GameObjects.GameObject[]): void {
    this.screenSpace.push(...objects)
    this.syncCameras()
  }

  /**
   * Splits the scene between the two cameras.
   *
   * The world camera draws the map, towers, enemies, hero and shots, and is
   * the only camera the player can move. The UI camera draws the screen-space
   * objects and never transforms.
   *
   * Recomputed rather than applied once, because enemies, projectiles and
   * effects are created constantly: an object born after the last split would
   * be drawn by *both* cameras, appearing twice — once in the world and once
   * pinned to the screen at the wrong size.
   */
  private syncCameras(): void {
    const world: Phaser.GameObjects.GameObject[] = []
    const ui: Phaser.GameObjects.GameObject[] = []
    for (const o of this.children.list) {
      (this.screenSpace.includes(o) ? ui : world).push(o)
    }
    if (ui.length > 0) this.cameras.main.ignore(ui)
    if (world.length > 0) this.uiCam.ignore(world)
    this.splitAt = this.children.list.length
  }

  /**
   * Says no, visibly. Sets the guidance line and raises an alert the HUD
   * surfaces as a toast, so a tap that cannot do anything still looks like it
   * was received.
   */
  private refuse(text: string): void {
    this.status.alert = text
    play(this, 'error')
  }

  /**
   * True while any modal owned by the world is up.
   *
   * Every modal, not just `dialog`. This getter used to name only the dialog,
   * so a scratch card left the camera live and left the whole HUD live with
   * it. One list, and everything that has to stand down — the HUD, the camera
   * rig, the world's own tap handling — asks this one question.
   *
   * The build menu and the tower panel are deliberately absent: both are
   * anchored, non-modal panels that leave the board playable behind them.
   */
  get modalOpen(): boolean {
    return this.dialog?.active === true
      || this.ticket?.active === true
      || this.nukeEarned?.active === true
      || this.nukeLaunch?.active === true
  }

  /**
   * Peanuts taken in, as opposed to peanuts recovered.
   *
   * Every income route goes through here so the run total on the results
   * screen cannot drift from the purse. Selling a tower deliberately does not:
   * refunding your own money is not earning.
   */
  private earn(amount: number): void {
    this.setPeanuts(this.status.peanuts + amount)
    this.status.peanutsEarned += amount
    logEvent('peanuts', `+${amount} -> ${this.status.peanuts}`)
  }

  /**
   * THE ONE PLACE THE BALANCE CHANGES.
   *
   * It was nine places, and every one of them wrote the field directly. That
   * is why an open build panel went stale: the panels priced themselves once,
   * when they were built, and nothing told them the number had moved. A player
   * who opened a tower one peanut short and then earned three watched the
   * BUILD button stay dead until they closed the panel and opened it again.
   *
   * So the write is a method, and re-pricing hangs off it. Same shape as the
   * mode mirrors: one writer, called from one place per transition.
   */
  private setPeanuts(next: number): void {
    const value = Math.max(0, Math.round(next))
    if (value === this.status.peanuts) return
    this.status.peanuts = value
    this.refreshAffordability()
  }

  /**
   * Re-prices whatever panel is open, and ONLY when the answer changed.
   *
   * Peanuts arrive on every kill, so this runs dozens of times a wave;
   * rebuilding a ring each time to redraw exactly the same thing would be its
   * own bug. The affordability flags are compared first and the rebuild is
   * skipped unless one of them flipped -- which is a handful of times a run.
   */
  private refreshAffordability(): void {
    if (this.ring?.active && this.ringOptions) {
      const next = this.ringOptions()
      const now = this.ring.affordability
      const moved = next.length !== now.length
        || next.some((o, i) => now[i]?.id !== o.id || now[i]?.affordable !== o.affordable)
      if (moved) this.ring.refreshOptions(next)
    }
    if (this.drawer?.open === true) {
      const next = this.drawerTiles()
      // The drawer already takes its tiles as a FUNCTION, so `refresh()`
      // re-reads them; it was simply never called when the balance moved.
      const moved = next.length !== this.drawerAfford.length
        || next.some((t, i) => this.drawerAfford[i] !== t.affordable)
      if (moved) {
        this.drawerAfford = next.map((t) => t.affordable)
        this.drawer.refresh()
      }
    }
  }

  /**
   * Hero state, logged when it changes rather than every frame.
   *
   * 500 events is three or four waves; a per-frame readout would be one
   * second of play and would push out everything that led up to a crash.
   */
  private noteHeroState(): void {
    const now = `${this.status.heroDown ? 'down' : 'up'}/${this.status.lastStand ? 'laststand' : 'normal'}`
    if (now === this.lastHeroState) return
    this.lastHeroState = now
    logEvent('hero', now)
  }

  /** One dialog at a time, and it owns every tap while it is up. */
  private openDialog(opts: DialogOptions): void {
    this.dialog?.close()
    this.dialog = new Dialog(this, viewW(this) / 2, viewH(this) / 2,
      TICKET_DEPTH, opts)
    this.asScreenSpace(this.dialog.objects)
    // Panning is off while a modal owns the screen, and back on when it goes.
    this.rig.setEnabled(false)
    this.dialog.onClosed(() => this.releaseDialog())
  }

  private get placing(): boolean {
    return this.ring?.active === true
  }

  /**
   * Every free building pad, always visible.
   *
   * A player cannot choose where to build if finding a spot means tapping the
   * map at random, so the pads are part of the map's furniture rather than a
   * mode. Each is a painted marker anchored on the ground at its spot and
   * drawn at `GROUND_DEPTH`, which is below every entity: towers, enemies and
   * the hero all sort by their own y and no map coordinate is negative, so a
   * pad can never draw over something standing on it.
   *
   * Built once and thereafter only shown, hidden and tinted. The alternative
   * was creating and destroying seven sprites on every hover.
   */
  /**
   * The decoration layer.
   *
   * Laid out by rule from a fixed seed rather than by hand, so it is identical
   * every run and "more" or "fewer" is one number in presentation.json rather
   * than an afternoon of dragging. Every placement is inert: no hit area, no
   * pointer events, nothing that can take a tap meant for the board.
   *
   * Depth sits above the map plate and below the build pads, and every entity
   * sorts by its own y from 0 upward, so a prop can never draw over a unit.
   */
  /**
   * The near pier of the archway, lifted out of the map plate and put in
   * front of the enemies walking out from behind it.
   *
   * WHICH PARTS, AND WHY ONLY ONE. The road runs left to right and descends,
   * so the gateway's two piers are not side by side across it. The near pier
   * is planted below the road's near edge; the far pier and the span stand
   * above its far edge. That makes the far pier and the span BEHIND everything
   * on the road, and the map plate already draws them at the bottom of the
   * depth order — they need no occluder, and giving them one is what broke it.
   *
   * They had one: a 20x112 RECTANGLE over the far pier at x 98-118. The
   * painted column is x 88-118, so the rectangle cut it in half down its
   * length — the stones left of the cut stayed at plate depth and the stones
   * right of it jumped to depth 398. An enemy walking out then drew over one
   * half of the pier and under the other, which is the split the recording
   * shows. Its depth of 398 was the rectangle's base rather than the pier's:
   * the painted base is y 388, and the road there runs y 375 to 411.
   *
   * The near pier is cut to its painted OUTLINE, not to a box. A box around it
   * contains road and grass, and this piece is drawn in FRONT of enemies — so
   * a box would paint a copy of the road over anyone standing on it, which is
   * a worse artefact than the one being fixed.
   *
   * Cropped at the plate's own resolution and scaled down on the way out, so
   * the pier carries exactly the detail the plate does and no less.
   */
  private createArchOccluders(): void {
    // No arch, nothing to cut out of the plate. Level 2's lane runs off the
    // edge of its board rather than through stonework, so there is no piece
    // of scenery that has to be drawn in FRONT of the units on the road.
    const entrance = this.level.map.entrance
    if (!entrance) return

    // The level's OWN plate, not level 1's. This read the level 1 key
    // directly, which was invisible while there was one level and would have
    // cropped a piece of the village out of the volcanic board.
    const plate = this.textures.get(ART.map[this.level.map.plate])
    const img = plate?.getSourceImage() as CanvasImageSource | undefined
    if (!img) return
    const srcW = plate.source[0]?.width ?? 0
    if (srcW <= 0) return
    // The plate is authored larger than the world box it covers.
    const perWorld = srcW / displayData.width

    const near = entrance.arch.near
    const pts = near.outline as Array<[number, number]>
    if (pts.length < 3) return
    const xs = pts.map((q) => q[0])
    const ys = pts.map((q) => q[1])
    const box = {
      x: Math.min(...xs), y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys),
    }

    const key = 'gen-arch-near'
    if (!this.textures.exists(key)) {
      const sw = Math.round(box.w * perWorld)
      const sh = Math.round(box.h * perWorld)
      const canvas = this.textures.createCanvas(key, sw, sh)
      if (!canvas) return
      const ctx = canvas.context
      // THE OUTLINE IS THE CLIP. Everything outside the painted stone stays
      // transparent, so nothing but stone is ever drawn in front of a unit.
      ctx.save()
      ctx.beginPath()
      for (const [i, [wx, wy]] of pts.entries()) {
        const px = (wx - box.x) * perWorld
        const py = (wy - box.y) * perWorld
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.clip()
      ctx.drawImage(
        img, Math.round(box.x * perWorld), Math.round(box.y * perWorld), sw, sh, 0, 0, sw, sh,
      )
      ctx.restore()
      canvas.refresh()
    }
    const piece = this.add.image(box.x + box.w / 2, box.y + box.h / 2, key)
    piece.setDisplaySize(box.w, box.h)
    // Its painted base, which is what a y-sort would give it. Every enemy on
    // this stretch of road is above it, so it is in front of all of them.
    piece.setDepth(near.depth)
    this.archOccluders.push(piece)
  }

  private createPads(): void {
    const signKey = ART.prop.buildPad
    // THE ASSET THAT BLANKED THE GAME, and what is different now.
    //
    // The quiet marker used to be an optional manifest hook — a key and a path
    // agreed before the art was drawn. The art never arrived, so every pad
    // took the fallback and the board carried SEVEN full-size signs shouting
    // the same joke. It was propped up with a procedurally drawn disc, which
    // is gone: the painted flagstone is here and it is REQUIRED art now, so an
    // absent file is an error with a banner on it rather than a hook quietly
    // doing nothing.
    //
    // The existence check stays regardless. Required means boot SAYS so and
    // keeps going, and what "keeps going" means here is every spot falling
    // back to the sign — a loud, wrong-looking board that still plays, rather
    // than seven invisible pads nobody can find.
    const quietKey = ART.prop.buildPadQuiet
    const hasQuiet = !!quietKey && this.textures.exists(quietKey)
    const cfg = PRESENTATION.buildPad
    const n = this.build.spots.length

    // Exactly ONE sign, at the spot nearest where the enemies come in, because
    // that is where the player looks first. Seven of them was seven copies of
    // the same joke shouting over the board they are standing on.
    const entrance = this.build.spots.length > 0 ? this.level.map.waypoints[0]! : [0, 0]
    let signIndex = 0
    let best = Infinity
    this.build.spots.forEach((spot, i) => {
      const d = Math.hypot(spot.x - entrance[0]!, spot.y - entrance[1]!)
      if (d < best) { best = d; signIndex = i }
    })
    this.signSpotIndex = signIndex

    // Deterministic per spot, so the jitter is part of the map's furniture and
    // not a thing that shuffles between sessions.
    const jitter = makeRng(0x5EED ^ this.build.spots.length)

    // Screen pixels to world pixels. Derived rather than stored, so moving the
    // zoom band cannot silently resize the pad — which is the failure mode the
    // last two art passes both had.
    const quietWorldWidth = cfg.quietScreenWidth / displayData.camera.defaultZoom

    this.pads = this.build.spots.map((spot, i) => {
      const isSign = i === signIndex || !hasQuiet
      const key = isSign ? signKey : quietKey!
      const img = this.add.image(spot.x, spot.y, key).setDepth(GROUND_DEPTH + 5)
      applyRender(img, key)
      if (isSign) {
        fitContentHeight(img, key, cfg.signHeight)
      } else {
        // Sized by WIDTH, in screen pixels at the default zoom, because that
        // is the unit the size was specified in and the only one that means
        // anything for a thing you look at. A slab's height is whatever the
        // perspective makes it.
        //
        // Varied so seven of them do not read as one object stamped seven
        // times: about a tenth of scale per instance.
        fitContentWidth(img, key, quietWorldWidth)
        img.setScale(img.scale * (1 + (jitter() * 2 - 1) * cfg.quietJitterScale))
        img.setRotation(((jitter() * 2 - 1) * cfg.quietJitterDegrees) * Math.PI / 180)
        img.setAlpha(cfg.quietAlpha)
      }
      const base = img.scale
      // A slow breath, so an empty pad reads as something to press rather than
      // as scenery. Scale only: the tint carries the state, and two things
      // writing one property fight.
      //
      // Phase-offset per pad. Seven pads pulsing in unison read as a warning
      // light rather than as an invitation.
      this.tweens.add({
        targets: img,
        scale: { from: base, to: base * cfg.pulseScale },
        duration: cfg.pulseMs,
        delay: (i * cfg.pulseMs) / Math.max(1, n),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
      return img
    })
    this.drawSpots()
  }

  /** Shows the pads still free, and lights the one under the cursor. */
  private drawSpots(): void {
    const cfg = PRESENTATION.buildPad
    const placing = this.placing
    const tint = (hex: string): number => Phaser.Display.Color.HexStringToColor(hex).color
    for (const spot of this.build.spots) {
      const img = this.pads[spot.index]
      if (!img) continue
      // A pad with a tower on it is gone; the tower is standing there now.
      const free = this.build.isFree(spot.index)
      img.setVisible(free)
      if (!free) continue
      const hot = this.hoverSpot?.index === spot.index
      img.setTint(tint(hot ? cfg.hoverTint : placing ? cfg.placingTint : cfg.restTint))

      // EVERY NODE THAT CAN TAKE THE PICK PULSES; the rest stay plain.
      //
      // A scale beat rather than a fourth tint. The pads already carry three
      // tints — rest, hover, placing — and a fourth colour would be one
      // nobody can name against the painted grass. Size is unambiguous at a
      // glance and survives the map's palette.
    }
    this.drawEligibleNodes()
  }

  /**
   * A pulsing ring around every node that will take the drawer's pick.
   *
   * NOT a scale or a tint on the pad itself, and both for the same reason:
   * they are taken. The pads already carry an ambient scale tween — every one
   * of them, always, staggered — and three tints for rest, hover and placing.
   * Writing either from here would mean two things fighting over one
   * property, which is the bug the tint/scale split was drawn to prevent.
   *
   * So eligibility is its OWN mark, on the marker layer, and "plain" is
   * simply the absence of it.
   */
  private drawEligibleNodes(): void {
    this.eligibleLayer.clear()
    // TWO WAYS TO HAVE A RING. A tower is picked, so every node that would
    // take it pulses; or a NODE is picked and waiting for a tower, so that one
    // node pulses on its own. There is no state with a ring and a shut drawer:
    // closing it clears both.
    if (!this.drawerPick && !this.pendingSpot) return
    const d = PRESENTATION.drawer
    // One rhythm for all of them: a set beats together, six phases is noise.
    const t = (this.time.now % d.nodePulseMs) / d.nodePulseMs
    const beat = 0.5 + 0.5 * Math.sin(t * Math.PI * 2)
    // TWO STROKES, dark then bright, the way a painted line on dirt has a
    // shadow in the groove it sits in. One bright stroke was legible on grass
    // and vanished on light dirt and where the ring crosses the road, and the
    // dark pass is what holds it together across all three.
    //
    // Everything beats: both alphas, both widths, and the radius. A pulse that
    // moves only the radius, by a fifth of a stroke width, is a change of
    // almost nothing into almost nothing.
    const lerp = ([a, b]: number[], k: number) => a! + k * (b! - a!)
    const ringed = this.pendingSpot
      ? this.build.spots.filter((sp) => sp.index === this.pendingSpot!.index)
      : this.build.spots.filter((sp) => this.nodeTakesPick(sp))
    for (const spot of ringed) {
      const r = this.level.map.spotRadius * (1 + d.nodePulseScale * beat)
      const w = r * 2
      const h = r * 2 * PAD_SQUASH
      this.eligibleLayer.fillStyle(d.nodeRingFill, lerp(d.nodeRingFillAlpha, beat))
      this.eligibleLayer.fillEllipse(spot.x, spot.y, w, h)
      this.eligibleLayer.lineStyle(lerp(d.nodeRingUnderWidth, beat),
        d.nodeRingUnder, lerp(d.nodeRingUnderAlpha, beat))
      this.eligibleLayer.strokeEllipse(spot.x, spot.y, w, h)
      this.eligibleLayer.lineStyle(lerp(d.nodeRingEdgeWidth, beat),
        d.nodeRingEdge, lerp(d.nodeRingEdgeAlpha, beat))
      this.eligibleLayer.strokeEllipse(spot.x, spot.y, w, h)
    }
  }

  /**
   * The hero's selection ring and his rally marker.
   *
   * Redrawn every frame because he walks. The marker stays after he arrives:
   * it is the standing order, not a travel animation.
   */
  private drawHeroMarkers(): void {
    this.markerLayer.clear()
    this.reviveLabel.setVisible(false)
    if (this.status.phase === 'won' || this.status.phase === 'lost') return

    // Down: mark the spot he comes back to and count it down there, so the
    // player knows both *that* he returns and *where*. PROTOTYPE-GAP 2.6.
    if (this.hero.down) {
      const p = this.hero.returnPoint
      // realSeconds, because the number is on the player's screen and the
      // player is counting on their own watch. reviveIn is in game seconds.
      const secs = Math.max(0, Math.ceil(realSeconds(this.hero.reviveIn, 1)))
      // A slow pulse, so a marker on an otherwise still patch of grass reads
      // as a timer rather than as scenery.
      const beat = 0.5 + 0.5 * Math.sin(this.time.now / 260)
      const w = 46 + beat * 6
      this.markerLayer.fillStyle(0xff8f7a, 0.2 + beat * 0.1)
      this.markerLayer.fillEllipse(p.x, p.y, w, w * PAD_SQUASH)
      this.markerLayer.lineStyle(3, 0xff8f7a, 0.7 + beat * 0.3)
      this.markerLayer.strokeEllipse(p.x, p.y, w, w * PAD_SQUASH)
      // A world object, so it stays on the spot as the map pans — but scaled
      // against the camera so it reads the same size at every zoom. Left at
      // world scale it was 34px on the glass at the default zoom and covered
      // the build pad beside it.
      this.reviveLabel.setScale(1 / this.cameras.main.zoom)
      this.reviveLabel.setText(`BACK IN ${secs}s`)
      this.reviveLabel.setPosition(p.x, p.y - 22).setVisible(true)
      return
    }

    // STATE 2 and 3, and nothing else.
    //
    // What used to be drawn here, every frame, whether or not the player had
    // asked for anything: a rally flag, a filled ellipse under it, the yellow
    // Depreciation disc with rotating rim ticks, the block-range ellipse, and
    // a green bracket with corner ticks around him. Five indicators on one
    // patch of grass. They are gone; see HeroMarkers for what replaced them.
    const M = PRESENTATION.heroMarkers
    const ringW = this.hero.spriteWidth * M.footRing.widthFraction

    const foot = this.markers.footRing()
    if (foot && !this.hero.down) {
      const y = this.hero.y + this.hero.footOffsetY
      this.markerLayer.lineStyle(M.footRing.strokeWidth, MARKER_BLUE, foot.alpha)
      this.markerLayer.strokeEllipse(this.hero.x, y, ringW, ringW * PAD_SQUASH)
    }

    const move = this.markers.moveRing()
    if (move) {
      const rx = (ringW / 2) * move.scale
      const ry = rx * PAD_SQUASH
      this.markerLayer.lineStyle(M.moveRing.strokeWidth, MARKER_BLUE, move.alpha)
      // Dashes as short polylines along the ellipse: Graphics has no dashed
      // stroke, and an arc() on a squashed circle is not the same shape.
      for (const [a0, a1] of dashArcs(M.moveRing.dashes, M.moveRing.dashFraction, move.phase)) {
        this.markerLayer.beginPath()
        const steps = 5
        for (let i = 0; i <= steps; i++) {
          const a = a0 + (a1 - a0) * (i / steps)
          const px = move.x + Math.cos(a) * rx
          const py = move.y + Math.sin(a) * ry
          if (i === 0) this.markerLayer.moveTo(px, py)
          else this.markerLayer.lineTo(px, py)
        }
        this.markerLayer.strokePath()
      }
    }

    // Kept, and deliberately: this is not a selection or move marker, it is
    // damage feedback. While the window is open he takes extra damage for
    // having been pulled out of a fight, and it lasts about a second.
    if (this.hero.retreatVulnerableFor > 0) {
      const w = this.hero.halfFootprint * 2 + 22
      const y = this.hero.y + this.hero.footOffsetY
      const beat = 0.5 + 0.5 * Math.sin(this.time.now / 110)
      this.markerLayer.lineStyle(3, 0xff8f7a, 0.45 + beat * 0.4)
      this.markerLayer.strokeEllipse(this.hero.x, y, w, w * PAD_SQUASH)
    }
  }

  /** The tower table, exposed so a harness run can price a decision the way
   *  the build menu does. */
  get towerDefs(): Record<string, TowerDef> {
    return TOWERS
  }

  /** Wave and enemy tables, for a harness run reporting on the curve. */
  get waveDefs(): WavesDef['waves'] {
    return this.level.waveTable.waves
  }

  get enemyDefs(): Record<string, EnemyDef> {
    return ENEMIES
  }

  private refreshMenuOptions(): void {
  }

  /**
   * DOES THIS POINTER BELONG TO CHROME RATHER THAN TO THE BOARD?
   *
   * ONE QUESTION, TWO ASKERS, and that is the whole of the fix for the drawer
   * panning the map. The board asks it to decide whether a tap is its to act
   * on; the camera rig asks it to decide whether a drag is its to pan with.
   * They used to be different questions with different answers:
   *
   *   - the board asked a hand-written list of overlays plus `hudTakesPress`;
   *   - the rig asked `cameraAcceptsGestures(modalOpen)`, i.e. "is a MODAL
   *     up?" — and nothing else.
   *
   * So every non-modal overlay leaked. The drawer is not a modal. Neither is
   * the ability bar, the settings gear, the counter plates or a tower ring.
   * The earlier fix for this — the one the scratch card got — added the modal
   * gate, which is why it held for exactly one overlay and no others: it was
   * never a general answer, it was the answer for the thing in front of it.
   *
   * Three sources, and between them they cover everything that is drawn:
   *
   *   1. `screenSpace` — every object this scene draws as chrome. Registration
   *      is `asScreenSpace`, which an overlay must already call or it would
   *      pan and zoom with the map, so a NEW overlay is covered the day it is
   *      written and cannot forget.
   *   2. The drawer, which resolves against its own laid-out rectangles rather
   *      than through the hit list — see `ControlDrawer.press`.
   *   3. `hudBlocksGesture`, for HudScene. A different scene's objects are
   *      never in this scene's hit list, so no amount of hit-testing here can
   *      see the ability bar. Its geometry is the only handle we have on it.
   *
   * `over` is Phaser's own hit list for the event, passed through rather than
   * recomputed, so the answer is resolved against the same objects the engine
   * used to dispatch it.
   */
  chromeUnderPointer(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[] = []): boolean {
    // A modal owns the entire screen by definition, including the parts of it
    // that are not drawn on.
    if (this.modalOpen || this.hudModalOpen) return true
    const ui = pointerToScreen(this, p, this.uiCam)
    if (hudBlocksGesture(this.layout, ui.x, ui.y)) return true
    if (this.drawer?.ownsPress(ui.x, ui.y) === true) return true
    const hits = over.length > 0 ? over : this.input.hitTestPointer(p)
    for (const o of hits) if (this.screenSpace.includes(o)) return true
    return false
  }

  /**
   * Whether the HUD has a dialog of its own up — the pause and settings panels.
   *
   * Asked structurally rather than through an import: HudScene imports this
   * file for the world it draws, and importing it back would be a cycle. What
   * is needed is one boolean, and a scene that does not answer is a scene with
   * no modal.
   */
  private get hudModalOpen(): boolean {
    const hud = this.scene.get('Hud') as unknown as { modalOpen?: boolean } | null
    return hud?.modalOpen === true
  }

  private setupInput(): void {
    this.input.mouse?.disableContextMenu()
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.updateHover(p))
    // Two halves, deliberately. Whether the press belonged to a piece of UI can
    // only be answered at press time — a build-menu cell is destroyed by its own
    // handler before the release arrives, so asking the hit list then finds
    // nothing and the world acts on a tap that was never meant for it. Whether
    // the gesture was a pan can only be answered at release. So the press
    // records the first and the release checks the second.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      // A FIFTH INSTANCE OF THE SAME BUG, found while adding the helper that
      // exists to stop it. `p.x`/`p.y` are CANVAS pixels and the HUD
      // rectangles are CSS pixels: at devicePixelRatio 3 on an 844px screen
      // the pointer runs to 2532 while START WAVE spans 594..834, so a tap a
      // third of the way across the board tested as a tap on the button and
      // the map ignored it. Converted through the UI camera, which is the
      // camera those rectangles are drawn by.
      const ui = pointerToScreen(this, p, this.uiCam)
      // The drawer is asked FIRST and asked with `claimsPress`, which consumes
      // its record of the press. The drawer has ALREADY handled this press by
      // the time we get here and may have collapsed the panel the tap landed
      // in, so `owns` asked afterwards answers about a panel that is gone. The
      // camera rig asked the same question a moment ago through `ownsPress`,
      // which does not consume; exactly one reader consumes, and it is this one.
      this.pressTakenByUi =
        this.drawer.claimsPress(ui.x, ui.y)
        || (this.ring?.active === true && this.ring.owns(over))
        || (this.ticket?.active === true && this.ticket.owns(over))
        || this.dialog?.owns(over) === true
        || this.nukeEarned?.owns(over) === true
        || this.nukeLaunch?.owns(over) === true
        || this.chromeUnderPointer(p, over)
    })
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.pressTakenByUi) return
      // A drag that moved the camera is a pan, not a tap. Without this the
      // release at the end of every pan would build, select or order.
      if (this.rig.consumedGesture) return
      this.onClick(p)
    })
    this.input.keyboard?.on('keydown-ESC', () => this.clearSelection('key'))
    this.input.keyboard?.on('keydown-SPACE', () => this.startWave())
    this.input.keyboard?.on('keydown-Q', () => this.armAbility(this.status.abilities[0]))
    this.input.keyboard?.on('keydown-W', () => this.armAbility(this.status.abilities[1]))
    // The rare drop gets its own key, since it arrives after the hand is dealt.
    this.input.keyboard?.on('keydown-F', () => this.armAbility(this.status.rareAbility ?? undefined))
    this.input.keyboard?.on('keydown-E', () => this.castHeroSlot1())
    this.input.keyboard?.on('keydown-R', () => {
      if (this.status.phase === 'won' || this.status.phase === 'lost') this.toTitle()
    })
  }

  private onClick(p: Phaser.Input.Pointer): void {
    if (p.rightButtonDown()) {
      this.clearSelection()
      return
    }
    if (this.status.phase === 'won' || this.status.phase === 'lost') return
    const w = this.worldAt(p)

    // AN ARMED ABILITY OWNS THE NEXT TAP, wherever it lands on the board.
    //
    // A legal point casts it. Anything else LEAVES the mode rather than
    // refusing and staying in it: refusing was the behaviour that made a
    // mistaken arm feel like a soft-lock, because the only thing any tap could
    // do was keep the player where they were. Nothing is spent either way, so
    // backing out costs the ability nothing.
    const pending = this.targeting.request
    if (pending?.kind === 'power') {
      const p = this.hero.def.slot2
      const tap = this.targeting.resolveTap(
        withinCastRange(p, { x: this.hero.x, y: this.hero.y }, w.x, w.y),
      )
      if (tap?.reason === 'commit') {
        this.syncTargeting()
        this.firePower(w.x, w.y)
        return
      }
      this.clearSelection('outside')
      this.status.alert = `${p.name} only reaches so far. Still ready — tap the medallion again.`
      play(this, 'error')
      return
    }
    if (pending?.kind === 'ability') {
      const def = ABILITIES[pending.id]
      const tap = this.targeting.resolveTap(
        def !== undefined && this.validCastPoint(def, w.x, w.y),
      )
      if (tap?.reason === 'commit') {
        this.syncTargeting()
        this.fireAbility(pending.id, w.x, w.y)
        return
      }
      this.clearSelection('outside')
      this.status.alert = def?.pathOnlyWithin !== undefined
        ? `${def.name} goes on the road. Still ready — tap the icon to try again.`
        : `${def?.name ?? 'That'} cancelled. Still ready.`
      play(this, 'error')
      return
    }

    // The sign sits off the lane with no pad under it, so it can take its tap
    // first without ever stealing one from a build spot.
    if (this.sign?.owns(this.input.hitTestPointer(p))) {
      this.tapSign()
      return
    }

    // Precedence, most specific target first. A building pad is a deliberate
    // target: it must never lose a tap to the ground underneath it, and it
    // takes the tap even when a menu is already open, so a click on the next
    // pad moves the menu there rather than being spent dismissing it.
    const spot = this.build.spotAt(w.x, w.y)
    if (spot && this.build.isFree(spot.index)) {
      if (this.drawerOn()) {
        // THE FLOW RUNS BOTH WAYS. A tower then a node, or a node then a
        // tower — an empty node is a destination when something is picked and
        // a question when nothing is.
        //
        // It used to do NOTHING in the second case, on the reasoning that a
        // node opening a second menu would be two ways to do one thing. That
        // was wrong about which menu: opening the drawer is not a second menu,
        // it is the SAME one, brought out to answer the node just tapped. A
        // tap that does nothing at all is the thing that reads as broken.
        if (this.drawerPick) this.placeFromDrawer(spot)
        else this.chooseSpotFirst(spot)
        return
      }
      this.openPadRing(spot)
      return
    }

    if (this.ring?.active) {
      this.clearSelection()
      return
    }

    const tower = this.towerAt(w.x, w.y)
    if (tower) {
      this.selectTower(tower)
      return
    }

    if (this.hero.hits(w.x, w.y)) {
      this.selectHero()
      return
    }

    // Bare ground with a tile picked: that is the cancel. The other cancel is
    // tapping the same tile again, which the drawer owns.
    if (this.drawerPick) {
      this.drawer.select(null)
      this.drawerPick = null
      this.refreshCancel()
      this.drawSpots()
      return
    }

    // Bare ground with an Ima Dummy Tower selected: post the lads there. Read
    // AFTER the pad and tower checks above, so selecting the next tower or
    // building on the next pad still works while one is selected -- only a tap
    // that would otherwise have deselected becomes an order.
    if (this.selected?.isDeployer) {
      this.orderRally(this.selected, w.x, w.y)
      return
    }

    // Bare ground. It is only an order when the hero is actually selected,
    // so a misjudged tap cannot walk him off his post.
    if (this.heroSelected) {
      this.orderHero(w.x, w.y)
      return
    }
    this.clearSelection()
  }

  private selectHero(): void {
    this.deselectTower()
    if (this.hero.down) {
      this.status.alert =
        `${this.hero.def.name} is down — back in ` +
        `${Math.max(1, Math.ceil(realSeconds(this.hero.reviveIn, 1)))}s.`
      return
    }
    this.clearGhost()
    this.ring?.close()
    this.selected = null
    this.heroSelected = true
    // Just the foot ring. The attack-range circle that used to come up with
    // him is one of the rings the brief calls for gone: state 2 is a ring at
    // his feet and nothing else.
    this.markers.select()
    this.status.alert = `${this.hero.def.name} selected — click where to hold.`
  }

  private orderHero(x: number, y: number): void {
    // Asked before the order, because the order is what ends the fight.
    const wasFighting = this.hero.engaged
    this.hero.setRally(x, y)
    // The marker carries its own arrival animation — up from 70% and fading
    // in over 200ms — so the old expanding ping would be a second, differently
    // timed confirmation of the same tap.
    this.markers.orderTo(x, y)
    // He STAYS selected while he walks. Deselection happens on arrival, so
    // his foot ring and the destination ring go together and the board is
    // clean the moment he gets there.
    this.rangeRing.clear()
    // Say which of the two things just happened. Breaking off a fight is a
    // decision with a cost and should not read the same as walking up an
    // empty lane.
    if (wasFighting) {
      play(this, 'hero-hit', 0.5)
      logEvent('hero', `disengaged to ${Math.round(x)},${Math.round(y)}`)
      this.status.alert =
        `${this.hero.def.name} breaks off — exposed while pulling out.`
    } else {
      // NO DIRECTION WORD. It said "is moving up" whichever way he went —
      // the word was a constant, not a reading of anywhere he was going, so
      // it was wrong more often than right. "Up" is also the one direction
      // that means two things on a 3/4 map.
      this.status.alert = `${this.hero.def.name} is moving.`
    }
  }

  // ---------------------------------------------------------------- build UI

  /** The topmost tower under a point, so overlapping art picks the front one. */
  private towerAt(x: number, y: number): Tower | undefined {
    let best: Tower | undefined
    for (const t of this.towers) {
      if (!t.hits(x, y)) continue
      if (!best || t.y > best.y) best = t
    }
    return best
  }

  /**
   * What the build ring offers on this pad, PRICED AGAINST THE BALANCE NOW.
   *
   * A function rather than an array because affordability is not a property of
   * the pad, it is a property of the moment -- and the moment moves while the
   * panel is open. `refreshAffordability` calls this again when the balance
   * changes and the answer differs.
   */
  private padRingOptions(spot: BuildSpot): RingOption[] {
    const options: RingOption[] = this.status.unlockedTowers.map((id) => {
      const def = TOWERS[id]
      const short = def.cost - this.status.peanuts
      return {
        id,
        // The tower itself, not an action icon: "which one is this?" is the
        // question a build button has to answer, and six hammers do not.
        icon: 'upgrade',
        sprite: def.sprite,
        price: def.cost,
        affordable: this.status.peanuts >= def.cost,
        reason: short > 0 ? `${short} peanuts short.` : undefined,
        title: def.name,
        trait: def.trait,
        // Tier 1 with no branch: what it will be the moment it is built.
        stats: statsFor(def, BASE_TIER, null),
        confirmLabel: 'Build',
        onConfirm: () => this.place(id, spot),
      }
    })
    return options
  }

  /**
   * The ring on an empty pad: what can be built here, and for how much.
   *
   * Public for the harness, which measures every button against the viewport.
   */
  openPadRing(spot: BuildSpot): void {
    this.deselectTower()
    this.openRing(() => this.padRingOptions(spot), () => this.padAnchor(spot), (id) => {
      if (id) {
        this.showTowerRange(spot.x, spot.y, TOWERS[id])
        this.showGhost(id, spot)
      } else {
        this.rangeRing.clear()
        this.clearGhost()
      }
    })
    this.drawSpots()
  }

  /**
   * What the drawer shows: the run's active units, in draft order.
   *
   * THE SIX TOWERS AND NOTHING ELSE in this slice. A tower the run has not
   * unlocked yet is present but LOCKED rather than absent — a grid that grows
   * as the run goes on gives the player nothing to plan around, and the third
   * and fourth types arrive on a schedule they can already see.
   */
  private drawerTiles(): DrawerTile[] {
    const run = runState()
    const order = [...this.status.unlockedTowers,
      ...run.reserveTowers.filter((id) => !this.status.unlockedTowers.includes(id))]
    return order.map((id) => ({
      id,
      sprite: TOWERS[id]!.sprite,
      price: TOWERS[id]!.cost,
      affordable: this.status.peanuts >= TOWERS[id]!.cost,
      locked: !this.status.unlockedTowers.includes(id),
    }))
  }

  /**
   * What the drawer's pinned strip says about a tower.
   *
   * The numbers come from `statsFor`, which is what the ledger card uses, so
   * the strip and the card cannot disagree about a tower's dps. It also
   * carries the support-tower case: Beacon has no rate, and reports a boost
   * and a radius instead of three slots saying zero.
   *
   * BASE_TIER and no specialization: nothing is built yet, so what the strip
   * describes is what the tile would buy.
   */
  private drawerDetail(id: string): DrawerDetail | null {
    const def = TOWERS[id]
    if (!def) return null
    return {
      name: def.name,
      sprite: def.sprite,
      stats: statsFor(def, BASE_TIER, null),
      trait: def.trait,
    }
  }

  /**
   * Re-reads the drawer flag and switches control scheme on the spot.
   *
   * Called by the settings dialog the moment the toggle is flipped, so the
   * two can be compared on the same board with the same peanuts rather than
   * across a restart — which is the only reason for a runtime flag at all.
   * Anything the outgoing scheme had open is dropped, because a ring left
   * hanging over a board that no longer uses rings is a ghost.
   */
  applyControlScheme(): void {
    this.clearSelection()
    this.drawerPick = null
    this.drawer.select(null)
    this.drawer.setEnabled(controlDrawerOn())
    this.refreshCancel()
    this.drawSpots()
  }

  /** True while the drawer replaces the build ring. Read at the point of use
   *  so the settings toggle applies without restarting the run. */
  drawerOn(): boolean {
    return this.drawer?.enabled === true
  }

  /**
   * Places the drawer's selected tower on a node, with NO confirmation step.
   *
   * Deliberate. A confirm on every build is friction on the most common
   * action in the game, and the ring's second press already exists for the
   * decisions that cannot be undone. If playtesting shows mis-taps are
   * costly, the answer is an undo window, not a dialog.
   */
  private placeFromDrawer(spot: BuildSpot): void {
    const id = this.drawerPick
    if (!id) return
    if (!this.build.isFree(spot.index)) return
    if (this.status.peanuts < TOWERS[id]!.cost) return
    this.place(id, spot)
    this.drawer.select(null)
    this.drawerPick = null
    this.pendingSpot = null
    this.refreshCancel()
    this.drawSpots()
  }

  /**
   * An empty node tapped with no tower picked: hold the node and open the
   * drawer to ask which tower.
   *
   * The drawer is opened rather than TOGGLED. A tap on a second node while
   * the panel is already out has to move the selection, not shut the panel —
   * `setOpen(true)` on an open drawer is a no-op, which is the point.
   */
  private chooseSpotFirst(spot: BuildSpot): void {
    if (!this.build.isFree(spot.index)) return
    this.pendingSpot = spot
    // TOWERS. The other two tabs are not populated yet, but the node is asking
    // for a tower specifically, so this says so rather than relying on TOWERS
    // happening to be the tab that is already up.
    this.drawer.activeTab = 0
    this.drawer.setOpen(true)
    this.drawer.refresh()
    this.refreshCancel()
    this.drawSpots()
    // A TOAST, NOT A LINE IN A BAR. The instruction bar this used to write to
    // is gone; a tap that changes what the controls mean still has to say so,
    // and saying it under the player's thumb for a moment beats saying it
    // permanently across the top of the board.
    this.status.alert = 'Node selected — pick a tower to build here.'
  }

  /** True when this node would take the drawer's current pick: free, and
   *  affordable. These are the nodes that pulse. */
  private nodeTakesPick(spot: BuildSpot): boolean {
    const id = this.drawerPick
    if (!id) return false
    return this.build.isFree(spot.index) && this.status.peanuts >= TOWERS[id]!.cost
  }

  /** The pad or tower's position, on the glass, right now. */
  private padAnchor(spot: BuildSpot): { x: number; y: number } | null {
    if (!this.build.isFree(spot.index)) return null
    // CSS pixels, which is what the ring's geometry is written in. Doing this
    // by hand here returned canvas pixels and put the ring 401px from the pad
    // on a dpr-3 phone; see worldToScreen.
    return worldToScreen(this, spot.x, spot.y)
  }

  /**
   * Opens the one menu, wherever it is opened from.
   *
   * Both callers go through here so the camera split, the problem reporting
   * and the close bookkeeping cannot drift apart between them — which is how
   * two components ended up with two different clamping stories in the first
   * place.
   */
  private openRing(
    /** RE-CALLABLE, not a snapshot. See `refreshAffordability`. */
    build: () => RingOption[],
    anchor: () => { x: number; y: number } | null,
    onPreview: (id: string | null) => void,
    /** Reserved slots, when the caller wants the geometry fixed across
     *  states. The tower panel does; the build ring does not. */
    slots?: number,
  ): void {
    this.ring?.close()
    const options = build()
    if (options.length === 0) return
    this.ringOptions = build
    this.ring = new TowerRing(this, TICKET_DEPTH, {
      options,
      anchor,
      slots,
      // The part of the screen where chrome does not cover a counter, the
      // start button or the ability bar. Inset by the safe area too: a notch
      // has coordinates but is not screen.
      area: () => usableArea(viewW(this), viewH(this), safeAreaInsets(), {
        countersBottom: this.layout.counters.y + this.layout.counters.height,
        abilitiesTop: this.layout.abilities.y,
      }, PRESENTATION.ring.areaMargin),
      onPreview,
      onProblem: (why) => {
        // Never swallowed. A menu that cannot fit is a fault the player is
        // living with, so it says so on the message line and in the console
        // rather than quietly drawing a clipped panel.
        console.error(`[ring] ${why}`)
        this.status.alert = why
      },
      onClose: () => {
        this.ring = undefined
        this.ringOptions = undefined
        this.rangeRing.clear()
        this.clearGhost()
        this.drawSpots()
      },
    })
    this.asScreenSpace(this.ring.objects)
  }

  /**
   * A half-transparent tower standing on the pad it would be built on.
   *
   * It is a *world* object, so it is drawn by the world camera and therefore
   * clipped to the board: it cannot reach the HUD however tall the sprite is.
   * And it is only ever created against a pad, so there is no preview to draw
   * when no pad is targeted.
   */
  private showGhost(id: string, spot: BuildSpot): void {
    const def = TOWERS[id]
    if (!def) return
    this.clearGhost()
    if (!this.textures.exists(def.sprite)) return
    const g = this.add.image(spot.x, spot.y, def.sprite).setAlpha(0.5)
    // The same anchor and scale a built tower gets, so the ghost stands where
    // the real one will rather than near it.
    applyRender(g, def.sprite)
    // Under the HUD's depth and above the ground, on the pad's own row so it
    // sorts against neighbours exactly as the built tower will.
    g.setDepth(spot.y - 1)
    this.ghost = g
    this.syncCameras()
  }

  private clearGhost(): void {
    this.ghost?.destroy()
    this.ghost = undefined
  }

  private place(id: string, spot: BuildSpot): void {
    const def = TOWERS[id]
    if (!this.build.isFree(spot.index)) return
    if (this.status.peanuts < def.cost) {
      // Silence here reads as a broken button, so say what is missing.
      this.status.alert = `${def.name} costs ${def.cost} peanuts — ${def.cost - this.status.peanuts} short.`
      play(this, 'broke')
      return
    }

    this.setPeanuts(this.status.peanuts - def.cost)
    this.build.occupy(spot.index)
    const tower = new Tower(this, spot.x, spot.y, id, def, spot.index)
    tower.distanceToExit = this.roadLeftFrom(spot.x, spot.y)
    this.raiseGarrison(tower)
    // A finished tier changes the board, so it is saved like any other change
    // to it — and it is the moment an upgrade becomes real, since the tier
    // number only moves when the work completes.
    tower.on('tierup', () => this.onBoardChanged())
    this.towers.push(tower)
    this.onBoardChanged()
    play(this, 'build')
    this.clearGhost()
    this.ring?.close()
    this.rangeRing.clear()
    this.drawSpots()
    logEvent('tower-built', `${id} spot=${spot.index} cost=${def.cost}`)
    this.status.alert = `${def.name} built.`
  }

  /** Drops the current tower selection and everything drawn for it. */
  private deselectTower(): void {
    this.ring?.close()
    this.selected = null
    this.projectedRing.clear()
    this.laneWash.clear()
    this.drawRallyMark(null)
    // A rally order belongs to the tower that is selected. Losing the
    // selection without saying so left CANCEL lit for a tower that was no
    // longer there — the exact class of bug `refreshCancel` was written to
    // stop, reappearing through a second piece of state it did not know about.
    this.syncTargeting()
  }

  /**
   * A tower's key, for the targeting mode's request.
   *
   * Its position. Towers have no id — they are objects in an array and the
   * array is spliced on a sell — and an index would name a different tower
   * after one is sold. A pad holds one tower and a tower does not move, so its
   * rounded position is stable for as long as it exists, which is exactly as
   * long as the request can be armed.
   */
  private towerKey(tower: Tower): string {
    return `${Math.round(tower.x)},${Math.round(tower.y)}`
  }

  private selectTower(tower: Tower): void {
    // AN IMA DUMMY TOWER'S RALLY ORDER IS A TARGETING MODE, and it is the same
    // one. The board is waiting for a tap on a place, exactly as it is for a
    // summon — so it gets the same CANCEL button, the same ESC key, the same
    // second-press-to-back-out, and the same highlight over where a tap is
    // legal. It had none of those: the mode was two booleans and a comment.
    if (tower.isDeployer) {
      const armed = this.targeting.arm({ kind: 'rally', id: this.towerKey(tower) })
      if (armed === 'toggled') {
        this.clearSelection('toggle')
        return
      }
    } else {
      this.targeting.cancel('replaced')
    }
    this.clearGhost()
    this.ring?.close()
    this.drawSpots()
    this.selected = tower
    this.previewingUpgrade = false
    this.drawSelectedRange(tower)
    // The stretch of lane this tower actually covers. "Is it in the right
    // place?" is the other half of "should I upgrade it?", and a circle over
    // grass does not answer it on its own.
    this.drawCoveredLane(tower)
    const bonus = tower.supportBonus > 0 ? `  ·  +${Math.round(tower.supportBonus * 100)}% lit` : ''
    if (tower.isDeployer) {
      const g = this.garrisons.find((q) => q.tower === tower)
      this.drawRallyMark(g?.rally ?? null)
      this.status.alert =
        `${tower.def.name}, tier ${tower.tier}. Tap the highlighted road to move the lads, or CANCEL.`
    } else {
      this.drawRallyMark(null)
      this.status.alert = `${tower.def.name}, tier ${tower.tier}${bonus}`
    }
    this.syncTargeting()
    this.openTowerRing(tower)
  }

  /**
   * The range ring, and — when there is an upgrade to buy — what the upgrade
   * would make it.
   *
   * Two circles, styled differently on purpose: the solid one is what this
   * tower does now, the dashed one is what the money buys. That comparison is
   * the whole question the panel is asking, and it used to be behind the
   * panel.
   */
  private drawSelectedRange(tower: Tower): void {
    this.showTowerRange(tower.x, tower.y, tower)
    this.projectedRing.clear()
    if (tower.upgrading) return
    const step = nextStep(tower.def, tower.tier)
    if (!step) return
    const now = tower.isSupport ? tower.supportRadius : tower.range
    const next = statAt(tower.def, tower.tier + 1,
      tower.isSupport ? 'supportRadius' : 'range', tower.spec)
    if (next <= now + 0.5) return
    this.dashedCircle(tower.x, tower.y, next, 0xf2d06b, this.previewingUpgrade ? 1 : 0.6)
  }

  /**
   * The stretch of lane a tower covers, painted on the road itself.
   *
   * Reuses the band the summon-targeting overlay draws, because it is the
   * same question in a different direction: which part of the path is inside
   * this circle.
   */
  private drawCoveredLane(tower: Tower): void {
    this.laneWash.clear()
    if (tower.isSupport) return
    const r = tower.range
    const step = 14
    this.laneWash.fillStyle(0xf6ecd9, 0.14)
    for (let d = 0; d <= this.lane.totalLength; d += step) {
      const pt = this.lane.pointAt(d)
      if (Math.hypot(pt.x - tower.x, pt.y - tower.y) > r) continue
      this.laneWash.fillCircle(pt.x, pt.y, 15)
    }
  }

  /** A ring of dashes, so the projected range cannot be mistaken for the
   *  current one at a glance. */
  private dashedCircle(x: number, y: number, r: number, colour: number, alpha: number): void {
    const dashes = Math.max(16, Math.round(r / 7))
    const arc = (Math.PI * 2) / dashes
    this.projectedRing.lineStyle(3, colour, alpha)
    for (let i = 0; i < dashes; i += 2) {
      this.projectedRing.beginPath()
      this.projectedRing.arc(x, y, r, i * arc, (i + 1) * arc, false)
      this.projectedRing.strokePath()
    }
  }

  /**
   * The ring on a built tower: upgrade it, branch it, or sell it.
   *
   * Tapping a tower used to print a sentence and do nothing, which left the
   * player with peanuts and no way to spend them. It is the same component the
   * pad opens now, with different options in it.
   *
   * Public for the harness, which measures every button against the viewport.
   */
  /**
   * What a built tower's ring offers, PRICED AGAINST THE BALANCE NOW.
   *
   * Extracted from `openTowerRing` for one reason: affordability is a function
   * of the moment, and the moment moves while the panel is open. See
   * `refreshAffordability`.
   */
  private towerRingOptions(tower: Tower): RingOption[] {
    const def = tower.def
    const step = nextStep(def, tower.tier)
    const refund = sellValue(def, tower.tier + (tower.upgrading ? 1 : 0),
      RULES.towerUpgrades.sellRefund, tower.spec)
    const peanuts = this.status.peanuts

    // THE THREE NUMBERS, AS THEY ARE AND AS THE PURCHASE WOULD LEAVE THEM.
    //
    // This was five rows of "19.8 → 27.7" with an icon each, plus a cost row
    // and a paragraph. The card shows three numbers; each one that a pending
    // purchase would change carries its new value beside it in the accent
    // colour, and each one that would not renders plain. `withChanges` decides
    // which is which by comparing the two stat sets, matched by label.
    const nextTier = tower.upgrading || step === null ? null : tower.tier + 1
    const now = statsFor(def, tower.tier, specById(def, tower.spec))
    const upgraded = nextTier === null
      ? now
      : withChanges(now, statsFor(def, nextTier, specById(def, tower.spec)))
    /** What each branch would make of it, for the two spec options. */
    const withSpec = (spec: TowerSpec): CardStat[] =>
      withChanges(now, statsFor(def, tower.tier, spec))

    const options: RingOption[] = []
    const choosing = tower.atSpecChoice && !tower.upgrading

    /*
     * THREE RESERVED SLOTS, AND SELL OWNS THE LAST ONE.
     *
     * "Sell goes last" was not enough and could not be. The ring's geometry is
     * a function of HOW MANY buttons are on it — an arc of two sits at a
     * different radius from an arc of three — so the position a thumb learned
     * as UPGRADE over twelve waves is a position SELL can arrive at when the
     * tower reaches the specialisation branch and the count changes under it.
     *
     * The slot count is fixed at three instead, and each option names its own
     * index: 0 is always upgrade (or the first branch), 1 is the second branch
     * and is empty the rest of the time, 2 is always SELL. Nothing about the
     * ring moves between tier 1 and tier 3, so there is no position for the
     * two to trade.
     *
     * The upgrade slot is emitted ALWAYS, disabled with a reason when there is
     * nothing left to buy. The ring's own contract already says a disabled
     * option opens and explains itself, and "Tier 3 of 3, nothing further" is
     * worth a tap.
     */
    if (choosing) {
      // THE BRANCH, AS TWO BUTTONS. It used to be a separate full-screen
      // dialog reached through a third icon — a menu inside a menu, for the
      // one decision in the game that cannot be undone. Two ring options put
      // both futures side by side, each with its own description panel, and
      // each still needing the second explicit press.
      for (const [i, spec] of def.specializations.entries()) {
        options.push({
          id: `spec:${spec.id}`,
          slot: i,
          icon: specIcon(spec),
          price: spec.cost,
          affordable: peanuts >= spec.cost,
          reason: peanuts < spec.cost ? `${spec.cost - peanuts} peanuts short.` : undefined,
          title: spec.name,
          trait: spec.trait,
          stats: withSpec(spec),
          confirmLabel: 'Build',
          onConfirm: () => this.specialize(tower, spec.id),
        })
      }
    } else if (step !== null && !tower.upgrading) {
      options.push({
        id: 'upgrade',
        slot: 0,
        icon: 'upgrade',
        price: step.cost,
        affordable: peanuts >= step.cost,
        reason: peanuts < step.cost ? `${step.cost - peanuts} peanuts short.` : undefined,
        title: def.name,
        trait: def.trait,
        stats: upgraded,
        confirmLabel: 'Upgrade',
        onConfirm: () => this.upgradeTower(tower),
      })
    } else {
      // Nothing to buy — mid-upgrade, or fully built out. The slot is still
      // here, holding the place so SELL never inherits it.
      options.push({
        id: 'upgrade',
        slot: 0,
        icon: 'upgrade',
        price: 0,
        affordable: false,
        reason: tower.upgrading
          ? 'Already building. Wait for it to finish.'
          : 'Fully upgraded. There is nothing further to buy.',
        title: def.name,
        trait: def.trait,
        stats: now,
        confirmLabel: 'Upgrade',
        onConfirm: () => { /* nothing to buy */ },
      })
    }

    /*
     * NO MOVE HERE, and there is no longer anywhere else either: Restructure
     * has been cut. A free MOVE on every tower's panel was rejected once for
     * making DAD MODE's grant of it worthless; with the ability gone, what is
     * left is the older reason — a tower is a decision about a place, and a
     * board that can be rearranged at will is a board with no decisions on it.
     */

    // Selling is always offered, always affordable, and ALWAYS IN SLOT 2 —
    // a place no upgrade and no branch can reach.
    //
    // Its numbers are what the tower IS, never the upgrade projection: a
    // marked-up "17 -> 31" describes a purchase the player is not making, on
    // the one button that destroys the thing being described.
    options.push({
      id: 'sell',
      slot: 2,
      icon: 'sell',
      price: refund,
      affordable: true,
      title: def.name,
      trait: def.trait,
      stats: now,
      confirmLabel: 'Sell',
      onConfirm: () => this.confirmSell(tower, refund),
    })
    return options
  }

  openTowerRing(tower: Tower): void {
    // THREE, always: see the slot note above.
    this.openRing(() => this.towerRingOptions(tower), () => this.towerAnchor(tower), (id) => {
      this.previewingUpgrade = id !== null && id !== 'sell'
      if (this.selected) this.drawSelectedRange(this.selected)
    }, 3)
  }

  /** The tower's position on the glass, or null once it is gone. */
  private towerAnchor(tower: Tower): { x: number; y: number } | null {
    // A sold tower is gone from the list, and its ring must close rather
    // than hang over an empty pad.
    if (!this.towers.includes(tower)) return null
    return worldToScreen(this, tower.x, tower.y)
  }

  /** Public so a harness run can drive the branch without the ring. */
  specialize(tower: Tower, specId: string): void {
    const spec = tower.def.specializations.find((x) => x.id === specId)
    if (!spec || tower.upgrading || !tower.atSpecChoice) return
    if (this.status.peanuts < spec.cost) {
      play(this, 'broke')
      this.status.alert =
        `${spec.name} costs ${spec.cost} peanuts — ${spec.cost - this.status.peanuts} short.`
      return
    }
    this.setPeanuts(this.status.peanuts - spec.cost)
    tower.beginUpgrade(specId)
    this.saveProgress()
    play(this, 'upgrade')
    logEvent('tower-spec', `${tower.def.name} -> ${spec.id} cost=${spec.cost}`)
    this.status.alert = `${tower.def.name} becoming ${spec.name}.`
  }

  private upgradeTower(tower: Tower): void {
    const step = nextStep(tower.def, tower.tier)
    if (!step || tower.upgrading) return
    if (this.status.peanuts < step.cost) {
      play(this, 'broke')
      this.status.alert = `Tier ${tower.tier + 1} costs ${step.cost} peanuts — ${step.cost - this.status.peanuts} short.`
      return
    }
    this.setPeanuts(this.status.peanuts - step.cost)
    logEvent('tower-upgraded', `${tower.def.name} tier ${tower.tier + 1} cost=${step.cost}`)
    tower.beginUpgrade()
    // The peanuts are spent now and the tier arrives later. Saving here books
    // the cost; the 'tierup' handler books what it bought. A run resumed in
    // between keeps the tower at the tier it had actually finished paying for.
    this.saveProgress()
    play(this, 'upgrade')
    this.status.alert =
      `${tower.def.name} going to tier ${tower.tier + 1}. ` +
      `It fires slowly for ${realSeconds(step.buildSeconds, 1)}s.`
  }

  /**
   * The one confirmation in the tower panel, and it is worded.
   *
   * UPGRADE DOES NOT GET ONE. An upgrade is reversible in the only sense that
   * matters — the tower is still there and still yours — and a confirm on the
   * action a player takes forty times a run is friction on the wrong button.
   * Selling is the one that cannot be taken back.
   *
   * WORDS, not a glyph. The ring's own second press is a confirm button with a
   * tick on it, and the button beside it carries a tick too; two ticks side by
   * side are not a question, they are a shape. "Sell Grinder for 45 peanuts?"
   * with SELL and CANCEL under it is a sentence the player has to answer.
   */
  private confirmSell(tower: Tower, refund: number): void {
    this.openDialog({
      title: `Sell ${tower.def.name} for ${refund} peanuts?`,
      subtitle: 'The pad goes back to empty. This cannot be undone.',
      confirm: { label: 'Sell', onPick: () => this.sellTower(tower) },
      cancelLabel: 'Cancel',
    })
  }

  private sellTower(tower: Tower): void {
    // A tier that is still going up has already been paid for, so it counts
    // towards the refund. Otherwise selling mid-build quietly eats the cost of
    // the upgrade the player just bought.
    const paidTier = tower.tier + (tower.upgrading ? 1 : 0)
    const refund = sellValue(tower.def, paidTier, RULES.towerUpgrades.sellRefund, tower.spec)
    this.setPeanuts(this.status.peanuts + refund)
    this.build.release(tower.spot)
    this.towers = this.towers.filter((t) => t !== tower)
    tower.destroy()
    if (this.selected === tower) {
      this.selected = null
      this.syncTargeting()
    }
    this.onBoardChanged()
    this.refreshMenuOptions()
    this.rangeRing.clear()
    this.drawSpots()
    play(this, 'sell')
    logEvent('tower-sold', `${tower.def.name} +${refund}`)
    this.status.alert = `Sold for ${refund} peanuts.`
  }

  /** The cancel button only exists while there is something to cancel. */
  /** Panning is off while a modal owns the screen, and back on when it goes. */
  private releaseDialog(): void {
    this.dialog = undefined
    this.rig.setEnabled(true)
  }

  /** Whether the CANCEL button is on the glass. Read by the harness, which is
   *  how it was caught outliving the mode it belongs to. */
  cancelVisible = false

  /**
   * CANCEL's visibility, COMPUTED from what there is to cancel.
   *
   * It used to be set by hand at each place a mode was entered or left, and
   * the bug that pattern always has arrived on schedule: after one successful
   * tower move the button stayed on the glass for the rest of the encounter,
   * because one of the exits forgot to turn it off. A third cancellable
   * state — the drawer's pick — would have been a third chance to forget.
   */
  private refreshCancel(): void {
    this.setCancelVisible(
      this.targeting.active
      || this.drawerPick !== null
      || this.pendingSpot !== null,
    )
  }

  private setCancelVisible(on: boolean): void {
    this.cancelVisible = on
    this.cancelSlab.setVisible(on)
    this.cancelGlyph.setVisible(on)
    // THE LABEL, NAMED. `PlateButton` exposes its text, so ask for it rather
    // than sifting `parts` — the first version told the label from the plate
    // images by testing whether each had a `setTexture` method, which is
    // always true on an Image and typechecks only because there is no `phaser`
    // to resolve locally. CI's real typings called it out as TS2774, which is
    // exactly the hole `tools/tsdiff.sh` says it cannot cover.
    this.cancelBtn.text.setVisible(on)
    // BOTH, and in this order. The rectangle has to be VISIBLE to be
    // hit-tested at all — Phaser's `inputCandidate` runs `willRender` — which
    // is the whole of why this button was dead, so it is set here rather than
    // left to whatever the plate art happened to do to it. Setting the flag as
    // well means a hidden CANCEL has two independent reasons it cannot be
    // pressed rather than one that has to be right every time.
    this.cancelBtn.hit.setVisible(on)
    this.cancelBtn.hit.input!.enabled = on
  }

  /**
   * The X, drawn to the left of the label.
   *
   * Graphics rather than a font glyph: the UI face has no multiplication sign
   * that reads at 15px, and the letter x reads as a letter.
   */
  private drawCancelGlyph(cb: Rect, cn: typeof PRESENTATION.hud.cancel): void {
    const g = this.cancelGlyph
    g.clear()
    const r = cn.glyphSize / 2
    // Left of centre by the same amount the label was pushed right, so the
    // pair reads as one control rather than as a glyph and a button.
    const cx = cb.x + cb.width / 2 - Math.max(18, cb.width * 0.22)
    const cy = cb.y + cb.height / 2
    g.lineStyle(cn.glyphWidth, cn.glyphColour, 1)
    g.beginPath()
    g.moveTo(cx - r, cy - r)
    g.lineTo(cx + r, cy + r)
    g.moveTo(cx + r, cy - r)
    g.lineTo(cx - r, cy + r)
    g.strokePath()
  }

  /**
   * Everything the board can be in the middle of, undone.
   *
   * ONE FUNCTION, and every way out lands here: the CANCEL button, the ESC
   * key, tapping the armed ability a second time, a tap outside the legal
   * area, a modal opening on top. `reason` is passed through to the log rather
   * than used to branch, because the moment one exit does something the others
   * do not, the game has an escape that half works — which is what it had.
   *
   * NOTHING IS SPENT HERE. It clears state and draws; it does not start a
   * cooldown, consume a rare drop, or move a soldier. `fireAbility` and
   * `orderRally` are the only places that can, and both are reached only from
   * a tap that resolved to `commit`.
   */
  private clearSelection(reason: Exclude<ExitReason, 'commit'> = 'replaced'): void {
    const dropped = this.targeting.cancel(reason)
    if (dropped) {
      logEvent('targeting-cancelled', `${dropped.request.kind}:${dropped.request.id} via ${reason}`)
    }
    this.clearGhost()
    this.ring?.close()
    this.selected = null
    this.projectedRing.clear()
    this.heroSelected = false
    // Both markers fade the same way rather than being cut.
    this.markers.cancel()
    // The drawer's pick is one of the things CANCEL cancels, and this is
    // where CANCEL and ESC both land. Closing the drawer clears the pick on
    // its own side; this is the other direction.
    this.drawerPick = null
    this.pendingSpot = null
    this.drawer?.select(null)
    this.syncTargeting()
    this.rangeRing.clear()
    this.targetRing.clear()
    this.castCursor.hide()
    this.laneWash.clear()
    this.drawSpots()
  }

  /**
   * The mirrors, written HERE and nowhere else.
   *
   * `status.mode` and `status.pendingAbility` are read by the HUD, by the save
   * format and by the harness. They used to be *assigned* by every method that
   * entered or left a mode, and the pair drifting apart is the failure this
   * whole change is about. One writer, called from one place per transition.
   */
  private syncTargeting(): void {
    // A rally request cannot outlive the selection that owns it. Derived here
    // rather than cleared at each of the five places the selection is dropped,
    // which is the pattern that let CANCEL outlive its mode in the first place.
    const req = this.targeting.request
    if (req?.kind === 'rally'
      && (this.selected?.isDeployer !== true || this.towerKey(this.selected) !== req.id)) {
      this.targeting.cancel('replaced')
    }
    this.status.mode = this.targeting.active ? 'targeting' : 'normal'
    this.status.pendingAbility = this.targeting.pendingAbility
    this.refreshCancel()
    this.drawTargetArea()
  }

  /** Takes a Tower or a bare TowerDef: a built tower reports the range its
   *  tier actually gives it, a menu preview reports tier 1. */
  private showTowerRange(x: number, y: number, def: { supportRadius: number; range: number }): void {
    const support = def.supportRadius > 0
    this.showRange(x, y, support ? def.supportRadius : def.range, support ? 0x8fd07a : 0xf6ecd9)
  }

  private showRange(x: number, y: number, radius: number, colour: number): void {
    this.rangeRing.clear()
    if (radius <= 0) return
    this.rangeRing.fillStyle(colour, 0.1).fillCircle(x, y, radius)
    this.rangeRing.lineStyle(2, colour, 0.8).strokeCircle(x, y, radius)
  }

  private updateHover(p: Phaser.Input.Pointer): void {
    const w = this.worldAt(p)
    // THE REQUEST, not the mirror. `status.pendingAbility` carries the hero
    // power's SLOT id as well as an ability's, because the bar lights its
    // medallion from it — and that id is not in `ABILITIES`, so reading the
    // table off the mirror would hand back undefined and take the frame down
    // on the first mouse move after arming a power.
    const armed = this.targeting.request
    if (armed?.kind === 'power') {
      // No cursor and no radius ring: the power's affordance is the disc
      // around the hero, which `drawTargetArea` has already painted and which
      // does not move with the pointer.
      this.targetRing.clear()
      this.castCursor.hide()
      return
    }
    if (armed?.kind === 'ability') {
      const def = ABILITIES[armed.id]
      if (!def) return
      this.targetRing.clear()
      const ok = this.validCastPoint(def, w.x, w.y)
      // Green where the cast will land, red where it will be refused, so the
      // restriction is visible before the tap rather than after it.
      const tint = ok ? 0xff9d5a : 0xff5a3c
      if (def.radius > 0) {
        this.targetRing.fillStyle(tint, ok ? 0.16 : 0.1).fillCircle(w.x, w.y, def.radius)
        this.targetRing.lineStyle(2, tint, 0.9).strokeCircle(w.x, w.y, def.radius)
      }
      // And the answer itself, under the pointer. The radius circle says how
      // big the effect is; this says whether it is allowed to happen here,
      // which is the question a placement restriction actually raises.
      this.castCursor.moveTo(w.x, w.y, ok, this.cameras.main.zoom)
      return
    }
    this.castCursor.hide()
    if (this.ring?.active) return

    const tower = this.towerAt(w.x, w.y)
    if (tower) {
      if (this.hoverSpot) { this.hoverSpot = null; this.drawSpots() }
      if (!this.selected) this.showTowerRange(tower.x, tower.y, tower)
      return
    }
    if (!this.selected) this.rangeRing.clear()

    const spot = this.build.spotAt(w.x, w.y)
    const next = spot && this.build.isFree(spot.index) ? spot : null
    if (next?.index !== this.hoverSpot?.index) {
      this.hoverSpot = next
      this.drawSpots()
    }
  }

  // `idleHint()` LIVED HERE, and it was the white instruction bar's whole
  // reason for existing: one line of guidance, recomputed on every mode change
  // and on every board change, telling the player to tap a build pad or press
  // START WAVE. It is gone with the bar it fed. A tutorial replaces it, and a
  // tutorial can say those things once rather than forever.

  // ---------------------------------------------------------------- abilities

  armAbility(id: string | undefined): void {
    if (!id || !ABILITIES[id]) return
    if (this.casting) {
      // Silent refusal is what made this unreportable: the player taps and
      // nothing at all happens, on the boss, repeatedly.
      play(this, 'error')
      this.status.alert = 'The nuke is still going off. Wait for it.'
      logEvent('ability-refused', `${id} during cast`)
      return
    }
    if (id === RULES.serverNuke.abilityId) {
      if (this.status.rareAbility !== id) return
      // Never fired straight off the icon. It is once per run and a misfire
      // is unrecoverable, so the tap opens a confirmation and the launch is a
      // second, deliberate press on a button that does nothing else.
      this.openNukeLaunch()
      return
    }
    if (!this.cooldowns.ready(id)) {
      play(this, 'error')
      this.status.alert = `${ABILITIES[id].name} is still on cooldown.`
      return
    }
    if (ABILITIES[id].targeting === 'instant') {
      this.fireAbility(id, 0, 0)
      return
    }
    // THE SECOND PRESS IS THE WAY OUT. The button that armed this is under the
    // player's thumb already, so pressing it again is the cheapest escape
    // there is — cheaper than finding CANCEL, and the one a player reaches for
    // without being told. Nothing is spent: the ability is still ready.
    const armed = this.targeting.arm({ kind: 'ability', id })
    if (armed === 'toggled') {
      this.clearSelection('toggle')
      play(this, 'click')
      return
    }
    this.clearGhost()
    this.ring?.close()
    this.selected = null
    this.heroSelected = false
    this.syncTargeting()
    const within = ABILITIES[id].pathOnlyWithin
    this.status.alert = within !== undefined
      ? `${ABILITIES[id].name}: tap the highlighted road. Tap anywhere else, or CANCEL, to back out.`
      : `${ABILITIES[id].name}: tap the board. Tap the icon again, or CANCEL, to back out.`
  }

  /**
   * THE BOARD, SAYING IT IS WAITING.
   *
   * The mode used to draw nothing at all until the pointer moved. That is
   * fine on a desktop and useless on a phone, where there IS no pointer until
   * the finger lands — so on the device the game is built for, a mode that
   * takes over the next tap announced itself with one line of small text in
   * the corner and a grey button that did not work. "It is easy to miss" was
   * not a matter of contrast.
   *
   * So the legal area is painted from the moment the mode is entered, in the
   * world, under the entities, and it breathes: `pulseTargetArea` moves the
   * alpha every frame. Motion is what the eye picks up in peripheral vision,
   * which is where this is while the player is looking at their thumb.
   *
   * Three shapes, one for each thing the mode can be waiting for:
   *   - a summon restricted to the road   -> the road, as far as it is legal
   *   - an unrestricted ability           -> the whole board, edged
   *   - a rally order                     -> the lane inside the tower's ring
   */
  private drawTargetArea(): void {
    const g = this.targetArea
    g.clear()
    const req = this.targeting.request
    if (!req) return
    const T = PRESENTATION.targeting
    if (req.kind === 'rally') {
      const tower = this.selected
      if (!tower) return
      this.washLane(T.rallyColour, (p) => Math.hypot(p.x - tower.x, p.y - tower.y) <= tower.range)
      g.lineStyle(T.edgeWidth, T.rallyColour, T.edgeAlpha)
      g.strokeCircle(tower.x, tower.y, tower.range)
      return
    }
    if (req.kind === 'power') {
      // The disc the power reaches, centred on the hero. It is his reach, so
      // it is drawn around him rather than under the finger.
      const p = this.hero.def.slot2
      g.fillStyle(this.hero.def.colour, T.washAlpha)
      g.fillCircle(this.hero.x, this.hero.y, p.castRadius)
      g.lineStyle(T.edgeWidth, this.hero.def.colour, T.edgeAlpha)
      g.strokeCircle(this.hero.x, this.hero.y, p.castRadius)
      return
    }
    const def = ABILITIES[req.id]
    if (!def) return
    const within = def.pathOnlyWithin
    if (within !== undefined) {
      this.washLane(T.laneColour, () => true)
      return
    }
    // Unrestricted: everywhere is legal, so what is drawn is the EDGE of
    // everywhere. A wash over the whole board would hide the board, which is
    // the thing the player is being asked to read.
    g.lineStyle(T.edgeWidth * 2, T.areaColour, T.edgeAlpha)
    g.strokeRect(2, 2, displayData.width - 4, displayData.height - 4)
  }

  /** The road, painted as a run of overlapping dots. Same technique as
   *  `drawCoveredLane`, which is the same question asked about a tower. */
  private washLane(colour: number, keep: (p: { x: number; y: number }) => boolean): void {
    const T = PRESENTATION.targeting
    this.targetArea.fillStyle(colour, T.washAlpha)
    for (let d = 0; d <= this.lane.totalLength; d += T.step) {
      const pt = this.lane.pointAt(d)
      if (!keep(pt)) continue
      this.targetArea.fillCircle(pt.x, pt.y, T.laneRadius)
    }
  }

  /**
   * The breathing. Alpha only: the geometry is redrawn on a transition and
   * never per frame, because painting a hundred circles sixty times a second
   * to make them fade is a lot of Graphics for one sine wave.
   */
  private pulseTargetArea(): void {
    if (!this.targeting.active) return
    const T = PRESENTATION.targeting
    const phase = (Math.sin((this.time.now / T.pulseMs) * Math.PI * 2) + 1) / 2
    this.targetArea.setAlpha(0.55 + phase * 0.45)
  }

  /** True where this ability may be cast. Only summons are restricted. */
  private validCastPoint(def: AbilityDef, x: number, y: number): boolean {
    const within = def.pathOnlyWithin
    if (within === undefined) return true
    return this.lane.distanceTo(x, y) <= within
  }

  private fireAbility(id: string, x: number, y: number): void {
    const def = ABILITIES[id]
    if (!def || !this.cooldowns.ready(id)) return
    // A gnome dropped in a field blocks nothing, so the cast is refused rather
    // than wasted. The targeting overlay has already shown where is legal.
    if (!this.validCastPoint(def, x, y)) {
      logEvent('ability-refused', `${id} off-path`)
      this.refuse(`${def.name} can only be placed on the path.`)
      return
    }
    if (id === RULES.serverNuke.abilityId) {
      // Spent the moment it is cast, so a long wind-up cannot be used twice.
      this.nukeUsed = true
      this.status.rareAbility = null
    }
    this.cooldowns.start(id)
    this.castCursor.hide()
    logEvent('ability-cast', `${id} at ${Math.round(x)},${Math.round(y)} enemies=${this.enemies.length}`)
    this.laneWash.clear()
    play(this, `cast-${id.toLowerCase()}`)
    castAbility(id, def, x, y, {
      scene: this,
      enemies: () => this.enemies,
      damage: (e, amount, pierce) => this.damageEnemy(e, amount, pierce),
      addPeanuts: (amount) => this.earn(amount),
      summon: (sx, sy, count, seconds) => this.summonFighters(sx, sy, count, seconds),
      scratchTicket: (outcome, seconds) => this.showTicket(outcome, seconds),
      windUp: (seconds, fire) => this.windUp(seconds, fire),
      nuke: RULES.serverNuke,
      slowDiminish: RULES.combat.slowDiminish,
      overlayDepth: OVERLAY_DEPTH,
    })
    // The tap that got here already resolved the mode; this covers the other
    // caller, an `instant` ability fired straight off its icon.
    this.targeting.cancel('replaced')
    this.syncTargeting()
    this.targetRing.clear()
    logEvent('ability-done', id)
    this.status.alert = `${def.name}!`
  }

  /**
   * The long cast. A couple of seconds of gathering light and rising noise
   * before anything happens, because the player should watch this one land
   * rather than see the board empty between frames.
   */
  private windUp(seconds: number, fire: () => void): void {
    this.casting = true
    // Generous: the tween's own duration plus room for a slow frame. Anything
    // past this and the tween is gone, not late.
    this.castUntil = this.time.now + seconds * 1000 + 2000
    const W = viewW(this)
    const H = viewH(this)
    const cam = this.cameras.main

    const wash = this.add.graphics().setDepth(TICKET_DEPTH)
    const label = this.add.text(W / 2, H * 0.22, 'SERVER NUKE', {
      fontFamily: FONT_UI, fontSize: '40px', fontStyle: 'bold', color: '#8fd0ff',
      stroke: '#0d1016', strokeThickness: 8, letterSpacing: 2,
    }).setOrigin(0.5).setDepth(TICKET_DEPTH + 1).setAlpha(0)

    this.tweens.add({ targets: label, alpha: 1, duration: 400 })
    this.tweens.addCounter({
      from: 0, to: 1, duration: seconds * 1000,
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0
        wash.clear()
        wash.fillStyle(0x8fd0ff, 0.06 + t * 0.5).fillRect(0, 0, W, H)
        // A ring closing on the map, so the wind-up has somewhere to arrive.
        wash.lineStyle(4 + t * 10, 0xffffff, t)
        wash.strokeCircle(W / 2, H / 2, (1 - t) * W * 0.8 + 40)
        cam.shake(60, 0.002 + t * 0.006)
      },
      onComplete: () => {
        cam.flash(700, 255, 255, 255)
        cam.shake(520, 0.016)
        fire()
        wash.clear()
        this.tweens.add({
          targets: label, alpha: 0, delay: 400, duration: 400,
          onComplete: () => { label.destroy(); wash.destroy() },
        })
        this.casting = false
      },
    })
    this.asScreenSpace([wash, label])
  }

  /** The ticket sits over the board and never pauses it. Public so a harness
   *  run can hold one open for longer than its auto-reveal. */
  showTicket(outcome: ScratchOutcome, autoRevealSeconds: number): void {
    this.ticket?.destroy()
    this.ticket = new ScratchCard(this, viewW(this) / 2,
      viewH(this) / 2, TICKET_DEPTH, {
      outcome,
      autoRevealSeconds,
      // Dropped when it goes. It was left pointing at a destroyed card, which
      // `modalOpen` tolerated because it asks for `active` — but anything that
      // asked "is there a ticket?" got the wrong answer.
      onClosed: () => { this.ticket = null },
      onCollect: (amount) => {
        if (amount <= 0) {
          // Losing has to land as an outcome rather than as nothing happening.
          this.status.alert = 'Scratch Ticket: not a winner. Keep your day job.'
          play(this, 'error')
          return
        }
        this.earn(amount)
        this.status.alert = `Scratch Ticket: ${amount} peanuts.`
        play(this, 'peanuts')
      },
    })
    this.asScreenSpace(this.ticket.objects)
  }

  private summonFighters(x: number, y: number, count: number, seconds: number): void {
    const h = this.hero.def
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count
      this.fighters.push(new Fighter(
        this,
        x + Math.cos(a) * 26,
        y + Math.sin(a) * 26,
        h.maxHealth * 0.25,
        h.damage * 0.6,
        h.attackRange * 0.8,
        h.attackInterval,
        seconds,
        // One sprite per gnome, cycled. A pair drawn from a single sprite
        // reads as one gnome printed twice rather than as two of them.
        h.fighterSprites[i % h.fighterSprites.length],
      ))
    }
    // bothUnits, not realSeconds: a log line is read next to the JSON it came
    // from, and dropping the game-seconds figure makes the two irreconcilable.
    logEvent('summon',
      `${count} gnomes at ${Math.round(x)},${Math.round(y)} for ${bothUnits(seconds)}`)
  }

  /**
   * SLOT 1: the hero's own active, whoever the hero is.
   *
   * One entry point for all five rather than a method each, because everything
   * around the effect is the same for all of them -- the cooldown, the three
   * ways it can be refused, the sound on the hit rather than on the press, and
   * the message. Only the payload differs, and the payload is chosen by a
   * field in the data, so a sixth hero is a JSON entry.
   */
  castHeroSlot1(): void {
    const k = this.hero.def.slot1
    if (!this.cooldowns.ready(SLOT1)) {
      this.refuse(`${k.name} is still recharging.`)
      return
    }
    if (this.hero.down) {
      this.refuse(`${this.hero.def.name} is down.`)
      return
    }

    // An area skill lands wherever the hero is standing, so it cannot miss and
    // is never refused for want of a target. A targeted one needs somebody.
    const target = isAreaSkill(k)
      ? null
      : pickNearest(this.enemies, this.hero.x, this.hero.y, k.range)
    if (!isAreaSkill(k) && !target) {
      this.refuse(`${k.name}: nothing in reach.`)
      return
    }
    this.cooldowns.start(SLOT1)

    // The sounds go on the EFFECT, not on the press. Every way this can be
    // refused -- cooldown, hero down, nothing in reach -- has already returned
    // above, so a press that does nothing says nothing.
    //
    // The voice line first and the impact second, because the duck only
    // reaches a cue that STARTS after a line: played the other way round the
    // punch would sit on top of the words rather than under them.
    if (k.voice) play(this, k.voice)
    play(this, k.sound)

    switch (k.effect) {
      case 'punch': this.skillPunch(k, target!); break
      case 'double': this.skillDouble(k, target!); break
      case 'burn': this.skillBurn(k, target!); break
      case 'burst': this.skillBurst(k); break
      case 'howl': this.skillHowl(k); break
      case 'rain': this.rainOver(this.hero.x, this.hero.y, k); break
    }
    logEvent('hero-skill', `${k.effect} ${k.name}`)
    this.status.alert = `${k.name}!`
  }

  /**
   * SLOT 2: the hero power. WIRED, GATED, AND NOT YET IMPLEMENTED.
   *
   * The button is in the bar, it is greyed and inert in base form, and it
   * lights up the moment the hero transforms. What it does not do is anything
   * at all, and it says so rather than pretending: it starts no cooldown and
   * spends nothing, so nothing is lost by pressing it while the effect is
   * being written.
   */
  /**
   * SLOT 2: the hero power.
   *
   * One mechanic for all five — powered form only, one cooldown, and a point
   * tapped on the map inside `castRadius` of the hero. The placement goes
   * through the SAME targeting mode the Ima Dummy rally point uses, so it
   * inherits all four ways out of it: the CANCEL control, pressing the
   * medallion again, ESC, and a tap outside the disc. A power the player armed
   * by accident costs nothing to put down.
   */
  castHeroSlot2(): void {
    const p = this.hero.def.slot2
    const why = powerRefusal(
      p, this.hero.powered, this.hero.down, this.cooldowns.ready(SLOT2),
    )
    if (why !== null) {
      this.refuse(this.powerRefusalText(p, why))
      logEvent('hero-power', `${p.name} refused: ${why}`)
      return
    }
    // An UNTARGETED power would land on the hero and be done. None of the five
    // is one today; the branch is here rather than the field being ignored,
    // because a config field nothing reads is a field that quietly stops being
    // true — this repo has two dead ones on record.
    if (!p.targeted) {
      this.firePower(this.hero.x, this.hero.y)
      return
    }
    // The second press is the way out, exactly as it is for a drafted active.
    const armed = this.targeting.arm({ kind: 'power', id: SLOT2 })
    if (armed === 'toggled') {
      this.clearSelection('toggle')
      play(this, 'click')
      return
    }
    this.clearGhost()
    this.ring?.close()
    this.selected = null
    this.heroSelected = false
    this.syncTargeting()
    this.status.alert =
      `${p.name}: tap inside the ring. Tap outside it, or CANCEL, to back out.`
  }

  /** Why the button did nothing, in words the player can act on. */
  private powerRefusalText(p: HeroPowerDef, why: PowerRefusal): string {
    const who = this.hero.def.name
    if (why === 'unbuilt') return `${p.name} is not wired up yet.`
    if (why === 'down') return `${who} is down.`
    if (why === 'base-form') return `${p.name} needs ${who} at half health or less.`
    return `${p.name} is still recharging.`
  }

  /**
   * The power lands.
   *
   * Reached only from a tap that resolved to `commit`, which is the one exit
   * from targeting that spends anything. The cooldown starts HERE and nowhere
   * else, so every way of backing out is free by construction.
   */
  private firePower(x: number, y: number): void {
    const p = this.hero.def.slot2
    if (p.effect === null) return
    this.cooldowns.start(SLOT2)
    play(this, p.sound)
    logEvent('hero-power', `${p.name} at ${Math.round(x)},${Math.round(y)}`)
    switch (p.effect) {
      case 'hazard': this.powerHazard(p, x, y); break
      case 'burst': this.powerBurst(p, x, y); break
      case 'bomb': this.powerBurst(p, x, y); break
      case 'rain': this.powerRain(p, x, y); break
      case 'dash': this.powerDash(p, x, y); break
      case 'beam': this.powerBeam(p, x, y); break
    }
    this.status.alert = `${p.name}!`
  }

  /**
   * Seismic and Fireball: one ring of damage at the point.
   *
   * ONE METHOD FOR TWO EFFECTS, because they are the same effect with
   * different numbers — a wide, light, stunning one and a narrow, heavy one.
   * Splitting them would be two copies of four lines, drifting.
   */
  private powerBurst(p: HeroPowerDef, x: number, y: number): void {
    const s = PRESENTATION.shake
    expandingRing(this, x, y, p.radius, this.hero.def.colour, OVERLAY_DEPTH)
    this.cameras.main.shake(s.haymakerMs * 0.8, s.haymakerIntensity * 0.8)
    for (const e of this.enemiesNear(x, y, p.radius)) {
      this.damageEnemy(e, p.damage, p.ignoresArmor, 0, false)
      floatingDamage(this, e.x, e.centreY, p.damage, true)
      if (p.stunSeconds > 0) {
        e.applyStun(p.stunSeconds, RULES.combat.stunLockoutMultiple, RULES.combat.stunDiminish)
      }
      if (p.knockbackPixels > 0) e.knockBack(p.knockbackPixels)
    }
  }

  /**
   * Star Rain: many small hits scattered over the area.
   *
   * Each strike is resolved WHERE AND WHEN it lands rather than all at once at
   * the start: a strike three quarters of a second in should miss something
   * that has walked out of the patch, and hit something that has walked into
   * it. Resolving them up front would make the spread cosmetic.
   */
  private powerRain(p: HeroPowerDef, x: number, y: number): void {
    this.rainOver(x, y, p)
  }

  /**
   * A scatter of small strikes over a disc, wherever the disc is.
   *
   * ONE METHOD, TWO CALLERS, because Star Rain is the same volley whether it
   * is thrown at a point or dropped around the hero -- it is Eli's slot 1 now
   * and it was somebody's slot 2 shape before that. Only `hits`, `radius`,
   * `damage`, `gapSeconds` and `ignoresArmor` are read, which both def shapes
   * carry.
   */
  private rainOver(
    x: number, y: number,
    p: { hits: number; radius: number; damage: number; gapSeconds: number; ignoresArmor: boolean },
  ): void {
    const points = rainPoints(p, { x, y }, () => Math.random())
    expandingRing(this, x, y, p.radius, this.hero.def.colour, OVERLAY_DEPTH,
      PRESENTATION.heroFx.rainRingMs)
    points.forEach((pt, i) => {
      const land = (): void => {
        strike(this, pt.x, pt.y, this.hero.def.colour, OVERLAY_DEPTH + 1)
        // A small blast per strike, so a scatter over a crowd spreads its
        // damage instead of all of it landing on one unlucky enemy.
        for (const e of this.enemiesNear(pt.x, pt.y, PRESENTATION.heroFx.strikeLength)) {
          this.damageEnemy(e, p.damage, p.ignoresArmor, 0, false)
          floatingDamage(this, e.x, e.centreY, p.damage, false)
        }
      }
      if (i === 0) land()
      else this.time.delayedCall(p.gapSeconds * 1000 * i, land)
    })
  }

  /**
   * Ice Beam: a line drawn from Eli, and an area that freezes at the far end.
   *
   * THE BEAM IS SCENERY AND THE AREA IS THE POWER. What the player sees is a
   * beam, so one is drawn -- but nothing standing between Eli and the point is
   * touched by it, and a test says so. A beam that hurt what it crossed would
   * be Zoomies in a different colour, and it would make where the hero stands
   * decide who gets hit, which is not the decision this power is asking for.
   *
   * The slow is applied through `Enemy.applySlow`, which refuses on `slowable`
   * -- so a boss that resists crowd control takes the damage and keeps walking
   * without this method knowing anything about bosses.
   */
  private powerBeam(p: HeroPowerDef, x: number, y: number): void {
    const colour = this.hero.def.colour
    // Narrow, because it is a beam rather than a corridor: the width says "a
    // line was drawn here", not "this much of the board was caught".
    // From his feet rather than from his chest: Hero has no mid-body accessor,
    // and everything else on this board -- the cast circle, the rally line,
    // the targeting overlay -- is measured at ground level too.
    lineSweep(this, { x: this.hero.x, y: this.hero.y }, { x, y }, 5, colour, OVERLAY_DEPTH)
    expandingRing(this, x, y, p.radius, colour, OVERLAY_DEPTH + 1)
    for (const e of this.enemiesNear(x, y, p.radius)) {
      this.damageEnemy(e, p.damage, p.ignoresArmor, 0, false)
      floatingDamage(this, e.x, e.centreY, p.damage, true)
      if (p.slowSeconds > 0) {
        e.applySlow(p.slowFactor, p.slowSeconds, RULES.combat.slowDiminish)
      }
    }
  }

  /**
   * Zoomies: she runs the line and knocks over what she goes through.
   *
   * The damage is resolved along the CORRIDOR, up front, from where she is to
   * where she is going — not at the destination. What the power is is the run;
   * a blast at the far end would be Seismic with a walk animation.
   *
   * She is moved by her rally point rather than by writing her position, so
   * she arrives under her own rules, keeps facing the way she went, and does
   * not teleport through anything she is blocking.
   */
  private powerDash(p: HeroPowerDef, x: number, y: number): void {
    const from = { x: this.hero.x, y: this.hero.y }
    const to = { x, y }
    lineSweep(this, from, to, p.radius, this.hero.def.colour, OVERLAY_DEPTH)
    for (const e of this.enemies.filter((q) => q.alive && withinDash({ x: q.x, y: q.y }, from, to, p.radius))) {
      this.damageEnemy(e, p.damage, p.ignoresArmor, 0, false)
      floatingDamage(this, e.x, e.centreY, p.damage, true)
      e.knockBack(p.knockbackPixels)
    }
    this.hero.setRally(x, y)
    this.markers.orderTo(x, y)
    this.cameras.main.shake(PRESENTATION.shake.haymakerMs * 0.5,
      PRESENTATION.shake.haymakerIntensity * 0.5)
  }

  /**
   * Live enemies within `r` of a point, STILL TYPED AS ENEMIES.
   *
   * `withinRadius` is generic over `Targetable`, and without node_modules the
   * `Enemy` class loses its Phaser base and does not satisfy that constraint —
   * so the generic collapses and every `Enemy` member used on the result reads
   * as an error locally whether or not it is one. CLAUDE.md's note on tsdiff
   * is about exactly this. Four lines of filter keep the type and cost
   * nothing; the shared helper is still what the towers and the abilities use,
   * where the results are not walked for hero-specific members.
   */
  private enemiesNear(x: number, y: number, r: number): Enemy[] {
    return this.enemies.filter((e) => e.alive && Math.hypot(e.x - x, e.y - y) <= r)
  }

  /** Spike Strip: the only one that stays. See `tickHazards`. */
  private powerHazard(p: HeroPowerDef, x: number, y: number): void {
    this.hazards.push({
      state: makeHazard(p, x, y),
      // Under the entities, like the lane wash: it is painted on the road.
      art: hazardBand(this, x, y, p.radius, this.hero.def.colour, GROUND_DEPTH + 3),
    })
  }

  /**
   * Every live Spike Strip, one frame on.
   *
   * On the SCALED clock, with the rest of the simulation: a strip that lasted
   * eight real seconds while the world ran at double speed would last four
   * waves' worth of walking at one speed and two at another.
   *
   * Ticks are a COUNT, not a boolean, so a long frame charges twice rather
   * than dropping one — a hazard whose damage depends on the frame rate is a
   * hazard that cannot be balanced.
   */
  private tickHazards(dt: number): void {
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i]!
      const ticks = tickHazard(h.state, dt)
      for (let t = 0; t < ticks; t++) {
        for (const e of this.enemiesNear(h.state.x, h.state.y, h.state.radius)) {
          this.damageEnemy(e, h.state.def.damage, h.state.def.ignoresArmor, 0, false)
          floatingDamage(this, e.x, e.centreY, h.state.def.damage, false)
          e.applySlow(h.state.def.slowFactor, h.state.def.slowSeconds, RULES.combat.slowDiminish)
        }
      }
      h.art.update(h.state.left / Math.max(0.0001, h.state.def.durationSeconds))
      if (hazardExpired(h.state)) {
        h.art.destroy()
        this.hazards.splice(i, 1)
      }
    }
  }

  /** Takes every strip off the board. A run ending must not leave one behind
   *  for the next one, and the scene is restarted rather than rebuilt. */
  private clearHazards(): void {
    for (const h of this.hazards) h.art.destroy()
    this.hazards.length = 0
  }

  /**
   * Haymaker, unchanged: the biggest hit in the game, and it used to read as a
   * slightly larger spark. Four things carry an impact and it had one of them.
   *
   * 1. The pause. One held frame is what makes the eye read a collision rather
   *    than a health bar changing, and it costs nothing.
   * 2. The spark, at nearly twice the size, so it covers the target rather
   *    than sitting on it.
   * 3. The shake, longer and harder than a tower's.
   * 4. The number, which is 130 and should look like 130.
   */
  private skillPunch(k: HeroSkillDef, target: Enemy): void {
    const s = PRESENTATION.shake
    this.damageEnemy(target, k.damage, k.ignoresArmor, 0, false)
    target.knockBack(k.knockbackPixels)
    floatingDamage(this, target.x, target.centreY, k.damage, true, undefined,
      EFFECT_MS.haymakerNumberScale)
    this.cameras.main.shake(s.haymakerMs, s.haymakerIntensity)
    playEffect(this, ART.fx.spark, target.x, target.centreY, {
      size: EFFECT_MS.haymakerSparkSize, depth: target.y + 8,
      durationMs: EFFECT_MS.hitSparkMs + 140,
    })
    hitPause(this, EFFECT_MS.haymakerHitPauseMs, (on) => { this.hitPaused = on })
  }

  /** Quick Cut: two fast hits. The second is skipped if the first killed it,
   *  which is why the hits are separate rather than one doubled number. */
  private skillDouble(k: HeroSkillDef, target: Enemy): void {
    const land = (): void => {
      if (!target.alive) return
      this.damageEnemy(target, k.damage, k.ignoresArmor, 0, false)
      floatingDamage(this, target.x, target.centreY, k.damage, false)
      playEffect(this, ART.fx.spark, target.x, target.centreY, {
        size: EFFECT_MS.haymakerSparkSize * 0.7, depth: target.y + 8,
        durationMs: EFFECT_MS.hitSparkMs,
      })
    }
    land()
    for (let i = 1; i < k.hits; i++) {
      this.time.delayedCall(k.gapSeconds * 1000 * i, () => land())
    }
  }

  /**
   * Ember: a hit now and a burn afterwards.
   *
   * The burn ticks once a second on the scene's own clock and stops itself if
   * the target dies, so a corpse is never charged for the rest of it. Nothing
   * is attached to the enemy: a timer that outlives its target is a leak, and
   * this one is checked against `alive` on every tick.
   */
  private skillBurn(k: HeroSkillDef, target: Enemy): void {
    this.damageEnemy(target, k.damage, k.ignoresArmor, 0, false)
    floatingDamage(this, target.x, target.centreY, k.damage, false)
    let left = k.burnSeconds
    const tick = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        left -= 1
        if (!target.alive || left < 0) { tick.remove(); return }
        this.damageEnemy(target, k.burnPerSecond, k.ignoresArmor, 0, false)
        // The burn is most of Ember's damage and it was silent: a blast puff
        // with no number reads as decoration rather than as the ability still
        // working.
        floatingDamage(this, target.x, target.centreY, k.burnPerSecond, false)
        playEffect(this, ART.fx.blast, target.x, target.centreY, {
          size: 34, depth: target.y + 8, durationMs: EFFECT_MS.hitSparkMs,
        })
      },
    })
  }

  /** Shockwave: everything around him takes a hit and stops for a moment. */
  private skillBurst(k: HeroSkillDef): void {
    const s = PRESENTATION.shake
    playEffect(this, ART.fx.blast, this.hero.x, this.hero.y, {
      size: sizeForRadius(k.radius), depth: this.hero.y + 6, durationMs: EFFECT_MS.blastMs,
    })
    this.cameras.main.shake(s.haymakerMs * 0.6, s.haymakerIntensity * 0.7)
    // Inferred rather than given as `withinRadius<Enemy>`: with node_modules
    // absent the Enemy class loses its Phaser base and satisfies neither form,
    // and this is how every other call site in this file reads. See CLAUDE.md
    // on tsdiff -- AbilityRunner has carried the identical artifact for months.
    for (const e of this.enemiesNear(this.hero.x, this.hero.y, k.radius)) {
      this.damageEnemy(e, k.damage, k.ignoresArmor, 0, false)
      // It was the only slot 1 that dealt damage and printed no number, so a
      // Shockwave into a crowd read as a flash with nothing behind it.
      floatingDamage(this, e.x, e.centreY, k.damage, false)
      e.applyStun(k.stunSeconds, RULES.combat.stunLockoutMultiple, RULES.combat.stunDiminish)
    }
  }

  /**
   * Bark: no damage at all, and everything nearby slows down.
   *
   * THE ONE SKILL WITH NOTHING TO SHOW FOR ITSELF, which is why playtesting
   * reported it as doing nothing. Every other slot 1 lands a damage number, a
   * spark or a blast; Bark deals zero by design, so the only feedback it had
   * was a 3px cream ring at 0.8 alpha that faded in under half a second — over
   * a painted map, at gameplay zoom, next to a hero who is mid-swing.
   *
   * It gets the shared placeholder ring now, tinted to Bailey and drawn at the
   * radius the rule actually uses, plus a mark on each enemy it caught. A slow
   * that nothing acknowledges is indistinguishable from a slow that missed.
   */
  private skillHowl(k: HeroSkillDef): void {
    expandingRing(this, this.hero.x, this.hero.y, k.radius, this.hero.def.colour, OVERLAY_DEPTH)
    play(this, 'hero-hit', 0.4)
    for (const e of this.enemiesNear(this.hero.x, this.hero.y, k.radius)) {
      e.applySlow(k.slowFactor, k.slowSeconds, RULES.combat.slowDiminish)
      // Named rather than numbered: there is no damage to print, and a "0"
      // floating off an enemy reads as the skill failing.
      floatingDamage(this, e.x, e.centreY, 0, false, 'SLOW')
    }
  }

  // ---------------------------------------------------------------- waves

  /**
   * The gap between waves, on a clock.
   *
   * A tower defense where the player can sit in the build phase forever has no
   * pressure in it: every decision can be deferred until it is obvious. The
   * countdown runs on real seconds rather than the scaled game clock, because
   * "15 seconds" should mean fifteen seconds however fast the game is set to
   * run.
   *
   * WAVE 1 IS THE EXCEPTION AND IT HAS NO CLOCK AT ALL. A player arriving on a
   * level they have never seen is reading the map, not deferring a decision --
   * the pressure this countdown exists to create is pressure to hurry through
   * the one moment that should be unhurried. `armReadyCountdown` gives wave 1
   * a zero, and a zero is already the "nothing is counting" case here, so the
   * guard below is what stops it: it returns before the clock can reach zero
   * and call `startWave`. Wave 1 starts when the player says so.
   */
  private tickReadyCountdown(realDt: number): void {
    if (this.status.phase !== 'ready') {
      this.status.readyCountdown = 0
      return
    }
    // Zero means nothing is counting, which is both "the clock ran out" and,
    // on wave 1, "there was never a clock". Neither auto-starts from here.
    if (this.status.readyCountdown <= 0) return
    this.status.readyCountdown = Math.max(0, this.status.readyCountdown - realDt)
    if (this.status.readyCountdown === 0) this.startWave()
  }

  /**
   * Puts a saved run back on the board.
   *
   * Only what was saved: the wave to play next, the purse, the lives and the
   * towers. NOT the wave in flight — a run is always resumed from the start of
   * the wave it was saved on, because the enemies on the field were never
   * saved. Replaying one wave is a small gift; restoring a wave with no
   * enemies in it would be a bug the player cannot see.
   */
  private restoreRun(saved: SavedRun): void {
    // Clamped rather than trusted. RunSave validates the SHAPE; only the scene
    // knows how many waves this level has, and a wave index past the end would
    // read an undefined wave and take the board down with it.
    this.status.wave = Math.min(saved.wave, this.level.waveTable.waves.length - 1)
    this.status.lives = saved.lives
    this.setPeanuts(saved.peanuts)
    // Unlocks are re-derived rather than trusted, then reconciled with what
    // was saved: the wave count is what earns them, so a saved list that
    // disagrees with the wave — a file edited by hand, or a draft that changed
    // shape — must not hand out a tower the run never drew.
    const drawn = new Set([...runState().openingTowers, ...runState().reserveTowers])
    const kept = saved.unlockedTowers.filter((id) => drawn.has(id) && TOWERS[id])
    if (kept.length > 0) this.status.unlockedTowers = kept
    this.grantTowerUnlocks()

    for (const t of saved.towers) {
      const def = TOWERS[t.id]
      // A tower id or a pad that no longer exists is skipped rather than
      // fatal. The peanuts that bought it are gone either way, and a board one
      // tower short is recoverable; a scene that throws on create is not.
      if (!def || !this.build.isFree(t.spot)) continue
      const spot = this.build.spots[t.spot]
      if (!spot) continue
      this.build.occupy(t.spot)
      const tower = new Tower(this, spot.x, spot.y, t.id, def, t.spot)
      tower.distanceToExit = this.roadLeftFrom(spot.x, spot.y)
      tower.restoreTier(t.tier, t.spec)
      this.raiseGarrison(tower)
      tower.on('tierup', () => this.onBoardChanged())
      this.towers.push(tower)
    }
    this.refreshSupport()
    this.refreshMenuOptions()
    // The pads are not built yet — createPads runs later in create() and ends
    // by drawing them, by which time these spots are occupied and the pads
    // under the restored towers are hidden. Drawing them here would be a call
    // against an empty array.
    logEvent('run-resumed',
      `wave ${this.status.wave + 1} lives=${this.status.lives} peanuts=${this.status.peanuts} ` +
      `towers=${this.towers.length}/${saved.towers.length}`)
  }

  /**
   * Writes the run to local storage.
   *
   * Called when something discrete happens — a wave ends, a tower is built,
   * sold, moved or finishes a tier — and never from update(). A snapshot per
   * frame would be a JSON.stringify and a synchronous localStorage write sixty
   * times a second, on the main thread, for a board that changes a few dozen
   * times a run.
   *
   * A finished run is not a run in progress: `endRun` clears the record
   * instead, and this refuses to write one back.
   */
  private saveProgress(): void {
    if (this.status.phase === 'won' || this.status.phase === 'lost') return
    const r = runState()
    saveRun({
      // GameScene loads one level and does not know which it is. The field is
      // written honestly rather than guessed at: level 1 is the only thing
      // this scene can currently be playing.
      level: this.level.id,
      wave: this.status.wave,
      lives: this.status.lives,
      peanuts: this.status.peanuts,
      towers: this.towers.map((t) => ({ id: t.id, spot: t.spot, tier: t.tier, spec: t.spec })),
      heroId: r.heroId,
      abilities: [...this.status.abilities],
      openingTowers: [...r.openingTowers],
      reserveTowers: [...r.reserveTowers],
      unlockedTowers: [...this.status.unlockedTowers],
      seed: r.seed,
    })
  }

  /** The board changed in a way worth remembering: built, sold, moved, or a
   *  tier finished. Support has to be recomputed either way, so the two go
   *  together and neither can be forgotten without the other. */
  private onBoardChanged(): void {
    this.refreshSupport()
    this.saveProgress()
  }

  /**
   * Restarts the clock for the wave that is now pending -- except before wave
   * 1, which has no clock.
   *
   * THE ONE PLACE THE RULE LIVES, and everything else falls out of it:
   *
   *   * `tickReadyCountdown` returns early on a zero, so nothing auto-starts.
   *   * `startWave` pays `floor(readyCountdown) * earlyStartPeanutsPerSecond`,
   *     so a zero clock pays a zero bonus -- there is no timer to beat, so
   *     there is nothing to be rewarded for beating.
   *   * The HUD's banner falls through to `START WAVE 1` rather than a
   *     countdown, because it shows the bonus and the bonus is zero.
   *   * A run resumed before wave 1 gets the same answer, because `create`
   *     calls this AFTER `restoreRun` has put the saved wave back.
   *
   * Wave 1 used to get `firstReadySeconds`, 30s, twice the gap between later
   * waves -- an acknowledgement that the first wave needs longer, made in the
   * currency of a countdown. It needs longer than any number.
   */
  private armReadyCountdown(): void {
    this.status.readyCountdown = this.status.wave === 0 ? 0 : RULES.pacing.readySeconds
  }

  startWave(): void {
    if (this.status.phase !== 'ready') return
    // Whatever is left on the clock is the reward for not using it. An
    // auto-started wave has nothing left, so it pays nothing — the same
    // expression covers both cases without asking who called.
    const saved = Math.floor(this.status.readyCountdown)
    const bonus = saved * RULES.pacing.earlyStartPeanutsPerSecond
    this.status.readyCountdown = 0
    this.escapedThisWave = 0
    this.clearSelection()
    this.spawner.begin(this.level.waveTable.waves[this.status.wave])
    logEvent('wave-start', `${this.status.wave + 1} ${this.level.waveTable.waves[this.status.wave].name} bonus=${bonus}`)
    this.status.phase = 'wave'
    play(this, 'wave-start')
    if (bonus > 0) {
      this.earn(bonus)
      play(this, 'peanuts')
    }
  }

  /**
   * A wave ends when the field is empty and there is nothing left to spawn.
   * Whether it was *cleared* is a separate question, and the one the game used
   * to get wrong: an enemy that escaped was removed from the field exactly
   * like one that died, so the wave cleared either way — and walking the boss
   * off the end finished the run as a win.
   */
  private checkWaveOver(): void {
    if (this.status.phase !== 'wave') return
    // Scripted spawns only. A wave ends when what it SENT is dead; anything a
    // boss called in is not the wave's to account for, and a summoner that
    // kept bursting until the last child died would hold the wave open for as
    // long as it could keep summoning.
    if (!this.spawner.done || this.enemies.some((e) => !e.summoned)) return

    const escaped = this.escapedThisWave
    const last = this.status.wave + 1 >= this.level.waveTable.waves.length
    const { cleared, runEnds } = waveOutcome(escaped, last)
    logEvent('wave-end', `${this.status.wave + 1} cleared=${cleared} escaped=${escaped}`)

    if (cleared) {
      play(this, 'wave-cleared')
      this.earn(RULES.peanutsPerWaveCleared)
    }
    // THE WAVE ENDING CANCELS THE PICK. A selection made during a fight is
    // about that fight's board, and carrying it silently across the boundary
    // leaves nodes pulsing at a player who has stopped looking at them.
    this.drawer?.collapse()
    this.drawerPick = null
    this.refreshCancel()
    this.drawSpots()
    this.status.wave++
    this.grantTowerUnlocks()

    if (runEnds) {
      this.endRun(runEnds)
      return
    }
    this.status.phase = 'ready'
    this.armReadyCountdown()
    // THE MAIN SAVE POINT. A wave boundary is the only place the run is in a
    // state worth restoring: nothing is on the field, nothing is in flight,
    // and the next wave has not started.
    this.saveProgress()
    if (cleared) {
      this.announce('WAVE CLEARED', COLOR.good)
    } else {
      // Not a clear, and it should not sound like one. The banner is the whole
      // announcement now: the sentence that used to follow it lived in the
      // instruction bar, and that bar is gone.
      const n = escaped === 1 ? 'ONE GOT THROUGH' : `${escaped} GOT THROUGH`
      this.announce(n, COLOR.fire)
    }
  }

  /** A 3rd tower after wave 4 and a 4th after wave 8, drawn from the reserve. */
  private grantTowerUnlocks(): void {
    const run = runState()
    const target = unlockedTowerCount(DRAFT, this.status.wave)
    while (this.status.unlockedTowers.length < target) {
      const next = run.reserveTowers[this.status.unlockedTowers.length - DRAFT.towersAtStart]
      if (!next) break
      this.status.unlockedTowers.push(next)
      this.refreshMenuOptions()
      this.announce(`NEW TOWER: ${TOWERS[next].name.toUpperCase()}`, COLOR.amber)
    }
  }

  /** Public for the harness, which has to be able to reach the results
   *  dialog to check what draws over it. */
  endRun(phase: 'won' | 'lost'): void {
    if (this.status.phase === 'won' || this.status.phase === 'lost') return
    this.status.phase = phase
    this.clearSelection()
    this.markerLayer.clear()
    for (const p of this.pads) p.setVisible(false)

    const won = phase === 'won'
    // The run is over, so there is no run in progress. Won or lost: a finished
    // run offered back on the title screen would be a resume into a results
    // dialog, and the record is cleared before anything else can write it.
    clearRun()
    // Clearing a run is what unlocks the Server Nuke for every run after it.
    if (won) recordRunCleared()
    play(this, won ? 'won' : 'lost')

    // What the run was worth. Depth is the main term, so a defeat still banks
    // something: DESIGN.md replaced the three-star rating with the Banner
    // precisely so that a run ending at wave nine is still progress.
    const outcome: RunOutcome = {
      wavesReached: this.status.wave,
      cleared: won,
      livesRemaining: this.status.lives,
      maxLives: RULES.startingLives,
    }
    const earned = bannerPointsFor(outcome, RULES.banner)
    const total = addBannerPoints(earned)
    this.status.alert = won ? 'The line held.' : 'Overrun.'

    this.openDialog({
      title: won ? 'HELD THE LINE' : 'OVERRUN',
      subtitle: verdictFor(outcome, RULES.banner),
      headline: { value: `+${earned}`, label: 'BANNER POINTS EARNED' },
      rows: [
        { label: 'Waves survived', value: `${this.status.wave} of ${this.status.waveCount}` },
        { label: 'Lives remaining', value: `${this.status.lives} of ${RULES.startingLives}` },
        { label: 'Kills', value: `${this.status.kills}` },
        { label: 'Peanuts earned', value: `${this.status.peanutsEarned}` },
        { label: 'Banner Points, all runs', value: `${total}`, accent: true },
      ],
      // The run is over: a tap on the board behind must not put the player
      // back on a dead board with no way off it.
      dismissable: false,
      dim: 0.68,
      confirm: { label: 'TRY AGAIN', onPick: () => this.tryAgain() },
      cancelLabel: 'QUIT TO TITLE',
      onCancel: () => this.toTitle(),
    })
  }

  /**
   * A fresh run, at the loadout screen rather than straight back onto the same
   * board. The hand is part of the run in a roguelite, so retrying re-draws
   * it — and the loadout screen is where a player is shown what they drew.
   */
  private tryAgain(): void {
    logEvent('scene', 'Game -> Loadout (try again)')
    setRunState({ heroId: runState().heroId, seed: Date.now() >>> 0 })
    this.scene.stop('Hud')
    this.scene.start('Loadout')
  }

  private toTitle(): void {
    logEvent('scene', 'Game -> Title')
    this.scene.stop('Hud')
    this.scene.start('Title')
  }

  /**
   * A banner across the top of the board, ONE AT A TIME.
   *
   * It used to create a new text at `viewW / 2, viewH * 0.3` on every call,
   * with no idea another might already be there. Five things announce
   * themselves — a cleared wave, a leak, a new tower, a rare drop, Last Stand
   * — and three of them fire on a wave boundary. `endWave` calls
   * `grantTowerUnlocks()` and then `announce('WAVE CLEARED')` zero
   * milliseconds apart, so the player saw "NEW TOWER: BRAMBLE" and "WAVE
   * CLEARED" drawn through each other, one word at a time.
   *
   * So there is a queue and one slot. A banner holds the slot for its whole
   * life and the next one waits. Nothing is dropped: a new tower is worth
   * saying even a second late, and silently discarding the second message
   * would trade one bug for a quieter one.
   */
  private announce(text: string, color: string): void {
    this.bannerQueue.push({ text, color })
    this.showNextBanner()
  }

  private showNextBanner(): void {
    if (this.bannerShowing) return
    const next = this.bannerQueue.shift()
    if (!next) return
    this.bannerShowing = true
    const b = PRESENTATION.banner
    const t = this.add.text(viewW(this) / 2, viewH(this) * b.yFraction, next.text, {
      fontFamily: FONT_UI, fontSize: `${b.size}px`, fontStyle: 'bold', color: next.color,
      stroke: '#0d1016', strokeThickness: 7, letterSpacing: 2,
    }).setOrigin(0.5).setDepth(OVERLAY_DEPTH + 20).setScale(0.5)
    this.asScreenSpace([t])
    this.tweens.add({ targets: t, scale: 1, duration: b.popMs, ease: 'Back.easeOut' })
    this.tweens.add({
      targets: t, alpha: 0, delay: b.holdMs, duration: b.fadeMs,
      onComplete: () => {
        t.destroy()
        this.bannerShowing = false
        // A gap, so two in a row read as two rather than as one flicker.
        this.time.delayedCall(b.gapMs, () => this.showNextBanner())
      },
    })
  }

  // ---------------------------------------------------------------- loop

  update(_time: number, delta: number): void {
    // Proof of life for the watchdog. Written every frame; read from outside
    // Phaser, so a loop that has stopped being served can still be noticed.
    heartbeat()

    // A wind-up whose tween went away with a restart would otherwise refuse
    // every ability for the rest of the session. Cheap to check, and it logs,
    // so if it ever fires the report says so.
    if (this.casting && this.time.now > this.castUntil) {
      this.casting = false
      logEvent('cast-stuck', 'wind-up outlived its tween; abilities re-enabled')
    }

    // Anything created since the last split has to be given to a camera.
    if (this.children.list.length !== this.splitAt) this.syncCameras()

    // The node pulse is a per-frame thing and only while something is picked,
    // so the pads are not redrawn for the other ninety-nine per cent of a run.
    if (this.drawerPick) this.drawSpots()

    // A backgrounded tab hands back a huge delta; cap it so nothing teleports.
    const real = Math.min(delta / 1000, 0.05)
    // Everything the simulation does runs on a scaled clock: enemies walk,
    // spawners spawn, towers fire and cooldowns tick, all at the same multiple.
    // Scaling the clock rather than each speed in turn is what makes the game
    // faster without moving any part of the tuning relative to another.
    //
    // `holdFrames` is the hit pause. Everything the world simulates comes off
    // this one number, so holding the world still on impact is one flag rather
    // than a freeze threaded through every system — and the camera below is
    // deliberately outside it, so the shake still plays over the held frame.
    const dt = this.hitPaused ? 0 : real * RULES.pacing.gameSpeed

    // The camera is gated here, every frame, from one question — rather than
    // by each overlay remembering to switch it off. Dialog remembered;
    // ScratchCard did not, which is why dragging to scratch a card also
    // dragged the board underneath it. The rig listens at the SCENE level, so
    // an interactive object on top of the board does not stop it hearing the
    // drag, and no amount of care inside an overlay would have.
    this.rig.setEnabled(cameraAcceptsGestures(this.modalOpen))

    // The camera runs on real time. It is feel, not simulation, and a camera
    // that eased 40% faster would read as twitchy rather than as brisk.
    this.rig.update(real)

    // Real time as well, and for the same reason: it is the board saying it is
    // waiting for a tap, and it has to keep saying so while the world is held
    // still for a hit pause or a wind-up.
    this.pulseTargetArea()
    // The scaled clock, with the rest of the simulation.
    this.tickHazards(dt)

    if (this.status.phase === 'won' || this.status.phase === 'lost') return

    this.tickReadyCountdown(real)
    this.cooldowns.tick(dt)

    if (this.status.phase === 'wave') {
      for (const spawn of this.spawner.update(dt)) {
        const def = ENEMIES[spawn.enemy]
        if (!def) continue
        // The lane the group named, or the main one. An unknown name resolves
        // to main rather than throwing — see LaneNetwork.lane.
        const lane = this.lanes.lane(spawn.lane)
        const enemy = new Enemy(this, def, lane.path, this.gateway,
          { lanes: this.lanes, laneId: lane.id })
        // The goblin's line, once per run, on the FIRST enemy to actually come
        // out of the arch. Hung off the emergence rather than the spawn so it
        // lands with the fade-in — spawning happens off the plate, behind the
        // stonework, where there is nothing to hear it about.
        //
        // The flag is set INSIDE the callback, not here. Claiming it at spawn
        // would spend the line on an enemy that has not emerged yet, and one
        // that dies short of the mouth would take the only greeting of the run
        // with it.
        //
        // Two lines can want the same hook, so they are CHAINED rather than
        // assigned: a run whose first enemy to emerge is also the boss would
        // otherwise lose whichever was written second.
        const onEmerge: Array<() => void> = []
        if (!this.greeted) {
          onEmerge.push(() => {
            if (this.greeted) return
            this.greeted = true
            play(this, 'goblin-spawn')
          })
        }
        // The Politician's entrance. Once per run, and on him BECOMING
        // VISIBLE rather than on the wave starting: the spawn happens off the
        // plate behind the arch's stonework, several seconds before there is
        // anything on screen to be talking about.
        //
        // Nothing stops it once it starts. It runs 7.3 seconds, which is
        // longer than he may survive, and a line cut off mid-sentence because
        // the player killed him quickly is worse than one that outlives him —
        // so it is fired and left alone. Phaser mixes rather than steals
        // voices, and audio.test.ts holds the property that nothing in the
        // game calls stopAll.
        if (def.tier === 'boss' && !this.politicianSpoke) {
          onEmerge.push(() => {
            if (this.politicianSpoke) return
            this.politicianSpoke = true
            play(this, 'politician')
            logEvent('voice', 'politician line on boss emerge')
          })
        }
        if (onEmerge.length > 0) enemy.onEmerge = () => { for (const fn of onEmerge) fn() }
        logEvent('spawn', `${spawn.enemy} hp=${def.maxHealth} lane=${lane.id}`)
        this.enemies.push(enemy)
        if (def.tier === 'boss') this.announceBoss(enemy)
      }
    }

    this.tickTax(dt)
    this.tickSummons(dt)
    this.tickTowerDisable(dt)
    this.tickGarrisons(dt)
    this.trackBoss()

    this.tickEngagement()
    this.tickEnemies(dt)
    for (const t of this.towers) t.tick(dt, this.enemies, (tower, target) => this.fire(tower, target))
    this.shots = this.shots.filter((s) => !s.tick(dt))
    this.fighters = this.fighters.filter(
      (f) => !f.tick(dt, this.enemies, (e, dmg) => this.damageEnemy(e, dmg, false)),
    )
    this.hero.tick(dt, this.enemies, (e, dmg) => this.damageEnemy(e, dmg, this.hero.def.ignoresArmor))

    if (this.selected) {
      // Redrawn every frame with the panel: the tower can finish an upgrade
      // while its own panel is open, and the ring has to say so.
      this.drawSelectedRange(this.selected)
      this.ring?.reposition()
    }

    // The move order ends when he gets there, not when it is given. The ring
    // stays on the destination for the whole walk — it is the order, and an
    // order the player can no longer see is one they cannot cancel — and both
    // markers go together on arrival so the board is clean the moment he
    // stops.
    if (this.markers.hasOrder && this.hero.atRally) {
      this.markers.endOrder()
      this.markers.deselect()
      this.heroSelected = false
    }
    // Real time, like the camera: these are interface animations, not
    // simulation. Run on the game clock the "one turn every 3 seconds" the
    // brief asks for came out at 2.1s, because the game runs at 1.4x — and it
    // would have sped up again with any future change to gameSpeed.
    this.markers.advance(real)
    this.drawHeroMarkers()

    this.status.heroHealth = this.hero.health
    this.status.heroDown = this.hero.down
    this.status.heroReviveIn = this.hero.reviveIn
    this.status.heroPowered = this.hero.powered
    this.status.lastStand = this.hero.lastStandActive
    this.noteHeroState()
    this.status.enemiesLeft = this.enemies.length + this.spawner.remaining

    this.checkWaveOver()
  }

  /**
   * The Politician's tax. He never touches a tower or the hero; he takes a
   * share of what the player is holding, on a clock that speeds up as he is
   * worn down. Spending is the counterplay, so the number he takes has to be
   * unmissable.
   */
  private tickTax(dt: number): void {
    for (const e of this.enemies) {
      const take = e.tickTax(dt, this.status.peanuts)
      if (take <= 0) continue
      this.setPeanuts(this.status.peanuts - take)
      logEvent('taxed', `${e.def.name} -${take} -> ${this.status.peanuts}`)
      floatingDamage(this, e.x, e.centreY, take, true, `-${take} PEANUTS`)
      play(this, 'taxed', 0.7)
      this.cameras.main.shake(140, 0.004)
      this.status.alert = `${e.def.name} taxed you ${take} peanuts. Spend it or lose it.`
    }
  }

  /**
   * Bosses calling in help.
   *
   * The child appears at the summoner's OWN place on the summoner's OWN lane,
   * with the summoner's progress, so it carries on toward the exit from there
   * rather than walking in from a gate the boss left long ago. On a branching
   * map that also means it inherits the branch, and merges where its parent
   * would have.
   *
   * The CAP is counted here rather than on the enemy, because only the scene
   * knows what is still on the field. It counts children still pointing at
   * THIS summoner, so two bosses do not share an allowance and a dead one's
   * brood is not charged against a live one.
   *
   * Summoned children are ordinary enemies in every other respect: they can be
   * shot, blocked, slowed and taxed, and they pay their normal bounty. The one
   * difference is that `checkWaveOver` does not wait for them.
   */
  /**
   * How much road is left between a point and the exit.
   *
   * The point is projected onto every lane and the SMALLEST remainder wins, so
   * a tower covering the fork is measured against whichever branch it is really
   * watching. Used only as the tower-disable's tie-break between two towers
   * that cost the same, and computed once when a tower is built because a
   * building does not move.
   *
   * Distance to the exit rather than distance travelled: on a branching map the
   * two branches have their own zero, so "how far along" is not comparable
   * across them and "how much is left" is.
   */
  private roadLeftFrom(x: number, y: number): number {
    let best = Infinity
    for (const l of this.lanes.lanes) {
      const route = this.lanes.routeLength(l.id)
      const pts = l.path.points
      let travelled = 0
      let bestOnLane = Infinity
      let atBest = 0
      for (let i = 0; i < pts.length - 1; i++) {
        const ax = pts[i]!.x, ay = pts[i]!.y
        const bx = pts[i + 1]!.x, by = pts[i + 1]!.y
        const dx = bx - ax, dy = by - ay
        const len2 = dx * dx + dy * dy
        const seg = Math.sqrt(len2)
        const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0
        const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy))
        if (d < bestOnLane) {
          bestOnLane = d
          atBest = travelled + seg * t
        }
        travelled += seg
      }
      best = Math.min(best, route - atBest)
    }
    return best
  }

  /**
   * The Rainbow Reaper switching the board off, one tower at a time -- and the
   * Glitch Bug taking one away for good.
   *
   * The rule is in systems/TowerDisable.ts and is Phaser-free; this is the
   * scene half -- who the candidates are, and what the player sees. ONE
   * BRANCH separates the two casters, on `destroys`, and it is here: the
   * cooldown, the target, the windup and the rule that a caster killed
   * mid-cast lands nothing are the same code for both.
   *
   * THE BOLT IS THE TELEGRAPH. It launches when the windup starts and lands
   * exactly when the disable does, so what the player sees pointing at a tower
   * is the thing that is about to switch it off. A charge-up on the boss with
   * no line to the target would say "something is coming" and not "that one".
   */
  private tickTowerDisable(dt: number): void {
    if (this.status.phase !== 'wave') return
    for (const e of this.enemies) {
      const d = e.disabler
      if (!d) continue
      // Rebuilt each tick because value, tier and disabled state all move. The
      // tower rides along on the candidate so the event can point back at it.
      const candidates = this.towers.map((t) => ({
        x: t.x,
        y: t.y,
        value: t.investedValue,
        distanceToExit: t.distanceToExit,
        disabledFor: t.disabledFor,
        tower: t,
      }))
      const ev = d.tick(dt, e.alive, e.x, e.y, candidates)
      if (!ev) continue
      if (ev.kind === 'windup') {
        this.telegraphDisable(e, ev.target.tower, e.def.towerDisable!.windup, d.destroys)
      } else if (d.destroys) {
        this.destroyTower(ev.target.tower, e)
      } else {
        this.landDisable(ev.target.tower, e.def.towerDisable!.duration)
      }
    }
  }

  /**
   * The bolt on its way, and a ring on what it is going to hit.
   *
   * RED FOR A KILL, PINK FOR A STUN, and the ring is thicker and pulses rather
   * than closing once. The two casts cost the player very different things and
   * a player who has learned the Reaper's telegraph must not read the Glitch
   * Bug's as the same thing arriving.
   */
  private telegraphDisable(from: Enemy, tower: Tower, windupSeconds: number,
                           destroys = false): void {
    const ms = windupSeconds * 1000
    // World space, which is the default here: `syncCameras` re-splits the
    // scene every time it runs, so an effect born mid-frame is picked up by
    // the world camera without being registered anywhere.
    const bolt = this.add.sprite(from.x, from.centreY, ART.fx.bossBolt)
    bolt.setDisplaySize(96, 82)      // the sheet's 482x412, kept in proportion
    bolt.setDepth(tower.y + 40)
    // The sheet is drawn travelling right, so it is turned to face where it is
    // actually going. Flattened vertically like everything else on a 3/4 map.
    bolt.setRotation(Math.atan2((tower.y - from.centreY) * 0.5, tower.x - from.x))
    bolt.play({ key: ART.fx.bossBolt, duration: ms })
    this.tweens.add({
      targets: bolt,
      x: tower.x,
      y: tower.y - 20,
      duration: ms,
      ease: 'Sine.easeIn',
      onComplete: () => bolt.destroy(),
    })

    // And a ring on the target, so the answer to "which one" does not depend on
    // following a fast-moving sprite across the board.
    const ring = this.add.graphics()
    ring.lineStyle(destroys ? 5 : 3, destroys ? 0xff3b30 : 0xff5ce0, 0.9)
    ring.strokeCircle(0, 0, 34)
    ring.setPosition(tower.x, tower.y)
    ring.setDepth(tower.y - 1)
    this.tweens.add({
      targets: ring,
      scale: { from: 2.2, to: 1 },
      alpha: { from: 0.2, to: 1 },
      duration: ms,
      onComplete: () => ring.destroy(),
    })
    if (destroys) {
      logEvent('destroy-windup', `${from.def.name} -> ${tower.def.name} in ${windupSeconds}s`)
      this.status.alert = `${from.def.name} has locked on to your ${tower.def.name}.`
    } else {
      logEvent('disable-windup', `${from.def.name} -> ${tower.def.name} in ${windupSeconds}s`)
    }
  }

  /**
   * The tower is gone, and its pad is free again.
   *
   * GONE, NOT DARK. A destroyed tower does not come back and is not refunded:
   * what the player gets back is the pad, which is worth something -- the
   * peanuts to rebuild are the price of not having killed the bug in time.
   * Every step here is `sellTower`'s minus the refund, and for the same
   * reasons: the pad has to be released or nothing can ever be built there
   * again, and the selection has to be dropped or the ring keeps pointing at
   * an object that no longer exists.
   */
  private destroyTower(tower: Tower, by: Enemy): void {
    this.build.release(tower.spot)
    this.towers = this.towers.filter((t) => t !== tower)
    const [x, y] = [tower.x, tower.y]
    tower.destroy()
    if (this.selected === tower) {
      this.selected = null
      this.syncTargeting()
    }
    // A Shelter taken away stops lifting its neighbours, the same as one
    // switched off does -- except permanently.
    this.refreshSupport()
    this.onBoardChanged()
    this.refreshMenuOptions()
    this.rangeRing.clear()
    this.drawSpots()

    this.blast(x, y, 70)
    this.cameras.main.shake(180, 0.006)
    play(this, 'death')
    logEvent('tower-destroyed', `${by.def.name} took ${tower.def.name}`)
    this.status.alert = `${tower.def.name} destroyed. The pad is free.`
  }

  /** The lights go out. */
  private landDisable(tower: Tower, seconds: number): void {
    tower.disabledFor = seconds
    // A disabled Shelter's aura goes dark with it, so the towers it was lifting
    // drop back to their own numbers for the duration.
    this.refreshSupport()

    const overlay = this.add.sprite(tower.x, tower.y - 26, ART.fx.stunned)
    overlay.setDisplaySize(74, 60)   // the sheet's 617x499, kept in proportion
    overlay.setDepth(tower.y + 60)
    // PLAYED STRAIGHT THROUGH, ONCE. Neither sheet loops seamlessly, so a
    // three-and-a-half second disable cannot be three and a half seconds of
    // looped animation without a visible jump every pass. It runs once at a
    // readable rate and then holds its last frame, pulsing, until the tower
    // comes back -- motion for the whole duration and no seam in it.
    overlay.play({ key: ART.fx.stunned, duration: 900 })
    const pulse = this.tweens.add({
      targets: overlay,
      alpha: { from: 1, to: 0.45 },
      duration: 500,
      yoyo: true,
      repeat: -1,
      delay: 900,
    })
    this.time.delayedCall(seconds * 1000, () => {
      pulse.remove()
      overlay.destroy()
      // The tower's own tick clears `disabledFor` and hands it a fresh
      // cooldown; this only puts the aura back if it was a Shelter.
      this.refreshSupport()
    })
    logEvent('disable-land', `${tower.def.name} off for ${seconds}s`)
  }

  private tickSummons(dt: number): void {
    if (this.status.phase !== 'wave') return
    // A copy, because spawning appends to the list being walked.
    for (const parent of [...this.enemies]) {
      const spec = parent.def.summons
      if (!spec) continue
      let due = parent.dueSummons(dt)
      if (due <= 0) continue

      const def = ENEMIES[spec.enemy]
      if (!def) continue
      if (spec.cap !== undefined) {
        const alive = this.enemies.filter((e) => e.summonedBy === parent).length
        due = Math.min(due, Math.max(0, spec.cap - alive))
      }

      for (let i = 0; i < due; i++) {
        const at = parent.summonPoint
        const lane = this.lanes.lane(at.laneId)
        const child = new Enemy(this, def, lane.path, this.gateway, {
          lanes: this.lanes,
          laneId: at.laneId,
          startAt: { laneDistance: at.laneDistance, distance: at.distance },
          summonedBy: parent,
        })
        this.enemies.push(child)
        logEvent('summon', `${parent.def.name} -> ${def.name} lane=${at.laneId} at=${at.distance.toFixed(0)}`)
      }
    }
  }

  /** Feeds the bar across the top, and clears it when the boss is gone. */
  private trackBoss(): void {
    const boss = this.enemies.find((e) => e.alive && e.def.tier === 'boss')
    if (!boss) {
      this.status.bossName = ''
      return
    }
    this.status.bossName = boss.def.name
    this.status.bossHealth = boss.health
    this.status.bossMax = boss.maxHealth
    // Phase changes are the interesting part of a boss fight and the reported
    // freeze happened during one, so they are logged as they cross.
    const phase = boss.taxPhaseIndex
    if (phase !== this.lastBossPhase) {
      this.lastBossPhase = phase
      logEvent('boss-phase', `${boss.def.name} phase ${phase} hp=${Math.round(boss.health)}`)
    }
  }

  private announceBoss(boss: Enemy): void {
    const W = viewW(this)
    const mid = viewH(this) / 2
    play(this, 'boss', 0.95)
    this.cameras.main.shake(600, 0.007)

    // SIZED FROM ITS CONTENTS, not from the screen.
    //
    // It was `platePanel(this, 0, mid - 78, W, 156)` — exactly the full width,
    // and 156px is 40% of a 390px phone. A card that always fills the screen
    // is not a card, it is a takeover, and it was one for a two-word name and
    // one line of flavour. The two texts are built first, measured, and the
    // plate is drawn round them. The screen is still the bound: the card can
    // reach `maxWidthFraction` of it and no further.
    const c = PRESENTATION.bossCard
    const name = this.add.text(0, 0, boss.def.name.toUpperCase(), {
      fontFamily: FONT_DISPLAY, fontSize: `${c.nameSize}px`, color: COLOR.fire,
      stroke: '#0d1016', strokeThickness: 9,
    }).setOrigin(0.5, 0).setDepth(TICKET_DEPTH + 1)
    // 17px under a 56px name was a 3.3:1 ratio: the tagline read as a caption
    // on someone else's poster. Closer to 2:1 makes it part of the card.
    const sub = this.add.text(0, 0, boss.def.flavor, {
      fontFamily: FONT_UI, fontSize: `${c.taglineSize}px`, color: COLOR.ink, ...BODY_SPACING,
      align: 'center',
      wordWrap: { width: Math.min(c.maxTextWidth, W * c.maxWidthFraction - c.padX * 2) },
    }).setOrigin(0.5, 0).setDepth(TICKET_DEPTH + 1)

    const cardW = Math.min(
      W * c.maxWidthFraction,
      Math.max(name.width, sub.width) + c.padX * 2,
    )
    const cardH = name.height + c.gap + sub.height + c.padY * 2
    const card = platePanel(this, (W - cardW) / 2, mid - cardH / 2, cardW, cardH)
    card.forEach((p) => p.setDepth(TICKET_DEPTH))
    name.setPosition(W / 2, mid - cardH / 2 + c.padY)
    sub.setPosition(W / 2, mid - cardH / 2 + c.padY + name.height + c.gap)

    this.tweens.add({ targets: name, scale: { from: 0.7, to: 1 }, duration: 380, ease: 'Back.easeOut' })
    // The plate is many images, so the fade targets them all as one list.
    const pieces: Phaser.GameObjects.GameObject[] = [...card, name, sub]
    this.asScreenSpace(pieces)
    this.tweens.add({
      targets: pieces, alpha: 0, delay: 2200, duration: 700,
      onComplete: () => pieces.forEach((o) => o.destroy()),
    })
    this.status.alert = `${boss.def.name} is here. He does not attack — he taxes. Spend your peanuts.`
  }

  /**
   * Stands up an Ima Dummy Tower's lads, at the nearest lane point in range.
   *
   * THE DEFAULT IS A REAL DEFAULT, not a placeholder: a tower built beside the
   * road is immediately useful, and the rally point is something a player moves
   * when they want to rather than something they must set before the tower does
   * anything.
   */
  private raiseGarrison(tower: Tower): void {
    if (!tower.isDeployer) return
    const rally = defaultRally(this.lanes, { x: tower.x, y: tower.y }, tower.range)
    const g = { tower, rally, soldiers: [] as Soldier[] }
    this.garrisons.push(g)
    this.manGarrison(g)
  }

  /**
   * Brings a garrison up to the strength its tier calls for, and posts everyone.
   *
   * Called on every tier change as well as at build time, because `Need a
   * Friend?` is exactly a change in this number -- the third lad walks on when
   * the branch finishes, at the same rally point as the other two.
   */
  private manGarrison(g: { tower: Tower; rally: RallySpot | null; soldiers: Soldier[] }): void {
    const want = g.tower.soldierCount
    const art = soldierSprite(g.tower.def.sprite, g.tower.tier)
    const stations = g.rally
      ? soldierStations(this.lanes, g.rally, want)
      : Array.from({ length: want }, () => ({ x: g.tower.x, y: g.tower.y }))
    while (g.soldiers.length < want) {
      const at = stations[g.soldiers.length]!
      const s = new Soldier(this, at.x, at.y, g.tower.soldierHealth, art)
      // A lad who arrives mid-wave walks on rather than appearing in a fight.
      g.soldiers.push(s)
    }
    for (const [i, s] of g.soldiers.entries()) {
      const at = stations[i] ?? stations[0]!
      s.postTo(at.x, at.y)
      // A tier raises the living as well as the newly arrived: the numbers are
      // the tower's, not a snapshot taken when the soldier was made.
      const full = g.tower.soldierHealth
      if (full !== s.maxHealth) {
        const share = s.maxHealth > 0 ? s.health / s.maxHealth : 1
        s.maxHealth = full
        s.health = Math.max(1, Math.round(full * share))
      }
    }
  }

  /** Every garrison, one frame: respawns, orders and swings. */
  private tickGarrisons(dt: number): void {
    // Who is holding whom, read off the enemies rather than tracked twice.
    const held = new Map<Soldier, Enemy>()
    for (const e of this.enemies) {
      if (e.blocker instanceof Soldier) held.set(e.blocker, e)
    }
    for (const g of this.garrisons) {
      if (g.soldiers.length !== g.tower.soldierCount) this.manGarrison(g)
      const rage = g.tower.rage
      for (const s of g.soldiers) {
        // RAGE IS STICKY FOR THE LIFE, and checked before the swing so the
        // hit that takes a soldier under the line is not itself enraged --
        // "below 35%" is a state it enters, not a bonus on the blow.
        if (rage && !s.enraged && s.health > 0 && s.health / s.maxHealth < rage.below) {
          s.enraged = true
        }
        const damage = g.tower.soldierDamage * (s.enraged && rage ? rage.damage : 1)
        const interval = g.tower.soldierInterval * (s.enraged && rage ? rage.interval : 1)
        s.tick(dt, held.get(s) ?? null, g.tower.soldierRespawn, damage, interval,
          (enemy, dmg) => this.damageEnemy(enemy, dmg, false, 0))
      }
    }
  }

  /**
   * A tap on the map while an Ima Dummy Tower is selected.
   *
   * REFUSALS ARE SAID OUT LOUD. A control used with a thumb on a moving board
   * that silently does nothing is indistinguishable from one that is broken,
   * and this one is refused often by design -- the ring is small and the lane
   * wanders in and out of it.
   */
  private orderRally(tower: Tower, x: number, y: number): void {
    const g = this.garrisons.find((q) => q.tower === tower)
    if (!g) return
    const { spot, refused } = rallyFromTap(this.lanes, { x: tower.x, y: tower.y }, tower.range, x, y)
    // THE TWO REFUSALS ARE NOT THE SAME REFUSAL, and they get different
    // answers. `out-of-range` is the right idea at the wrong distance -- the
    // ring is small and the lane wanders in and out of it -- so it keeps the
    // tower selected and flashes the ring, which is what makes a second try
    // one tap rather than three. `no-lane` is a tap at nothing, which is the
    // player leaving; it exits the mode, like a tap off the legal area for an
    // ability. Both are said out loud either way: a control used with a thumb
    // on a moving board that silently does nothing reads as broken.
    if (!spot) {
      if (refused === 'out-of-range') {
        this.status.alert = 'Too far. The lads stay inside the ring — tap closer, or CANCEL.'
        this.flashRange(tower)
        play(this, 'error')
        return
      }
      this.clearSelection('outside')
      this.status.alert = 'Nothing to guard there.'
      play(this, 'error')
      return
    }
    // The request is NOT resolved here, deliberately. An accepted rally order
    // does not end the mode: the tower is still selected, the lads can still
    // be moved again, and CANCEL is still the way out of that. The mode ends
    // when the selection does, which `syncTargeting` derives.
    g.rally = spot
    this.manGarrison(g)
    this.drawRallyMark(spot)
    this.syncTargeting()
    this.status.alert = `${tower.def.name}: holding the ${spot.laneId} lane.`
  }

  /** A quick pulse of the selected tower's range ring, for a refused order. */
  private flashRange(tower: Tower): void {
    const ring = this.add.graphics()
    ring.lineStyle(4, 0xff6b6b, 0.9).strokeCircle(tower.x, tower.y, tower.range)
    ring.setDepth(tower.y - 2)
    this.tweens.add({
      targets: ring, alpha: 0, duration: 480, ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    })
  }

  /** Where the lads have been told to stand. */
  private drawRallyMark(spot: RallySpot | null): void {
    this.rallyMark?.destroy()
    this.rallyMark = undefined
    if (!spot) return
    const g = this.add.graphics()
    g.lineStyle(3, 0xf0a830, 0.95).strokeCircle(spot.x, spot.y, 14)
    g.lineStyle(2, 0xf0a830, 0.6).strokeCircle(spot.x, spot.y, 22)
    g.setDepth(spot.y - 3)
    this.rallyMark = g
  }

  /** The hero and any summoned fighters hold enemies up. Whoever is closest
   *  to the exit gets held first, since they are the real threat. */
  private tickEngagement(): void {
    const holders: Array<{ who: Blocker; range: number; capacity: number }> = []
    if (this.hero.alive) {
      holders.push({ who: this.hero, range: this.hero.blockRange, capacity: this.hero.def.blockCapacity })
    }
    for (const f of this.fighters) {
      if (f.alive) holders.push({ who: f, range: this.hero.def.blockRange, capacity: 1 })
    }
    // The Ima Dummy Tower's lads, on exactly the same terms. This is why the
    // feature was mostly data: blocking already existed for the hero and the
    // gnomes, and a soldier is a Blocker like they are -- ONE enemy each, and
    // an enemy with no free blocker keeps walking.
    for (const g of this.garrisons) {
      for (const s of g.soldiers) {
        if (s.alive) holders.push({ who: s, range: g.tower.soldierBlockRange, capacity: 1 })
      }
    }
    const live = new Map(holders.map((h) => [h.who, h]))

    // A grip, once taken, is kept.
    //
    // The assignment used to be cleared and rebuilt from scratch every frame,
    // with the slots going to whoever was furthest along the lane. Held
    // enemies stop while the ones behind them keep walking, so the ordering
    // inverts constantly and the three slots changed hands over and over. The
    // capacity was still honoured — never four at once — but *which* three
    // were being held churned, and a crowd standing on one man with the grip
    // rotating through it looks exactly like a man blocking all of them.
    //
    // Now a hold is released only when it stops being possible: the enemy or
    // the holder is gone, or the enemy has left the ring. Everything else
    // walks past, and goes on walking past.
    let heldByHero = 0
    for (const e of this.enemies) {
      const h = e.blocker ? live.get(e.blocker) : undefined
      if (!h || !e.alive || !e.blockable
          || Math.hypot(e.x - h.who.x, e.y - h.who.y) > h.range) {
        e.blocker = null
        continue
      }
      h.capacity--
      if (h.who === this.hero) heldByHero++
    }

    for (const h of holders) {
      if (h.capacity <= 0) continue
      const near = withinRadius(this.enemies, h.who.x, h.who.y, h.range)
        .filter((e) => e.blocker === null && e.blockable)
      // Whoever is closest to the exit is the real threat, so they are grabbed
      // first out of whatever room is left.
      near.sort((a, b) => b.distance - a.distance)
      for (const e of near.slice(0, h.capacity)) {
        e.blocker = h.who
        if (h.who === this.hero) heldByHero++
      }
    }

    // What the pips over his health bar and the ring under his feet report.
    // Read from the rule rather than recounted, so the number shown is the
    // number the engagement actually used.
    this.hero.blocking = heldByHero
  }

  private tickEnemies(dt: number): void {
    const survivors: Enemy[] = []
    for (const e of this.enemies) {
      // `alive` now means "not dead AND still on the board", so the extra
      // `active` check this line used to carry is folded into it.
      if (!e.alive) continue
      if (e.tick(dt, (dmg) => this.damageBlocker(e, dmg))) {
        this.leak(e)
        continue
      }
      survivors.push(e)
    }
    this.enemies = survivors
  }

  // ---------------------------------------------------------------- combat

  private fire(tower: Tower, target: Enemy): void {
    // A support tower has no projectile and never reaches here, but the type
    // says so now rather than the comment.
    const shot = tower.def.shot
    if (!shot) return

    play(this, `tower-${tower.id}`)
    const m = tower.muzzle(tower.aimAt(target.x, target.centreY))
    // Locked in at fire time, not at impact: the ramp is the reward for the
    // shot the tower just took, and the projectile is in the air for long
    // enough that reading it on arrival would credit the wrong shot.
    const power = tower.damage * tower.rampMultiplier
    this.shots.push(
      new Projectile(this, m.x, m.y, shot, target, tower.def.projectileSpeed, (hit) => {
        this.impactSpark(hit.x, hit.target.centreY)
        if (tower.splashRadius > 0) {
          this.blast(hit.x, hit.y, tower.splashRadius)
          for (const e of withinRadius(this.enemies, hit.x, hit.y, tower.splashRadius)) {
            this.hitWith(tower, e, power)
          }
        } else {
          this.hitWith(tower, hit.target, power)
          this.chainFrom(tower, hit.target, power)
        }
      }),
    )
  }

  /**
   * One tower's shot landing on one enemy, with whatever its specialization
   * does to that. Every behaviour that changes an impact lives here, so a
   * splash hit, a direct hit and a chained hit all get the same treatment.
   */
  private hitWith(tower: Tower, enemy: Enemy, power: number): void {
    if (!enemy.alive) return
    const b = tower.behaviour

    // Execute: anything already this badly hurt simply dies. Checked before
    // damage so it reads as a finisher rather than as a big number.
    const cut = b.executeBelowPercent ?? 0
    if (cut > 0 && enemy.health <= enemy.maxHealth * cut) {
      this.damageEnemy(enemy, enemy.health + 1, true)
      return
    }

    const armoured = enemy.effectiveArmor > 0
    const amount = power * (armoured ? (b.bonusVsArmored ?? 1) : 1)
    this.damageEnemy(enemy, amount, tower.def.ignoresArmor || b.ignoresArmor === true, tower.armorPierce)

    const slow = tower.slowSeconds || (tower.splashRadius > 0 ? (b.splashSlowSeconds ?? 0) : 0)
    if (slow > 0) enemy.applySlow(tower.def.slowFactor || 0.5, slow, RULES.combat.slowDiminish)
    // A stun is its own effect, not a very strong slow. Routing it through
    // the slow system let it refresh on every shot, and a 0.6s stop refreshed
    // every 0.81s is a permanent one: Amendment stopped everything it touched
    // for the rest of the wave. `applyStun` refuses to re-apply until its
    // lockout has run out.
    if ((b.stunSeconds ?? 0) > 0) {
      enemy.applyStun(b.stunSeconds as number, RULES.combat.stunLockoutMultiple,
        RULES.combat.stunDiminish)
    }
  }

  /** Specs that hit more than one thing per shot. */
  private chainFrom(tower: Tower, from: Enemy, power: number): void {
    const extra = tower.behaviour.chainTargets ?? 0
    if (extra <= 0) return
    const falloff = tower.behaviour.chainFalloff ?? 0.6
    const near = withinRadius(this.enemies, from.x, from.y, tower.range * 0.55)
      .filter((e) => e !== from && e.alive)
      .slice(0, extra)
    for (const e of near) {
      this.impactSpark(e.x, e.centreY)
      this.hitWith(tower, e, power * falloff)
    }
  }

  private impactSpark(x: number, y: number): void {
    playEffect(this, ART.fx.spark, x, y, {
      size: EFFECT_MS.hitSparkSize, depth: y + 2, durationMs: EFFECT_MS.hitSparkMs,
    })
  }

  private blast(x: number, y: number, radius: number): void {
    // Sized to the splash it is actually doing, and then left alone: the
    // frames grow and fade by themselves. The old version tweened one tile
    // from half size to full, which read as a balloon inflating.
    playEffect(this, ART.fx.blast, x, y, {
      size: sizeForRadius(radius), depth: y + 3, durationMs: EFFECT_MS.splashMs,
    })
  }

  private damageEnemy(
    enemy: Enemy,
    damage: number,
    ignoresArmor: boolean,
    pierce = 0,
    /** Off for a hit that draws its own, bigger number. */
    showNumber = true,
  ): void {
    if (!enemy.alive) return
    if (enemy.hurt(damage, ignoresArmor, showNumber, pierce)) {
      play(this, 'death')
      // A boss who retreats is logged as retreating. The line is read back off
      // a soak run and off a crash report, and "death: The Glitch Lich King"
      // at wave 7 followed by the same name at wave 13 is the one reading that
      // would make the log look wrong when the game was right.
      if (enemy.def.retreatsWhenDefeated) {
        logEvent('retreat', `${enemy.def.name} withdraws +${enemy.def.peanutReward}`)
        this.status.alert = `${enemy.def.name} withdraws. That is not the last of him.`
      } else {
        logEvent('death', `${enemy.def.name} +${enemy.def.peanutReward}`)
      }
      this.status.kills++
      this.earn(enemy.def.peanutReward)
      this.rollRareDrop(enemy)
    } else {
      // Rotated, because a wave lands far more hits than one sample can carry
      // before it starts to sound like a stuck key.
      playRotating(this, 'hit', ['hit-a', 'hit-b', 'hit-c'])
    }
  }

  /**
   * Server Nuke drops off elites and bosses only, and only once a run. The
   * roll happens on the kill so the drop is felt as a reward for the fight
   * that just happened rather than as a wave-clear payout.
   */
  private rollRareDrop(enemy: Enemy): void {
    const cfg = RULES.serverNuke
    // The gate that was missing. The Server Nuke is the reward for finishing
    // the game once; without this it could turn up on a first-ever run, which
    // is exactly what it did. Once per run on top of that.
    if (!hasClearedARun()) return
    if (this.nukeUsed || this.status.rareAbility !== null) return
    if (!cfg.dropFromTiers.includes(enemy.def.tier)) return
    if (Math.random() >= cfg.dropChance) return

    this.status.rareAbility = cfg.abilityId
    this.cooldowns.reset(cfg.abilityId)
    this.announceRareDrop(ABILITIES[cfg.abilityId].name)
  }

  /**
   * The launch confirmation.
   *
   * Bypasses armAbility entirely on the way back in: the ability is cast from
   * `fireAbility` once the dome has actually been pressed, so nothing that
   * merely opens this panel can spend the drop.
   */
  /** Public for the harness, which taps this button at both ends of the
   *  zoom band to prove it fires. */
  openNukeLaunch(): void {
    if (this.nukeLaunch?.active) return
    this.nukeLaunch = new NukeLaunchOverlay(
      this,
      () => {
        this.nukeLaunch = null
        // Instant targeting: the nuke takes the whole board, so there is
        // nowhere to aim it.
        this.fireAbility(RULES.serverNuke.abilityId, this.hero.x, this.hero.y)
      },
      () => {
        this.nukeLaunch = null
        this.status.alert = 'Launch aborted. The nuke is still yours.'
      },
    )
    this.asScreenSpace(this.nukeLaunch.objects)
  }

  /**
   * The announcement, when the drop is EARNED — not when it is used.
   *
   * Once per run by construction: the drop itself is gated on `nukeUsed` and
   * on `rareAbility` already being held, so this cannot fire twice.
   *
   * It is deliberately not shown while another ability is winding up or while
   * a dialog is open. Freezing the board on top of a cast the player is
   * watching, or on top of a decision they are making, turns the loudest
   * moment in the game into an interruption.
   */
  announceRareDrop(name: string): void {
    if (this.casting || this.modalOpen) {
      // The drop still happened; it just arrives quietly rather than on top of
      // something else. Better a muted moment than a stolen one.
      this.announce(name.toUpperCase(), '#8fd0ff')
      this.status.alert = `${name} acquired. One use.`
      play(this, 'cast-servernuke', 0.8)
      return
    }

    const slot = this.abilitySlotFor(RULES.serverNuke.abilityId)
    this.nukeEarned = new NukeEarnedOverlay(
      this,
      ABILITIES[RULES.serverNuke.abilityId].icon,
      slot,
      () => {
        this.nukeEarned = null
        this.status.alert = `${name} acquired. One use. Tap it when you mean it.`
      },
    )
    this.nukeEarned.onEffect = (obj) => this.asScreenSpace([obj])
    this.asScreenSpace(this.nukeEarned.objects)
  }

  /**
   * Where in the ability bar an icon will end up, so the announcement can fly
   * into it.
   *
   * Worked out from the same region list the HUD builds its slots from, rather
   * than guessed at — the bar re-centres itself when the hand grows, so a
   * hardcoded corner would point at the wrong place precisely on the one
   * occasion this is used.
   */
  private abilitySlotFor(id: string): { x: number; y: number; height: number } {
    const bar = PRESENTATION.abilityBar as BarMetrics
    const hero = this.heroDef()
    const defs = slotDefs(
      this.status.abilities,
      this.status.rareAbility,
      (aid) => ABILITIES[aid],
      heroSlotDefs(hero),
    )
    // The bar is laid out for the hand INCLUDING the new drop, which is what
    // the HUD will do on its next frame.
    const width = barWidth(defs, bar)
    const layout = hudLayout(
      {
        width: viewW(this),
        height: viewH(this),
        insets: safeAreaInsets(),
        countersWidth: 0,
        abilitiesWidth: width,
      },
      LAYOUT,
    )
    const placed = regions(defs, bar, {
      x: layout.abilities.x,
      y: layout.abilities.y,
      scale: layout.abilityScale,
      iconH: 64,
    })
    const mine = placed.find((r) => r.id === id) ?? placed[placed.length - 1]
    if (!mine) {
      return { x: viewW(this) / 2, y: viewH(this) - 50, height: 64 }
    }
    return { x: mine.cx, y: mine.cy, height: mine.boxH }
  }

  /** Routes an enemy's melee to whatever is actually holding it. */
  private damageBlocker(enemy: Enemy, damage: number): void {
    const target = enemy.blocker
    if (target === this.hero) this.damageHero(damage)
    else if (target) target.hurt(damage)
  }

  private damageHero(damage: number): void {
    play(this, 'hero-hit')
    const result = this.hero.hurt(damage)
    if (result === 'lastStand') this.announceLastStand()
    if (result === 'down') {
      this.status.alert =
        `${this.hero.def.name} is down. Back on the spot in ${realSeconds(this.hero.def.reviveSeconds)}s.`
      this.cameras.main.shake(240, 0.006)
    }
  }

  private announceLastStand(): void {
    const ls = this.hero.def.lastStand
    const s = PRESENTATION.shake
    this.cameras.main.flash(340, 255, 90, 60)
    this.cameras.main.shake(s.lastStandMs, s.lastStandIntensity)

    // THE LINE LANDS ON THE SUV, not on the flash.
    //
    // The sequence was: everything at once on the frame he drops to 25%, and
    // the SUV appearing 500ms later. So the words were 240ms ahead of the only
    // thing on screen they are about — he was still a man fading out while the
    // line was already talking.
    //
    // Measured off the recording in 20ms windows: 260ms of silence, then
    // speech, and that first syllable is the loudest window in the whole line.
    // Starting the cue at transformPauseMs minus that lead-in puts the WORD on
    // the frame the vehicle appears.
    const lead = Math.max(0, ls.transformPauseMs - cueLeadInMs('dadmode-voice'))
    this.time.delayedCall(lead, () => play(this, 'dadmode-voice'))

    // The sting is not played here. It lands ON the transformation, which is
    // 500ms away, so it hangs off the hero's own 'transformed' event —
    // registered in create() beside 'revived'. Two timers set to the same
    // number is not synchronisation, it is a coincidence maintained by hand.
    // The world stops for a moment. Everything else here — flash, shake,
    // sting, banner — was already firing and it still went past unnoticed,
    // because the wave carried on walking straight through it. A held beat is
    // what turns a set of simultaneous effects into a moment.
    hitPause(this, EFFECT_MS.lastStandHoldMs, (on) => { this.hitPaused = on })
    this.announce(ls.name, COLOR.fire)
    this.status.alert =
      `${ls.name}! Damage doubled, defence gone. He cannot be touched for a moment.`
  }

  /**
   * An enemy getting out through the gate.
   *
   * The gate is OPEN in this plate — two leaves standing apart with a dark gap
   * between them — so nothing is hit and nothing slams. The enemy has been
   * fading across that gap for the last fifteen world pixels and is gone by
   * the time this runs, which makes the leak bookkeeping rather than an event
   * to stage.
   *
   * The slam went with it: a heavy hit sound, two dust puffs at the enemy's
   * feet and a camera shake, all describing a collision with a gate that is
   * painted shut. This one is not. The life-lost sting stays, because that is
   * the counter changing, not the impact.
   */
  private leak(enemy: Enemy): void {
    // Counted, not just charged for: an escape is what stops a wave being a
    // clear, and stops the last wave being a win.
    this.escapedThisWave++
    logEvent('escape', `${enemy.def.name} -${enemy.def.livesCost} lives`)
    this.status.lives -= enemy.def.livesCost

    floatingDamage(this, enemy.x, enemy.centreY, enemy.def.livesCost, true)
    enemy.destroy()

    // The last one gets its own sound, so the player hears the difference
    // without having to read the counter.
    play(this, this.status.lives <= 0 ? 'last-life' : 'life-lost')
    if (this.status.lives <= 0) {
      this.status.lives = 0
      this.endRun('lost')
    }
  }

  /**
   * Recomputed whenever the tower set changes, rather than every frame.
   *
   * A DARK BEACON LIFTS NOTHING, and it did until this line was written.
   * `landDisable` has called this since the Rainbow Reaper shipped, with a
   * comment saying "a disabled Shelter's aura goes dark with it" -- and this
   * loop never asked, so the boss could switch a Beacon off and every gun it
   * covered kept the 30% (or a specialised 90%) as if nothing had happened.
   * The comment described the intent and the code did the other thing for as
   * long as both have existed. The Glitch Bug made it matter more: it takes
   * the Beacon away entirely, and the difference between "gone" and "off"
   * should not be that only one of them is felt.
   */
  private refreshSupport(): void {
    for (const t of this.towers) {
      if (t.isSupport) continue
      let bonus = 0
      let range = 0
      let pierce = 0
      for (const s of this.towers) {
        if (!s.isSupport || s === t || s.disabledFor > 0) continue
        if (Phaser.Math.Distance.Between(s.x, s.y, t.x, t.y) <= s.supportRadius) {
          bonus += s.supportDamageBonus
          // A specialized Shelter gives its neighbours something beyond raw
          // damage, which is what makes its tier-3 choice a choice.
          range += s.supportRangeBonus
          pierce += s.grantsPierce
        }
      }
      t.supportBonus = bonus
      t.grantedRange = range
      t.grantedPierce = pierce
    }
  }

  /** Exposed for the HUD. */
  abilityDef(id: string): AbilityDef | undefined {
    return ABILITIES[id]
  }

  /**
   * The un-greyed icon key for a slot, ability or hero button alike.
   *
   * FALLS BACK when the texture is not loaded. Two of the ten hero icons were
   * not in the art upload, and a manifest key with no file behind it draws
   * Phaser's missing-texture green rather than nothing -- in the middle of the
   * ability bar, which reads as a rendering fault. The generated stand-in says
   * "not here yet" instead, and dropping the real file in later needs no code
   * change at all.
   */
  abilityIcon(id: string): string | undefined {
    const key = ABILITIES[id]?.icon
      ?? (isHeroSlot(id) ? slotContents(this.hero.heroId, id).icon : undefined)
    if (key === undefined) return undefined
    return this.textures.exists(key) ? key : ART.generated.iconMissing
  }

  heroDef(): HeroDef {
    return this.hero.def
  }
}

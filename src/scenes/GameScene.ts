import Phaser from 'phaser'
import type { ScratchOutcome } from '../systems/Scratch.ts'
import { NukeEarnedOverlay, NukeLaunchOverlay } from '../ui/NukeOverlays.ts'
import type {
  AbilityDef, DraftDef, EnemyDef, HeroDef, MapDef, RulesDef, TowerDef, WavesDef,
} from '../types.ts'
import displayData from '../data/display.json'
import mapData from '../data/map.json'
import rulesData from '../data/rules.json'
import towersData from '../data/towers.json'
import enemiesData from '../data/enemies.json'
import heroesData from '../data/heroes.json'
import wavesData from '../data/waves.json'
import abilitiesData from '../data/abilities.json'
import draftData from '../data/draft.json'

import { Path } from '../systems/Path.ts'
import { BuildSystem } from '../systems/BuildSystem.ts'
import type { BuildSpot } from '../systems/BuildSystem.ts'
import { WaveSpawner } from '../systems/WaveSpawner.ts'
import { withinRadius, pickNearest } from '../systems/Targeting.ts'
import { GROUND_DEPTH } from '../systems/DepthSort.ts'
import { distanceAtX, gateShake, type EmergeConfig } from '../systems/Gateway.ts'
import { makeRng } from '../systems/Draft.ts'
import { scatter, type ScatterKind, type Rect } from '../systems/Scatter.ts'
import { installAmbient, type AmbientDef, type AmbientStyle } from '../systems/Ambient.ts'
import { dashArcs, HeroMarkers, type MarkersDef } from '../systems/HeroMarkers.ts'
import { ART, applyRender, fitContentHeight } from '../systems/Art.ts'
import { EFFECT_MS, playEffect, sizeForRadius } from '../systems/Effects.ts'
import { Cooldowns } from '../systems/Cooldowns.ts'
import { unlockedTowerCount } from '../systems/Draft.ts'
import { runState, setRunState } from '../systems/RunState.ts'
import { castAbility } from '../systems/AbilityRunner.ts'
import { deathPuff, PRESENTATION, floatingDamage, hitPause } from '../systems/Presentation.ts'
import { play, playRotating, resetVoices } from '../systems/Audio.ts'
import { Enemy } from '../entities/Enemy.ts'
import type { Blocker } from '../entities/Enemy.ts'
import { Tower } from '../entities/Tower.ts'
import { Hero } from '../entities/Hero.ts'
import { Fighter } from '../entities/Fighter.ts'
import { Projectile } from '../entities/Projectile.ts'
import { BuildMenu } from '../ui/BuildMenu.ts'
import { ScratchCard } from '../ui/ScratchCard.ts'
import { BODY_SPACING, COLOR, FONT_DISPLAY, FONT_UI } from '../ui/Theme.ts'
import { platePanel, plateButton, type PlateButton } from '../ui/Plate.ts'
import { SignBribe } from '../ui/SignBribe.ts'
import { CameraRig } from '../systems/CameraRig.ts'
import { Dialog, type DialogChoice, type DialogOptions } from '../ui/Dialog.ts'
import { TowerPanel, type PanelRow } from '../ui/TowerPanel.ts'
import { maxTier, nextStep, sellValue, specPoints, statAt } from '../systems/Upgrades.ts'
import { canAffordAny, openingPurse } from '../systems/Economy.ts'
import { addBannerPoints, hasClearedARun, recordRunCleared } from '../systems/Save.ts'
import { bannerPointsFor, verdictFor, type RunOutcome } from '../systems/Banner.ts'
import { waveOutcome } from '../systems/Wave.ts'
import { logEvent, provideState } from '../systems/Diagnostics.ts'
import { heartbeat, setRunActive } from '../systems/Watchdog.ts'
import { hudLayout, hudTakesPress, NO_INSETS, type HudLayout } from '../systems/HudLayout.ts'
import { cameraAcceptsGestures, LAYER } from '../systems/Layers.ts'
import { barWidth, regions, slotDefs, type BarMetrics } from '../systems/AbilityBar.ts'
import { safeAreaInsets } from '../systems/SafeArea.ts'
import { onSceneResize, sceneIsLive } from '../systems/SceneEvents.ts'
import { musicForScene } from '../systems/Music.ts'
import { deviceScale, fitUiCamera, viewH, viewW } from '../systems/Resolution.ts'

/** The HUD's layout constants, shared with HudScene so both agree. */
const LAYOUT = PRESENTATION.hud.layout

const MAP = mapData as MapDef
const RULES = rulesData as RulesDef
const TOWERS = towersData as Record<string, TowerDef>
const ENEMIES = enemiesData as Record<string, EnemyDef>
const HEROES = heroesData as Record<string, HeroDef>
const WAVES = wavesData as WavesDef
const ABILITIES = abilitiesData as Record<string, AbilityDef>
const DRAFT = draftData as DraftDef

export type Phase = 'ready' | 'wave' | 'won' | 'lost'
/** What a click means right now. */
export type Mode = 'normal' | 'targeting' | 'restructure'

export interface GameStatus {
  peanuts: number
  lives: number
  wave: number
  waveCount: number
  waveName: string
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
  /** Seconds until the next wave starts by itself. 0 when nothing is counting. */
  readyCountdown: number
  /** Run totals, for the results screen. Kills counts enemies killed by any
   *  means; earned counts peanuts taken in, not peanuts recovered by selling. */
  kills: number
  peanutsEarned: number
  message: string
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

/** One blue for both hero markers: they are two halves of one idea, and two
 *  blues would read as two systems. */
const MARKER_BLUE = 0x4fa3e3

export class GameScene extends Phaser.Scene {
  readonly status: GameStatus = {
    peanuts: 0, lives: 0, wave: 0, waveCount: WAVES.waves.length, waveName: '',
    phase: 'ready', mode: 'normal', enemiesLeft: 0,
    heroName: '', heroHealth: 0, heroMax: 0, heroDown: false, heroReviveIn: 0,
    lastStand: false,
    unlockedTowers: [], abilities: [], rareAbility: null, pendingAbility: null,
    readyCountdown: 0, message: '',
    kills: 0, peanutsEarned: 0,
    alert: '',
    bossName: '', bossHealth: 0, bossMax: 0,
  }

  readonly cooldowns = new Cooldowns()

  private lane!: Path
  private build!: BuildSystem
  private sign!: SignBribe
  private cancelBtn!: PlateButton
  private dialog?: Dialog
  /** The tower panel. Non-modal and anchored beside its tower, so the range
   *  ring it is asking about stays visible behind it. */
  private panel?: TowerPanel
  /** True while the upgrade button is hovered or held, which brightens the
   *  projected range ring. */
  private previewingUpgrade = false
  /** Public so a harness run can read the camera's state. */
  rig!: CameraRig
  /** Everything drawn in screen space rather than on the map. The main
   *  camera ignores it, so it neither pans nor zooms. */
  private uiCam!: Phaser.Cameras.Scene2D.Camera
  /** Where the HUD's elements sit. Public so anything the scene draws in
   *  screen space can keep clear of them without guessing. */
  layout: HudLayout = hudLayout(
    { width: 1280, height: 720, insets: NO_INSETS, countersWidth: 0, abilitiesWidth: 0 },
    LAYOUT,
  )
  private readonly screenSpace: Phaser.GameObjects.GameObject[] = []
  /** Set at press time when the press belonged to a menu, ticket or dialog. */
  private pressTakenByUi = false
  /** Held still for a beat on a big impact. See `castHaymaker`. Public so a
   *  harness run can assert the pause happened rather than infer it. */
  hitPaused = false
  /** Child count at the last camera split, so new objects get assigned. */
  private splitAt = -1
  private spawner!: WaveSpawner
  private hero!: Hero
  private menu!: BuildMenu

  private enemies: Enemy[] = []
  private towers: Tower[] = []
  private shots: Projectile[] = []
  private fighters: Fighter[] = []

  /** One marker per build spot, created once and then shown or hidden. */
  private pads: Phaser.GameObjects.Image[] = []
  /** Where the arch lets go and where the gate stops them, in lane distance. */
  private gateway!: { mouthDistance: number; stopDistance: number; emerge: EmergeConfig }
  /** Cropped out of the map plate at scene start; see createArchOccluders. */
  /** Public for the harness, which counts them and reads their depth. */
  archOccluders: Phaser.GameObjects.Image[] = []
  /** Gate-impact shake bookkeeping, so a wave arriving together does not hold
   *  the camera in continuous motion. */
  private lastGateShake = -99999
  private gateBurst = 0
  /** Whether the goblin has already said his line this run. One per RUN, not
   *  per wave and not per enemy. */
  private greeted = false
  /** Which spot keeps the full DO NOT BUILD HERE sign. The rest get the quiet
   *  marker; see createPads. Public so a harness run can check there is
   *  exactly one and that it is the one nearest the entrance. */
  signSpotIndex = 0
  /** How many decoration props were placed. Read by the harness; the density
   *  knob is `scatter.rules.attempts`, and this is what it produced. */
  scatterCount = 0
  private markerLayer!: Phaser.GameObjects.Graphics
  /** The dashed circle showing what an upgrade would make this tower's reach.
   *  Its own layer, because rangeRing is cleared and redrawn constantly. */
  private projectedRing!: Phaser.GameObjects.Graphics
  /** The seconds left on the revive, drawn on the spot he comes back to.
   *  A Text rather than part of markerLayer, which can only draw shapes. */
  private reviveLabel!: Phaser.GameObjects.Text
  /** The legal drop corridor while a path-only summon is armed. Its own layer
   *  because markerLayer is cleared and redrawn every frame by the rally
   *  marker, which wiped the band the moment it was painted. */
  private pathBand!: Phaser.GameObjects.Graphics
  private hoverSpot: BuildSpot | null = null
  private heroSelected = false
  /** The selection ring and the move order. Three states, and it owns the
   *  timing of all of them; see HeroMarkers. */
  private readonly markers = new HeroMarkers(PRESENTATION.heroMarkers as MarkersDef)
  private rangeRing!: Phaser.GameObjects.Graphics
  private targetRing!: Phaser.GameObjects.Graphics
  private selected: Tower | null = null
  /** The tower being moved, exposed so a harness run can see a half-finished
   *  relocation get cancelled. */
  restructuring: Tower | null = null
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
    this.hoverSpot = null
    this.selected = null
    this.restructuring = null
    this.heroSelected = false
    this.ticket?.destroy()
    this.ticket = null

    const run = runState()
    const heroDef = HEROES[run.heroId] ?? HEROES.cory

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

    this.lane = new Path(MAP.waypoints)
    // The arch mouth and the gate face are measured off the painted plate as
    // map positions; the enemy walks in lane distance. Converted once here
    // rather than per enemy per frame.
    this.gateway = {
      mouthDistance: distanceAtX(MAP.waypoints, MAP.entrance.emergeFromX),
      stopDistance: distanceAtX(MAP.waypoints, MAP.exit.gateX),
      emerge: { fadeMs: MAP.entrance.fadeMs, startScale: MAP.entrance.startScale },
    }
    this.build = new BuildSystem(MAP.buildSpots, MAP.spotRadius)
    this.spawner = new WaveSpawner()

    this.drawPlate()
    this.buildSign()

    this.markerLayer = this.add.graphics().setDepth(GROUND_DEPTH + 6)
    this.projectedRing = this.add.graphics().setDepth(GROUND_DEPTH + 5)
    this.reviveLabel = this.add.text(0, 0, '', {
      fontFamily: FONT_UI, fontSize: '20px', fontStyle: 'bold', color: COLOR.ink,
      stroke: '#0d1016', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(GROUND_DEPTH + 7).setVisible(false)
    this.pathBand = this.add.graphics().setDepth(GROUND_DEPTH + 4)
    this.rangeRing = this.add.graphics().setDepth(OVERLAY_DEPTH)
    this.targetRing = this.add.graphics().setDepth(OVERLAY_DEPTH + 1)

    this.hero = new Hero(this, MAP.heroStart[0], MAP.heroStart[1], heroDef)
    this.hero.on('revived', () => {
      play(this, 'build')
      logEvent('hero', 'revived at the entrance')
      this.status.message = `${heroDef.name} is back on his feet.`
    })

    // A floor rather than a constant: the opening instruction is to build a
    // tower, so the purse has to cover the cheapest one this run actually drew.
    this.status.peanuts = openingPurse(
      RULES.startingPeanuts,
      RULES.startingPeanutsMargin,
      run.openingTowers.map((id) => TOWERS[id].cost),
    )
    this.status.lives = RULES.startingLives
    this.status.wave = 0
    this.status.kills = 0
    this.status.peanutsEarned = 0
    this.status.phase = 'ready'
    this.status.mode = 'normal'
    this.status.waveName = WAVES.waves[0].name
    this.status.enemiesLeft = 0
    this.status.heroName = heroDef.name
    this.status.heroMax = heroDef.maxHealth
    this.status.heroHealth = heroDef.maxHealth
    this.status.heroDown = false
    this.status.heroReviveIn = 0
    this.status.lastStand = false
    this.status.pendingAbility = null
    this.casting = false
    this.castUntil = 0
    this.status.abilities = [...run.abilities]
    // The rare drop does not survive a run, and is never drafted into one.
    this.status.rareAbility = null
    this.greeted = false
    this.status.bossName = ''
    this.status.bossHealth = 0
    this.status.bossMax = 0
    this.nukeUsed = false
    this.status.unlockedTowers = run.openingTowers.slice(0, DRAFT.towersAtStart)
this.armReadyCountdown()
        this.status.message = this.idleHint()

    for (const id of this.status.abilities) this.cooldowns.register(id, ABILITIES[id].cooldown)
    this.cooldowns.register(RULES.serverNuke.abilityId, ABILITIES[RULES.serverNuke.abilityId].cooldown)
    this.cooldowns.register('haymaker', heroDef.haymaker.cooldown)
    this.cooldowns.register('restructure', heroDef.restructure.cooldown)

    // Arming an ability or a restructure used to be escapable only with ESC or
    // a right-click, neither of which exists on a touch device: once armed, the
    // player was stuck casting. This is the way out.
    // Above the ability row rather than on it: at a fixed `height - 96` this
    // landed on the icons on a phone, which is where the thumb already is.
    this.cancelBtn = plateButton(this, viewW(this) / 2,
      this.layout.abilities.y - 30,
      190, 44, 'CANCEL', () => this.clearSelection(), 16, 'secondary')
    for (const part of this.cancelBtn.parts) {
      (part as Phaser.GameObjects.Image).setDepth?.(OVERLAY_DEPTH + 5)
    }
    this.asScreenSpace(this.cancelBtn.parts)
    this.setCancelVisible(false)

    // The camera goes on last, so bounds are set against a world that is
    // fully built. The world stays 1280x720; only the view moves.
    // Gestures belong to the run and die with it, so nothing can pan or zoom
    // on a menu after the scene stops.
    this.events.once('shutdown', () => this.rig?.destroy())
    this.rig = new CameraRig(this, {
      worldWidth: displayData.width,
      worldHeight: displayData.height,
      // Open on the hero, not on the middle of the map: at the closer default
      // zoom the centre of the board is a patch of grass.
      startX: MAP.heroStart[0],
      startY: MAP.heroStart[1],
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
    })

    this.menu = new BuildMenu(this, [])
    this.refreshMenuOptions()
    this.setupInput()
    this.createPads()

    // What a crash report says about the run. Registered here and cleared on
    // shutdown, so a report taken from a menu does not describe a dead scene.
    provideState(() => ({
      scene: 'Game',
      phase: this.status.phase,
      wave: `${this.status.wave + 1}/${this.status.waveCount}`,
      waveName: this.status.waveName,
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
      zoom: this.cameras?.main
        ? Number(this.cameras.main.zoom.toFixed(3))
        : 'unavailable (camera torn down)',
      escapedThisWave: this.escapedThisWave,
    }))
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
    const plate = this.add.image(0, 0, ART.map[MAP.plate]).setOrigin(0, 0).setDepth(GROUND_DEPTH)
    this.createScatter()
    this.createArchOccluders()
    this.createAmbient()
    plate.setDisplaySize(displayData.width, displayData.height)
  }

  /**
   * The villager's sign. It is painted into the plate as a blank board, so the
   * sprite goes on top of it and sorts by its own foot like everything else.
   */
  private buildSign(): void {
    const cfg = MAP.sign
    this.sign = new SignBribe(this, cfg.x, cfg.y, cfg.boardWidth, RULES.signBribe)
    this.sign.setDepth(this.sign.depthY)
  }

  /**
   * Paying the villager. He buys nothing — no stats, no tower, no advantage —
   * so the only thing that changes is the sign and the size of your wallet.
   */
  private tapSign(): void {
    const cfg = RULES.signBribe
    switch (this.sign.tap(this.status.peanuts)) {
      case 'done':
        this.status.message = cfg.paidToast
        return
      case 'broke':
        play(this, 'broke')
        this.status.message = cfg.brokeToast
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
            this.status.message = cfg.brokeToast
            return
          }
          this.status.peanuts -= cfg.cost
          this.sign.pay()
          play(this, 'peanuts', 0.9)
          this.status.message = cfg.paidToast
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
    this.layout = hudLayout(
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
    this.status.message = text
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
    this.status.peanuts += amount
    this.status.peanutsEarned += amount
    logEvent('peanuts', `+${amount} -> ${this.status.peanuts}`)
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
    return this.menu.isOpen || this.status.mode === 'restructure'
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
   * The archway, put back in front of the enemies walking under it.
   *
   * The arch is painted into the map plate, which is one image at the bottom
   * of the depth order, so nothing can be drawn behind part of it. The fix
   * needs no new art: the two stone piers are cropped OUT of the plate at
   * scene start and re-added as their own images, sorted by their base like
   * any other scenery. An enemy under the arch is then behind real stone
   * rather than approximately behind it.
   *
   * The passage between the piers is deliberately not covered. Cropping the
   * whole arch rectangle would also copy the road, and an enemy standing in
   * the opening would be hidden behind a picture of the ground it is on.
   *
   * Cropped at the plate's own resolution and scaled down on the way out, so
   * the piers carry exactly the detail the plate does and no less.
   */
  private createArchOccluders(): void {
    const plate = this.textures.get(ART.map.level1)
    const img = plate?.getSourceImage() as CanvasImageSource | undefined
    if (!img) return
    const srcW = plate.source[0]?.width ?? 0
    if (srcW <= 0) return
    // The plate is authored larger than the world box it covers.
    const perWorld = srcW / displayData.width

    MAP.entrance.occluders.forEach((r, i) => {
      const key = `gen-arch-${i}`
      if (!this.textures.exists(key)) {
        const sw = Math.round(r.w * perWorld)
        const sh = Math.round(r.h * perWorld)
        const canvas = this.textures.createCanvas(key, sw, sh)
        if (!canvas) return
        canvas.context.drawImage(
          img, Math.round(r.x * perWorld), Math.round(r.y * perWorld), sw, sh, 0, 0, sw, sh,
        )
        canvas.refresh()
      }
      const piece = this.add.image(r.x + r.w / 2, r.y + r.h / 2, key)
      piece.setDisplaySize(r.w, r.h)
      // Sorted by its base, exactly like a tower or a rock: an enemy higher up
      // the screen is behind it, one lower down is in front. That is the same
      // one rule the rest of the board uses, not a special case for the arch.
      piece.setDepth(r.y + r.h)
      this.archOccluders.push(piece)
    })
  }

  private createScatter(): void {
    const cfg = PRESENTATION.scatter
    const kinds = (cfg.kinds as ScatterKind[]).filter((k) => this.textures.exists(k.key))
    if (kinds.length === 0) return
    const placements = scatter({
      worldWidth: displayData.width,
      worldHeight: displayData.height,
      waypoints: MAP.waypoints,
      buildSpots: MAP.buildSpots,
      exclude: (MAP.scatterExclude ?? []) as Rect[],
      kinds,
      rules: cfg.rules,
      scaleJitter: cfg.scaleJitter,
      rotateDegrees: cfg.rotateDegrees,
    }, cfg.seed)

    for (const p of placements) {
      const img = this.add.image(p.x, p.y, p.key).setDepth(GROUND_DEPTH + 1)
      // The art is delivered at 2x, so it renders at half its native pixels;
      // the jitter multiplies that rather than replacing it.
      img.setScale(cfg.nativeScale * p.scale)
      img.setRotation(p.rotation)
      // Bottom-anchored, so a rock sits ON the grass rather than hovering over
      // its own centre.
      img.setOrigin(0.5, 0.9)
    }
    this.scatterCount = placements.length
  }

  /** Warm flicker over the tavern's windows and lanterns, and smoke from its
   *  chimney. Decoration only; see Ambient.ts for the lifetime rules. */
  private createAmbient(): void {
    const def = MAP.ambient as AmbientDef | undefined
    if (!def || (def.lights.length === 0 && def.chimneys.length === 0)) return
    installAmbient(this, def, PRESENTATION.ambient as AmbientStyle, GROUND_DEPTH + 2)
  }

  private createPads(): void {
    const signKey = ART.prop.buildPad
    // The quiet marker is an optional manifest hook: the key and the path were
    // agreed before the art was drawn, so until the file lands every pad falls
    // back to the sign and the board still reads.
    // The uploaded art if it has landed, otherwise the one generated at boot.
    // A hook alone was not enough: the art never arrived, every pad fell back
    // to the sign, and the board carried SEVEN full-size signs.
    const uploaded = ART.prop.buildPadQuiet
    const quietKey = uploaded && this.textures.exists(uploaded)
      ? uploaded
      : ART.generated.buildPad
    const hasQuiet = this.textures.exists(quietKey)
    const cfg = PRESENTATION.buildPad
    const n = this.build.spots.length

    // Exactly ONE sign, at the spot nearest where the enemies come in, because
    // that is where the player looks first. Seven of them was seven copies of
    // the same joke shouting over the board they are standing on.
    const entrance = this.build.spots.length > 0 ? MAP.waypoints[0]! : [0, 0]
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

    this.pads = this.build.spots.map((spot, i) => {
      const isSign = i === signIndex || !hasQuiet
      const key = isSign ? signKey : quietKey!
      const img = this.add.image(spot.x, spot.y, key).setDepth(GROUND_DEPTH + 5)
      applyRender(img, key)
      if (isSign) {
        fitContentHeight(img, key, cfg.signHeight)
      } else {
        // About a third of the sign's footprint, and varied so seven of them
        // do not read as one object stamped seven times: a few degrees of
        // rotation and about a tenth of scale, both per instance.
        fitContentHeight(img, key, cfg.quietHeight)
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
      const secs = Math.max(0, Math.ceil(this.hero.reviveIn))
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
    return WAVES.waves
  }

  get enemyDefs(): Record<string, EnemyDef> {
    return ENEMIES
  }

  private refreshMenuOptions(): void {
    this.menu.setOptions(this.status.unlockedTowers.map((id) => ({ id, def: TOWERS[id] })))
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
      this.pressTakenByUi =
        this.menu.ownsAny(over)
        || (this.ticket?.active === true && this.ticket.owns(over))
        || this.dialog?.owns(over) === true
        || this.panel?.owns(over) === true
        // The HUD is a different scene, so none of its objects are ever in
        // `over` and the checks above cannot see them. Without this a tap on
        // the ability bar also lands on the board: arming one ability and then
        // tapping a second one cast the first at the bar's own position, which
        // is how a Server Nuke could be spent without the player ever touching
        // the lane.
        || this.nukeEarned?.owns(over) === true
        || this.nukeLaunch?.owns(over) === true
        || hudTakesPress(this.layout, p.x, p.y)
    })
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.pressTakenByUi) return
      // A drag that moved the camera is a pan, not a tap. Without this the
      // release at the end of every pan would build, select or order.
      if (this.rig.consumedGesture) return
      this.onClick(p)
    })
    this.input.keyboard?.on('keydown-ESC', () => this.clearSelection())
    this.input.keyboard?.on('keydown-SPACE', () => this.startWave())
    this.input.keyboard?.on('keydown-Q', () => this.armAbility(this.status.abilities[0]))
    this.input.keyboard?.on('keydown-W', () => this.armAbility(this.status.abilities[1]))
    // The rare drop gets its own key, since it arrives after the hand is dealt.
    this.input.keyboard?.on('keydown-F', () => this.armAbility(this.status.rareAbility ?? undefined))
    this.input.keyboard?.on('keydown-E', () => this.castHaymaker())
    this.input.keyboard?.on('keydown-R', () => {
      if (this.status.phase === 'won' || this.status.phase === 'lost') this.toTitle()
      else this.armRestructure()
    })
  }

  private onClick(p: Phaser.Input.Pointer): void {
    if (p.rightButtonDown()) {
      this.clearSelection()
      return
    }
    if (this.status.phase === 'won' || this.status.phase === 'lost') return
    const w = this.worldAt(p)

    if (this.status.mode === 'targeting' && this.status.pendingAbility) {
      this.fireAbility(this.status.pendingAbility, w.x, w.y)
      return
    }

    if (this.status.mode === 'restructure') {
      this.doRestructure(w.x, w.y)
      return
    }

    // The sign sits off the lane with no pad under it, so it can take its tap
    // first without ever stealing one from a build spot.
    if (this.sign.owns(this.input.hitTestPointer(p))) {
      this.tapSign()
      return
    }

    // Precedence, most specific target first. A building pad is a deliberate
    // target: it must never lose a tap to the ground underneath it, and it
    // takes the tap even when a menu is already open, so a click on the next
    // pad moves the menu there rather than being spent dismissing it.
    const spot = this.build.spotAt(w.x, w.y)
    if (spot && this.build.isFree(spot.index)) {
      this.openBuildMenu(spot)
      return
    }

    if (this.menu.isOpen) {
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
      this.status.message =
        `${this.hero.def.name} is down — back in ${Math.max(1, Math.ceil(this.hero.reviveIn))}s.`
      return
    }
    this.clearGhost()
    this.menu.close()
    this.selected = null
    this.heroSelected = true
    // Just the foot ring. The attack-range circle that used to come up with
    // him is one of the rings the brief calls for gone: state 2 is a ring at
    // his feet and nothing else.
    this.markers.select()
    this.status.message = `${this.hero.def.name} selected — click where he should hold.`
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
      this.status.message =
        `${this.hero.def.name} breaks off — exposed while he pulls out.`
    } else {
      this.status.message = `${this.hero.def.name} is moving up.`
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

  /** Public for the harness, which measures the panel against the viewport. */
  openBuildMenu(spot: BuildSpot): void {
    this.deselectTower()
    // The pad is a world position; the menu is screen-space chrome.
    const cam = this.cameras.main
    const sx = (spot.x - cam.worldView.x) * cam.zoom
    const sy = (spot.y - cam.worldView.y) * cam.zoom
    this.menu.open(
      sx, sy, this.status.peanuts,
      (id) => this.place(id, spot),
      (id) => {
        if (id) {
          this.showTowerRange(spot.x, spot.y, TOWERS[id])
          this.showGhost(id, spot)
        } else {
          this.rangeRing.clear()
          this.clearGhost()
        }
      },
      // Not a reserved strip — the map draws through all of it. Just the part
      // of the screen where a panel does not cover a counter or the abilities.
      { top: this.layout.panelArea.y, height: this.layout.panelArea.height },
    )
    this.asScreenSpace(this.menu.objects)
    this.drawSpots()
    this.status.message = 'Pick a tower, or click away to cancel.'
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
      this.status.message = `${def.name} costs ${def.cost} peanuts — ${def.cost - this.status.peanuts} short.`
      play(this, 'broke')
      return
    }

    this.status.peanuts -= def.cost
    this.build.occupy(spot.index)
    const tower = new Tower(this, spot.x, spot.y, id, def, spot.index)
    tower.on('tierup', () => this.refreshSupport())
    this.towers.push(tower)
    this.refreshSupport()
    play(this, 'build')
    this.clearGhost()
    this.menu.close()
    this.rangeRing.clear()
    this.drawSpots()
    logEvent('tower-built', `${id} spot=${spot.index} cost=${def.cost}`)
    this.status.message = `${def.name} built.`
  }

  /** Drops the current tower selection and everything drawn for it. */
  private deselectTower(): void {
    this.panel?.close()
    this.selected = null
    this.projectedRing.clear()
    this.pathBand.clear()
  }

  private selectTower(tower: Tower): void {
    this.clearGhost()
    this.menu.close()
    this.drawSpots()
    this.selected = tower
    this.previewingUpgrade = false
    this.drawSelectedRange(tower)
    // The stretch of lane this tower actually covers. "Is it in the right
    // place?" is the other half of "should I upgrade it?", and a circle over
    // grass does not answer it on its own.
    this.drawCoveredLane(tower)
    const bonus = tower.supportBonus > 0 ? `  ·  +${Math.round(tower.supportBonus * 100)}% sheltered` : ''
    this.status.message = `${tower.def.name}, tier ${tower.tier}${bonus}`
    this.openTowerPanel(tower)
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
    this.pathBand.clear()
    if (tower.isSupport) return
    const r = tower.range
    const step = 14
    this.pathBand.fillStyle(0xf6ecd9, 0.14)
    for (let d = 0; d <= this.lane.totalLength; d += step) {
      const pt = this.lane.pointAt(d)
      if (Math.hypot(pt.x - tower.x, pt.y - tower.y) > r) continue
      this.pathBand.fillCircle(pt.x, pt.y, 15)
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
   * What a built tower is for. Tapping one used to print a sentence and do
   * nothing, which left the player with peanuts and no way to spend them.
   */
  /** Public for the harness, which measures the icons and the price badges. */
  openTowerPanel(tower: Tower): void {
    const def = tower.def
    const step = nextStep(def, tower.tier)
    const refund = sellValue(def, tower.tier + (tower.upgrading ? 1 : 0),
      RULES.towerUpgrades.sellRefund, tower.spec)
    const support = tower.isSupport

    const n = (v: number, digits = 0): string => v.toFixed(digits)
    // What the next tier would make each stat, so the panel answers "is this
    // worth it?" rather than only "what is it now?". Null at the top, and at
    // the specialization branch, where there are two answers rather than one.
    const nextTier = tower.upgrading || step === null ? null : tower.tier + 1
    const after = (key: Parameters<typeof statAt>[2]): number | null =>
      nextTier === null ? null : statAt(def, nextTier, key, tower.spec)
    /** "19.8 → 27.7" when the number moves, plain when it does not. */
    const shift = (now: number, next: number | null, digits = 0): string => {
      const a = n(now, digits)
      if (next === null || Math.abs(next - now) < 0.05) return a
      return `${a} → ${n(next, digits)}`
    }

    // Only what answers "should I upgrade this?". The panel is anchored beside
    // the tower on a phone screen 390px tall, so every row it does not need is
    // a row that would push it over the board it is supposed to be beside.
    // The tier goes in the subtitle, and the two prices go on their buttons.
    const rows: PanelRow[] = []
    if (support) {
      const nextBonus = after('supportDamageBonus')
      rows.push({
        icon: 'damage',
        label: 'Nearby damage',
        value: nextBonus === null
          ? `+${Math.round(tower.supportDamageBonus * 100)}%`
          : `+${Math.round(tower.supportDamageBonus * 100)}% → +${Math.round(nextBonus * 100)}%`,
      })
      rows.push({ icon: 'range', label: 'Radius', value: shift(tower.supportRadius, after('supportRadius')) })
    } else {
      rows.push({ icon: 'damage', label: 'Damage', value: shift(tower.damage, after('damage'), 1) })
      rows.push({ icon: 'range', label: 'Range', value: shift(tower.range, after('range')) })
      const nextInterval = after('fireInterval')
      rows.push({
        icon: 'firerate',
        label: 'Rate',
        value: nextInterval === null
          ? `${n(1 / tower.fireInterval, 2)}/s`
          : `${n(1 / tower.fireInterval, 2)}/s → ${n(1 / nextInterval, 2)}/s`,
      })
      if (tower.splashRadius > 0) {
        rows.push({ icon: 'range', label: 'Splash', value: shift(tower.splashRadius, after('splashRadius')) })
      }
      // Only when it does any. A row reading "0" tells the player nothing
      // except that there is a row.
      if (tower.armorPierce > 0 || tower.def.ignoresArmor) {
        rows.push({
          icon: 'armor',
          label: tower.def.ignoresArmor ? 'Armour' : 'Cuts armour',
          value: tower.def.ignoresArmor ? 'Ignored' : shift(tower.armorPierce, after('armorPierce')),
        })
      }
    }

    if (tower.upgrading) {
      rows.push({ label: 'Upgrading', value: `${Math.round(tower.buildProgress * 100)}%`, accent: true })
    } else if (step) {
      rows.push({ label: 'Build time', value: `${step.buildSeconds}s at reduced rate` })
    }

    const bonus = tower.supportBonus > 0
      ? `  ·  +${Math.round(tower.supportBonus * 100)}% sheltered` : ''
    const subtitle = `TIER ${tower.tier} OF ${maxTier(def)}${bonus}`

    // The upgrade button is the confirm slot; selling is its own button, so
    // neither can be hit by aiming for the other.
    const specPrice = def.specializations[0]?.cost ?? 0
    const choosing = tower.atSpecChoice && !tower.upgrading
    const affordable = choosing
      ? this.status.peanuts >= specPrice
      : step !== null && this.status.peanuts >= step.cost

    // Non-modal, and beside the tower rather than over it. There is no CLOSE
    // button: a tap anywhere off the panel closes it, which is one fewer
    // thing to aim at on a phone.
    this.panel?.close()
    this.panel = new TowerPanel(this, TICKET_DEPTH, {
      title: def.name.toUpperCase(),
      subtitle,
      rows,
      confirm: (choosing || (step !== null && !tower.upgrading))
        ? {
          // Icon only, with the price under the button. The cost still has to
          // be next to the thing it buys — a number buried in a row above is a
          // number the player goes looking for before they can decide — but it
          // does not have to be ON the plate to be next to it.
          //
          // Two different actions, two different icons: a straight tier
          // upgrade, and the branch choice that closes one path for good.
          icon: choosing ? 'target' : 'upgrade',
          price: choosing ? specPrice : (step?.cost ?? 0),
          enabled: affordable,
          onPick: () => (choosing ? this.openSpecChoice(tower) : this.upgradeTower(tower)),
        }
        : undefined,
      extra: {
        icon: 'sell',
        price: refund,
        onPick: () => this.sellTower(tower),
      },
      onPreview: (on) => {
        this.previewingUpgrade = on
        if (this.selected) this.drawSelectedRange(this.selected)
      },
      onClose: () => {
        this.panel = undefined
        this.previewingUpgrade = false
      },
    })
    this.asScreenSpace(this.panel.objects)
    this.positionPanel(tower)
  }

  /**
   * Keeps the panel beside its tower.
   *
   * Called on open and every frame after, because the world camera pans and
   * zooms underneath it — a panel anchored once would drift off its tower the
   * moment the player moved the board.
   */
  private positionPanel(tower: Tower): void {
    if (!this.panel?.active) return
    const cam = this.cameras.main
    const base = (tower.y - cam.worldView.y) * cam.zoom + cam.y
    this.panel.moveTo({
      x: (tower.x - cam.worldView.x) * cam.zoom + cam.x,
      base,
      top: base - tower.artHeight * cam.zoom,
      halfWidth: (tower.artWidth / 2) * cam.zoom,
    }, this.layout.panelArea)
  }

  /**
   * Tier 3. Two specializations, mutually exclusive and permanent for this
   * tower, so they get their own panel explaining what each one does rather
   * than two cryptic buttons crowded onto the stats panel.
   */
  private openSpecChoice(tower: Tower): void {
    const def = tower.def
    const [a, b] = def.specializations
    if (!a || !b) return
    const afford = (c: number): boolean => this.status.peanuts >= c

    // Each option is its own card: the two used to be label/value rows, and a
    // stat line long enough to reach back across its own label ran straight
    // through the other option's name.
    const card = (spec: typeof a): DialogChoice => ({
      name: spec.name,
      lines: specPoints(spec),
      cost: `${spec.cost} peanuts`,
      takes: `${spec.buildSeconds}s to build`,
      enabled: afford(spec.cost),
      onPick: () => this.specialize(tower, spec.id),
    })

    this.openDialog({
      title: `${def.name.toUpperCase()} — TIER 3`,
      subtitle: 'One or the other, for the life of this tower. There is no going back.',
      choices: [card(a), card(b)],
      cancelLabel: 'NOT YET',
      dim: 0.4,
      width: 660,
    })
  }

  /** Public so a harness run can drive the choice without the dialog. */
  specialize(tower: Tower, specId: string): void {
    const spec = tower.def.specializations.find((x) => x.id === specId)
    if (!spec || tower.upgrading || !tower.atSpecChoice) return
    if (this.status.peanuts < spec.cost) {
      play(this, 'broke')
      this.status.message =
        `${spec.name} costs ${spec.cost} peanuts — ${spec.cost - this.status.peanuts} short.`
      return
    }
    this.status.peanuts -= spec.cost
    tower.beginUpgrade(specId)
    play(this, 'upgrade')
    logEvent('tower-spec', `${tower.def.name} -> ${spec.id} cost=${spec.cost}`)
    this.status.message = `${tower.def.name} becoming ${spec.name}.`
  }

  private upgradeTower(tower: Tower): void {
    const step = nextStep(tower.def, tower.tier)
    if (!step || tower.upgrading) return
    if (this.status.peanuts < step.cost) {
      play(this, 'broke')
      this.status.message = `Tier ${tower.tier + 1} costs ${step.cost} peanuts — ${step.cost - this.status.peanuts} short.`
      return
    }
    this.status.peanuts -= step.cost
    logEvent('tower-upgraded', `${tower.def.name} tier ${tower.tier + 1} cost=${step.cost}`)
    tower.beginUpgrade()
    play(this, 'upgrade')
    this.status.message =
      `${tower.def.name} going to tier ${tower.tier + 1}. It fires slowly for ${step.buildSeconds}s.`
  }

  private sellTower(tower: Tower): void {
    // A tier that is still going up has already been paid for, so it counts
    // towards the refund. Otherwise selling mid-build quietly eats the cost of
    // the upgrade the player just bought.
    const paidTier = tower.tier + (tower.upgrading ? 1 : 0)
    const refund = sellValue(tower.def, paidTier, RULES.towerUpgrades.sellRefund, tower.spec)
    this.status.peanuts += refund
    this.build.release(tower.spot)
    this.towers = this.towers.filter((t) => t !== tower)
    tower.destroy()
    if (this.selected === tower) this.selected = null
    this.refreshSupport()
    this.refreshMenuOptions()
    this.rangeRing.clear()
    this.drawSpots()
    play(this, 'sell')
    logEvent('tower-sold', `${tower.def.name} +${refund}`)
    this.status.message = `Sold for ${refund} peanuts.`
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

  private setCancelVisible(on: boolean): void {
    this.cancelVisible = on
    for (const part of this.cancelBtn.parts) {
      (part as Phaser.GameObjects.Image).setVisible?.(on)
    }
    this.cancelBtn.hit.input!.enabled = on
  }

  private clearSelection(): void {
    this.setCancelVisible(false)
    this.clearGhost()
    this.menu.close()
    this.panel?.close()
    this.selected = null
    this.projectedRing.clear()
    this.restructuring = null
    this.heroSelected = false
    // Both markers fade the same way rather than being cut.
    this.markers.cancel()
    this.status.mode = 'normal'
    this.status.pendingAbility = null
    this.rangeRing.clear()
    this.targetRing.clear()
    this.pathBand.clear()
    this.drawSpots()
    this.status.message = this.idleHint()
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

  /**
   * Paints the stretch of lane a summon may be dropped on.
   *
   * Walked as overlapping discs along the path rather than stroked as a thick
   * line: the lane bends, and a stroked polyline leaves notches on the outside
   * of every corner exactly where the player wants to drop a blocker.
   */
  private drawPathBand(within: number): void {
    this.pathBand.clear()
    const step = within * 0.5
    // Pale blue, not green: the band is drawn over grass and a dirt lane, and
    // a green tint on green grass is invisible exactly where it matters.
    this.pathBand.fillStyle(0x8fd0ff, 0.22)
    for (let d = 0; d <= this.lane.totalLength; d += step) {
      const pt = this.lane.pointAt(d)
      this.pathBand.fillCircle(pt.x, pt.y, within)
    }
  }

  private updateHover(p: Phaser.Input.Pointer): void {
    const w = this.worldAt(p)
    if (this.status.mode === 'targeting' && this.status.pendingAbility) {
      const def = ABILITIES[this.status.pendingAbility]
      this.targetRing.clear()
      const ok = this.validCastPoint(def, w.x, w.y)
      // Green where the cast will land, red where it will be refused, so the
      // restriction is visible before the tap rather than after it.
      const tint = ok ? 0xff9d5a : 0xff5a3c
      if (def.radius > 0) {
        this.targetRing.fillStyle(tint, ok ? 0.16 : 0.1).fillCircle(w.x, w.y, def.radius)
        this.targetRing.lineStyle(2, tint, 0.9).strokeCircle(w.x, w.y, def.radius)
      }
      return
    }
    if (this.menu.isOpen) return

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

  /**
   * The one line of guidance shown when nothing more specific is happening.
   *
   * It has to describe the game as it actually is. Telling the player to build
   * a tower while they cannot afford one is worse than saying nothing: it
   * reads as the game being broken, and on the opening screen it is the first
   * thing they are told.
   */
  private idleHint(): string {
    if (this.hero.down && this.status.phase === 'ready') {
      return `${this.hero.def.name} is out for this encounter. The towers are on their own.`
    }
    const affordable = canAffordAny(
      this.status.peanuts,
      this.status.unlockedTowers.map((id) => TOWERS[id].cost),
    )
    if (this.build.freeSpots().length === 0) {
      return 'Every pad is built. Tap a tower to upgrade it, or START WAVE.'
    }
    if (this.status.phase === 'ready') {
      if (!affordable) {
        return this.towers.length === 0
          ? 'Not enough peanuts to build yet. START WAVE to earn some.'
          : 'Nothing you can afford yet. START WAVE to earn more peanuts.'
      }
      return this.towers.length === 0
        ? 'Tap a build pad to place a tower, then START WAVE.'
        : 'Build on another pad, move Cory, or START WAVE when you are ready.'
    }
    return affordable ? 'Tap a pad to build. Tap Cory to move him.' : 'Tap Cory to move him.'
  }

  // ---------------------------------------------------------------- abilities

  armAbility(id: string | undefined): void {
    if (!id || !ABILITIES[id]) return
    if (this.casting) {
      // Silent refusal is what made this unreportable: the player taps and
      // nothing at all happens, on the boss, repeatedly.
      play(this, 'error')
      this.status.message = 'The nuke is still going off. Wait for it.'
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
      this.status.message = `${ABILITIES[id].name} is still on cooldown.`
      return
    }
    if (ABILITIES[id].targeting === 'instant') {
      this.fireAbility(id, 0, 0)
      return
    }
    this.clearGhost()
    this.menu.close()
    this.status.mode = 'targeting'
    this.status.pendingAbility = id
    this.setCancelVisible(true)
    const within = ABILITIES[id].pathOnlyWithin
    if (within !== undefined) {
      this.drawPathBand(within)
      this.status.message = `${ABILITIES[id].name}: tap the highlighted path.`
    } else {
      this.status.message = `${ABILITIES[id].name}: tap where you want it.`
    }
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
    logEvent('ability-cast', `${id} at ${Math.round(x)},${Math.round(y)} enemies=${this.enemies.length}`)
    this.pathBand.clear()
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
    this.status.mode = 'normal'
    this.status.pendingAbility = null
    this.targetRing.clear()
    logEvent('ability-done', id)
    this.status.message = `${def.name}!`
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
          this.status.message = 'Scratch Ticket: not a winner. Keep your day job.'
          play(this, 'error')
          return
        }
        this.earn(amount)
        this.status.message = `Scratch Ticket: ${amount} peanuts.`
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
    logEvent('summon', `${count} gnomes at ${Math.round(x)},${Math.round(y)} for ${seconds}s`)
  }

  castHaymaker(): void {
    const hm = this.hero.def.haymaker
    if (!this.cooldowns.ready('haymaker')) {
      this.refuse(`${hm.name} is still recharging.`)
      return
    }
    if (this.hero.down) {
      this.refuse(`${this.hero.def.name} is down.`)
      return
    }
    const target = pickNearest(this.enemies, this.hero.x, this.hero.y, hm.range)
    if (!target) {
      this.refuse(`${hm.name}: nothing in reach.`)
      return
    }
    this.cooldowns.start('haymaker')

    // The biggest hit in the game, and it used to read as a slightly larger
    // spark. Four things carry an impact and it had one of them.
    //
    // 1. The pause. One held frame is what makes the eye read a collision
    //    rather than a health bar changing, and it costs nothing.
    // 2. The spark, at nearly twice the size, so it covers the target rather
    //    than sitting on it.
    // 3. The shake, longer and harder than a tower's.
    // 4. The number, which is 130 and should look like 130.
    //
    // The knockback was already in the data at 150px and already applied; what
    // it lacked was anything around it to make the throw legible.
    const s = PRESENTATION.shake
    this.damageEnemy(target, hm.damage, hm.ignoresArmor, 0, false)
    // Both sounds go on the PUNCH, here, not on the press. Every way this can
    // be refused — cooldown, hero down, nothing in reach — has already
    // returned above, so a press that does not land a punch says nothing.
    //
    // The line first and the impact second, because the duck only reaches what
    // starts AFTER a line: played the other way round the punch would sit on
    // top of the words rather than under them.
    play(this, 'haymaker-voice')
    play(this, 'haymaker')
    target.knockBack(hm.knockbackPixels)
    floatingDamage(this, target.x, target.centreY, hm.damage, true, undefined,
      EFFECT_MS.haymakerNumberScale)
    this.cameras.main.shake(s.haymakerMs, s.haymakerIntensity)
    playEffect(this, ART.fx.spark, target.x, target.centreY, {
      size: EFFECT_MS.haymakerSparkSize, depth: target.y + 8,
      durationMs: EFFECT_MS.hitSparkMs + 140,
    })
    hitPause(this, EFFECT_MS.haymakerHitPauseMs, (on) => { this.hitPaused = on })
    this.status.message = `${hm.name}!`
  }

  armRestructure(): void {
    // DAD MODE only. It was gated on nothing but its cooldown, so a hero at
    // full health on wave 1 could pick a tower up and put it somewhere else —
    // which is what made it read as a permanent board-editing mode rather
    // than as something the hero earns by nearly dying.
    if (!this.hero.lastStandActive) {
      this.refuse(`${this.hero.def.restructure.name} needs ${this.hero.def.lastStand.name}.`)
      return
    }
    if (this.hero.down) {
      this.refuse(`${this.hero.def.name} is down.`)
      return
    }
    if (!this.cooldowns.ready('restructure')) {
      this.refuse(`${this.hero.def.restructure.name} is still recharging.`)
      return
    }
    if (this.towers.length === 0) {
      this.refuse('Build a tower first, then you can move it.')
      return
    }
    this.clearGhost()
    this.menu.close()
    this.status.mode = 'restructure'
    this.restructuring = null
    this.setCancelVisible(true)
    this.drawSpots()
    this.status.message = `${this.hero.def.restructure.name}: click a tower, then a free spot.`
  }

  /** Drops a relocation in progress and leaves the board as it was. */
  private cancelRestructure(): void {
    if (this.status.mode !== 'restructure') return
    this.restructuring = null
    this.status.mode = 'normal'
    this.setCancelVisible(false)
    this.rangeRing.clear()
    this.drawSpots()
    this.status.message = `${this.hero.def.lastStand.name} is over. Restructure with it.`
  }

  private doRestructure(x: number, y: number): void {
    if (!this.restructuring) {
      const tower = this.towerAt(x, y)
      if (!tower) {
        this.status.message = 'Click one of your towers first.'
        return
      }
      this.restructuring = tower
      this.showTowerRange(tower.x, tower.y, tower)
      this.status.message = `Moving ${tower.def.name}. Click a free spot.`
      return
    }

    const spot = this.build.spotAt(x, y)
    if (!spot || !this.build.isFree(spot.index)) {
      this.status.message = 'That spot is not free.'
      return
    }

    const moving = this.restructuring
    this.build.release(moving.spot)
    this.build.occupy(spot.index)
    moving.relocate(spot.x, spot.y, spot.index)
    this.refreshSupport()
    this.cooldowns.start('restructure')
    play(this, 'upgrade')
    const cd = this.hero.def.restructure.cooldown
    // Named, not "No charge." It costs a 22-second cooldown, and a message
    // saying otherwise is why the ability read as a free UI convenience.
    this.status.message = `${moving.def.name} restructured. Back in ${cd}s.`
    this.restructuring = null
    this.status.mode = 'normal'
    // The CANCEL button was never taken down here, so after one successful
    // move it stayed on the screen for the rest of the encounter. That is what
    // made Restructure look like a permanent mode toggle rather than an
    // ability on a cooldown — the button outlived the mode it belonged to.
    this.setCancelVisible(false)
    this.drawSpots()
    this.rangeRing.clear()
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
   */
  private tickReadyCountdown(realDt: number): void {
    if (this.status.phase !== 'ready') {
      this.status.readyCountdown = 0
      return
    }
    if (this.status.readyCountdown <= 0) return
    this.status.readyCountdown = Math.max(0, this.status.readyCountdown - realDt)
    if (this.status.readyCountdown === 0) this.startWave()
  }

  /** Restarts the clock for the wave that is now pending. */
  private armReadyCountdown(): void {
    const p = RULES.pacing
    this.status.readyCountdown = this.status.wave === 0 ? p.firstReadySeconds : p.readySeconds
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
    this.spawner.begin(WAVES.waves[this.status.wave])
    logEvent('wave-start', `${this.status.wave + 1} ${WAVES.waves[this.status.wave].name} bonus=${bonus}`)
    this.status.phase = 'wave'
    play(this, 'wave-start')
    this.status.waveName = WAVES.waves[this.status.wave].name
    if (bonus > 0) {
      this.earn(bonus)
      play(this, 'peanuts')
      this.status.message = `Wave ${this.status.wave + 1}: ${this.status.waveName}  ·  +${bonus} for starting early`
    } else {
      this.status.message = `Wave ${this.status.wave + 1}: ${this.status.waveName}`
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
    if (!this.spawner.done || this.enemies.length > 0) return

    const escaped = this.escapedThisWave
    const last = this.status.wave + 1 >= WAVES.waves.length
    const { cleared, runEnds } = waveOutcome(escaped, last)
    logEvent('wave-end', `${this.status.wave + 1} cleared=${cleared} escaped=${escaped}`)

    if (cleared) {
      play(this, 'wave-cleared')
      this.earn(RULES.peanutsPerWaveCleared)
    }
    this.status.wave++
    this.grantTowerUnlocks()

    if (runEnds) {
      this.endRun(runEnds)
      return
    }
    this.status.phase = 'ready'
    this.status.waveName = WAVES.waves[this.status.wave].name
    this.armReadyCountdown()
    if (cleared) {
      this.announce('WAVE CLEARED', COLOR.good)
      this.status.message =
        `Wave cleared, +${RULES.peanutsPerWaveCleared} peanuts. Build or reposition — the next wave starts on its own.`
    } else {
      // Not a clear, and it should not sound like one.
      const n = escaped === 1 ? 'ONE GOT THROUGH' : `${escaped} GOT THROUGH`
      this.announce(n, COLOR.fire)
      this.status.message =
        `Wave survived, not cleared: ${escaped} reached the cabinet. No clear bonus.`
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
    this.status.message = won ? 'Filed on time.' : 'Overrun.'

    this.openDialog({
      title: won ? 'THE LINE HELD' : 'THE LINE BROKE',
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

  private announce(text: string, color: string): void {
    const t = this.add.text(viewW(this) / 2, viewH(this) * 0.3, text, {
      fontFamily: FONT_UI, fontSize: '40px', fontStyle: 'bold', color,
      stroke: '#0d1016', strokeThickness: 7, letterSpacing: 2,
    }).setOrigin(0.5).setDepth(OVERLAY_DEPTH + 20).setScale(0.5)
    this.asScreenSpace([t])
    this.tweens.add({ targets: t, scale: 1, duration: 240, ease: 'Back.easeOut' })
    this.tweens.add({ targets: t, alpha: 0, delay: 1500, duration: 500, onComplete: () => t.destroy() })
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

    if (this.status.phase === 'won' || this.status.phase === 'lost') return

    this.tickReadyCountdown(real)
    this.cooldowns.tick(dt)

    if (this.status.phase === 'wave') {
      for (const id of this.spawner.update(dt)) {
        const def = ENEMIES[id]
        if (!def) continue
        const enemy = new Enemy(this, def, this.lane, this.gateway)
        // The goblin's line, once per run, on the FIRST enemy to actually come
        // out of the arch. Hung off the emergence rather than the spawn so it
        // lands with the fade-in — spawning happens off the plate, behind the
        // stonework, where there is nothing to hear it about.
        //
        // The flag is set INSIDE the callback, not here. Claiming it at spawn
        // would spend the line on an enemy that has not emerged yet, and one
        // that dies short of the mouth would take the only greeting of the run
        // with it.
        if (!this.greeted) {
          enemy.onEmerge = () => {
            if (this.greeted) return
            this.greeted = true
            play(this, 'goblin-spawn')
          }
        }
        logEvent('spawn', `${id} hp=${def.maxHealth}`)
        this.enemies.push(enemy)
        if (def.tier === 'boss') this.announceBoss(enemy)
      }
    }

    this.tickTax(dt)
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
      this.positionPanel(this.selected)
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
    // Leaving DAD MODE takes the ability with it, and any half-finished move
    // with that. A player left holding a tower in a mode that no longer exists
    // has no way to put it down.
    if (this.status.lastStand && !this.hero.lastStandActive) this.cancelRestructure()
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
      this.status.peanuts = Math.max(0, this.status.peanuts - take)
      logEvent('taxed', `${e.def.name} -${take} -> ${this.status.peanuts}`)
      floatingDamage(this, e.x, e.centreY, take, true, `-${take} PEANUTS`)
      play(this, 'taxed', 0.7)
      this.cameras.main.shake(140, 0.004)
      this.status.message = `${e.def.name} taxed you ${take} peanuts. Spend it or lose it.`
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

    // The dialog plate, run the full width of the screen. Its corners scale
    // down to fit a band this shallow, so the chrome reads without the frame
    // swallowing the boss's name.
    const card = platePanel(this, 0, mid - 78, W, 156)
    card.forEach((p) => p.setDepth(TICKET_DEPTH))

    const name = this.add.text(W / 2, mid - 34, boss.def.name.toUpperCase(), {
      fontFamily: FONT_DISPLAY, fontSize: '56px', color: COLOR.fire,
      stroke: '#0d1016', strokeThickness: 9,
    }).setOrigin(0.5, 0).setDepth(TICKET_DEPTH + 1)
    const sub = this.add.text(W / 2, mid + 34, boss.def.flavor, {
      fontFamily: FONT_UI, fontSize: '17px', color: COLOR.ink, ...BODY_SPACING,
      align: 'center', wordWrap: { width: W - 80 },
    }).setOrigin(0.5, 0).setDepth(TICKET_DEPTH + 1)

    this.tweens.add({ targets: name, scale: { from: 0.7, to: 1 }, duration: 380, ease: 'Back.easeOut' })
    // The plate is many images, so the fade targets them all as one list.
    const pieces: Phaser.GameObjects.GameObject[] = [...card, name, sub]
    this.asScreenSpace(pieces)
    this.tweens.add({
      targets: pieces, alpha: 0, delay: 2200, duration: 700,
      onComplete: () => pieces.forEach((o) => o.destroy()),
    })
    this.status.message = `${boss.def.name} is here. He does not attack — he taxes. Spend your peanuts.`
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
      if (!e.alive || !e.active) continue
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
      logEvent('death', `${enemy.def.name} +${enemy.def.peanutReward}`)
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
        this.status.message = 'Launch aborted. The nuke is still yours.'
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
      this.status.message = `${name} acquired. One use.`
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
        this.status.message = `${name} acquired. One use. Tap it when you mean it.`
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
      [
        { id: 'haymaker', kind: 'haymaker', icon: hero.haymaker.icon, hero: true },
        { id: 'restructure', kind: 'restructure', icon: hero.restructure.icon, hero: true },
      ],
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
      this.status.message =
        `${this.hero.def.name} is down. Back at the entrance in ${this.hero.def.reviveSeconds}s.`
      this.cameras.main.shake(240, 0.006)
    }
  }

  private announceLastStand(): void {
    const ls = this.hero.def.lastStand
    const s = PRESENTATION.shake
    this.cameras.main.flash(340, 255, 90, 60)
    this.cameras.main.shake(s.lastStandMs, s.lastStandIntensity)
    // The line BEFORE the sting, deliberately. It runs 2.2 seconds, right
    // through the transformation and the invulnerability window, and nothing
    // cuts it — but the duck only reaches what starts after a line, so the
    // sting has to follow the words to step back for them. See the voice bus
    // in Audio.ts.
    play(this, 'dadmode-voice')
    play(this, 'last-stand', 0.85)
    // The world stops for a moment. Everything else here — flash, shake,
    // sting, banner — was already firing and it still went past unnoticed,
    // because the wave carried on walking straight through it. A held beat is
    // what turns a set of simultaneous effects into a moment.
    hitPause(this, EFFECT_MS.lastStandHoldMs, (on) => { this.hitPaused = on })
    this.announce(ls.name, COLOR.fire)
    this.status.message =
      `${ls.name}! Damage doubled, defence gone. He cannot be touched for a moment.`
  }

  /**
   * An enemy reaching the gate.
   *
   * It does not escape and it does not dissolve: the gate is closed and
   * painted shut, so it arrives at full opacity and full size and hits it. The
   * puff goes up on the same frame and the sprite comes down inside it, so
   * there is never a frame of a half-faded enemy standing at a solid gate.
   */
  private leak(enemy: Enemy): void {
    // Counted, not just charged for: an escape is what stops a wave being a
    // clear, and stops the last wave being a win.
    this.escapedThisWave++
    logEvent('escape', `${enemy.def.name} -${enemy.def.livesCost} lives`)
    this.status.lives -= enemy.def.livesCost

    // Two puffs at the foot of the gate, offset from each other so it reads
    // as a cloud thrown up by an impact rather than as one tidy ring. The
    // enemy is destroyed on the same frame, so the puff is already covering
    // the spot before there is any chance of seeing it thin away.
    const gx = enemy.x
    const gy = enemy.y + MAP.exit.puffOffsetY
    deathPuff(this, gx, gy)
    deathPuff(this, gx - 9, gy + 4)
    floatingDamage(this, enemy.x, enemy.centreY, enemy.def.livesCost, true)
    enemy.destroy()

    // A heavy hit and the life-lost sting together, so the two land as one
    // event rather than as a thump followed by a counter changing.
    play(this, 'hit-c', 1)

    const g = PRESENTATION.gateImpact
    this.gateBurst++
    const shake = gateShake(this.time.now, this.lastGateShake, this.gateBurst, g)
    if (shake.play) {
      this.lastGateShake = this.time.now
      this.gateBurst = 0
      this.cameras.main.shake(g.durationMs, shake.intensity)
    }
    // The last one gets its own sound, so the player hears the difference
    // without having to read the counter.
    play(this, this.status.lives <= 0 ? 'last-life' : 'life-lost')
    if (this.status.lives <= 0) {
      this.status.lives = 0
      this.endRun('lost')
    }
  }

  /** Recomputed whenever the tower set changes, rather than every frame. */
  private refreshSupport(): void {
    for (const t of this.towers) {
      if (t.isSupport) continue
      let bonus = 0
      let range = 0
      let pierce = 0
      for (const s of this.towers) {
        if (!s.isSupport || s === t) continue
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

  /** The un-greyed icon key for a slot, ability or hero active alike. */
  abilityIcon(id: string): string | undefined {
    if (ABILITIES[id]) return ABILITIES[id].icon
    if (id === 'haymaker') return this.hero.def.haymaker.icon
    if (id === 'restructure') return this.hero.def.restructure.icon
    return undefined
  }

  heroDef(): HeroDef {
    return this.hero.def
  }
}

// What draws on top of what, and who is allowed to receive a tap.
//
// This file exists because the same bug has now shipped three times:
//
//   1. Ability slots overlapping each other, because the icon's position and
//      the hit rectangle's position were computed separately.
//   2. The scratch card leaking drags to the camera, because the card is an
//      interactive object but the camera rig listens at the SCENE level and
//      hears every pointer event regardless of what is under it.
//   3. The ability bar drawing over the results dialog, because the dialog is
//      in GameScene and the bar is in HudScene — and a scene that renders
//      later is on top of one that renders earlier no matter what depth
//      either of them asks for.
//
// They look like three unrelated z-order slips. They are one problem: what is
// drawn and what is tapped were decided independently at each call site, so
// keeping them in step was left to whoever wrote the next overlay.
//
// The rules, in one place:
//
//   - DEPTH orders things WITHIN a scene. Bands are far apart on purpose, so
//     an overlay can offset inside its own band without reaching the next one.
//   - SCENE_ORDER orders the scenes themselves. Depth cannot cross a scene
//     boundary, which is the trap bug 3 fell into.
//   - A modal claims the whole screen: it covers everything below it, and
//     nothing below it — including another scene's HUD, and including the
//     camera rig — receives any pointer event until it closes.

/**
 * Depth bands within a single scene.
 *
 * Gaps are 50k or more. The world's own y-sorting occupies roughly 0 to 2000
 * (entities sort on their y position, and the map is 720 tall before a
 * per-entity bias), so `world` is a band rather than a line.
 */
export const LAYER = {
  /** Painted ground, and anything drawn flat onto it. */
  ground: -1_000,
  /** Y-sorted entities: towers, enemies, the hero, projectiles. */
  world: 0,
  /** Range rings, rally markers, build ghosts. Above every entity. */
  worldOverlay: 100_000,
  /** Wave banners and rare-drop announcements. Non-interactive. */
  announcement: 150_000,
  /** Anchored, NON-modal panels: the build menu, the tower panel. These
   *  deliberately leave the board live behind them. */
  panel: 200_000,
  /** A modal's full-screen blocker. Everything below this is unreachable. */
  modalDim: 900_000,
  /** A modal's own content, above its blocker. */
  modal: 950_000,
  /** The crash panel. Above everything, in every scene, always: if it is on
   *  screen then something has already gone wrong and nothing may cover it. */
  crash: 1_000_000,
} as const

export type LayerName = keyof typeof LAYER

/**
 * The order Phaser renders the scenes in, which is the order they are listed
 * in the game config. Later renders on top.
 *
 * Recorded here because it is not obvious and it is load-bearing: HudScene
 * draws after GameScene, so a HUD element sits above ANY depth GameScene can
 * ask for. That is why a modal in the world cannot simply out-depth the
 * ability bar, and why `hudInteractive` exists.
 */
export const SCENE_ORDER = [
  'Boot', 'Splash', 'Title', 'Credits', 'Loadout', 'Game', 'Hud', 'Diagnostics',
] as const

/** True when scene `a` draws underneath scene `b`. */
export function drawsUnder(a: string, b: string): boolean {
  const i = SCENE_ORDER.indexOf(a as (typeof SCENE_ORDER)[number])
  const j = SCENE_ORDER.indexOf(b as (typeof SCENE_ORDER)[number])
  return i >= 0 && j >= 0 && i < j
}

/**
 * Whether the HUD may be seen and touched.
 *
 * The whole HUD, not a chosen subset: counters, the start-wave button, the
 * ability bar, the mute and pause controls. A modal that leaves any of them
 * live is a modal the player can act around.
 *
 * The exception is a modal the HUD owns itself — the pause dialog lives in
 * HudScene so that it keeps working while GameScene is paused — which is why
 * this asks about the WORLD's modals rather than about modals in general.
 */
export function hudInteractive(worldModalOpen: boolean): boolean {
  return !worldModalOpen
}

/**
 * Whether the camera rig may act on a gesture.
 *
 * The rig listens at the scene level, so an interactive object on top of the
 * board does not stop it hearing a drag — which is exactly how scratching a
 * card panned the map underneath it. Gating the rig centrally is the fix;
 * asking each overlay to remember to swallow events is what failed.
 */
export function cameraAcceptsGestures(worldModalOpen: boolean): boolean {
  return !worldModalOpen
}

/** Every band, ascending. Used by the tests that keep them ordered. */
export function bandsAscending(): Array<[LayerName, number]> {
  return (Object.entries(LAYER) as Array<[LayerName, number]>)
    .sort((a, b) => a[1] - b[1])
}

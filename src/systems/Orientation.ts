import Phaser from 'phaser'

/**
 * The orientation gate.
 *
 * The game is landscape. It is laid out against a 1280x720 box and the world
 * camera covers the viewport from a map that is wider than it is tall, so a
 * portrait viewport gives you two bad things at once: the menus shrink to a
 * letterboxed strip about a third of their intended size, and the world camera
 * has to zoom right in to cover a tall window, leaving a narrow vertical slice
 * of the map on screen. Neither is playable.
 *
 * Nothing here rotates anything. The canvas renders at the device's actual
 * orientation, always, with no transform of any kind — a rotated canvas would
 * put every pointer coordinate in a different frame from the one the browser
 * reports them in, which breaks taps, panning and pinch in exactly the way
 * that is hard to see and impossible to work around. Instead, portrait gets an
 * overlay asking for landscape, and the game pauses behind it.
 *
 * Visibility is driven by a CSS media query rather than by JavaScript, so the
 * overlay is correct on the frame the viewport changes shape, with no listener
 * to fire late and no state to get stuck. The JavaScript only handles what CSS
 * cannot: pausing the game, and making the Scale manager re-measure.
 */

const OVERLAY_ID = 'rotate-gate'

/** True when the viewport is taller than it is wide. */
export function isPortrait(): boolean {
  return window.innerHeight > window.innerWidth
}

function styles(): string {
  return `
#${OVERLAY_ID} {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 26px;
  padding: 32px;
  box-sizing: border-box;
  text-align: center;
  background: #10161d;
  color: #f6ecd9;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}
/* The whole gate, in one rule. No listener can leave this in the wrong state. */
@media (orientation: portrait) {
  #${OVERLAY_ID} { display: flex; }
}
#${OVERLAY_ID} .rg-title {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 0.04em;
  margin: 0;
}
#${OVERLAY_ID} .rg-sub {
  font-size: 17px;
  line-height: 1.55;
  color: #a4b0bd;
  margin: 0;
  max-width: 22em;
}
#${OVERLAY_ID} svg { width: 132px; height: 132px; }
/* The phone alone turns; the arrow above it stays put. */
#${OVERLAY_ID} .rg-phone { animation: rg-turn 2.6s ease-in-out infinite; transform-origin: 60px 81px; }
@keyframes rg-turn {
  0%, 30% { transform: rotate(0deg); }
  55%, 85% { transform: rotate(-90deg); }
  100% { transform: rotate(0deg); }
}
@media (prefers-reduced-motion: reduce) {
  #${OVERLAY_ID} .rg-phone { animation: none; transform: rotate(-90deg); }
}
`
}

/**
 * The icon: a phone that turns on its side, and an arrow saying which way.
 * Inline so it needs no asset, no manifest entry and no network.
 */
function icon(): string {
  return `
<svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
  <!-- The arrow sits above the phone and does not move, so the phone turning
       underneath it reads as the instruction rather than as decoration. -->
  <path d="M28 42 A 38 38 0 0 1 92 42" fill="none" stroke="#f2d06b"
        stroke-width="4" stroke-linecap="round" />
  <path d="M92 42 l -12 -1 M92 42 l -1 -12" fill="none" stroke="#f2d06b"
        stroke-width="4" stroke-linecap="round" />
  <g class="rg-phone">
    <rect x="44" y="54" width="32" height="54" rx="7"
          fill="none" stroke="#6cc24a" stroke-width="4" />
    <line x1="53" y1="62" x2="67" y2="62" stroke="#6cc24a" stroke-width="3" stroke-linecap="round" />
    <circle cx="60" cy="100" r="2.6" fill="#6cc24a" />
  </g>
</svg>`
}

function build(): HTMLElement {
  const style = document.createElement('style')
  style.textContent = styles()
  document.head.appendChild(style)

  const el = document.createElement('div')
  el.id = OVERLAY_ID
  // Not aria-hidden: in portrait this is the only thing on the page, and a
  // screen reader should be able to say why.
  el.setAttribute('role', 'status')
  el.innerHTML = `
    ${icon()}
    <p class="rg-title">TURN YOUR DEVICE SIDEWAYS</p>
    <p class="rg-sub">Courjahan Defense is played in landscape. Your run is paused until you do.</p>
  `
  document.body.appendChild(el)
  return el
}

/**
 * Installs the gate. Returns nothing to hold: it lives for the page's life.
 */
export function installOrientationGate(game: Phaser.Game): void {
  build()

  /**
   * Which scenes *this* paused, so turning back to landscape resumes those and
   * only those. The game pauses GameScene itself while the pause dialog is up,
   * and a gate that resumed everything it found would quietly un-pause a run
   * the player had deliberately stopped.
   */
  const gatePaused = new Set<string>()

  /** Pauses everything currently running, remembering what we paused. */
  const pauseRunning = (): void => {
    // `getScenes(true)` is the running ones only, so a scene the game has
    // already paused is never picked up here and never resumed below. Once
    // they are all paused this returns nothing and the loop costs nothing.
    for (const scene of game.scene.getScenes(true)) {
      const key = scene.scene.key
      // Boot is the loader. Pausing a scene mid-preload stalls it; better the
      // art and audio keep downloading behind the overlay so the game is ready
      // the moment the phone turns.
      if (key === 'Boot') continue
      gatePaused.add(key)
      try {
        game.scene.pause(key)
      } catch {
        gatePaused.delete(key)
      }
    }
  }

  const sync = (): void => {
    const portrait = isPortrait()
    if (portrait) {
      pauseRunning()
    } else {
      for (const key of gatePaused) {
        try {
          if (game.scene.isPaused(key)) game.scene.resume(key)
        } catch {
          // The scene shut down while the phone was on its side.
        }
      }
      gatePaused.clear()
    }
    try {
      if (portrait) game.sound.pauseAll()
      else game.sound.resumeAll()
    } catch {
      // The sound system may not exist yet on the very first measurement.
    }
  }

  /**
   * Catches scenes that start while the overlay is up.
   *
   * Syncing only on resize was not enough: the boot chain runs Boot -> Splash
   * -> Title behind the overlay, and each new scene arrived running. Listening
   * for each scene's create event does not work either, because at the moment
   * the gate installs the scene manager has only *queued* the scenes from the
   * config — `game.scene.scenes` is still empty, so there is nothing to listen
   * to. Checking each frame has no such ordering assumption, and it only does
   * work while the phone is upright, which is exactly when it is needed and
   * when nothing else is going on.
   */
  game.events.on(Phaser.Core.Events.POST_STEP, () => {
    if (isPortrait()) pauseRunning()
  })

  /**
   * iOS reports the old viewport for a frame or two either side of a rotation,
   * and Phaser's RESIZE mode believes it — which is how a phone ends up with a
   * landscape-sized canvas inside a portrait window, spilling off the right
   * edge with every pointer coordinate scaled against the wrong size. Nothing
   * here is a transform; it is only re-measuring, several times, until the
   * numbers stop moving.
   */
  const settle = (): void => {
    const measure = (): void => {
      // RESIZE mode: `refresh` re-reads the parent element's bounds and sizes
      // the canvas to match. Deliberately not `resize(innerWidth, innerHeight)`
      // — the parent is 100dvh, which is not innerHeight while Safari's URL bar
      // is collapsing, and forcing it would make the canvas taller than the box
      // it sits in.
      game.scale.refresh()
      sync()
    }
    measure()
    requestAnimationFrame(measure)
    // iOS reports the old viewport for a frame or two either side of a
    // rotation, so one measurement is not enough. Re-measuring costs nothing
    // and is the difference between a clean rotate and a landscape-sized canvas
    // sitting in a portrait window with every pointer coordinate scaled wrong.
    for (const ms of [60, 180, 400]) window.setTimeout(measure, ms)
  }

  window.addEventListener('resize', settle)
  window.addEventListener('orientationchange', settle)
  // The one that actually fires on iOS when the URL bar collapses or the
  // keyboard closes, neither of which raises a plain resize event.
  window.visualViewport?.addEventListener('resize', settle)
  screen.orientation?.addEventListener?.('change', settle)

  settle()
}

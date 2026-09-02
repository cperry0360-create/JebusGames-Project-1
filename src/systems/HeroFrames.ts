// Which frame the hero is showing, and when a swing actually lands.
//
// This replaces HeroMotion, which faked movement by tweening one static
// sprite — an idle bob, a walk bounce and an attack lunge, all vertical
// oscillation on a drawn-in-place figure. There is real animation now, so the
// fake is gone: no bob, no bounce, no oscillation anywhere. A pose that is not
// walking and not swinging is the static idle, unmoved.
//
// Phaser-free, because the one thing here that can be wrong in a way the
// player feels — the swing landing on the wrong frame — is arithmetic, and
// arithmetic should be checkable without a canvas.

export type HeroPose = 'idle' | 'walk' | 'attack'

export interface FrameDef {
  /** Frames per second for the walk cycle. Separate from the attack's, because
   *  the walk's rate is set by how far the hero actually travels per step and
   *  the attack's by when the swing has to land. */
  walkFps: number
  attackFps: number
  /** 1-based. The frame on which an attack deals its damage. */
  impactFrame: number
  /** How many frames each clip holds. */
  walkFrames: number
  attackFrames: number
}

export interface FrameState {
  pose: HeroPose
  /** 0-based index into the current clip's frame list. */
  index: number
  /** True on the single tick where the swing lands. Read once and acted on. */
  impact: boolean
}

/**
 * The hero's frame clock.
 *
 * An attack owns the sprite until it finishes: it does not loop, and walking
 * does not interrupt it. That is deliberate — a swing cut off half way is a
 * hit with no follow-through, and the impact frame is the whole reason the
 * animation exists.
 */
export class HeroFrames {
  private readonly def: FrameDef
  private pose: HeroPose = 'idle'
  private elapsed = 0
  private index = 0
  /** Set once per swing, so a slow frame that crosses the impact boundary
   *  cannot fire the damage twice. */
  private impactDone = false

  constructor(def: FrameDef) {
    this.def = def
  }

  /** Starts a swing. Restarts one already running: a second swing is a second
   *  swing, not a continuation. */
  swing(): void {
    this.pose = 'attack'
    this.elapsed = 0
    this.index = 0
    this.impactDone = false
  }

  /**
   * Back to a standing idle, abandoning any swing in progress.
   *
   * The one caller is the hero going down and coming back. A swing owns the
   * sprite until it finishes and is never interrupted — which is right while
   * he is on his feet, and wrong across a death: the clip would otherwise sit
   * frozen mid-attack for the whole revive and deliver its impact frame the
   * instant he returned, firing damage he committed to before he died. This is
   * the deliberate exception, and it is a method rather than an inline poke at
   * the fields so the "never interrupted" rule stays true everywhere else.
   */
  reset(): void {
    this.pose = 'idle'
    this.elapsed = 0
    this.index = 0
    this.impactDone = false
  }

  get attacking(): boolean {
    return this.pose === 'attack'
  }

  /**
   * Advances by `dt` seconds and reports what to draw.
   *
   * `impact` is true on exactly one call per swing — the tick that reaches the
   * impact frame. The damage hangs off that rather than off the swing starting,
   * so the hit lands when the axe does.
   */
  advance(dt: number, walking: boolean): FrameState {
    const attackStep = 1 / Math.max(1, this.def.attackFps)
    const walkStep = 1 / Math.max(1, this.def.walkFps)
    let impact = false

    if (this.pose === 'attack') {
      this.elapsed += dt
      const frame = Math.floor(this.elapsed / attackStep)
      // The impact frame is 1-based in the data because that is how the files
      // are numbered; the index here is 0-based.
      if (!this.impactDone && frame >= this.def.impactFrame - 1) {
        this.impactDone = true
        impact = true
      }
      if (frame >= this.def.attackFrames) {
        // Finished. Fall through to walk or idle on this same tick rather than
        // holding the last attack frame for a frame longer than it is worth.
        this.pose = walking ? 'walk' : 'idle'
        this.elapsed = 0
        this.index = 0
      } else {
        this.index = frame
        return { pose: 'attack', index: this.index, impact }
      }
    }

    if (walking) {
      if (this.pose !== 'walk') {
        this.pose = 'walk'
        this.elapsed = 0
      }
      this.elapsed += dt
      this.index = Math.floor(this.elapsed / walkStep) % this.def.walkFrames
      return { pose: 'walk', index: this.index, impact }
    }

    // Standing still. One pose, held, with nothing moving on it.
    this.pose = 'idle'
    this.elapsed = 0
    this.index = 0
    return { pose: 'idle', index: 0, impact }
  }
}

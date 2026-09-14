// Level 10's boss, and the six rules he rewrites.
//
// VLAUDE IS NOT A NORMAL BOSS AND THIS FILE IS MOSTLY ABOUT WHY. For two thirds
// of the level he is not on the board at all: he is parked off the lane at the
// crystal core, drawn by GameScene straight from a manifest key, and NOTHING
// CAN DAMAGE HIM. That is not a flag on an Enemy that some future targeting
// change could forget to read -- there is no Enemy. He becomes one at the end
// of the scripted float, which is the same instant he touches the lane, so
// "untargetable" and "not on the board" cannot drift apart.
//
// AND BECAUSE HE CANNOT BE DAMAGED, THE PHASES CANNOT ADVANCE ON HIS HEALTH.
// Every other boss in the game is its own clock. This one's clock is the WAVE
// COUNT, which is the only thing on this level that moves in one direction
// whatever the player does. level10.json's `phases` says where the thresholds
// are and calls them a balancing recommendation, which they are.
//
// Phaser-free on purpose, like PerformanceGate.ts and LevelArt.ts beside it.
// What a phase is, when a manipulation may fire, which enemy may be copied and
// how many frames of the defeat are drawn are all arithmetic, and the tests
// drive them directly rather than reading this file as text. The DRAWING is
// GameScene's, and the split is the same one every other level mechanic uses.

import type { EnemyDef } from '../types.ts'
import type { LevelRules } from './Levels.ts'

/** Which of the three forms is on screen. */
export type VlaudePhase = 'chat' | 'code' | 'damaged'

/** The six powers that survived the design cuts. */
export type PowerId =
  | 'buildLock' | 'speedAlter' | 'duplicateEnemy'
  | 'generateWall' | 'generateWeapon' | 'createEnemies'

/** Every power, in the order level10.json introduces them. The list is here
 *  rather than derived from the schedule so that a schedule naming a power
 *  that does not exist is a failure rather than a silent no-op. */
export const POWERS: readonly PowerId[] = [
  'speedAlter', 'duplicateEnemy', 'buildLock',
  'generateWall', 'generateWeapon', 'createEnemies',
]

export interface PhaseRules {
  chatFromWave: number
  codeFromWave: number
  damagedFromWave: number
  transitionSeconds: number
}

export interface ScheduleRow {
  fromWave: number
  power: PowerId
  everySeconds: number
  /** A second power fired on the same telegraph. */
  with?: PowerId
}

export interface VlaudeRules {
  phases: PhaseRules
  berthSprites: { chat: string; code: string }
  laneEnemy: string
  displayHeight: number
  /** The berthed form's idle rise and fall, in world px and seconds per cycle.
   *  Here rather than in presentation.json because it is how BIG he is and how
   *  slowly he breathes, which is this character's and no other's. */
  bobPixels: number
  bobSeconds: number
  float: {
    holdMs: number
    travelMs: number
    invulnerable: boolean
    /** A Phaser ease name. Read rather than hardcoded so the beat can be
     *  retimed without touching the scene. */
    landingEase: string
    telegraphFx: string
    telegraphSize: number
    shakeMs: number
  }
  exitEndsRun: boolean
  defeat: {
    fx: string
    spriteFrames: number
    totalFrames: number
    frameMs: number
    size: number
    whiteFadeInMs: number
    whiteHoldMs: number
    whiteFadeOutMs: number
    shakeMs: number
  }
  telegraph: { fx: string; leadSeconds: number; size: number }
  globalCooldownSeconds: number
  schedule: ScheduleRow[]
  powers: Record<string, Record<string, unknown>>
  callbackOrder: string[]
  callbackFx: string
  /** The recall portal's picture, in the three numbers the scene needs to
   *  play it. DECORATION ONLY -- the unit is already in the wave table. */
  callbackSize: number
  callbackLeadMs: number
  callbackDurationMs: number
  /** Which indicator is shown for which state. Manifest keys, all four of
   *  them art this level already ships. */
  hud: { buildLocked: string; hasted: string; countermeasureActive: string }
  /** The full-screen card before the level, or null for a level without one.
   *  `audioCue` is a NAMED HOOK THAT IS DELIBERATELY SILENT -- see the note in
   *  level10.json and reports/2026-09-14-level-10-the-fight.md. */
  titleCard: { panel: string; holdMs: number; fadeMs: number; audioCue: string } | null
}

/**
 * Level 10's rules, or null.
 *
 * NULL IS THE COMMON CASE, exactly as it is for the gate and the flame: nine
 * levels name no `vlaude` block, `levelRules` hands back null, and every
 * caller here has nothing to do. The shape is asserted rather than trusted
 * because a rules block is hand-written JSON, and the failure this prevents is
 * a mechanic that silently never fires -- which this repository has shipped
 * three times (level 4's Beacon aura, level 8's HR armour, level 9's hat
 * repair) and noticed each time only after publishing a win rate for it.
 */
export function vlaudeRules(rules: LevelRules | null): VlaudeRules | null {
  const r = rules as {
    vlaudePhases?: Partial<PhaseRules>
    vlaude?: Record<string, unknown>
    manipulations?: Record<string, unknown>
    callbacks?: Record<string, unknown>
    hud?: Record<string, unknown>
    titleCard?: Record<string, unknown>
  } | null
  const v = r?.vlaude
  const m = r?.manipulations
  const p = r?.vlaudePhases
  if (!v || !m || !p) return null
  // IT IS `vlaudePhases` AND NOT `phases`, AND THE RENAME COST A BOARD.
  // `phases` is level 5's day/night flip, and NightRules.from used to hand
  // back a live object for ANY level carrying that key -- so level 10's wave
  // thresholds were read as a sky and the board threw on `phases.day.tint`
  // before it finished building. Nothing in tests/ constructs a scene, so
  // nothing there could see it; the harness's `levelart` scenario said "the
  // level did not build" on the first run after the level was wired up.
  // The three numbers are still asked for by name as well, because a rules
  // block is hand-written JSON.
  if (typeof p.chatFromWave !== 'number' || typeof p.codeFromWave !== 'number'
    || typeof p.damagedFromWave !== 'number') return null
  const berth = v.berthSprites as { chat?: string; code?: string } | undefined
  if (!berth?.chat || !berth.code || typeof v.laneEnemy !== 'string') return null
  const schedule = (m.schedule as ScheduleRow[] | undefined) ?? []
  if (schedule.length === 0) return null
  const cb = r?.callbacks as {
    fx?: string; order?: string[]; size?: number; leadMs?: number; durationMs?: number
  } | undefined
  const hud = r?.hud as Record<string, string> | undefined
  const tc = r?.titleCard as
    { panel?: string; holdMs?: number; fadeMs?: number; audioCue?: string } | undefined
  return {
    phases: {
      chatFromWave: p.chatFromWave,
      codeFromWave: p.codeFromWave,
      damagedFromWave: p.damagedFromWave,
      transitionSeconds: p.transitionSeconds ?? 2,
    },
    berthSprites: { chat: berth.chat, code: berth.code },
    laneEnemy: v.laneEnemy,
    displayHeight: (v.displayHeight as number) ?? 200,
    bobPixels: (v.bobPixels as number) ?? 0,
    bobSeconds: (v.bobSeconds as number) ?? 1,
    float: v.float as VlaudeRules['float'],
    exitEndsRun: v.exitEndsRun === true,
    defeat: v.defeat as VlaudeRules['defeat'],
    telegraph: m.telegraph as VlaudeRules['telegraph'],
    globalCooldownSeconds: (m.globalCooldownSeconds as number) ?? 0,
    schedule: schedule.filter((row) => POWERS.includes(row.power)),
    powers: Object.fromEntries(
      POWERS.filter((id) => m[id] && typeof m[id] === 'object')
        .map((id) => [id, m[id] as Record<string, unknown>]),
    ),
    callbackOrder: cb?.order ?? [],
    callbackFx: cb?.fx ?? '',
    callbackSize: cb?.size ?? 300,
    callbackLeadMs: cb?.leadMs ?? 0,
    callbackDurationMs: cb?.durationMs ?? 800,
    hud: {
      buildLocked: hud?.buildLocked ?? '',
      hasted: hud?.hasted ?? '',
      countermeasureActive: hud?.countermeasureActive ?? '',
    },
    // NULL RATHER THAN A HALF-BUILT CARD. A card with no panel is a black
    // screen the player has to tap through, which is worse than no card --
    // the same reason `NightRules.from` refuses a sky with no day in it.
    titleCard: tc?.panel
      ? {
        panel: tc.panel,
        holdMs: tc.holdMs ?? 0,
        fadeMs: tc.fadeMs ?? 0,
        audioCue: tc.audioCue ?? '',
      }
      : null,
  }
}

/**
 * Which form is on screen for a given wave.
 *
 * WAVES ARE 1-BASED because the HUD counts them that way and because a phase
 * that starts before wave 1 has nothing to have survived. A wave number below
 * the first threshold is still `chat`: a run has to be in some phase from the
 * first frame, and the alternative is a null the four call sites would each
 * have to handle.
 */
export function phaseForWave(rules: VlaudeRules, wave: number): VlaudePhase {
  if (wave >= rules.phases.damagedFromWave) return 'damaged'
  if (wave >= rules.phases.codeFromWave) return 'code'
  return 'chat'
}

/** True while Vlaude is parked at the core, which is while he cannot be hit. */
export function parked(phase: VlaudePhase): boolean {
  return phase !== 'damaged'
}

/**
 * Whether anything on the board may damage him.
 *
 * TWO REASONS IT CAN BE FALSE and they are different: he is parked at the core
 * (phases 1 and 2), or he is mid-float (phase 3, before he lands). The second
 * is what `floating` carries. Both answer false here, and the one thing that
 * makes it true is being ON THE LANE.
 */
export function targetable(phase: VlaudePhase, floating: boolean): boolean {
  return phase === 'damaged' && !floating
}

/** The sprite the berthed form wears, or null once he is on the lane. */
export function berthSprite(rules: VlaudeRules, phase: VlaudePhase): string | null {
  if (phase === 'chat') return rules.berthSprites.chat
  if (phase === 'code') return rules.berthSprites.code
  return null
}

/* ------------------------------------------------------------ the schedule */

/** One power armed by the schedule, with its own clock. */
export interface ArmedPower {
  power: PowerId
  with?: PowerId
  everySeconds: number
  fromWave: number
  /** Seconds until this row may fire again. */
  cooldownLeft: number
}

/** Everything the schedule has switched on by this wave, freshly clocked. */
export function armedAt(rules: VlaudeRules, wave: number): ArmedPower[] {
  return rules.schedule
    .filter((row) => wave >= row.fromWave)
    .map((row) => ({
      power: row.power,
      with: row.with,
      everySeconds: row.everySeconds,
      fromWave: row.fromWave,
      cooldownLeft: row.everySeconds,
    }))
}

/**
 * A combination may not introduce either of its halves.
 *
 * The brief's rule, and the reason it is checked rather than trusted: a row
 * that fires `buildLock` together with `speedAlter` on the wave `speedAlter`
 * first appears teaches the player two rules in one telegraph, and they cannot
 * tell which of the two did what. Two waves of daylight is the margin -- one
 * wave is one appearance, which a player can miss.
 */
export function combinationProblems(rules: VlaudeRules, margin = 2): string[] {
  const out: string[] = []
  const firstSeen = new Map<PowerId, number>()
  for (const row of rules.schedule) {
    const seen = firstSeen.get(row.power)
    if (seen === undefined || row.fromWave < seen) firstSeen.set(row.power, row.fromWave)
  }
  for (const row of rules.schedule) {
    if (!row.with) continue
    for (const half of [row.power, row.with] as PowerId[]) {
      const at = firstSeen.get(half)
      if (at === undefined) {
        out.push(`wave ${row.fromWave} combines ${half}, which the schedule never introduces`)
        continue
      }
      if (row.fromWave - at < margin) {
        out.push(`wave ${row.fromWave} combines ${half}, first seen on wave ${at}; `
          + `a combination must not introduce either of its halves`)
      }
    }
  }
  return out
}

/**
 * Advances every armed power's clock and says which of them fire now.
 *
 * THE GLOBAL COOLDOWN IS WHY THIS IS ONE FUNCTION RATHER THAN A LOOP AT THE
 * CALL SITE. Each row has its own interval, and without a floor between rows
 * a busy wave lands three telegraphs on top of one another and the player can
 * read none of them. A row that is ready but blocked by the floor KEEPS its
 * readiness -- its clock is not reset -- so the power is delayed rather than
 * skipped, which is the difference between pacing and dropping a mechanic.
 */
export function tickSchedule(
  armed: ArmedPower[], dt: number, sinceLast: number, globalCooldown: number,
): { fired: ArmedPower[]; sinceLast: number } {
  const fired: ArmedPower[] = []
  let gap = sinceLast + dt
  for (const a of armed) a.cooldownLeft -= dt
  for (const a of armed) {
    if (a.cooldownLeft > 0) continue
    if (gap < globalCooldown) continue
    fired.push(a)
    a.cooldownLeft = a.everySeconds
    gap = 0
  }
  return { fired, sinceLast: gap }
}

/* ------------------------------------------------------ the six powers */

/** What a `duplicateEnemy` cast needs to know about one enemy on the board. */
export interface Copyable {
  id: string
  /** How many times this body is itself a copy. A duplicate is 1. */
  copyDepth: number
}

/**
 * Which enemies a duplicate cast may copy.
 *
 * A DUPLICATE MUST NOT DUPLICATE, which is the one rule in this file that is
 * correctness rather than tuning: without it the board doubles every cast and
 * the level is unplayable inside three waves, and the failure is exponential
 * so it does not look like a balance problem while it is happening. The copy
 * carries `copyDepth: 1` and this refuses anything at or above the limit.
 *
 * Bosses and callbacks are excluded by id. Two Lich Kings is not a harder
 * wave, it is a different level, and two Vlaudes would be two ways to lose the
 * run at once.
 */
export function copyTargets(
  rules: VlaudeRules, field: readonly Copyable[],
): Copyable[] {
  const cfg = rules.powers.duplicateEnemy ?? {}
  const limit = (cfg.copyDepth as number) ?? 1
  const excluded = new Set((cfg.excludes as string[]) ?? [])
  return field.filter((e) => e.copyDepth < limit && !excluded.has(e.id))
}

/** How many copies one cast makes, capped by what it is allowed to copy. */
export function copyCount(rules: VlaudeRules, available: number): number {
  const cfg = rules.powers.duplicateEnemy ?? {}
  const want = (cfg.count as number) ?? 1
  const cap = (cfg.maxPerCast as number) ?? want
  return Math.max(0, Math.min(want, cap, available))
}

/** One build pad, as a lock cast needs to see it. */
export interface Lockable {
  index: number
  occupied: boolean
  locked: boolean
}

/**
 * Which pads a lock cast takes.
 *
 * EMPTY PADS FIRST, and a pad that already carries a tower is still a legal
 * target. Locking an occupied pad does nothing visible except put the padlock
 * on it -- THE TOWER SURVIVES, KEEPS FIRING AND KEEPS ITS UPGRADES -- so
 * preferring empty ones is what makes the power land as a restriction on what
 * the player may do next rather than as decoration. The lock is on BUILDING.
 * It never destroys a player's investment, and nothing in this file can.
 */
export function lockTargets(rules: VlaudeRules, pads: readonly Lockable[]): number[] {
  const cfg = rules.powers.buildLock ?? {}
  const count = (cfg.count as number) ?? 0
  const free = pads.filter((p) => !p.locked)
  const empty = free.filter((p) => !p.occupied)
  const rest = free.filter((p) => p.occupied)
  const order = (cfg.preferEmpty as boolean) === false ? free : [...empty, ...rest]
  return order.slice(0, count).map((p) => p.index)
}

/**
 * Whether a tower on a locked pad may still fire. It always may.
 *
 * A function rather than a constant because this is the rule the whole power
 * turns on and a test should be able to ask it in those words.
 */
export function lockedPadStillFires(): boolean {
  return true
}

/** Whether a pad may be built on, given its lock state. */
export function buildable(pad: Lockable): boolean {
  return !pad.locked && !pad.occupied
}

/**
 * The multiplier a haste cast puts on an enemy, and the one that takes it off.
 *
 * A MULTIPLIER SLOT THAT IS SET RATHER THAN ACCUMULATED, which is what makes
 * the restoration exact instead of nearly exact. `Enemy.hasteSpeed` sits beside
 * `reviewSpeed` and is multiplied into the same line of the speed calculation,
 * which is the Performance Review's machinery reused rather than a second
 * movement system written next to it.
 *
 * IT IS NOT `review()` ITSELF and that is deliberate. The review is PERMANENT
 * (`reviewed` is a latch that refuses a second crossing), it is ONCE ONLY, and
 * it also makes the enemy 10% bigger. A temporary, repeatable haste routed
 * through it would grow every enemy it touched by 10% for good and could never
 * be taken off. What is reused is the pattern the gate established: a named
 * multiplier slot, defaulting to 1, multiplied in at one place.
 */
export function hasteMultiplier(rules: VlaudeRules): number {
  return ((rules.powers.speedAlter ?? {}).multiplier as number) ?? 1
}

export const HASTE_OFF = 1

/** Seconds a haste lasts before the slot goes back to HASTE_OFF. */
export function hasteSeconds(rules: VlaudeRules): number {
  return ((rules.powers.speedAlter ?? {}).durationSeconds as number) ?? 0
}

/** A wall, as the level sees it while it is standing. */
export interface WallState {
  health: number
  maxHealth: number
  broken: boolean
}

/**
 * Which of the three pictures a wall wears.
 *
 * AND `blocks` GOES FALSE ON THE SAME CALL THAT PICKS THE RUBBLE. A broken
 * wall's collision has to clear on the frame the rubble is drawn, or the board
 * has an invisible wall in it -- which is the shape of bug that is only ever
 * found by a player. Returning both from one function is what stops the two
 * being updated in two places.
 */
export function wallLook(
  rules: VlaudeRules, state: WallState, rubblePick = 0,
): { art: string; blocks: boolean } {
  const cfg = rules.powers.generateWall ?? {}
  const art = (cfg.art as { intact: string; cracked: string; rubble: string[] })
    ?? { intact: '', cracked: '', rubble: [] }
  if (state.broken || state.health <= 0) {
    const pool = art.rubble ?? []
    return { art: pool[rubblePick % Math.max(1, pool.length)] ?? '', blocks: false }
  }
  const crackAt = (cfg.crackedBelowHealth as number) ?? 0
  const frac = state.maxHealth > 0 ? state.health / state.maxHealth : 1
  return { art: frac <= crackAt ? art.cracked : art.intact, blocks: true }
}

/** Whether a countermeasure may be placed on this pad. Empty pads only. */
export function weaponPad(pads: readonly Lockable[]): number | null {
  const free = pads.find((p) => !p.occupied && !p.locked)
  return free ? free.index : null
}

/* ------------------------------------------------------------- the ending */

/**
 * How many frames of the defeat sheet are drawn as a sprite.
 *
 * SEVEN OF EIGHT, AND THE EIGHTH IS NOT A FRAME THIS GAME CAN DRAW. It is a
 * hard-edged white rectangle filling its cell; over the dark core chamber that
 * reads as a rendering bug rather than as a flash, which is exactly the
 * complaint a player would file. Reaching it is the CUE for a full-screen white
 * fade drawn in screen space, and the sprite is taken off on the same frame.
 *
 * Asked as a function so a test can ask it in the brief's own words.
 */
export function defeatSpriteFrames(rules: VlaudeRules): number {
  return rules.defeat.spriteFrames
}

/** True when the animation has reached the frame that triggers the fade. */
export function defeatReachedFade(rules: VlaudeRules, frame: number): boolean {
  return frame >= rules.defeat.spriteFrames
}

/** How long the whole white wash takes, in ms. */
export function whiteWashMs(rules: VlaudeRules): number {
  return rules.defeat.whiteFadeInMs + rules.defeat.whiteHoldMs + rules.defeat.whiteFadeOutMs
}

/**
 * Whether this leak ends the run outright.
 *
 * NOT A LIFE DEDUCTION. `enemies.json vlaude.livesCost` is 19 and is never
 * charged: the check is made before lives are touched, which is what makes
 * "if Vlaude reaches the exit you lose" the level's stake rather than an
 * arithmetic coincidence about the life count.
 */
export function leakEndsRun(
  rules: VlaudeRules | null,
  def: EnemyDef | undefined,
  bossDef: EnemyDef | undefined,
): boolean {
  if (rules === null || !rules.exitEndsRun) return false
  // BY DEF IDENTITY, NOT BY NAME OR BY A NEW FIELD ON Enemy. Every def in the
  // game is the same object every time -- enemies.json is imported once and
  // `ENEMIES[id]` hands back the same reference -- so `===` is exact, costs
  // nothing, and cannot go stale the way a second copy of the id on the enemy
  // could. A name comparison would be wrong for the right reason: the four
  // callbacks deliberately share their originals' names.
  return def !== undefined && bossDef !== undefined && def === bossDef
}

/**
 * Every sheet this level registers an animation for.
 *
 * WHY THIS LIST EXISTS AT ALL: Effects.ts documents that an animation outlives
 * the texture it was cut from. `registerEffectAnims` skips a key `anims.exists`
 * already knows, so a level that frees its textures without dropping its
 * animations leaves the NEXT level reusing frames cut from a texture that is
 * gone -- the effect plays, and plays nothing. GameScene calls
 * `forgetEffectAnims` with these keys on teardown, and tests/level10.test.ts
 * asserts that the list is exactly the level's own sheets so that adding a
 * sheet and forgetting the teardown fails here rather than on level 1.
 */
export function effectSheetKeys(rules: VlaudeRules | null): string[] {
  if (!rules) return []
  const keys = new Set<string>()
  const add = (k: unknown): void => { if (typeof k === 'string' && k) keys.add(k) }
  add(rules.telegraph?.fx)
  add(rules.callbackFx)
  add(rules.defeat?.fx)
  add(rules.float?.telegraphFx)
  for (const cfg of Object.values(rules.powers)) add(cfg.fx)
  return [...keys].sort()
}

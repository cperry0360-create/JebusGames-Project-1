// What the game was doing just before it went wrong.
//
// A freeze on someone else's phone is unreportable without this. The player
// gets a black screen or a stopped board, and everything that would identify
// the fault — which wave, which ability, what had just spawned — is gone the
// moment they reload.
//
// So the game keeps a rolling log of what it did, and a crash report is that
// log plus the error plus a snapshot of state, as plain text a human can paste
// into a message.
//
// Phaser-free on purpose. The whole point is that this still works when the
// renderer is the thing that died.

/** How many events are kept. Roughly three or four waves of play. */
export const CAPACITY = 500

export interface GameEvent {
  /** Milliseconds since the log started, so entries are readable without a
   *  clock and a report from any timezone reads the same. */
  t: number
  kind: string
  detail: string
}

export interface CrashReport {
  /** What triggered the report: an exception, a rejected promise, a freeze, or
   *  the player asking for it. */
  cause: string
  /** True when this happened before the game booted. The event log is empty
   *  for those, and it is empty *correctly* — there was nothing to log yet. */
  preBoot: boolean
  message: string
  stack: string
  when: string
  /** Build id and version, so a report can be tied to a deploy. */
  build: string
  /** Whatever the game knew about itself at the moment it stopped. */
  state: Record<string, unknown>
  events: GameEvent[]
}

let buffer: GameEvent[] = []
let head = 0
let started = Date.now()
let lastError: CrashReport | null = null
let stateProvider: (() => Record<string, unknown>) | null = null
/** The last state the run reported, kept after the run has gone. A report
 *  written from the title screen is usually *about* the run that just ended,
 *  and "(empty)" answers nothing. */
let lastKnown: Record<string, unknown> = {}
/**
 * Which build this is.
 *
 * Defaults to whatever index.html stamped on the window before any script of
 * ours ran, so a crash that happens before boot can still name its build.
 * main.ts replaces it with the fuller label once the module is alive.
 */
let buildLabel = earlyBuildLabel()

function earlyBuildLabel(): string {
  const id = (globalThis as { __buildId?: string }).__buildId
  // The literal is what a dev server serves, where Vite never substitutes it.
  if (!id || id.includes('__BUILD')) return 'unknown'
  return `${id} (pre-boot)`
}

/** The ring is a fixed array written in a circle: no allocation per event and
 *  no unbounded growth during a long run. */
export function logEvent(kind: string, detail: unknown = ''): void {
  const e: GameEvent = {
    t: Date.now() - started,
    kind,
    detail: typeof detail === 'string' ? detail : safeString(detail),
  }
  if (buffer.length < CAPACITY) buffer.push(e)
  else {
    buffer[head] = e
    head = (head + 1) % CAPACITY
  }
}

/** Oldest first. */
export function recentEvents(): GameEvent[] {
  if (buffer.length < CAPACITY) return [...buffer]
  return [...buffer.slice(head), ...buffer.slice(0, head)]
}

export function resetEvents(): void {
  buffer = []
  head = 0
  started = Date.now()
  lastKnown = {}
}

/** The scene registers this so a report can include live state without
 *  Diagnostics having to know anything about the game. */
export function provideState(fn: (() => Record<string, unknown>) | null): void {
  // Snapshot on the way out, while the scene is still there to ask.
  if (!fn && stateProvider) lastKnown = { ...gather(), live: false }
  stateProvider = fn
}

export function setBuildLabel(label: string): void {
  buildLabel = label
}

export function currentState(): Record<string, unknown> {
  return stateProvider ? gather() : lastKnown
}

function gather(): Record<string, unknown> {
  try {
    return stateProvider?.() ?? {}
  } catch (err) {
    // A state provider that throws while building a crash report would hide
    // the original fault behind its own.
    return { stateProviderFailed: safeString(err) }
  }
}

export function buildReport(cause: string, message: string, stack = ''): CrashReport {
  return {
    cause,
    // An empty event log means one of two very different things, and a reader
    // has to be able to tell them apart: nothing had happened yet, or the log
    // is broken. Recording which lets the report say so.
    preBoot: cause.includes('before boot'),
    message,
    stack,
    when: new Date().toISOString(),
    build: buildLabel,
    state: currentState(),
    events: recentEvents(),
  }
}

export function recordError(cause: string, message: string, stack = ''): CrashReport {
  const report = buildReport(cause, message, stack)
  lastError = report
  logEvent('error', `${cause}: ${message}`)
  return report
}

export function lastReport(): CrashReport | null {
  return lastError
}

export function setLastReport(report: CrashReport | null): void {
  lastError = report
}

/**
 * The report as text, because the only thing a player can reliably do with a
 * bug report is paste it somewhere.
 */
export function formatReport(r: CrashReport): string {
  const lines: string[] = []
  lines.push('COURJAHAN DEFENSE — CRASH REPORT')
  lines.push(`when   ${r.when}`)
  lines.push(`build  ${r.build}`)
  lines.push(`cause  ${r.cause}`)
  lines.push(`error  ${r.message || '(none)'}`)
  if (r.preBoot) {
    lines.push('')
    lines.push('This happened BEFORE the game booted, so the state and event')
    lines.push('sections below are empty by definition — nothing had run yet.')
    lines.push('That is expected here and is not a second fault.')
  }
  if (r.stack) {
    lines.push('')
    lines.push('STACK')
    for (const line of r.stack.split('\n').slice(0, 24)) lines.push(`  ${line.trim()}`)
  }
  lines.push('')
  lines.push('STATE')
  for (const [k, v] of Object.entries(r.state)) lines.push(`  ${k} = ${safeString(v)}`)
  lines.push('')
  lines.push(`EVENTS (${r.events.length}, oldest first, ms since load)`)
  if (r.events.length === 0 && !r.preBoot) {
    lines.push('  (none — the log was empty, which is worth a second look)')
  }
  for (const e of r.events) {
    lines.push(`  ${String(e.t).padStart(7)}  ${e.kind}${e.detail ? `  ${e.detail}` : ''}`)
  }
  return lines.join('\n')
}

/** Never throws, whatever it is handed. A report builder that dies on a
 *  circular reference is worse than one that prints a placeholder. */
export function safeString(v: unknown): string {
  if (typeof v === 'string') return v
  if (v === null || v === undefined) return String(v)
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (v instanceof Error) return `${v.name}: ${v.message}`
  try {
    return JSON.stringify(v) ?? String(v)
  } catch {
    return '[unprintable]'
  }
}

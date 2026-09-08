// The panel that appears when the game breaks.
//
// PROTOTYPE-GAP item 18. The prototype put its error reporter in its own
// script block *before* the game, with the comment "so that a failure while
// the game script is being parsed or run still produces something readable
// instead of a black rectangle". We had nothing: a JS error on a phone was a
// black screen with no way to say what happened.
//
// Deliberately plain DOM. It has to work when Phaser is the thing that died,
// so it cannot be a scene, a sprite or a texture.

import {
  formatReport, logEvent, recordError, safeString, type CrashReport,
} from './Diagnostics.ts'
import { rememberReport } from './Save.ts'

const PANEL_ID = 'crash'

let installed = false
let shown = 0
/** After this many the panel stops growing: an error that fires every frame
 *  would otherwise fill the page and hide the first one, which is the one
 *  that matters. */
const MAX_SHOWN = 3

/** Set by the game so the panel can offer a way back rather than only a wall
 *  of text. Null when there is nothing sensible to reload into. */
let onReload: (() => void) | null = null

export function setReloadHandler(fn: (() => void) | null): void {
  onReload = fn
}

/**
 * Catches everything the browser will tell us about, and shows it.
 *
 * Also drains anything the tiny inline handler in index.html caught before
 * this module was even parsed — the errors most likely to leave a black
 * screen are the ones that happen before the game's own code runs.
 */
export function installErrorPanel(): void {
  if (installed) return
  installed = true
  const w = globalThis as unknown as {
    addEventListener?: (t: string, f: (e: never) => void) => void
    __earlyErrors?: Array<EarlyError>
  }

  w.addEventListener?.('error', ((e: ErrorEvent) => {
    const err = e.error as Error | undefined
    report('uncaught exception', e.message || safeString(err),
      err?.stack ?? '', where(e.filename, e.lineno, e.colno))
  }) as never)

  w.addEventListener?.('unhandledrejection', ((e: PromiseRejectionEvent) => {
    const r = e.reason as unknown
    report('unhandled rejection', describeReason(r), stackOf(r))
  }) as never)

  for (const early of w.__earlyErrors ?? []) {
    // THE KIND IS PRESERVED. This used to label every early record
    // "uncaught exception (before boot)" including the rejections, so a
    // rejected promise during boot was reported as a thrown error — which is
    // the one distinction (c) of the brief asked for, quietly undone at the
    // only point where it is hard to reproduce.
    const kind = early.kind === 'rejection' ? 'unhandled rejection' : 'uncaught exception'
    report(`${kind} (before boot)`, early.message, early.stack ?? '', early.where ?? '')
  }
  w.__earlyErrors = []
}

/** What the inline handler in index.html queues before this module exists. */
interface EarlyError {
  message: string
  stack?: string
  kind?: 'error' | 'rejection'
  where?: string
}

/**
 * WHERE THE BROWSER SAYS IT HAPPENED.
 *
 * `ErrorEvent` carries `filename`, `lineno` and `colno` and this handler threw
 * all three away, which mattered: three iPhone reports came back reading
 * "Script error." with no stack, and the reason a stack is absent is the same
 * reason these are blank — the browser is treating the script as cross-origin
 * and withholding detail. But they are withheld INDEPENDENTLY of the stack, so
 * on any build where the muting is not in play they name the file and the line
 * for free, and nothing was reading them.
 *
 * Empty when the browser withheld them, and that emptiness is itself the
 * finding: a report with a message and no location is a muted script, and a
 * report with a location is not.
 */
function where(file?: string, line?: number, col?: number): string {
  if (!file) return ''
  return `${file}:${line ?? '?'}:${col ?? '?'}`
}

/**
 * A rejection reason, which is not necessarily an Error.
 *
 * `reason` is whatever was passed to `reject()` — an Error, a string, a
 * DOMException, a Response, an object, undefined. The old code checked only
 * `instanceof Error` and dropped everything else through `safeString`, which
 * turns a DOMException into "{}" because its fields are not enumerable. iOS
 * rejects audio and canvas work with DOMExceptions, so that was the case most
 * likely to matter here and the one that read as an empty object.
 */
function describeReason(r: unknown): string {
  if (r instanceof Error) return `${r.name}: ${r.message}`
  const o = r as { name?: unknown; message?: unknown } | null | undefined
  if (o && typeof o === 'object' && typeof o.message === 'string') {
    return typeof o.name === 'string' ? `${o.name}: ${o.message}` : o.message
  }
  return safeString(r)
}

/** A stack from anything that carries one, Error or not. */
function stackOf(r: unknown): string {
  const o = r as { stack?: unknown } | null | undefined
  return o && typeof o === 'object' && typeof o.stack === 'string' ? o.stack : ''
}

/** Builds a report, remembers it across a reload, and puts it on screen. */
export function report(cause: string, message: string, stack = '', at = ''): CrashReport {
  const r = recordError(cause, message, stack, at)
  rememberReport(formatReport(r))
  show(r)
  return r
}

/**
 * A report with no panel over the game.
 *
 * For faults the game RECOVERS from. A soft lock used to produce no report at
 * all — a stopped board carries no exception, so nothing in the diagnostics
 * fired — and the tester was left describing a screenshot. It has to be
 * recorded. But it is also now recovered from automatically, and burying a
 * child's screen in red monospace to tell them about a problem that has
 * already fixed itself would be its own bug.
 *
 * So this records and remembers exactly as `report` does, and stops short of
 * the panel. The report is on the diagnostics screen and in the copied text
 * like any other.
 */
export function reportQuietly(cause: string, message: string, stack = ''): CrashReport {
  const r = recordError(cause, message, stack)
  rememberReport(formatReport(r))
  logEvent('diagnostics', `recorded quietly: ${cause}`)
  return r
}

export function show(r: CrashReport): void {
  const doc = globalThis.document
  if (!doc?.body) return
  if (shown >= MAX_SHOWN) return
  shown++

  let panel = doc.getElementById(PANEL_ID)
  if (!panel) {
    panel = doc.createElement('div')
    panel.id = PANEL_ID
    doc.body.appendChild(panel)
  }
  panel.setAttribute('style', [
    'position:fixed', 'inset:0', 'z-index:99999', 'overflow:auto',
    'background:#2b0f14', 'color:#ffd9d4', 'padding:14px',
    'font:12px/1.5 ui-monospace,Menlo,Consolas,monospace',
    'white-space:pre-wrap', 'word-break:break-word',
  ].join(';'))

  const text = formatReport(r)
  panel.textContent = ''

  const title = doc.createElement('div')
  title.textContent = 'Courjahan Defense hit a problem'
  title.setAttribute('style', 'color:#ff9a8f;font-size:15px;font-weight:bold;margin-bottom:8px')
  panel.appendChild(title)

  const row = doc.createElement('div')
  row.setAttribute('style', 'margin-bottom:10px;display:flex;gap:8px;flex-wrap:wrap')
  row.appendChild(button(doc, 'COPY REPORT', () => copyText(text)))
  if (onReload) row.appendChild(button(doc, 'RELOAD', () => onReload?.()))
  row.appendChild(button(doc, 'DISMISS', () => panel?.remove()))
  panel.appendChild(row)

  const body = doc.createElement('div')
  body.textContent = text
  panel.appendChild(body)
}

function button(doc: Document, label: string, onClick: () => void): HTMLElement {
  const b = doc.createElement('button')
  b.textContent = label
  b.setAttribute('style', [
    'background:#c1443a', 'color:#fff', 'border:0', 'border-radius:4px',
    'padding:10px 14px', 'font:bold 12px/1 ui-monospace,monospace', 'cursor:pointer',
  ].join(';'))
  b.addEventListener('click', onClick)
  return b
}

/**
 * The clipboard, with a fallback.
 *
 * `navigator.clipboard` needs a secure context and is refused outright in
 * some embedded browsers, so there is a textarea path behind it. If both
 * fail the text is at least selectable in the panel.
 */
export function copyText(text: string): void {
  const nav = globalThis.navigator as Navigator | undefined
  const doc = globalThis.document
  try {
    if (nav?.clipboard?.writeText) {
      void nav.clipboard.writeText(text).catch(() => legacyCopy(doc, text))
      logEvent('diagnostics', 'report copied')
      return
    }
  } catch {
    // Falls through to the textarea.
  }
  legacyCopy(doc, text)
}

function legacyCopy(doc: Document | undefined, text: string): void {
  if (!doc?.body) return
  try {
    const ta = doc.createElement('textarea')
    ta.value = text
    ta.setAttribute('style', 'position:fixed;left:-9999px;top:0')
    doc.body.appendChild(ta)
    ta.select()
    doc.execCommand('copy')
    ta.remove()
    logEvent('diagnostics', 'report copied (fallback)')
  } catch {
    logEvent('diagnostics', 'copy failed')
  }
}

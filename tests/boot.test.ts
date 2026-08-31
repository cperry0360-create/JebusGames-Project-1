import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/**
 * The inline script in index.html.
 *
 * It shipped broken and nothing noticed, because nothing tested the HTML. Two
 * adjacent IIFEs — `})()` then, after a comment, `(function () {` — parse as a
 * call on the first one's return value. That value is undefined, so every load
 * threw "undefined is not a function" before boot and every load showed the
 * crash panel. A panel that fires every time is not a signal; a tester learns
 * to ignore it, and then stops reporting the real ones.
 *
 * So the script is executed here, in a sandbox, exactly as a browser would.
 */

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const inline = html.slice(html.indexOf('<script>') + '<script>'.length, html.indexOf('</script>'))

function runInline(): { window: Record<string, unknown>; fetched: string[] } {
  const fetched: string[] = []
  const win: Record<string, unknown> = { addEventListener: () => {} }
  const doc = { getElementById: () => null }
  const store = { getItem: () => null, setItem: () => {} }
  const fetchStub = (url: string): Promise<unknown> => {
    fetched.push(url)
    return Promise.resolve({ ok: false, json: () => Promise.resolve(null) })
  }
  // Same shape a browser gives it: the globals it names, and nothing else.
  const fn = new Function(
    'window', 'document', 'sessionStorage', 'fetch', 'location', 'setTimeout', inline,
  )
  fn(win, doc, store, fetchStub, { reload: () => {} }, () => 0)
  return { window: win, fetched }
}

test('the inline boot script runs without throwing', () => {
  // This is the whole test. It threw on every single load for as long as the
  // two IIFEs sat next to each other without a semicolon between them.
  assert.doesNotThrow(runInline,
    'index.html throws before the game can boot — check for a missing semicolon after an IIFE')
})

test('the boot script installs the early error queue and the build stamp', () => {
  const { window: win } = runInline()
  assert.deepEqual(win.__earlyErrors, [],
    'nothing catches the errors that happen before the module loads')
  // A crash before boot never reaches main.ts, so the build has to be recorded
  // here or the report cannot say which build it came from.
  assert.equal(typeof win.__buildId, 'string', 'the build id is not stamped on the window')
  assert.ok((win.__buildId as string).length > 0)
})

test('no statement in the boot script relies on automatic semicolon insertion', () => {
  // A line starting with any of these continues the previous expression when
  // the previous line has no terminator. That is exactly how the two IIFEs
  // became one call.
  const risky = new Set(['(', '[', '`', '+', '-', '/'])
  const lines = inline.split('\n')
  const offenders: string[] = []
  let prev = ''
  for (const [i, line] of lines.entries()) {
    const t = line.trim()
    if (!t || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue
    const cont = /[;{(,.]$|&&$|\|\|$|=$/.test(prev.trim())
    if (risky.has(t[0]) && prev && !cont) {
      offenders.push(`line ${i + 1}: "${t.slice(0, 48)}" continues "${prev.trim().slice(0, 40)}"`)
    }
    prev = line
  }
  assert.deepEqual(offenders, [],
    'these lines join onto the previous statement instead of starting a new one')
})

test('every IIFE in the boot script is terminated', () => {
  // Statement-level only: a `(function () {` that begins a line is an IIFE,
  // while `setTimeout(function () {` is a callback and ends differently.
  const opened = inline.split('\n')
    .filter((l) => /^;?\(function \(\) \{$/.test(l.trim())).length
  const closed = (inline.match(/\}\)\(\);/g) ?? []).length
  assert.ok(opened > 0, 'no IIFEs found, so this test is checking nothing')
  assert.equal(closed, opened,
    `${opened} IIFEs but only ${closed} end in "})();" — an unterminated one swallows what follows`)
})

/**
 * The harness's scenario registry, kept honest.
 *
 * `tools/harness/run.sh poor` exited 0 for months. There is no `poor` block in
 * index.html and has not been for some time: the director fell off the end of
 * the dispatch chain and posted a clean report about nothing. A typo did the
 * same. index.html now carries a KNOWN_SCENARIOS list and server.py exits 6
 * for a name that is not in it -- and that list is a hand-written copy of
 * something the source already knows, which is exactly the kind of copy that
 * rots. This is what stops it.
 *
 * Source-as-text, and it has to be: index.html is a browser document that
 * imports Phaser, so nothing here can execute it. See CLAUDE.md on why the
 * test suite cannot see the engine.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../tools/harness/index.html', import.meta.url), 'utf8')

/** Every name the director actually dispatches on. */
function dispatched(): Set<string> {
  return new Set([...src.matchAll(/scenario === '([A-Za-z0-9_-]+)'/g)].map((m) => m[1]!))
}

/** A declared list, read back out of the source. */
function declared(name: string): Set<string> {
  const m = src.match(new RegExp(`const ${name} = (?:new Set\\()?\\[([^\\]]*)\\]`))
  assert.ok(m, `${name} is not in tools/harness/index.html`)
  return new Set([...m[1]!.matchAll(/'([A-Za-z0-9_-]+)'/g)].map((x) => x[1]!))
}

test('SCENARIO_NAMES lists exactly what the director dispatches', () => {
  const real = dispatched()
  const listed = declared('SCENARIO_NAMES')
  const missing = [...real].filter((s) => !listed.has(s)).sort()
  const stale = [...listed].filter((s) => !real.has(s)).sort()
  assert.deepEqual(missing, [],
    'these scenarios are dispatched but not in SCENARIO_NAMES, so run.sh would reject them')
  assert.deepEqual(stale, [],
    'these are in SCENARIO_NAMES but nothing dispatches them, which is the `poor` bug again')
})

test('every scenario that asserts nothing is declared, and really does assert nothing', () => {
  // The list is a promise that running these fails on purpose. If one of them
  // grows a real check the list has to shrink, or a repaired scenario keeps
  // reporting itself broken.
  const admitted = declared('ASSERTS_NOTHING')
  const blocks = [...src.matchAll(/^ {2}if \(scenario === '([A-Za-z0-9_-]+)'\)/gm)]
  for (let i = 0; i < blocks.length; i++) {
    const name = blocks[i]![1]!
    if (!admitted.has(name)) continue
    const start = blocks[i]!.index!
    const end = i + 1 < blocks.length ? blocks[i + 1]!.index! : src.length
    const body = src.slice(start, end)
    assert.ok(!/'\*\*\* /.test(body) && !/\bexpect\(/.test(body),
      `${name} is on ASSERTS_NOTHING but has a way to report a fault — take it off the list`)
  }
})

test('a scenario held to the assertion counter actually calls expect()', () => {
  const uses = declared('USES_EXPECT')
  const blocks = [...src.matchAll(/^ {2}if \(scenario === '([A-Za-z0-9_-]+)'\)/gm)]
  const seen = new Set<string>()
  for (let i = 0; i < blocks.length; i++) {
    const name = blocks[i]![1]!
    if (!uses.has(name)) continue
    const start = blocks[i]!.index!
    const end = i + 1 < blocks.length ? blocks[i + 1]!.index! : src.length
    assert.match(src.slice(start, end), /\bexpect\(/,
      `${name} is on USES_EXPECT but calls expect() nowhere, so server.py would fail every run`)
    seen.add(name)
  }
  assert.deepEqual([...uses].filter((n) => !seen.has(n)), [],
    'USES_EXPECT names a scenario that is not dispatched at all')
})

test('the two lists do not overlap', () => {
  const nothing = declared('ASSERTS_NOTHING')
  const uses = declared('USES_EXPECT')
  const both = [...uses].filter((n) => nothing.has(n))
  assert.deepEqual(both, [],
    'a scenario cannot both assert nothing and be held to an assertion count')
})

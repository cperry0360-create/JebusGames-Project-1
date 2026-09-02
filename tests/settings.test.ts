import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { hudLayout, NO_INSETS, overlaps, type Insets } from '../src/systems/HudLayout.ts'
import presentation from '../src/data/presentation.json' with { type: 'json' }

const url = (p: string) => new URL(p, import.meta.url)
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')
const CFG = presentation.settings
const LAYOUT = presentation.hud.layout

const VIEWPORTS: Array<[string, number, number]> = [
  ['iPhone SE', 568, 320],
  ['iPhone 14', 844, 390],
  ['desktop', 1280, 720],
]
const NOTCH: Insets = { top: 0, right: 44, bottom: 21, left: 44 }

test('one gear replaced four controls', () => {
  const hud = src('scenes/HudScene.ts')
  // A mute toggle, a minus, a plus and a percentage readout in one corner and
  // a pause button in the other — chrome on the board for a whole run, for
  // settings a player opens once and leaves alone.
  assert.doesNotMatch(hud, /AudioToggle/, 'the inline volume control is back on the HUD')
  assert.doesNotMatch(hud, /buildPauseButton/, 'the pause button is back')
  assert.match(hud, /private buildSettingsButton\(/, 'there is no settings gear')
  assert.match(hud, /hit\.name = 'hud:settings'/, 'the gear cannot be found by a test')
  assert.match(hud, /hit\.on\('pointerdown', \(\) => this\.openSettings\(\)\)/,
    'the gear does not open the settings')
  // And it pauses. The panel is owned by the HUD for exactly this reason: a
  // panel drawn by a paused scene cannot be tweened, pressed or closed.
  const open = hud.slice(hud.indexOf('openSettings(): void {'), hud.indexOf('private closeSettings('))
  assert.match(open, /this\.scene\.pause\('Game'\)/, 'the settings do not pause the game')
  assert.match(open, /new SettingsPanel\(this,/, 'the panel is not owned by the HUD scene')
})

test('the panel is three sliders and three buttons, in that order, and nothing else', () => {
  const panel = src('ui/SettingsPanel.ts')
  const channels = [...panel.matchAll(/\['(MUSIC|SOUND EFFECTS|VOICE)', '(music|sfx|voice)'\]/g)]
  assert.deepEqual(channels.map((m) => m[1]), ['MUSIC', 'SOUND EFFECTS', 'VOICE'],
    'the sliders are not MUSIC, SOUND EFFECTS, VOICE in that order')
  assert.deepEqual(channels.map((m) => m[2]), ['music', 'sfx', 'voice'],
    'a slider is wired to the wrong channel')

  const buttons = [...panel.matchAll(/\['(HOME|RESTART|CONTINUE)', actions\.on(\w+)/g)]
  assert.deepEqual(buttons.map((m) => m[1]), ['HOME', 'RESTART', 'CONTINUE'],
    'the buttons are not HOME, RESTART, CONTINUE along the bottom')

  // KEEP IT SIMPLE. No difficulty, no accessibility toggles, no hints, no
  // now-playing display — asserted, because every one of those is a thing a
  // settings panel grows on its own.
  //
  // Comments are stripped first. The file's own header says what it does not
  // have, and a naive substring scan reads that as the thing being there.
  const code = panel
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
  for (const banned of ['difficulty', 'Difficulty', 'accessibility', 'colourblind',
    'colorblind', 'nowPlaying', 'Now Playing']) {
    assert.ok(!code.includes(banned), `the settings panel grew a "${banned}" control`)
  }
})

test('every slider writes through to the save on the drag, not on the close', () => {
  const panel = src('ui/SettingsPanel.ts')
  assert.match(panel, /setVolume\(v, channel\)/, 'moving a slider does not set the volume')
  // A player who drags the music down and then closes the tab has set the
  // music down. Every path that changes the mix writes the save on the spot —
  // through one function, so a new path cannot forget to.
  const audio = src('systems/Audio.ts')
  assert.match(audio, /export function setVolume\([\s\S]{0,200}?persistMix\(\)/,
    'setVolume no longer persists')
  assert.match(audio, /export function nudgeAllVolumes\([\s\S]{0,400}?persistMix\(\)/,
    'the title screen stepper no longer persists')
  assert.match(audio, /function persistMix\(\): void \{[\s\S]{0,300}?writeSave\(/,
    'persistMix does not write the save')

  // And the title screen's single control moves ALL THREE channels. It called
  // setVolume with no channel, whose default is sfx, so it left the music and
  // the recorded lines alone — over a title screen that is playing music.
  const toggle = src('ui/AudioToggle.ts')
  assert.match(toggle, /nudgeAllVolumes\(delta\)/, 'the title stepper moves one channel again')
  assert.doesNotMatch(toggle, /setVolume\(/, 'the title stepper is back on setVolume')
  assert.match(audio, /export function nudgeAllVolumes[\s\S]{0,300}?\['sfx', 'music', 'voice'\]/,
    'nudgeAllVolumes does not cover all three channels')
  // And music needs telling: its level is on a gain node, not on a cue.
  assert.match(panel, /if \(channel === 'music'\) refreshMusicVolume\(\)/,
    'the music slider does not reach the music')
  // The starting position is the saved value, not a constant.
  assert.match(panel, /getVolume\(channel\)/, 'the sliders do not open where the player left them')
})

test('the whole row takes the drag, not the handle', () => {
  // A 22px circle is under half what a thumb can reliably land on, and chasing
  // one along a track is the fiddliness that made stepped +/- buttons look
  // like a good idea in the first place.
  const slider = src('ui/Slider.ts')
  assert.match(slider, /\.rectangle\(x \+ width \/ 2, this\.midY, width, CFG\.rowHeight/,
    'the hit area is not the whole row')
  assert.match(slider, /setInteractive\(\{ useHandCursor: true, draggable: true \}\)/,
    'the row cannot be dragged')
  for (const evt of ['pointerdown', 'drag', 'dragend']) {
    assert.match(slider, new RegExp(`this\\.hit\\.on\\('${evt}'`), `the row ignores ${evt}`)
  }
  assert.ok(CFG.handleRadius * 2 < CFG.rowHeight,
    'the handle is taller than its row, so the rows would overlap')
})

test('the panel fits every viewport, with room around it', () => {
  // Clamped both ways. At 568x320 neither the design width nor the natural
  // height fits, so the panel is what the screen allows.
  const margin = 12
  for (const [name, vw, vh] of VIEWPORTS) {
    const W = Math.max(CFG.minWidth, Math.min(CFG.width, vw - margin * 2))
    const rows = 3
    const bodyH = CFG.titleSize + 14 + rows * CFG.rowHeight + 10 + CFG.buttonHeight
    const H = Math.min(vh - margin * 2, bodyH + CFG.pad * 2)
    assert.ok(W <= vw - margin * 2 + 0.5, `${name}: the panel is wider than the screen`)
    assert.ok(H <= vh - margin * 2 + 0.5, `${name}: the panel is taller than the screen`)
    // The three buttons, side by side, must each stay wide enough to read.
    const bw = (W - CFG.pad * 2 - CFG.buttonGap * 2) / 3
    assert.ok(bw >= 70, `${name}: a ${bw.toFixed(0)}px button cannot hold "CONTINUE"`)
    // And a slider row must leave a real track after its label and percentage.
    const innerW = W - CFG.pad * 2
    const trackW = innerW - (CFG.iconSize + 8 + CFG.labelColumn) - CFG.valueWidth - 8
    assert.ok(trackW >= 40, `${name}: a ${trackW.toFixed(0)}px track is not draggable`)
  }
})

test('the gear is reachable and does not sit on anything else', () => {
  for (const [name, vw, vh] of VIEWPORTS) {
    for (const [what, insets] of [['flat', NO_INSETS], ['notched', NOTCH]] as const) {
      const L = hudLayout(
        { width: vw, height: vh, insets, countersWidth: 350, abilitiesWidth: 370 }, LAYOUT)
      const g = L.settings
      assert.ok(g.x >= insets.left && g.x + g.width <= vw - insets.right,
        `${name} ${what}: the gear is outside the safe area horizontally`)
      assert.ok(g.y >= insets.top && g.y + g.height <= vh - insets.bottom,
        `${name} ${what}: the gear is outside the safe area vertically`)
      // 40px is the floor for a thumb on the smallest screen the game claims.
      assert.ok(g.width >= 40 && g.height >= 40,
        `${name} ${what}: a ${g.width}x${g.height} gear is too small to press`)
      for (const [other, r] of [
        ['abilities', L.abilities], ['start button', L.startButton],
        ['counters', L.counters], ['hero row', L.heroRow], ['message row', L.messageRow],
      ] as const) {
        assert.ok(!overlaps(g, r), `${name} ${what}: the gear sits on the ${other}`)
      }
    }
  }
})

test('every control in the panel is inside the panel layer', () => {
  /*
   * THE MODAL BLOCKER SITS AT `depth - 1` AND THE LAYER AT `depth`.
   *
   * A control left out of the layer keeps the default depth of 0, which is
   * under the blocker, so the blocker swallows every press on it. The drawer
   * flag row shipped that way for one run: drawn, listed in `hits`, measured
   * as on screen and reachable, and completely dead — the one control that
   * turns the new control scheme on was the one control that did nothing.
   *
   * Being in `hits` is what the probe enumerates, so `hits` is exactly the
   * list that must not be trusted on its own.
   */
  const src = readFileSync(new URL('../src/ui/SettingsPanel.ts', import.meta.url), 'utf8')
  const pushed = [...src.matchAll(/this\.hits\.push\(([\w.]+)\)/g)].map((m) => m[1] as string)
  assert.ok(pushed.length >= 3, `only found ${pushed.length} controls`)
  for (const name of pushed) {
    // Either the object itself goes into the layer, or it is the `hit` of a
    // group whose `parts` do.
    const group = /^(\w+)\.hit$/.exec(name)
    const wanted = group ? `this.layer.add(${group[1]}.parts)` : `this.layer.add(${name})`
    assert.ok(src.includes(wanted),
      `${name} is pushed into hits but never added to the layer (looked for ${wanted})`)
  }
})

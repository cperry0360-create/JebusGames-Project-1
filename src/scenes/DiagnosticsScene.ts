import Phaser from 'phaser'
import { BODY_SPACING, COLOR, FONT_UI } from '../ui/Theme.ts'
import { plateButton } from '../ui/Plate.ts'
import {
  buildReport, currentState, formatReport, lastReport, recentEvents, safeString,
} from '../systems/Diagnostics.ts'
import { copyText } from '../systems/ErrorPanel.ts'
import { clearStoredReport, storedReport } from '../systems/Save.ts'
import { VERSION_LABEL } from '../systems/Build.ts'
import { fitUiCamera, viewH, viewW } from '../systems/Resolution.ts'

/**
 * The hidden diagnostics screen.
 *
 * Reached by tapping the version stamp on the title five times, because it is
 * for one person and should not be a button a player finds. It shows what the
 * game has been doing, the last thing that went wrong, and a way to get all of
 * it onto the clipboard — which is the only thing a player can reliably do
 * with a bug report.
 *
 * Deliberately *not* fitted to the design box like the other menus. A dump
 * wants real pixels: fitting 1280x720 into a phone would scale every line down
 * to about half size, and the honest way to make a dense screen legible is to
 * use the pixels the device actually has rather than to exempt it from the
 * type floor.
 *
 * A Phaser scene rather than DOM, unlike the crash panel: this one is reached
 * from a working game, so the renderer is known to be alive. The crash panel
 * cannot assume that.
 */
export class DiagnosticsScene extends Phaser.Scene {
  constructor() {
    super('Diagnostics')
  }

  create(): void {
    const W = viewW(this)
    const H = viewH(this)
    // Viewport in physical pixels because it is the canvas; everything drawn
    // below is in CSS pixels, which fitUiCamera makes the coordinate space.
    this.cameras.main.setViewport(0, 0, this.scale.width, this.scale.height)
    fitUiCamera(this)
    this.add.rectangle(0, 0, W, H, 0x10161d).setOrigin(0, 0)

    this.add.text(16, 10, 'DIAGNOSTICS', {
      fontFamily: FONT_UI, fontSize: '22px', color: COLOR.amber,
      fontStyle: 'bold', letterSpacing: 2,
    })
    this.add.text(W - 16, 14, VERSION_LABEL, {
      fontFamily: FONT_UI, fontSize: '15px', color: COLOR.dim,
    }).setOrigin(1, 0)

    const stored = storedReport()
    const err = lastReport()
    const headline = err
      ? `${err.cause}: ${err.message}`
      : stored
        ? 'A report from an earlier session is stored. COPY REPORT gets it.'
        : 'Nothing has gone wrong this session.'
    this.add.text(16, 40, headline, {
      fontFamily: FONT_UI, fontSize: '15px',
      color: err || stored ? COLOR.danger : COLOR.good,
      wordWrap: { width: W - 32 }, maxLines: 2, ...BODY_SPACING,
    })

    // State on the left, the tail of the event log on the right. The log says
    // what happened, so it gets the wider half.
    const top = 84
    const bottom = H - 76
    const rows = Math.max(3, Math.floor((bottom - top - 22) / 19))
    const all = recentEvents()

    // State from the top — scene, phase, wave and lives are the first four
    // keys and the four that answer "what was going on". Events from the
    // bottom: the last thing that happened is the one that matters.
    this.column(16, top, W * 0.34 - 24, 'STATE',
      Object.entries(currentState()).map(([k, v]) => `${k}: ${safeString(v)}`), rows, false)
    this.column(W * 0.34, top, W * 0.66 - 16, `EVENTS  ${all.length} kept`,
      all.map((e) => `${String(e.t).padStart(6)} ${e.kind} ${e.detail}`), rows, true)

    // Laid out from the width rather than pinned to fixed pixels: at 568 the
    // fixed positions put BACK on top of CLEAR.
    const y = H - 34
    const gap = 12
    const bw = Math.min(220, (W - 32 - gap * 2) / 3)
    const total = bw * 3 + gap * 2
    const buttons: Array<[string, () => void, 'primary' | 'secondary']> = [
      ['COPY REPORT', () => this.copy(), 'primary'],
      ['CLEAR', () => this.clear(), 'secondary'],
      ['BACK', () => this.scene.start('Title'), 'secondary'],
    ]
    buttons.forEach(([text, fn, weight], i) => {
      plateButton(this, W / 2 - total / 2 + bw / 2 + i * (bw + gap), y, bw, 48, text, fn, 15, weight)
    })
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('Title'))
  }

  /** A titled list, clipped to the rows that fit rather than run off. `tail`
   *  keeps the end of the list; otherwise the start. */
  private column(x: number, y: number, width: number, title: string, lines: string[],
    max: number, tail: boolean): void {
    this.add.text(x, y, title, {
      fontFamily: FONT_UI, fontSize: '15px', color: COLOR.amber,
      fontStyle: 'bold', letterSpacing: 1,
    })
    const shown = tail ? lines.slice(-max) : lines.slice(0, max)
    // The marker replaces the far end of what is shown, never the near end:
    // on the log that means the top, because the newest line is the point.
    if (lines.length > max) {
      shown[tail ? 0 : shown.length - 1] = `… ${lines.length - max} more`
    }
    this.add.text(x, y + 22, shown.join('\n') || '(empty)', {
      fontFamily: FONT_UI, fontSize: '15px', color: COLOR.ink,
      wordWrap: { width }, maxLines: max, lineSpacing: 4,
    })
  }

  /**
   * Everything, as text.
   *
   * Prefers the stored report when there is one and nothing has gone wrong
   * since: that is the crash that actually happened and it survived the
   * reload. Otherwise it reports the here and now, which is what a "the game
   * is behaving oddly" report needs.
   */
  private copy(): void {
    const stored = storedReport()
    const live = lastReport()
    const text = live
      ? formatReport(live)
      : stored || formatReport(buildReport('requested by player', '', ''))
    copyText(text)
    this.flash('COPIED TO CLIPBOARD')
  }

  private clear(): void {
    clearStoredReport()
    this.flash('STORED REPORT CLEARED')
  }

  private flash(text: string): void {
    const t = this.add.text(viewW(this) / 2, viewH(this) - 68, text, {
      fontFamily: FONT_UI, fontSize: '16px', color: COLOR.good, fontStyle: 'bold',
    }).setOrigin(0.5)
    this.tweens.add({
      targets: t, alpha: 0, delay: 1000, duration: 500, onComplete: () => t.destroy(),
    })
  }
}

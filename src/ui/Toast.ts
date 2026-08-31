// A small notice that does not belong to any scene.
//
// Plain DOM, like the crash panel and for the same reason: the things worth
// saying this way happen when a scene is paused, mid-transition, or has just
// been told the browser took its audio device away. A Phaser text object drawn
// by a paused scene does not fade and does not disappear.
//
// Deliberately not a dialog. It says one thing, it does not stop the game, and
// it goes away on its own.

const ID = 'toast'
const SHOW_MS = 5200

let timer: ReturnType<typeof setTimeout> | null = null

export function toast(text: string): void {
  const doc = globalThis.document
  if (!doc?.body) return

  let el = doc.getElementById(ID)
  if (!el) {
    el = doc.createElement('div')
    el.id = ID
    doc.body.appendChild(el)
  }
  el.textContent = text
  // Bottom centre, clear of the safe-area inset so it is not under a home bar.
  // `pointer-events: none` matters: this floats over the board, and a notice
  // that swallows a tap on the ability bar is worse than no notice.
  el.setAttribute('style', [
    'position:fixed',
    'left:50%',
    'bottom:calc(env(safe-area-inset-bottom, 0px) + 84px)',
    'transform:translateX(-50%)',
    'z-index:9998',
    'max-width:min(30em, calc(100vw - 32px))',
    'box-sizing:border-box',
    'padding:10px 16px',
    'border-radius:8px',
    'background:rgba(23,28,36,0.94)',
    'border:1px solid #3d4a59',
    'color:#f6ecd9',
    'font:15px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    'text-align:center',
    'pointer-events:none',
    'opacity:1',
    'transition:opacity 400ms ease',
  ].join(';'))

  if (timer !== null) clearTimeout(timer)
  timer = setTimeout(() => {
    el?.style.setProperty('opacity', '0')
    timer = setTimeout(() => el?.remove(), 450)
  }, SHOW_MS)
}

# Status: the flagstone path, the build stamp, and the tower menu

**2026-09-01 · against `1a641b1` on `main`**

Report only. **No gameplay or layout behaviour was changed for this.** The one
thing committed alongside it is a read-only harness scenario (`menustate`) that
measures the menus against the viewport.

The short version:

- The flagstone art is **already in the repo, at the right path, in every
  deployed commit**. You do not need to upload anything.
- The live build stamp should read **`79e7ada`** (now `1a641b1`); every deploy
  since `850041e` is green.
- **Tower selection really is broken**, and it is not the art. It is the old
  `BuildMenu` running off the bottom of the screen. On 3 of 7 pads at
  844×390 — 4 of 7 at 568×320 — the buy buttons are partly or entirely below
  the display and cannot be pressed.
- **The radial ring specification was received in full. It has not been
  started.** No file, no branch, no partial work. That is a scheduling miss on
  my side, not a misunderstanding.

---

## 1. The flagstone texture

```
key             prop-pad-flagstone
file on disk    public/assets/props/pad_flagstone.png
URL at runtime  assets/props/pad_flagstone.png?v=<build stamp>
manifest entry  src/data/art.json  ->  files["prop-pad-flagstone"]
required?       yes (deliberately not on the `optional` list)
```

### The file is already there

It arrived in your upload `a54a796`, is **178,409 bytes**, and `git ls-tree`
finds it present in every commit that has been deployed since the key existed:

| commit | `public/assets/props/pad_flagstone.png` |
|---|---|
| `f590aad` (first build to reference the key) | present |
| `d747248` | present |
| `bf10b16` | present |
| `79e7ada` | present |

The harness loads it from the same tree: `loaded=true`, and the board renders
**6 flagstones + 1 sign**, which is correct.

### So why the banner?

Most likely a **cached 404**. `f590aad` was the first build to request that
URL. If the page loaded during the window between the deploy completing and
Pages propagating the new asset, the browser caches the 404 against
`?v=f590aad` and reuses it on the next visit with the same stamp. Three
deploys have changed the stamp since, so a hard reload should clear it.

**I cannot confirm this against the live site.** This environment's egress
proxy blocks `github.io` — `connect_rejected` on both the page and the asset —
so everything above is from the repository and the harness, not from
production. If a hard reload does not clear it, that is a real signal and I
need to hear about it, because it would mean something I currently cannot see.

---

## 2. Build stamp

`BUILD_ID` is `git rev-parse --short HEAD`, baked in by Vite and shown at the
bottom-right of the title screen next to the version (`VERSION_LABEL`).

| | |
|---|---|
| `main` at time of writing | `1a641b1` (was `79e7ada` when observed) |
| deploy for `79e7ada` | **success**, completed 23:51:01Z |
| deploys since `850041e` | all green, none skipped |

---

## 3. Tower selection

"Tower selection" is two separate components, and only one of them is in
trouble.

### `BuildMenu` — build on an empty pad — BROKEN

Fixed 240×180 panel, anchored to the tapped pad, with no viewport clamping.
Measured hit areas against the viewport, every free spot:

| | 844×390 | 568×320 |
|---|---|---|
| pads with both buy buttons fully on screen | **4 of 7** | **3 of 7** |
| pads blocked | spots 0, 3, 4 | spots 0, 3, 4, 6 |
| worst spot | 3 — buttons at y 462–584 | 3 — buttons at y 428–550 |
| how far below the edge | **72–194 px** | **108–230 px** |

At spot 3 nothing is visible at all. The message line reads *"Pick a tower, or
click away to cancel"* and there is no menu on the screen to pick from. At
spot 0 the panel's top half is visible and the buttons are reachable but
clipped, partly under the ability bar.

Reproduce:

```sh
sh tools/harness/build.sh
sh tools/harness/run.sh menustate 130 568x320
# screenshots land in tools/harness/shots/menustate-open<spot>-568x320.png
```

### `TowerPanel` — select an existing tower — FINE

| | 844×390 | 568×320 |
|---|---|---|
| size | 250×237 | 250×237 |
| overflow | none | 7 px bottom |
| hit areas off screen | 0 | 0 |

### A correction to my own instrument

The first version of this probe pressed each blocked spot and reported *"built
anyway"* every time, which reads as proof the overflow is merely cosmetic. **It
is not.** The harness's `mouse()` dispatches its events on `game.canvas`
directly, so Phaser hit-tests a point 194 px below the display exactly as
happily as one in the middle of it. A thumb cannot produce that event — the OS
has nothing there to hit.

The handler works. The button is unreachable. The probe now records the press
as wiring evidence only and lets the geometry decide reach.

---

## 4. The radial ring

**Received in full.** One component replacing both `BuildMenu` and
`TowerPanel`; circular icon buttons with price badges beneath; screen-space,
not scaled by camera zoom; a tap opening a floating description panel rather
than purchasing; purchase behind a second explicit confirm; the panel clamped
to the viewport including safe-area insets, flipping to whichever side has
room, never covering the tower or the ability bar; text shrinking to a floor
and reporting rather than clipping; exhaustive testing across every pad, every
built tower, both zoom ends, both viewports. Plus the answer to my open
question: **(b), the floating panel beside the ring.**

**State: not started.** No file, no class, no branch, no partial
implementation. `BuildMenu` and `TowerPanel` are both still wired and in use.
Between receiving the spec and now I did the two audio tasks, the flagstone
pads, the two extra voice lines and the WebP map plate instead.

The earlier diagnosis of how the ring came to be missed is in
[`TOWER-MENU.md`](../TOWER-MENU.md). That document is still accurate about the
history; this one supersedes it on current state.

### The ten UI icons

Eight of ten are placed, all of them in `TowerPanel`:

| icon | used |
|---|---|
| `damage`, `range`, `firerate`, `armor` | stat rows |
| `sell` | sell row |
| `upgrade`, `target` | action row |
| `locked` | unavailable rows |
| `confirm`, `cancel` | **unreferenced** — cut for the ring's confirm step, which does not exist yet |

`BuildMenu` uses **none** of them. Build-on-empty-pad is still the old text
grid.

---

## What this implies for sequencing

The ring fixes the `BuildMenu` failure by construction: it is screen-space,
clamped to the viewport, and flips to whichever side has room. Patching
`BuildMenu`'s clamping first would be work thrown away when it is deleted.

Outstanding and independent of the menu, from the gameplay recording:

1. **Hero facing** — the art is authored facing right and is never flipped, so
   he walks and swings backwards when moving left.
2. **DAD MODE audio sync** — the line must land on the visual transformation.
3. **Music level** — measure music against SFX and voice, put music roughly
   10–12 dB under the voice lines, separate volume from SFX.

# The comic in the corner: one missing line, and the layout rebuilt around it

The cutscene drew its panels at native size in the top-left of the screen, with
a large black area around them. The cause was one line that was never there, in
a scene whose own comment already described the correct behaviour.

**Still on `claude/targeting-drawer-input-bugs-lb5184`, not `main`.** The brief
said to work directly on main; this session is bound to that branch and cannot
push anywhere else. It remains a fast-forward.

## Commits

| commit | what | CI |
|---|---|---|
| [`70fbbe1`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/70fbbe1) | Fit the cutscene camera; rebuild the panel layout | `test` ✅, `typecheck` ✅, `deploy` skipped ([run 33996563492](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33996563492)) |
| [`5206dff`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/5206dff) | This report | `test` ✅, `typecheck` ✅, `deploy` skipped ([run 33996636912](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33996636912)) |

**818 tests pass**, against 810 before. `tsdiff` against `46f1f72` introduces
nothing: the two `TS2307` lines it reports are the pre-existing artifacts from
the previous session's `HeroFx.ts` and `TextGuard.ts`, unchanged here.
`CutsceneLayout.ts` is Phaser-free and adds no local type noise at all.

---

## 1. What it actually was

Not the fit. `CutsceneScene.layout` computed a correct contain-fit and centred
the result:

```ts
const scale = Math.min(w / sw, h / sh)
this.image.setDisplaySize(sw * scale, sh * scale)
this.image.setPosition(w / 2, h / 2)
```

That is right, and `w`/`h` come from `viewW`/`viewH`, which are **CSS pixels**.
The scene never fitted its camera, so the result was drawn through an
untransformed camera over a canvas measured in **physical pixels**.

At `devicePixelRatio` 3 the arithmetic is exact and unforgiving. A panel sized
to the CSS viewport occupies a third of the physical canvas, and a centre at
`(w/2, h/2)` in CSS lands one sixth of the way across it. So: a comic at a third
of its size, pinned toward the top-left, with the camera's dark background
filling the rest. That is the report, word for word.

**At `devicePixelRatio` 1 the two spaces are the same number and it looked
perfect**, which is how it shipped and why nobody caught it on a desktop.

This is the same CSS-versus-physical confusion `systems/Resolution.ts` already
records as having cost several bugs — the build ring clamped 401px from its pad,
the modal scrim over one quadrant, a harness probe reporting a correctly-placed
tower as off screen. It is the sixth. The fix is the line every other screen in
the game already had:

| screen | how it reconciles the two spaces |
|---|---|
| Title, Credits, WorldMap, Loadout | `fitCameraToDesign` |
| GameScene HUD and overlays | its own `uiCam` via `fitUiCamera` |
| HudScene | `fitUiCamera` |
| **CutsceneScene** | **nothing** |

`fitUiCamera(this)` is now the first thing `create` does, before anything is
measured or placed, and the resize handler re-applies it — the camera's centre
is derived from the viewport, so a rotate that moved only the sprites would
leave the whole scene offset by half the difference.

## 2. The layout, rebuilt

The arithmetic moved to `systems/CutsceneLayout.ts`, Phaser-free, so every
viewport in the brief is checkable without a canvas. Four rules, and the order
between them is the design:

1. **Never crop.** `Math.min`, always. A speech bubble in the corner of a panel
   *is* the panel, so the axis that runs out first decides and the other gets
   the game's dark chrome. There is no cover-fit and there must never be one.
2. **Never under a control.** A corner placement cannot promise this: at exactly
   16:9 there is no letterbox band for a corner to sit in, so the corner is on
   the picture. A band is reserved instead, and SKIP and the panel counter live
   at opposite ends of it.
3. **Always centred, in the SAFE area** rather than the viewport, so nothing
   sits under a notch or a home indicator.
4. **As large as fits** — the one that gives way to the other three.

**On a phone, rules 2 and 3 cost nothing at all.** A 16:9 panel in a portrait
viewport leaves hundreds of pixels of letterbox; the band sits in it, and the
panel is simultaneously centred and maximal. Only when the viewport is close
enough to 16:9 for the panel to reach the band — a desktop window, a wide
landscape phone — is anything given up, and then the band is reserved from
**both** sides of its axis so the panel stays centred rather than being pushed
down or across by half a control.

Which edge the band comes off is **measured, not guessed**: both candidates are
fitted and the larger panel wins. That lands on the top in portrait and on the
side in landscape without either orientation being special-cased.

### Measured, at the viewports the brief names

| viewport | band | panel | % of width | off centre | control on art |
|---|---|---|---|---|---|
| 375×667 portrait | top | 347×195 | 93% | 0.0px | no |
| 667×375 landscape | right | 459×258 | 69% | 0.0px | no |
| 390×844 portrait | top | 362×204 | 93% | 0.0px | no |
| 390×844 portrait, notched | top | 362×204 | 93% | 0.0px | no |
| 844×390 landscape | right | 643×362 | 76% | 0.0px | no |
| 844×390 landscape, notched | right | 606×341 | 72% | 0.0px | no |
| 1440×900 desktop | top | 1343×756 | 93% | 0.0px | no |
| 1280×720 desktop (exact 16:9) | right | 1072×603 | 84% | 0.0px | no |
| 1920×1080 (exact 16:9) | right | 1712×964 | 89% | 0.0px | no |
| 1024×768 iPad | top | 996×561 | 97% | 0.0px | no |
| 320×480 | top | 292×164 | 91% | 0.0px | no |

Aspect ratio is preserved to within 0.001 in every case — one uniform scale on
both axes, so nothing is stretched and nothing is cropped.

### One number changed as a consequence

SKIP's plate went from **108×44 to 76×44 points**. That is not cosmetic: the
narrower the control, the more viewports get the free path where the band fits
in the natural letterbox and the panel keeps its full size. Measured, at
844×390 landscape it is the difference between **76% and 68%** of the width. 76
comfortably clears the 44pt minimum the brief and the platform both ask for,
and "SKIP" at 20px needs about 50 of it. A test holds both dimensions at or
above 44.

## 3. One layout path

The brief asked for this to be confirmed rather than assumed. There is one
`layout()`, and everything reaches it:

- the **first panel** and **every later panel**, through `drawPanel`;
- a panel whose **texture lands late**, through `drawPanel` again from the
  loader's completion handler;
- the **controls**, when they are built;
- every **resize and rotate**, through the resize handler, which re-fits the
  camera first.

`placeSkip` is gone. It was a second placement, called from two places, reading
the raw viewport rather than the safe area — exactly the shape that gets left
behind by the next resize. A test asserts it stays gone and that `layout` is
defined once.

**The transition into the game scene is untouched.** `handOver` still marks the
comic seen in one place and calls `scene.start(this.next)`. Camera state does
not leak: each scene owns its own camera manager, and GameScene sets up its own
viewport and `uiCam` in `create` as it always did.

## What was NOT checked

**No screenshots of the running game, and no harness run.** `tools/harness/`
needs a Phaser dist and there is none — `npm` answers 403 for `phaser`, cdnjs is
blocked at the proxy. This is the same gap as the previous report and it is
still the largest one. Specifically:

1. **Nobody has seen the fixed comic on a phone.** The cause is understood, the
   arithmetic is measured, and the fix is the same call four other scenes
   already make — but the proof is a device.
2. The image sent in chat is **rendered from the shipping layout module with the
   real panel art**, at the viewports in the table. It is a layout diagram, not
   a game screenshot: it shows where the module says things go, not what Phaser
   drew.
3. **Rotation was not exercised live.** The handler is asserted at the source
   level to re-fit the camera, re-size the tap zone and re-place the panel; a
   real orientation change was not performed.
4. **Safe-area insets are modelled, not read from a device.** The layout is
   checked against four inset shapes including both notched orientations, but
   `safeAreaInsets()` reads a DOM probe that only exists in a browser.

**Not measured:** whether 69% of the width at 667×375 reads as "most of the
width" to a person looking at it. It is the tightest case in the table — a small
phone in landscape has the least chrome to hide a control in — and if it grates,
the lever is `skipWidth`, or accepting an off-centre panel in landscape only.

## Where this leaves the repository

**In flight:** this commit, on `claude/targeting-drawer-input-bugs-lb5184`, CI
green. Merging to `main` is still the one remaining step and still a
fast-forward.

**Waiting on a decision (Cory's):**

1. **69% of the width at 667×375 landscape.** As above. Everything else is 72%
   or more.
2. Everything carried forward from
   [the previous report](2026-09-05-input-escapes-loadout-hero-powers-and-context-loss.md):
   the desktop render-scale floor, CANCEL's cost to the ability icons on a
   narrow phone, `DESIGN.md` still calling Eli "The Charmer", hero power
   balance, and the Ima Dummy's out-of-range tap.

**Carried forward, still open, not touched here:** no `package-lock.json`;
`tools/trace_map.py` broken; the eight ability icons that grew as WebP; lossless
for the twelve low-PSNR sprites; `art-source/` has no README; `AUDIT.md` and
`SOAK-REPORT.md` unrevised.

**Still the highest-value unblock:** vendoring `phaser.min.js` into the
repository. Five briefs in a row have now asked for visual confirmation that
this environment cannot give, and this one was a rendering bug that a single
frame would have shown instantly.

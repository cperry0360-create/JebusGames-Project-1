# Render quality: why the graphics are grainy

Diagnosis only. **No rendering setting has been changed.** The one thing
committed alongside this report is the harness's `pixels` scenario, which
gathers the evidence below and touches no game code.

Reported symptom: sprite outlines break into hard pixel steps and thin lines
look dashed. The same PNGs downscale cleanly in Word, so the source art is not
the problem.

**It is not the source art, and it is not the filter mode. The canvas is being
rendered at one third of the device's linear resolution and then upscaled by
the compositor.**

---

## How to reproduce the measurements

```
cd tools/harness && sh build.sh
rm -f shots/report.json && (python3 server.py wait 50 &) && sleep 1
/opt/pw-browsers/chromium --headless=new --no-sandbox --hide-scrollbars \
  --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader \
  --force-device-scale-factor=3 --window-size=844,390 \
  --user-data-dir=/tmp/prof "http://127.0.0.1:8899/index.html?s=pixels&vp=844x390"
```

**Both extra flags are mandatory or the diagnostic lies.** The default harness
flags include `--disable-gpu`, which drops Phaser to the CANVAS renderer and
makes every WebGL reading null. And headless Chromium is DPR 1, which hides the
entire resolution problem — the first run of this diagnostic reported
"rendering at 100% of physical resolution", and that was an artefact of the
harness, not a finding.

---

## 1. The game config

Read live from `game.config` at runtime, not from the source file.

| setting | value |
|---|---|
| Phaser | 3.90.0, renderer **WEBGL** (`type: AUTO`) |
| `pixelArt` | **false** |
| `antialias` / `antialiasGL` | **true** / **true** |
| `roundPixels` | **true** |
| scale mode | **RESIZE** (5) |
| `autoCenter` / `autoRound` | `NO_CENTER` / false |
| `resolution` | **undefined** — and Phaser 3 removed it; it is ignored even when set |
| `mipmapFilter` | `""` → the renderer's is **null** |

Two of these are already what you would want, and deliberately so: `config.ts`
carries a comment explaining that NEAREST on a 2x source is exactly what turns a
4px outline into a broken dotted line. Bilinear filtering is correct here and
should not be touched.

## 2. Canvas resolution versus physical pixels — the fault

On a DPR-3 viewport at 844x390 CSS pixels:

```
devicePixelRatio:     3
canvas backing store: 844 x 390
canvas CSS size:      844 x 390
BACKING STORE PER CSS PIXEL: 1.000   (device wants 3)
=> rendering at 33% of the device's physical resolution
```

The canvas holds **one third of the device's linear resolution — one ninth of
its pixels**. The browser then upscales that 3x to fill the screen. Every sprite
edge becomes a 3-physical-pixel stair, and a line one canvas-pixel wide becomes
a 3px smear.

Phaser 3 does not apply devicePixelRatio under `Scale.RESIZE`: the canvas
backing store is whatever size the ScaleManager is given, and the resize path
gives it CSS pixels. There is no config switch — `resolution` was removed after
Phaser 3.15.

### `roundPixels: true` makes this specifically worse

Rounding draw positions to integers is harmless at native resolution. At a third
of resolution it snaps every sprite to **3-physical-pixel** boundaries. That is
the mechanism behind the two symptoms as described:

- edges land on hard steps rather than being softened by the filter, and
- a thin line crossing a rounding boundary as a sprite moves drops in and out,
  which reads as **dashed**.

## 3. Filtering and mipmaps

Every texture reports `scaleMode = 0` = **LINEAR**. That is already what you
expected and it is correct.

**Mipmaps: none, and they cannot currently be switched on.**

- `mipmapFilter` is empty, so Phaser never calls `generateMipmap`.
- The context is **WebGL1**.
- **67 of 109 textures are non-power-of-two.**

WebGL1 forbids mipmaps on NPOT textures, and Phaser 3.90 has no WebGL2
renderer. So "LINEAR with mipmaps for the world layer" is not a flag — it needs
every texture padded to a power of two, which changes packing and UVs across the
whole manifest.

Fixing the canvas removes most of the need anyway. Mipmaps earn their keep under
heavy minification; at full DPR the world stops being minified except at the
bottom of the zoom band, where the worst case is about 0.38 (2.7x down) and
bilinear is adequate if not perfect.

## 4. Pre-scaling: none

Vite copies `public/` verbatim. No tool in `tools/` resizes an image. Nothing
resizes at load. Full-resolution PNGs go to the GPU and are scaled at draw time
by `setScale`.

`hero-cory` is **386x470 source, drawn at 75.8 world px** — `scale 0.163`, i.e.
16% of source.

## 5. What is displayed larger than its texture

At DPR 1, no character or tower sprite is magnified; the worst is 0.70 at max
zoom. But the sprite table is built from `art.render` entries that carry a
`displayHeight`, and the biggest object on screen is not one of them.

### The map plate is genuinely under-resolution, independent of DPR

```
MAP PLATE  source 1672x941  drawn at 1280 world px
  @min      993px on screen from 1672px of source = 0.59x
  @default  2202px on screen from 1672px of source = 1.32x  *** MAGNIFIED ***
  @max      3034px on screen from 1672px of source = 1.81x  *** MAGNIFIED ***
```

At DPR 3 that is **3.95x at default zoom and 5.44x at max**. The background —
the largest continuous surface in every screenshot — is being blown up four to
five times.

### Everything else, once the canvas is corrected

Ratio of on-screen physical pixels to source pixels. The right-hand columns are
what you would be signing up for if only the canvas were fixed.

| sprite | source | DPR1 @def | DPR1 @max | **DPR3 @def** | **DPR3 @max** |
|---|---|---|---|---|---|
| enemy-shredder | 120 | 0.50 | 0.70 | 1.51 | **2.09** |
| enemy-politician | 282 | 0.50 | 0.69 | 1.51 | **2.08** |
| enemy-notice | 226 | 0.50 | 0.69 | 1.51 | **2.08** |
| enemy-filer | 150 | 0.50 | 0.69 | 1.50 | **2.07** |
| turret-ledger | 300 | 0.50 | 0.69 | 1.50 | **2.06** |
| turret-ledger-t2 | 371 | 0.50 | 0.69 | 1.50 | **2.06** |
| turret-ledger-t3 | 472 | 0.50 | 0.69 | 1.50 | **2.06** |
| unit-gnome-rake / -trowel | 134 | 0.50 | 0.68 | 1.49 | **2.05** |
| projectile-rocket | 129 | 0.47 | 0.64 | 1.40 | **1.93** |
| prop-pad | 290 | 0.43 | 0.59 | 1.28 | **1.77** |
| hero-cory-ultimate | 460 | 0.39 | 0.54 | 1.17 | **1.61** |
| projectile-rocket-big | 200 | 0.34 | 0.47 | 1.03 | **1.42** |
| towers (512px sources) | 512 | 0.29 | 0.40 | 0.88 | **1.21** |
| hero-cory | 470 | 0.28 | 0.38 | 0.83 | **1.15** |
| fx-muzzle | 160 | 0.15 | 0.21 | 0.45 | 0.62 |

### This contradicts a rule in CLAUDE.md

Rule 7 says to author character art at roughly 2x its render size. Cory renders
at 75.8 world px, so the rule asks for a 152px source. The physical requirement
at DPR 3 and max zoom is **539px**.

The rule is stated in the wrong unit — it under-provisions a retina screen by
3x — and the art that violates it (470px, 6.2x) is the art that is very nearly
correct. It should be restated in physical pixels:

> source height >= world height x maxZoom x 3

## Summary of causes, in order of contribution

1. **The canvas renders at 1/3 of physical resolution.** Dominant. Everything
   else is secondary to this.
2. **`roundPixels: true` quantises to those 1/3-resolution pixels.** This is
   what makes the steps hard and the thin lines dashed rather than merely soft.
3. **The map plate is a genuinely under-resolution asset** at 1672px for a
   1280-world-px surface, magnified even at DPR 1.
4. **No mipmaps.** Real but minor, and blocked by WebGL1 + NPOT.

---

## Proposed fix

### 1. Render the canvas at full device resolution — the whole cause

There is no config flag, so the shape is: set the Phaser game size to
`css x dpr`, and use the ScaleManager's `zoom` (or an explicit CSS width and
height on the canvas element) to size it back down. Phaser converts pointer
coordinates automatically.

The cost is that the game's coordinate space becomes physical pixels. Three
things read screen units today and would need attention:

- `HudLayout`, built from `scale.width` / `scale.height`
- the typography floors
- the safe-area insets

The menu screens are **free**. `fitCameraToDesign` is a CONTAIN fit of the
1280x720 design box, so it simply computes a 3x larger zoom and everything gets
sharper with no layout change at all. GameScene needs its zoom band multiplied
by DPR. So the bounded work is: HUD layout and typography divided by DPR (or
the HUD camera's zoom set to DPR), and the camera band scaled.

**Do this one on its own**, verified at both viewports plus a DPR-3 run, and not
mixed with anything else. It is the change most likely to disturb layout.

### 2. Then test with `roundPixels` off

It is doing real damage at low resolution. At full resolution it is close to a
no-op, and off it stops quantising edges entirely. Measure rather than assume.

### 3. Re-export the map plate — DONE, at 3840x2160

`1672x941` needed to be at least **2560x1440**, ideally **3840x2160**, to stop
being magnified at the top of the zoom band on a retina screen. Nothing in code
fixes a background smaller than the screen it is drawn on.

It came back at the ideal size — and as a **12.6MB PNG**, which is two thirds
of the whole deploy for one file. PNG is a poor fit for it: the plate is a
painted illustration with no transparency, so its entropy is texture, and
lossless coding only reached 2:1 against the raw pixels.

It ships as **WebP at quality 90: 1.84MB**, which is *smaller than the 1672px
PNG it replaces* (2.40MB) while carrying 5.3x the pixels. The candidates,
measured against the source with `tools/reencode`:

| | size | PSNR | RMSE |
|---|---|---|---|
| PNG (source) | 12.60MB | — | 0 |
| **WebP q90** | **1.84MB** | **39.7 dB** | **2.65** |
| WebP q85 | 1.45MB | 38.1 dB | 3.18 |
| WebP q80 | 1.15MB | 36.5 dB | 3.83 |
| JPEG q90 | 2.17MB | 39.4 dB | 2.73 |
| JPEG q85 | 1.80MB | 38.1 dB | 3.18 |

WebP beat JPEG at every quality: 15% smaller at q90 for slightly better PSNR,
and it matched JPEG q85's quality at 19% fewer bytes. JPEG was viable — the
plate has no alpha — and simply lost.

Quality was checked where a person would see it rather than by the average
pixel: crops of the arch mouth, the gate, a path edge, flat open grass and the
worst-error pixel, magnified 2.4x, which is what the plate is magnified by at
max zoom on a dpr-3 phone. Worst channel error over those crops was 17 to 33
out of 255, all of it in the grass's own high-frequency paint texture. No
ringing at the painted outlines, no banding in the flat gradients, nothing
separable by eye.

WebP's support floor is Safari 14 / iOS 14 (2020), Chrome 32, Firefox 65. No
JPEG fallback ships; a second copy of the plate would give back a third of what
the format saved, for browsers this game does not otherwise run on.

**Nothing is on PNG any more.** The backdrops went first, and on 2026-09-05
the rest of the cast followed: every image under `public/assets/` is WebP q95,
which took the deploy from 58.0MB to 23.8MB. Alpha survived the trip bit-exact
on all 111 files -- libwebp compresses the alpha plane losslessly by default,
so the soft edges and glow effects that a quantized PNG would have wrecked came
through untouched. The measured saving was 71.6% overall.

The encoder is Chromium, driven by `tools/towebp/`, for the reason
`tools/reencode/` already gives: this environment has no cwebp, no
ImageMagick and no PIL, and every package registry answers 403. The one
thing the browser does not expose is libwebp's `method` knob, so a
`cwebp -m 6` pass would be a few percent smaller at the same quality --
never a different picture.

Eight small ability icons came out LARGER as WebP than as PNG (90KB more
across all eight): flat, few-colour 256px badges are what PNG is good at.
They were converted anyway, so that "no PNG under public/assets" is a rule
with no exceptions to remember.

### 4. Mipmaps: recommended against, for now

Blocked by WebGL1 + NPOT, they would need the whole manifest repacked to powers
of two, and after step 1 they only buy anything at the very bottom of the zoom
band. Revisit only if minified shimmer at min zoom is still objectionable once
1 to 3 are done.

### 5. Restate rule 7 in CLAUDE.md in physical pixels

So the next sprite is authored against the screen it will actually be drawn on.

### 6. Desktop is soft because desktop is dpr 1, and nothing is wrong with the canvas

Added 2026-09-05, from the crash report that recorded `dpr = 1` on a phone.

**The phone's 1 was a bug and is fixed.** `deviceScale()` re-read
`devicePixelRatio` on every call, and iOS does not report it reliably while a
page is hidden or is being restored from the back/forward cache — it can read 1
for a frame or two on the way back in. That number is the exchange rate between
the two coordinate spaces the whole game is written in, so a transient reading
would have put two halves of one calculation in different spaces and, through
`applyResolution`, sized the canvas to a third of the device's pixels. It is
latched for the session now and only re-read deliberately, with the page
visible. See `systems/Resolution.ts`.

**Desktop's 1 is not a bug.** A standard desktop monitor genuinely reports
`devicePixelRatio` 1, and the canvas is doing exactly what this document asks
of it: one canvas pixel per device pixel. There is nothing to fix in the
plumbing.

What is true is that rule 7 in CLAUDE.md has no headroom at dpr 1. Cory renders
at 75.8 world px; at `maxZoom` 2.37 and dpr 1 that is 180 physical pixels
against a 470px source, which is **2.6x minification** — the number section 4
above already identifies as the point where a 4px outline starts to smear, and
with no mipmaps to soften it. On a dpr-3 phone the same sprite draws at 539
physical pixels and is barely minified at all. So the roster is authored for
the phone and desktop gets the worst case of it.

**The lever, not pulled here.** A render-scale FLOOR — oversampling to, say, 2x
on a dpr-1 display — would put desktop back in the same band as the phone. It
costs 4x the fill rate on the machine best able to afford it, and it is a
one-line change in `deviceScale()`. It is not made here because it changes what
every sprite in the game is authored against, which is a call about the art
rather than about the plumbing, and because rule 7 would have to be restated
around it. Numbers above; the decision is Cory's.

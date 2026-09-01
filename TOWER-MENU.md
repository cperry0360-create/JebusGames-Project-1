# The tower menu: why there is no ring

Diagnosis only. **No layout or gameplay behaviour was changed.** The one thing
committed alongside this is a harness scenario that measures the build menu
against the viewport, and making `openBuildMenu` public so it can be driven —
the same thing `openTowerPanel` and `openNukeLaunch` already do.

Reported: the tower menu was meant to be a radial ring of icon buttons with a
floating description panel, and the build still shows the old rectangular BUILD
panel, oversized and running off the screen.

**The short version: the ring does not exist. It was never built, not built and
left unwired. That is my miss, and the specific reason is below.**

---

## 1. Was the ring built? Where does it live?

Nowhere. There is no ring component in the repository and there never has been.

- No file, no class, no partial implementation.
- Nothing in git history on any branch: `git log -S "radial" -- src/` and
  `git log -S "RingMenu" -- src/` both return nothing.
- The only match for "radial" anywhere in `src/` is the ambient glow gradient
  in `Ambient.ts`, which is a texture, not a menu.

### Why it was never built

In the history available to me the only mention is the phrase **"the tower
upgrade ring"**, in the request to place the ten UI icons. I read "ring" as a
name for the existing tower panel and put the icons on that rectangular panel.
I did not ask what "ring" meant, and it was ambiguous enough that I should
have.

If a radial redesign was asked for in an earlier session it did not survive
into what I can see. Either way, nothing was built.

## 2. Is it wired to any interaction?

No. There is nothing to wire.

## 3. Are build and upgrade separate components?

Yes — two classes with two layouts, and this matters for the fix.

| | file | opens on | current look |
|---|---|---|---|
| **Build** | `src/ui/BuildMenu.ts` | tapping an **empty pad** | grid, `MAX_COLS = 3`, `platePanel` + `iconPlate` cells |
| **Upgrade** | `src/ui/TowerPanel.ts` | tapping an **existing tower** | 250px wide rectangular panel |

**The screenshot showing the problem is `BuildMenu`, and the recent icon work
touched only `TowerPanel`.** So the icons never reached the screen in question.
That is the second half of the miss: icons went onto the upgrade panel and the
build panel was left exactly as it was.

A ring has to serve both. Today they share nothing but the plate helpers.

## 4. Is the old panel still rendered? What references it?

Both are still rendered, and only `GameScene` references either.

- `BuildMenu` — `GameScene.ts` lines 42, 183, 437, 1087, 1171
- `TowerPanel` — `GameScene.ts` lines 49, 158, 1273, 1336, 1419

## 5. Is the deployed build current?

Yes.

```
local main   c1a32df
origin/main  c1a32df
Deploy to GitHub Pages  c1a32df  completed success  2026-09-01T22:05:47Z
```

I could not fetch the live page to read its build stamp — this environment's
egress proxy returns 403 for `github.io` — so **check the stamp in the title
screen's bottom-right corner against the current commit**. What is being seen
is consistent with a current build, because the old BUILD panel genuinely is
still there.

---

## A real bug found while measuring

The build menu **runs off the bottom of the screen**, at every pad, at both
viewports. Not the right edge.

| viewport | worst pad | bottom overflow |
|---|---|---|
| 844x390 | spot 3 | **212px** |
| 568x320 | spot 3 | **248px** |

The panel is a fixed 240x180 anchored to the tile that was tapped, with **no
clamping to the viewport at all**. On a pad low on the map, most of it is off
screen. With only two towers unlocked it is already this bad, and the panel
grows with the unlocked list, so it gets worse as a run goes on.

Testing one pad would have missed this: the overflow depends entirely on where
the tapped tile is, which is how "runs off the right edge" and "runs off the
bottom" can both be reported and both be missed. The harness scenario walks
every free spot and reports the worst.

**Deliberately not fixed.** Both panels are due to be replaced by the ring, so
clamping one that is about to be deleted is throwaway work.

---

## What is needed before building

The ring is a new component, and one choice changes the work materially.

**Where does the description panel sit?**

- **(a) Inside the ring's centre.** Compact and self-contained, but it caps the
  ring's inner radius and hard-limits how much text a description can carry.
- **(b) Floating beside the ring**, flipped to whichever side has room. Takes
  more text, needs flip logic to stay on screen — and 568x320 is exactly where
  the current panel already fails worst, so that logic has to be right.

**My recommendation is (b).** It survives the short-viewport case, which is the
case that is broken today. If no preference is given, that is what will be
built.

Once answered, the ring replaces **both** `BuildMenu` and `TowerPanel`, serving
the build-on-empty-pad and upgrade-existing-tower flows from one component.

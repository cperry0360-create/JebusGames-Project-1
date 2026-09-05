# Step 0: the previous session's work has not merged, and this session is on a branch

The brief opens with a gate: confirm that `origin/main` contains the work from
`claude/targeting-drawer-input-bugs-lb5184` and that it has deployed, and *stop*
if it has not. It has not. This report is the evidence for that, and the two
things that have to be true before steps 1–9 can start.

## Commits

| commit | what | CI |
|---|---|---|
| [`2c5cffa`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/2c5cffa) | this report | ✅ `test` ✅ `typecheck`, `deploy` skipped ([run 33997375057](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33997375057)) |
| the commit closing this table | fills in the row above | not recorded — a report cannot carry its own CI result |

`deploy` is skipped rather than failed: it is gated on `main`, and this is a
branch. That is the same gate this whole report is about.

No code was changed. Nothing was fixed, vendored, converted or tuned; the gate
failed on the first check and the brief says to stop there.

## The two answers

### 1. `claude/targeting-drawer-input-bugs-lb5184` is NOT merged into `main`

Checked after a fresh `git fetch origin`:

```
$ git merge-base --is-ancestor \
    origin/claude/targeting-drawer-input-bugs-lb5184 origin/main
  -> NO (exit 1)

$ git log --oneline origin/main..origin/claude/targeting-drawer-input-bugs-lb5184
  14 commits, b2c9e05 .. c2172f3

$ git diff --stat origin/main origin/claude/targeting-drawer-input-bugs-lb5184
  43 files changed, 5555 insertions(+), 430 deletions(-)
```

It is not a partial merge or a cherry-pick either. The five Phaser-free modules
that session built are absent from `main` entirely:

```
$ git ls-tree -r --name-only origin/main | grep -iE 'cutscenelayout|herorow'
  (nothing)
```

`TargetingMode.ts`, `HeroPowers.ts`, `RenderHealth.ts`, `HeroFx.ts`,
`TextGuard.ts` and `Facing.ts` are likewise branch-only, along with
`tests/targeting.test.ts`, `tests/heropowers.test.ts`, `tests/renderhealth.test.ts`
and `tests/uichrome.test.ts`.

The merge base is `46f1f72` — the current tip of `main`. The branch is ahead by
14 and behind by 0, so **it is still a clean fast-forward** and needs no rebase.

There is no pull request for it. The repository has three PRs ever (#1, #2, #3),
all closed, none of them this branch.

### 2. `main` HAS deployed — but `main` does not contain the work

`origin/main` is at `46f1f72` ("Close the CI table on the WebP report"). Its
Checks run [33991917479](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33991917479)
is green on all four jobs:

| job | conclusion | finished |
|---|---|---|
| `test` | success | 21:04:07Z |
| `typecheck` | success | 21:04:03Z |
| `deploy / build` | success | 21:04:49Z |
| `deploy / deploy` | success | 21:05:03Z |

So Pages is serving `46f1f72`, and that is the newest thing it could serve. The
deploy is not broken and never was. What is missing is the merge: the deploy
gate hangs off `main`, `main` does not have the branch, so the branch has
correctly never deployed. **Both halves of the brief's stop condition point at
the same single missing action.**

I could not confirm the served SHA from the live site directly — this
environment's proxy answers `CONNECT tunnel failed, response 403` for
`cperry0360-create.github.io`, so `version.json` is unreachable from here. The
deploy is confirmed from the workflow run instead, which is a weaker check in
one specific way: it proves Pages accepted and published the artifact, not that
a browser fetching the site today gets `46f1f72` back. If that distinction
matters, loading the site and reading `window.__buildId` settles it in a second.

## The other thing, said at the start rather than the end

**This session's configuration forces the branch
`claude/phaser-vendor-layout-authority-74uaif`. It cannot push to `main`.**

The brief says "This session must work directly on main. If your configuration
forces a branch, say so immediately at the start rather than at the end." It
does, and this is that notice. The harness instruction is explicit — develop on
the designated branch, never push to a different branch without permission — and
it overrides the brief's preference.

This is now **the third consecutive session** bound this way. The previous
session's summary opens with the same paragraph, and its work is the work that
has not merged. That is the actual pattern: each session produces a clean
fast-forward on a branch nobody merges, and the next session inherits a `main`
that does not have it. Steps 3, 6 and 8 of this brief all begin "verify whether
the previous fix is in the merged build" — and the answer for all three is the
same, because none of them ever reached `main`.

## What needs to happen before this brief can start

Two actions, both Cory's:

1. **Merge `claude/targeting-drawer-input-bugs-lb5184` into `main`.** It is a
   clean fast-forward from `46f1f72`; CI is green on the tip
   ([run 33997129631](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33997129631)).
   Merging it triggers Checks on `main`, which gates and then runs the deploy.
   Nothing else is required — no rebase, no conflict resolution.

2. **Decide how this session pushes.** Either grant permission to push to `main`
   directly, or accept that this session's work also lands on
   `claude/phaser-vendor-layout-authority-74uaif` and needs the same merge
   afterwards. Saying so now is cheaper than discovering it at the end again.

Once `main` has the merge, steps 1–9 are unblocked as written, and step 1
(vendoring `phaser.min.js`) remains what the last session called the single
highest-value unblock — five sessions of rendering fixes have now shipped
without anyone seeing a rendered frame.

## What was NOT checked

Everything except the gate. Specifically not looked at, not measured, not
attempted:

- **Step 1.** No attempt to vendor Phaser. Whether `npm` still answers 403 for
  `phaser` in *this* environment, and whether the CDN is still blocked at the
  proxy, are both unverified today — they are last session's findings, carried
  forward, not re-confirmed. The site fetch above failing with a proxy 403 is
  consistent with the CDN block but is not the same test.
- **Steps 2–9.** No investigation of the Scale Manager, no layout authority, no
  drawer input tracing, no HUD edits, no wave banner, no peanut icon, no
  affordability refresh, no enemy facing, no boss soak. Not started.
- **The VERIFY section.** No frames rendered at any viewport, because the
  harness is the thing step 1 was meant to unblock.
- **`npm test` and `sh tools/tsdiff.sh`** were not run. The brief asks for them
  "against the merged main", and there is no merged main to run them against.
  Running them against an unmerged tree would answer a different question than
  the one asked.

## Where this leaves the repository

**In flight:** `claude/targeting-drawer-input-bugs-lb5184`, 14 commits, green,
a clean fast-forward, **waiting only on a merge**. This report, on
`claude/phaser-vendor-layout-authority-74uaif`, which will need the same.

**Blocked:** every step of this brief, on that merge. Steps 3, 6 and 8
additionally cannot be answered at all until it lands, because each asks whether
a previous fix survived into the shipped build.

**Waiting on a decision — carried forward from the previous session, none of
them touched:**

1. The desktop render-scale floor (`RENDER-QUALITY.md` §6) — one line, 4× the
   fill rate, changes what all art is authored against.
2. CANCEL's home costs the ability icons 64px → 55px at 568×320 with a notch.
3. The cutscene at 667×375 uses 69% of the width; lever is `skipWidth`.
4. Hero power balance is a first pass, entirely untuned and never played.
5. `DESIGN.md` still calls Eli "The Charmer" with an active named *Fetch*,
   superseded by the briefs.
6. The Ima Dummy's out-of-range tap keeps the tower selected; a no-lane tap
   exits. Deliberate divergence, but a choice.

**Still open, older, not touched:** no `package-lock.json`, so both CI jobs
resolve dependencies fresh every run; `tools/trace_map.py` broken; the eight
ability icons that grew as WebP (90KB, revertible in one line); lossless for the
twelve low-PSNR small sprites (0.55MB, measured); `art-source/` has no README;
`maps/map_level3.webp` at 1.29MB is the largest single image against a 3MB cap;
`AUDIT.md` and `SOAK-REPORT.md` unrevised and accurate as history.

**And the one this session adds:** three sessions in a row have been branch-bound
against a brief that asked for `main`, and the merge has not happened once. The
work is not lost and it is not conflicted — it is just not in the game.

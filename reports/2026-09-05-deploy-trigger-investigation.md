# The Pages deploy is not broken: three red commits and a misread run list

2026-09-05.

| | commit | CI |
|---|---|---|
| This report | `pending` | reported below once the branch run lands |

No workflow file changed. The investigation found nothing to fix, and the
report is the whole deliverable.

---

## The verdict

**`.github/workflows/deploy.yml` has no path filter, no actor condition and no
author condition. It never had one.** Neither does `checks.yml`. The deploy
fires on every push to `main` that passes `Checks`, and it did so twice while
this was being investigated.

The brief asked me to find why the deploy was not firing on pushes to `main`.
It was firing. Three separate things lined up to look like a trigger fault:

1. **The three `Update levels.json` commits failed `Checks`**, so the gate
   correctly refused to publish them. That is the feature working, not a
   trigger missing them — all three *did* trigger a run.
2. **The "Deploy to GitHub Pages last ran 12 hours ago" reading is a UI
   artifact.** Since the gate landed, `deploy.yml` runs as a *called* workflow,
   and GitHub attributes a called workflow's jobs to the caller's run. The
   `Deploy to GitHub Pages` workflow page stopped gaining entries at that
   refactor and will never gain another. Its last own-page run is
   [33870393840](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33870393840),
   `4a4f17f`, 11:57Z — twelve hours before the report, exactly as observed.
3. **The window was real but short.** The site did sit at `8a88409` for about
   thirteen minutes, from 23:56Z to 00:09Z, because every commit pushed in that
   window was red.

## Why the three commits were red

All three set `runsClearedToUnlock` for level 2 back to `1`. `8a88409` had
pinned it at `99` with a self-deleting test, and that test is what they tripped:

```
test at tests/levels.test.ts:172:1
✖ level 2 is out of reach while it cannot be won
  AssertionError: level 2 is reachable again; it was put out of reach because it cannot be won
  1 !== 99
```

So the data edits and the test disagreed, `checks` exited 1, and `needs: checks`
left `deploy` skipped. `8422ce4` deleted that test — the deletion it had asked
for — and the very next run deployed.

This is the failing-on-main path that `2026-09-04-checks-on-main.md` listed
under "Not checked", because proving it meant pushing a knowingly broken commit
to main. It has now been exercised three times by accident, and it behaved as
that report predicted: no deployment was created at all, and Pages kept serving
`8a88409` rather than overwriting it with a broken build.

## The evidence

Every `main` push in the window, from the `Checks` run list and the
`github-pages` deployment records:

| commit | Checks | Pages deployment | live? |
|---|---|---|---|
| `31ea099` | success | 23:48:13Z success | superseded |
| `ce8677b` | success | 23:54:57Z success | superseded |
| `8a88409` | success | 23:56:10Z success | **was live**, now `inactive` |
| `28eaac8` | **failure** ([33931562443](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33931562443)) | none created | — |
| `a0f0e31` | **failure** ([33931770094](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33931770094)) | none created | — |
| `11dc047` | **failure** ([33931897694](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33931897694)) | none created | — |
| `8422ce4` | success ([33931958500](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33931958500)) | 00:09:09Z success | superseded |
| `64119f9` | success ([33932058009](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33932058009)) | 00:11:03Z success | **live** |

`8e09e0a`, `431d6fa` and `988fd90` have no run of their own: they were pushed
together with `8422ce4`, so GitHub built the head. The `Checks` run numbers are
49–54 with no gaps, which rules out the other explanation for a missing run —
that a queued run was cancelled by a later push.

The two green runs each contain three jobs, and the deploy is the second and
third of them:

```
checks            success
deploy / build    success   (npm test, npm run build, upload-pages-artifact)
deploy / deploy   success   (actions/deploy-pages)
```

That is where a gated deploy is visible in the UI. Looking at the `Deploy to
GitHub Pages` workflow page for it will always show a stale date.

## Was a deploy triggered, and did the stamp change?

**No manual trigger was needed.** `64119f9` — the current head of `main` — was
still mid-flight when this started and completed on its own at 00:11:18Z. Its
deployment went `queued` → `in_progress` → `success` at 00:11:19Z with
`environment_url` set to the site, and the `8a88409` deployment flipped to
`inactive` at 00:09:25Z. The live site is on current `main`.

The build stamp is `git rev-parse --short HEAD` taken in the `deploy / build`
checkout (`vite.config.ts`, `buildId()`), baked into `index.html` as
`<meta name="build">` and emitted beside the bundle as `version.json`. The
checkout for that job was `64119f9`, and `core.abbrev` is unset, so:

    stamp before   8a88409
    stamp after    64119f9

A `workflow_dispatch` re-publish was deliberately **not** run. It would rebuild
the same commit, produce the same stamp, and prove nothing the automatic deploy
had not already proven — and it skips the gate, which the workflow's own comment
reserves for a human decision.

## Not checked

- **The served HTML was not fetched.** This environment's egress policy denies
  `CONNECT` to `cperry0360-create.github.io:443` (403 from the gateway), so the
  live `index.html` and `version.json` could not be read directly. The
  `github-pages` artifact was the fallback and is also unreachable: its download
  redirects to `productionresultssa2.blob.core.windows.net`, denied the same
  way. The stamp above is therefore derived from the deployment's recorded
  commit and `vite.config.ts`, not read off the wire. **Anyone on an unrestricted
  network can close this in one request:**

      curl -s https://cperry0360-create.github.io/JebusGames-Project-1/version.json

  It should report `{"build": "64119f9", ...}`.
- **No workflow file was modified**, so nothing about the pipeline was re-run
  or re-verified beyond the runs that happened on their own.
- `tools/tsdiff.sh` was not run: nothing under `src/` changed.

## Where this leaves the repository

- **The pipeline is correct and needs no change.** The one thing to know is
  operational: read a deploy's status from the `Checks` run on the commit, not
  from the `Deploy to GitHub Pages` workflow page, which is frozen by design.
- **New, minor, benign:** `checks.yml`'s concurrency group is
  `checks-${{ github.ref }}` with `cancel-in-progress: false` on main. GitHub
  holds at most one *pending* run per group, so three pushes in quick
  succession can cancel the middle one and its commit never deploys. The site
  still lands on the newest commit, so this cannot cause staleness — but "every
  push to main deploys" is not literally true under rapid-fire pushes. Left
  alone: making it true costs CI minutes to publish commits that are superseded
  seconds later.
- **Now resolved:** the failing-on-main path that
  `2026-09-04-checks-on-main.md` left unproven has been exercised three times
  and behaved as described. That report's "Not checked" section can be closed.
- **Carried forward, unchanged:** `checks` is still not a required status on
  pull requests; the two workflows still disagree on Node (`checks` 24, the
  Pages build 22); re-cut the sign art at ~270px wide; the 568x320 drawer grid
  lever; whether the drawer tab bar should have words (needs `minUiSize`
  lowered from 15); the sign *text* alignment item; 18 trait phrases await
  approval; towers 0.91x the lane; balance not re-tuned for the v2 lane;
  `icon_confirm.png` and `assets/nodes` unreferenced; `hud_peanut_icon.png`
  unwired; the hero walk-sheet redraw is not a task unless asked for.
- **Noted, not acted on:** level 2's unlock is back to `1` on main, so it is
  reachable again, and `988fd90` cut its wave health to +8%. Whether it is now
  winnable is unmeasured here — the soak in `2026-09-04-level2-playable.md` had
  it at 0/60 before those changes and 21/60 after, per `8422ce4`'s message.

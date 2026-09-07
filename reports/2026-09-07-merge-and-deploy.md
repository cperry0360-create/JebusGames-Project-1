# Merging the branch to main, and confirming the deploy actually fired

**Result: `main` is `622086d`, Checks run **157** is green, and the github-pages
deployment for that commit reported `success` at 10:07:55 UTC.**

| | |
|---|---|
| main before | `9172418` (2026-09-06 21:41) |
| **main after** | **`622086d`** |
| commits landed | 13, fast-forward, no merge commit |
| workflow run | **157** — [`34109684313`](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34109684313) |
| Pages deployment | `6306415797`, state **success** |

---

## The merge

Verified before touching anything: `origin/main` was `9172418` exactly as the brief
said, and the branch was a true fast-forward from it.

```
git checkout main
git merge --ff-only origin/claude/hero-art-hud-rework-tqd10v
git push origin main            # 9172418..622086d
```

No merge commit, so `main`'s history is the branch's history unchanged.

## The deploy fired — checked, not assumed

`deploy.yml` is `on: workflow_call` and is invoked by `checks.yml`, so it produces no
workflow run of its own. Asserting "the deploy ran" from the presence of a green
Checks run would therefore be exactly the assumption the brief warned against. What
was checked instead is the **job list inside run 157**, where a called workflow's jobs
appear namespaced:

| job | result |
|---|---|
| `typecheck` | success |
| `test` | success |
| **`deploy / build`** | **success** |
| **`deploy / deploy`** | **success** |

And the steps inside `deploy / build`, which are the ones that matter:

```
npm install → npm test → npm run build → actions/configure-pages@v5
            → actions/upload-pages-artifact@v3     [all success]
```

`deploy / deploy` ran `actions/deploy-pages@v4`, success.

The upload log names the artifact it produced:

```
Artifact github-pages has been successfully uploaded! Final size is 29093519 bytes.
Artifact ID is 10013842971
```

## The github-pages deployment reached success

From the deployments API, environment `github-pages`:

```
deployment 6306415797  sha 622086d  created 2026-09-07T10:07:41Z
  waiting      10:07:42
  queued       10:07:43
  in_progress  10:07:46
  success      10:07:55   https://cperry0360-create.github.io/JebusGames-Project-1/
```

The deployment immediately before it is `6298343790` for `9172418` — the build that had
been live since yesterday evening.

---

## The live asset check could NOT be run from here

**The sandbox cannot reach github.io.** It is a network-policy denial by this
environment's egress proxy, not a transient failure and not something a retry fixes:

```
curl https://cperry0360-create.github.io/JebusGames-Project-1/
  → curl: (56) CONNECT tunnel failed, response 403

$HTTPS_PROXY/__agentproxy/status →
  "recentRelayFailures": [{
     "kind": "connect_rejected",
     "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)",
     "host": "cperry0360-create.github.io:443" }]
```

So **the six URLs were not fetched and I am not claiming they return 200.** What can be
established from inside the sandbox is set out below, and it is short of a live fetch.

### What was established instead

**1. All six files are in the commit that was deployed.** Read out of git at `622086d`
rather than off the working tree:

| file (under `public/`) | bytes at `622086d` | at `9172418` |
|---|---|---|
| `assets/heroes/hero_cory_base.webp` | 97,262 | **absent** |
| `assets/heroes/hero_cory_power.webp` | 260,268 | — |
| `assets/abilities/ability_eli_1.webp` | 41,428 | **absent** |
| `assets/abilities/ability_eli_2.webp` | 39,526 | — |
| `assets/abilities/ability_bailey_1.webp` | 35,136 | — |
| `assets/effects/fx_haymaker.webp` | 122,096 | **absent** |

The three marked absent are the ones that were genuinely 404ing: they were named in
`art.json`, requested on every boot, and not in the repository. That is the gap
`tests/assets.test.ts` was written for in `2f8145f`.

**2. Nothing filters them out of the build.** `vite.config.ts` sets `base: './'` and
declares no `publicDir` or `copyPublicDir` override, so Vite's default applies and
`public/` is copied verbatim into `dist/`.

**3. The deployed bundle grew by about what those files weigh.** Two independent
measurements that agree:

| | `9172418` | `622086d` | delta |
|---|---|---|---|
| `public/` in git | 26.42 MB | 26.83 MB | +0.41 MB |
| uploaded `github-pages` artifact | 28.64 MB | 29.09 MB | +0.45 MB |

The artifact grew by slightly more than `public/` did, which is the recompiled JS
bundle. If the new art had been dropped somewhere between the commit and the upload,
the artifact would not have grown.

That is three converging lines of evidence and still not the same thing as a 200 on
each URL. **Anyone who can open a browser can settle it in ten seconds** — the site is
at `https://cperry0360-create.github.io/JebusGames-Project-1/`, and a hard reload
should show Cory in his new art with the portrait chip at the bottom of the HUD.

---

## Where this leaves the repository

- **`main` is `622086d` and is live.** Everything from this session — the hero art, the
  HUD chip, the prerequisite unlock model, the three difficulty modes, cakes, and the
  level 4 boss at 1500/2250 — is deployed.
- `claude/hero-art-hud-rework-tqd10v` is now identical to `main` and can be deleted
  whenever; it was left in place rather than deleted unasked.
- **Still waiting on a decision, unchanged by this:** level 2's recommended fix
  (`theDevil.maxHealth` 6200 → 5200, measured and not applied), and whether
  `glitchLichReturn` should have moved to 2250 with the boss. Both are in
  `reports/2026-09-07-balance-verification-and-level-2.md`.
- The nine open items in `reports/2026-09-07-status-since-yesterday-1400.md` are
  untouched by this merge.

# main runs the checks now, and the deploy waits on them

2026-09-04.

| | commit | CI |
|---|---|---|
| Run checks on main, and gate the Pages deploy on them | `d7e74fa` | checks:success deploy:skipped (not main) |
| This report | `PENDING` | pending |

---

## The hole

`checks.yml` was triggered by `push: branches-ignore: [main]`. Every branch and
every pull request ran `npm test` and `npx tsc --noEmit`. **main ran neither.**

`deploy.yml` was separately triggered by `push: branches: [main]`, and it built
and published to Pages on its own authority. Its `build` job did run `npm test`
and, through `npm run build` (`tsc --noEmit && vite build`), a typecheck — so
main was not literally unchecked. But nothing tied the two workflows together,
the checks that ran there were incidental to the build rather than the gate, and
main was the one branch with no `Checks` status on its commits. The branch that
ships had the weakest signal in the repository.

## What changed

**`checks.yml`** — `branches-ignore` is gone. `push:` with no filter means every
branch, tags included, and main.

**`deploy.yml`** — no longer triggered by a push. It is now a reusable workflow
(`on: workflow_call`), called from a new `deploy` job in `checks.yml`:

```yaml
  deploy:
    needs: checks
    if: github.event_name != 'pull_request' && github.ref == 'refs/heads/main'
    permissions: { contents: read, pages: write, id-token: write }
    uses: ./.github/workflows/deploy.yml
```

Removing `push: branches: [main]` from `deploy.yml` is the part that makes the
gate real. Left in, the old trigger would still fire in parallel and publish
whatever the checks were about to reject.

Two smaller consequences of the restructure:

- `checks.yml` concurrency is now `cancel-in-progress: ${{ github.ref !=
  'refs/heads/main' }}`. Branches still cancel their own stale runs; main does
  not, because a cancelled checks run on main would take a Pages deploy down
  with it.
- `deploy.yml`'s `concurrency: pages` moved from workflow level to the `deploy`
  job, since a called workflow shares its caller's run.

`npm test` stays in `deploy.yml`'s `build` job. It is redundant on the gated
path, and deliberate: `workflow_dispatch` on `deploy.yml` is kept as a manual
re-publish that skips the gate, and it should not become a way to publish
untested code.

## What a failing push to main does

Pushing a commit that breaks the tests or the typecheck:

| | before | now |
|---|---|---|
| `Checks` run | never started | starts, `checks` job fails |
| `Deploy` run | started, in parallel | never starts — no push trigger |
| `deploy` job | n/a | **skipped** (`needs: checks` unsatisfied) |
| build / upload artifact | ran | never runs |
| `actions/deploy-pages` | ran | never runs |
| the live site | overwritten with the broken build | **unchanged** — Pages keeps serving the last successful deployment |
| the commit on main | green tick from the deploy workflow | red X |

A skipped deploy is not a failed deploy: no deployment is created at all, and
Pages has nothing to un-publish. The site stays exactly as it was until a green
push lands. The same holds one stage later — if the checks pass but `vite build`
fails, `deploy` in `deploy.yml` has `needs: build` and skips, so a build error
also publishes nothing. A cancelled checks job skips the deploy too.

The one deliberate bypass is `workflow_dispatch` on `deploy.yml`: a human can
re-publish main without a push. That path still runs `npm test` and the
typecheck inside `npm run build`, so it cannot publish a broken build either —
only an untested *tree*, and only when someone asks for it by hand.

## How this was verified

- Both files parse (`yaml.safe_load`).
- Run
  [33871025863](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33871025863)
  on `claude/main-branch-ci-checks-svdxut`: `checks` **success** (install, `npm
  test`, `npx tsc --noEmit`, 22s), `deploy` **skipped**. The run's
  `referenced_workflows` lists `deploy.yml@d7e74fa`, which is GitHub resolving
  the `uses:` call — the reusable-workflow reference is valid, not merely
  well-formed YAML.
- The last five `deploy.yml` runs are all `push` on main, conclusion success,
  which confirms Pages is sourced from Actions rather than from a branch. A
  branch-sourced Pages site would publish on push regardless of any workflow,
  and this change would be cosmetic. It is not.

## Not checked

- **The failing-on-main path was not executed.** Proving it end to end means
  pushing a knowingly broken commit to main, or a red commit plus a revert on
  this branch. The behaviour above is `needs:` semantics plus the removed push
  trigger, both of which are visible in the diff; the skip itself was observed
  in run 33871025863, though there it came from the `if`, not from a failed
  `needs`.
- **No Pages deploy has run through the new call path.** The first push to main
  after this merges will be the first one. If `actions/deploy-pages` objects to
  running inside a called workflow, that is where it will show up — the fallback
  is one `workflow_dispatch` on `deploy.yml` while it is sorted out.
- Nothing in `src/` changed, so `tools/tsdiff.sh` was not run.

## Where this leaves the repository

- **New, and worth a decision:** `checks` still is not a required status on
  pull requests (carried forward from 2026-09-04-node-first-build). It matters
  less now that main is checked, but a required status is what stops a red PR
  being merged in the first place.
- **New, minor:** the two workflows disagree on Node — `checks` runs 24, the
  Pages build runs 22. A version-specific failure could pass the gate and break
  the build, which now means a skipped deploy rather than a bad one, but still a
  red main. Aligning them is a one-line change and was left out as unrequested.
- **Unchanged and still open:** re-cut the sign art at ~270px wide; the 568x320
  drawer grid lever; whether the drawer tab bar should have words (needs
  `minUiSize` lowered from 15); the sign *text* alignment item; 18 trait phrases
  await approval; towers 0.91x the lane; balance not re-tuned for the v2 lane;
  `icon_confirm.png` and `assets/nodes` unreferenced; `hud_peanut_icon.png`
  unwired; the hero walk-sheet redraw is not a task unless asked for.

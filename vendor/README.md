# vendor/

Third-party code kept in the repository because this environment cannot fetch
it. Nothing here is bundled into the game or served to players.

## Two dists live here, because this branch is a migration spike

`claude/phaser-4-migration-spike-hage91` has to run the game on BOTH engines to
produce the comparison the spike exists for, so both are checked in and
`tools/harness/build.sh` defaults to the Phaser 4 one:

```bash
sh tools/harness/build.sh                                  # Phaser 4.0.0
PHASER_DIST=$PWD/vendor/phaser.min.js sh tools/harness/build.sh   # Phaser 3.90.0
```

**If this branch is abandoned, delete `phaser4.min.js` and revert the one-line
default in `build.sh`.** Nothing else here depends on it.

## phaser4.min.js

| | |
|---|---|
| version | **4.0.0**, matching this branch's `package.json`'s `phaser: ^4.0.0` |
| size | 1,351,807 bytes |
| sha256 | `84f08d1161b9b0adde36dd8bc89343eada10f57a90c0615ef9a1ffedb1c9be0b` |
| source | `dist/phaser.min.js` at tag `v4.0.0` (commit `9f731d4`) of https://github.com/phaserjs/phaser |
| licence | MIT — see `ATTRIBUTIONS.md` |

Fetched the same way as the file below — the repository moved from
`photonstorm/phaser` to `phaserjs/phaser`, and both paths still serve. `v4.1.0`,
`v4.2.0` and `v4.2.1` were also on the remote at the time of the spike; 4.0.0 is
pinned here because it is the version the official v4.0 migration guide
describes.

## phaser.min.js

| | |
|---|---|
| version | **3.90.0**, matching `main`'s `package.json`'s `phaser: ^3.90.0` |
| size | 1,196,122 bytes |
| sha256 | `e92ddef111ba42e92d316979c732311757093688ea1810591cb7aa2858eba7a7` |
| source | `dist/phaser.min.js` at tag `v3.90.0` (commit `a996562`) of https://github.com/photonstorm/phaser |
| licence | MIT — see `ATTRIBUTIONS.md` |

**Why it is here.** `tools/harness/` runs the shipping source in headless
Chromium, and Chromium needs a Phaser dist on disk. There was none, and no way
to get one: `registry.npmjs.org` answers **403 to every package**, not just
`phaser` — `npm view typescript` fails identically — and `cdn.jsdelivr.net`,
`unpkg.com` and `cdnjs.cloudflare.com` are all blocked at the egress proxy.
So **five consecutive sessions fixed rendering bugs without ever seeing a
rendered frame.** This file is what ends that.

The one route that does work is the session's git proxy, which serves anonymous
reads of public GitHub repositories. That is how this arrived:

```bash
GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 --branch v3.90.0 \
  --filter=blob:none --sparse \
  https://github.com/photonstorm/phaser /tmp/phaser
git -C /tmp/phaser sparse-checkout set dist
cp /tmp/phaser/dist/phaser.min.js vendor/phaser.min.js
sha256sum vendor/phaser.min.js   # must match the table above
```

**It is not in `public/`,** so it costs the deploy nothing: Vite copies only
`public/` into `dist/`, and the game itself gets Phaser from the bundler via a
bare `import Phaser from 'phaser'`. The 40MB asset budget is untouched.

`tools/harness/build.sh` reads this path by default. `PHASER_DIST=... ` still
overrides it, so a local checkout with a real `node_modules` can point at that
instead.

## To upgrade

Bump `phaser` in `package.json`, re-run the clone above at the new tag, and
update the version, size and hash in the table. The hash is the point: it is
what lets the next session confirm this file is what it says it is without
trusting the filename.

## What is deliberately NOT here

**`types/phaser.d.ts`.** Vendoring it would give this environment a real
`tsc --noEmit` and retire `tools/tsdiff.sh` and its known blind spots. That is
a genuine improvement and it is out of scope for the brief that added this
directory; it is written down in the report rather than done quietly.

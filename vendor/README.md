# vendor/

Third-party code kept in the repository because this environment cannot fetch
it. Nothing here is bundled into the game or served to players.

## phaser.min.js

| | |
|---|---|
| version | **3.90.0**, matching `package.json`'s `phaser: ^3.90.0` |
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

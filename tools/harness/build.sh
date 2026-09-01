#!/bin/bash
# Compiles the shipping source to plain ESM and stages it with the real assets.
# Compile the real game to plain ESM and stage it beside the real assets, so
# Chromium runs the shipping source rather than a re-implementation.
set -e
H="$(cd "$(dirname "$0")" && pwd)"
SRC="${SRC:-$(cd "$H/../.." && pwd)}"
PHASER="${PHASER_DIST:-/home/user/phaserjs/phaser/dist/phaser.min.js}"
rm -rf "$H/stage" "$H/tssrc"
mkdir -p "$H/stage"
cp -r "$SRC/src" "$H/tssrc"

# Browsers cannot resolve bare 'phaser' or .ts specifiers, and need an import
# attribute on JSON. Rewriting is the only edit made to the shipping source.
find "$H/tssrc" -name '*.ts' -print0 | xargs -0 sed -i \
  -e "s/^import Phaser from 'phaser'$/const Phaser = (globalThis as any).Phaser/" \
  -e "s/\(from '[^']*\)\.ts'/\1.js'/g" \
  -e "s/\(import [A-Za-z]* from '[^']*\.json'\)$/\1 with { type: 'json' }/g"

cat > "$H/tssrc/tsconfig.json" <<'TSC'
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "resolveJsonModule": true, "allowJs": true, "checkJs": false,
    "strict": false, "skipLibCheck": true, "noEmit": false,
    "outDir": "../stage/js", "rootDir": ".",
    "types": []
  },
  "include": ["**/*.ts"]
}
TSC
# Phaser's types are absent, so the compile is expected to complain; we only
# want the emitted JS.
tsc -p "$H/tssrc/tsconfig.json" > "$H/tsc.log" 2>&1 || true
if [ ! -f "$H/stage/js/main.js" ]; then echo "EMIT FAILED"; tail -20 "$H/tsc.log"; exit 1; fi

cp -r "$SRC/src/data" "$H/stage/js/data"
cp -r "$SRC/public/assets" "$H/stage/assets"
cp "$PHASER" "$H/stage/phaser.min.js"
cp "$H/index.html" "$H/stage/index.html"
echo "staged: $(find "$H/stage/js" -name '*.js' | wc -l) modules"

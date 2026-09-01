#!/bin/sh
# Type errors introduced since a commit CI has already accepted.
#
#   sh tools/tsdiff.sh <known-green-commit>
#
# Why this exists. The npm registry is unreachable from this environment, so
# there is no node_modules and `tsc` cannot resolve `phaser`. Every file that
# imports it loses its base class, and roughly 165 errors fall out that have
# nothing to do with any change: entities "missing" x, y, setPosition and so
# on. Running tsc and reading the output therefore says nothing, and filtering
# by error code is worse — TS2339 is both the cascade AND a real typo.
#
# What is meaningful is the DIFF. Check the same tree out at a commit CI
# accepted, run tsc against both, and report only what is new. The cascade
# appears in both and cancels; a genuine error appears in one.
#
# This was written after CI caught two real errors — a write to a readonly
# field, and a manifest section added to the wrong interface because a naive
# brace match put it inside a nested object literal — that were invisible
# locally in 165 lines of noise.
#
# It is not a substitute for CI. Errors whose text mentions a Phaser type can
# still be cascade rather than fault; read what comes out rather than counting
# it.
set -e
BASE="${1:?usage: tsdiff.sh <known-green-commit>}"
W=$(mktemp -d)
trap 'git worktree remove --force "$W/tree" 2>/dev/null || true; rm -rf "$W"' EXIT
git worktree add -q --detach "$W/tree" "$BASE"

# Drop line and column, so an edit that shifts a file does not read as a
# hundred new errors.
norm() {
  grep -oE '^[^(]+\([0-9]+,[0-9]+\): error TS[0-9]+: .*' \
    | sed -E 's/\([0-9]+,[0-9]+\)//' | sort -u
}

( cd "$W/tree" && npx tsc --noEmit 2>&1 ) | norm > "$W/base"
npx tsc --noEmit 2>&1 | norm > "$W/now"

echo "baseline $BASE: $(wc -l < "$W/base") distinct errors; working tree: $(wc -l < "$W/now")"
echo '--- introduced by the working tree ---'
comm -13 "$W/base" "$W/now" || true

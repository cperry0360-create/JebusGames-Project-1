#!/bin/bash
# Runs one scenario at devicePixelRatio 1 AND 3, and fails if screen space
# came out differently.
#
# THE BLIND SPOT THIS CLOSES. The harness defaulted to dpr 1, which is the one
# ratio where canvas pixels and CSS pixels are the same number. Two separate
# bugs lived in that gap — the modal scrim covering a quarter of the screen,
# and the build ring landing 401px from its pad — and both passed every check
# the harness made. Running the retina pass "when you remember to" is not a
# fix; this makes disagreement a failure.
#
# It compares the FP lines every run now emits: the projection of five fixed
# world points, the UI camera's view, and every HUD rectangle, all in CSS
# pixels. Those are a function of the viewport and the ratio alone, so they are
# comparable across two runs the game itself would not reproduce identically.
#
#   sh tools/harness/both.sh ring 190 844x390
set -u
H="$(cd "$(dirname "$0")" && pwd)"
S="$1"; WAIT="${2:-120}"; VP="${3:-}"; ARG="${4:-}"

extract() {
  python3 - "$1" <<'PY'
import json, sys
try:
    r = json.load(open('%s/shots/report.json' % sys.argv[1].rstrip('/')))
except Exception as e:
    print('NO REPORT: %s' % e); sys.exit(0)
for line in r.get('log', []):
    if line.startswith('FP '):
        print(line)
PY
}

for D in 1 3; do
  rm -rf "$H/profile"
  DPR=$D sh "$H/run.sh" "$S" "$WAIT" "$VP" "$ARG" >/dev/null 2>&1
  extract "$H" > "$H/shots/fp-$D.txt"
  cp "$H/shots/report.json" "$H/shots/report-dpr$D.json" 2>/dev/null
  echo "dpr $D: $(wc -l < "$H/shots/fp-$D.txt") fingerprint line(s)"
done

if [ ! -s "$H/shots/fp-1.txt" ] || [ ! -s "$H/shots/fp-3.txt" ]; then
  echo "RESULT *** NO FINGERPRINT — the run did not finish at one or both ratios ***"
  exit 1
fi
if diff -u "$H/shots/fp-1.txt" "$H/shots/fp-3.txt" > "$H/shots/fp-diff.txt"; then
  echo "RESULT screen space is identical at dpr 1 and dpr 3"
  exit 0
fi
echo "RESULT *** SCREEN SPACE DEPENDS ON THE DEVICE RATIO ***"
cat "$H/shots/fp-diff.txt"
exit 1

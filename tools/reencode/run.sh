#!/bin/bash
# Re-encodes one image at several qualities and reports what each one cost.
#
#   sh tools/reencode/run.sh public/assets/map_level1.png [seconds]
#
# Results land in tools/reencode/out. Nothing is copied into the game; the
# numbers are the output, and choosing from them is a person's job.
H="$(cd "$(dirname "$0")" && pwd)"
SRC="$1"; WAIT="${2:-300}"; Q="$3"
rm -f "$H/out/report.json"
python3 "$H/serve.py" "$WAIT" &
SRV=$!
sleep 1
# --force-color-profile=srgb so the decode cannot shift colours before the
# comparison; the source PNG carries no ICC profile, so sRGB is what it means.
"${CHROMIUM:-/opt/pw-browsers/chromium}" --headless=new --disable-gpu --no-sandbox \
  --force-color-profile=srgb --enable-logging=stderr --v=0 \
  --user-data-dir="$H/profile" \
  "http://127.0.0.1:8901/tools/reencode/index.html?src=$SRC&q=$Q" > "$H/out/browser.log" 2>&1 &
CHROME=$!
wait $SRV
kill $CHROME 2>/dev/null
wait $CHROME 2>/dev/null

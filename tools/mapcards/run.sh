#!/bin/bash
# Cuts the world-map region cards out of the level plates, and draws the
# tiling background behind them.
#
#   sh tools/mapcards/run.sh preview   # downscaled plates with a tenths grid
#   sh tools/mapcards/run.sh cards     # the 300x200 cards, from CROPS
#   sh tools/mapcards/run.sh bg        # the 1254x1254 tiling background
#
# Results land in tools/mapcards/out and are copied into public/ by hand, so a
# re-run cannot quietly change a shipped asset.
#
# Chromium is the image pipeline because this environment has no ImageMagick,
# no PIL and no cwebp, and the plates are .webp. Same reasoning, and the same
# machinery, as tools/reencode.
H="$(cd "$(dirname "$0")" && pwd)"
MODE="${1:-preview}"; WAIT="${2:-180}"
mkdir -p "$H/out"
rm -f "$H/out/report.json"
python3 "$H/serve.py" "$WAIT" &
SRV=$!
sleep 1
"${CHROMIUM:-/opt/pw-browsers/chromium}" --headless=new --disable-gpu --no-sandbox \
  --force-color-profile=srgb --enable-logging=stderr --v=0 \
  --user-data-dir="$H/profile" \
  "http://127.0.0.1:8901/tools/mapcards/index.html?mode=$MODE" > "$H/out/browser.log" 2>&1 &
CHROME=$!
wait $SRV
kill $CHROME 2>/dev/null
wait $CHROME 2>/dev/null
ls -la "$H/out"

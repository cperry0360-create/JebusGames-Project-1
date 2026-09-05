#!/bin/bash
# Decodes one image (typically a .webp plate) to a PNG under tools/decode/out.
#
#   sh tools/decode/run.sh public/assets/maps/map_level3.webp plate3.png "w=1280&h=720"
#
# tools/png.py reads PNG only, and every map plate ships as .webp, so anything
# that wants to measure a plate has to come through here first. Nothing is
# copied into the game and the output is gitignored: it is a scratch decode.
H="$(cd "$(dirname "$0")" && pwd)"
SRC="$1"; OUT="${2:-decoded.png}"; SIZE="$3"; WAIT="${4:-180}"
mkdir -p "$H/out"
rm -f "$H/out/report.json" "$H/out/$OUT"
python3 "$H/../mapcards/serve.py" "$WAIT" &
SRV=$!
sleep 1
"${CHROMIUM:-/opt/pw-browsers/chromium}" --headless=new --disable-gpu --no-sandbox \
  --force-color-profile=srgb --enable-logging=stderr --v=0 \
  --user-data-dir="$H/profile" \
  "http://127.0.0.1:8901/tools/decode/index.html?src=$SRC&out=$OUT&$SIZE" > "$H/out/browser.log" 2>&1 &
CHROME=$!
wait $SRV
kill $CHROME 2>/dev/null
wait $CHROME 2>/dev/null

#!/bin/bash
# Re-encodes PNGs to WebP in place, at one quality, and checks each result
# against its source before it is kept.
#
#   sh tools/towebp/run.sh 900 public/assets/a.png public/assets/b.png ...
#
# The .webp lands beside the .png; deleting the .png is a separate, deliberate
# step. tools/towebp/report.json carries the per-file numbers.
H="$(cd "$(dirname "$0")" && pwd)"
WAIT="${1:-900}"; shift
rm -f "$H/report.json"
python3 "$H/serve.py" "$WAIT" "$@" &
SRV=$!
sleep 1
# --force-color-profile=srgb so the decode cannot shift colours on the way in;
# the source PNGs carry no ICC profile, so sRGB is what they mean.
"${CHROMIUM:-/opt/pw-browsers/chromium}" --headless=new --disable-gpu --no-sandbox \
  --force-color-profile=srgb --enable-logging=stderr --v=0 \
  --user-data-dir="$H/profile" \
  "http://127.0.0.1:8902/tools/towebp/index.html" > "$H/browser.log" 2>&1 &
CHROME=$!
wait $SRV
STATUS=$?
kill $CHROME 2>/dev/null
wait $CHROME 2>/dev/null
exit $STATUS

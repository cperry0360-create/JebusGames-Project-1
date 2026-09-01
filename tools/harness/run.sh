#!/bin/bash
# Real-time run: the page drives the game and uploads its own screenshots.
H="$(cd "$(dirname "$0")" && pwd)"
S="$1"; WAIT="${2:-120}"; VP="${3:-}"; ARG="${4:-}"
QS=""; [ -n "$VP" ] && QS="&vp=$VP"
# Optional scenario argument, e.g. run.sh stunlock 60 "" deferral
[ -n "$ARG" ] && QS="$QS&arg=$ARG"
rm -f "$H/shots/report.json"
python3 "$H/server.py" wait "$WAIT" &
SRV=$!
sleep 1
"${CHROMIUM:-/opt/pw-browsers/chromium}" --headless=new --disable-gpu --no-sandbox --hide-scrollbars --autoplay-policy=no-user-gesture-required \
  --window-size=1400,900 --enable-logging=stderr --v=0 \
  --user-data-dir="$H/profile" \
  "http://127.0.0.1:8899/index.html?s=$S$QS" > "$H/shots/$S.err" 2>&1 &
CHROME=$!
wait $SRV
kill $CHROME 2>/dev/null
wait $CHROME 2>/dev/null
exit 0

#!/bin/bash
# Real-time run: the page drives the game and uploads its own screenshots.
H="$(cd "$(dirname "$0")" && pwd)"
S="$1"; WAIT="${2:-120}"; VP="${3:-}"; ARG="${4:-}"
QS=""; [ -n "$VP" ] && QS="&vp=$VP"
# Optional scenario argument, e.g. run.sh stunlock 60 "" deferral
[ -n "$ARG" ] && QS="$QS&arg=$ARG"
# INSETS=t,r,b,l fakes a notch, e.g. INSETS=0,0,0,64 for one on the left.
[ -n "$INSETS" ] && QS="$QS&insets=$INSETS"
# ANGLE=90|270 fakes a landscape turn; HOUSING=left|right asserts the edge.
[ -n "$ANGLE" ] && QS="$QS&angle=$ANGLE"
[ -n "$HOUSING" ] && QS="$QS&housing=$HOUSING"
# BAILEY=0..3 forces the dog up at that spot instead of waiting 60-150s.
[ -n "$BAILEY" ] && QS="$QS&bailey=$BAILEY"
rm -f "$H/shots/report.json"
# THE PROFILE GOES EVERY TIME.
#
# Chromium was handed a persistent --user-data-dir and served index.html out
# of its own HTTP cache, so a scenario edited and re-staged ran as it was an
# hour ago. That is the worst kind of harness bug: the run succeeds, prints
# plausible numbers, and describes code that is not on disk. It cost two
# rounds here — a rewritten scenario that "never executed", and a fingerprint
# change that appeared not to have landed.
#
# `both.sh` already did this between its two ratios, which is why the fault
# only ever showed on a single run.
rm -rf "$H/profile"
python3 "$H/server.py" wait "$WAIT" &
SRV=$!
sleep 1
# THE DEFAULT IS 3, and it used to be 1. That default was a blind spot with a
# history: it hid the modal scrim covering only the top-left quadrant, and it
# hid the build ring landing 401px from its pad. Both are invisible at 1,
# because that is the one ratio where canvas pixels and CSS pixels are the same
# number. A phone is not that ratio.
#
# DPR=1 sh run.sh ... to go back, and both.sh runs a scenario at 1 AND 3 and
# fails if the two disagree about anything in screen space.
DPRFLAG="--force-device-scale-factor=${DPR:-3}"
"${CHROMIUM:-/opt/pw-browsers/chromium}" --headless=new --disable-gpu --no-sandbox --hide-scrollbars --autoplay-policy=no-user-gesture-required \
  --window-size=1400,900 --enable-logging=stderr --v=0 $DPRFLAG \
  --user-data-dir="$H/profile" \
  "http://127.0.0.1:8899/index.html?s=$S$QS" > "$H/shots/$S.err" 2>&1 &
CHROME=$!
wait $SRV
kill $CHROME 2>/dev/null
wait $CHROME 2>/dev/null
exit 0

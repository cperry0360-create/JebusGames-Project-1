#!/bin/bash
# Real-time run: the page drives the game and uploads its own screenshots.
H="$(cd "$(dirname "$0")" && pwd)"
S="$1"; WAIT="${2:-120}"; VP="${3:-}"; ARG="${4:-}"
QS=""; [ -n "$VP" ] && QS="&vp=$VP"
# Optional scenario argument, e.g. run.sh stunlock 60 "" deferral
[ -n "$ARG" ] && QS="$QS&arg=$ARG"
# INSETS=t,r,b,l fakes a notch, e.g. INSETS=0,0,0,64 for one on the left.
[ -n "$INSETS" ] && QS="$QS&insets=$INSETS"
# PORTRAIT=startMs,durMs makes matchMedia report portrait for that window, which
# is the standalone-launch transient the iPhone crash report shows.
[ -n "$PORTRAIT" ] && QS="$QS&portrait=$PORTRAIT"
# ANGLE=90|270 fakes a landscape turn; HOUSING=left|right asserts the edge.
[ -n "$ANGLE" ] && QS="$QS&angle=$ANGLE"
[ -n "$HOUSING" ] && QS="$QS&housing=$HOUSING"
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
# THE WINDOW IS THE VIEWPORT, when one is asked for.
#
# It used to be a fixed 1400x900 with the #game element resized inside it, and
# that is fine for everything measured in CSS pixels -- but not for anything
# the BROWSER decides. The rotate gate is a `@media (orientation: portrait)`
# rule, and orientation is a property of the window, not of a div: at
# vp=375x667 inside a 1400x900 window the page is portrait and the window is
# landscape, so the gate never showed and the harness reported the game as
# ungated in portrait. It is gated; the harness was asking the wrong window.
WIN="1400,900"
if [ -n "$VP" ]; then
  # CHROMIUM WILL NOT MAKE A WINDOW NARROWER THAN 500px in this build, so a
  # requested 375x667 comes back as 500x475 -- LANDSCAPE, which is the opposite
  # of what was asked for, and the rotate gate correctly refuses to show. The
  # window is scaled up to the 500 floor keeping the requested ASPECT, so the
  # orientation the media query sees is the orientation under test. The #game
  # element is still sized to the exact viewport, so every layout measured
  # inside it is measured at the real size.
  WIN="$(python3 - "$VP" <<'PYEOF'
import sys
w, h = (int(v) for v in sys.argv[1].split('x'))
if w < 500:
    h = round(h * 500 / w)
    w = 500
print('%d,%d' % (w, h))
PYEOF
)"
fi
# GL=1 asks for a REAL WebGL context instead of the Canvas2D fallback.
#
# The default passes --disable-gpu, and under it Phaser falls back to the
# canvas renderer -- every report from this harness says `renderer = canvas`.
# That is fine for layout and logic, and useless for anything about the drawing
# CONTEXT: you cannot lose a WebGL context that was never created. SwiftShader
# gives a real software GL context, which is enough to drive
# WEBGL_lose_context for real.
GLFLAGS="--disable-gpu"
[ -n "$GL" ] && GLFLAGS="--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader"
"${CHROMIUM:-/opt/pw-browsers/chromium}" --headless=new $GLFLAGS --no-sandbox --hide-scrollbars --autoplay-policy=no-user-gesture-required \
  --window-size="$WIN" --enable-logging=stderr --v=0 $DPRFLAG \
  --user-data-dir="$H/profile" \
  "http://127.0.0.1:8899/index.html?s=$S$QS" > "$H/shots/$S.err" 2>&1 &
CHROME=$!
wait $SRV
# THE SERVER'S EXIT CODE IS THE RUN'S EXIT CODE.
#
# This was `exit 0` unconditionally, which is the outer half of the swallowed
# exception described in index.html: a scenario could throw on its first line,
# assert nothing, and still come back green. server.py now exits 1 when the
# scenario threw, 2 on a timeout, 3 on an unreadable report and 4 when the game
# did not boot, and those have to reach the caller.
STATUS=$?
kill $CHROME 2>/dev/null
wait $CHROME 2>/dev/null
exit $STATUS

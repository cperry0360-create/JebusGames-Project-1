#!/bin/bash
# Downscales a harness screenshot so it can actually be looked at.
#
# Shots are taken at the device ratio, so a 1400x900 window at dpr 3 is a
# 4200x2700 PNG of about 17MB -- too big to open, and the reason the previous
# sessions' "verified" frames were all computed layouts rather than pictures.
# Chromium is the resampler, the same way tools/img.py uses it as a decoder:
# there is no PIL, no ImageMagick and no npm in this environment.
#
#   sh tools/harness/shrink.sh shots/realboot-1400x708.png 900
#   CROP=x,y,w,h sh tools/harness/shrink.sh shots/realboot-1400x708.png 900
#
# CROP is in CSS pixels -- the coordinates the game and the FP lines use --
# not in the shot's physical pixels, so a HUD rectangle from report.json can be
# pasted in as-is at any device ratio.
#
# Writes <name>-small.png beside the input and prints its path and size.
set -e
H="$(cd "$(dirname "$0")" && pwd)"
IN="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
W="${2:-900}"
OUT="${IN%.png}-small.png"
D="$(mktemp -d)"
trap 'rm -rf "$D"' EXIT
cp "$IN" "$D/in.png"
# object-fit is not involved: the img is sized by width and the window is sized
# to match, so Chromium's own downsample is the only resampling in the path.

# Height is discovered from the source's aspect, so the shot has no letterbox.
DIM=$(python3 - "$D/in.png" <<'PY'
import struct, sys
d = open(sys.argv[1], 'rb').read(33)
w, h = struct.unpack('>II', d[16:24])
print('%d %d' % (w, h))
PY
)
SW=$(echo "$DIM" | cut -d' ' -f1); SH=$(echo "$DIM" | cut -d' ' -f2)

if [ -n "${CROP:-}" ]; then
  # The crop is given in CSS pixels and the shot is in physical ones, so the
  # image is first laid out at its CSS size -- which is what makes a rectangle
  # copied straight out of report.json land where it says it does.
  CX=$(echo "$CROP" | cut -d, -f1); CY=$(echo "$CROP" | cut -d, -f2)
  CW=$(echo "$CROP" | cut -d, -f3); CH=$(echo "$CROP" | cut -d, -f4)
  CSSW="${CSSW:-1400}"
  SCALE=$(python3 -c "print(%s/%s)" 2>/dev/null || true)
  WH=$(python3 -c "print(int($W*$CH/$CW))")
  Z=$(python3 -c "print($W/$CW)")
  IW=$(python3 -c "print($CSSW*$Z)")
  cat > "$D/p.html" <<HTML
<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#111;overflow:hidden}
#v{position:relative;width:${W}px;height:${WH}px;overflow:hidden}
img{position:absolute;display:block;width:${IW}px;
    left:calc(-1 * ${CX}px * ${Z});top:calc(-1 * ${CY}px * ${Z})}
</style><div id=v><img src="in.png"></div>
HTML
else
  WH=$(( W * SH / SW ))
  cat > "$D/p.html" <<HTML
<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#000}img{display:block;width:${W}px}
</style><img src="in.png">
HTML
fi
"${CHROMIUM:-/opt/pw-browsers/chromium}" --headless=new --disable-gpu --no-sandbox \
  --hide-scrollbars --force-device-scale-factor=1 \
  --window-size="$W,$WH" --screenshot="$D/out.png" "file://$D/p.html" >/dev/null 2>&1
cp "$D/out.png" "$OUT"
echo "$OUT  ${SW}x${SH}${CROP:+ crop $CROP} -> ${W}x${WH}  $(stat -c%s "$OUT") bytes"

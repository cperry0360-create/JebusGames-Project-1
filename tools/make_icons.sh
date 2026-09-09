#!/bin/bash
# Rasterises the home-screen and manifest icons from the JebusGames logo.
#
# There is no PIL, no ImageMagick and no cwebp in this environment, and npm
# answers 403 so none can be installed. Chromium is here for the harness and it
# already decodes WebP and writes PNG, so it is the rasteriser: a one-page
# document with the logo centred on the game's own ground colour, screenshotted
# at exactly the icon size.
#
# The ground is #10161d, which is the SAME colour as display.json's
# backgroundColor, html/body in index.html and the theme-color meta tag. Those
# four have to agree or iOS shows a band; see the comment in index.html.
#
# Re-run after changing the logo. Output is committed, because the build has no
# way to run this.
set -e
H="$(cd "$(dirname "$0")" && pwd)"
SRC="$(cd "$H/.." && pwd)"
OUT="$SRC/public/icons"
LOGO="$SRC/public/assets/branding/logo_jebusgames.webp"
CHROMIUM="${CHROMIUM:-/opt/pw-browsers/chromium}"
GROUND="#10161d"

[ -f "$LOGO" ] || { echo "no logo at $LOGO" >&2; exit 1; }
mkdir -p "$OUT"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# $1 size, $2 output name, $3 logo width as a percentage of the canvas.
#
# WHY THE PERCENTAGE IS AN ARGUMENT. A maskable icon is cropped by the platform
# to whatever shape it likes -- a circle on some Android launchers -- and only
# the middle 80% is guaranteed to survive. So the maskable variant draws the
# logo smaller, inside that safe zone, while the plain one uses the space.
render() {
  local size="$1" name="$2" pct="$3"
  cat > "$TMP/icon.html" <<HTML
<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;width:${size}px;height:${size}px;background:${GROUND};overflow:hidden}
  .wrap{width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center}
  img{width:${pct}%;height:auto;max-height:${pct}%;object-fit:contain;display:block}
</style><div class="wrap"><img src="file://${LOGO}"></div>
HTML
  "$CHROMIUM" --headless --disable-gpu --no-sandbox --hide-scrollbars \
    --force-device-scale-factor=1 --default-background-color=00000000 \
    --window-size="${size},${size}" \
    --screenshot="$OUT/$name" "file://$TMP/icon.html" >/dev/null 2>&1
  [ -s "$OUT/$name" ] || { echo "FAILED to write $name" >&2; exit 1; }
  echo "  $name  ${size}x${size}  $(stat -c%s "$OUT/$name") bytes"
}

echo "icons -> public/icons/"
render 192 icon-192.png 78
render 512 icon-512.png 78
# Inside the 80% safe zone, with room to spare, so a circular crop keeps it whole.
render 512 icon-maskable-512.png 56
# iOS uses this one for the home screen rather than anything in the manifest.
render 180 apple-touch-icon.png 78

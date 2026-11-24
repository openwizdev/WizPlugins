#!/usr/bin/env sh
# Usage: tools/render/shoot.sh <out-dir> [height]   (run in wizbar/, after `npx bb plugin build .`)
# Writes <view>.html with the real sidebar, then <view>.png at 2x with headless Chromium
# (CHROMIUM names the browser binary, default `chromium`; WIZBAR_RENDER_VIEWS the views).
set -eu
mkdir -p "$1"
out=$(cd "$1" && pwd)
height=${2:-900}
views=${WIZBAR_RENDER_VIEWS:-sidebar,card}
WIZBAR_RENDER_OUT="$out" WIZBAR_RENDER_HEIGHT="$height" WIZBAR_RENDER_VIEWS="$views" \
  npx vitest run --config vitest.config.ts tools/render/render.test.tsx >/dev/null
for view in $(echo "$views" | tr ',' ' '); do
  "${CHROMIUM:-chromium}" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
    --user-data-dir="$(mktemp -d)" --window-size=1100,"$height" --screenshot="$out/$view.png" "file://$out/$view.html" >/dev/null 2>&1
done
ls "$out"

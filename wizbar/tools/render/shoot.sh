#!/usr/bin/env sh
# Usage: tools/render/shoot.sh <out-dir> [height]   (run in wizbar/, after `npx bb plugin build .`)
# Writes <view>.html with the real sidebar, then <view>.png at 2x with headless Chromium.
set -eu
out=$(cd "$(dirname "$1")" && pwd)/$(basename "$1"); height=${2:-900}
WIZBAR_RENDER_OUT="$out" WIZBAR_RENDER_HEIGHT="$height" npx vitest run --config vitest.config.ts tools/render/render.test.tsx >/dev/null
for page in "$out"/*.html; do
  chromium --headless=new --no-sandbox --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
    --user-data-dir="$(mktemp -d)" --window-size=1100,"$height" --screenshot="${page%.html}.png" "file://$page" >/dev/null 2>&1
done
ls "$out"

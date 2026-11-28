const PHONE_FPS_FLOOR = 30;
const BELOW_FLOOR_DURATION_MS = 3_000;

function withinCap(count, cap) {
  return Number.isInteger(count) && Number.isInteger(cap) && count >= 0 && count <= cap;
}

export function withinPhoneSceneCaps(counts, caps) {
  return (
    withinCap(counts?.figures_drawn, caps?.max_figures) &&
    withinCap(counts?.draw_calls, caps?.max_draw_calls) &&
    withinCap(counts?.triangles, caps?.max_triangles)
  );
}

export function createPhoneFrameMonitor() {
  let belowSince;
  let lastBelowAt;

  return {
    observe(timestampMs, fps) {
      if (!Number.isFinite(timestampMs) || !Number.isFinite(fps) || fps < 0 || fps >= PHONE_FPS_FLOOR) {
        belowSince = undefined;
        lastBelowAt = undefined;
        return false;
      }

      if (belowSince === undefined || timestampMs < lastBelowAt) {
        belowSince = timestampMs;
      }
      lastBelowAt = timestampMs;
      return timestampMs - belowSince >= BELOW_FLOOR_DURATION_MS;
    },
  };
}

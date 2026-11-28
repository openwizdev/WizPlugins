export function withinPhoneSceneCaps() {
  return false;
}

export function createPhoneFrameMonitor() {
  return { observe: () => false };
}

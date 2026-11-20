// WizBar 0.6.0 A1 (openwizdev/WizPlugins#186): the activity look,
// specs-section.v1.md section 13. A ticket's dot breathes while a working agent
// names it; every breath runs on one clock (the document timeline), stops under
// reduced motion and pauses while the sidebar can't be seen. A spec with nothing
// running and nothing due now shows its name muted.
import { useEffect, useRef, useState } from "react";
import type { DotStateV4, MatrixStateV4 } from "../fixtures/v4";
import { breathPeriodMsV6 } from "../fixtures/v6";

/** One soft breath: full opacity down to 0.4 and back. */
export const BREATH_KEYFRAMES = [{ opacity: 1 }, { opacity: 0.4 }, { opacity: 1 }];
export const BREATH_TIMING = { duration: breathPeriodMsV6, iterations: Infinity, easing: "ease-in-out" };

/**
 * Section 13: a dot breathes when a `working` agent names its ticket and it is not done. A `review` dot
 * always keeps its steady ring ("nothing else moves"), even when a working agent names it.
 */
export function dotBreathes(
  dot: { ticket: string; state: DotStateV4 },
  agents: readonly { ticket: string | null; matrix: MatrixStateV4 | "working" | "reviewing" | "failed" }[],
): boolean {
  if (dot.state === "done" || dot.state === "done-recent" || dot.state === "review") return false;
  return agents.some((agent) => agent.matrix === "working" && agent.ticket === dot.ticket);
}

/** Section 13: nothing running and nothing due now. Later tickets do not keep a name bright. */
export function nameMuted(row: { agents: readonly unknown[]; needsYou: number }): boolean {
  return row.agents.length === 0 && row.needsYou === 0;
}

const REDUCE = "(prefers-reduced-motion: reduce)";

/** `off` under reduced motion (dots at full opacity); `paused` while the sidebar can't be seen; else `run`. */
export type BreathMode = "run" | "paused" | "off";

/**
 * The section's breath mode, and the ref callback for the section element:
 * `off` under reduced motion, `paused` while the document is hidden or the
 * section is off screen.
 */
export function useBreathMode(): [BreathMode, (element: Element | null) => void] {
  const [reduced, setReduced] = useState(() => typeof window.matchMedia === "function" && window.matchMedia(REDUCE).matches);
  const [hidden, setHidden] = useState(() => document.visibilityState === "hidden");
  const [offScreen, setOffScreen] = useState(false);
  const [element, setElement] = useState<Element | null>(null);
  useEffect(() => {
    const list = typeof window.matchMedia === "function" ? window.matchMedia(REDUCE) : null;
    const motion = () => setReduced(list?.matches ?? false);
    const visibility = () => setHidden(document.visibilityState === "hidden");
    motion();
    visibility();
    list?.addEventListener("change", motion);
    document.addEventListener("visibilitychange", visibility);
    return () => { list?.removeEventListener("change", motion); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  useEffect(() => {
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) setOffScreen(!last.isIntersecting);
    });
    observer.observe(element);
    return () => { observer.disconnect(); setOffScreen(false); };
  }, [element]);
  return [reduced ? "off" : hidden || offScreen ? "paused" : "run", setElement];
}

/**
 * Breathes the element while `breathing`, in the section's `mode`. The
 * animation's start time is the document timeline's zero, so every breath is at
 * the same phase; a pause holds it, and resuming sets that start again, back in
 * step. `off` removes it, leaving full opacity. The element is never remounted:
 * the breath is added and removed in place.
 */
export function useBreath(breathing: boolean, mode: BreathMode) {
  const ref = useRef<HTMLElement>(null);
  const animation = useRef<Animation | null>(null);
  const active = breathing && mode !== "off";
  useEffect(() => {
    if (!active) return;
    return () => { animation.current?.cancel(); animation.current = null; };
  }, [active]);
  useEffect(() => {
    const el = ref.current;
    if (!active || !el || typeof el.animate !== "function") return;
    if (mode === "paused") { animation.current?.pause(); return; }
    if (animation.current) animation.current.play();
    else animation.current = el.animate(BREATH_KEYFRAMES, BREATH_TIMING);
    animation.current.startTime = 0;
  }, [active, mode]);
  return ref;
}

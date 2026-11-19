// The matrix status mark (WB4-2, openwizdev/OpenWiz#1436): a 3 × 3 dot mark
// per specs-section.v1.md section 5, coloured from host theme variables only
// (section 9). Idea credited to Conductor's workspace status matrix.
import { useEffect, useState } from "react";
import { matrixMarksV4, type MatrixStateV4 } from "./fixtures/v4";
import { cn } from "./lib/utils";
import { tokens } from "./specs/theme";

const colours = {
  accent: tokens.accent,
  "muted-accent": tokens.mutedAccent,
  warning: tokens.warning,
  // The contract names no fallback for destructive.
  destructive: "var(--destructive)",
  border: tokens.border,
} as const;

export const matrixWords: Record<MatrixStateV4, string> = {
  working: "Working", reviewing: "Reviewing", "checks-running": "Checks running", "needs-you": "Needs you",
  failed: "Failed", done: "Done", idle: "Idle",
};

const REDUCE = "(prefers-reduced-motion: reduce)";
/** True while the system asks for reduced motion; false where it cannot be read. */
function useReducedMotion(): boolean {
  const query = () => (typeof window.matchMedia === "function" ? window.matchMedia(REDUCE) : null);
  const [reduced, setReduced] = useState(() => query()?.matches ?? false);
  useEffect(() => {
    const list = query();
    if (!list) return;
    const update = () => setReduced(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function MatrixMark({ state, className }: { state: MatrixStateV4; className?: string }) {
  const { mask, colour, animated } = matrixMarksV4[state];
  const reduced = useReducedMotion();
  const moving = animated && !reduced;
  return (
    <span role="img" aria-label={matrixWords[state]} data-matrix={state}
      className={cn("grid size-2.5 shrink-0 grid-cols-3 gap-px", className)}>
      {[...mask].map((bit, index) => {
        const lit = bit === "1";
        return (
          <span key={index} data-animated={moving && lit ? "" : undefined}
            className={cn("rounded-full", moving && lit && "animate-pulse")}
            // A diagonal wave: each dot starts a step after the one above or left of it.
            style={{ background: lit ? colours[colour] : tokens.border, animationDelay: moving && lit ? `${((index % 3) + Math.floor(index / 3)) * 150}ms` : undefined }} />
        );
      })}
    </span>
  );
}

// The matrix status mark: a quiet 3 × 3 dot mark per specs-section.v1.md
// section 5, coloured from host theme variables only (section 9). Idea credited
// to Conductor's workspace status matrix.
import { useEffect, useState } from "react";
import { matrixMarksV4, matrixRingV4, type MatrixColourV4, type MatrixStateV4 } from "./fixtures/v4";
import { cn } from "./lib/utils";
import { tokens } from "./specs/theme";

const colours: Record<MatrixColourV4, string> = {
  accent: tokens.accent,
  "muted-accent": tokens.mutedAccent,
  "muted-text": "var(--muted-foreground, #b7b7b7)",
  warning: tokens.warning,
  // The contract names no fallback for destructive.
  destructive: "var(--destructive)",
  dim: "color-mix(in oklch, var(--muted-foreground, #b7b7b7) 35%, var(--sidebar, #161616))",
  border: tokens.border,
};

/** One chase step, in ms; every working mark steps together, from the clock. */
const STEP = 150;
const ringStep = () => Math.floor(Date.now() / STEP) % matrixRingV4.length;
/** The ring index lit by the working chase, ticking while `active`. */
function useChase(active: boolean): number {
  const [step, setStep] = useState(ringStep);
  useEffect(() => {
    if (!active) return;
    setStep(ringStep());
    const timer = setInterval(() => setStep(ringStep()), STEP);
    return () => clearInterval(timer);
  }, [active]);
  return step;
}

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
  const { mask, colour, motion } = matrixMarksV4[state];
  const reduced = useReducedMotion();
  const chase = motion === "chase" && !reduced;
  const pulse = motion === "pulse" && !reduced;
  const step = useChase(chase);
  // The chase moves the still mask's one lit dot round the ring.
  const lit = (index: number) => (chase ? index === matrixRingV4[step] : mask[index] === "1");
  return (
    <span role="img" aria-label={matrixWords[state]} data-matrix={state}
      className={cn("grid shrink-0 content-center", className)}
      style={{ width: "11px", height: "11px", gridTemplateColumns: "repeat(3, 2.6px)", gap: "1.6px" }}>
      {Array.from({ length: 9 }, (_, index) => {
        const on = lit(index);
        const pulsing = pulse && on;
        return (
          <span key={index} data-animated={(chase && (matrixRingV4 as readonly number[]).includes(index)) || pulsing ? "" : undefined}
            className={cn("rounded-full", pulsing && "animate-pulse")}
            style={{ width: "2.6px", height: "2.6px", background: on ? colours[colour] : tokens.border,
              // The middle row pulses left to right.
              animationDelay: pulsing ? `${(index % 3) * 200}ms` : undefined }} />
        );
      })}
    </span>
  );
}

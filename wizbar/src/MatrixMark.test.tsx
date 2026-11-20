// @vitest-environment jsdom
// WizBar 0.5 D (openwizdev/WizPlugins#113): the quiet matrix marks
// (specs-section.v1.md sections 5 and 9). Synthetic states only.
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { matrixMarksV4, type MatrixStateV4 } from "./fixtures/v4";
import { MatrixMark } from "./MatrixMark";
import { tokens } from "./specs/theme";

// Section 5's colours: section 9's theme tokens (imported, so a token change in
// specs/theme.ts carries through), and the mark's own greys written out.
const ACCENT = tokens.accent;
const DIM = "color-mix(in oklch, var(--muted-foreground, #b7b7b7) 35%, var(--sidebar, #161616))";
const colour = {
  accent: ACCENT,
  "muted-accent": tokens.mutedAccent,
  "muted-text": "var(--muted-foreground, #b7b7b7)",
  warning: tokens.warning,
  destructive: "var(--destructive)",
  dim: DIM,
  faint: "color-mix(in oklch, var(--muted-foreground, #b7b7b7) 65%, var(--sidebar, #161616))",
  bright: "var(--foreground)",
  border: tokens.border,
} as const;
const { bright: BRIGHT, "muted-text": MUTED, faint: FAINT } = colour;

// The ticket's and the lead's still patterns, written out independently of the fixture.
const still: Record<MatrixStateV4, { mask: string; colour: keyof typeof colour }> = {
  working: { mask: "100000000", colour: "bright" },
  "checks-running": { mask: "000111000", colour: "muted-text" },
  reviewing: { mask: "101010101", colour: "muted-text" },
  "needs-you": { mask: "111111111", colour: "warning" },
  failed: { mask: "101010101", colour: "destructive" },
  done: { mask: "111111111", colour: "muted-accent" },
  idle: { mask: "000010000", colour: "faint" },
};
const RING = [0, 1, 2, 5, 8, 7, 6, 3];
const states = Object.keys(still) as MatrixStateV4[];
const dots = () => [...screen.getByRole("img").children] as HTMLElement[];
const paint = () => dots().map((dot) => dot.style.background);
/** The still frame each state shows: its mask in its colour on dim; working adds its tail on dots 3 and 6. */
const stillPaint = (state: MatrixStateV4) => {
  const out = [...still[state].mask].map((bit) => (bit === "1" ? colour[still[state].colour] : DIM));
  if (state === "working") { out[3] = MUTED; out[6] = FAINT; }
  return out;
};

function reducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query === "(prefers-reduced-motion: reduce)", media: query,
    addEventListener() {}, removeEventListener() {},
  }));
}
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("the quiet matrix marks (section 5)", () => {
  it("lists every state, with the still masks and colours", () => {
    expect(Object.keys(matrixMarksV4).sort()).toEqual([...states].sort());
    expect(matrixMarksV4.working.tail).toEqual(["muted-text", "faint"]);
    for (const state of states) expect({ mask: matrixMarksV4[state].mask, colour: matrixMarksV4[state].colour }).toEqual(still[state]);
  });

  // catches: a state drawn with another's mask or colour, unlit dots not on the border colour,
  // or the wrong size. Reduced motion pins the still pattern for every state.
  it.each(states)("draws %s still: its pattern on visible grey, 11 px", (state) => {
    reducedMotion(true);
    render(<MatrixMark state={state} />);
    const mark = screen.getByRole("img");
    expect(mark.getAttribute("data-matrix")).toBe(state);
    expect(mark.style.width).toBe("11px");
    expect(mark.style.height).toBe("11px");
    expect(paint()).toEqual(stillPaint(state));
  });

  // catches: a loud mark: any lime dot, in any state or at any step of the chase.
  it.each(states)("never uses the accent in %s", (state) => {
    vi.useFakeTimers();
    reducedMotion(false);
    render(<MatrixMark state={state} />);
    for (let step = 0; step < 10; step++) {
      expect(paint()).not.toContain(ACCENT);
      act(() => { vi.advanceTimersByTime(150); });
    }
  });

  // catches: the working mark pulsing all its dots, or a chase that skips, reverses or drops its tail.
  it("working: a bright lead with a fading two-dot tail chases clockwise round the ring", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    reducedMotion(false);
    render(<MatrixMark state="working" />);
    const leads: number[] = [];
    for (let step = 0; step < 16; step++) {
      const expected = Array<string>(9).fill(DIM);
      expected[RING[step % 8]] = BRIGHT;
      expected[RING[(step + 7) % 8]] = MUTED;
      expected[RING[(step + 6) % 8]] = FAINT;
      expect(paint()).toEqual(expected);
      leads.push(paint().indexOf(BRIGHT));
      act(() => { vi.advanceTimersByTime(150); });
    }
    expect(leads).toEqual([...RING, ...RING]);
    expect(dots().some((dot) => dot.className.includes("animate-pulse"))).toBe(false);
  });

  // catches: checks running drawn still, or pulsing the wrong row, or in step.
  it("checks running: the middle row pulses, left to right", () => {
    reducedMotion(false);
    render(<MatrixMark state="checks-running" />);
    const pulsing = dots().flatMap((dot, i) => (dot.className.includes("animate-pulse") ? [i] : []));
    expect(pulsing).toEqual([3, 4, 5]);
    expect([3, 4, 5].map((i) => dots()[i].style.animationDelay)).toEqual(["0ms", "200ms", "400ms"]);
  });

  // catches: a still state animated.
  it.each(states.filter((s) => s !== "working" && s !== "checks-running"))("keeps %s still", (state) => {
    vi.useFakeTimers();
    reducedMotion(false);
    render(<MatrixMark state={state} />);
    const before = paint();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(paint()).toEqual(before);
    expect(dots().some((dot) => dot.className.includes("animate-pulse") || dot.hasAttribute("data-animated"))).toBe(false);
  });

  // catches: motion ignoring prefers-reduced-motion.
  it.each(["working", "checks-running"] as const)("shows %s still under reduced motion", (state) => {
    vi.useFakeTimers();
    reducedMotion(true);
    render(<MatrixMark state={state} />);
    const before = paint();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(paint()).toEqual(before);
    expect(dots().some((dot) => dot.className.includes("animate-pulse") || dot.hasAttribute("data-animated"))).toBe(false);
  });
});

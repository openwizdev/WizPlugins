// @vitest-environment jsdom
// WizBar 0.5 D (openwizdev/WizPlugins#113): the quiet matrix marks
// (specs-section.v1.md sections 5 and 9). Synthetic states only.
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { matrixMarksV4, type MatrixStateV4 } from "./fixtures/v4";
import { MatrixMark } from "./MatrixMark";

// Section 5's colours, written out from the contract.
const ACCENT = "var(--primary, #c0ff04)";
const BORDER = "var(--border, #292929)";
const colour = {
  accent: ACCENT,
  "muted-accent": "color-mix(in oklch, var(--primary, #c0ff04) 45%, var(--sidebar, #161616))",
  "muted-text": "var(--muted-foreground, #b7b7b7)",
  warning: "var(--warning, #fc8c45)",
  destructive: "var(--destructive)",
  dim: "color-mix(in oklch, var(--muted-foreground, #b7b7b7) 35%, var(--sidebar, #161616))",
  border: BORDER,
} as const;

// The ticket's still patterns, written out independently of the fixture.
const still: Record<MatrixStateV4, { mask: string; colour: keyof typeof colour }> = {
  working: { mask: "100000000", colour: "accent" },
  "checks-running": { mask: "000111000", colour: "muted-text" },
  reviewing: { mask: "101010101", colour: "muted-text" },
  "needs-you": { mask: "111111111", colour: "warning" },
  failed: { mask: "101010101", colour: "destructive" },
  done: { mask: "111111111", colour: "muted-accent" },
  idle: { mask: "000010000", colour: "dim" },
};
const RING = [0, 1, 2, 5, 8, 7, 6, 3];
const states = Object.keys(still) as MatrixStateV4[];
const dots = () => [...screen.getByRole("img").children] as HTMLElement[];
const paint = () => dots().map((dot) => dot.style.background);
const accentAt = () => paint().flatMap((bg, i) => (bg === ACCENT ? [i] : []));

function reducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query === "(prefers-reduced-motion: reduce)", media: query,
    addEventListener() {}, removeEventListener() {},
  }));
}
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("the quiet matrix marks (section 5)", () => {
  it("lists every state, with the ticket's still masks and colours", () => {
    expect(Object.keys(matrixMarksV4).sort()).toEqual([...states].sort());
    for (const state of states) expect({ mask: matrixMarksV4[state].mask, colour: matrixMarksV4[state].colour }).toEqual(still[state]);
  });

  // catches: a state drawn with another's mask or colour, unlit dots not on the border colour,
  // or the wrong size. Reduced motion pins the still pattern for every state.
  it.each(states)("draws %s still: its mask in its colour, the rest border, 11 px", (state) => {
    reducedMotion(true);
    render(<MatrixMark state={state} />);
    const mark = screen.getByRole("img");
    expect(mark.getAttribute("data-matrix")).toBe(state);
    expect(mark.style.width).toBe("11px");
    expect(mark.style.height).toBe("11px");
    expect(paint()).toEqual([...still[state].mask].map((bit) => (bit === "1" ? colour[still[state].colour] : BORDER)));
  });

  // catches: a loud mark, all nine accent, in any state or at any step of the chase.
  it.each(states)("never lights all nine dots of %s in the accent", (state) => {
    vi.useFakeTimers();
    reducedMotion(false);
    render(<MatrixMark state={state} />);
    for (let step = 0; step < 10; step++) {
      expect(accentAt().length).toBeLessThan(9);
      act(() => { vi.advanceTimersByTime(150); });
    }
  });

  // catches: the working mark pulsing all its dots, or a chase that skips, reverses or leaves a trail.
  it("working: one accent light chases clockwise round the outer ring", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    reducedMotion(false);
    render(<MatrixMark state="working" />);
    const seen: number[] = [];
    for (let step = 0; step < 16; step++) {
      const lit = accentAt();
      expect(lit).toHaveLength(1);
      expect(paint().filter((bg) => bg !== ACCENT).every((bg) => bg === BORDER)).toBe(true);
      seen.push(lit[0]);
      act(() => { vi.advanceTimersByTime(150); });
    }
    expect(seen).toEqual([...RING, ...RING]);
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

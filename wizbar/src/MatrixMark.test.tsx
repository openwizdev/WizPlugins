// @vitest-environment jsdom
// WB4-2 (openwizdev/OpenWiz#1436), S3: the matrix status mark
// (specs-section.v1.md sections 5 and 9). Synthetic states only.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { matrixMarksV4, type MatrixStateV4 } from "./fixtures/v4";
import { MatrixMark } from "./MatrixMark";

const colourVar = { accent: "--primary", "muted-accent": "--primary", warning: "--warning", destructive: "--destructive", border: "--border" } as const;
const states = Object.keys(matrixMarksV4) as MatrixStateV4[];
const dots = () => [...screen.getByRole("img").children] as HTMLElement[];

function reducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query === "(prefers-reduced-motion: reduce)", media: query,
    addEventListener() {}, removeEventListener() {},
  }));
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("S3: the matrix mark (section 5)", () => {
  // catches: a state drawn with another state's mask or colour, or unlit dots in the lit colour.
  it.each(states)("draws %s with its contract mask and colour", (state) => {
    reducedMotion(false);
    render(<MatrixMark state={state} />);
    const { mask, colour } = matrixMarksV4[state];
    expect(screen.getByRole("img").getAttribute("data-matrix")).toBe(state);
    expect(dots().map((dot) => (dot.style.background.includes("--border") ? "0" : "1")).join("")).toBe(mask);
    for (const dot of dots().filter((_, i) => mask[i] === "1")) expect(dot.style.background).toContain(colourVar[colour]);
  });

  // catches: an animated state left still, or a still state (needs you, failed) animated.
  it.each(states)("animates %s only when the contract says so", (state) => {
    reducedMotion(false);
    render(<MatrixMark state={state} />);
    expect(dots().some((dot) => dot.hasAttribute("data-animated"))).toBe(matrixMarksV4[state].animated);
  });

  // catches: the animation ignoring prefers-reduced-motion.
  it.each(states)("shows %s static under reduced motion", (state) => {
    reducedMotion(true);
    render(<MatrixMark state={state} />);
    expect(dots()).toHaveLength(9);
    expect(dots().some((dot) => dot.hasAttribute("data-animated"))).toBe(false);
  });
});

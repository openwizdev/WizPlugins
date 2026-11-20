// WizBar 0.6.0 A1 (openwizdev/WizPlugins#186): which dots breathe, which names
// are muted, and the shared breath (specs-section.v1.md section 13). Expected
// values come from the hand-worked v6 fixtures, never from this code.
import { describe, expect, it } from "vitest";
import { v6Activity, v6Agents, v6DotMotion, v6SpecsFile } from "../fixtures/v6";
import { BREATH_KEYFRAMES, BREATH_TIMING, dotBreathes, nameMuted } from "./breath";

const specOf = (ticket: string) => v6SpecsFile.specs.find((spec) => spec.tickets.some((t) => t.ticket === ticket))!.spec;

describe("A1: only a ticket a working agent names breathes (section 13)", () => {
  // catches: every building dot breathing (0.5's pulse), a reviewed ticket breathing, or a failed agent's ticket breathing.
  it.each(v6DotMotion)("$ticket ($state): $motion, $why", ({ ticket, state, motion }) => {
    const agents = v6Agents[specOf(ticket)] ?? [];
    expect(dotBreathes({ ticket, state }, agents)).toBe(motion === "breath");
  });

  // catches: a done dot breathing because its builder is still finishing, or a ticket in review breathing because a
  // working agent (a fixer, a fleet child) names it; section 13 keeps every review dot a steady ring. Seen in the harness.
  it.each(["done", "done-recent", "review"] as const)("never breathes a %s dot, even when a working agent names it", (state) => {
    const agents = [{ ticket: "example/sample-sort#712", matrix: "working" }] as const;
    expect(dotBreathes({ ticket: "example/sample-sort#712", state }, agents)).toBe(false);
  });
});

describe("A1: inactive names are muted (section 13)", () => {
  // catches: a spec with only later tickets kept bright, or a spec with a running agent muted.
  it.each(v6Activity)("$spec muted: $muted", ({ spec, needsYou, muted }) => {
    expect(nameMuted({ agents: v6Agents[spec] ?? [], needsYou })).toBe(muted);
  });
});

describe("A1: one soft breath every 2 s (section 13)", () => {
  // catches: a faster or livelier pulse, a breath that dims below 0.4, or a linear (non-soft) curve.
  it("goes from full opacity down to 0.4 and back, ease in and out, over 2000 ms, forever", () => {
    expect(BREATH_KEYFRAMES).toEqual([{ opacity: 1 }, { opacity: 0.4 }, { opacity: 1 }]);
    expect(BREATH_TIMING).toEqual({ duration: 2000, iterations: Infinity, easing: "ease-in-out" });
  });
});

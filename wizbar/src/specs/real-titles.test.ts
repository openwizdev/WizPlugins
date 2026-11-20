// 0.5.0 A (openwizdev/WizPlugins#110): real fleet titles find their spec
// (specs-section.v1.md sections 1 and 3), against hand-worked fixtures in
// src/fixtures/v4.ts. The old `Role · CODE:` form keeps matching.
import { describe, expect, it } from "vitest";
import { v4Now, v4RealTitleAgents, v4RealTitleMatching, v4RealTitlesFile, v4RealTitleThreads } from "../fixtures/v4";
import { readSpecsFile } from "./read";
import { matchSpec, specRows } from "./rows";

const fileText = JSON.stringify(v4RealTitlesFile);

describe("the producer's file shape (section 1)", () => {
  // catches: a reader that still demands a hyphen in codes, or refuses the additive `pulls`.
  it("reads codes with no hyphen and each ticket's pulls as ready", () => {
    expect(readSpecsFile({ kind: "content", text: fileText }, v4Now)).toEqual({ status: "ready", file: v4RealTitlesFile });
  });

  // catches: a `pulls` field taken on trust, so a bad number matches a reviewer to the wrong ticket.
  it.each([["a zero", [0]], ["a string", ["951"]], ["a fraction", [9.5]], ["not a list", 951]])("refuses pulls with %s", (_name, pulls) => {
    const file = structuredClone(v4RealTitlesFile) as unknown as { specs: { tickets: Record<string, unknown>[] }[] };
    file.specs[0]!.tickets[1]!.pulls = pulls;
    expect(readSpecsFile({ kind: "content", text: JSON.stringify(file) }, v4Now)).toEqual({ status: "unavailable", reason: "malformed" });
  });
});

describe("real titles under their spec (section 3)", () => {
  // catches: `#N:`, `Review #P at` and fleet children falling out of every spec; the fleet thread listed as an agent.
  it.each(Object.entries(v4RealTitleMatching))("%s", (id, expected) => {
    const row = v4RealTitleThreads.find((t) => t.id === id)!;
    expect(matchSpec(v4RealTitlesFile, row, v4RealTitleThreads)).toBe(expected);
  });

  // catches: a fleet title whose spec name holds ` · KN2:` read as an agent, and its children losing their spec (#122 R4).
  it("a fleet title with an old-form tail is still the fleet, and its child still finds the spec", () => {
    const threads = v4RealTitleThreads.map((t) => (t.id === "thr_rt_fleet" ? { ...t, displayTitle: "Fleet #900: Sample kernel · KN2: rollout" } : t));
    const fleet = threads.find((t) => t.id === "thr_rt_fleet")!;
    const helper = threads.find((t) => t.id === "thr_rt_helper")!;
    expect({ fleet: matchSpec(v4RealTitlesFile, fleet, threads), helper: matchSpec(v4RealTitlesFile, helper, threads) })
      .toEqual({ fleet: null, helper: "example/sample-fleet#900" });
  });

  // catches: a reviewer whose pull closes two tickets of one spec dropped from that spec (#122 R2).
  it("a pull closing two tickets of one spec keeps its reviewer there, with no single ticket", () => {
    const file = structuredClone(v4RealTitlesFile);
    file.specs[0]!.tickets[1]!.pulls = [950, 951];
    const reviewer = v4RealTitleThreads.find((t) => t.id === "thr_rt_reviewer")!;
    expect(matchSpec(file, reviewer, v4RealTitleThreads)).toBe("example/sample-fleet#900");
    const agent = specRows(file, v4RealTitleThreads, [], v4Now).specs[0]!.agents.find((a) => a.threadId === "thr_rt_reviewer");
    expect(agent).toMatchObject({ title: "Review #951 at abc1234", role: "Reviewer", code: null, ticket: null, matrix: "reviewing" });
  });

  // catches: an agent row showing the raw `#902: …` or `Review #951 at …` instead of role, code and the ticket's task.
  it("lists each spec's agents with role, code and the ticket title without its version and code", () => {
    const result = specRows(v4RealTitlesFile, v4RealTitleThreads, [], v4Now);
    expect(Object.fromEntries(result.specs.map((s) => [s.spec, s.agents]))).toEqual(v4RealTitleAgents);
  });
});

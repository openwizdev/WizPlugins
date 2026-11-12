import { describe, expect, it } from "vitest";
import {
  cardLink, cardLinkText, cardMeta, cardModelsNone, childCountLabel, modelLabel, parseIssueNumber,
} from "./card-meta";
import { v3BranchCases, v3CardMeta, v3CardModelsNone, v3PullRequests, v3Threads } from "./fixtures/v3";

const pr = (number: number) => ({ number, url: `https://github.com/example/sample-repo/pull/${number}` });

describe("issue number from the branch name (room/<N>-…)", () => {
  it.each(v3BranchCases)("%s → %s", (branch, expected) => {
    expect(parseIssueNumber(branch)).toBe(expected);
  });
  it("gives nothing for a missing branch", () => {
    expect(parseIssueNumber(undefined)).toBeNull();
  });
});

describe("link chip", () => {
  it.each([
    { name: "PR and issue", link: cardLink(pr(1088), 1042), text: "#1042 → PR #1088" },
    { name: "PR only", link: cardLink(pr(1046), null), text: "PR #1046" },
    { name: "issue only", link: cardLink(null, 1043), text: "#1043" },
  ])("$name reads $text", ({ link, text }) => {
    expect(link).not.toBeNull();
    expect(cardLinkText(link!)).toBe(text);
  });
  it("is absent with neither source", () => {
    expect(cardLink(null, null)).toBeNull();
  });
});

describe("child-count chip", () => {
  it.each([[0, null], [1, "1 child"], [2, "2 children"], [3, "3 children"]] as const)("%i → %s", (count, label) => {
    expect(childCountLabel(count)).toBe(label);
  });
});

describe("model chip", () => {
  it.each([
    ["Opus 5.5", "medium", "Opus 5.5 · Medium"],
    ["Sol 6.1", "high", "Sol 6.1 · High"],
    ["Sol 6.1", "xhigh", "Sol 6.1 · Xhigh"],
    ["Opus 5.5", null, "Opus 5.5"],
    [null, "high", null],
    [null, null, null],
    ["", "high", null],
    ["   ", null, null],
  ] as const)("%s / %s → %s", (model, effort, label) => {
    expect(modelLabel(model, effort)).toBe(label);
  });
});

describe("card metadata over the v3 fixture rows", () => {
  it.each(v3Threads.map((t) => [t.id, t] as const))("%s", (id, thread) => {
    const state = v3PullRequests[id];
    const pull = state?.pullRequest ?? null;
    const model = v3CardModelsNone.items.find((item) => item.threadId === id)!;
    expect(cardMeta(thread, v3Threads, pull, model)).toEqual(v3CardMeta[id]);
  });
  it("uses a host model and effort when served", () => {
    const thread = v3Threads[0]!;
    const meta = cardMeta(thread, v3Threads, null, { model: "Opus 5.5", effort: "medium" });
    expect(meta).toMatchObject({ model: "Opus 5.5", effort: "medium", childCount: 3 });
    expect(meta.link).toEqual({ kind: "issue", issueNumber: 1042, pullRequest: null });
  });
  it("omits effort without a model", () => {
    const meta = cardMeta(v3Threads[0]!, v3Threads, null, { model: null, effort: "high" });
    expect([meta.model, meta.effort]).toEqual([null, null]);
  });
});

describe("cardModels while no host field is adopted", () => {
  it("returns source none and nulls, in input order", () => {
    expect(cardModelsNone(v3Threads.map((t) => t.id))).toEqual(v3CardModelsNone);
  });
});

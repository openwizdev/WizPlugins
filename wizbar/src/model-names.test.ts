// WizBar 0.5.0 B (#111): friendly harness, model and effort names. Expected
// values are the ticket's own table, written out, never derived.
import { describe, expect, it } from "vitest";
import { effortName, harnessName, modelEffortLabel, modelName } from "./model-names";

describe("model names", () => {
  // catches: a raw host id (`claude-opus-5-5`) reaching a card, row or hover card.
  it.each([
    ["claude-opus-5-5", "Opus 5.5"],
    ["claude-sonnet-5-5", "Sonnet 5.5"],
    ["claude-haiku-5-5", "Haiku 5.5"],
    ["claude-fable-5-2", "Fable 5.2"],
    ["gpt-6.1-sol", "Sol 6.1"],
    ["gpt-6.2-sol", "Sol 6.2"],
    ["gpt-6.1-terra", "Terra 6.1"],
  ])("%s → %s", (id, name) => {
    expect(modelName(id)).toBe(name);
  });

  // catches: an unknown id mapped onto a known model, or dropped instead of shown readably.
  it.each([
    ["sample-model-x", "sample-model-x"],
    ["Sample model 2", "Sample model 2"],
    ["  claude-opus-5-5  ", "Opus 5.5"],
    ["claude-opus-5-5-preview", "claude-opus-5-5-preview"],
    ["gpt-6.1-sol-mini", "gpt-6.1-sol-mini"],
  ])("falls back readably: %j → %j", (id, name) => {
    expect(modelName(id)).toBe(name);
  });

  it.each([null, "", "   "])("gives nothing for %j", (id) => {
    expect(modelName(id)).toBeNull();
  });
});

describe("effort names", () => {
  it.each([
    ["low", "Low"], ["medium", "Medium"], ["high", "High"], ["xhigh", "XHigh"], ["max", "Max"],
  ] as const)("%s → %s", (effort, name) => {
    expect(effortName(effort)).toBe(name);
  });
  it("gives nothing for a missing effort", () => {
    expect(effortName(null)).toBeNull();
  });
});

describe("harness names", () => {
  // catches: E's hover card showing `claude-code 2 / codex 4`.
  it.each([
    ["claude-code", "Claude Code"],
    ["codex", "Codex"],
    ["some-new-agent", "Some New Agent"],
    ["cursor_agent", "Cursor Agent"],
  ])("%s → %s", (id, name) => {
    expect(harnessName(id)).toBe(name);
  });
});

describe("model · effort label", () => {
  // catches: a guessed part when one is missing, or the effort shown without a model.
  it.each([
    ["claude-opus-5-5", "high", "Opus 5.5 · High"],
    ["gpt-6.1-sol", "xhigh", "Sol 6.1 · XHigh"],
    ["claude-fable-5-2", null, "Fable 5.2"],
    ["sample-model-x", "max", "sample-model-x · Max"],
    [null, "high", null],
    ["  ", "low", null],
  ] as const)("%s / %s → %s", (model, effort, label) => {
    expect(modelEffortLabel(model, effort)).toBe(label);
  });
});

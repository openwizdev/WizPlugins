import { expect, it } from "vitest";
import { cloudModel } from "./cloud";

it.each([
  ["Codex Sol 6.2 medium effort", "Sol 6.2 · Medium"],
  ["Claude Opus 5.5 Medium", "Opus 5.5 · Medium"],
  ["GPT-6.2-Sol medium effort", "Sol 6.2 · Medium"],
  ["Gemini 4 Neon Medium", "Neon · Medium"],
  ["Claude Code Opus 5.5 Medium", "Opus 5.5 · Medium"],
  ["Antigravity Gemini 4 Neon Medium", "Neon · Medium"],
  ["  Codex Sample Model  ", "Codex Sample Model"],
])("shows %s as %s", (note, expected) => {
  expect(cloudModel(note)).toBe(expected);
});

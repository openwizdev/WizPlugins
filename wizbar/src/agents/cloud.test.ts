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
  ["Antigravity Claude Opus 5.5 Medium", "Opus 5.5 · Medium"],
  ["Codex GPT-6.2-Sol xhigh", "Sol 6.2 · XHigh"],
  ["Cursor Opus 5.5 Medium", "Opus 5.5 · Medium", "Cursor"],
  ["opencode Sol 6.2 low", "Sol 6.2 · Low", "OpenCode"],
  ["Cursor Opus 5.5 Medium", "Cursor Opus 5.5 Medium", "Codex"],
  ["Cursorlike Opus 5.5 Medium", "Cursorlike Opus 5.5 Medium", "Cursor"],
  ["Claude Code Opus 5.5 Medium", "Opus 5.5 · Medium", "Claude"],
  ["Gemini 4 Neon Medium", "Neon · Medium", "Gemini"],
])("shows %s as %s", (note, expected, harness = "") => {
  expect(cloudModel(note, harness)).toBe(expected);
});

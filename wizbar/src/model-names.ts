// Friendly harness, model and effort names (WizBar 0.5.0 B, #111;
// specs-section.v1.md section 6). One place for every surface: cards, agent
// rows, the hover card and `wizbar` JSON. A missing part is omitted, never
// guessed; an id this file does not know is shown as it is.
import type { EffortV3 } from "./v3-types";

const CLAUDE_FAMILIES = new Set(["opus", "sonnet", "haiku", "fable"]);
const GPT_FAMILIES = new Set(["sol", "terra"]);
const title = (word: string) => word[0]!.toUpperCase() + word.slice(1);

/**
 * `claude-<family>-<major>-<minor>` → `<Family> <major>.<minor>`,
 * `gpt-<version>-<family>` → `<Family> <version>`, for the known families
 * only. Anything else is the trimmed id itself; blank is null.
 */
export function modelName(id: string | null | undefined): string | null {
  const trimmed = id?.trim();
  if (!trimmed) return null;
  const claude = /^claude-([a-z]+)-(\d+)-(\d+)$/.exec(trimmed);
  if (claude && CLAUDE_FAMILIES.has(claude[1]!)) return `${title(claude[1]!)} ${claude[2]}.${claude[3]}`;
  const gpt = /^gpt-(\d+(?:\.\d+)?)-([a-z]+)$/.exec(trimmed);
  if (gpt && GPT_FAMILIES.has(gpt[2]!)) return `${title(gpt[2]!)} ${gpt[1]}`;
  return trimmed;
}

const EFFORTS: Partial<Record<EffortV3, string>> = { xhigh: "XHigh" };

/** `low` → `Low`, `xhigh` → `XHigh`; null stays null. */
export function effortName(effort: EffortV3 | null | undefined): string | null {
  if (!effort) return null;
  return EFFORTS[effort] ?? title(effort);
}

const HARNESSES: Record<string, string> = { "claude-code": "Claude Code", codex: "Codex" };

/** `claude-code` → `Claude Code`, `codex` → `Codex`; any other id title-cased word by word. */
export function harnessName(providerId: string): string {
  return HARNESSES[providerId]
    ?? (providerId.split(/[-_\s]+/).filter(Boolean).map(title).join(" ") || providerId);
}

/** `Opus 5.5 · High`, the model alone, or null when the model is missing. */
export function modelEffortLabel(model: string | null | undefined, effort: EffortV3 | null | undefined): string | null {
  const name = modelName(model);
  if (name === null) return null;
  const level = effortName(effort);
  return level ? `${name} · ${level}` : name;
}

/** JSON: keep the raw ids, add `modelLabel` (and `harnessName` beside a `providerId`). */
export function withNames<T extends { model: string | null; effort: EffortV3 | null; providerId?: string }>(
  item: T,
): T & { modelLabel: string | null; harnessName?: string } {
  return {
    ...item,
    modelLabel: modelEffortLabel(item.model, item.effort),
    ...(typeof item.providerId === "string" ? { harnessName: harnessName(item.providerId) } : {}),
  };
}

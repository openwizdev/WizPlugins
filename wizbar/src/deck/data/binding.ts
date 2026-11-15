// Private factory bindings for WizDeck (D1, #73; factory-view.v1.md section 1).
// Set up in the plugin's own settings: one JSON list, never a public file.
// The target is never inferred from the selected thread.
import type { PluginSettingDescriptors } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { needsYouRelativePath, type FactoryBindingV1 } from "../../factory-contract";

export const deckSettingDescriptors = {
  wizdeckFactories: {
    type: "string", label: "WizDeck factories", experimental_multiline: true,
    description: "JSON list of configured factories: projectKey, cloudroomProjectId, repositories, home {hostId, rootPath}, orchestratorThreadId and statusWriterLogin. Stored privately in this plugin's settings.",
  },
  wizdeckGithubToken: {
    type: "string", label: "WizDeck GitHub read token", secret: true,
    description: "A read-only GitHub token. It stays on the plugin backend and is never sent to a panel.",
  },
} satisfies PluginSettingDescriptors;

export interface DeckFactoryV1 {
  binding: FactoryBindingV1;
  /** The fleet manager login whose marker comment is a spec's status. */
  statusWriterLogin: string;
}

const key = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const nonEmpty = z.string().trim().min(1).max(256);
const repository = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+$/);

const factorySchema = z.object({
  projectKey: key,
  cloudroomProjectId: nonEmpty,
  repositories: z.array(repository).min(1).max(10),
  home: z.object({ hostId: nonEmpty, rootPath: z.string().min(1).max(1024) }).strict(),
  orchestratorThreadId: nonEmpty,
  statusWriterLogin: z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(\[bot\])?$/),
}).strict();

export type BindingRead =
  | { ok: true; factories: DeckFactoryV1[] }
  | { ok: false; reason: "not-configured" | "malformed"; detail: string };

/**
 * A home root the queue reader may use: an absolute, already-normal path that
 * is not a filesystem root, with no `.`/`..` segment, empty segment, NUL or
 * `~`. Anything else is a forbidden root: refused before any SDK call.
 */
export function homeRootProblem(rootPath: string): string | null {
  if (rootPath.includes("\0")) return "The home root contains a NUL byte.";
  const windows = /^[A-Za-z]:[\\/]/.test(rootPath);
  if (!rootPath.startsWith("/") && !windows) return "The home root must be an absolute path.";
  const body = windows ? rootPath.slice(3) : rootPath.slice(1);
  const segments = body.split(windows ? /[\\/]/ : "/");
  if (body === "" || segments.every((segment) => segment === "")) return "A filesystem root cannot be a home checkout.";
  if (rootPath.endsWith("/") || rootPath.endsWith("\\")) return "The home root must not end with a separator.";
  if (segments.some((segment) => segment === "" || segment === "." || segment === ".." || segment.startsWith("~"))) {
    return "The home root must be normal: no empty, '.', '..' or '~' segment.";
  }
  return null;
}

/**
 * The queue file may only be the fixed relative path inside the root: never
 * absolute, never with a parent step. Returned paths are checked against the
 * same two forms.
 */
export function queuePathInRoot(rootPath: string, path: string): boolean {
  if (path !== needsYouRelativePath) return false;
  return homeRootProblem(rootPath) === null;
}

/** Whether a host-reported read path is the expected file and nothing else. */
export function isExpectedReadPath(rootPath: string, reported: string): boolean {
  const separator = /^[A-Za-z]:\\/.test(rootPath) ? "\\" : "/";
  const joined = `${rootPath}${separator}${needsYouRelativePath.split("/").join(separator)}`;
  return reported === needsYouRelativePath || reported === joined || reported === `${rootPath}/${needsYouRelativePath}`;
}

/** Parse the private settings value. Unknown fields, duplicates or bad roots fail closed. */
export function readDeckFactories(raw: unknown): BindingRead {
  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) {
    return { ok: false, reason: "not-configured", detail: "No factory is configured yet." };
  }
  if (typeof raw !== "string") return { ok: false, reason: "malformed", detail: "The factories setting is not text." };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "malformed", detail: "The factories setting is not valid JSON." };
  }
  const parsed = z.array(factorySchema).min(1).max(20).safeParse(value);
  if (!parsed.success) return { ok: false, reason: "malformed", detail: "The factories setting does not match the expected shape." };
  const keys = new Set<string>();
  const factories: DeckFactoryV1[] = [];
  for (const { statusWriterLogin, ...binding } of parsed.data) {
    if (keys.has(binding.projectKey)) return { ok: false, reason: "malformed", detail: "Two factories share one projectKey." };
    keys.add(binding.projectKey);
    factories.push({ binding: binding as FactoryBindingV1, statusWriterLogin });
  }
  return { ok: true, factories };
}

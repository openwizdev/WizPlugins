// The Needs-you queue host reader (D1, #73; factory-view.v1.md section 2).
// It reads exactly one file, `.openwiz/needs-you.v1.json`, through the
// configured host's file-read API with an explicit hostId and rootPath. It
// never uses the default host, never assumes a sandbox is mounted, and has no
// write path. Every failure is unavailable, never an empty queue.
import { createHash } from "node:crypto";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import {
  needsYouRelativePath, readNeedsYouQueue, type FactoryBindingV1, type NeedsYouQueueV1,
} from "../../factory-contract";
import { homeRootProblem, isExpectedReadPath } from "./binding";
import { ReadUnavailable, type LoadResult } from "./cache";

export type FileRead = BbPluginApi["sdk"]["files"]["read"];

export interface QueueReadResultV1 {
  queue: NeedsYouQueueV1;
  /** SHA-256 of the exact bytes read, for comparison with producer evidence. */
  sha256: string;
}

const statusOf = (error: unknown): unknown =>
  typeof error === "object" && error !== null ? (error as { status?: unknown; code?: unknown }).status ?? (error as { code?: unknown }).code : undefined;

function decode(content: string, encoding: string): Uint8Array {
  if (encoding === "utf8") return new TextEncoder().encode(content);
  if (encoding === "base64") return Uint8Array.from(Buffer.from(content, "base64"));
  throw new ReadUnavailable("unreadable", "The host returned an unknown content encoding.");
}

/**
 * Read and validate the bound factory's queue. `previousRevision` is the last
 * revision this backend accepted: a lower one is stale.
 */
export async function loadQueue(
  read: FileRead, binding: FactoryBindingV1, context: { now: () => number; previousRevision?: number }, signal?: AbortSignal,
): Promise<LoadResult<QueueReadResultV1>> {
  const { hostId, rootPath } = binding.home;
  if (typeof hostId !== "string" || hostId.trim() === "") throw new ReadUnavailable("not-configured", "No home host is configured.");
  const rootProblem = homeRootProblem(rootPath);
  if (rootProblem) throw new ReadUnavailable("not-configured", `Forbidden home root. ${rootProblem}`);

  let result: Awaited<ReturnType<FileRead>>;
  try {
    result = await read({ hostId, rootPath, path: needsYouRelativePath, signal });
  } catch (error) {
    const status = statusOf(error);
    if (status === 404 || status === "ENOENT" || status === "not_found") {
      throw new ReadUnavailable("missing", "The Needs-you file does not exist in the configured home.");
    }
    throw new ReadUnavailable("unreadable", "The configured home host could not be read (offline, refused or unavailable).");
  }
  if (!result || typeof result !== "object" || typeof result.content !== "string" || typeof result.sha256 !== "string") {
    throw new ReadUnavailable("unreadable", "The host returned an unexpected read result.");
  }
  if (!isExpectedReadPath(rootPath, result.path)) {
    throw new ReadUnavailable("unreadable", "The host returned a different file than the one requested.");
  }
  const bytes = decode(result.content, result.contentEncoding);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== result.sha256.toLowerCase()) throw new ReadUnavailable("unreadable", "The file changed or was corrupted during the read.");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ReadUnavailable("malformed", "The Needs-you file is not UTF-8.");
  }
  const parsed = readNeedsYouQueue(text, {
    projectKey: binding.projectKey, now: context.now(), previousRevision: context.previousRevision,
  });
  if (!parsed.ok) {
    const words: Record<string, string> = {
      malformed: "The Needs-you file is malformed.", "unknown-schema": "The Needs-you file has an unknown schema.",
      "wrong-project": "The Needs-you file belongs to a different project.",
      "duplicate-item": "The Needs-you file repeats an item.", "stale-revision": "The Needs-you file went back to an older revision.",
      expired: "The Needs-you file has expired: its producer has not refreshed it.",
    };
    throw new ReadUnavailable(parsed.reason, words[parsed.reason] ?? parsed.reason);
  }
  return {
    data: { queue: parsed.queue, sha256 },
    complete: parsed.queue.complete,
    gaps: [...parsed.queue.gaps],
  };
}

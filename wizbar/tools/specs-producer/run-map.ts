// @ts-expect-error Node runs this producer directly and requires the source extension.
import { repositoryPattern } from "../../src/agents/format.ts";

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
const positive = (value: number) => Number.isSafeInteger(value) && value > 0;
const builderKey = /^builder:([1-9][0-9]*)$/;
const reviewKey = /^review:(?:([^:#]+\/[^:#]+)#)?([1-9][0-9]*):[0-9a-f]{7,40}$/i;
const runReference = /^run:([1-9][0-9]*)$/;
const compactId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/;

export function runMapPath(value: string): string | null {
  const reference = /^([^#]+)#([1-9][0-9]*)$/.exec(value);
  return reference && repositoryPattern.test(reference[1]) && positive(Number(reference[2]))
    ? `repos/${reference[1]}/issues/comments/${reference[2]}` : null;
}

function idOfRun(value: unknown): string | number | null {
  const entry = record(value);
  const id = entry ? entry.id ?? entry.runId ?? entry.run_id ?? entry.run : value;
  return typeof id === "string" && compactId.test(id) || typeof id === "number" && positive(id) ? id : null;
}

/** The first fenced JSON block is the map. Cache only its normalized references. */
export function slimRunMap(response: unknown): Record<string, unknown>[] {
  const body = record(response)?.body;
  const block = typeof body === "string" ? /^ {0,3}```json[ \t]*\r?\n([\s\S]*?)^ {0,3}```[ \t]*\r?$/im.exec(body) : null;
  if (!block) throw new Error("run map comment has no fenced JSON block");
  const source = record(JSON.parse(block[1]));
  const state = record(source?.state);
  const threads = record(state?.threads);
  const runs = record(source?.runs);
  if (!threads || !runs || typeof state?.repo !== "string" || !repositoryPattern.test(state.repo)) {
    throw new Error("run map comment has no valid state and runs");
  }

  const result: Record<string, unknown>[] = [];
  for (const [key, value] of Object.entries(threads)) {
    const builder = builderKey.exec(key);
    const reviewer = reviewKey.exec(key);
    if (!builder && !reviewer) continue;
    const repository = reviewer?.[1] ?? state.repo;
    const number = Number(builder?.[1] ?? reviewer?.[2]);
    if (!repositoryPattern.test(repository) || !positive(number) || typeof value !== "string") continue;
    const run = runReference.exec(value);
    if (!run && !compactId.test(value)) continue;
    result.push({
      role: builder ? "builder" : "reviewer", repository, number,
      threadId: run ? null : value, run: run ? idOfRun(runs[run[1]]) : null,
    });
  }
  return result;
}

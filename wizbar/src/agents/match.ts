import type { SpecsFileV4 } from "../fixtures/v4";
import type { SpecsThreadRow } from "../specs/rows";
import type { GitHubAgent } from "./format";
import type { AgentsRead } from "./read";

export type UnseenAgents =
  | { status: "ready"; count: number; agents: GitHubAgent[] }
  | { status: "unavailable"; count: null; agents: [] };

export function unseenAgents(
  _read: AgentsRead, _specs: SpecsFileV4 | null, _rows: readonly SpecsThreadRow[] | null, _now: number,
): UnseenAgents {
  return { status: "unavailable", count: null, agents: [] };
}

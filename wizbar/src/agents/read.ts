import type { SpecsFileReadV4 } from "../fixtures/v4";
import type { GitHubAgent } from "./format";

export type AgentsRead = { status: "ready"; agents: GitHubAgent[] } | { status: "unavailable" };

export function readAgentsFile(_read: SpecsFileReadV4, _now: number): AgentsRead {
  return { status: "unavailable" };
}

import type { UnseenAgents } from "./match";

export function agentsSummary(unseen?: UnseenAgents): string {
  return unseen?.status === "ready" && unseen.count > 0 ? ` · ${unseen.count} more on GitHub` : "";
}

export function agentsDisclosure(unseen?: UnseenAgents): string {
  const coverage = "Cloud agents in their own sandbox may be missing from this list.";
  if (unseen?.status !== "ready") return `${coverage} GitHub agent data is unavailable.`;
  if (unseen.authors === "unknown") return `${coverage} GitHub record authors are not set for one or more bound repositories.`;
  return `${coverage} ${unseen.count === 0 ? "None" : unseen.count} seen on GitHub.`;
}

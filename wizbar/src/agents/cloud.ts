import type { MatrixStateV4, SpecsFileV4 } from "../fixtures/v4";
import { effortName } from "../model-names";
import type { EffortV3 } from "../v3-types";
import { relativeTimeLabel } from "../relative-time";
import { isActiveNote, pullPattern, type GitHubAgent } from "./format";
import { issueNumber, unseenSnapshot, type AgentSidebarRow } from "./match";
import type { AgentsRead } from "./read";

const roles = { builder: "Builder", reviewer: "Reviewer", fleet: "Fleet" } as const;
const matrices = { working: "working", asking: "needs-you", done: "done", stopped: "idle" } as const;
const isLive = (agent: Pick<GitHubAgent, "state" | "live">) => agent.live ?? isActiveNote(agent.state);

export function agentMatrix(agent: Pick<GitHubAgent, "state" | "live">): MatrixStateV4 {
  return isActiveNote(agent.state) && !isLive(agent) ? "idle" : matrices[agent.state];
}

const labelFor = (role: keyof typeof roles, repository: string, number: string | number) =>
  `${roles[role]} · ${repository.slice(repository.indexOf("/") + 1)} #${number}`;

const shortLabelFor = (role: keyof typeof roles, number: string | number) =>
  `${roles[role]} · #${number}`;

const modelWords = (value: string) => value.toLowerCase().replace(/[-_\s]+/g, " ").trim();

function knownCloudModel(words: string): string | null {
  return /^(?:gemini\s+[\d.]+\s+)?neon(?:\s|$)/.test(words) ? "Neon"
    : /^(?:gpt\s+)?6\.2\s+sol(?:\s|$)|^sol\s+6\.2(?:\s|$)/.test(words) ? "Sol 6.2"
    : /^(?:claude\s+)?opus\s+5[. ]5(?:\s|$)/.test(words) ? "Opus 5.5" : null;
}

export function cloudModel(value: string, harness?: string): string {
  const trimmed = value.trim();
  const words = modelWords(trimmed);
  const prefix = modelWords(harness ?? "");
  const withoutHarness = prefix && words.startsWith(`${prefix} `) ? words.slice(prefix.length + 1) : "";
  const name = knownCloudModel(withoutHarness) ?? knownCloudModel(words.replace(/^(?:codex|claude(?:\s+code)?|antigravity)\s+/, ""));
  if (!name) return trimmed;
  const effort = /\b(low|medium|high|xhigh|max|ultra)\s*(?:effort)?$/.exec(words)?.[1] as EffortV3 | undefined;
  const level = effortName(effort);
  return level ? `${name} · ${level}` : name;
}

export interface CloudRow {
  label: string;
  shortLabel: string;
  model: string;
  status: string;
  detail: string;
  matrix: MatrixStateV4;
  pull: string | null;
  url: string;
}

export type CloudAgents =
  | { status: "ready"; active: number; rows: CloudRow[]; more: { label: string }[] }
  | { status: "unavailable" };

export function cloudAgents(read: AgentsRead, specs: SpecsFileV4 | null, rows: readonly AgentSidebarRow[] | null, now: number): CloudAgents {
  const snapshot = unseenSnapshot(read, specs, rows);
  if (!snapshot) return { status: "unavailable" };
  const ordered = [...snapshot.agents].sort((a, b) =>
    Number(isLive(b)) - Number(isLive(a))
      || Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || b.commentId - a.commentId,
  );
  const reposByNumber = new Map<string, Set<string>>();
  for (const agent of ordered) {
    const number = issueNumber(agent.ticket);
    const repos = reposByNumber.get(number) ?? new Set<string>();
    repos.add(agent.repository.toLowerCase());
    reposByNumber.set(number, repos);
  }
  const format = (agent: GitHubAgent): CloudRow => {
    const number = issueNumber(agent.ticket);
    const pr = agent.pr ? pullPattern.exec(agent.pr) : null;
    const state = isActiveNote(agent.state) && !isLive(agent) ? "lapsed" : agent.state;
    const label = labelFor(agent.agent, agent.repository, number);
    const shortLabel = (reposByNumber.get(number)?.size ?? 0) > 1 ? label : shortLabelFor(agent.agent, number);
    const model = cloudModel(agent.model, agent.harness);
    const status = `${state} · ${relativeTimeLabel(Date.parse(agent.updatedAt), now)}`;
    return {
      label,
      shortLabel,
      model,
      status,
      detail: `${model} · ${status}`,
      matrix: agentMatrix(agent),
      pull: pr ? `PR #${pr[2]}` : null,
      url: agent.pr ?? `https://github.com/${agent.repository}/issues/${number}`,
    };
  };
  return {
    status: "ready", active: ordered.filter(isLive).length,
    rows: ordered.map(format),
    more: snapshot.more.map(({ role, repository, number }) => ({ label: labelFor(role, repository, number) })),
  };
}

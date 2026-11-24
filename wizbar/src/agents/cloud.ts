import type { MatrixStateV4, SpecsFileV4 } from "../fixtures/v4";
import { relativeTimeLabel } from "../relative-time";
import { isActiveNote, pullPattern, type GitHubAgent } from "./format";
import { issueNumber, unseenSnapshot, type AgentSidebarRow } from "./match";
import type { AgentsRead } from "./read";

const roles = { builder: "Builder", reviewer: "Reviewer", fleet: "Fleet" } as const;
const matrices = { working: "working", asking: "needs-you", done: "done", stopped: "idle" } as const;
const isLive = (agent: GitHubAgent) => agent.live ?? isActiveNote(agent.state);

const labelFor = (role: keyof typeof roles, repository: string, number: string | number) =>
  `${roles[role]} · ${repository.slice(repository.indexOf("/") + 1)} #${number}`;

export function cloudModel(value: string): string {
  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase().replace(/[-_]/g, " ");
  const effort = /\b(low|medium|high|xhigh|max|ultra)\s*(?:effort)?$/.exec(normalized)?.[1];
  const name = /^(?:gemini\s+[\d.]+\s+)?neon(?:\s|$)/.test(normalized) ? "Neon"
    : /^(?:gpt\s+)?6\.2\s+sol(?:\s|$)|^sol\s+6\.2(?:\s|$)/.test(normalized) ? "Sol 6.2"
    : /^(?:claude\s+)?opus\s+5[. ]5(?:\s|$)/.test(normalized) ? "Opus 5.5" : null;
  if (!name) return trimmed;
  return effort ? `${name} · ${effort[0].toUpperCase()}${effort.slice(1)}` : name;
}

export interface CloudRow {
  label: string;
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
  const format = (agent: GitHubAgent): CloudRow => {
    const number = issueNumber(agent.ticket);
    const pr = agent.pr ? pullPattern.exec(agent.pr) : null;
    const state = isActiveNote(agent.state) && !isLive(agent) ? "lapsed" : agent.state;
    return {
      label: labelFor(agent.agent, agent.repository, number),
      detail: `${cloudModel(agent.model)} · ${state} · ${relativeTimeLabel(Date.parse(agent.updatedAt), now)}`,
      matrix: state === "lapsed" ? "idle" : matrices[agent.state],
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

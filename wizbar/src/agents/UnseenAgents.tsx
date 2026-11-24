import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import { GithubIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SpecsFileV4 } from "../fixtures/v4";
import { tokens } from "../specs/theme";
import type { GitHubAgent } from "./format";
import type { UnseenAgents } from "./match";
import { agentsDisclosure, agentsSummary } from "./words";

const quiet = { color: tokens.mutedText } as const;
const roles = { builder: "Builder", reviewer: "Reviewer", fleet: "Fleet" } as const;

export function UnseenSummary({ running, unseen }: { running: number; unseen?: UnseenAgents }) {
  const more = agentsSummary(unseen);
  return more ? <p style={{ margin: 0, flexShrink: 0 }}>{running} running{more}</p> : null;
}

export function UnseenDisclosure({ unseen }: { unseen?: UnseenAgents }) {
  return <p style={{ ...quiet, margin: 0, flexShrink: 0 }}>{agentsDisclosure(unseen)}</p>;
}

export function UnseenAgentRows({ agents }: { agents: readonly GitHubAgent[] }) {
  const navigate = useBbNavigate();
  return agents.map(({ repository, ticket, agent, harness, model, pr }) => {
    const number = ticket.slice(ticket.lastIndexOf("#") + 1);
    const url = pr ?? `https://github.com/${repository}/issues/${number}`;
    return (
      <li key={`${ticket}:${agent}`}>
        <button type="button" className="bg-transparent hover:bg-sidebar-accent/60 focus-visible:ring-1 focus-visible:ring-inset"
          style={{
            appearance: "none", margin: 0, border: 0, borderRadius: 4,
            color: "inherit", font: "inherit", textAlign: "left", width: "100%", padding: "0 4px",
            display: "flex", alignItems: "baseline", flexWrap: "wrap", columnGap: 8, cursor: "pointer",
          }}
          onClick={() => navigate.openUrl(url)}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <HugeiconsIcon icon={GithubIcon} size={12} strokeWidth={1.5} aria-hidden="true" style={quiet} />
            {roles[agent]} · #{number}
          </span>
          <span style={{ ...quiet, marginLeft: "auto", overflowWrap: "anywhere" }}>{harness} · {model}</span>
        </button>
      </li>
    );
  });
}

export function UnseenAgentGroups({ unseen, specs }: { unseen?: UnseenAgents; specs: SpecsFileV4 | null }) {
  if (!unseen?.count) return null;
  const byTicket = new Map<string, string>();
  for (const spec of specs?.specs ?? []) {
    for (const { ticket } of spec.tickets) byTicket.set(ticket.toLowerCase(), spec.spec);
  }
  const groups = new Map<string | null, GitHubAgent[]>();
  for (const agent of unseen.agents) {
    const spec = byTicket.get(agent.ticket.toLowerCase()) ?? null;
    const group = groups.get(spec) ?? [];
    group.push(agent);
    groups.set(spec, group);
  }
  const order = (specs?.specs ?? []).map(({ spec, shortName }) => ({ spec, shortName }));
  return [...order, { spec: null, shortName: "Other" }].map(({ spec, shortName }) => {
    const agents = groups.get(spec);
    if (!agents) return null;
    return (
      <li key={spec ?? "other"} style={{ paddingTop: 4 }}>
        <div style={{ ...quiet, padding: "0 4px" }}>{shortName}</div>
        <ul aria-label={shortName} style={{ listStyle: "none", padding: 0, margin: 0 }}>
          <UnseenAgentRows agents={agents} />
        </ul>
      </li>
    );
  });
}

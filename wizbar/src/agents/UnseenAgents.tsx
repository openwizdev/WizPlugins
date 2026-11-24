import type { CSSProperties } from "react";
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import type { SpecKeyV4, SpecsFileV4 } from "../fixtures/v4";
import { MatrixMark } from "../MatrixMark";
import { tokens } from "../specs/theme";
import { agentMatrix, cloudModel } from "./cloud";
import type { GitHubAgent } from "./format";
import { issueNumber, type UnseenAgents } from "./match";
import { agentsDisclosure } from "./words";

const quiet = { color: tokens.mutedText } as const;
const roles = { builder: "Builder", reviewer: "Reviewer", fleet: "Fleet" } as const;

export function UnseenDisclosure({ unseen }: { unseen?: UnseenAgents }) {
  return <p style={{ ...quiet, margin: 0, flexShrink: 0 }}>{agentsDisclosure(unseen)}</p>;
}

export function UnseenAgentRows({ agents, sharedNumbers, heading, rowStyle, rowClass }: {
  agents: readonly GitHubAgent[];
  sharedNumbers: ReadonlySet<string>;
  heading: string;
  rowStyle: CSSProperties;
  rowClass: string;
}) {
  const navigate = useBbNavigate();
  return agents.map((item) => {
    const { repository, ticket, agent, harness, model, pr } = item;
    const number = issueNumber(ticket);
    const label = `${roles[agent]} · ${sharedNumbers.has(number) ? ticket : `#${number}`}`;
    const url = pr ?? `https://github.com/${repository}/issues/${number}`;
    const details = `${harness} · ${model}`;
    const shortModel = cloudModel(model, harness);
    return (
      <li key={`${ticket}:${agent}`}>
        <button type="button" className={rowClass} style={rowStyle} aria-describedby={heading}
          title={`${label} — ${details}`}
          aria-label={`${label}, ${details}, on GitHub, opens in browser`}
          onClick={() => navigate.openUrl(url)}>
          <MatrixMark state={agentMatrix(item)} />
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, color: tokens.text }}>{label}</span>
          <span style={{
            ...quiet, marginLeft: "auto", paddingLeft: 8, flexShrink: 0, whiteSpace: "nowrap", fontSize: 11,
          }}>{shortModel}</span>
        </button>
      </li>
    );
  });
}

export function agentsBySpec(agents: readonly GitHubAgent[], specs: SpecsFileV4 | null) {
  const byTicket = new Map<string, SpecKeyV4>();
  for (const spec of specs?.specs ?? []) {
    for (const { ticket } of spec.tickets) byTicket.set(ticket.toLowerCase(), spec.spec);
  }
  const groups = new Map<SpecKeyV4 | null, GitHubAgent[]>();
  for (const agent of agents) {
    const spec = byTicket.get(agent.ticket.toLowerCase()) ?? null;
    const group = groups.get(spec) ?? [];
    group.push(agent);
    groups.set(spec, group);
  }
  return groups;
}

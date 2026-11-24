import { z } from "zod";
import type { SpecsFileReadV4 } from "../fixtures/v4";
import { agentKinds, agentLeaseMs, agentStates, agentWindowMs, noteIsLive, publicText, pullPattern, repositoryPattern, runMapRoles, type AgentRun, type GitHubAgent } from "./format";

export type AgentsRead =
  | { status: "ready"; agents: GitHubAgent[]; authors?: "unknown"; runMap?: AgentRun[] | null; archivedIds?: readonly string[] }
  | { status: "unavailable" };

const unavailable: AgentsRead = { status: "unavailable" };
const plain = (max: number) => z.string().refine((value) => publicText(value, max));
const utc = z.iso.datetime();
const utcSeconds = z.iso.datetime({ precision: 0 });
const agentSchema = z.object({
  repository: plain(300).refine((value) => repositoryPattern.test(value)),
  ticket: z.string(),
  agent: z.enum(agentKinds),
  state: z.enum(agentStates),
  live: z.boolean().optional(),
  harness: plain(60),
  model: plain(60),
  step: plain(300),
  time: utcSeconds,
  pr: plain(300).refine((value) => pullPattern.test(value)).optional(),
  updatedAt: utcSeconds,
  commentId: z.int().positive(),
}).strict().refine(({ repository, ticket }) => {
  const number = ticket.slice(repository.length + 1);
  return ticket === `${repository}#${number}` && /^[1-9][0-9]*$/.test(number) && Number.isSafeInteger(Number(number));
});
const referenceId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/);
const runMapSchema = z.object({
  role: z.enum(runMapRoles),
  repository: z.string().regex(repositoryPattern),
  number: z.int().positive(),
  threadId: referenceId.nullable(),
  run: z.union([referenceId, z.int().positive()]).nullable(),
}).strict();
const fileSchema = z.object({
  version: z.literal(1),
  generatedAt: utc,
  authors: z.literal("unknown").optional(),
  agents: z.array(agentSchema),
  runMap: z.array(runMapSchema).nullable().optional(),
}).strict();

export function readAgentsFile(read: SpecsFileReadV4, now: number): AgentsRead {
  if (read.kind !== "content") return unavailable;
  let raw: unknown;
  try { raw = JSON.parse(read.text); } catch { return unavailable; }
  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) return unavailable;
  const age = now - Date.parse(parsed.data.generatedAt);
  if (age >= agentLeaseMs || age < -5 * 60_000) return unavailable;
  const { agents, authors, runMap } = parsed.data;
  return {
    status: "ready", ...(authors ? { authors } : {}), ...(runMap !== undefined ? { runMap } : {}),
    agents: agents.flatMap((agent) => {
      const age = now - Date.parse(agent.updatedAt);
      // Earlier v1 files contain live claims only. New files retain the history window.
      if (age < 0 || age >= (agent.live === undefined ? agentLeaseMs : agentWindowMs)) return [];
      return [agent.live === undefined ? agent : { ...agent, live: noteIsLive(agent, now) }];
    }),
  };
}

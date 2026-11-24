import { z } from "zod";
import type { SpecsFileReadV4 } from "../fixtures/v4";
import { agentKinds, agentLeaseMs, liveStates, publicText, pullPattern, repositoryPattern, type GitHubAgent } from "./format";

export type AgentsRead = { status: "ready"; agents: GitHubAgent[] } | { status: "unavailable" };

const unavailable: AgentsRead = { status: "unavailable" };
const plain = (max: number) => z.string().refine((value) => publicText(value, max));
const utc = z.iso.datetime();
const agentSchema = z.object({
  repository: plain(300).refine((value) => repositoryPattern.test(value)),
  ticket: z.string(),
  agent: z.enum(agentKinds),
  state: z.enum(liveStates),
  harness: plain(60),
  model: plain(60),
  step: plain(300),
  time: utc,
  pr: plain(300).refine((value) => pullPattern.test(value)).optional(),
  updatedAt: utc,
  commentId: z.int().positive(),
}).strict().refine(({ repository, ticket }) => {
  const number = ticket.slice(repository.length + 1);
  return ticket === `${repository}#${number}` && /^[1-9][0-9]*$/.test(number) && Number.isSafeInteger(Number(number));
});
const fileSchema = z.object({
  version: z.literal(1),
  generatedAt: utc,
  authors: z.literal("unknown").optional(),
  agents: z.array(agentSchema),
}).strict();

export function readAgentsFile(read: SpecsFileReadV4, now: number): AgentsRead {
  if (read.kind !== "content") return unavailable;
  let raw: unknown;
  try { raw = JSON.parse(read.text); } catch { return unavailable; }
  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) return unavailable;
  const age = now - Date.parse(parsed.data.generatedAt);
  if (age >= agentLeaseMs || age < -5 * 60_000) return unavailable;
  return { status: "ready", agents: parsed.data.agents.filter(({ updatedAt }) => {
    const age = now - Date.parse(updatedAt);
    return age >= 0 && age < agentLeaseMs;
  }) };
}

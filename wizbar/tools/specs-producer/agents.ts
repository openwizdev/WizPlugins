// @ts-expect-error Node runs this producer directly and requires the source extension.
import { agentKinds, agentLeaseMs, liveStates, publicText, pullPattern, repositoryPattern, type GitHubAgent } from "../../src/agents/format.ts";

const login = "[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*(?:\\[bot\\])?";
export const loginPattern = new RegExp(`^${login}$`);
const authorCell = new RegExp(`^\\s*\`${login}\`(?:\\s*,\\s*\`${login}\`)*\\s*$`);

export function recordAuthors(markdown: string): Set<string> {
  const rows: string[] = [];
  let identity = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith("## ")) identity = line === "## GitHub identity";
    else if (identity && /^\| *Record authors *\|/.test(line)) rows.push(line);
  }
  const cells = rows.length === 1 ? rows[0].split("|") : [];
  if (cells.length !== 4 || cells[3].trim() || !authorCell.test(cells[2])) return new Set();
  return new Set([...cells[2].matchAll(/`([^`]*)`/g)].map((match) => match[1].toLowerCase()));
}

const marker = "<!-- openwiz:status v1 -->";
const required = ["agent", "state", "harness", "model", "skills", "step", "time"] as const;
const optional = ["pr", "preview"] as const;
const skill = "[a-z0-9]+(?:-[a-z0-9]+)*@[0-9]+\\.[0-9]+\\.[0-9]+";
const skillsPattern = new RegExp(`^${skill}(?:, ${skill})*$`);
const previewPattern = /^https:\/\/(?![^/:]*\.(?:local|internal|lan|localhost)(?:[:/]|$))(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}(?::[0-9]{1,5})?(?:\/[^\s"<>?#@\\]*)?$/;
const timePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const validTime = (value: string) => {
  const ms = Date.parse(value);
  return timePattern.test(value) && Number.isFinite(ms) && new Date(ms).toISOString() === value.replace("Z", ".000Z");
};
const positiveInt = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;

type Note = Omit<GitHubAgent, "repository" | "ticket" | "commentId" | "updatedAt">;

function parseNote(body: unknown): Note | null {
  if (typeof body !== "string") return null;
  const [heading, ...lines] = body.split(/\r?\n/);
  if (heading !== marker) return null;
  const fields = new Map<string, string>();
  let nextOptional = 0;
  for (const [index, line] of lines.entries()) {
    const separator = line.indexOf(": ");
    if (separator < 0) return null;
    const key = line.slice(0, separator);
    const value = line.slice(separator + 2);
    if (index < required.length) {
      if (required[index] !== key) return null;
    } else {
      const position = optional.findIndex((field) => field === key);
      if (position < nextOptional) return null;
      nextOptional = position + 1;
    }
    if (!publicText(value, key === "harness" || key === "model" ? 60 : 300)) return null;
    fields.set(key, value);
  }
  if (lines.length < required.length) return null;
  const [agent, state, harness, model, skills, step, time] = required.map((key) => fields.get(key)!);
  const pr = fields.get("pr");
  const preview = fields.get("preview");
  const kind = agentKinds.find((kind) => kind === agent);
  const live = liveStates.find((live) => live === state);
  if (!kind || !live || !skillsPattern.test(skills) || !validTime(time)) return null;
  if ((pr && !pullPattern.test(pr)) || (preview && !previewPattern.test(preview))) return null;
  return { agent: kind, state: live, harness, model, step, time, ...(pr ? { pr } : {}) };
}

/** Cache only valid public fields and the metadata needed to apply the current authors and lease. */
export function slimComment(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object") return [];
  const raw = value as Record<string, unknown>;
  const author = (raw.user as { login?: unknown } | null)?.login;
  const note = parseNote(raw.body);
  const issue = typeof raw.issue_url === "string"
    ? /^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)\/issues\/([1-9][0-9]*)$/.exec(raw.issue_url) : null;
  if (!note || !issue || !repositoryPattern.test(issue[1]) || !publicText(issue[1], 300)
    || !positiveInt(Number(issue[2])) || !positiveInt(raw.id)
    || typeof author !== "string" || !loginPattern.test(author)
    || typeof raw.updated_at !== "string" || !validTime(raw.updated_at)) return [];
  return [{
    repository: issue[1], ticket: `${issue[1]}#${issue[2]}`, ...note,
    updatedAt: raw.updated_at, commentId: raw.id, author: author.toLowerCase(),
  }];
}

export function liveAgents(
  comments: Record<string, unknown>[], repository: string, authors: ReadonlySet<string>, now: Date,
): GitHubAgent[] {
  const claims = new Map<string, GitHubAgent>();
  for (const comment of comments as (Record<string, unknown> & GitHubAgent & { author: string })[]) {
    const { author, ...agent } = comment;
    const age = now.getTime() - Date.parse(agent.updatedAt);
    if (!authors.has(author) || agent.repository.toLowerCase() !== repository.toLowerCase()
      || age >= agentLeaseMs || age < 0) continue;
    const key = `${agent.ticket.toLowerCase()}:${agent.agent}`;
    const earlier = claims.get(key);
    if (!earlier || agent.commentId < earlier.commentId) claims.set(key, agent);
  }
  return [...claims.values()].sort((a, b) => a.commentId - b.commentId);
}

export function slimFleet(body: unknown): Record<string, unknown>[] {
  const file = body as { type?: unknown; encoding?: unknown; content?: unknown } | null;
  if (file?.type !== "file" || file.encoding !== "base64" || typeof file.content !== "string"
    || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.content.replace(/\r?\n/g, ""))) {
    throw new Error("GitHub did not return the fleet file as base64");
  }
  const markdown = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(file.content, "base64"));
  return [...recordAuthors(markdown)].map((author) => ({ author }));
}

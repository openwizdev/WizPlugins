import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { publishFeed } from "../feed/publish.mjs";
import { deriveStates } from "./derive.mjs";
import { readGitHubState } from "./github.mjs";

const RE_REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/;

export function parseArgs(argv) {
  const out = { home: process.cwd(), repo: null, prRepos: [], version: null, budget: 50, gh: "gh", feed: null };
  const next = (i, flag) => { if (i + 1 >= argv.length) throw new Error(`Missing value for ${flag}`); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--home") out.home = next(i++, a);
    else if (a === "--repo") out.repo = next(i++, a);
    else if (a === "--pr-repo") out.prRepos.push(next(i++, a));
    else if (a === "--version") out.version = next(i++, a);
    else if (a === "--budget") out.budget = Number(next(i++, a));
    else if (a === "--gh") out.gh = next(i++, a);
    else if (a === "--feed") out.feed = next(i++, a);
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!out.repo || !RE_REPO.test(out.repo)) throw new Error("--repo must be owner/name");
  if (!out.prRepos.every((r) => RE_REPO.test(r))) throw new Error("--pr-repo must be owner/name");
  if (!Number.isInteger(out.budget) || out.budget < 1) throw new Error("--budget must be a positive integer");
  if (!out.home) throw new Error("--home must be non-empty");
  return out;
}

async function readFeedCards(feedPath) {
  if (!feedPath) return { cards: [], error: null };
  try {
    const raw = JSON.parse(await fs.readFile(feedPath, "utf8"));
    const cards = (Array.isArray(raw?.cards) ? raw.cards : [])
      .filter((c) => typeof c?.id === "string" && typeof c?.repo === "string" && Number.isInteger(c?.number))
      .map((c) => ({ id: c.id, repo: c.repo, number: c.number }));
    return { cards, error: null };
  } catch {
    return { cards: [], error: { kind: "snapshot", ref: "*", source: "needs_owner", reason: "Needs you feed file could not be read." } };
  }
}

export async function produceStates({ home, repo, prRepos = [], version = null, budget = 50, gh = "gh", feed = null, recordAuthors = null, requiredChecks = null, defaultBranch = null, now = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z") }) {
  const feedRead = await readFeedCards(feed);
  const ghState = await readGitHubState({ repo, prRepos, version, limit: budget, gh, recordAuthors, requiredChecks, defaultBranch, needsOwner: feedRead.cards });
  if (feedRead.error) ghState.unavailable.push(feedRead.error);
  const snapshot = deriveStates({ ...ghState, read_at: now() });
  await publishFeed(path.join(home, ".openwiz", "states.v1.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  return snapshot;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const snapshot = await produceStates(parseArgs(process.argv.slice(2)));
  process.stdout.write(`wrote .openwiz/states.v1.json (${snapshot.tickets.length} tickets, ${snapshot.agents.length} agents, ${snapshot.budget.used}/${snapshot.budget.limit} requests)\n`);
}

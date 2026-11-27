// Synthetic factory data, made up, relative to `now`: for the tests and for a
// demo home. Run as a script to write a demo home:
//   node t3/board/fixtures/synthetic.ts <empty folder>
// then: node t3/board/server.ts --home <that folder> --t3 t3/board/fixtures/fake-t3.mjs --t3-project demo
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MIN = 60_000;
const iso = (ms: number) => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(".000Z", "Z");

const t = (n: number, code: string | null, title: string, state: string, extra: Record<string, unknown> = {}) => ({
  ticket: `example/site#${n}`, code, title, state, closedAt: null, ...extra,
});

export function syntheticSpecs(now: number, schema = "openwiz.specs.v2") {
  return {
    schema,
    generatedAt: iso(now - 2 * MIN),
    specs: [
      {
        spec: "example/site#10", shortName: "The reader", url: "https://github.com/example/site/issues/10", fleetThreadId: null,
        tickets: [
          t(11, "RD1", "0.2 RD1: parse the file", "done", { closedAt: iso(now - 3 * 60 * MIN), updatedAt: iso(now - 3 * 60 * MIN) }),
          t(12, "RD2", "0.2 RD2: show the rows", "done", { closedAt: iso(now - 20 * MIN), updatedAt: iso(now - 20 * MIN) }),
          t(13, "RD3", "0.2 RD3: the dots", "building", { pulls: [31], updatedAt: iso(now - 5 * MIN) }),
          t(14, "RD4", "0.2 RD4: review the look", "review", { pulls: [32], updatedAt: iso(now - 9 * MIN) }),
          t(15, "RD5", "0.2 RD5: approve the words", "needs-you", { updatedAt: iso(now - 40 * MIN) }),
          t(16, "RD6", "0.2 RD6: ship it", "yours-later"),
          t(17, "RD7", "0.2 RD7: a later idea", "not-started"),
        ],
      },
      {
        spec: "example/site#20", shortName: "Search", url: "https://github.com/example/site/issues/20", fleetThreadId: null,
        tickets: [
          t(21, "SR1", "0.2 SR1: the index", "done", { closedAt: iso(now - 2 * 24 * 60 * MIN) }),
          t(22, "SR2", "0.2 SR2: the query box", "building", { updatedAt: iso(now - 15 * MIN) }),
          t(23, "SR3", "0.2 SR3: held for a decision", "held"),
          t(24, "SR4", "0.2 SR4: filters", "not-started"),
        ],
      },
      {
        spec: "example/site#40", shortName: "Old docs", url: "https://github.com/example/site/issues/40", fleetThreadId: null,
        tickets: [
          t(41, "DC1", "0.1 DC1: the guide", "done", { closedAt: iso(now - 9 * 24 * 60 * MIN) }),
          t(42, "DC2", "0.1 DC2: the index page", "done", { closedAt: iso(now - 9 * 24 * 60 * MIN) }),
        ],
      },
      { spec: "example/site#50", shortName: "Empty", url: "https://github.com/example/site/issues/50", fleetThreadId: null, tickets: [] },
    ],
  };
}

const note = (ticket: string, agent: string, state: string, ageMin: number, now: number, extra: Record<string, unknown> = {}) => ({
  repository: "example/site", ticket, agent, state, harness: "Codex", model: "gpt-6.1-sol", step: "working on it",
  time: iso(now - ageMin * MIN), updatedAt: iso(now - ageMin * MIN), commentId: 1000 + ageMin, live: state === "working" || state === "asking",
  ...extra,
});

export function syntheticAgents(now: number) {
  return {
    version: 1,
    generatedAt: iso(now - 2 * MIN),
    agents: [
      // A builder running somewhere T3 can't see (another host): the dot of #13 breathes.
      note("example/site#13", "builder", "working", 4, now, { pr: "https://github.com/example/site/pull/31" }),
      // A reviewer on #32, the pull of #14.
      note("example/site#32", "reviewer", "working", 6, now, { harness: "Claude", model: "claude-opus-5-5" }),
      // An expired note: older than the 30 minute lease, so not running.
      note("example/site#22", "builder", "working", 45, now),
      // A ticket in no spec.
      note("example/site#90", "builder", "asking", 3, now),
    ],
  };
}

const thread = (id: string, title: string, status: string, ageMin: number, now: number, extra: Record<string, unknown> = {}) => ({
  threadId: id, projectId: "prj_syn1", title, status, latestRunId: null, providerInstanceId: "codex", model: "gpt-6.1-sol",
  runtimeMode: "full-access", interactionMode: "default", linkedPullRequest: null, settled: false, settledAt: null,
  snoozed: false, snoozedUntil: null, pinned: false, parentThreadId: null, relationshipToParent: null, itemCount: 4,
  createdAt: iso(now - (ageMin + 30) * MIN), updatedAt: iso(now - ageMin * MIN), ...extra,
});

/** What `t3 thread list --json` prints, made up. */
export function syntheticThreads(now: number) {
  return [
    thread("syn-1", "Fleet #20: Search", "running", 1, now, { pinned: true }),
    thread("syn-2", "#22: the query box", "running", 2, now, { parentThreadId: "syn-1" }),
    thread("syn-3", "Plan the next release", "waiting", 8, now),
    thread("syn-4", "Fix the flaky test", "failed", 30, now),
    thread("syn-5", "Read the logs", "completed", 50, now),
    thread("syn-6", "Pinned notes", "idle", 120, now, { pinned: true, providerInstanceId: "claude", model: "claude-opus-5-5" }),
    thread("syn-7", "Settled and done", "waiting", 300, now, { settled: true }),
  ];
}

export function writeHome(home: string, now = Date.now()): void {
  mkdirSync(join(home, ".openwiz"), { recursive: true });
  writeFileSync(join(home, ".openwiz", "specs.v2.json"), `${JSON.stringify(syntheticSpecs(now), null, 2)}\n`);
  writeFileSync(join(home, ".openwiz", "agents.v1.json"), `${JSON.stringify(syntheticAgents(now), null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const home = process.argv[2];
  if (!home) {
    process.stderr.write("usage: node t3/board/fixtures/synthetic.ts <folder>\n");
    process.exit(2);
  }
  writeHome(resolve(home));
  process.stdout.write(`wrote a synthetic factory home in ${resolve(home)}\n`);
}

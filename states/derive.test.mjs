import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { deriveStates, parsePlanLinks } from "./derive.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const statesFixture = JSON.parse(fs.readFileSync(path.join(here, "fixtures/states.json"), "utf8"));
const roundsFixture = JSON.parse(fs.readFileSync(path.join(here, "fixtures/rounds.json"), "utf8"));

function canonical(snapshot) {
  const byNum = (a, b) => a.number - b.number;
  const byName = (a, b) => a.name.localeCompare(b.name);
  const byUnavail = (a, b) =>
    `${a.kind}:${a.ref}:${a.source}:${a.reason}`.localeCompare(`${b.kind}:${b.ref}:${b.source}:${b.reason}`);
  return {
    ...snapshot,
    tickets: [...snapshot.tickets].sort(byNum),
    agents: [...snapshot.agents].sort(byName),
    tracks: [...snapshot.tracks]
      .sort((a, b) => a.spec - b.spec)
      .map((t) => ({
        ...t,
        tickets: [...t.tickets].sort((a, b) => a - b),
        agents: [...t.agents].sort(),
        needs_owner: [...t.needs_owner].sort(),
      })),
    unavailable: [...snapshot.unavailable].sort(byUnavail),
  };
}

function fromFixtureCase(defaults, raw, snapshotMeta) {
  const merged = { ...defaults, ...raw };
  const pr = merged.pull_request
    ? {
        ...merged.pull_request,
        head: raw.head ?? merged.pull_request.head,
        base: merged.pull_request.base ?? merged.default_branch,
      }
    : null;
  return {
    read_at: snapshotMeta.read_at,
    budget: snapshotMeta.budget,
    repo: merged.repo,
    default_branches: { [merged.repo]: merged.default_branch },
    record_authors: merged.record_authors,
    required_checks: { [merged.repo]: merged.required_checks },
    event_time: merged.event_time ?? snapshotMeta.read_at,
    specs: [{ number: merged.spec, state: merged.spec_state ?? "OPEN", closed_at: merged.spec_closed_at ?? null }],
    tickets: [
      {
        number: merged.ticket,
        spec: merged.spec,
        version: merged.version,
        title: merged.title,
        state: merged.issue_state,
        state_reason: merged.issue_state_reason ?? null,
        closed_at: merged.closed_at ?? merged.event_time ?? snapshotMeta.read_at,
        labels: merged.labels ?? [],
        ready_event: merged.ready_event ?? null,
        hard_blockers: merged.hard_blockers ?? [],
        file_blockers: merged.file_blockers ?? [],
        pull_requests: pr ? [pr] : [],
        checks: raw.checks ?? [],
      },
    ],
    comments: raw.comments ?? [],
    needs_owner: raw.needs_owner ?? [],
    unavailable: [],
  };
}

test("derives every case in contracts/fixtures/agent-states/states.json", async (t) => {
  for (const [name, entry] of Object.entries(statesFixture.cases)) {
    await t.test(name, () => {
      const input = fromFixtureCase(statesFixture.github_defaults, entry.github, statesFixture.snapshot);
      const actual = deriveStates(input);
      const expected = { ...statesFixture.snapshot, ...entry.expected };
      assert.deepEqual(canonical(actual), canonical(expected));
    });
  }
});

test("derives every wake and extra case in contracts/fixtures/agent-states/rounds.json", async (t) => {
  for (const entry of [...roundsFixture.wakes, ...roundsFixture.extra_cases]) {
    await t.test(entry.name, () => {
      const meta = {
        read_at: entry.expected.read_at,
        budget: entry.expected.budget,
      };
      const input = fromFixtureCase(roundsFixture.github_defaults, entry, meta);
      const actual = deriveStates(input);
      assert.deepEqual(canonical(actual), canonical(entry.expected));
    });
  }
});

test("ambiguous multiple open closing pull requests mark ticket and builder unavailable", () => {
  const actual = deriveStates({
    read_at: "2030-01-03T13:00:00Z",
    budget: { limit: 50, used: 4 },
    repo: "example/forge",
    default_branches: { "example/forge": "main" },
    record_authors: ["example-bot"],
    required_checks: { "example/forge": ["ci"] },
    event_time: "2030-01-03T12:00:00Z",
    specs: [{ number: 9001, state: "OPEN", closed_at: null }],
    tickets: [
      {
        number: 9101,
        spec: 9001,
        version: "0.2.0",
        title: "Synthetic ambiguous PR ticket",
        state: "OPEN",
        labels: [],
        hard_blockers: [],
        file_blockers: [],
        pull_requests: [
          { repo: "example/forge", number: 9201, state: "OPEN", draft: false, head: "a".repeat(40), merged_at: null, base: "main" },
          { repo: "example/forge", number: 9202, state: "OPEN", draft: false, head: "b".repeat(40), merged_at: null, base: "main" },
        ],
        checks: [],
      },
    ],
    comments: [
      {
        kind: "comment",
        repo: "example/forge",
        number: 9101,
        id: 1002,
        author: "example-bot",
        created_at: "2030-01-03T11:00:00Z",
        updated_at: "2030-01-03T11:00:00Z",
        body: "launch-fleet: start checked, branch builder/9101-synthetic",
      },
    ],
    needs_owner: [],
    unavailable: [],
  });
  assert.deepEqual(actual.tickets, []);
  assert.deepEqual(actual.agents, []);
  assert.deepEqual(actual.tracks, [{ spec: 9001, tickets: [], agents: [], needs_owner: [] }]);
  assert.deepEqual(
    actual.unavailable.map((u) => [u.kind, u.ref, u.source]).sort(),
    [
      ["agent", "builder-9101", "pull_requests"],
      ["ticket", "9101", "pull_requests"],
    ],
  );
});

test("cross-repository reviewer name collision marks both assignments unavailable", () => {
  const head = "a".repeat(40);
  const actual = deriveStates({
    read_at: "2030-01-03T13:00:00Z",
    budget: { limit: 50, used: 6 },
    repo: "example/forge",
    default_branches: { "example/alpha": "main", "example/beta": "main" },
    record_authors: ["example-bot"],
    required_checks: { "example/alpha": ["ci"], "example/beta": ["ci"] },
    event_time: "2030-01-03T12:00:00Z",
    specs: [{ number: 9001, state: "OPEN", closed_at: null }],
    tickets: [
      {
        number: 9101,
        spec: 9001,
        version: "0.2.0",
        title: "Alpha ticket",
        state: "OPEN",
        labels: [],
        hard_blockers: [],
        file_blockers: [],
        pull_requests: [{ repo: "example/alpha", number: 9201, state: "OPEN", draft: false, head, merged_at: null, base: "main" }],
        checks: [{ kind: "check", repo: "example/alpha", number: 9201, id: 1, head, name: "ci", result: "pass", completed_at: "2030-01-03T11:00:00Z" }],
      },
      {
        number: 9102,
        spec: 9001,
        version: "0.2.0",
        title: "Beta ticket",
        state: "OPEN",
        labels: [],
        hard_blockers: [],
        file_blockers: [],
        pull_requests: [{ repo: "example/beta", number: 9201, state: "OPEN", draft: false, head, merged_at: null, base: "main" }],
        checks: [{ kind: "check", repo: "example/beta", number: 9201, id: 2, head, name: "ci", result: "pass", completed_at: "2030-01-03T11:00:00Z" }],
      },
    ],
    comments: [
      { kind: "comment", repo: "example/alpha", number: 9201, id: 101, author: "example-bot", created_at: "2030-01-03T11:05:00Z", updated_at: "2030-01-03T11:05:00Z", body: `launch-fleet: review started ${head}` },
      { kind: "comment", repo: "example/beta", number: 9201, id: 102, author: "example-bot", created_at: "2030-01-03T11:06:00Z", updated_at: "2030-01-03T11:06:00Z", body: `launch-fleet: review started ${head}` },
    ],
    needs_owner: [],
    unavailable: [],
  });
  assert.equal(actual.tickets.length, 2);
  assert.deepEqual(actual.agents, []);
  assert.deepEqual(actual.tracks[0].agents, []);
  assert.equal(actual.unavailable.length, 1);
  assert.equal(actual.unavailable[0].kind, "agent");
  assert.equal(actual.unavailable[0].ref, "reviewer-9201-1");
});

test("ignores untrusted authors and older-head APPROVE verdicts, and preserves reviewer fix across pending head", () => {
  const headA = "a".repeat(40);
  const headB = "b".repeat(40);
  const actual = deriveStates({
    read_at: "2030-01-03T13:00:00Z",
    budget: { limit: 50, used: 5 },
    repo: "example/forge",
    default_branches: { "example/forge": "main" },
    record_authors: ["example-bot"],
    required_checks: { "example/forge": ["ci"] },
    event_time: "2030-01-03T12:00:00Z",
    specs: [{ number: 9001, state: "OPEN", closed_at: null }],
    tickets: [
      {
        number: 9101,
        spec: 9001,
        version: "0.2.0",
        title: "Synthetic ticket",
        state: "OPEN",
        labels: [],
        hard_blockers: [],
        file_blockers: [],
        pull_requests: [{ repo: "example/forge", number: 9201, state: "OPEN", draft: false, head: headB, merged_at: null, base: "main" }],
        checks: [{ kind: "check", repo: "example/forge", number: 9201, id: 10, head: headB, name: "ci", result: "pending" }],
      },
    ],
    comments: [
      { kind: "comment", repo: "example/forge", number: 9101, id: 1, author: "stranger", created_at: "2030-01-03T10:00:00Z", updated_at: "2030-01-03T10:00:00Z", body: "launch-fleet: started" },
      { kind: "comment", repo: "example/forge", number: 9201, id: 2, author: "example-bot", created_at: "2030-01-03T10:30:00Z", updated_at: "2030-01-03T10:30:00Z", body: `launch-fleet: review started ${headA}` },
      { kind: "comment", repo: "example/forge", number: 9201, id: 3, author: "example-bot", created_at: "2030-01-03T10:40:00Z", updated_at: "2030-01-03T10:40:00Z", body: `VERDICT: CHANGES at ${headA}` },
      { kind: "comment", repo: "example/forge", number: 9201, id: 4, author: "stranger", created_at: "2030-01-03T11:00:00Z", updated_at: "2030-01-03T11:00:00Z", body: `VERDICT: APPROVE at ${headB}` },
    ],
    needs_owner: [],
    unavailable: [],
  });
  assert.equal(actual.tickets[0].state, "ci");
  assert.equal(actual.agents.length, 1);
  assert.equal(actual.agents[0].name, "reviewer-9201-1");
  assert.equal(actual.agents[0].state, "fix");
  assert.equal(actual.agents[0].record.id, 3);
});

test("parsePlanLinks distinguishes valid file links from real and malformed links", () => {
  const valid = parsePlanLinks(
    "## Links\n\n- #9102 real: supplies the contract types and fixtures\n- #9103 file: `board-core/rail.ts`\n",
    "example/forge",
  );
  assert.equal(valid.valid, true);
  assert.equal(valid.links.get(9102), "real");
  assert.equal(valid.links.get(9103), "file");

  const badFile = parsePlanLinks("## Links\n\n- #9103 file: no backticked path here\n", "example/forge");
  assert.equal(badFile.links.get(9103), undefined);

  const malformed = parsePlanLinks("## Links\n\nnone\n- #9103 file: `board-core/rail.ts`\n", "example/forge");
  assert.equal(malformed.valid, false);
  assert.equal(malformed.links.size, 0);
});

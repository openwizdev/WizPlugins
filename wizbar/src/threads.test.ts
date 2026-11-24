import { describe, expect, it } from "vitest";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { v3Threads } from "./fixtures/v3";
import { matchesThreadFilters, parseThreadSearch, searchThreadRows, sortThreadRows, threadListCandidates, threadRow } from "./threads";
import { readThreadsFilter, readThreadsSort, type ThreadSort } from "./settings";
import type { CardModelV3 } from "./v3-types";

const sample = (overrides: Partial<PluginSidebarThread>): PluginSidebarThread => ({
  ...v3Threads[0]!, id: "sample", latestAttentionAt: 100, title: "Sample notes", titleFallback: "Find example:key by purpose",
  status: "idle", runtimeStatus: "idle", indicator: "none", queuedWork: "none",
  isUnread: false, hasPendingInteraction: false, parentThreadId: null,
  activity: { workflows: 0, backgroundAgents: 0, backgroundCommands: 0, planMode: 0, goals: 0 },
  ...overrides,
});
const model = (id: string, name: string, effort: CardModelV3["effort"]): CardModelV3 =>
  ({ threadId: id, model: name, effort });
const source = [
  sample({ id: "idle", createdAt: 50, updatedAt: 100, providerId: "claude-code" }),
  sample({ id: "working", createdAt: 10, updatedAt: 90, providerId: "codex", runtimeStatus: "active" }),
  sample({ id: "unread", createdAt: 40, updatedAt: 50, providerId: "codex", isUnread: true }),
  sample({ id: "failed", createdAt: 30, updatedAt: 70, providerId: "claude-code", queuedWork: "failed" }),
  sample({ id: "needs-you", createdAt: 20, updatedAt: 80, providerId: "codex", hasPendingInteraction: true }),
];
const metadata = new Map([
  ["idle", model("idle", "claude-opus-5-5", "medium")],
  ["working", model("working", "gpt-6.2-sol", "high")],
  ["unread", model("unread", "gpt-6.2-sol", "high")],
  ["needs-you", model("needs-you", "gpt-6.2-sol", "low")],
]);
const rowFor = (thread: PluginSidebarThread) => threadRow(thread, "yours", metadata.get(thread.id));

describe("Yours sorting and filters", () => {
  it.each<[ThreadSort, string[]]>([
    ["newest", ["idle", "unread", "failed", "needs-you", "working"]],
    ["activity", ["idle", "working", "needs-you", "failed", "unread"]],
    ["status", ["needs-you", "failed", "working", "unread", "idle"]],
    ["harness", ["idle", "failed", "unread", "needs-you", "working"]],
    ["model", ["idle", "unread", "needs-you", "working", "failed"]],
    ["effort", ["unread", "working", "needs-you", "idle", "failed"]],
  ])("sorts by %s", (sort, ids) => {
    expect(sortThreadRows(source, sort, rowFor).map(({ id }) => id)).toEqual(ids);
  });

  it.each([
    ["example:key by PURPOSE", ["idle", "working", "unread", "failed", "needs-you"]],
    ['harness:"Claude Code"', ["idle", "failed"]],
    ["harness:claude-code", ["idle", "failed"]],
    ['model:"Opus 5.5"', ["idle"]],
    ['model:"Opus 5.5 · Medium"', ["idle"]],
    ["model:claude-opus", ["idle"]],
    ["effort:HIGH", ["working", "unread"]],
    ["status:failed", ["failed"]],
    ["purpose harness:Codex model:Sol effort:high status:working", ["working"]],
    ["harness:codex harness:claude-code", []],
  ])("matches %s", (query, ids) => {
    expect(searchThreadRows(source, parseThreadSearch(query), rowFor).map(({ id }) => id)).toEqual(ids);
  });

  it("combines saved status and harness and has safe defaults for malformed settings", () => {
    expect(readThreadsSort("other")).toBe("newest");
    for (const raw of [undefined, "null", "[]", "broken", '{"status":"failed","harness":5}']) {
      expect(readThreadsFilter(raw)).toEqual({});
    }
    const saved = readThreadsFilter('{"status":"unread","harness":"codex"}');
    expect(source.map(rowFor).filter((row) => matchesThreadFilters(row, saved)).map(({ id }) => id)).toEqual(["unread"]);
  });
});

it("excludes settled, snoozed and muted threads even when listing all sections", () => {
  const threads = [
    sample({ id: "read", isPinned: false }),
    sample({ id: "settled", isPinned: false }),
    sample({ id: "snoozed", isPinned: false }),
    sample({ id: "muted", isPinned: false, runtimeStatus: "active" }),
    sample({ id: "pinned", isPinned: true }),
  ];
  const lifecycle = [
    { threadId: "settled", settledAt: 150, snoozedUntil: null, snoozedAt: null },
    { threadId: "snoozed", settledAt: null, snoozedUntil: 300, snoozedAt: 150 },
    { threadId: "muted", settledAt: null, snoozedUntil: null, snoozedAt: null, mutedAt: 150, muteAttentionAt: 150 },
    { threadId: "pinned", settledAt: 150, snoozedUntil: null, snoozedAt: null },
  ];
  const yours = threadListCandidates(threads, lifecycle, 200, null, [], false, false);
  expect(yours.threads.map(({ id }) => id)).toEqual(["read"]);
  const all = threadListCandidates(threads, lifecycle, 200, null, [], true, false);
  expect(all.threads.map((thread) => [thread.id, all.sectionFor(thread)])).toEqual([["read", "yours"], ["pinned", "pinned"]]);
});

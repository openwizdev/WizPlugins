import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { v4Now, v4RealTitlesFile, v4Threads } from "../fixtures/v4";
import { readSpecsFile } from "../specs/read";
import { rawRow } from "../specs/testing";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "../server";
import { readAgentsFile } from "./read";
import { unseenAgents, unseenSnapshot } from "./match";
import type { GitHubAgent } from "./format";

const repository = "example/sample-fleet";
const specsText = JSON.stringify(v4RealTitlesFile);
const binding = JSON.stringify([{
  projectKey: "sample-factory", cloudroomProjectId: "sample-project", repositories: [repository],
  home: { hostId: "sample-host", rootPath: "/synthetic/home" },
  orchestratorThreadId: "sample-orchestrator", statusWriterLogin: "sample-manager",
}]);
const stamp = (at: number) => new Date(at).toISOString().replace(".000Z", "Z");
const note: GitHubAgent = {
  repository, ticket: `${repository}#902`, agent: "builder", state: "working",
  harness: "Antigravity", model: "Gemini 4 Neon Medium", step: "Ran the fixture",
  time: stamp(v4Now), updatedAt: stamp(v4Now), commentId: 1,
};
const file = (agents: GitHubAgent[] = [note], now = v4Now) => ({ version: 1, generatedAt: new Date(now).toISOString(), agents });
const content = (value: unknown) => ({ kind: "content" as const, text: JSON.stringify(value) });
const parse = (value = file(), now = v4Now) => readAgentsFile(content(value), now);
const specsRead = readSpecsFile({ kind: "content", text: specsText }, v4Now);
const specs = specsRead.status === "ready" ? specsRead.file : null;
const active = v4Threads.find((row) => row.runtimeStatus === "active" && !row.hasPendingInteraction)!;
const row = (displayTitle: string, patch: Partial<typeof active> = {}) => ({ ...active, id: displayTitle, displayTitle, ...patch });

afterEach(() => vi.useRealTimers());

it("distinguishes an empty snapshot from missing, expired, or malformed data", () => {
  expect(parse(file([]))).toEqual({ status: "ready", agents: [] });
  expect(parse(file(), v4Now + 30 * 60_000)).toEqual({ status: "unavailable" });
  expect(readAgentsFile({ kind: "missing" }, v4Now)).toEqual({ status: "unavailable" });
  for (const value of [
    { ...file(), version: 2 },
    { ...file(), extra: true },
    { ...file(), agents: [{ ...note, skills: "build-ticket@0.1.2" }] },
    { ...file(), agents: [{ ...note, pr: "https://sample.example.com" }] },
    { ...file(), agents: [{ ...note, step: "Tested " + "thr" + "_example" }] },
    { ...file(), agents: [{ ...note, ticket: "example/another#902" }] },
  ]) expect(readAgentsFile(content(value), v4Now)).toEqual({ status: "unavailable" });
  expect(parse(file([{ ...note, updatedAt: stamp(v4Now - 30 * 60_000) }])))
    .toEqual({ status: "ready", agents: [] });
});

it("matches visible builders and reviewers by kind and ticket, deduplicating by oldest claim", () => {
  const reviewer = { ...note, agent: "reviewer" as const, pr: `https://github.com/${repository}/pull/950`, commentId: 2 };
  const other = { ...note, ticket: `${repository}#990`, commentId: 3 };
  const read = parse(file([note, { ...note, commentId: 10 }, reviewer, other]));
  expect(unseenAgents(read, specs, [row("#902: Sample work")]))
    .toEqual({ status: "ready", count: 2, agents: [reviewer, other] });
  expect(unseenAgents(read, specs, [row("Review #950 at abcdef0"), row("#990: Sample work")]))
    .toEqual({ status: "ready", count: 1, agents: [note] });
  expect(unseenAgents(read, specs, [row("Builder · KN2: Sample work")]))
    .toEqual({ status: "ready", count: 2, agents: [reviewer, other] });
  expect(unseenAgents(read, null, [row("#902: Sample work", { hasPendingInteraction: true })]))
    .toEqual({ status: "ready", count: 2, agents: [reviewer, other] });
  expect(unseenAgents(read, specs, [row("Builder · KN2: Sample work", { runtimeStatus: "idle" })]))
    .toEqual({ status: "ready", count: 2, agents: [reviewer, other] });
  expect(unseenAgents(read, specs, [row("Review #950 at abcdef0", { hasPendingInteraction: true })]))
    .toEqual({ status: "ready", count: 2, agents: [note, other] });
  expect(unseenAgents(read, specs, [
    row("#902: Sample work", { isHidden: true }), row("#990: Sample work", { isArchived: true }),
  ])).toEqual({ status: "ready", count: 3, agents: [note, reviewer, other] });
});

it("keeps ambiguous numbers in separate repositories", () => {
  const another = { ...note, repository: "example/another", ticket: "example/another#902", commentId: 2 };
  expect(unseenAgents(parse(file([note, another])), null, [row("#902: Sample work")]))
    .toEqual({ status: "ready", count: 2, agents: [note, another] });
});

it("keeps a reviewer note without a PR out of the map's note-free rows for every pull on its ticket", () => {
  const reviewer = { ...note, agent: "reviewer" as const };
  const fileWithPulls = {
    ...v4RealTitlesFile,
    specs: v4RealTitlesFile.specs.map((spec) => ({
      ...spec, tickets: spec.tickets.map((ticket) => ticket.ticket === reviewer.ticket ? { ...ticket, pulls: [950, 952] } : ticket),
    })),
  };
  const runs = [950, 952, 999].map((number) => ({ role: "reviewer" as const, repository, number, threadId: null, run: null }));
  const snapshot = unseenSnapshot({ status: "ready", agents: [reviewer], runMap: runs }, fileWithPulls, []);
  expect(snapshot).toEqual({ agents: [reviewer], more: [runs[2]] });
});

it("serves the absolute bound agents file to RPC and includes its unseen claims in CLI stats", async () => {
  vi.setSystemTime(v4Now);
  const json = JSON.stringify(file([{ ...note, state: "asking" }, { ...note, ticket: `${repository}#990`, commentId: 2 }]));
  const read = vi.fn(async ({ path }: { path: string }) => {
    const content = path.endsWith("/agents.v1.json") ? json : specsText;
    return { path, content, sha256: createHash("sha256").update(content).digest("hex"), contentEncoding: "utf8", sizeBytes: content.length };
  });
  const host = createFakePluginHost({ pluginId: "wizbar", sdk: {
    files: { read },
    threads: { list: vi.fn(async () => [rawRow({ ...active, title: "#902: Sample work", hasPendingInteraction: true })]) },
  } as never });
  try {
    plugin(host.bb);
    await host.harness.behavior.setSettings({ wizdeckFactories: binding });
    expect(await host.harness.behavior.callRpc("agentsFile", {})).toEqual({ kind: "content", text: json });
    const stats = await host.harness.behavior.runCli(["stats", "--json"]);
    expect(JSON.parse(stats.stdout!)).toMatchObject({ running: { total: 0 }, waitingOnYou: 1, unseen: {
      status: "ready", count: 1, agents: [{ ticket: `${repository}#990` }],
    } });
    expect(read.mock.calls.filter(([arg]) => arg.path.endsWith("/agents.v1.json"))).toEqual([
      [expect.objectContaining({ path: expect.stringMatching(/^\/.+\/\.openwiz\/agents\.v1\.json$/) })],
    ]);
    expect((await host.harness.behavior.runCli(["stats"])).stdout).toContain(
      "Cloud agents in their own sandbox may be missing from this list. 1 on GitHub.",
    );
  } finally {
    await host.harness.lifecycle.dispose();
  }
});

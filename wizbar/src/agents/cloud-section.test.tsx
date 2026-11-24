// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, expect, it, vi } from "vitest";
import { ThreadInbox } from "../ThreadInbox";
import { readSectionsOrder } from "../sections";
import { rawRow } from "../specs/testing";
import { v4Now, v4Threads } from "../fixtures/v4";
import plugin from "../server";

const repository = "example/OpenWiz";
const now = new Date(v4Now).toISOString().replace(".000Z", "Z");
const bound = JSON.stringify([{
  projectKey: "sample-factory", cloudroomProjectId: "sample-project", repositories: [repository],
  home: { hostId: "sample-host", rootPath: "/synthetic/home" },
  orchestratorThreadId: "sample-orchestrator", statusWriterLogin: "sample-manager",
}]);
const row = {
  ...v4Threads[0]!, id: "sample-active", title: "Sample desktop work", displayTitle: "Sample desktop work",
  isArchived: false, isHidden: false, isPinned: true,
};
const stamp = (age: number) => new Date(v4Now - age * 60_000).toISOString().replace(".000Z", "Z");
const note = (n: number, state: string, model: string, age: number, more = {}) => ({
  repository, ticket: `${repository}#${n}`, agent: "builder", state, model, live: age < 30,
  updatedAt: stamp(age), time: stamp(age), commentId: n, harness: "Synthetic", step: "Ran the fixture", ...more,
});
const agents = [
  note(15, "done", "Cursor Claude Opus 5.5 xhigh", 2, { live: false, harness: "Cursor" }),
  note(12, "working", "Gemini 4 Neon Medium", 3),
  note(13, "asking", "GPT-6.2-Sol medium effort", 42, { agent: "reviewer", pr: `https://github.com/${repository}/pull/22` }),
  note(14, "asking", "neon", 12),
  note(16, "working", "neon", 1),
  note(17, "working", "neon", 1),
];
const runMap = [
  { role: "builder", repository, number: 16, threadId: "sample-archived", run: null },
  { role: "builder", repository, number: 17, threadId: "sample-active", run: null },
  { role: "reviewer", repository, number: 24, threadId: null, run: "sample-run" },
];
const text = JSON.stringify({ version: 1, generatedAt: now, agents, runMap });
const payload = { kind: "content" as const, text };

afterEach(() => { cleanup(); vi.useRealTimers(); });

it("inserts Cloud agents after Pinned in a stored order and keeps explicitly moved Cloud agents in place", () => {
  expect(readSectionsOrder('["yours","pinned","specs"]')).toEqual(["yours", "pinned", "cloud", "specs"]);
  expect(readSectionsOrder('["cloud","pinned","yours","specs"]')).toEqual(["cloud", "pinned", "yours", "specs"]);
});

it("renders the same Cloud agents as the CLI, including lapsed, finished and note-free entries", async () => {
  vi.setSystemTime(v4Now);
  const rendered = renderSlot({ component: ThreadInbox }, {
    activeThreadId: null, activeProjectId: null, isCompactViewport: false, onNavigate() {}, searchQuery: "",
  }, {
    settings: { wizdeckFactories: bound, sectionsOrder: '["yours","pinned","specs"]' },
    sidebarThreads: { status: "ready", threads: [row, { ...row, id: "sample-archived", isArchived: true }] },
    rpc: {
      listLifecycle: () => ({ rows: [] }), specsFile: () => ({ kind: "missing" }), agentsFile: () => payload,
      agentsArchive: () => ["sample-archived"], cardModels: () => ({ source: "none", items: [] }),
    },
  });
  const section = await screen.findByRole("region", { name: "Cloud agents" });
  const lapsed = within(section).getByRole("button", { name: /lapsed.*on GitHub/ });
  const asking = within(section).getByRole("button", { name: /asking.*on GitHub/ });
  expect(lapsed.querySelector("[data-matrix]")?.getAttribute("data-matrix")).toBe("idle");
  expect(asking.querySelector("[data-matrix]")?.getAttribute("data-matrix")).toBe("needs-you");
  const header = within(section).getByRole("button", { name: "Cloud agents 2" });
  const frame = section.closest("[data-wizbar-section]")!;
  expect(frame.previousElementSibling?.getAttribute("data-wizbar-section")).toBe("pinned");
  const observed = () => within(section).getAllByRole("button", { name: /on GitHub, opens in browser/ }).map((item) => item.textContent);
  expect(observed()).toEqual([
    "Builder · OpenWiz #12Neon · Medium · working · 3m",
    "Builder · OpenWiz #14Neon · asking · 12m",
    "Builder · OpenWiz #15Opus 5.5 · XHigh · done · 2m",
    "Reviewer · OpenWiz #13Sol 6.2 · Medium · lapsed · 42mPR #22",
  ]);
  fireEvent.click(lapsed);
  expect(rendered.navigateCalls).toEqual([{ method: "openUrl", url: `https://github.com/${repository}/pull/22` }]);
  expect(within(section).queryByText("Reviewer · OpenWiz #24")).toBeNull();
  fireEvent.click(within(section).getByText("1 more in the run map with no recent note"));
  expect(within(section).getByText("Reviewer · OpenWiz #24")).toBeDefined();

  const get = vi.fn(async ({ threadId }: { threadId: string }) => ({ archivedAt: threadId === "sample-archived" ? v4Now : null, deletedAt: null }));
  const host = createFakePluginHost({ pluginId: "wizbar", sdk: {
    threads: { list: async () => [rawRow(row)], get },
    files: { read: async ({ path }: { path: string }) => {
      if (!path.endsWith("agents.v1.json")) throw { status: 404 };
      return { path, content: text, contentEncoding: "utf8", sha256: createHash("sha256").update(text).digest("hex"), sizeBytes: text.length };
    } },
  } as never });
  try {
    plugin(host.bb);
    await host.harness.behavior.setSettings({ wizdeckFactories: bound });
    const cli = await host.harness.behavior.runCli(["agents", "--json"]);
    expect(cli.exitCode).toBe(0);
    const result = JSON.parse(cli.stdout!);
    expect(result).toMatchObject({ status: "ready", active: 2, more: [{ label: "Reviewer · OpenWiz #24" }] });
    expect(result.rows.map((item: { label: string; detail: string; pull: string | null }) => item.label + item.detail + (item.pull ?? ""))).toEqual(observed());
    expect(cli.stdout).not.toContain("sample-archived");
    expect((await host.harness.behavior.runCli(["agents"])).stdout).toContain("Neon · Medium · working · 3m");
  } finally {
    await host.harness.lifecycle.dispose();
  }
  fireEvent.click(header);
  expect(within(section).queryByText("Builder · OpenWiz #12")).toBeNull();
});

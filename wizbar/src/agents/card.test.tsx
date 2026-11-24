// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { StatsPanel } from "../StatsPanel";
import { v4Now, v4RealTitlesFile, v4Threads } from "../fixtures/v4";
import type { GitHubAgent } from "./format";

const repository = "example/sample-fleet";
const now = new Date(v4Now).toISOString().replace(".000Z", "Z");
const builder: GitHubAgent = {
  repository, ticket: `${repository}#902`, agent: "builder", state: "working",
  harness: "Antigravity", model: "Gemini 4 Neon Medium", step: "Ran the fixture",
  time: now, updatedAt: now, commentId: 11,
};
const reviewer: GitHubAgent = {
  ...builder, ticket: `${repository}#990`, agent: "reviewer", state: "asking", commentId: 12,
  harness: "Cursor", model: "Sample Model High", pr: `https://github.com/${repository}/pull/952`,
};
const matched: GitHubAgent = { ...builder, ticket: `${repository}#903`, commentId: 13 };
const coverage = "Cloud agents in their own sandbox may be missing from this list.";

function card(agents: readonly GitHubAgent[] | null, generatedAt = now) {
  vi.setSystemTime(v4Now);
  const active = v4Threads.find((row) => row.runtimeStatus === "active" && !row.hasPendingInteraction)!;
  const rows = [{ ...active, parentThreadId: null, displayTitle: "#903: Sample the reader" }];
  const binding = JSON.stringify([{
    projectKey: "sample-factory", cloudroomProjectId: "sample-project", repositories: [repository],
    home: { hostId: "sample-host", rootPath: "/synthetic/home" },
    orchestratorThreadId: "sample-orchestrator", statusWriterLogin: "sample-manager",
  }]);
  return renderSlot({ component: () => <StatsPanel rows={rows} /> }, {}, {
    settings: { wizdeckFactories: binding },
    rpc: {
      specsFile: () => ({ kind: "content", text: JSON.stringify(v4RealTitlesFile) }),
      cardModels: () => ({ source: "none", items: [] }),
      agentsFile: () => agents === null ? { kind: "missing" }
        : { kind: "content", text: JSON.stringify({ version: 1, generatedAt, agents }) },
    },
  });
}

afterEach(() => { cleanup(); vi.useRealTimers(); });

it("counts GitHub rows in the running groups and opens their destinations", async () => {
  const rendered = card([builder, reviewer, matched, { ...builder, commentId: 14 }]);
  const panel = screen.getByRole("region", { name: "Running threads" });
  const groups = within(panel).getByRole("list", { name: "Threads" });
  const specHeader = await within(groups).findByRole("button", { name: "Sample kernel 2" });
  const otherHeader = within(groups).getByRole("button", { name: "Other 1" });
  expect(panel.querySelector("p")?.textContent).toBe("1 awake · 0 starting · 0 asleep · 2 more on GitHub");
  const spec = document.getElementById(specHeader.getAttribute("aria-controls")!)!;
  const other = document.getElementById(otherHeader.getAttribute("aria-controls")!)!;
  expect(within(spec).getByRole("button", { name: "Working Builder · KN3" })).toBeDefined();
  fireEvent.click(specHeader);
  expect(within(spec).queryByRole("button", { name: /Builder · #902/ })).toBeNull();
  fireEvent.click(specHeader);
  fireEvent.click(within(spec).getByRole("button", { name: /Builder · #902.*Antigravity · Gemini 4 Neon Medium/ }));
  fireEvent.click(within(other).getByRole("button", { name: /Reviewer · #990.*Cursor · Sample Model High/ }));
  expect(rendered.navigateCalls).toEqual([
    { method: "openUrl", url: `https://github.com/${repository}/issues/902` },
    { method: "openUrl", url: reviewer.pr },
  ]);
  expect(screen.queryByText(builder.step)).toBeNull();
  expect(screen.queryByText("Builder · #903")).toBeNull();
  expect(screen.getByRole("region", { name: "Running threads" }).lastElementChild?.textContent)
    .toBe(`${coverage} 2 seen on GitHub.`);
});

it("shows the coverage line for a ready empty file", async () => {
  card([]);
  expect(await screen.findByText(`${coverage} None seen on GitHub.`)).toBeDefined();
  expect(screen.queryByText(/more on GitHub/)).toBeNull();
});

it.each([
  [null, now],
  [[builder], new Date(v4Now - 30 * 60_000).toISOString()],
] as const)("shows only the coverage line for unavailable data", async (agents, at) => {
  card(agents, at);
  expect(await screen.findByText(coverage)).toBeDefined();
  expect(screen.queryByText(/seen on GitHub\.|more on GitHub/)).toBeNull();
});

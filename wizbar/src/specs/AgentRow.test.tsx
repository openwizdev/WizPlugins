// @vitest-environment jsdom
// WB4-2 (openwizdev/OpenWiz#1436), S3: a running agent inside an open spec
// (specs-section.v1.md sections 3, 5 and 6). Every row is synthetic.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarPullRequest } from "@get-bb/plugin-sdk/app";
import { v4Now, v4PullRequests, v4SpecRows, v4Threads } from "../fixtures/v4";
import { AgentRow, type AgentRowProps } from "./AgentRow";

const [builder, reviewer] = v4SpecRows.specs[0]!.agents as [AgentRowProps["agent"], AgentRowProps["agent"]];
type Models = (input: { threadIds: string[] }) => unknown;
const served = (model: string | null, effort: string | null): Models => ({ threadIds }) =>
  ({ source: "host", items: threadIds.map((threadId) => ({ threadId, model, effort })) });

function show(agent = builder, cardModels: Models = served(null, null), pullRequests: Record<string, PluginSidebarPullRequest> = {}) {
  const props: AgentRowProps = { agent, thread: v4Threads.find((t) => t.id === agent.threadId), now: v4Now, isActive: false, onNavigate() {} };
  const rendered = renderSlot({ component: AgentRow }, props, { rpc: { cardModels } as never, sidebarPullRequests: pullRequests });
  return { rendered, row: () => screen.getByText(agent.title).closest("li")! };
}
afterEach(cleanup);

describe("S3: the agent row (sections 3, 5 and 6)", () => {
  // catches: a reviewer drawn as working, or the age or title missing from the row.
  it("shows the matrix mark, title and age", () => {
    const { row } = show(reviewer);
    expect(within(row()).getByRole("img", { name: "Reviewing" }).getAttribute("data-matrix")).toBe("reviewing");
    expect(within(row()).getByText("50m")).toBeTruthy();
  });

  // catches: the quiet second line dropping a served model or effort.
  it("shows the harness logo, then model and effort when present", async () => {
    const { row } = show(builder, served("Sample model 2", "xhigh"));
    const line = await within(row()).findByText("Sample model 2 · Xhigh");
    expect(line.closest("[data-agent-meta]")!.querySelector("[data-provider]")?.getAttribute("data-provider")).toBe("harness-a");
  });

  // catches: a guessed model, a lone effort, or placeholder text when the source has nothing.
  it.each([["no model", served(null, "high")], ["source none", (({ threadIds }) => ({ source: "none", items: threadIds.map((threadId) => ({ threadId, model: null, effort: null })) })) as Models]])(
    "omits model and effort for %s", async (_name, models) => {
      const { rendered, row } = show(builder, models);
      await waitFor(() => expect(rendered.inspection.rpcCalls.length).toBeGreaterThan(0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const meta = row().querySelector("[data-agent-meta]")!;
      expect(meta.querySelector("[data-provider]")).toBeTruthy();
      expect(meta.textContent).not.toMatch(/·|High|Unknown|model/i);
    });

  // catches: a click that opens nothing, or the wrong thread.
  it("opens its thread on click", () => {
    const { rendered, row } = show();
    fireEvent.click(within(row()).getByRole("link"));
    expect(rendered.inspection.sidebarActionCalls).toContainEqual(expect.objectContaining({ threadId: builder.threadId }));
  });

  // catches: the GitHub mark shown without hover or without a pull request, or opening the wrong URL.
  it("swaps the age for a GitHub mark on hover when it has a pull request", () => {
    const pr = v4PullRequests.thr_v4_builder_a!;
    const { rendered, row } = show(builder, served(null, null), { thr_v4_builder_a: pr });
    expect(within(row()).queryByRole("button", { name: /GitHub/ })).toBeNull();
    expect(within(row()).getByText("2h")).toBeTruthy();
    fireEvent.pointerEnter(row());
    expect(within(row()).queryByText("2h")).toBeNull();
    fireEvent.click(within(row()).getByRole("button", { name: /GitHub/ }));
    expect(rendered.inspection.navigateCalls).toContainEqual({ method: "openUrl", url: pr.url });
    cleanup();
    const other = show(reviewer);
    fireEvent.pointerEnter(other.row());
    expect(within(other.row()).queryByRole("button", { name: /GitHub/ })).toBeNull();
    expect(within(other.row()).getByText("50m")).toBeTruthy();
  });
});

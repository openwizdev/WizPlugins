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

// A synthetic provider directory: one provider with a host logo, one with a registered glyph.
const directory = [
  { id: "harness-b", displayName: "Harness B", logoUrl: "/api/v1/system/providers/harness-b/logo", icon: null },
  { id: "harness-c", displayName: "Harness C", logoUrl: null, icon: { glyph: "Sample glyph" } },
];

function show(agent = builder, cardModels: Models = served(null, null), pullRequests: Record<string, PluginSidebarPullRequest> = {}, providers: readonly object[] = []) {
  const props: AgentRowProps = { agent, thread: v4Threads.find((t) => t.id === agent.threadId), now: v4Now, isActive: false, onNavigate() {} };
  const rendered = renderSlot({ component: AgentRow }, props,
    { rpc: { cardModels } as never, sidebarPullRequests: pullRequests, providers: { status: "ready", providers: providers as never } });
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
    const line = await within(row()).findByText("Sample model 2 · XHigh");
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

  // catches (#1550): a provider the host directory knows drawn as a generic dot without its name,
  // or an unknown provider drawn as some other provider's artwork.
  it("draws the host's logo or glyph and display name, and a neutral dot for an unknown provider", () => {
    const meta = (agent: AgentRowProps["agent"]) => {
      cleanup();
      return show(agent, served(null, null), {}, directory).row().querySelector("[data-agent-meta]")!;
    };
    const logo = meta(reviewer);
    expect(logo.querySelector('[data-provider-id="harness-b"]')?.getAttribute("data-provider-logo")).toBe("/api/v1/system/providers/harness-b/logo");
    expect(logo.textContent).toContain("Harness B");
    const glyph = meta({ ...reviewer, providerId: "harness-c" });
    expect(glyph.querySelector('[data-provider-id="harness-c"]')?.getAttribute("data-provider-glyph")).toBe("Sample glyph");
    expect(glyph.textContent).toContain("Harness C");
    const unknown = meta(builder);
    expect(unknown.querySelector("[data-provider-id]")).toBeNull();
    expect(within(unknown as HTMLElement).getByRole("img", { name: "harness-a" })).toBeTruthy();
  });

  // catches (#1551): any part of the trailing slot stacked over the stretched link that is not the
  // GitHub button itself (the age, or the empty space beside the button), so a click there opens
  // nothing; or a click-through fix applied to the button too, so it can't be clicked.
  // jsdom has no hit-testing, so this computes the region a browser lets take a click above the
  // stretched link: elements under a positioned (`relative`/`absolute`) box inside the row whose
  // nearest `pointer-events-*` class is not `none`. That region must be exactly the button.
  // It cannot prove sizes, z-order between siblings or the host's CSS; it reads only these rules.
  it("lets a click anywhere but the GitHub button reach the thread link", () => {
    const capturing = (li: Element) => [...li.querySelectorAll("*")].filter((el) => {
      let positioned = false;
      let events: "auto" | "none" | null = null;
      for (let at: Element | null = el; at && at !== li; at = at.parentElement) {
        if (at.classList.contains("relative") || at.classList.contains("absolute")) positioned = true;
        if (events === null && at.classList.contains("pointer-events-none")) events = "none";
        if (events === null && at.classList.contains("pointer-events-auto")) events = "auto";
      }
      return positioned && events !== "none";
    });
    const { rendered, row } = show(reviewer);
    expect(capturing(row())).toEqual([]);
    fireEvent.click(within(row()).getByRole("link"));
    expect(rendered.inspection.sidebarActionCalls).toEqual([expect.objectContaining({ threadId: reviewer.threadId })]);
    cleanup();
    const pr = v4PullRequests.thr_v4_builder_a!;
    const other = show(builder, served(null, null), { thr_v4_builder_a: pr });
    fireEvent.pointerEnter(other.row());
    const button = within(other.row()).getByRole("button", { name: /GitHub/ });
    expect(capturing(other.row())).toEqual([button, ...button.querySelectorAll("*")]);
    fireEvent.click(button);
    expect(other.rendered.inspection.navigateCalls).toEqual([{ method: "openUrl", url: pr.url }]);
    expect(other.rendered.inspection.sidebarActionCalls).toEqual([]);
  });

  // catches (#1552): pointer leave hiding the GitHub action while keyboard focus is still in the row.
  it("keeps the GitHub action while focus is in the row after the pointer leaves", () => {
    const pr = v4PullRequests.thr_v4_builder_a!;
    const { row } = show(builder, served(null, null), { thr_v4_builder_a: pr });
    fireEvent.pointerEnter(row());
    fireEvent.focus(within(row()).getByRole("link"));
    fireEvent.pointerLeave(row());
    expect(within(row()).getByRole("button", { name: /GitHub/ })).toBeTruthy();
    fireEvent.blur(within(row()).getByRole("link"), { relatedTarget: document.body });
    expect(within(row()).queryByRole("button", { name: /GitHub/ })).toBeNull();
  });
});

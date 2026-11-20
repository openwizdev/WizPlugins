// @vitest-environment jsdom
// WB4-3 (openwizdev/OpenWiz#1437), S4: the quiet footer (specs-section.v1.md
// sections 7 and 8). No bolt; "N running" counts threads only, with a matrix
// mark; its hover card shows exactly the `wizbar stats --json` data for the
// same rows and pins on click. Every row is synthetic (src/fixtures/v4.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import {
  v4CardPinCases, v4Now, v4OpenSetting, v4SpecRows, v4SpecsFile, v4SpecsFileText, v4Stats, v4Threads, v4TimeZone, type StatsV4,
} from "./fixtures/v4";
import { cardPinNext, cardSummary, computeStatsV4, formatStatsText } from "./stats";
import { createSpecsCommands } from "./specs/cli";

type Ready = Extract<StatsV4, { status: "ready" }>;
const ready = v4Stats as Ready;
const models = (model: string | null, effort: string | null, source: "host" | "none" = "host") =>
  ({ threadIds }: { threadIds: string[] }) => ({ source, items: threadIds.map((threadId) => ({ threadId, model, effort })) });

describe("S4: the card's data is one computation (sections 7 and 8)", () => {
  // catches: subagents counted, a hidden spec's name shown, a wrong harness or thread order, a wrong machine split.
  it("gives the contract's hand-worked stats for the fixture rows", () => {
    expect(computeStatsV4(v4Threads, v4SpecsFile, null, v4Now, v4TimeZone)).toEqual(v4Stats);
  });

  // catches: a spec guessed without a ready specs file, or the whole card lost when only the file is missing.
  it("names no spec, but keeps every number, when the specs file is unavailable", () => {
    expect(computeStatsV4(v4Threads, null, null, v4Now, v4TimeZone)).toEqual({
      ...v4Stats, threads: ready.threads.map((t) => ({ ...t, spec: null, shortName: null })) });
  });

  // catches: a served model dropped, or a model shown while the source is "none".
  it("takes model and effort from the served source only", () => {
    const served = computeStatsV4(v4Threads, v4SpecsFile, models("Sample model", "high")({ threadIds: ["thr_v4_code_a"] }) as never, v4Now, v4TimeZone);
    expect(served).toMatchObject({ status: "ready", threads: expect.arrayContaining([
      expect.objectContaining({ id: "thr_v4_code_a", model: "Sample model", effort: "high" }),
      expect.objectContaining({ id: "thr_v4_builder_a", model: null, effort: null })]) });
    const none = computeStatsV4(v4Threads, v4SpecsFile, models("Sample model", "high", "none")({ threadIds: ["thr_v4_code_a"] }) as never, v4Now, v4TimeZone);
    expect(none).toEqual(v4Stats);
  });

  // catches: a zero or a partial card when the rows cannot be trusted.
  it("is unavailable, harness and threads null, when the rows are", () => {
    expect(computeStatsV4(null, v4SpecsFile, null, v4Now, v4TimeZone)).toMatchObject({
      version: 2, status: "unavailable", running: null, harness: null, threads: null });
  });

  // catches: the Unknown part shown at zero or dropped when non-zero.
  it("writes the one summary line, Unknown only when non-zero", () => {
    expect(cardSummary(ready)).toBe("1 waiting on you · Cloud 7 · Local 1 · Unknown 1");
    expect(cardSummary({ ...ready, running: { ...ready.running, unknown: 0 } })).toBe("1 waiting on you · Cloud 7 · Local 1");
  });

  // catches: the CLI text dropping the harness split or the threads.
  it("prints the 0.3 lines, then the harness split and one line per thread", () => {
    const lines = formatStatsText(v4Stats).split("\n");
    expect(lines.slice(3, 5)).toEqual(["Harness: harness-a 6, harness-b 3", "\"thr_v4_fleet_a\": working Sample palette fleet"]);
    expect(lines).toContain("\"thr_v4_builder_a\": working Builder · SP-2: Sample add keyboard paths [Sample palette]");
    expect(lines).toHaveLength(3 + 1 + 9);
  });

  // catches: a click that cannot unpin, a leave or blur that closes a pinned card, or Escape ignored.
  it.each(v4CardPinCases)("%s + %s -> %s", (state, event, next) => {
    expect(cardPinNext(state, event)).toBe(next);
  });
});

const app = await loadPluginApp(() => import("../app"));
const { FooterCounter } = await import("./FooterCounter");
const binding = JSON.stringify([{ projectKey: "sample-factory", cloudroomProjectId: "prj_v4_atlas", repositories: ["example/sample-plans"],
  home: { hostId: "hst_v4_home", rootPath: "/synthetic/home" }, orchestratorThreadId: "thr_v4_orchestrator", statusWriterLogin: "sample-manager" }]);

function render(threads: readonly PluginSidebarThread[] = v4Threads) {
  return renderSlot({ component: FooterCounter }, {}, {
    pluginId: "synthetic-wb4-3", settings: { wizdeckFactories: binding },
    sidebarThreads: { status: "ready", threads: [...threads] },
    rpc: { specsFile: () => ({ kind: "content", text: v4SpecsFileText }), cardModels: models(null, null, "none") } as never,
  });
}
const counter = () => screen.getByRole("status", { name: /^\d+ running$/ });
const trigger = () => within(counter()).getByRole("button");
const card = () => screen.queryByRole("region", { name: "Running threads" });

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(v4Now); vi.stubEnv("TZ", "UTC"); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("S4: no bolt; N running with its hover card", () => {
  // catches: the bolt (a footer item) left registered.
  it("registers no footer item", () => {
    expect(app.experimentalSidebarFooterItems).toEqual([]);
    expect(app.sidebarFooterActions).toEqual([]);
  });

  // catches: subagents counted, or the matrix mark missing or in the wrong state.
  it("counts threads only, with a matrix mark", () => {
    render();
    expect(counter().getAttribute("aria-label")).toBe("9 running");
    expect(counter().textContent).toBe("9");
    expect(counter().querySelector("[data-matrix]")?.getAttribute("data-matrix")).toBe("working");
    cleanup();
    render([]);
    expect(counter().querySelector("[data-matrix]")?.getAttribute("data-matrix")).toBe("idle");
  });

  // catches: the card showing other data than `wizbar stats --json` for the same rows.
  it("shows exactly the stats data: summary, harness split, every running thread", async () => {
    render();
    fireEvent.pointerEnter(counter().parentElement!);
    const region = card()!;
    expect(within(region).getByText(cardSummary(ready))).toBeTruthy();
    expect([...region.querySelectorAll("[data-harness]")].map((el) => [el.getAttribute("data-harness"), el.getAttribute("data-count")]))
      .toEqual(ready.harness.map((h) => [h.providerId, String(h.count)]));
    await waitFor(() => expect(region.querySelectorAll("[data-spec-name]").length).toBe(4));
    const rows = [...region.querySelectorAll("[data-thread]")].map((el) => ({
      id: el.getAttribute("data-thread"), matrix: el.querySelector("[data-matrix]")?.getAttribute("data-matrix"),
      title: el.querySelector("[data-title]")?.textContent, shortName: el.querySelector("[data-spec-name]")?.textContent ?? null,
    }));
    expect(rows).toEqual(ready.threads.map((t) => ({ id: t.id, matrix: t.matrix, title: t.title, shortName: t.shortName })));
  });

  // catches: a pin that a leave undoes, a click that cannot unpin, keyboard users locked out, Escape ignored.
  it("hover opens; click pins and unpins; focus and Enter work; Escape closes", () => {
    render();
    const wrapper = counter().parentElement!;
    fireEvent.pointerEnter(wrapper);
    fireEvent.click(trigger());
    fireEvent.pointerLeave(wrapper);
    expect(card()).toBeTruthy();
    expect(trigger().getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(trigger());
    expect(card()).toBeTruthy();
    fireEvent.pointerLeave(wrapper);
    expect(card()).toBeNull();
    fireEvent.focus(trigger());
    expect(card()).toBeTruthy();
    fireEvent.keyDown(trigger(), { key: "Escape" });
    expect(card()).toBeNull();
    fireEvent.keyDown(trigger(), { key: "Enter" });
    expect(trigger().getAttribute("aria-pressed")).toBe("true");
    fireEvent.blur(trigger());
    expect(card()).toBeTruthy();
  });

  // catches: a thread in the card that opens nothing or the wrong thread, or a click that unpins the card.
  it("opens a thread clicked in the card and stays pinned", () => {
    const rendered = render();
    fireEvent.click(trigger());
    fireEvent.click(within(card()!).getByText("Builder · SP-4: Sample wire shortcuts"));
    expect(rendered.inspection.sidebarActionCalls).toContainEqual(expect.objectContaining({ threadId: "thr_v4_code_a" }));
    expect(card()).toBeTruthy();
  });

  // catches: `wizbar specs` still hard-coding model and effort as empty once the shared source serves them.
  it("wizbar specs takes model and effort from the shared source", async () => {
    const cli = createSpecsCommands({
      specsFile: async () => ({ kind: "content", text: v4SpecsFileText }), rows: async () => [...v4Threads],
      openSetting: async () => v4OpenSetting, writeOpenSetting: async (value) => value,
      models: async (threadIds) => models("Sample model", "high")({ threadIds: [...threadIds] }) as never,
    });
    const out = JSON.parse((await cli.run(["specs"], true))!.stdout!);
    expect(out.specs[0].agents.map((a: { threadId: string; model: string | null; effort: string | null }) => [a.threadId, a.model, a.effort]))
      .toEqual(v4SpecRows.specs[0]!.agents.map((a) => [a.threadId, "Sample model", "high"]));
  });
});

// WB4-10 (openwizdev/OpenWiz#1585): the card can be reached, read and trusted.
/** The card's hit area: the positioned box inside the trigger's wrapper that holds the card. */
const hitArea = () => {
  let el: HTMLElement | null = card();
  while (el && el.style.position !== "absolute") el = el.parentElement;
  return el;
};
/** Keyboard-focusable elements in Tab order (no positive tabindex is used). */
const tabbables = () => [...document.querySelectorAll<HTMLElement>("button, [tabindex]")]
  .filter((el) => el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled);
const manyThreads = (n: number) => Array.from({ length: n }, (_, i) => ({ ...v4Threads[0]!, id: `thr_v4_many_${i}`, title: `Sample many ${i}` }));

describe("WB4-10: the running card stays reachable", () => {
  // catches (#1531): the card floating 6px above its trigger, so the pointer crosses a gap that hits
  // neither and the unpinned card closes on the way into it.
  it("has one continuous hit area from the trigger into the card", () => {
    render();
    const wrapper = counter().parentElement!;
    fireEvent.pointerEnter(wrapper);
    const area = hitArea()!;
    expect(wrapper.contains(area)).toBe(true);
    expect(area.style.bottom).toBe("100%");
    expect(area.style.marginBottom).toBe("");
    expect(parseFloat(area.style.paddingBottom)).toBeGreaterThan(0);
  });

  // catches (#1532): the card mounted before its trigger, so Tab from the trigger leaves the card
  // (and the blur closes it), or thread buttons that hide the focus ring.
  it("Tab from the trigger reaches the first thread, with visible focus, and the card stays open", () => {
    render();
    act(() => trigger().focus());
    expect(card()).toBeTruthy();
    const order = tabbables();
    const next = order[order.indexOf(trigger()) + 1]!;
    const first = within(card()!).getAllByRole("button")[0]!;
    expect(next).toBe(first);
    fireEvent.blur(trigger(), { relatedTarget: next });
    act(() => next.focus());
    expect(card()).toBeTruthy();
    expect(document.activeElement).toBe(first);
    expect(first.style.getPropertyValue("all")).toBe("");
    expect(["none", "unset", "0"]).not.toContain(first.style.outline);
    expect(first.className).toMatch(/(^| )focus-visible:(ring|outline)/);
  });

  // catches (#1533): a card that grows above the viewport with many threads, its early rows unreachable.
  it("bounds the card to the space above the trigger and scrolls its thread list", () => {
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return { top: this.getAttribute("role") === "status" || this.querySelector?.("[role=status]") ? 200 : 0 } as DOMRect;
    });
    try {
      render(manyThreads(50));
      fireEvent.click(trigger());
      const area = hitArea()!;
      expect(area.style.maxHeight).toMatch(/px$/);
      expect(parseFloat(area.style.maxHeight)).toBeGreaterThan(0);
      expect(parseFloat(area.style.maxHeight)).toBeLessThanOrEqual(200);
      const threads = within(card()!).getByRole("list", { name: "Threads" });
      expect(threads.style.overflowY).toBe("auto");
      expect(threads.style.minHeight).toBe("0px");
      expect(threads.querySelectorAll("[data-thread]")).toHaveLength(50);
    } finally {
      rect.mockRestore();
    }
  });

  // catches (#1534): a pinned card that read the specs file once and keeps the old spec names.
  it("while pinned, a refreshed specs file changes the spec names shown", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(v4Now);
    let text = v4SpecsFileText;
    renderSlot({ component: FooterCounter }, {}, {
      pluginId: "synthetic-wb4-10", settings: { wizdeckFactories: binding },
      sidebarThreads: { status: "ready", threads: [...v4Threads] },
      rpc: { specsFile: () => ({ kind: "content", text }), cardModels: models(null, null, "none") } as never,
    });
    fireEvent.click(trigger());
    const names = () => [...card()!.querySelectorAll("[data-spec-name]")].map((el) => el.textContent);
    await waitFor(() => expect(names()).toContain("Sample palette"));
    text = v4SpecsFileText.replaceAll("\"Sample palette\"", "\"Sample palette updated\"");
    await vi.advanceTimersByTimeAsync(60_000);
    await waitFor(() => expect(names()).toContain("Sample palette updated"));
    expect(names()).not.toContain("Sample palette");
  });
});

// @vitest-environment jsdom
// WB4-3 (openwizdev/OpenWiz#1437), S4: the quiet footer (specs-section.v1.md
// sections 7 and 8). No bolt; "N running" counts threads only, with a matrix
// mark; its hover card shows exactly the `wizbar stats --json` data for the
// same rows and pins on click. Every row is synthetic (src/fixtures/v4.ts).
import { accessSync, constants, readdirSync } from "node:fs";
import { delimiter, join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { chromium, type Browser, type Locator, type Page } from "playwright-core";
import { createServer, type InlineConfig, type Plugin, type ViteDevServer } from "vite";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import {
  v4CardPinCases, v4Now, v4OpenSetting, v4RealTitlesFile, v4RealTitleThreads, v4SpecRows, v4SpecsFile, v4SpecsFileText, v4Stats, v4Threads,
  v4TimeZone, type StatsV4,
} from "./fixtures/v4";
import { cardBatch, cardPinNext, cardRowLabel, cardRowLabels, cardSummary, computeStatsV4, emptyCardBatch, formatStatsText } from "./stats";
import { v6Now, v6SpecsFileText } from "./fixtures/v6";
import { createSpecsCommands } from "./specs/cli";
import { specRows } from "./specs/rows";

// R1 (#172): a live host feed. While set, the sidebar hook reads these rows and re-renders when they change,
// as the host does on every realtime update; unset, the harness's fixed rows stand.
const liveFeed = vi.hoisted(() => ({ rows: null as readonly unknown[] | null, subs: new Set<() => void>() }));
vi.mock("@get-bb/plugin-sdk/app", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@get-bb/plugin-sdk/app")>();
  const { useSyncExternalStore } = await import("react");
  return { ...actual, experimental_useSidebarThreads: (...args: Parameters<typeof actual.experimental_useSidebarThreads>) => {
    const rows = useSyncExternalStore((f) => { liveFeed.subs.add(f); return () => { liveFeed.subs.delete(f); }; }, () => liveFeed.rows);
    const real = actual.experimental_useSidebarThreads(...args);
    return rows ? { ...real, status: "ready", threads: rows as PluginSidebarThread[] } : real;
  } };
});

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
    expect(cardSummary(ready)).toBe("1 waiting on you · 7 cloud, 1 local, 1 unknown");
    expect(cardSummary({ ...ready, running: { ...ready.running, unknown: 0 } })).toBe("1 waiting on you · 7 cloud, 1 local");
  });

  it("groups in Specs order, starts open, and remembers a fold when the card closes", async () => {
    render();
    fireEvent.click(trigger());
    const headers = () => within(card()!).getAllByRole("button", { expanded: true }).map((button) => button.textContent);
    await waitFor(() => expect(headers()).toEqual(["Sample palette 4", "Sample finished 1", "Other 4"]));
    expect(within(card()!).getByText("8 awake · 1 starting · 6 asleep")).toBeTruthy();

    const header = within(card()!).getByRole("button", { name: "Sample palette 4" });
    const controlled = document.getElementById(header.getAttribute("aria-controls")!);
    expect.soft(controlled?.querySelectorAll("[data-thread]")).toHaveLength(4);
    expect.soft(header.querySelector("[data-chevron]")?.getAttribute("data-chevron")).toBe("open");
    fireEvent.click(header);
    expect.soft(controlled?.hidden).toBe(true);
    expect.soft(header.querySelector("[data-chevron]")?.getAttribute("data-chevron")).toBe("closed");
    expect(card()!.querySelector('[data-thread="thr_v4_builder_a"]')).toBeNull();
    fireEvent.keyDown(trigger(), { key: "Escape" });
    fireEvent.click(trigger());
    const folded = await within(card()!).findByRole("button", { name: "Sample palette 4", expanded: false });
    fireEvent.click(folded);
    expect(card()!.querySelector('[data-thread="thr_v4_builder_a"]')).toBeTruthy();
  });

  it.each([
    ["needs-you", ["Sample echo 1", "Sample alpha 1", "Other 1"]],
    ["newest", ["Sample alpha 1", "Sample echo 1", "Other 1"]],
  ] as const)("uses the Specs section's %s sort for the groups", async (sort, expected) => {
    vi.setSystemTime(v6Now);
    const rows = ["702", "742", "999"].map((n) => {
      const title = `Builder · SS${n}: Sample task`;
      return { ...v4Threads[0]!, id: `sample-${n}`, title, displayTitle: title };
    });
    render(rows, sort, v6SpecsFileText);
    fireEvent.click(trigger());
    await waitFor(() => expect(within(card()!).getAllByRole("button", { expanded: true }).map((button) => button.textContent))
      .toEqual(expected));
  });

  it("labels untitled rows with a role and number or harness and preserves raw JSON titles", async () => {
    const cases = [
      [null, "You are the BUILDER for example/sample#23. Please begin.", "Builder · #23"],
      ["", "YOU ARE A FRESH REVIEWER FOR the sample change #45 at abc1234", "Reviewer · #45"],
      [null, "You are the builder for SamplePlugins#67.", "Builder · #67"],
      ["", "You are the builder for #89.", "Builder · #89"],
      [null, "You are a fresh reviewer for SamplePlugins#91.", "Reviewer · #91"],
      [null, "You are a fresh reviewer for #92.", "Reviewer · #92"],
      [null, "Please review the sample.", "Codex thread"],
      ["You are the builder for example/sample#99", null, "You are the builder for example/sample#99"],
    ] as const;
    const rows = cases.map(([title, titleFallback], i) => ({
      ...v4Threads[0]!, id: `sample-${i}`, providerId: "codex", title, titleFallback, displayTitle: title || titleFallback!,
    }));
    const data = computeStatsV4(rows, null, null, v4Now, "UTC");
    expect(data.threads?.map(({ title }) => title)).toEqual(rows.map(({ displayTitle }) => displayTitle));

    render(rows);
    fireEvent.click(trigger());
    expect([...card()!.querySelectorAll("[data-title]")].map((node) => node.textContent)).toEqual(cases.map(([, , label]) => label));
  });

  it("places a running child under Other when its fleet parent is archived", async () => {
    const fleet = v4RealTitleThreads.find(({ id }) => id === "thr_rt_fleet")!;
    const child = v4RealTitleThreads.find(({ id }) => id === "thr_rt_helper")!;
    const archived = { ...fleet, isArchived: true, archivedAt: v4Now };
    const result = computeStatsV4([archived, child], v4RealTitlesFile, null, v4Now, "UTC");
    expect(result.threads).toMatchObject([{ id: child.id, spec: null, shortName: null }]);
    // A titled ticket can still match independently when that same specs file arrives.
    const builder = v4RealTitleThreads.find(({ id }) => id === "thr_rt_builder")!;
    render([archived, child, builder], "newest", JSON.stringify(v4RealTitlesFile));
    fireEvent.click(trigger());
    await within(card()!).findByRole("button", { name: "Sample kernel 1" });
    const other = within(card()!).getByRole("button", { name: "Other 1" });
    expect(document.getElementById(other.getAttribute("aria-controls")!)?.querySelector("[data-thread]")?.getAttribute("data-thread"))
      .toBe(child.id);
  });

  // catches (0.5 E): a row that repeats the whole task, or drops the title of a thread with no role.
  it("labels a row by role and code, or by the full title when there is no role", () => {
    expect(cardRowLabel("Builder · SP-2: Sample add keyboard paths")).toBe("Builder · SP-2");
    expect(cardRowLabel("Reviewer · SP-14: Sample review")).toBe("Reviewer · SP-14");
    expect(cardRowLabel("Sample palette fleet")).toBe("Sample palette fleet");
  });

  // catches (#118 R2): a fleet's child losing its spec on the card because the rows never reach the matcher,
  // or the raw title rewritten in the stats JSON.
  it("names the spec of a fleet's children, and keeps each raw title", () => {
    const stats = computeStatsV4(v4RealTitleThreads, v4RealTitlesFile, null, v4Now, v4TimeZone) as Ready;
    const byId = Object.fromEntries(stats.threads.map((t) => [t.id, [t.title, t.shortName]]));
    expect(byId.thr_rt_builder).toEqual(["#902: Sample the driver", "Sample kernel"]);
    expect(byId.thr_rt_helper).toEqual(["Sample helper sweep", "Sample kernel"]);
    expect(byId.thr_rt_reviewer).toEqual(["Review #951 at abc1234", "Sample kernel"]);
    expect(byId.thr_rt_lost_child).toEqual(["#5: Sample nothing", null]);
  });

  // catches (#118 R2): real `#N:` and `Review #P at` titles shown raw on the card instead of role and ticket code.
  it("labels real titles by role and their ticket's code", () => {
    const labels = cardRowLabels(v4RealTitleThreads, specRows(v4RealTitlesFile, v4RealTitleThreads, [], v4Now).specs);
    expect(Object.fromEntries(v4RealTitleThreads.map((t) => [t.id, labels.get(t.id)]))).toEqual({
      thr_rt_fleet: "Fleet #900: Sample kernel",
      thr_rt_builder: "Builder · KN2",
      thr_rt_reviewer: "Reviewer · KN3",
      thr_rt_helper: "Sample helper sweep",
      thr_rt_top_builder: "Builder · RL1",
      thr_rt_old_form: "Builder · SP-9",
      thr_rt_no_hyphen: "Builder · AP11",
      thr_rt_uncoded: "Builder · #923",
      thr_rt_lost_fleet: "Fleet #777: Sample gone spec",
      thr_rt_lost_review: "Review #999 at def5678",
      thr_rt_lost_child: "#5: Sample nothing",
    });
    // With no ready specs file, only the title's own form can give a code.
    const bare = cardRowLabels(v4RealTitleThreads, []);
    expect([bare.get("thr_rt_builder"), bare.get("thr_rt_no_hyphen")]).toEqual(["#902: Sample the driver", "Builder · AP11"]);
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
const { MODEL_REFRESH_MS } = await import("./StatsPanel");
const binding = JSON.stringify([{ projectKey: "sample-factory", cloudroomProjectId: "prj_v4_atlas", repositories: ["example/sample-plans"],
  home: { hostId: "hst_v4_home", rootPath: "/synthetic/home" }, orchestratorThreadId: "thr_v4_orchestrator", statusWriterLogin: "sample-manager" }]);

function render(threads: readonly PluginSidebarThread[] = v4Threads, specsSort = "needs-you", specsText = v4SpecsFileText) {
  return renderSlot({ component: FooterCounter }, {}, {
    pluginId: "synthetic-wb4-3", settings: { wizdeckFactories: binding, specsSort },
    sidebarThreads: { status: "ready", threads: [...threads] },
    rpc: { specsFile: () => ({ kind: "content", text: specsText }), cardModels: models(null, null, "none") } as never,
  });
}
const counter = () => screen.getByRole("status", { name: /^\d+ running\b/ });
const trigger = () => within(counter()).getByRole("button");
const card = () => screen.queryByRole("region", { name: "Running threads" });

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(v4Now); vi.stubEnv("TZ", "UTC"); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllEnvs(); liveFeed.rows = null; liveFeed.subs.clear(); });

describe("S4: no bolt; N running with its hover card", () => {
  // catches: the bolt (a footer item) left registered.
  it("registers no footer item", () => {
    expect(app.experimentalSidebarFooterItems).toEqual([]);
    expect(app.sidebarFooterActions).toEqual([]);
  });

  // catches: subagents counted, or the matrix mark missing or in the wrong state.
  it("counts threads only, with a matrix mark", () => {
    render();
    expect(counter().getAttribute("aria-label")).toBe("9 running, 1 waiting on you");
    expect(counter().textContent).toBe("9 running · 1 waiting on you");
    // catches (#118 R1): a screen reader hears only the mark ("Working") on the focusable trigger, not the count.
    expect(within(counter()).getByRole("button", { name: "9 running, 1 waiting on you" })).toBe(trigger());
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
    expect(region.querySelector("[data-running-count]")?.textContent).toBe(`${ready.running.total} running`);
    expect(region.querySelector("[data-waiting-on-you]")?.textContent).toBe(`${ready.waitingOnYou} waiting on you`);
    expect(region.querySelector("[data-machines]")?.textContent).toBe(
      `${ready.running.cloud} cloud, ${ready.running.local} local, ${ready.running.unknown} unknown`,
    );
    expect([...region.querySelectorAll("[data-harness]")].map((el) => [el.getAttribute("data-harness"), el.getAttribute("data-count")]))
      .toEqual(ready.harness.map((h) => [h.providerId, String(h.count)]));
    await waitFor(() => expect(region.querySelectorAll("[data-spec-name]").length).toBe(2));
    const rows = [...region.querySelectorAll("[data-thread]")].map((el) => ({
      id: el.getAttribute("data-thread"), matrix: el.querySelector("[data-matrix]")?.getAttribute("data-matrix"),
      title: el.querySelector("[data-title]")?.textContent, shortName: el.getAttribute("data-thread-spec") ?? null,
    }));
    expect(rows.map(({ title, ...row }) => row)).toEqual(
      ["Sample palette", "Sample finished", null].flatMap((name) => ready.threads
        .filter((t) => t.shortName === name)
        .map((t) => ({ id: t.id, matrix: t.matrix, shortName: t.shortName }))),
    );
    expect(rows.map(({ title }) => title)).toEqual([
      "Builder · SP-2",
      "Reviewer · SP-3",
      "Builder · SC-1",
      "Builder · SP-4",
      "Reviewer · SF-2",
      "Sample palette fleet",
      "Builder · SH-1",
      "Builder · ZZ-1",
      "Sample tidy imports",
    ]);
  });

  it("shows each harness name beside its logo and count on one line without a split bar", () => {
    render();
    fireEvent.pointerEnter(counter().parentElement!);
    expect(card()!.querySelector("[data-harness-bar]")).toBeNull();
    const counts = [...card()!.querySelectorAll("[data-harness]")].map((el) => [
      el.getAttribute("data-harness"), el.textContent, el.querySelector('[role="img"]')?.getAttribute("aria-label"),
    ]);
    expect(counts).toEqual([
      ["harness-a", "Harness A 6", "harness-a"],
      ["harness-b", "Harness B 3", "harness-b"],
    ]);
    expect(card()!.querySelector("[data-harness]")!.parentElement!.style.flexDirection).not.toBe("column");
  });

  it("shows Codex and Claude Code names beside their logos and counts, wrapping if needed", () => {
    render(v4Threads.map((row) => ({
      ...row,
      providerId: row.id === "thr_v4_untitled" ? "harness-c"
        : row.providerId === "harness-a" ? "codex" : "claude-code",
    })));
    fireEvent.pointerEnter(counter().parentElement!);
    const legend = within(card()!).getByRole("list", { name: "Harness" });
    const entries = within(legend).getAllByRole("listitem");
    expect(entries.map((entry) => entry.textContent)).toEqual(["Codex 5", "Claude Code 3", "Harness C 1"]);
    expect(legend.style.flexWrap).toBe("wrap");
    expect(entries.map((entry) => entry.style.flexShrink)).toEqual(["0", "0", "0"]);
    // The legend wraps, so it is no longer a scroll target and not a tab stop.
    expect(legend.hasAttribute("tabindex")).toBe(false);
  });

  it("shows waiting on you in the warning colour only when non-zero", () => {
    render();
    fireEvent.pointerEnter(counter().parentElement!);
    const waiting = card()!.querySelector("[data-waiting-on-you]") as HTMLElement;
    expect(waiting?.textContent).toBe("1 waiting on you");
    expect(waiting?.style.color).toContain("--warning");
    cleanup();
    render(v4Threads.map((t) => ({ ...t, hasPendingInteraction: false })));
    fireEvent.pointerEnter(counter().parentElement!);
    expect(card()!.querySelector("[data-waiting-on-you]")).toBeNull();
  });

  // catches (0.5 E): the half-width card; it must fill the sidebar, inset 8 px each side.
  it("fills the sidebar width, inset 8 px", () => {
    render();
    fireEvent.pointerEnter(counter().parentElement!);
    const area = hitArea()!;
    expect([area.style.left, area.style.right]).toEqual(["8px", "8px"]);
    expect(card()!.style.width).toBe("100%");
  });

  // catches (#118 R2): the rendered card ignoring the resolved labels and spec names for real titles.
  it("shows real titles' role, code and spec on the card", async () => {
    renderSlot({ component: FooterCounter }, {}, {
      pluginId: "synthetic-118-r2", settings: { wizdeckFactories: binding },
      sidebarThreads: { status: "ready", threads: [...v4RealTitleThreads] },
      rpc: { specsFile: () => ({ kind: "content", text: JSON.stringify(v4RealTitlesFile) }), cardModels: models(null, null, "none") } as never,
    });
    fireEvent.pointerEnter(counter().parentElement!);
    const row = (id: string) => card()!.querySelector(`[data-thread=${id}]`)!;
    await waitFor(() => expect(row("thr_rt_builder").getAttribute("data-thread-spec")).toBe("Sample kernel"));
    expect(row("thr_rt_builder").querySelector("[data-title]")?.textContent).toBe("Builder · KN2");
    expect(row("thr_rt_reviewer").querySelector("[data-title]")?.textContent).toBe("Reviewer · KN3");
    expect(row("thr_rt_helper").getAttribute("data-thread-spec")).toBe("Sample kernel");
  });

  // catches (0.5 E): model · effort dropped from a one-line row, or put on a second line.
  it("puts model · effort on the row's one line, right-aligned", async () => {
    renderSlot({ component: FooterCounter }, {}, {
      pluginId: "synthetic-wb5-e", settings: { wizdeckFactories: binding },
      sidebarThreads: { status: "ready", threads: [...v4Threads] },
      rpc: { specsFile: () => ({ kind: "content", text: v4SpecsFileText }), cardModels: models("Sample model", "high") } as never,
    });
    fireEvent.pointerEnter(counter().parentElement!);
    const row = () => card()!.querySelector("[data-thread=thr_v4_builder_a] button") as HTMLElement;
    await waitFor(() => expect(row().querySelector("[data-model]")?.textContent).toBe("Sample model · High"));
    expect(row().style.display).toBe("flex");
    expect((row().querySelector("[data-model]") as HTMLElement).style.marginLeft).toBe("auto");
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
    fireEvent.click(within(card()!).getByText("Builder · SP-4"));
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
  it("Tab goes from the trigger to the first group with visible focus while the card stays open", () => {
    render();
    act(() => trigger().focus());
    expect(card()).toBeTruthy();
    const order = tabbables();
    const first = within(card()!).getAllByRole("button")[0]!;
    expect(order[order.indexOf(trigger()) + 1]).toBe(first);
    fireEvent.blur(trigger(), { relatedTarget: first });
    act(() => first.focus());
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

// R1 (#172): the open card updates in place. The owner saw it flash while threads ran; on main a change in
// the running set blanked every model label until the next answer, a leaving thread's row went and came back
// each turn, and a brief source gap unmounted the footer and closed the pinned card for good.
describe("R1 (#172): the open card updates in place, with no flashing", () => {
  const stop = (row: PluginSidebarThread): PluginSidebarThread =>
    ({ ...row, status: "idle", runtimeStatus: "idle", indicator: "none", indicatorLabel: null, updatedAt: Date.now() });
  /** The host hands over a new snapshot: every running row's revision moves on, and `stopped` rows end their turn. */
  const snapshot = (stopped: readonly string[] = []) => v4Threads.map((row) => stopped.includes(row.id) ? stop(row)
    : row.runtimeStatus === "idle" ? row : { ...row, updatedAt: Date.now() });
  const push = (rows: readonly PluginSidebarThread[]) => act(() => { liveFeed.rows = rows; liveFeed.subs.forEach((f) => f()); });
  const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
  const rowNode = (id: string) => card()?.querySelector(`[data-thread=${id}]`) ?? null;
  const modelNodes = () => new Map([...card()!.querySelectorAll("[data-model]")]
    .map((el) => [el.closest("[data-thread]")!.getAttribute("data-thread")!, el]));
  async function pinned(rows: readonly PluginSidebarThread[] = snapshot(), cardModels: unknown = models("Sample model", "high")) {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    vi.setSystemTime(v4Now);
    liveFeed.rows = rows;
    const rendered = renderSlot({ component: FooterCounter }, {}, {
      pluginId: `synthetic-172-${Math.random()}`, settings: { wizdeckFactories: binding },
      rpc: { specsFile: () => ({ kind: "content", text: v4SpecsFileText }), cardModels } as never,
    });
    fireEvent.click(trigger());
    await tick(10);
    return rendered;
  }

  // catches (a) and (c): labels blanked while the next model answer is out, or rows remounted on a row change.
  it("keeps every row, label and the count's node while rows change every second", async () => {
    await pinned();
    const section = card()!, count = counter(), models0 = modelNodes();
    const rows0 = new Map(ready.threads.map((t) => [t.id, rowNode(t.id)]));
    expect(models0.size).toBe(9);
    for (let second = 1; second <= 8; second++) {
      // thr_v4_code_a ends its turn and starts the next, every second: the running set changes each time.
      await push(snapshot(second % 2 ? ["thr_v4_code_a"] : []));
      expect(card(), `card at ${second}s`).toBe(section);
      expect(counter(), `count at ${second}s`).toBe(count);
      for (const [id, node] of models0) {
        expect(modelNodes().get(id), `label ${id} at ${second}s`).toBe(node);
        expect(node.textContent).toBe("Sample model · High");
      }
      for (const [id, node] of rows0) expect(rowNode(id), `row ${id} at ${second}s`).toBe(node);
      await tick(1000);
    }
  });

  it("keeps keyboard focus on a row updated within the same spec", async () => {
    await pinned();
    const id = "thr_v4_code_a";
    const button = rowNode(id)!.querySelector("button")!;
    act(() => button.focus());
    const title = "Builder · SP-3: Sample revised task";
    await push(snapshot().map((row) => row.id === id ? { ...row, title, displayTitle: title } : row));
    expect(button.textContent).toContain("Builder · SP-3");
    expect(rowNode(id)?.getAttribute("data-thread-spec")).toBe("Sample palette");
    expect(document.activeElement).toBe(button);
  });

  it("keeps a departing row's resolved title until the faded row is removed", async () => {
    await pinned();
    const id = "thr_v4_builder_a";
    const row = rowNode(id)!;
    const title = row.querySelector("[data-title]")!;
    expect(title.textContent).toBe("Builder · SP-2");
    await push(snapshot().filter((thread) => thread.id !== id));
    expect(rowNode(id)).toBe(row);
    expect(row.getAttribute("data-leaving")).toBe("true");
    expect(title.textContent).toBe("Builder · SP-2");
    await tick(3000);
    expect(rowNode(id)).toBeNull();
  });

  // catches: a thread that leaves taken out at once, so a turn boundary flashes its row, or leaves removed one by one.
  it("removes threads that leave together, at most once per batch window, and moves the count at once", async () => {
    await pinned();
    const count = counter();
    await push(snapshot(["thr_v4_code_a"]));
    expect(counter()).toBe(count);
    expect(count.getAttribute("aria-label")).toBe("8 running, 1 waiting on you");
    expect(rowNode("thr_v4_code_a")?.getAttribute("data-leaving")).toBe("true");
    await tick(1000);
    await push(snapshot(["thr_v4_code_a", "thr_v4_stray"]));
    expect(count.getAttribute("aria-label")).toBe("7 running, 1 waiting on you");
    await tick(1900);
    expect([rowNode("thr_v4_code_a"), rowNode("thr_v4_stray")].every((el) => el?.getAttribute("data-leaving") === "true")).toBe(true);
    await tick(100);
    expect([rowNode("thr_v4_code_a"), rowNode("thr_v4_stray")]).toEqual([null, null]);
    // The next leave waits a whole window from that removal.
    await push(snapshot(["thr_v4_code_a", "thr_v4_stray", "thr_v4_ambiguous"]));
    await tick(2900);
    expect(rowNode("thr_v4_ambiguous")?.getAttribute("data-leaving")).toBe("true");
    await tick(100);
    expect(rowNode("thr_v4_ambiguous")).toBeNull();
    // A thread back before its batch is never removed.
    await push(snapshot(["thr_v4_code_a", "thr_v4_stray", "thr_v4_ambiguous", "thr_v4_builder_a"]));
    await tick(1000);
    await push(snapshot(["thr_v4_code_a", "thr_v4_stray", "thr_v4_ambiguous"]));
    expect(rowNode("thr_v4_builder_a")?.hasAttribute("data-leaving")).toBe(false);
    await tick(5000);
    expect(rowNode("thr_v4_builder_a")).not.toBeNull();
  });

  // Owner steer on #175: a thread's model almost never changes, so its label is cached per thread for the session.
  const modelCalls = (rendered: { rpcCalls: { method: string; input: unknown }[] }) => rendered.rpcCalls
    .filter((c) => c.method === "cardModels").map((c) => [...(c.input as { threadIds: string[] }).threadIds].sort());

  // catches: a reopened card that starts blank and reads every model again.
  it("reopening the card shows every label at once, with no fetch", async () => {
    const rendered = await pinned();
    const before = modelCalls(rendered).length;
    fireEvent.keyDown(trigger(), { key: "Escape" });
    expect(card()).toBeNull();
    fireEvent.click(trigger());
    expect([...modelNodes().values()].map((el) => el.textContent)).toEqual(Array(9).fill("Sample model · High"));
    await tick(1000);
    expect(modelCalls(rendered)).toHaveLength(before);
  });

  // catches: a changed running set, or a new revision, reading every running thread's model again.
  it("a running-set change fetches only the new thread; a new revision fetches nothing", async () => {
    const rendered = await pinned(snapshot().filter((row) => row.id !== "thr_v4_code_a"));
    const before = modelCalls(rendered).length;
    await push(snapshot());
    await tick(10);
    expect(modelCalls(rendered).slice(before)).toEqual([["thr_v4_code_a"]]);
    await tick(1000);
    await push(snapshot());
    await tick(1000);
    await push(snapshot());
    await tick(10);
    expect(modelCalls(rendered)).toHaveLength(before + 1);
  });

  // catches: a null, failed or malformed answer blanking a known label, or a changed model never shown.
  it("keeps a known label through null, failed and malformed answers; a different value replaces it", async () => {
    let answer: (threadIds: string[]) => unknown = (threadIds) => models("Sample model", "high")({ threadIds });
    const rendered = await pinned(snapshot(), ({ threadIds }: { threadIds: string[] }) => answer(threadIds));
    const label = modelNodes().get("thr_v4_code_a")!;
    const reads = () => modelCalls(rendered).filter((ids) => ids.includes("thr_v4_code_a")).length;
    /** thr_v4_code_a ends its turn, then starts a new one: that alone reads its model again. */
    const newTurn = async () => {
      const before = reads();
      await push(snapshot(["thr_v4_code_a"]));
      await tick(500);
      await push(snapshot());
      await tick(10);
      expect(reads()).toBe(before + 1);
    };
    for (const next of [
      (ids: string[]) => models(null, null)({ threadIds: ids }),
      () => { throw new Error("synthetic failure"); },
      () => ({ source: "host", items: "malformed" }),
      () => ({ source: "host", items: [{ threadId: "thr_v4_code_a", model: 7, effort: "high" }] }),
      (ids: string[]) => models("Sample model", "high", "none")({ threadIds: ids }),
    ]) {
      answer = next;
      await newTurn();
      expect(modelNodes().get("thr_v4_code_a")).toBe(label);
      expect(label.textContent).toBe("Sample model · High");
    }
    answer = (threadIds) => models("Other model", "low")({ threadIds });
    await newTurn();
    expect(modelNodes().get("thr_v4_code_a")).toBe(label);
    expect(label.textContent).toBe("Other model · Low");
    expect(modelNodes().get("thr_v4_builder_a")?.textContent).toBe("Sample model · High");
  });

  // catches (#175 review R1): a transient per-thread lookup failure (a null model in a good answer) taking a
  // still-running thread's label away when another thread stops; a later valid answer still applies.
  it("keeps a still-running thread's label when its refresh lookup fails as another thread stops", async () => {
    let answer = (threadIds: string[]) => models("Sample model", "high")({ threadIds });
    const rendered = await pinned(snapshot(), ({ threadIds }: { threadIds: string[] }) => answer(threadIds));
    const label = modelNodes().get("thr_v4_builder_a")!;
    // Past the refresh window, the host's lookup for every thread fails: null model and effort.
    answer = (threadIds) => models(null, null)({ threadIds });
    const before = modelCalls(rendered).length;
    await tick(MODEL_REFRESH_MS);
    await push(snapshot(["thr_v4_code_a"]));
    await tick(10);
    expect(modelCalls(rendered).slice(before).flat()).toContain("thr_v4_builder_a");
    expect(rowNode("thr_v4_builder_a")).not.toBeNull();
    expect(modelNodes().get("thr_v4_builder_a")).toBe(label);
    expect(label.textContent).toBe("Sample model · High");
    // The lookup recovers with another value at the next refresh: it replaces the label in place.
    answer = (threadIds) => models("Other model", "low")({ threadIds });
    await tick(MODEL_REFRESH_MS);
    await push(snapshot(["thr_v4_code_a", "thr_v4_stray"]));
    await tick(10);
    expect(modelNodes().get("thr_v4_builder_a")).toBe(label);
    expect(label.textContent).toBe("Other model · Low");
  });

  // catches (#175 re-check R3): a new turn with another model while the card is closed, its old model shown
  // for good on reopen because the reopened card sees the same running id.
  it("on reopen shows the cached label at once, then one batched re-read brings a changed model", async () => {
    let answer = (threadIds: string[]) => models("Sample model", "high")({ threadIds });
    const rendered = await pinned(snapshot(), ({ threadIds }: { threadIds: string[] }) => answer(threadIds));
    fireEvent.keyDown(trigger(), { key: "Escape" });
    // Closed: thr_v4_code_a ends its turn, its model is switched, and it starts another turn.
    await push(snapshot(["thr_v4_code_a"]));
    await tick(30_000);
    answer = (threadIds) => models("Other model", "low")({ threadIds });
    await push(snapshot());
    await tick(90_000);
    const before = modelCalls(rendered).length;
    fireEvent.click(trigger());
    const label = modelNodes().get("thr_v4_code_a")!;
    expect(label.textContent).toBe("Sample model · High");
    await tick(10);
    const reads = modelCalls(rendered).slice(before);
    expect(reads).toHaveLength(1);
    expect(reads[0]).toContain("thr_v4_code_a");
    expect(modelNodes().get("thr_v4_code_a")).toBe(label);
    expect(label.textContent).toBe("Other model · Low");
  });

  // catches (#175 re-check R4): a failed new-turn lookup on a pinned card with no later sidebar change, its
  // wrong label kept past the refresh window because only sidebar events ever read again.
  it("while open, re-reads a failed or old label on a timer, one batch a minute at most", async () => {
    let answer = (threadIds: string[]) => models("Sample model", "high")({ threadIds });
    const rendered = await pinned(snapshot(), ({ threadIds }: { threadIds: string[] }) => answer(threadIds));
    const label = modelNodes().get("thr_v4_code_a")!;
    // The model is switched, and the new turn's lookup fails transiently.
    answer = (threadIds) => models(null, null)({ threadIds });
    await push(snapshot(["thr_v4_code_a"]));
    await tick(500);
    await push(snapshot());
    await tick(10);
    expect(label.textContent).toBe("Sample model · High");
    // Still failing, with no sidebar change: at most one batch a minute, and the label never blanks.
    const before = modelCalls(rendered).length;
    for (let i = 0; i < 30; i++) {
      await tick(10_000);
      expect(modelNodes().get("thr_v4_code_a")).toBe(label);
    }
    const retries = modelCalls(rendered).slice(before);
    expect(retries.length).toBeGreaterThanOrEqual(1);
    expect(retries.length).toBeLessThanOrEqual(5);
    // The host recovers with the new model: the next timed re-read shows it in place.
    answer = (threadIds) => models("Other model", "low")({ threadIds });
    await tick(60_000);
    expect(modelNodes().get("thr_v4_code_a")).toBe(label);
    expect(label.textContent).toBe("Other model · Low");
  });

  // catches: a leaving row that jumps to the end or the top of the list, so the rows below it shift twice.
  it("keeps a leaving thread in its old place until its batch goes", () => {
    const row = (id: string) => ({ ...ready.threads[0]!, id });
    const first = cardBatch(emptyCardBatch, [row("a"), row("b"), row("c")], 0).batch;
    const order = (running: string[]) => cardBatch(first, running.map(row), 1000);
    expect(order(["a", "c"]).batch.threads.map((t) => [t.id, t.leaving ?? false])).toEqual([["a", false], ["b", true], ["c", false]]);
    expect(order(["b", "c"]).batch.threads.map((t) => [t.id, t.leaving ?? false])).toEqual([["a", true], ["b", false], ["c", false]]);
    expect(order(["a", "c"]).flushAt).toBe(4000);
    expect(cardBatch(order(["a", "c"]).batch, [row("a"), row("c")], 4000)).toMatchObject({ flushAt: null, batch: { removedAt: 4000 } });
  });

  // catches (b): a brief source gap that unmounts the footer and closes a pinned card, or old numbers kept
  // as current: past a few seconds the count is marked last known, and closing the card hides it.
  it("keeps the last card through a brief source gap, then marks it last known", async () => {
    const rendered = await pinned();
    const section = card()!, count = counter(), row = rowNode("thr_v4_code_a");
    await act(() => rendered.setRealtimeConnectionState("reconnecting"));
    await tick(300);
    await act(() => rendered.setRealtimeConnectionState("connected"));
    expect(card()).toBe(section);
    expect(counter()).toBe(count);
    expect(rowNode("thr_v4_code_a")).toBe(row);
    expect(count.hasAttribute("data-stale")).toBe(false);
    // The reconnect alone does not certify the old rows; a new snapshot does.
    await push(snapshot());
    expect(card()).toBe(section);
    await act(() => rendered.setRealtimeConnectionState("reconnecting"));
    await tick(4900);
    expect(count.hasAttribute("data-stale")).toBe(false);
    await tick(100);
    expect(card()).toBe(section);
    expect(count.getAttribute("data-stale")).toBe("true");
    expect(count.getAttribute("aria-label")).toBe("9 running, 1 waiting on you, last known");
    fireEvent.keyDown(within(count).getByRole("button"), { key: "Escape" });
    expect(screen.queryByRole("status")).toBeNull();
    await act(() => rendered.setRealtimeConnectionState("connected"));
    await push(snapshot(["thr_v4_code_a"]));
    expect(counter().getAttribute("aria-label")).toBe("8 running, 1 waiting on you");
    expect(counter().hasAttribute("data-stale")).toBe(false);
  });
});

const reachabilityRoot = [process.cwd(), join(process.cwd(), "wizbar")].find((dir) => {
  try {
    accessSync(join(dir, "src/FooterCounter.tsx"));
    return true;
  } catch {
    return false;
  }
});
if (!reachabilityRoot) throw new Error("WizBar root not found");
const reachabilityThreads = 50;
const reachabilityViewport = { width: 350, height: 480 };
const reachabilityMissingBrowser = "No Chromium or Chrome found. Install Chromium with Playwright or set CHROMIUM_PATH.";

function findReachabilityBrowser(
  env: NodeJS.ProcessEnv = process.env,
  canExecute: (path: string) => boolean = (path) => {
    try {
      accessSync(path, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  },
): string | undefined {
  const fromPlaywright = (() => {
    try {
      return [chromium.executablePath()];
    } catch {
      return [];
    }
  })();
  const candidates = env.CHROMIUM_PATH ? [env.CHROMIUM_PATH] : [
    ...fromPlaywright,
    ...(env.PATH ?? "").split(delimiter).filter(Boolean).flatMap((dir) =>
      ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].map((name) => join(dir, name))),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];
  return candidates.find(canExecute);
}

function resolveReachabilityBrowser(
  env: NodeJS.ProcessEnv = process.env,
  canExecute?: (path: string) => boolean,
): { status: "ready"; executablePath: string } | { status: "skip"; reason: string } {
  const executablePath = findReachabilityBrowser(env, canExecute);
  if (executablePath) return { status: "ready", executablePath };
  if (env.WIZBAR_REQUIRE_BROWSER === "1") throw new Error(reachabilityMissingBrowser);
  return { status: "skip", reason: reachabilityMissingBrowser };
}

function hasVisiblePaint(color: string): boolean {
  const value = color.trim().toLowerCase();
  if (!value || value === "transparent" || value === "none") return false;
  const slash = value.match(/\/\s*([+-]?(?:\d+\.?\d*|\.\d+)(%)?)\s*\)\s*$/);
  if (slash) {
    const alpha = Number.parseFloat(slash[1]!);
    return Number.isFinite(alpha) && alpha > 0;
  }
  const commaAlpha = value.match(/^(?:rgba?|hsla?)\([^,]+,[^,]+,[^,]+,\s*([+-]?(?:\d+\.?\d*|\.\d+)(%)?)\s*\)$/);
  if (commaAlpha) {
    const alpha = Number.parseFloat(commaAlpha[1]!);
    return Number.isFinite(alpha) && alpha > 0;
  }
  const hex = value.match(/^#([0-9a-f]{4}|[0-9a-f]{8})$/);
  if (hex) {
    const alpha = hex[1]!.length === 4 ? hex[1]!.slice(3) : hex[1]!.slice(6);
    return Number.parseInt(alpha, 16) > 0;
  }
  return true;
}

function splitTopLevelCommas(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "(") depth++;
    else if (ch === ")" && depth > 0) depth--;
    else if (ch === "," && depth === 0) {
      parts.push(value.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

interface FocusIndicatorStyle {
  outlineStyle: string;
  outlineWidth: string;
  outlineColor: string;
  boxShadow: string;
  color: string;
}

function hasVisibleFocusIndicator(style: FocusIndicatorStyle): boolean {
  const outlineVisible = style.outlineStyle !== "none"
    && style.outlineStyle !== "hidden"
    && Number.parseFloat(style.outlineWidth) > 0
    && hasVisiblePaint(style.outlineColor);
  if (outlineVisible) return true;
  if (!style.boxShadow || style.boxShadow === "none") return false;
  return splitTopLevelCommas(style.boxShadow).some((layer) => {
    const trimmed = layer.trim();
    if (!trimmed || trimmed === "none") return false;
    const lengths = trimmed.match(/(?:^|\s)[+-]?(?:\d+\.?\d*|\.\d+)px(?=\s|$)/g) ?? [];
    if (!lengths.some((length) => Math.abs(Number.parseFloat(length)) > 0)) return false;
    const paint = trimmed
      .replace(/(?:^|\s)(?:inset|[+-]?(?:\d+\.?\d*|\.\d+)px)(?=\s|$)/gi, " ")
      .trim();
    return hasVisiblePaint(paint || style.color);
  });
}

const reachabilityBrowserPath = findReachabilityBrowser();
const reachabilityBrowserRequired = process.env.WIZBAR_REQUIRE_BROWSER === "1";
if (!reachabilityBrowserPath && !reachabilityBrowserRequired) {
  process.stderr.write(`Skipping WizBar running-card browser regression. ${reachabilityMissingBrowser}\n`);
}

function reachabilityEntry(stylesheet: string): string {
  return `
import hostStyles from ${JSON.stringify(stylesheet)};
import { createElement } from "react";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { FooterCounter } from "./src/FooterCounter";
import { v4SpecsFile, v4Threads } from "./src/fixtures/v4";

const link = document.createElement("link");
link.rel = "stylesheet";
link.href = hostStyles;
document.head.append(link);
await new Promise((resolve, reject) => {
  link.onload = () => resolve(undefined);
  link.onerror = () => reject(new Error("host stylesheet failed"));
});

const now = Date.now();
const base = v4Threads[0];
const threads = Array.from({ length: ${reachabilityThreads} }, (_, index) => {
  const title = "Sample thread " + (index + 1);
  return {
    ...base,
    id: "sample-" + (index + 1),
    title,
    displayTitle: title,
    runtimeStatus: "active",
    status: "active",
    hasPendingInteraction: false,
    providerId: "codex",
    parentThreadId: null,
    createdAt: now - ${reachabilityThreads} + index,
    updatedAt: now,
  };
});
const specs = { ...v4SpecsFile, generatedAt: new Date(now).toISOString(), specs: [] };
const binding = JSON.stringify([{
  projectKey: "sample-factory",
  cloudroomProjectId: "sample-project",
  repositories: ["example/sample-plans"],
  home: { hostId: "sample-host", rootPath: "/synthetic/sample" },
  orchestratorThreadId: "sample-orchestrator",
  statusWriterLogin: "sample-user",
}]);

renderSlot({
  component: () => createElement(
    "aside",
    { className: "flex h-screen min-h-0 flex-col bg-sidebar text-foreground" },
    createElement("div", { className: "min-h-0 flex-1" }),
    createElement(FooterCounter, { className: "shrink-0 border-t border-sidebar-border px-3 py-1" }),
  ),
}, {}, {
  pluginId: "running-card-reachability",
  sidebarThreads: { status: "ready", threads },
  settings: { wizdeckFactories: binding, specsSort: "newest" },
  rpc: {
    specsFile: () => ({ kind: "content", text: JSON.stringify(specs) }),
    cardModels: () => ({ source: "none", items: [] }),
  },
});
`;
}

function reachabilityPlugin(entry: string): Plugin {
  const virtual = "virtual:running-card-reachability";
  const resolved = `\0${virtual}`;
  return {
    name: "running-card-reachability",
    resolveId(id) {
      if (id === virtual || id === `/${virtual}`) return resolved;
    },
    load(id) {
      if (id === resolved) return entry;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== "/running-card-reachability.html") {
          next();
          return;
        }
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end(`<!doctype html><html lang="en" class="dark"><meta charset="utf-8"><title>Running card reachability</title><body style="margin:0"><script type="module" src="/${virtual}"></script></body></html>`);
      });
    },
  };
}

describe("B39: reachability regression guards", () => {
  it("skips when no browser is installed locally, and fails when WIZBAR_REQUIRE_BROWSER=1", () => {
    const never = () => false;
    expect(resolveReachabilityBrowser({ PATH: "" }, never)).toEqual({
      status: "skip",
      reason: reachabilityMissingBrowser,
    });
    expect(() => resolveReachabilityBrowser({ PATH: "", WIZBAR_REQUIRE_BROWSER: "1" }, never))
      .toThrow(reachabilityMissingBrowser);
    expect(resolveReachabilityBrowser({ CHROMIUM_PATH: "/synthetic/chrome" }, (p) => p === "/synthetic/chrome")).toEqual({
      status: "ready",
      executablePath: "/synthetic/chrome",
    });
  });

  it("rejects transparent outlines and transparent box-shadows as focus indicators", () => {
    const base: FocusIndicatorStyle = {
      outlineStyle: "none",
      outlineWidth: "0px",
      outlineColor: "rgba(0, 0, 0, 0)",
      boxShadow: "none",
      color: "rgb(255, 255, 255)",
    };
    expect(hasVisibleFocusIndicator({ ...base, outlineStyle: "solid", outlineWidth: "1px", outlineColor: "transparent" })).toBe(false);
    expect(hasVisibleFocusIndicator({ ...base, outlineStyle: "solid", outlineWidth: "1px", outlineColor: "rgba(0, 0, 0, 0)" })).toBe(false);
    expect(hasVisibleFocusIndicator({ ...base, outlineStyle: "solid", outlineWidth: "1px", outlineColor: "oklab(0.7 0 0 / 0)" })).toBe(false);
    expect(hasVisibleFocusIndicator({ ...base, boxShadow: "rgba(0, 0, 0, 0) 0px 0px 0px 1px inset" })).toBe(false);
    expect(hasVisibleFocusIndicator({ ...base, boxShadow: "oklch(0.7 0.1 240 / 0%) 0px 0px 0px 1px inset" })).toBe(false);
    expect(hasVisibleFocusIndicator({ ...base, outlineStyle: "solid", outlineWidth: "1px", outlineColor: "rgb(255, 255, 255)" })).toBe(true);
    expect(hasVisibleFocusIndicator({
      ...base,
      boxShadow: "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgb(161, 161, 170) 0px 0px 0px 1px inset",
    })).toBe(true);
    expect(hasVisibleFocusIndicator({
      ...base,
      boxShadow: "rgba(0, 0, 0, 0) 0px 0px 0px 0px, oklab(0.7 0 0 / 0.5) 0px 0px 0px 1px inset",
    })).toBe(true);
  });
});

describe("B39: the running card stays reachable in a browser", () => {
  let server: ViteDevServer | undefined;
  let browser: Browser | undefined;
  let url: string;

  beforeAll(async () => {
    const resolved = resolveReachabilityBrowser();
    if (resolved.status === "skip") return;
    const assets = join(reachabilityRoot, "node_modules/bb-app/app/dist/assets");
    const css = readdirSync(assets).find((name) => /^index-.*\.css$/.test(name));
    if (!css) throw new Error("host stylesheet missing");
    const inline: InlineConfig = {
      configFile: false,
      root: reachabilityRoot,
      logLevel: "error",
      plugins: [reachabilityPlugin(reachabilityEntry(`/node_modules/bb-app/app/dist/assets/${css}?url`))],
      server: { host: "127.0.0.1", port: 0 },
    };
    server = await createServer(inline);
    await server.listen();
    const local = server.resolvedUrls?.local[0];
    if (!local) throw new Error("browser regression server has no local url");
    url = new URL("/running-card-reachability.html", local).href;
    browser = await chromium.launch({
      executablePath: resolved.executablePath,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  beforeEach(() => {
    vi.useRealTimers();
  });

  async function openPage(): Promise<Page> {
    if (!browser) throw new Error(reachabilityMissingBrowser);
    const page = await browser.newPage({ viewport: reachabilityViewport, reducedMotion: "reduce" });
    await page.goto(url);
    await page.getByRole("button", { name: "50 running" }).waitFor();
    return page;
  }

  async function readListEdge(list: Locator, edge: "start" | "end") {
    return list.evaluate((node, which) => {
      const rows = [...node.querySelectorAll("[data-thread]")];
      const first = rows[0];
      const last = rows.at(-1);
      const target = which === "start" ? first : last;
      const rect = target?.getBoundingClientRect();
      const port = node.getBoundingClientRect();
      const panel = node.closest('[aria-label="Running threads"]')?.getBoundingClientRect();
      const whole = (box: DOMRect | undefined, item: DOMRect | undefined) => Boolean(
        box && item && item.top >= box.top - 0.5 && item.bottom <= box.bottom + 0.5
          && item.left >= box.left - 0.5 && item.right <= box.right + 0.5,
      );
      const inView = (item: DOMRect | undefined) => Boolean(
        item && item.height > 0 && item.top >= -0.5 && item.bottom <= window.innerHeight + 0.5,
      );
      return {
        count: rows.length,
        id: target?.getAttribute("data-thread") ?? "",
        scrollTop: node.scrollTop,
        atTop: node.scrollTop === 0,
        atBottom: node.scrollHeight - node.clientHeight - node.scrollTop < 1,
        overflow: node.scrollHeight > node.clientHeight + 1,
        inList: whole(port, rect),
        inViewport: inView(rect),
        otherInList: whole(port, which === "start" ? last?.getBoundingClientRect() : first?.getBoundingClientRect()),
        cardInside: Boolean(panel && panel.top >= -0.5 && panel.bottom <= window.innerHeight + 0.5 && panel.height > 0),
      };
    }, edge);
  }

  it.skipIf(!reachabilityBrowserPath && !reachabilityBrowserRequired)(
    "moves the pointer across the old gap, tabs to a computed focus ring, and scrolls the first and last of 50 threads",
    async () => {
      const page = await openPage();
      try {
        const trigger = page.getByRole("button", { name: "50 running" });
        const card = page.getByRole("region", { name: "Running threads" });
        await trigger.hover();
        await card.waitFor();
        const start = await trigger.boundingBox();
        const panel = await card.boundingBox();
        expect(start && panel && panel.y + panel.height <= start.y + 0.5).toBe(true);
        await page.mouse.move(start!.x + start!.width / 2, panel!.y + panel!.height - 2, { steps: 24 });
        expect(await card.isVisible(), "pointer can cross the gap").toBe(true);
        await page.mouse.move(2, panel!.y + panel!.height / 2);
        expect(await card.isVisible(), "leaving the card closes the unpinned card").toBe(false);

        await page.keyboard.press("Tab");
        expect(await trigger.evaluate((node) => node === document.activeElement)).toBe(true);
        await page.keyboard.press("Tab");
        const focus = await card.evaluate((node) => {
          const focused = document.activeElement;
          if (!(focused instanceof HTMLElement)) {
            return {
              inCard: false,
              outlineStyle: "none",
              outlineWidth: "0px",
              outlineColor: "rgba(0, 0, 0, 0)",
              boxShadow: "none",
              color: "rgba(0, 0, 0, 0)",
            };
          }
          const style = getComputedStyle(focused);
          return {
            inCard: node.contains(focused) && focused.matches(":focus-visible"),
            outlineStyle: style.outlineStyle,
            outlineWidth: style.outlineWidth,
            outlineColor: style.outlineColor,
            boxShadow: style.boxShadow,
            color: style.color,
          };
        });
        expect({ inCard: focus.inCard, visible: hasVisibleFocusIndicator(focus) }).toEqual({
          inCard: true,
          visible: true,
        });
        expect(await card.isVisible()).toBe(true);

        const list = card.locator('[aria-label="Threads"]');
        const top = await readListEdge(list, "start");
        expect(top).toMatchObject({
          count: 50,
          atTop: true,
          atBottom: false,
          overflow: true,
          inList: true,
          inViewport: true,
          otherInList: false,
          cardInside: true,
        });

        await list.hover();
        await page.mouse.wheel(0, 10_000);
        await expect.poll(async () => (await readListEdge(list, "end")).atBottom).toBe(true);
        const bottom = await readListEdge(list, "end");
        expect(bottom.scrollTop).toBeGreaterThan(0);
        expect(bottom).toMatchObject({
          count: 50,
          atTop: false,
          atBottom: true,
          overflow: true,
          inList: true,
          inViewport: true,
          otherInList: false,
          cardInside: true,
        });
        expect(top.id).not.toBe(bottom.id);

        await page.mouse.wheel(0, -10_000);
        await expect.poll(async () => (await readListEdge(list, "start")).atTop).toBe(true);
        const backAtTop = await readListEdge(list, "start");
        expect(backAtTop).toMatchObject({
          count: 50,
          id: top.id,
          atTop: true,
          atBottom: false,
          overflow: true,
          inList: true,
          inViewport: true,
          otherInList: false,
          cardInside: true,
        });
      } finally {
        await page.close();
      }
    },
    30_000,
  );
});

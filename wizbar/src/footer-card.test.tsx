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
  v4CardPinCases, v4Now, v4OpenSetting, v4RealTitlesFile, v4RealTitleThreads, v4SpecRows, v4SpecsFile, v4SpecsFileText, v4Stats, v4Threads,
  v4TimeZone, type StatsV4,
} from "./fixtures/v4";
import { cardBatch, cardPinNext, cardRowLabel, cardRowLabels, cardSummary, computeStatsV4, emptyCardBatch, formatStatsText } from "./stats";
import { createSpecsCommands } from "./specs/cli";

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
    const labels = cardRowLabels(v4RealTitleThreads, v4RealTitlesFile, v4Now);
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
    const bare = cardRowLabels(v4RealTitleThreads, null, v4Now);
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
    expect(counter().getAttribute("aria-label")).toBe("9 running");
    expect(counter().textContent).toBe("9 running");
    // catches (#118 R1): a screen reader hears only the mark ("Working") on the focusable trigger, not the count.
    expect(within(counter()).getByRole("button", { name: "9 running" })).toBe(trigger());
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
    await waitFor(() => expect(region.querySelectorAll("[data-spec-name]").length).toBe(5));
    const rows = [...region.querySelectorAll("[data-thread]")].map((el) => ({
      id: el.getAttribute("data-thread"), matrix: el.querySelector("[data-matrix]")?.getAttribute("data-matrix"),
      title: el.querySelector("[data-title]")?.textContent, shortName: el.querySelector("[data-spec-name]")?.textContent ?? null,
    }));
    expect(rows.map(({ title, ...row }) => row)).toEqual(
      ready.threads.map((t) => ({ id: t.id, matrix: t.matrix, shortName: t.shortName })),
    );
    expect(rows.map(({ title }) => title)).toEqual([
      "Sample palette fleet",
      "Builder · SP-2",
      "Builder · SH-1",
      "Reviewer · SF-2",
      "Builder · ZZ-1",
      "Reviewer · SP-3",
      "Builder · SC-1",
      "Builder · SP-4",
      "Sample tidy imports",
    ]);
  });

  // catches (0.5 E): the harness split as a list of rows with no bar, or a bar not split by the counts.
  it("shows the harness split as one bar, then each harness and its count on one line", () => {
    render();
    fireEvent.pointerEnter(counter().parentElement!);
    const bar = card()!.querySelector("[data-harness-bar]")!;
    expect([...bar.children].map((el) => [el.getAttribute("data-harness-segment"), (el as HTMLElement).style.flexGrow]))
      .toEqual([["harness-a", "6"], ["harness-b", "3"]]);
    const names = [...card()!.querySelectorAll("[data-harness]")].map((el) => el.textContent);
    expect(names).toEqual(["Harness A 6", "Harness B 3"]);
    expect(card()!.querySelector("[data-harness]")!.parentElement!.style.flexDirection).not.toBe("column");
  });

  it("keeps three harness labels in one keyboard-scrollable row", () => {
    render(v4Threads.map((row) => row.id === "thr_v4_untitled" ? { ...row, providerId: "harness-c" } : row));
    fireEvent.pointerEnter(counter().parentElement!);
    const legend = within(card()!).getByRole("list", { name: "Harness" });
    const entries = within(legend).getAllByRole("listitem");
    expect(entries.map((entry) => entry.textContent)).toEqual(["Harness A 5", "Harness B 3", "Harness C 1"]);
    expect(legend.style.flexWrap).toBe("nowrap");
    expect(legend.style.overflowX).toBe("auto");
    expect(entries.map((entry) => entry.style.flexShrink)).toEqual(["0", "0", "0"]);
    expect(legend.tabIndex).toBe(0);
  });

  // catches (#159 R2): the Claude Code segment mixed from --warning, so a theme's alert colour leaks into a bar of
  // ordinary running sessions; or its replacement drawn the same as another harness's segment.
  it("colours the harness segments from neutral host tones, never the warning, each harness apart", () => {
    const named: Record<string, string> = { "harness-a": "claude-code", "harness-b": "codex" };
    render(v4Threads.map((t) => ({ ...t, providerId: named[t.providerId] ?? t.providerId })));
    fireEvent.pointerEnter(counter().parentElement!);
    const segments = [...card()!.querySelector("[data-harness-bar]")!.children] as HTMLElement[];
    expect(segments.map((el) => el.getAttribute("data-harness-segment"))).toEqual(["claude-code", "codex"]);
    const colours = segments.map((el) => el.style.background);
    expect(colours.filter((c) => c.includes("--warning"))).toEqual([]);
    expect(colours.every((c) => c.length > 0)).toBe(true);
    expect(new Set(colours).size).toBe(colours.length);
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
    await waitFor(() => expect(row("thr_rt_builder").querySelector("[data-spec-name]")?.textContent).toBe("Sample kernel"));
    expect(row("thr_rt_builder").querySelector("[data-title]")?.textContent).toBe("Builder · KN2");
    expect(row("thr_rt_reviewer").querySelector("[data-title]")?.textContent).toBe("Reviewer · KN3");
    expect(row("thr_rt_helper").querySelector("[data-spec-name]")?.textContent).toBe("Sample kernel");
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
    expect(count.getAttribute("aria-label")).toBe("8 running");
    expect(rowNode("thr_v4_code_a")?.getAttribute("data-leaving")).toBe("true");
    await tick(1000);
    await push(snapshot(["thr_v4_code_a", "thr_v4_stray"]));
    expect(count.getAttribute("aria-label")).toBe("7 running");
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
    expect(count.getAttribute("aria-label")).toBe("9 running, last known");
    fireEvent.keyDown(within(count).getByRole("button"), { key: "Escape" });
    expect(screen.queryByRole("status")).toBeNull();
    await act(() => rendered.setRealtimeConnectionState("connected"));
    await push(snapshot(["thr_v4_code_a"]));
    expect(counter().getAttribute("aria-label")).toBe("8 running");
    expect(counter().hasAttribute("data-stale")).toBe(false);
  });
});

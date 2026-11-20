// @vitest-environment jsdom
// WB4-1 (openwizdev/OpenWiz#1435), S1 and S2: the Specs section as the owner
// sees it, and its parity with `wizbar specs --json` for the same input
// (specs-section.v1.md sections 2 to 4 and 8). Every row is synthetic.
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { createFakePluginHost, type FakePluginHost } from "@get-bb/plugin-sdk/testing";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import plugin from "../server";
import { v4Now, v4OpenSetting, v4SpecOpenCases, v4SpecRows, v4SpecsFileText, v4Threads, type SpecsFileReadV4 } from "../fixtures/v4";
import { SpecsSection, type SpecsSectionProps } from "./SpecsSection";
import { effectiveOpen, readOpenKeys } from "./open-state";
import { rawRow } from "./testing";

const binding = JSON.stringify([{ projectKey: "sample-factory", cloudroomProjectId: "prj_v4_atlas", repositories: ["example/sample-plans"],
  home: { hostId: "hst_v4_home", rootPath: "/synthetic/home" }, orchestratorThreadId: "thr_v4_orchestrator", statusWriterLogin: "sample-manager" }]);
const props: SpecsSectionProps = { threads: v4Threads, now: v4Now, activeThreadId: null, onNavigate() {} };
const ready: SpecsFileReadV4 = { kind: "content", text: v4SpecsFileText };

function render(options: { read?: () => SpecsFileReadV4; settings?: Record<string, string>; now?: number; updateSettings?: (args: unknown) => unknown } = {}) {
  const updates: unknown[] = [];
  options = { ...options, settings: { wizdeckFactories: binding, ...options.settings } };
  const rendered = renderSlot({ component: SpecsSection }, { ...props, now: options.now ?? v4Now }, {
    pluginId: "wizbar",
    rpc: { specsFile: options.read ?? (() => ready) },
    settings: options.settings,
    sdk: { plugins: { updateSettings: (async (args: { values: Record<string, string> }) => {
      updates.push(args);
      return options.updateSettings?.(args) ?? { values: { ...options.settings, ...args.values } };
    }) as never } },
  });
  return { rendered, updates };
}

const section = () => screen.findByRole("region", { name: "Specs" });
const rowOf = (name: string) => screen.getByText(name).closest("[data-spec]") as HTMLElement;

beforeEach(() => {
  vi.stubEnv("TZ", "UTC");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(v4Now);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("S1: the section shows one row per running spec", () => {
  // catches: counts, dots or hidden specs that differ from the contract's rows.
  it("shows the rule, names, counts, done/total and dots; finished and empty specs are hidden", async () => {
    render({ settings: { specsOpen: v4OpenSetting } });
    const region = await section();
    expect(await within(region).findByText("Specs 2 · 2 need you")).toBeTruthy();
    expect([...region.querySelectorAll("[data-spec]")].map((el) => el.getAttribute("data-spec"))).toEqual(
      ["example/sample-plans#501", "example/sample-tools#77"]);
    const palette = rowOf("Sample palette");
    expect(within(palette).getByText("1 needs you")).toBeTruthy();
    expect(within(palette).getByText("1 done in the last hour")).toBeTruthy();
    expect(within(palette).getByText("4/10")).toBeTruthy();
    const cache = rowOf("Sample cache");
    expect(within(cache).getByText("0/3")).toBeTruthy();
    expect(within(cache).queryByText(/done in the last hour/)).toBeNull();
    for (const row of v4SpecRows.specs) {
      const dots = [...rowOf(row.shortName).querySelectorAll("[data-dot-state]")].map((d) => d.getAttribute("data-dot-state"));
      expect(dots).toEqual(row.dots.map((d) => d.state));
    }
    expect(screen.queryByText("Sample finished")).toBeNull();
    expect(screen.queryByText("Sample empty")).toBeNull();
  });

  // catches: an unavailable file drawn as "Specs 0" with no rows.
  it.each([
    ["stale", { now: v4Now + 26 * 60_000 }],
    ["missing", { read: (): SpecsFileReadV4 => ({ kind: "missing" }) }],
    ["a failed read", { read: (): SpecsFileReadV4 => { throw new Error("offline"); } }],
  ] as const)("shows Specs unavailable when the file is %s", async (_name, options) => {
    if ("now" in options) vi.setSystemTime(options.now);
    render(options);
    const region = await section();
    expect(await within(region).findByText("Specs unavailable")).toBeTruthy();
    expect(within(region).queryByText(/^Specs \d/)).toBeNull();
    expect(region.querySelectorAll("[data-spec]").length).toBe(0);
  });
});

describe("S1: no bound factory", () => {
  // catches: the section asking the server for a file when no factory is bound, which the 0.3 list's exact-call tests forbid.
  it.each([["no setting", {}], ["two factories", { wizdeckFactories: JSON.stringify([...JSON.parse(binding), { ...JSON.parse(binding)[0], projectKey: "other-factory" }]) }]] as const)(
    "shows Specs unavailable without a read: %s", async (_name, settings) => {
      const rendered = renderSlot({ component: SpecsSection }, props, { pluginId: "wizbar", rpc: { specsFile: () => ready }, settings: { ...settings } });
      const region = await section();
      expect(within(region).getByText("Specs unavailable")).toBeTruthy();
      expect(rendered.rpcCalls).toEqual([]);
    });
});

describe("S2: open, closed and remembered", () => {
  // catches: specs that start open, or a chevron on a spec with no running agents.
  it("starts every spec collapsed, with a chevron only where agents run", async () => {
    render();
    await screen.findByText("Sample palette");
    expect(within(rowOf("Sample palette")).getByRole("button", { name: "Open Sample palette" }).getAttribute("aria-expanded")).toBe("false");
    expect(within(rowOf("Sample cache")).queryByRole("button", { name: /Sample cache$/ })).toBeNull();
    expect(screen.queryByText("Builder · SP-2: Sample add keyboard paths")).toBeNull();
  });

  // catches: a click that opens only in memory, so a reload forgets it.
  it("opens on click, writes specsOpen, and lists the spec's running agents as thread rows", async () => {
    const { rendered, updates } = render({ settings: { specsOpen: "[\"example/gone#1\"]" } });
    fireEvent.click(await screen.findByRole("button", { name: "Open Sample palette" }));
    await waitFor(() => expect(updates).toEqual([{ pluginId: "wizbar", values: { specsOpen: "[\"example/gone#1\",\"example/sample-plans#501\"]" } }]));
    const agents = await screen.findByRole("list", { name: "Sample palette agents" });
    expect(within(agents).getAllByRole("link").map((a) => a.textContent)).toEqual(v4SpecRows.specs[0]!.agents.map((a) => a.title));
    fireEvent.click(within(agents).getAllByRole("link")[0]!);
    expect(rendered.sidebarActionCalls.at(-1)).toMatchObject({ threadId: "thr_v4_builder_a" });
  });

  // catches: a stored open state ignored on the next load, or a close that is not written.
  it("restores an open spec from settings, and closes it", async () => {
    const { updates } = render({ settings: { specsOpen: v4OpenSetting } });
    const close = await screen.findByRole("button", { name: "Close Sample palette" });
    expect(close.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("list", { name: "Sample palette agents" })).toBeTruthy();
    fireEvent.click(close);
    await waitFor(() => expect(updates).toEqual([{ pluginId: "wizbar", values: { specsOpen: "[\"example/gone#1\"]" } }]));
    await waitFor(() => expect(screen.queryByRole("list", { name: "Sample palette agents" })).toBeNull());
  });

  // catches: a refused settings write that silently snaps back, so the owner never learns the state was not kept.
  it("says so when the open state cannot be saved, and stays closed", async () => {
    render({ updateSettings: () => { throw new Error("refused"); } });
    fireEvent.click(await screen.findByRole("button", { name: "Open Sample palette" }));
    expect(await screen.findByText("Could not save the open spec. Try again.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open Sample palette" }).getAttribute("aria-expanded")).toBe("false");
  });

  // catches: GitHub shown as a visible chip, or opened some way other than the host's openUrl.
  it("swaps done/total for a GitHub mark on hover, which opens the spec issue", async () => {
    const { rendered } = render();
    await screen.findByText("Sample palette");
    const row = rowOf("Sample palette");
    // The GitHub button stays mounted for keyboard users (#1563); before hover the row shows done/total.
    expect(within(row).getByText("4/10")).toBeTruthy();
    fireEvent.pointerEnter(row);
    expect(within(row).queryByText("4/10")).toBeNull();
    fireEvent.click(within(row).getByRole("button", { name: "Open Sample palette on GitHub" }));
    expect(rendered.navigateCalls).toEqual([{ method: "openUrl", url: "https://github.com/example/sample-plans/issues/501" }]);
    fireEvent.pointerLeave(row);
    expect(within(row).getByText("4/10")).toBeTruthy();
  });
});

const app = await loadPluginApp(() => import("../../app"));
const hosts: FakePluginHost[] = [];
afterEach(async () => { for (const host of hosts.splice(0)) await host.harness.lifecycle.dispose(); });

describe("parity: wizbar specs --json is what the section shows", () => {
  // catches: the CLI and the sidebar computing rows differently for the same file, rows and setting.
  it("for the fixture file, rows and open setting", async () => {
    const sha = (text: string) => createHash("sha256").update(text).digest("hex");
    const host = createFakePluginHost({ pluginId: "wizbar", sdk: {
      files: { read: vi.fn(async ({ path }: { path: string }) => ({ content: v4SpecsFileText, contentEncoding: "utf8", path, sha256: sha(v4SpecsFileText), sizeBytes: 1 })) },
      threads: { list: vi.fn(async () => v4Threads.map(rawRow)), get: vi.fn() },
    } as never });
    hosts.push(host);
    plugin(host.bb);
    await host.harness.behavior.setSettings({
      specsOpen: v4OpenSetting,
      wizdeckFactories: JSON.stringify([{ projectKey: "sample-factory", cloudroomProjectId: "prj_v4_atlas", repositories: ["example/sample-plans"],
        home: { hostId: "hst_v4_home", rootPath: "/synthetic/home" }, orchestratorThreadId: "thr_v4_orchestrator", statusWriterLogin: "sample-manager" }]),
    });
    const cli = JSON.parse((await host.harness.behavior.runCli(["specs", "--json"])).stdout!);
    const served = await host.harness.behavior.callRpc("specsFile", {});

    // The whole sidebar, as mounted in the thread list, fed the server's own read.
    renderSlot(app.threadLists[0]!, {
      activeThreadId: null, activeProjectId: null, isCompactViewport: true, onNavigate() {}, searchQuery: "",
    }, {
      pluginId: "wizbar", settings: { specsOpen: v4OpenSetting, wizdeckFactories: binding },
      sidebarThreads: { status: "ready", threads: [...v4Threads] },
      rpc: { listLifecycle: () => ({ rows: [] }), specsFile: () => served,
        cardModels: (input: unknown) => ({ source: "none",
          items: (input as { threadIds: string[] }).threadIds.map((threadId) => ({ threadId, model: null, effort: null })) }) },
    });
    const region = await section();
    await within(region).findByText(/^Specs \d/);
    const shown = {
      rule: within(region).getByRole("heading").textContent,
      specs: [...region.querySelectorAll<HTMLElement>("[data-spec]")].map((row) => ({
        spec: row.getAttribute("data-spec"),
        shortName: row.querySelector("[data-spec-name]")?.textContent,
        doneTotal: row.querySelector("[data-done-total]")?.textContent,
        doneLastHour: row.querySelector("[data-done-last-hour]")?.textContent ?? null,
        needsYou: row.querySelector("[data-needs-you]")?.textContent ?? null,
        open: row.querySelector("[aria-expanded]")?.getAttribute("aria-expanded") === "true",
        dots: [...row.querySelectorAll("[data-dot-state]")].map((d) => d.getAttribute("data-dot-state")),
        agents: [...row.querySelectorAll("[data-sidebar-thread-id]")].map((a) => a.getAttribute("data-sidebar-thread-id")),
      })),
    };
    expect(cli).toEqual(v4SpecRows);
    expect(shown).toEqual({
      rule: `Specs ${cli.specs.length} · ${cli.needsYou} need you`,
      specs: cli.specs.map((s: typeof v4SpecRows.specs[number]) => ({
        spec: s.spec, shortName: s.shortName, doneTotal: `${s.done}/${s.total}`,
        doneLastHour: s.doneLastHour > 0 ? `${s.doneLastHour} done in the last hour` : null,
        needsYou: s.needsYou > 0 ? `${s.needsYou} needs you` : null,
        open: s.open, dots: s.dots.map((d) => d.state), agents: s.open ? s.agents.map((a) => a.threadId) : [],
      })),
    });
  });
});

// WB4-8 (openwizdev/OpenWiz#1583): fixes from the cross-family re-check of WB4-1.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("WB4-8: the latest toggle wins (#1562)", () => {
  // catches: an older settings response landing last and reopening a spec the owner just closed, on screen and in the store.
  it("keeps the latest choice shown and stored when the saves finish out of order", async () => {
    let stored: Record<string, string> = { wizdeckFactories: binding };
    const pending: { values: Record<string, string>; done: (result: unknown) => void }[] = [];
    renderSlot({ component: SpecsSection }, props, {
      pluginId: "wizbar", rpc: { specsFile: () => ready }, settings: stored,
      sdk: { plugins: { updateSettings: ((args: { values: Record<string, string> }) => new Promise((done) => {
        pending.push({ values: args.values, done });
      })) as never } },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Open Sample palette" }));
    fireEvent.click(await screen.findByRole("button", { name: "Close Sample palette" }));
    // The host finishes the newest outstanding save first, then the older ones; each lands in the store as it finishes.
    for (;;) {
      await act(async () => { await new Promise((tick) => setTimeout(tick, 0)); });
      const save = pending.pop();
      if (!save) break;
      stored = { ...stored, ...save.values };
      save.done({ values: stored });
    }
    expect(readOpenKeys(stored.specsOpen)).toEqual([]);
    expect(screen.getByRole("button", { name: "Open Sample palette" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("list", { name: "Sample palette agents" })).toBeNull();
  });
});

describe("WB4-8: GitHub by keyboard on a spec without agents (#1563)", () => {
  const tabbable = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>("button, a[href], input, [tabindex]")]
    .filter((el) => el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled);

  // catches: a row with no chevron that has nothing to focus, so its GitHub action needs a mouse.
  it("puts the GitHub action in the tab order, reveals it on focus, and opens the spec issue", async () => {
    const { rendered } = render();
    await screen.findByText("Sample cache");
    const row = rowOf("Sample cache");
    expect(within(row).getByText("0/3")).toBeTruthy();
    const stops = tabbable(row);
    expect(stops.map((el) => el.getAttribute("aria-label"))).toEqual(["Open Sample cache on GitHub"]);
    const github = stops[0] as HTMLButtonElement;
    expect(github.tagName).toBe("BUTTON");
    expect(github.type).toBe("button");
    act(() => github.focus());
    expect(document.activeElement).toBe(github);
    expect(within(row).queryByText("0/3")).toBeNull();
    // Enter on a focused native button is a click; jsdom does not synthesize that, so the click stands in for it.
    fireEvent.click(github);
    expect(rendered.navigateCalls).toEqual([{ method: "openUrl", url: "https://github.com/example/sample-tools/issues/77" }]);
    act(() => github.blur());
    expect(within(row).getByText("0/3")).toBeTruthy();
  });
});

describe("WB4-8: pointer and focus reveal GitHub independently (#1563, review R1)", () => {
  // catches: a pointer leave hiding the focused GitHub button, or a blur hiding it under the pointer, because hover and focus share one flag.
  it.each([
    ["the pointer leaves while focus stays", (row: HTMLElement, github: HTMLElement) => {
      fireEvent.pointerEnter(row); act(() => github.focus()); fireEvent.pointerLeave(row);
    }],
    ["focus leaves while the pointer stays", (row: HTMLElement, github: HTMLElement) => {
      act(() => github.focus()); fireEvent.pointerEnter(row); act(() => github.blur());
    }],
  ] as const)("keeps the GitHub action shown when %s", async (_name, steps) => {
    render();
    await screen.findByText("Sample cache");
    const row = rowOf("Sample cache");
    const github = within(row).getByRole("button", { name: "Open Sample cache on GitHub" });
    steps(row, github);
    expect(github.classList.contains("sr-only")).toBe(false);
    expect(within(row).queryByText("0/3")).toBeNull();
  });
});

describe("WB4-8: a changed factory clears the old rows at once (#1564)", () => {
  const other = JSON.stringify([{ ...JSON.parse(binding)[0], home: { hostId: "hst_v4_other", rootPath: "/synthetic/other" } }]);
  const onlyCache: SpecsFileReadV4 = { kind: "content", text: JSON.stringify({
    ...JSON.parse(v4SpecsFileText), specs: JSON.parse(v4SpecsFileText).specs.filter((s: { spec: string }) => s.spec === "example/sample-tools#77") }) };
  // The fake host keeps one settings object for the mount; changing it and rerendering is the owner's settings edit.
  function mountSwitchable() {
    const settings: Record<string, string> = { wizdeckFactories: binding };
    const reads: ReturnType<typeof deferred<SpecsFileReadV4>>[] = [];
    const rendered = renderSlot({ component: SpecsSection }, props, {
      pluginId: "wizbar", settings,
      rpc: { specsFile: () => { const read = deferred<SpecsFileReadV4>(); reads.push(read); return read.promise; } },
    });
    const switchTo = (next: string) => { settings.wizdeckFactories = next; rendered.lifecycle.rerender(<SpecsSection {...props} />); };
    return { rendered, reads, switchTo };
  }

  // catches: two valid single-factory bindings reduced to one Boolean, so the old factory's rows and GitHub links stay up.
  it("drops the old rows at once and reads the new factory", async () => {
    const { rendered, reads, switchTo } = mountSwitchable();
    await waitFor(() => expect(reads.length).toBe(1));
    await act(async () => reads[0]!.resolve(ready));
    expect(await screen.findByText("Sample palette")).toBeTruthy();
    switchTo(other);
    expect(screen.queryByText("Sample palette")).toBeNull();
    await waitFor(() => expect(rendered.rpcCalls.length).toBe(2));
    await act(async () => reads[1]!.resolve(onlyCache));
    expect(await screen.findByText("Sample cache")).toBeTruthy();
    expect(screen.queryByText("Sample palette")).toBeNull();
  });

  // catches: the old factory's read finishing after the switch and painting its rows over the new factory's.
  it("drops a late response from the old binding", async () => {
    const { reads, switchTo } = mountSwitchable();
    await waitFor(() => expect(reads.length).toBe(1));
    switchTo(other);
    await waitFor(() => expect(reads.length).toBe(2));
    await act(async () => reads[1]!.resolve(onlyCache));
    expect(await screen.findByText("Sample cache")).toBeTruthy();
    await act(async () => reads[0]!.resolve(ready));
    expect(screen.queryByText("Sample palette")).toBeNull();
    expect(screen.getByText("Sample cache")).toBeTruthy();
  });
});

describe("WB4-8: the sidebar shows WB4-7's effective open state (#1539)", () => {
  // catches: the sidebar and `wizbar spec` disagreeing on whether a spec is open, for example a saved key on a spec with no agents.
  it.each(v4SpecOpenCases.map((c) => [c.argv.join(" "), c] as const))("after %s", async (_name, c) => {
    render({ settings: { specsOpen: JSON.stringify(c.stored) } });
    await screen.findByText("Sample palette");
    for (const row of v4SpecRows.specs) {
      const shown = rowOf(row.shortName).querySelector("[aria-expanded]")?.getAttribute("aria-expanded") === "true";
      expect(shown).toBe(effectiveOpen({ open: c.stored.includes(row.spec), agents: row.agents }));
    }
    const target = rowOf(v4SpecRows.specs.find((row) => row.spec === c.result.spec)!.shortName);
    expect(target.querySelector("[aria-expanded]")?.getAttribute("aria-expanded") === "true").toBe(c.result.open);
  });
});

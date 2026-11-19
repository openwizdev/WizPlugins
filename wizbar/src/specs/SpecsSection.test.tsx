// @vitest-environment jsdom
// WB4-1 (openwizdev/OpenWiz#1435), S1 and S2: the Specs section as the owner
// sees it, and its parity with `wizbar specs --json` for the same input
// (specs-section.v1.md sections 2 to 4 and 8). Every row is synthetic.
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { createFakePluginHost, type FakePluginHost } from "@get-bb/plugin-sdk/testing";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import plugin from "../server";
import { v4Now, v4OpenSetting, v4SpecRows, v4SpecsFileText, v4Threads, type SpecsFileReadV4 } from "../fixtures/v4";
import { SpecsSection, type SpecsSectionProps } from "./SpecsSection";
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
    expect(within(row).queryByRole("button", { name: "Open Sample palette on GitHub" })).toBeNull();
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

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
import { strictRead } from "../testing/strict-files";
import { SpecsSection, type SpecsSectionProps } from "./SpecsSection";
import { effectiveOpen, readOpenKeys } from "./open-state";
import { tokens } from "./theme";
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
    expect(await within(region).findByRole("heading", { name: "Specs 2 · 2 need you" })).toBeTruthy();
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

// WizBar 0.5.0 C (openwizdev/WizPlugins#112): the round-5 look of the rule, the spec rows,
// the dots and the open panel (specs-section.v1.md sections 2 and 9).
describe("0.5 C: the rule, the spec rows and the open panel", () => {
  // catches: the rule drawn as one grey string, so "need you" loses its warning colour and the count is as loud as the word.
  it("shows Specs, then the count faint, then · M need you in the warning colour, with an olive line", async () => {
    render();
    const heading = within(await section()).getByRole("heading");
    await waitFor(() => expect(heading.textContent).toBe("Specs 2 · 2 need you"));
    expect(within(heading).getByText("Specs").className).toContain("text-muted-foreground");
    // Council round 1: the target's label size and weight, as on the shelf labels.
    expect(heading.className).toContain("text-[11.5px]");
    expect(heading.className).toContain("font-medium");
    const count = within(heading).getByText("2");
    expect(count.className).toMatch(/text-muted-foreground\/\d+/);
    expect(count.className).not.toBe(within(heading).getByText("Specs").className);
    expect(within(heading).getByText("· 2 need you").style.color).toBe(tokens.warning);
    expect((heading.querySelector("[data-rule-line]") as HTMLElement).style.background).toBe(tokens.rule);
  });

  // catches: a rule that still says "need you" when nothing waits on the owner.
  it("leaves out · M need you when M is zero", async () => {
    const none = JSON.parse(v4SpecsFileText);
    for (const spec of none.specs) for (const ticket of spec.tickets) if (ticket.state === "needs-you") ticket.state = "not-started";
    render({ read: () => ({ kind: "content", text: JSON.stringify(none) }) });
    const heading = within(await section()).getByRole("heading");
    await waitFor(() => expect(heading.textContent).toBe("Specs 2"));
  });

  // catches: the chevron trailing the name, or a spec with no agents whose name starts further left than its neighbours'.
  it("leads with › closed or ⌄ open only where agents run, and a same-width placeholder otherwise", async () => {
    render({ settings: { specsOpen: v4OpenSetting } });
    await screen.findByText("Sample palette");
    const lead = (name: string) => rowOf(name).querySelector("[data-spec-line]")!.querySelector("[data-chevron]") as HTMLElement;
    const palette = rowOf("Sample palette");
    const first = palette.querySelector("[data-spec-line]")!.querySelector("[data-chevron], [data-spec-name]");
    expect(first?.hasAttribute("data-chevron")).toBe(true);
    expect(lead("Sample palette").getAttribute("data-chevron")).toBe("open");
    expect(within(palette).getByRole("button", { name: "Close Sample palette" }).contains(lead("Sample palette"))).toBe(true);
    fireEvent.click(within(palette).getByRole("button", { name: "Close Sample palette" }));
    await waitFor(() => expect(lead("Sample palette").getAttribute("data-chevron")).toBe("closed"));
    const placeholder = lead("Sample cache");
    expect(placeholder.getAttribute("data-chevron")).toBe("none");
    expect(placeholder.querySelector("svg")).toBeNull();
    expect(placeholder.className).toBe(lead("Sample palette").className);
  });

  // catches: the notes left inline after the name instead of on the right, before done/total.
  it("puts the name on the left and K needs you, N done in the last hour, then done/total on the right", async () => {
    render();
    await screen.findByText("Sample palette");
    const line = rowOf("Sample palette").querySelector("[data-spec-line]")!;
    const order = [...line.querySelectorAll("[data-spec-name], [data-needs-you], [data-done-last-hour], [data-done-total]")]
      .map((el) => el.textContent);
    expect(order).toEqual(["Sample palette", "1 needs you", "1 done in the last hour", "4/10"]);
    const name = line.querySelector("[data-spec-name]")!;
    expect(name.contains(line.querySelector("[data-needs-you]"))).toBe(false);
    expect(name.className).toContain("flex-1");
    expect((line.querySelector("[data-needs-you]") as HTMLElement).style.color).toBe(tokens.warning);
    expect((line.querySelector("[data-done-last-hour]") as HTMLElement).style.color).toBe(tokens.doneNote);
    // The dots sit on the line below, outside the name line.
    expect(line.querySelector("[data-dot-state]")).toBeNull();
    expect(rowOf("Sample palette").querySelectorAll("[data-dot-state]").length).toBe(10);
  });

  // catches: building drawn as a solid accent dot, done in the last hour as a ringed olive, or a ring dot that never pulses.
  it("draws each dot state in its own colour, ring and motion", async () => {
    render();
    await screen.findByText("Sample palette");
    const dot = (state: string) => rowOf("Sample palette").querySelector(`[data-dot-state="${state}"]`) as HTMLElement;
    const ring = (colour: string) => `inset 0 0 0 1px ${colour}`;
    expect(dot("done").style.background).toBe(tokens.mutedAccent);
    expect(dot("done-recent").style.background).toBe(tokens.brightOlive);
    expect(dot("done-recent").style.boxShadow).toBe("");
    expect(dot("building").style.background).toBe("");
    // Council round 1: a light grey ring, as in the target, which has no lime rings.
    expect(dot("building").style.boxShadow).toBe(ring(tokens.mutedText));
    expect(dot("building").className).toContain("motion-safe:animate-pulse");
    // Lead, after council round 1: no lime rings, so review is the same grey ring, still.
    expect(dot("review").style.boxShadow).toBe(ring(tokens.mutedText));
    expect(dot("review").className).not.toContain("animate-pulse");
    expect(dot("needs-you").style.background).toBe(tokens.warning);
    expect(dot("held").style.boxShadow).toBe(ring(tokens.quietRing));
    expect(dot("held").style.background).toBe("");
    expect(dot("not-started").style.background).toBe(tokens.border);
    expect(tokens.brightOlive).not.toBe(tokens.mutedAccent);
  });

  // catches (0.5.x C2, #155): done tones mixed from the accent and the warning, so on a host whose --primary is not lime
  // (a grey, a lavender tint) done dots drift into the needs-you hue; or an oklch mix with a host grey written as
  // oklch(L 0 0), whose hue 0 swings green through yellow and orange; or a missing --success falling back to the warning.
  it("draws done tones from --success (else a neutral) in oklab, and keeps --warning for needs-you only", async () => {
    render();
    await screen.findByText("Sample palette");
    const heading = screen.getByRole("region", { name: "Specs" });
    const row = rowOf("Sample palette");
    const shown = [
      (heading.querySelector("[data-rule-line]") as HTMLElement).style.background,
      (row.querySelector("[data-done-last-hour]") as HTMLElement).style.color,
      (row.querySelector('[data-dot-state="done"]') as HTMLElement).style.background,
    ];
    expect(shown).toEqual([tokens.rule, tokens.doneNote, tokens.mutedAccent]);
    // Each role's colour, written out from the ticket: done tones are --success (falling back to the muted text, never
    // the warning) mixed in oklab into the sidebar; the note is mixed toward the text so it keeps 4.5:1 on light themes too.
    const success = "var(--success, var(--muted-foreground, #b7b7b7))";
    const sidebar = "var(--sidebar, #161616)";
    const roles: Record<string, string> = {
      rule: `color-mix(in oklab, ${success} 40%, ${sidebar})`,
      mutedAccent: `color-mix(in oklab, ${success} 55%, ${sidebar})`,
      brightOlive: `color-mix(in oklab, ${success} 85%, ${sidebar})`,
      doneNote: `color-mix(in oklab, ${success} 25%, var(--foreground, var(--muted-foreground, #b7b7b7)))`,
      warning: "var(--warning, #fc8c45)",
    };
    for (const [role, value] of Object.entries(roles)) expect.soft(tokens[role as keyof typeof tokens], role).toBe(value);
    const usesWarning = Object.entries(tokens).filter(([, value]) => value.includes("--warning")).map(([role]) => role);
    expect(usesWarning).toEqual(["warning"]);
  });

  // catches (#159 R1): a done note with so much --success in it that a tinted light surface (a lavender theme tint)
  // pulls it under 4.5:1 while the host's own text stays readable. The note's mix is evaluated here with the
  // CSS Color 4 oklab maths and the WCAG 2 contrast formula, on stock and tinted synthetic surfaces.
  it("keeps the done note 4.5:1 or better on stock and tinted sidebars and cards", () => {
    const share = Number(/^color-mix\(in oklab, var\(--success, [^)]*\)\) (\d+)%, var\(--foreground, /.exec(tokens.doneNote)?.[1]);
    expect(share).toBeGreaterThan(0);
    type Lab = [number, number, number];
    const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const toGamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
    const hex = (h: string): Lab => [1, 3, 5].map((i) => toLinear(parseInt(h.slice(i, i + 2), 16) / 255)) as Lab;
    const oklabToLinear = ([L, a, b]: Lab): Lab => {
      const [l, m, s] = [L + 0.3963377774 * a + 0.2158037573 * b, L - 0.1055613458 * a - 0.0638541728 * b, L - 0.0894841775 * a - 1.291485548 * b].map((x) => x ** 3);
      return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
    };
    const linearToOklab = ([r, g, b]: Lab): Lab => {
      const [l, m, s] = [0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b, 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b, 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b].map(Math.cbrt);
      return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
    };
    const oklch = (L: number, C: number, H: number): Lab => oklabToLinear([L, C * Math.cos((H * Math.PI) / 180), C * Math.sin((H * Math.PI) / 180)]);
    // Clamp to the sRGB gamut and back, as a screen shows it.
    const shown = (c: Lab): Lab => c.map((v) => toLinear(Math.round(Math.min(1, Math.max(0, toGamma(v))) * 255) / 255)) as Lab;
    const luminance = ([r, g, b]: Lab) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const contrast = (x: Lab, y: Lab) => { const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p); return (hi + 0.05) / (lo + 0.05); };
    const mix = (x: Lab, p: number, y: Lab): Lab => {
      const [a, b] = [linearToOklab(x), linearToOklab(y)];
      return shown(oklabToLinear(a.map((v, i) => (v * p) / 100 + (b[i] * (100 - p)) / 100) as Lab));
    };
    // bb-app 0.37.0's success, ink and muted text, dark and light; the lavender surfaces are synthetic tints.
    const dark = { success: oklch(0.74, 0.15, 155), muted: oklch(0.78, 0, 0), foreground: oklch(0.81, 0, 0) };
    const light = { success: oklch(0.70, 0.15, 155), muted: oklch(0.44, 0, 0), foreground: oklch(0.3211, 0, 0) };
    const fallback = { success: hex("#b7b7b7"), muted: hex("#b7b7b7"), foreground: hex("#e9e9e9") };
    const themes: [string, typeof dark, Lab[]][] = [
      ["fallback", fallback, [hex("#161616"), hex("#222222")]],
      ["bb dark", dark, [hex("#1b1b1b"), hex("#151515")]],
      ["bb light", light, [hex("#fafafa"), hex("#ffffff")]],
      ["bb light, lavender tint", light, [hex("#dfd5ec")]],
      ["bb light, deep lavender tint", light, [oklch(0.82, 0.06, 300), oklch(0.85, 0.05, 300)]],
      ["dark, lavender tint", dark, [oklch(0.24, 0.04, 300), oklch(0.29, 0.05, 300), oklch(0.36, 0.06, 300), oklch(0.40, 0.06, 300)]],
    ];
    for (const [name, theme, surfaces] of themes) for (const success of [theme.success, theme.muted]) for (const surface of surfaces) {
      const ratio = contrast(mix(success, share, theme.foreground), shown(surface));
      expect.soft(ratio, `${name}${success === theme.muted ? ", no --success" : ""}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  // catches: an open spec whose agents float on the plain sidebar, or a closed spec drawn raised.
  it("raises an open spec and its agents into one card panel", async () => {
    render({ settings: { specsOpen: v4OpenSetting } });
    const agents = await screen.findByRole("list", { name: "Sample palette agents" });
    const panel = rowOf("Sample palette");
    expect(panel.contains(agents)).toBe(true);
    expect(panel.style.background).toBe(tokens.card);
    expect(panel.className).toContain("rounded-lg");
    expect(rowOf("Sample cache").style.background).toBe("");
    fireEvent.click(within(panel).getByRole("button", { name: "Close Sample palette" }));
    await waitFor(() => expect(rowOf("Sample palette").style.background).toBe(""));
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
      files: { read: vi.fn(strictRead(async ({ path }: { path: string }) => ({ content: v4SpecsFileText, contentEncoding: "utf8", path, sha256: sha(v4SpecsFileText), sizeBytes: 1 }))) },
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
    await within(region).findByRole("heading", { name: /^Specs \d/ });
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

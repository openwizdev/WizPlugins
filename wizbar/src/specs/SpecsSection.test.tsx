// @vitest-environment jsdom
// WB4-1 (openwizdev/OpenWiz#1435), S1 and S2: the Specs section as the owner
// sees it, and its parity with `wizbar specs --json` for the same input
// (specs-section.v1.md sections 2 to 4 and 8). Every row is synthetic.
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { createFakePluginHost, type FakePluginHost } from "@get-bb/plugin-sdk/testing";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import plugin from "../server";
import { v4Now, v4OpenSetting, v4SpecOpenCases, v4SpecRows, v4SpecRowsV2, v4SpecsFileText, v4SpecsFileV2Text, v4Threads, type SpecsFileReadV4 } from "../fixtures/v4";
import { specsSortsV6, type SpecsSortV6, v6Activity, v6Agents, v6Now, v6QuietSplit, v6SortOrders, v6SpecsFileText } from "../fixtures/v6";
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
    expect(await within(region).findByRole("heading", { name: "Specs 2 · 2 tickets need you (2 specs)" })).toBeTruthy();
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
  it("shows Specs, then the count faint, then · M tickets need you (K specs) in the warning colour, with an olive line", async () => {
    render();
    const heading = within(await section()).getByRole("heading");
    await waitFor(() => expect(heading.textContent).toBe("Specs 2 · 2 tickets need you (2 specs)"));
    expect(within(heading).getByText("Specs").className).toContain("text-muted-foreground");
    // Council round 1: the target's label size and weight, as on the shelf labels.
    expect(heading.className).toContain("text-[11.5px]");
    expect(heading.className).toContain("font-medium");
    const count = within(heading).getByText("2");
    expect(count.className).toMatch(/text-muted-foreground\/\d+/);
    expect(count.className).not.toBe(within(heading).getByText("Specs").className);
    expect(within(heading).getByText("· 2 tickets need you (2 specs)").style.color).toBe(tokens.warning);
    expect((heading.querySelector("[data-rule-line]") as HTMLElement).style.background).toBe(tokens.rule);
  });

  // catches (#161): "1 tickets need you (1 specs)", or a rule whose accessible name or tooltip differs from what it says.
  it("uses singular forms at 1, and gives the full sentence as the rule's label and tooltip", async () => {
    const file = JSON.parse(v4SpecsFileText);
    file.specs[1].tickets.find((t: { code: string }) => t.code === "SH-1").state = "not-started";
    render({ read: () => ({ kind: "content", text: JSON.stringify(file) }) });
    const heading = within(await section()).getByRole("heading");
    await waitFor(() => expect(heading.textContent).toBe("Specs 2 · 1 ticket needs you (1 spec)"));
    expect(heading.getAttribute("aria-label")).toBe("Specs 2 · 1 ticket needs you (1 spec)");
    expect(heading.getAttribute("title")).toBe("Specs 2 · 1 ticket needs you (1 spec)");
  });

  // catches (#161): the full sentence clipped or wrapped where it does not fit, or the short form shown where it does.
  // jsdom has no layout, so the widths are stubbed: the rule's own width, and the full sentence's natural width.
  it.each([
    ["fits", 300, "Specs 2 · 2 tickets need you (2 specs)"],
    ["does not fit", 150, "Specs 2 · 2 for you"],
  ] as const)("when the full sentence %s on one line, shows it, else · M for you", async (_name, width, shown) => {
    const restore = [
      vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
        return this.tagName === "H2" ? width : 0;
      }),
      vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
        return this.hasAttribute("data-rule-measure") ? 220 : 0;
      }),
    ];
    try {
      render();
      const heading = within(await section()).getByRole("heading");
      await waitFor(() => expect(heading.querySelector("[data-rule-text]")!.textContent).toBe(shown));
      expect(heading.getAttribute("aria-label")).toBe("Specs 2 · 2 tickets need you (2 specs)");
      expect(heading.getAttribute("title")).toBe("Specs 2 · 2 tickets need you (2 specs)");
      // The measuring copy is never seen or read.
      const measure = (await section()).querySelector("[data-rule-measure]") as HTMLElement;
      expect(heading.contains(measure)).toBe(false);
      expect(measure.getAttribute("aria-hidden")).toBe("true");
      expect(measure.className).toContain("invisible");
    } finally {
      for (const spy of restore) spy.mockRestore();
    }
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

  // catches: building drawn as a solid accent dot, or done in the last hour as a ringed olive. Motion is A1's (below).
  it("draws each dot state in its own colour and ring", async () => {
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
    // Lead, after council round 1: no lime rings, so review is the same grey ring, still.
    expect(dot("review").style.boxShadow).toBe(ring(tokens.mutedText));
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
    // the warning) mixed in oklab into the sidebar; the last-hour note is the host's text (#155 lead decision).
    const success = "var(--success, var(--muted-foreground, #b7b7b7))";
    const sidebar = "var(--sidebar, #161616)";
    const roles: Record<string, string> = {
      rule: `color-mix(in oklab, ${success} 40%, ${sidebar})`,
      mutedAccent: `color-mix(in oklab, ${success} 55%, ${sidebar})`,
      brightOlive: `color-mix(in oklab, ${success} 85%, ${sidebar})`,
      doneNote: "var(--foreground)",
      warning: "var(--warning, #fc8c45)",
    };
    for (const [role, value] of Object.entries(roles)) expect.soft(tokens[role as keyof typeof tokens], role).toBe(value);
    const usesWarning = Object.entries(tokens).filter(([, value]) => value.includes("--warning")).map(([role]) => role);
    expect(usesWarning).toEqual(["warning"]);
  });

  // catches (#155 lead decision after #159 R1): a last-hour note tinted toward done, whose contrast a theme tint can pull
  // under 4.5:1 while the host's own text stays readable. The note is exactly the host's text colour; the dots carry "done".
  it("draws the last-hour note in exactly the host's text colour", async () => {
    render();
    await screen.findByText("Sample palette");
    const note = rowOf("Sample palette").querySelector("[data-done-last-hour]") as HTMLElement;
    expect(note.style.color).toBe("var(--foreground)");
  });

  // catches (#162): a later ticket drawn or counted as needs you, its note loud, its dot filled, or its dot out of order.
  it("says K needs you then · L later in muted text, and draws a later ticket as a quiet hollow warning ring after needs you", async () => {
    render({ read: () => ({ kind: "content", text: v4SpecsFileV2Text }) });
    const heading = within(await section()).getByRole("heading");
    await waitFor(() => expect(heading.textContent).toBe("Specs 2 · 2 tickets need you (2 specs)"));
    const palette = rowOf("Sample palette");
    const line = palette.querySelector("[data-spec-line]")!;
    expect([...line.querySelectorAll("[data-spec-name], [data-needs-you], [data-yours-later], [data-done-last-hour], [data-done-total]")]
      .map((el) => el.textContent)).toEqual(["Sample palette", "1 needs you", "· 1 later", "1 done in the last hour", "4/11"]);
    const later = line.querySelector("[data-yours-later]") as HTMLElement;
    expect(later.className).toContain("text-muted-foreground");
    expect(later.style.color).toBe("");
    expect([...palette.querySelectorAll("[data-dot-state]")].map((d) => d.getAttribute("data-dot-state"))).toEqual(
      v4SpecRowsV2.specs[0]!.dots.map((d) => d.state));
    expect(v4SpecRowsV2.specs[0]!.dots.map((d) => d.state).slice(6, 8)).toEqual(["needs-you", "yours-later"]);
    const dot = palette.querySelector('[data-dot-state="yours-later"]') as HTMLElement;
    expect(dot.style.background).toBe("");
    expect(dot.style.boxShadow).toBe("inset 0 0 0 1px color-mix(in oklab, var(--warning, #fc8c45) 60%, transparent)");
    expect(dot.className).not.toContain("animate-pulse");
    expect(palette.querySelector('[role="img"]')!.getAttribute("aria-label")).toContain("1 needs you, 1 later");
    expect(within(rowOf("Sample cache")).queryByText(/later/)).toBeNull();
  });

  // catches (#164 R2): at 320 px the notes squeezing the name to nothing and running into done/total. jsdom has no layout,
  // so this pins the layout rules; the 320 px harness render on #164 shows them in Chromium. The notes sit in one
  // clipped, wrapping line in priority order, so the lowest note (the last) wraps out of sight first; the name keeps
  // a minimum width; done/total never shrinks and sits outside the notes.
  it("keeps the name and done/total, and drops notes lowest first: needs you, then later, then done in the last hour", async () => {
    render({ read: () => ({ kind: "content", text: v4SpecsFileV2Text }) });
    await screen.findByText("Sample palette");
    const line = rowOf("Sample palette").querySelector("[data-spec-line]")!;
    const notes = line.querySelector("[data-notes]") as HTMLElement;
    expect([...notes.children].map((el) => el.textContent)).toEqual(["1 needs you", "· 1 later", "1 done in the last hour"]);
    for (const rule of ["flex-wrap", "overflow-hidden", "min-w-0", "justify-end"]) expect(notes.className).toContain(rule);
    expect(notes.className).toMatch(/\bh-\[/);
    expect(notes.className).not.toContain("shrink-0");
    for (const note of notes.children) expect(note.className).toContain("shrink-0");
    const name = line.querySelector("[data-spec-name]") as HTMLElement;
    expect(name.className).toMatch(/\bmin-w-\[/);
    expect(name.className).toContain("truncate");
    const total = line.querySelector("[data-done-total]")!.parentElement as HTMLElement;
    expect(notes.contains(total)).toBe(false);
    expect(total.className).toContain("shrink-0");
  });

  // catches (#162): a spec whose only owner tickets are later still saying "needs you", or a stray leading dot.
  it("says only L later, muted, when nothing on the spec is due now", async () => {
    const file = JSON.parse(v4SpecsFileV2Text);
    for (const spec of file.specs) for (const ticket of spec.tickets) if (ticket.state === "needs-you") ticket.state = "not-started";
    render({ read: () => ({ kind: "content", text: JSON.stringify(file) }) });
    const heading = within(await section()).getByRole("heading");
    await waitFor(() => expect(heading.textContent).toBe("Specs 2"));
    const line = rowOf("Sample palette").querySelector("[data-spec-line]")!;
    expect(line.querySelector("[data-needs-you]")).toBeNull();
    expect(line.querySelector("[data-yours-later]")!.textContent).toBe("1 later");
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
    // S2 (#185): the CLI lists the quiet finished spec last; the section keeps it in its collapsed Quiet group.
    const main = cli.specs.filter((s: { quiet: boolean }) => !s.quiet);
    expect(main.map(({ activityAt: _a, quiet: _q, ...row }: { activityAt: unknown; quiet: unknown }) => row)).toEqual(v4SpecRows.specs);
    expect(cli.specs.filter((s: { quiet: boolean }) => s.quiet).map((s: { spec: string }) => s.spec)).toEqual(["example/sample-plans#601"]);
    expect(within(region).getByRole("button", { name: "Quiet 1" }).getAttribute("aria-expanded")).toBe("false");
    expect(shown).toEqual({
      rule: `Specs ${main.length} · ${cli.needsYou} tickets need you (${cli.needsYouSpecs} specs)`,
      specs: main.map((s: typeof v4SpecRows.specs[number]) => ({
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

// S1 (#169): the Specs section header collapses like Pinned and Inbox; its rule stays whole, the
// per-spec `specsOpen` is untouched, and Specs keeps its place above the "N running" footer.
describe("S1: the Specs section collapses", () => {
  function renderSidebar(settings: Record<string, string>, updates: unknown[] = []) {
    const stored = { wizdeckFactories: binding, ...settings };
    return renderSlot(app.threadLists[0]!, {
      activeThreadId: null, activeProjectId: null, isCompactViewport: true, onNavigate() {}, searchQuery: "",
    }, {
      pluginId: "wizbar", settings: stored,
      sidebarThreads: { status: "ready", threads: [...v4Threads] },
      rpc: { listLifecycle: () => ({ rows: [] }), specsFile: () => ready,
        cardModels: (input: unknown) => ({ source: "none",
          items: (input as { threadIds: string[] }).threadIds.map((threadId) => ({ threadId, model: null, effort: null })) }) },
      sdk: { plugins: { updateSettings: (async (args: { values: Record<string, string> }) => {
        updates.push(args);
        return { values: { ...stored, ...args.values } };
      }) as never } },
    });
  }
  const toggle = (region: HTMLElement) => within(region).getByRole("button", { name: "Specs 2 · 2 tickets need you (2 specs)" });

  // catches: a collapsed Specs that hides what needs the owner, keeps its rows, or rewrites specsOpen.
  it("collapses to its full rule and no rows, writing only sectionsCollapsed, and expands to the saved open specs", async () => {
    const updates: unknown[] = [];
    renderSidebar({ specsOpen: v4OpenSetting }, updates);
    const region = await section();
    await within(region).findByRole("list", { name: "Sample palette agents" });
    expect(toggle(region).getAttribute("aria-expanded")).toBe("true");
    expect(toggle(region).tagName).toBe("BUTTON");
    fireEvent.click(toggle(region));
    await waitFor(() => expect(toggle(region).getAttribute("aria-expanded")).toBe("false"));
    expect(region.querySelectorAll("[data-spec]").length).toBe(0);
    expect(within(region).getByRole("heading").textContent).toBe("Specs 2 · 2 tickets need you (2 specs)");
    expect(region.querySelector<HTMLElement>("[data-rule-line]")!.style.background).toBe(tokens.rule);
    expect(updates).toEqual([{ pluginId: "wizbar", values: { sectionsCollapsed: "[\"specs\"]" } }]);
    fireEvent.click(toggle(region));
    await waitFor(() => expect(within(region).getByRole("list", { name: "Sample palette agents" })).toBeTruthy());
    expect(updates.at(-1)).toEqual({ pluginId: "wizbar", values: { sectionsCollapsed: "[]" } });
  });

  // catches: a stored collapse ignored on a fresh mount, or Specs moved above the shelves or below the footer.
  it("restores a collapsed Specs on a fresh mount, under the shelves and above the footer", async () => {
    renderSidebar({ sectionsCollapsed: "[\"specs\"]", specsOpen: v4OpenSetting });
    const region = await section();
    await waitFor(() => expect(toggle(region).getAttribute("aria-expanded")).toBe("false"));
    expect(region.querySelectorAll("[data-spec]").length).toBe(0);
    const before = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    const lastCard = screen.getAllByRole("link").filter((link) => !region.contains(link)).at(-1)!;
    expect(before(lastCard, region)).toBe(true);
    expect(before(region, screen.getByRole("status", { name: /^\d+ running$/ }))).toBe(true);
  });
});

// S1 (#184): the Specs section's order and its picker (specs-section.v1.md section 11).
describe("S1: the Specs sort", () => {
  const v6Threads: PluginSidebarThread[] = Object.values(v6Agents).flat().map((agent) => {
    const role = agent.matrix === "reviewing" ? "Reviewer" : "Builder";
    const title = `${role} · SS${agent.ticket!.slice(agent.ticket!.lastIndexOf("#") + 1)}: Sample work`;
    return { ...v4Threads[2]!, id: agent.threadId, title, displayTitle: title, parentThreadId: null, createdAt: agent.updatedAt - 60_000, updatedAt: agent.updatedAt };
  });
  // S2 (#185): quiet specs, the finished one included, sit in the collapsed Quiet group, so the list shows the rest.
  const quietKeys = new Set(v6Activity.filter((c) => c.quiet).map((c) => c.spec));
  const expected = (sort: keyof typeof v6SortOrders) => v6SortOrders[sort].filter((key) => !quietKeys.has(key));
  const v6Read = (): SpecsFileReadV4 => ({ kind: "content", text: v6SpecsFileText });
  function renderV6(settings: Record<string, string> = {}, updateSettings?: (args: unknown) => unknown) {
    vi.setSystemTime(v6Now);
    const updates: unknown[] = [];
    const stored = { wizdeckFactories: binding, ...settings };
    const rendered = renderSlot({ component: SpecsSection }, { ...props, threads: v6Threads, now: v6Now }, {
      pluginId: "wizbar", rpc: { specsFile: v6Read }, settings: stored,
      sdk: { plugins: { updateSettings: (async (args: { values: Record<string, string> }) => {
        updates.push(args);
        return updateSettings ? updateSettings(args) : { values: { ...stored, ...args.values } };
      }) as never } },
    });
    return { rendered, updates };
  }
  const order = (region: HTMLElement) => [...region.querySelectorAll("[data-spec]")].map((el) => el.getAttribute("data-spec"));
  const picker = (region: HTMLElement) => within(region).getByRole("combobox", { name: "Sort specs" }) as HTMLSelectElement;

  // catches: the section still in the file's order, or a stored sort ignored on a fresh mount.
  const cases: [string, SpecsSortV6 | undefined, SpecsSortV6][] = [["no stored sort", undefined, "needs-you"], ...specsSortsV6.map((sort) => [`a stored ${sort}`, sort, sort] as [string, SpecsSortV6, SpecsSortV6])];
  it.each(cases)(
    "shows the rows in the sort for %s", async (_name, stored, sort) => {
      renderV6(stored === undefined ? {} : { specsSort: stored });
      const region = await section();
      await waitFor(() => expect(order(region)).toEqual(expected(sort)));
      expect(picker(region).value).toBe(sort);
    });

  // catches: a picker offering other sorts, or one inside the rule's heading so its text joins the heading's.
  it("offers exactly the four sorts, beside the rule and outside its heading", async () => {
    renderV6();
    const region = await section();
    await waitFor(() => expect(order(region).length).toBeGreaterThan(0));
    expect([...picker(region).options].map((o) => [o.value, o.textContent])).toEqual([
      ["needs-you", "Needs you first"], ["recent", "Recently active"], ["closest", "Closest to done"], ["newest", "Newest"],
    ]);
    expect(within(region).getByRole("heading").contains(picker(region))).toBe(false);
  });

  // catches: a picker out of the tab order, a choice that waits for the save to show, or a write touching other keys.
  it("is reachable by keyboard, reorders at once, and remembers the choice in specsSort only", async () => {
    const { updates } = renderV6();
    const region = await section();
    await waitFor(() => expect(order(region)).toEqual(expected("needs-you")));
    const select = picker(region);
    expect(select.tabIndex).toBe(0);
    expect(select.disabled).toBe(false);
    select.focus();
    expect(document.activeElement).toBe(select);
    fireEvent.change(select, { target: { value: "closest" } });
    expect(order(region)).toEqual(expected("closest"));
    await waitFor(() => expect(updates).toEqual([{ pluginId: "wizbar", values: { specsSort: "closest" } }]));
    expect(picker(region).value).toBe("closest");
  });

  // catches: a failed save leaving the unsaved order on screen as if it were remembered.
  it("says so when the sort cannot be saved, and goes back to the stored sort", async () => {
    renderV6({ specsSort: "recent" }, () => { throw new Error("refused"); });
    const region = await section();
    await waitFor(() => expect(order(region)).toEqual(expected("recent")));
    fireEvent.change(picker(region), { target: { value: "newest" } });
    expect(await within(region).findByText("Could not save the sort. Try again.")).toBeTruthy();
    expect(order(region)).toEqual(expected("recent"));
    expect(picker(region).value).toBe("recent");
  });
});

// WizBar 0.6.0 A1 (#186): the activity look (specs-section.v1.md section 13). The browser's Web Animations call is the
// seam: a fake `Element.prototype.animate` records what the section asks the browser for; the harness frame series
// on the pull request shows the real breath in Chromium.
describe("A1: active specs breathe, inactive names are muted", () => {
  interface FakeAnimation { el: HTMLElement; keyframes: unknown; options: unknown; playState: "running" | "paused" | "idle"; startTime: number | null }
  let animations: FakeAnimation[] = [];
  let visibility: DocumentVisibilityState = "visible";
  let observed: ((entries: { isIntersecting: boolean }[]) => void)[] = [];
  function fakeAnimate(this: HTMLElement, keyframes: unknown, options: unknown) {
    let start: number | null = null;
    const animation = {
      el: this, keyframes, options, playState: "running" as FakeAnimation["playState"],
      get startTime() { return start; },
      // As in the Web Animations spec: setting a start time plays a paused animation from that time.
      set startTime(value: number | null) { start = value; if (value !== null && animation.playState !== "idle") animation.playState = "running"; },
      play() { if (animation.playState !== "running") { animation.playState = "running"; start = null; } },
      pause() { animation.playState = "paused"; start = null; },
      cancel() { animation.playState = "idle"; start = null; },
    };
    animations.push(animation);
    return animation;
  }
  function reducedMotion(reduce: boolean) {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: reduce && query === "(prefers-reduced-motion: reduce)", media: query, addEventListener() {}, removeEventListener() {},
    }));
  }
  beforeEach(() => {
    animations = [];
    visibility = "visible";
    observed = [];
    reducedMotion(false);
    (HTMLElement.prototype as unknown as { animate: unknown }).animate = fakeAnimate;
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) { observed.push(callback); }
      observe() {}
      disconnect() {}
      unobserve() {}
    });
  });
  afterEach(() => {
    delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
    delete (document as unknown as { visibilityState?: unknown }).visibilityState;
    vi.unstubAllGlobals();
  });
  const dot = (spec: string, state: string) => rowOf(spec).querySelector(`[data-dot-state="${state}"]`) as HTMLElement;
  const live = () => animations.filter((a) => a.playState !== "idle");
  const setVisibility = (next: DocumentVisibilityState) => act(() => { visibility = next; document.dispatchEvent(new Event("visibilitychange")); });

  // catches: 0.5's pulse on every building dot, a reviewed ticket breathing, dots each on their own clock, or a livelier breath.
  it("breathes only the dots a working agent names, all on one clock, one soft breath every 2 s", async () => {
    render();
    await screen.findByText("Sample palette");
    // Palette: SP-2 (building) and SP-4 (needs you) are each named by a working builder; SP-3 only by a reviewer.
    const breathing = [dot("Sample palette", "building"), dot("Sample palette", "needs-you")];
    await waitFor(() => expect(live().map((a) => a.el)).toEqual(breathing));
    for (const animation of live()) {
      expect(animation.keyframes).toEqual([{ opacity: 1 }, { opacity: 0.4 }, { opacity: 1 }]);
      expect(animation.options).toEqual({ duration: 2000, iterations: Infinity, easing: "ease-in-out" });
      // One shared clock: every breath starts at the document timeline's zero, so all are at the same phase.
      expect(animation.startTime).toBe(0);
      expect(animation.playState).toBe("running");
    }
    for (const still of [dot("Sample palette", "review"), dot("Sample cache", "building"), dot("Sample palette", "done")]) {
      expect(animations.some((a) => a.el === still)).toBe(false);
      expect(still.className).not.toMatch(/animate-/);
    }
    expect(document.querySelector("[class*='animate-pulse']")).toBeNull();
  });

  // catches: motion forced on someone who asked their system for less.
  it("breathes nothing under reduced motion: every dot at full opacity", async () => {
    reducedMotion(true);
    render();
    await screen.findByText("Sample palette");
    expect(animations).toEqual([]);
    expect(dot("Sample palette", "building").style.opacity).toBe("");
  });

  // catches: a breath burning frames while the sidebar is hidden or scrolled away, or dots out of step after it returns.
  it("pauses while the document is hidden or the section is off screen, and resumes in step", async () => {
    render();
    await screen.findByText("Sample palette");
    await waitFor(() => expect(live().length).toBe(2));
    setVisibility("hidden");
    expect(live().map((a) => a.playState)).toEqual(["paused", "paused"]);
    setVisibility("visible");
    expect(live().map((a) => [a.playState, a.startTime])).toEqual([["running", 0], ["running", 0]]);
    expect(observed.length).toBeGreaterThan(0);
    act(() => { for (const callback of observed) callback([{ isIntersecting: false }]); });
    expect(live().map((a) => a.playState)).toEqual(["paused", "paused"]);
    act(() => { for (const callback of observed) callback([{ isIntersecting: true }]); });
    expect(live().map((a) => [a.playState, a.startTime])).toEqual([["running", 0], ["running", 0]]);
    // Still the first two animations: nothing remounted or restarted out of step.
    expect(animations.length).toBe(2);
  });

  // catches: a row or dot remounted (a flash) when its builder stops, or a breath left running on a dot nobody works on.
  it("stops a dot's breath in place when its builder stops", async () => {
    const { rendered } = render();
    await screen.findByText("Sample palette");
    const building = dot("Sample palette", "building");
    const row = rowOf("Sample palette");
    await waitFor(() => expect(live().length).toBe(2));
    act(() => rendered.lifecycle.rerender(<SpecsSection {...props} threads={v4Threads.filter((t) => t.id !== "thr_v4_builder_a")} />));
    await waitFor(() => expect(live().map((a) => a.el)).toEqual([dot("Sample palette", "needs-you")]));
    expect(dot("Sample palette", "building")).toBe(building);
    expect(rowOf("Sample palette")).toBe(row);
  });

  // catches: an idle spec as bright as a busy one, a later-only spec kept bright, or a running spec muted; a name colour from
  // anything but the host's text variables; the row remounting when the spec goes quiet.
  it("mutes the name of a spec with nothing running and nothing due now, in place", async () => {
    // Nothing due now anywhere; palette keeps one later ticket, which does not keep its name bright.
    const file = JSON.parse(v4SpecsFileV2Text);
    for (const spec of file.specs) for (const ticket of spec.tickets) if (ticket.state === "needs-you") ticket.state = "not-started";
    const { rendered } = render({ read: () => ({ kind: "content", text: JSON.stringify(file) }) });
    await screen.findByText("Sample palette");
    const name = (spec: string) => rowOf(spec).querySelector("[data-spec-name]") as HTMLElement;
    // Palette has running agents: bright. Cache has none and nothing due now: muted.
    expect(name("Sample palette").style.color).toBe("var(--foreground)");
    expect(name("Sample cache").style.color).toBe("var(--muted-foreground, #b7b7b7)");
    expect(tokens.mutedText).toBe("var(--muted-foreground, #b7b7b7)");
    // The row stays mounted (section 13: keyed by spec). 0.5's chevron button wraps the name only while a spec has agents,
    // so the name's own node follows that, as in 0.5.
    const row = rowOf("Sample palette");
    act(() => rendered.lifecycle.rerender(<SpecsSection {...props} threads={[]} />));
    await waitFor(() => expect(name("Sample palette").style.color).toBe("var(--muted-foreground, #b7b7b7)"));
    expect(rowOf("Sample palette")).toBe(row);
  });

  // catches: a spec with a ticket due now muted because nothing runs on it.
  it("keeps a spec bright while a ticket is due now, even with nothing running", async () => {
    render();
    await screen.findByText("Sample cache");
    expect((rowOf("Sample cache").querySelector("[data-spec-name]") as HTMLElement).style.color).toBe("var(--foreground)");
  });
});

// S2 (#185): finished and idle specs fold into one collapsed Quiet group (specs-section.v1.md section 12).
describe("S2: the Quiet group", () => {
  const v6Threads: PluginSidebarThread[] = Object.values(v6Agents).flat().map((agent) => {
    const role = agent.matrix === "reviewing" ? "Reviewer" : "Builder";
    const title = `${role} · SS${agent.ticket!.slice(agent.ticket!.lastIndexOf("#") + 1)}: Sample work`;
    return { ...v4Threads[2]!, id: agent.threadId, title, displayTitle: title, parentThreadId: null, createdAt: agent.updatedAt - 60_000, updatedAt: agent.updatedAt };
  });
  function renderV6(settings: Record<string, string> = {}, updateSettings?: (args: unknown) => unknown) {
    vi.setSystemTime(v6Now);
    const updates: unknown[] = [];
    const stored = { wizdeckFactories: binding, ...settings };
    const rendered = renderSlot({ component: SpecsSection }, { ...props, threads: v6Threads, now: v6Now }, {
      pluginId: "wizbar", rpc: { specsFile: (): SpecsFileReadV4 => ({ kind: "content", text: v6SpecsFileText }) }, settings: stored,
      sdk: { plugins: { updateSettings: (async (args: { values: Record<string, string> }) => {
        updates.push(args);
        return updateSettings ? updateSettings(args) : { values: { ...stored, ...args.values } };
      }) as never } },
    });
    return { rendered, updates };
  }
  const order = (region: HTMLElement) => [...region.querySelectorAll("[data-spec]")].map((el) => el.getAttribute("data-spec"));
  const group = (region: HTMLElement) => within(region).getByRole("button", { name: /^Quiet \d+$/ });

  // catches: quiet specs left in the main list, a group that starts open, a header above the main list, or a rule counting quiet specs.
  it("folds quiet specs into a collapsed Quiet 2 at the bottom, and counts only the main list in the rule", async () => {
    renderV6();
    const region = await section();
    await waitFor(() => expect(order(region)).toEqual([...v6QuietSplit.main]));
    expect(within(region).getByRole("heading", { name: v6QuietSplit.rule })).toBeTruthy();
    const header = group(region);
    expect(header.textContent).toBe("Quiet2");
    expect(header.getAttribute("aria-expanded")).toBe("false");
    // The group's header follows every main row.
    const last = region.querySelector(`[data-spec="${v6QuietSplit.main.at(-1)}"]`)!;
    expect(last.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // catches: a group that opens without saving, saves another key, or loses the specs' own open keys.
  it("opens like a spec: its rows follow the header in the sort's order, remembered as quiet in specsOpen", async () => {
    const { updates } = renderV6({ specsOpen: "[\"example/sample-sort#711\"]" });
    const region = await section();
    await waitFor(() => expect(order(region)).toEqual([...v6QuietSplit.main]));
    fireEvent.click(group(region));
    expect(order(region)).toEqual([...v6QuietSplit.main, ...v6QuietSplit.quiet]);
    expect(group(region).getAttribute("aria-expanded")).toBe("true");
    await waitFor(() => expect(updates).toEqual([{ pluginId: "wizbar", values: { specsOpen: "[\"example/sample-sort#711\",\"quiet\"]" } }]));
    fireEvent.click(group(region));
    expect(order(region)).toEqual([...v6QuietSplit.main]);
    await waitFor(() => expect(updates.at(-1)).toEqual({ pluginId: "wizbar", values: { specsOpen: "[\"example/sample-sort#711\"]" } }));
  });

  // catches: a stored open group shown closed on a fresh mount.
  it("restores an open group on a fresh mount", async () => {
    renderV6({ specsOpen: "[\"quiet\"]" });
    const region = await section();
    await waitFor(() => expect(order(region)).toEqual([...v6QuietSplit.main, ...v6QuietSplit.quiet]));
    expect(group(region).getAttribute("aria-expanded")).toBe("true");
  });

  // catches: an empty group header drawn when nothing is quiet.
  it("shows no group when nothing is quiet", async () => {
    render({ settings: { specsOpen: v4OpenSetting }, now: v4Now });
    const region = await section();
    await waitFor(() => expect(order(region).length).toBeGreaterThan(0));
    // v4's finished spec is quiet; with it gone nothing is.
    expect(within(region).queryByRole("button", { name: /^Quiet/ })).not.toBeNull();
    cleanup();
    const file = JSON.parse(v4SpecsFileText);
    file.specs = file.specs.filter((spec: { shortName: string }) => spec.shortName !== "Sample finished");
    render({ settings: { specsOpen: v4OpenSetting }, read: () => ({ kind: "content", text: JSON.stringify(file) }) });
    const again = await section();
    await waitFor(() => expect(order(again).length).toBe(2));
    expect(within(again).queryByRole("button", { name: /^Quiet/ })).toBeNull();
  });
});

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { hasRuntimeWork } from "../lifecycle";
import { classifyMachine } from "../machine-source";
import {
  dotOrderV4, hostTokensV4, v4CardPinCases, matrixMarksV4, modelSourceV4, v4Matching, v4Matrix, v4OpenSettingCases,
  v4PullRequests, v4SpecRows, v4SpecsFile, v4SpecsFileText, v4SpecsReadCases, v4Stats, v4Threads, v4TitleCases,
  type SpecsUnavailableReasonV4,
} from "./v4";

// ---- Theme check (contract section 9) ----------------------------------------
// WizBar takes every colour from the host's theme variables. A literal colour
// is allowed only as the contract's fallback for its own host variable.

const root = join(import.meta.dirname, "..", "..");
const colourFunction = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/g;
const hex = /(?<![\w&$])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
const palette = /\b(?:text|bg|border(?:-[xytrblse])?|fill|stroke|ring(?:-offset)?|outline|decoration|from|via|to|shadow|accent|caret|divide(?:-[xy])?|placeholder)-(?:(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}|black|white)\b/g;
const arbitrary = /\b[a-z-]+-\[(?:#|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(|color:#)[^\]]*\]/g;
const arbitraryKeyword = /\b(?:text|bg|border(?:-[xytrblse])?|fill|stroke|ring(?:-offset)?|outline|decoration|from|via|to|shadow|accent|caret|divide(?:-[xy])?|placeholder)-\[([a-zA-Z]+)\]/g;
const keyword = /\b(?:color|background|fill|stroke|[a-zA-Z]+Color)\s*:\s*["']([a-zA-Z]+)["']/g;
const attribute = /\b(?:fill|stroke|color|stopColor|floodColor|lightingColor)=["']([a-zA-Z]+)["']/g;
const declaration = /\b(?:color|background(?:-color)?|border(?:-[a-z]+)?-color|outline-color|fill|stroke)\s*:\s*([a-z]+)\s*[;}]/g;
const notColours = new Set(["transparent", "currentColor", "currentcolor", "inherit", "initial", "unset", "none"]);

/** Comments hold issue numbers like `#160`; they are not styles. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

/** Every hard-coded colour in one source text, after removing the allowed fallbacks. */
export function hardCodedColours(source: string): string[] {
  let text = stripComments(source);
  for (const token of hostTokensV4) {
    if (token.fallback === null) continue;
    text = text.split(`var(${token.variable}, ${token.fallback})`).join(`var(${token.variable})`);
  }
  const found: string[] = [];
  // Each kind is blanked out once found, so `bg-[#161616]` counts once, not again as a hex.
  const named = [arbitraryKeyword, keyword, attribute, declaration];
  for (const pattern of [arbitrary, palette, ...named, colourFunction, hex]) {
    text = text.replace(pattern, (match: string, word?: unknown) => {
      if (named.includes(pattern) && notColours.has(String(word))) return match;
      found.push(match);
      return " ";
    });
  }
  return found;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" || entry.name === "fixtures" ? [] : sourceFiles(path);
    return /\.(?:tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("theme: host variables only (specs-section contract, section 9)", () => {
  it("finds each kind of hard-coded colour and passes host variables and their own fallbacks", () => {
    expect(hardCodedColours(`style={{ color: "#c6f432" }}`)).toEqual(["#c6f432"]);
    expect(hardCodedColours("background: `oklch(0.72 0.13 ${hue})`")).toEqual(["oklch("]);
    expect(hardCodedColours(`className="text-amber-500 bg-[#161616]"`)).toEqual(["bg-[#161616]", "text-amber-500"]);
    expect(hardCodedColours(`style={{ color: "red", fill: "currentColor" }}`)).toEqual([`color: "red"`]);
    expect(hardCodedColours(`<circle fill="red" stroke="currentColor" />`)).toEqual([`fill="red"`]);
    expect(hardCodedColours(`.dot { color: red; background: transparent; }`)).toEqual(["color: red;"]);
    expect(hardCodedColours(`style={{ background: "rgb(1 2 3)" }}`)).toEqual(["rgb("]);
    expect.soft(hardCodedColours(`className="text-[red] w-[auto] text-[inherit]"`)).toEqual(["text-[red]"]);
    expect.soft(hardCodedColours(`className="border-x-black divide-y-zinc-800 ring-offset-white"`)).toEqual(["border-x-black", "divide-y-zinc-800", "ring-offset-white"]);
    expect.soft(hardCodedColours(`style={{ borderTopColor: "red", stopColor: "inherit" }}`)).toEqual([`borderTopColor: "red"`]);
    expect(hardCodedColours(`color: "var(--muted, #3a3a3d)"`)).toEqual([]);
    // A fallback counts only for its own variable.
    expect(hardCodedColours(`color: "var(--primary, #c0ff04)"`)).toEqual([]);
    expect(hardCodedColours(`color: "var(--warning, #c0ff04)"`)).toEqual(["#c0ff04"]);
    expect(hardCodedColours(`color: "var(--foreground)", border: "1px solid var(--border)"`)).toEqual([]);
    expect(hardCodedColours(`// see #160 and #1434\nconst label = \`PR #\${n}\`;`)).toEqual([]);
  });

  it("finds no hard-coded colour anywhere in WizBar's source", () => {
    const found = sourceFiles(root).flatMap((path) => {
      const file = relative(root, path);
      return hardCodedColours(readFileSync(path, "utf8")).map((text) => ({ file, text }));
    });
    expect(found).toEqual([]);
  });
});

// ---- Fixtures (contract sections 1 to 8) ------------------------------------
// WB4-1 to WB4-3 test their readers, rows, matching, matrix and stats against
// these fixtures. A fixture that silently lost a case (no stale file, no spec
// without agents, no unmatched thread) would let them pass without exercising
// it; one that disagreed with the shipped 0.3 readers would make them encode a
// wrong answer. The shipped readers used here are independent of 0.4 code,
// which does not exist yet.

const byId = new Map(v4Threads.map((t) => [t.id, t]));
const running = v4Threads.filter((t) => hasRuntimeWork(t.runtimeStatus, Object.values(t.activity)) && !t.hasPendingInteraction);
const reasons: readonly SpecsUnavailableReasonV4[] = ["no-binding", "missing", "unreadable", "malformed", "unknown-schema", "stale"];

describe("V4: synthetic v0.4 fixtures cover the contract's cases", () => {
  it("uses only made-up ids, repositories and titles, with no paths", () => {
    expect(byId.size).toBe(v4Threads.length);
    for (const t of v4Threads) {
      expect(t.id).toMatch(/^thr_v4_[a-z0-9_]+$/);
      expect(t.displayTitle).toContain("Sample ");
      expect(t.environment?.path ?? null).toBeNull();
    }
    for (const spec of v4SpecsFile.specs) {
      expect(spec.spec).toMatch(/^example\/sample-[a-z]+#[1-9][0-9]*$/);
      for (const t of spec.tickets) expect(t.ticket).toMatch(/^example\/sample-[a-z]+#[1-9][0-9]*$/);
    }
  });

  it("has a read case for every unavailable reason, with the 30-minute and 5-minute edges", () => {
    const got = v4SpecsReadCases.map((c) => (c.expected.status === "ready" ? "ready" : c.expected.reason));
    expect(new Set(got)).toEqual(new Set(["ready", ...reasons]));
    const age = (c: (typeof v4SpecsReadCases)[number]) => {
      if (c.read.kind !== "content") return null;
      try { return c.now - Date.parse((JSON.parse(c.read.text) as { generatedAt: string }).generatedAt); } catch { return null; }
    };
    const is = (c: (typeof v4SpecsReadCases)[number], want: string) =>
      (c.expected.status === "ready" ? "ready" : c.expected.reason) === want;
    const minute = 60_000;
    expect(v4SpecsReadCases.some((c) => age(c) === 30 * minute && is(c, "ready"))).toBe(true);
    expect(v4SpecsReadCases.some((c) => (age(c) ?? 0) > 30 * minute && is(c, "stale"))).toBe(true);
    expect(v4SpecsReadCases.some((c) => age(c) === -5 * minute && is(c, "ready"))).toBe(true);
    expect(v4SpecsReadCases.some((c) => (age(c) ?? 0) < -5 * minute && is(c, "malformed"))).toBe(true);
    expect(JSON.parse(v4SpecsFileText)).toEqual(v4SpecsFile);
  });

  it("states rows for visible specs only: a spec with no agents shown, finished and empty specs hidden", () => {
    const visible = v4SpecsFile.specs.filter((s) => s.tickets.length > 0 && s.tickets.some((t) => t.state !== "done"));
    expect(v4SpecRows.specs.map((r) => r.spec)).toEqual(visible.map((s) => s.spec));
    expect(v4SpecsFile.specs.some((s) => s.tickets.length > 0 && s.tickets.every((t) => t.state === "done"))).toBe(true);
    expect(v4SpecsFile.specs.some((s) => s.tickets.length === 0)).toBe(true);
    expect(v4SpecRows.specs.some((r) => r.agents.length === 0)).toBe(true);
    expect(v4SpecRows.needsYou).toBe(v4SpecRows.specs.reduce((sum, r) => sum + r.needsYou, 0));
    for (const row of v4SpecRows.specs) {
      const spec = v4SpecsFile.specs.find((s) => s.spec === row.spec);
      // One dot per ticket of the file, in dot-state order.
      expect(row.dots.map((d) => d.ticket).sort()).toEqual(spec?.tickets.map((t) => t.ticket).sort());
      expect(row.total).toBe(spec?.tickets.length);
      const order = row.dots.map((d) => dotOrderV4.indexOf(d.state));
      expect(order).toEqual([...order].sort((a, b) => a - b));
    }
    expect(new Set(v4SpecRows.specs.flatMap((r) => r.dots.map((d) => d.state)))).toEqual(new Set(dotOrderV4));
  });

  it("matches only running rows, and has agents by fleet parent, by code, of a hidden spec and of none", () => {
    expect(Object.keys(v4Matching).sort()).toEqual(running.map((t) => t.id).sort());
    expect(Object.values(v4Matching)).toContain(null);
    const hidden = v4SpecsFile.specs.filter((s) => !v4SpecRows.specs.some((r) => r.spec === s.spec)).map((s) => s.spec);
    expect(Object.values(v4Matching).some((spec) => spec !== null && hidden.includes(spec))).toBe(true);
    for (const row of v4SpecRows.specs) {
      expect(row.agents.map((a) => a.threadId).sort()).toEqual(
        Object.entries(v4Matching).filter(([, spec]) => spec === row.spec).map(([id]) => id).sort(),
      );
      for (const a of row.agents) {
        expect(a.title).toBe(byId.get(a.threadId)?.displayTitle);
        expect(a.providerId).toBe(byId.get(a.threadId)?.providerId);
        expect(a.matrix).toBe(v4Matrix[a.threadId]?.server);
      }
    }
    expect(v4TitleCases.some(([, role]) => role === null)).toBe(true);
    expect(v4TitleCases.some(([, role]) => role !== null)).toBe(true);
  });

  it("has every matrix state in the app, distinct marks, and pull-request states only in the app", () => {
    expect(Object.keys(v4Matrix).sort()).toEqual([...byId.keys()].sort());
    expect(new Set(Object.values(v4Matrix).map((m) => m.app))).toEqual(new Set(Object.keys(matrixMarksV4)));
    for (const [id, m] of Object.entries(v4Matrix)) {
      if (m.app !== m.server) {
        expect(v4PullRequests[id], id).toBeDefined();
        expect(m.server).toBe("idle");
      }
    }
    const masks = Object.values(matrixMarksV4).map((m) => m.mask);
    expect(new Set(masks).size).toBe(masks.length);
    for (const mask of masks) expect(mask).toMatch(/^[01]{9}$/);
  });

  it("states stats from the 0.3 running rule, with the harness split and every running thread", () => {
    if (v4Stats.status !== "ready") throw new Error("fixture stats must be ready");
    expect(v4Stats.running.total).toBe(running.length);
    expect(v4Stats.running.topLevel).toBe(running.filter((t) => t.parentThreadId === null).length);
    expect([v4Stats.running.cloud, v4Stats.running.local, v4Stats.running.unknown]).toEqual(
      (["Cloud", "Local", null] as const).map((kind) => running.filter((t) => classifyMachine(t) === kind).length),
    );
    expect(v4Stats.waitingOnYou).toBe(v4Threads.filter((t) => t.hasPendingInteraction).length);
    expect(v4Stats.harness.reduce((sum, h) => sum + h.count, 0)).toBe(running.length);
    expect(v4Stats.threads.map((t) => t.id)).toEqual(
      [...running].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1)).map((t) => t.id),
    );
    const visible = new Set(v4SpecRows.specs.map((r) => r.spec));
    for (const t of v4Stats.threads) {
      const spec = v4Matching[t.id] ?? null;
      expect(t.spec, t.id).toBe(spec !== null && visible.has(spec) ? spec : null);
      expect(t.matrix).toBe(v4Matrix[t.id]?.server);
    }
  });

  it("counts a thread running subagents once, and states every hover-card state and event", () => {
    if (v4Stats.status !== "ready") throw new Error("fixture stats must be ready");
    const withSubagents = running.filter((t) => t.activity.backgroundAgents > 0);
    expect(withSubagents.length).toBe(1);
    expect(v4Stats.threads.filter((t) => t.id === withSubagents[0]?.id).length).toBe(1);
    const pairs = v4CardPinCases.map(([state, event]) => `${state} ${event}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(pairs.length).toBe(3 * 6);
  });

  it("keeps model and effort omitted until the live observation adopts the source", () => {
    expect(modelSourceV4.adopted).toBe(false);
    const all = [...v4SpecRows.specs.flatMap((r) => r.agents), ...(v4Stats.threads ?? [])];
    expect(all.every((a) => a.model === null && a.effort === null)).toBe(true);
  });

  it("has open-setting cases for missing, valid, malformed and non-string values, and fallbacks per variable", () => {
    expect(v4OpenSettingCases.some(([raw]) => raw === undefined)).toBe(true);
    expect(v4OpenSettingCases.some(([, open]) => open.length > 0)).toBe(true);
    expect(v4OpenSettingCases.filter(([, open]) => open.length === 0).length).toBeGreaterThanOrEqual(4);
    expect(new Set(hostTokensV4.map((t) => t.variable)).size).toBe(hostTokensV4.length);
    for (const t of hostTokensV4) if (t.fallback !== null) expect(t.fallback).toMatch(/^#[0-9a-f]{6}$/);
  });
});

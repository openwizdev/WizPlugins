// 0.5.0 A (openwizdev/WizPlugins#110), P1: the specs producer against recorded
// synthetic GitHub answers (recorded.ts). The written file must read as ready
// through WizBar's own reader (specs-section.v1.md section 1).
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readSpecsFile } from "../../src/specs/read";
import { runOnce, shortNameOf, ticketCodeOf } from "./producer";
import { fakeGitHub, FLEET, TOOLS } from "./recorded";

const NOW = new Date("2026-11-20T12:00:00Z");
const LATER = new Date("2026-11-20T12:10:00Z");
const repositories = [FLEET, TOOLS];
const homes: string[] = [];
afterEach(async () => { for (const home of homes.splice(0)) await rm(home, { recursive: true, force: true }); });
async function home() {
  const dir = await mkdtemp(join(tmpdir(), "specs-producer-"));
  homes.push(dir);
  return dir;
}
const output = (dir: string) => join(dir, ".openwiz", "specs.v1.json");

const t = (repo: string, n: number, code: string | null, title: string, state: string, closedAt: string | null = null, pulls: number[] = []) =>
  ({ ticket: `${repo}#${n}`, code, title, state, closedAt, pulls });
/** Worked out by hand from recorded.ts and the ticket's rules. */
const kernel = {
  spec: `${FLEET}#900`, shortName: "Sample kernel", url: `https://github.com/${FLEET}/issues/900`, fleetThreadId: null,
  tickets: [
    t(FLEET, 901, "KN1", "0.1.0 KN1: Sample records shape", "done", "2026-11-19T10:00:00Z"),
    t(FLEET, 902, "KN2", "0.1.0 KN2: Sample the driver", "building", null, [950]),
    // Pull 40 lives in sample-tools: only pulls in the ticket's own repository count.
    t(FLEET, 903, "KN3", "0.1.0 KN3: Sample the reader", "review", null, [951]),
    t(FLEET, 904, "AP11", "0.1.0 AP11: Sample app shell", "needs-you"),
    t(FLEET, 905, "KN5", "0.1.0 KN5: Sample waits on a question", "held"),
    // 906 was closed as not planned: left out.
    t(FLEET, 907, null, "Sample uncoded work", "not-started"),
    t(FLEET, 908, "KN8", "0.1.0 KN8: Sample held with a pull", "held", null, [952]),
    t(FLEET, 909, "KN9", "0.1.0 KN9: Sample only mentioned", "not-started"),
    t(TOOLS, 31, "KN10", "0.1.0 KN10: Sample tool hook", "not-started"),
  ],
};
const filler = (i: number) => {
  const repo = i < 7 ? FLEET : TOOLS;
  const n = 1000 + i * 10;
  return {
    spec: `${repo}#${n}`, shortName: `Sample filler ${i + 1}`, url: `https://github.com/${repo}/issues/${n}`, fleetThreadId: null,
    tickets: [t(repo, n + 1, `F${i}1`, "0.2.0 F" + i + "1: Sample first", "not-started"), t(repo, n + 2, `F${i}2`, "0.2.0 F" + i + "2: Sample second", "done", "2026-11-19T11:00:00Z")],
  };
};
const expectedFile = {
  schema: "openwiz.specs.v1", generatedAt: "2026-11-20T12:00:00Z",
  specs: [kernel, ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map(filler)],
};

describe("P1: one run writes a file WizBar reads as ready", () => {
  // catches: wrong states, codes, short names or close times; a not-planned ticket kept; pull requests or plain issues read as specs.
  it("writes the hand-worked file for the recorded answers", async () => {
    const dir = await home();
    const github = fakeGitHub();
    expect(await runOnce({ home: dir, repositories, request: github.request, now: () => NOW })).toEqual({ ok: true, calls: 15, specs: 10 });
    const text = await readFile(output(dir), "utf8");
    expect(JSON.parse(text)).toEqual(expectedFile);
    expect(readSpecsFile({ kind: "content", text }, NOW.getTime())).toEqual({ status: "ready", file: expectedFile });
  });

  // catches: a loose short-name or code rule that keeps the version, the `spec:` word or the task.
  it.each([
    ["0.1.0 spec: The kernel: records v1 and the driver", "The kernel"],
    ["spec: Sample palette", "Sample palette"],
    ["Sample plan with no marker", "Sample plan with no marker"],
    ["0.3.0 spec: A short name that runs on well past forty characters: tail", "A short name that runs on well past for…"],
    ["0.3.0 spec:  : nothing", "#77"],
  ])("short name of %j", (title, expected) => {
    expect(shortNameOf(title, 77)).toBe(expected);
  });
  it.each([
    ["0.1.0 KN3: the driver reads", "KN3"],
    ["AP11: the app", "AP11"],
    ["WizBar 0.5.0 A: live specs data", null],
    ["0.1.0 KN3 the driver, no colon", null],
    ["0.1.0 ABCD1: four letters", null],
    ["0.1.0 kn3: lower case", null],
  ])("ticket code of %j", (title, expected) => {
    expect(ticketCodeOf(title)).toBe(expected);
  });
});

describe("P1: unchanged answers cost nothing", () => {
  // catches: a run that ignores its ETag cache, re-reads every page in full, or loses the second page on a 304.
  it("a second run sends only conditional requests, under 60 for 10 specs, and writes the same specs", async () => {
    const dir = await home();
    const github = fakeGitHub();
    await runOnce({ home: dir, repositories, request: github.request, now: () => NOW });
    github.calls.length = 0;
    expect(await runOnce({ home: dir, repositories, request: github.request, now: () => LATER })).toEqual({ ok: true, calls: 15, specs: 10 });
    expect(github.calls.length).toBeLessThan(60);
    expect(github.calls.every((call) => call.etag !== null && call.status === 304)).toBe(true);
    expect(JSON.parse(await readFile(output(dir), "utf8"))).toEqual({ ...expectedFile, generatedAt: "2026-11-20T12:10:00Z" });
  });
});

describe("P1: a failed read keeps the last file", () => {
  // catches: a partial file written mid-run, a temp file left behind, or an error page saved as data.
  it.each([
    ["a server error on the pull requests", (g: ReturnType<typeof fakeGitHub>) => g.failNext(`repos/${TOOLS}/pulls?state=open&per_page=100`)],
    ["a missing spec's sub-issues", (g: ReturnType<typeof fakeGitHub>) => g.failNext(`repos/${FLEET}/issues/900/sub_issues?per_page=100`, 404)],
    ["a rate limit on the second page", (g: ReturnType<typeof fakeGitHub>) => g.failNext(`repos/${FLEET}/issues?state=open&per_page=100&page=2`, 403)],
  ])("%s", async (_name, breakIt) => {
    const dir = await home();
    const github = fakeGitHub();
    await runOnce({ home: dir, repositories, request: github.request, now: () => NOW });
    const before = await readFile(output(dir), "utf8");
    const filesBefore = await readdir(join(dir, ".openwiz"));
    breakIt(github);
    const result = await runOnce({ home: dir, repositories, request: github.request, now: () => LATER });
    expect(result.ok).toBe(false);
    expect(await readFile(output(dir), "utf8")).toBe(before);
    expect(await readdir(join(dir, ".openwiz"))).toEqual(filesBefore);
  });

  it("a request that throws (no gh, no network) writes nothing on a first run", async () => {
    const dir = await home();
    const result = await runOnce({ home: dir, repositories, request: async () => { throw new Error("spawn gh ENOENT"); }, now: () => NOW });
    expect(result).toEqual({ ok: false, calls: 1, error: "spawn gh ENOENT" });
    await expect(readFile(output(dir), "utf8")).rejects.toThrow();
  });

  // catches: an answer of the wrong shape saved as an empty spec list.
  it("an answer that is not a list keeps the last file", async () => {
    const dir = await home();
    const github = fakeGitHub();
    await runOnce({ home: dir, repositories, request: github.request, now: () => NOW });
    const before = await readFile(output(dir), "utf8");
    const odd = fakeGitHub(new Map([[`repos/${FLEET}/issues?state=open&per_page=100`, { body: { message: "odd" } }]]));
    expect((await runOnce({ home: dir, repositories, request: odd.request, now: () => LATER })).ok).toBe(false);
    expect(await readFile(output(dir), "utf8")).toBe(before);
  });
});

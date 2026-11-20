// 0.5.0 A (openwizdev/WizPlugins#110), P1: the specs producer against recorded
// synthetic GitHub answers (recorded.ts). The written file must read as ready
// through WizBar's own reader (specs-section.v1.md section 1).
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readSpecsFile } from "../../src/specs/read";
import { runOnce, shortNameOf, ticketCodeOf } from "./producer";
import { fakeGitHub, FLEET, recordedAnswers, TOOLS } from "./fixtures/recorded";

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
    // Its pull 41 is in sample-tools, its own repository (#122 R1).
    t(TOOLS, 31, "KN10", "0.1.0 KN10: Sample tool hook", "review", null, [41]),
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
    expect(await runOnce({ home: dir, repositories, request: github.request, now: () => NOW })).toEqual({ ok: true, calls: 15, specs: 10, written: true, pending: 0, errors: [] });
    const text = await readFile(output(dir), "utf8");
    expect(JSON.parse(text)).toEqual(expectedFile);
    expect(readSpecsFile({ kind: "content", text }, NOW.getTime())).toEqual({ status: "ready", file: expectedFile });
  });

  // catches: a ticket in another bound repository than its spec losing the pulls of its own repository (#122 R1).
  it("finds a ticket's pulls in its own repository whichever repository is read first", async () => {
    for (const order of [[FLEET, TOOLS], [TOOLS, FLEET]]) {
      const dir = await home();
      expect((await runOnce({ home: dir, repositories: order, request: fakeGitHub().request, now: () => NOW })).ok).toBe(true);
      const file = JSON.parse(await readFile(output(dir), "utf8")) as typeof expectedFile;
      const ticket = file.specs.find((s) => s.spec === `${FLEET}#900`)!.tickets.find((x) => x.ticket === `${TOOLS}#31`);
      expect({ order, ticket }).toEqual({ order, ticket: t(TOOLS, 31, "KN10", "0.1.0 KN10: Sample tool hook", "review", null, [41]) });
    }
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
    expect(await runOnce({ home: dir, repositories, request: github.request, now: () => LATER })).toEqual({ ok: true, calls: 15, specs: 10, written: true, pending: 0, errors: [] });
    expect(github.calls.length).toBeLessThan(60);
    expect(github.calls.every((call) => call.etag !== null && call.status === 304)).toBe(true);
    expect(JSON.parse(await readFile(output(dir), "utf8"))).toEqual({ ...expectedFile, generatedAt: "2026-11-20T12:10:00Z" });
  });
});

// #122 R3: a scan bigger than one run's budget resumes where it stopped, and the file stays fresh.
describe("P1: a scan over one run's budget resumes", () => {
  const MINUTE = 60_000;
  const big = (count: number) => {
    const answers = new Map<string, { body: unknown }>([[`repos/${FLEET}/pulls?state=open&per_page=100`, { body: [] }]]);
    const specs = Array.from({ length: count }, (_, i) => ({
      number: 2000 + i, title: `spec: Sample ${i}`, state: "open", labels: [], repository_url: `https://api.github.com/repos/${FLEET}`,
      sub_issues_summary: { total: 1 },
    }));
    answers.set(`repos/${FLEET}/issues?state=open&per_page=100`, { body: specs });
    for (const s of specs) {
      answers.set(`repos/${FLEET}/issues/${s.number}/sub_issues?per_page=100`, {
        body: [{ number: 3000 + s.number, title: `S${s.number % 100}: Sample task`, state: "open", labels: [], repository_url: `https://api.github.com/repos/${FLEET}` }],
      });
    }
    return answers;
  };
  const at = (minutes: number) => () => new Date(NOW.getTime() + minutes * MINUTE);

  // catches: every timer run failing at the cap, so the file goes stale and WizBar shows Specs unavailable.
  it("58 specs (60 pages): each run stays under 60 requests, the second run writes, and the file stays fresh", async () => {
    const dir = await home();
    const github = fakeGitHub(big(58));
    const first = await runOnce({ home: dir, repositories: [FLEET], request: github.request, now: at(0) });
    expect(first).toEqual({ ok: true, calls: 40, specs: 0, written: false, pending: 20, errors: [] });
    await expect(readFile(output(dir), "utf8")).rejects.toThrow();
    const second = await runOnce({ home: dir, repositories: [FLEET], request: github.request, now: at(10) });
    expect(second).toEqual({ ok: true, calls: 40, specs: 58, written: true, pending: 0, errors: [] });
    for (const minutes of [20, 30]) {
      github.calls.length = 0;
      expect(await runOnce({ home: dir, repositories: [FLEET], request: github.request, now: at(minutes) }))
        .toEqual({ ok: true, calls: 40, specs: 58, written: true, pending: 0, errors: [] });
      expect(github.calls.length).toBe(40);
    }
    // 31 minutes after the first run, the file is 1 minute old: ready, with every spec.
    const read = readSpecsFile({ kind: "content", text: await readFile(output(dir), "utf8") }, NOW.getTime() + 31 * MINUTE);
    expect(read.status === "ready" ? read.file.specs.length : read).toBe(58);
  });

  // catches: a resume that re-reads the same first pages every run, so the last specs are never refreshed.
  it("every page is read again within two runs once the scan is complete", async () => {
    const dir = await home();
    const github = fakeGitHub(big(58));
    await runOnce({ home: dir, repositories: [FLEET], request: github.request, now: at(0) });
    await runOnce({ home: dir, repositories: [FLEET], request: github.request, now: at(10) });
    github.calls.length = 0;
    await runOnce({ home: dir, repositories: [FLEET], request: github.request, now: at(20) });
    await runOnce({ home: dir, repositories: [FLEET], request: github.request, now: at(30) });
    expect(new Set(github.calls.map((c) => c.path)).size).toBe(60);
  });

  // catches: a spec that changed while it waited for its turn, kept from old data forever.
  it("a page that changes is picked up when its turn comes", async () => {
    const dir = await home();
    const answers = big(58);
    const github = fakeGitHub(answers);
    for (const minutes of [0, 10]) await runOnce({ home: dir, repositories: [FLEET], request: github.request, now: at(minutes) });
    const last = `repos/${FLEET}/issues/2057/sub_issues?per_page=100`;
    answers.set(last, { body: [{ number: 5057, title: "S57: Sample task", state: "closed", state_reason: "completed", closed_at: "2026-11-20T12:15:00Z", labels: [], repository_url: `https://api.github.com/repos/${FLEET}` }] });
    for (const minutes of [20, 30]) await runOnce({ home: dir, repositories: [FLEET], request: github.request, now: at(minutes) });
    const file = JSON.parse(await readFile(output(dir), "utf8")) as typeof expectedFile;
    expect(file.specs.find((s) => s.spec === `${FLEET}#2057`)!.tickets[0]).toMatchObject({ ticket: `${FLEET}#5057`, state: "done", closedAt: "2026-11-20T12:15:00Z" });
  });
});

// #122 R5: a deleted spec leaves the scan; a 404 for a spec still listed keeps the last file.
describe("P1: a spec that disappears", () => {
  const MINUTE = 60_000;
  const at = (minutes: number) => () => new Date(NOW.getTime() + minutes * MINUTE);
  const issuesPath = `repos/${FLEET}/issues?state=open&per_page=100`;
  const goneSub = `repos/${FLEET}/issues/2020/sub_issues?per_page=100`;
  const big = (count: number) => {
    const answers = new Map<string, { body: unknown }>([[`repos/${FLEET}/pulls?state=open&per_page=100`, { body: [] }]]);
    const specs = Array.from({ length: count }, (_, i) => ({
      number: 2000 + i, title: `spec: Sample ${i}`, state: "open", labels: [], repository_url: `https://api.github.com/repos/${FLEET}`,
      sub_issues_summary: { total: 1 },
    }));
    answers.set(issuesPath, { body: specs });
    for (const s of specs) {
      answers.set(`repos/${FLEET}/issues/${s.number}/sub_issues?per_page=100`, {
        body: [{ number: 3000 + s.number, title: `S${s.number % 100}: Sample task`, state: "open", labels: [], repository_url: `https://api.github.com/repos/${FLEET}` }],
      });
    }
    return answers;
  };
  async function completeScan(answers: Map<string, { body: unknown }>) {
    const dir = await home();
    const github = fakeGitHub(answers);
    for (const minutes of [0, 10]) await runOnce({ home: dir, repositories: [FLEET], request: github.request, now: at(minutes) });
    return { dir, github };
  }
  const specKeys = async (dir: string) => (JSON.parse(await readFile(output(dir), "utf8")) as typeof expectedFile).specs.map((s) => s.spec);

  // Spec 2020's page was last read in run 1, the issues list in run 2: run 3 reads 2020 first.
  // catches: a deleted spec's cached sub-issues answering 404 before the issues list is re-read, failing every run until Specs go stale.
  it("a deleted spec drops out of the file and never blocks a write", async () => {
    const answers = big(58);
    const { dir, github } = await completeScan(answers);
    answers.set(issuesPath, { body: (answers.get(issuesPath)!.body as { number: number }[]).filter((s) => s.number !== 2020) });
    answers.delete(goneSub);
    const results = [];
    for (const minutes of [20, 30, 40]) results.push(await runOnce({ home: dir, repositories: [FLEET], request: github.request, now: at(minutes) }));
    expect(results.map((r) => r.ok && r.written && r.calls <= 40)).toEqual([true, true, true]);
    const keys = await specKeys(dir);
    expect({ count: keys.length, gone: keys.includes(`${FLEET}#2020`) }).toEqual({ count: 57, gone: false });
    const cache = await readFile(join(dir, ".openwiz", "specs.v1.etags.json"), "utf8");
    expect(cache.includes(goneSub)).toBe(false);
  });

  // catches: a 404 for a spec GitHub still lists taken as a deletion, so a spec silently vanishes from the file.
  it("a 404 for a spec still listed is reported, and the spec keeps its last data", async () => {
    const answers = big(58);
    const { dir, github } = await completeScan(answers);
    const before = await readFile(output(dir), "utf8");
    answers.delete(goneSub);
    const results = [];
    for (const minutes of [20, 30]) results.push(await runOnce({ home: dir, repositories: [FLEET], request: github.request, now: at(minutes) }));
    // The failure is the repository's: the run reports it, and the spec keeps its last data in the file.
    expect(results.find((r) => !r.ok)).toMatchObject({ ok: false, written: true, errors: [`GitHub answered 404 for ${goneSub}`] });
    expect((await specKeys(dir)).includes(`${FLEET}#2020`)).toBe(true);
    expect(before).toContain(`${FLEET}#2020`);
  });
});

// #122 R5 again: GitHub's continuation links are `repositories/<id>/issues?…`; a deleted spec on a later
// page must still leave the scan, over as many runs as it takes, with every run writing.
describe("P1: a spec that disappears from a later page of the issue list", () => {
  const MINUTE = 60_000;
  const at = (run: number) => () => new Date(NOW.getTime() + run * 10 * MINUTE);
  const first = `repos/${FLEET}/issues?state=open&per_page=100`;
  const later = (page: number) => `repositories/4242/issues?state=open&per_page=100&page=${page}`;
  const sub = (n: number) => `repos/${FLEET}/issues/${n}/sub_issues?per_page=100`;
  /** `count` one-ticket specs over issue-list pages of `perPage`, linked like GitHub's continuation pages. */
  function paged(count: number, perPage: number) {
    const answers = new Map<string, { body: unknown; next?: string }>([[`repos/${FLEET}/pulls?state=open&per_page=100`, { body: [] }]]);
    const specs = Array.from({ length: count }, (_, i) => ({
      number: 2000 + i, title: `spec: Sample ${i}`, state: "open", labels: [], repository_url: `https://api.github.com/repos/${FLEET}`,
      sub_issues_summary: { total: 1 },
    }));
    const setList = (list: typeof specs) => {
      const pageCount = Math.ceil(list.length / perPage);
      for (let p = 1; p <= Math.max(pageCount, 3); p++) answers.delete(p === 1 ? first : later(p));
      for (let p = 1; p <= pageCount; p++) {
        answers.set(p === 1 ? first : later(p), { body: list.slice((p - 1) * perPage, p * perPage), ...(p < pageCount ? { next: later(p + 1) } : {}) });
      }
    };
    setList(specs);
    for (const s of specs) {
      answers.set(sub(s.number), {
        body: [{ number: 3000 + s.number, title: `S${s.number % 100}: Sample task`, state: "open", labels: [], repository_url: `https://api.github.com/repos/${FLEET}` }],
      });
    }
    return { answers, delete(n: number) { setList(specs.filter((s) => s.number !== n)); answers.delete(sub(n)); }, break404(n: number) { answers.delete(sub(n)); } };
  }
  async function scenario(count: number, perPage: number, change: (fixture: ReturnType<typeof paged>) => void, runs: number, extraRuns = 0) {
    const fixture = paged(count, perPage);
    const dir = await home();
    const github = fakeGitHub(fixture.answers);
    let run = 0;
    for (; run < 8; run++) {
      const result = await runOnce({ home: dir, repositories: [FLEET], request: github.request, now: at(run) });
      if (result.ok && result.written) break;
    }
    // More runs before the change shift which pages are oldest when it lands.
    for (let i = 0; i < extraRuns; i++) await runOnce({ home: dir, repositories: [FLEET], request: github.request, now: at(++run) });
    change(fixture);
    const results = [];
    for (let i = 1; i <= runs; i++) results.push(await runOnce({ home: dir, repositories: [FLEET], request: github.request, now: at(run + i) }));
    const keys = (JSON.parse(await readFile(output(dir), "utf8")) as typeof expectedFile).specs.map((s) => s.spec);
    const file = JSON.parse(await readFile(output(dir), "utf8")) as typeof expectedFile;
    return { results, keys, file, cache: await readFile(join(dir, ".openwiz", "specs.v1.etags.json"), "utf8") };
  }

  // catches: page one re-read taken for the whole list, so a spec deleted from page two fails every run (the reviewer's case).
  it("45 specs over two pages: a spec deleted from page two leaves, and every run writes", async () => {
    for (let n = 2030; n < 2045; n++) {
      const { results, keys, cache } = await scenario(45, 30, (f) => f.delete(n), 3);
      expect({ n, runs: results.map((r) => r.ok && r.written && r.calls <= 40), count: keys.length, listed: keys.includes(`${FLEET}#${n}`), cached: cache.includes(sub(n)) })
        .toEqual({ n, runs: [true, true, true], count: 44, listed: false, cached: false });
    }
  });

  // catches: a recovery that only works when the list fits one run, with the 404 landing at the end of a run's 40 requests.
  it("120 specs over three pages: a spec deleted from page three leaves within four runs, every run writing", async () => {
    for (let n = 2080; n < 2120; n += 4) {
      const { results, keys } = await scenario(120, 40, (f) => f.delete(n), 4);
      expect({ n, runs: results.map((r) => r.ok && r.written && r.calls <= 40), count: keys.length, listed: keys.includes(`${FLEET}#${n}`) })
        .toEqual({ n, runs: [true, true, true, true], count: 119, listed: false });
    }
  });

  // catches: a new spec whose first read answers 404 breaking the scan or the file before its list is re-read.
  it("a new spec that answers 404 from its first read: every run writes without it, and its re-read list reports it", async () => {
    for (let at404 = 0; at404 < 40; at404 += 3) {
      const { results, keys } = await scenario(120, 40, (f) => {
        const page = f.answers.get(first)!;
        const extra = { number: 2999, title: "spec: Sample new", state: "open", labels: [], repository_url: `https://api.github.com/repos/${FLEET}`, sub_issues_summary: { total: 1 } };
        const list = [...(page.body as unknown[])];
        list.splice(at404, 0, extra);
        f.answers.set(first, { ...page, body: list });
      }, 4);
      const failedAt = results.findIndex((r) => !r.ok);
      expect({ at404, failedAt: failedAt >= 0, errors: results[failedAt]?.errors ?? null })
        .toEqual({ at404, failedAt: true, errors: [`GitHub answered 404 for ${sub(2999)}`] });
      expect(results.every((r) => r.written)).toBe(true);
      expect(keys.includes(`${FLEET}#2999`)).toBe(false);
    }
  });

  // catches: a list longer than one run's budget re-read from page one every run, so a spec deleted near its end is never dropped (#122 R5, third check).
  it("an issue list of 60 pages: the re-read resumes where the last run stopped and the deleted spec leaves", async () => {
    for (let extra = 0; extra < 3; extra++) for (let n = 2000; n < 2060; n += 3) {
      const { results, keys } = await scenario(60, 1, (f) => f.delete(n), 5, extra);
      expect({ extra, n, runs: results.map((r) => r.ok && r.calls <= 40), count: keys.length, listed: keys.includes(`${FLEET}#${n}`) })
        .toEqual({ extra, n, runs: [true, true, true, true, true], count: 59, listed: false });
    }
  });

  // catches: a fresh generatedAt over data read runs ago, so WizBar never calls a file stale that can't be refreshed.
  it("generatedAt is the read time of the oldest page in the file", async () => {
    const dir = await home();
    const github = fakeGitHub(paged(58, 100).answers);
    await runOnce({ home: dir, repositories: [FLEET], request: github.request, now: at(0) });
    expect(await runOnce({ home: dir, repositories: [FLEET], request: github.request, now: at(1) })).toMatchObject({ written: true });
    // Run 1 (12:00) read 40 pages, run 2 (12:10) the other 20 and 20 of run 1's: the oldest data is from 12:00.
    expect((JSON.parse(await readFile(output(dir), "utf8")) as typeof expectedFile).generatedAt).toBe("2026-11-20T12:00:00Z");
    await runOnce({ home: dir, repositories: [FLEET], request: github.request, now: at(2) });
    expect((JSON.parse(await readFile(output(dir), "utf8")) as typeof expectedFile).generatedAt).toBe("2026-11-20T12:10:00Z");
  });

  // catches: a still-listed spec on a later page discarded instead of failing once its whole list was re-read.
  it("a spec on page two still listed but answering 404 is reported once the whole list is re-read, keeping its last data", async () => {
    const { results, keys } = await scenario(45, 30, (f) => f.break404(2040), 3);
    expect(results.find((r) => !r.ok)).toMatchObject({ ok: false, written: true, errors: [`GitHub answered 404 for ${sub(2040)}`] });
    expect(keys.includes(`${FLEET}#2040`)).toBe(true);
  });
});

// #122 R6: one repository's state or failure never blocks another's refresh and write.
describe("P1: repositories never block each other", () => {
  const MINUTE = 60_000;
  const at = (minutes: number) => () => new Date(NOW.getTime() + minutes * MINUTE);
  const fleetList = `repos/${FLEET}/issues?state=open&per_page=100`;
  const toolsPulls = `repos/${TOOLS}/pulls?state=open&per_page=100`;
  const kernelSub = `repos/${FLEET}/issues/900/sub_issues?per_page=100`;
  const specOf = (file: typeof expectedFile, key: string) => file.specs.find((s) => s.spec === key);
  const readFileJson = async (dir: string) => JSON.parse(await readFile(output(dir), "utf8")) as typeof expectedFile;
  /**
   * Spec 900's page answers 404, then sample-fleet turns inaccessible (every page 403), so its list
   * re-read is left pending; sample-tools changes.
   */
  function breakFleet(answers: Map<string, { body: unknown; next?: string }>) {
    answers.delete(kernelSub);
    const github = fakeGitHub(answers);
    let forbidden = false;
    const request: typeof github.request = async (path, etag) => {
      if (path === kernelSub) forbidden = true;
      else if (forbidden && path.includes(FLEET)) return { status: 403, etag: null, next: null, body: { message: "Forbidden" } };
      return github.request(path, etag);
    };
    answers.set(toolsPulls, { body: [...(answers.get(toolsPulls)!.body as unknown[]), { number: 42, draft: true, body: "Closes #1071", state: "open" }] });
    return { request, calls: github.calls };
  }

  // catches: a failing repository stopping the whole run, so the others' specs go stale with it.
  it("an inaccessible repository keeps its last data and ages generatedAt while the others refresh and write", async () => {
    const dir = await home();
    const answers = new Map(recordedAnswers());
    await runOnce({ home: dir, repositories, request: fakeGitHub(answers).request, now: at(0) });
    const before = await readFileJson(dir);
    const broken = breakFleet(answers);
    const result = await runOnce({ home: dir, repositories, request: broken.request, now: at(10) });
    expect(result).toMatchObject({ ok: false, written: true });
    expect(result.errors.length).toBeGreaterThan(0);
    const after = await readFileJson(dir);
    // sample-tools refreshed: its ticket 1071 is now building with draft pull 42.
    expect(specOf(after, `${TOOLS}#1070`)!.tickets[0]).toMatchObject({ ticket: `${TOOLS}#1071`, state: "building", pulls: [42] });
    expect(specOf(after, `${TOOLS}#1080`)).toEqual(specOf(before, `${TOOLS}#1080`));
    expect(github_calls_for(broken.calls, TOOLS)).toBeGreaterThan(0);
    // sample-fleet keeps its last data, and the file's age is its last read.
    expect(specOf(after, `${FLEET}#900`)).toEqual(specOf(before, `${FLEET}#900`));
    expect(after.generatedAt).toBe("2026-11-20T12:00:00Z");
  });

  // catches: an unbound repository's pending re-read requested every run (the reviewer's R6).
  it("unbinding a repository drops its pages, cursors and pending re-reads: the run reads only the bound ones", async () => {
    const dir = await home();
    const answers = new Map(recordedAnswers());
    await runOnce({ home: dir, repositories, request: fakeGitHub(answers).request, now: at(0) });
    const broken = breakFleet(answers);
    await runOnce({ home: dir, repositories, request: broken.request, now: at(10) });
    // The pending re-read exists: spec 900's page waits, with sample-fleet's list cursor at page one.
    const pending = JSON.parse(await readFile(join(dir, ".openwiz", "specs.v1.etags.json"), "utf8")) as { vanished: string[]; listCursor: Record<string, string> };
    expect({ vanished: pending.vanished, cursor: pending.listCursor[FLEET] }).toEqual({ vanished: [kernelSub], cursor: fleetList });
    broken.calls.length = 0;
    const result = await runOnce({ home: dir, repositories: [TOOLS], request: broken.request, now: at(20) });
    expect(result).toMatchObject({ ok: true, written: true, errors: [] });
    expect(broken.calls.filter((c) => c.path.includes(FLEET))).toEqual([]);
    const file = await readFileJson(dir);
    expect(file.specs.map((s) => s.spec)).toEqual([`${TOOLS}#1070`, `${TOOLS}#1080`]);
    expect(file.generatedAt).toBe("2026-11-20T12:20:00Z");
    const cache = JSON.parse(await readFile(join(dir, ".openwiz", "specs.v1.etags.json"), "utf8")) as
      { pages: Record<string, unknown>; vanished: string[]; listCursor: Record<string, string>; complete: string[] };
    expect([...Object.keys(cache.pages), ...cache.vanished, ...Object.keys(cache.listCursor), ...cache.complete].filter((k) => k.includes(FLEET))).toEqual([]);
  });

  // catches: a newly bound repository too big for one run holding back every write until its scan completes.
  it("a newly bound repository too big for one run does not stop the others' writes", async () => {
    const dir = await home();
    const answers = new Map(recordedAnswers());
    for (const [path] of answers) if (path.includes(FLEET)) answers.delete(path);
    const github = fakeGitHub(answers);
    await runOnce({ home: dir, repositories: [TOOLS], request: github.request, now: at(0) });
    const bigFleet = Array.from({ length: 60 }, (_, i) => ({ number: 4000 + i, title: `spec: Sample ${i}`, state: "open", labels: [], repository_url: `https://api.github.com/repos/${FLEET}`, sub_issues_summary: { total: 1 } }));
    answers.set(fleetList, { body: bigFleet });
    answers.set(`repos/${FLEET}/pulls?state=open&per_page=100`, { body: [] });
    for (const s of bigFleet) answers.set(`repos/${FLEET}/issues/${s.number}/sub_issues?per_page=100`, { body: [] });
    const first = await runOnce({ home: dir, repositories, request: github.request, now: at(10) });
    expect(first).toMatchObject({ ok: true, written: true });
    expect((await readFileJson(dir)).specs.map((s) => s.spec)).toEqual([`${TOOLS}#1070`, `${TOOLS}#1080`]);
    const second = await runOnce({ home: dir, repositories, request: github.request, now: at(20) });
    expect(second).toMatchObject({ ok: true, written: true, pending: 0 });
    expect((await readFileJson(dir)).specs).toHaveLength(62);
  });
});
const github_calls_for = (calls: { path: string }[], repository: string) => calls.filter((c) => c.path.includes(repository)).length;

// Since #122 R6 a failed read stops only its repository: here nothing else changed, so the file's
// specs and its age (the failing repository's oldest page) are exactly the last file's.
describe("P1: a failed read keeps that repository's last data", () => {
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
    expect(result).toMatchObject({ ok: false, written: true });
    expect(result.errors).toHaveLength(1);
    expect(await readFile(output(dir), "utf8")).toBe(before);
    expect(await readdir(join(dir, ".openwiz"))).toEqual(filesBefore);
  });

  it("a request that throws (no gh, no network) writes nothing on a first run", async () => {
    const dir = await home();
    const result = await runOnce({ home: dir, repositories, request: async () => { throw new Error("spawn gh ENOENT"); }, now: () => NOW });
    // One try per repository, then each stops for the run.
    expect(result).toMatchObject({ ok: false, calls: 2, written: false, errors: ["spawn gh ENOENT", "spawn gh ENOENT"] });
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

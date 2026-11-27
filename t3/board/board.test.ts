// node --test t3/  (Node 24, no packages)
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBoard, pickSpecs, readAgents, readRequests, readSpecs, readT3, specsRule, threadLook, titleRef, type FileRead, type T3Thread } from "./board.ts";
import { esc, renderBoard, renderPage } from "./render.ts";
import { syntheticAgents, syntheticSpecs, syntheticThreads } from "./fixtures/synthetic.ts";

const now = Date.parse("2026-11-27T12:00:00Z");
const MIN = 60_000;
const content = (value: unknown): FileRead => ({ kind: "content", text: JSON.stringify(value) });
const missing: FileRead = { kind: "missing" };
const ready = <T>(r: { status: string; value?: T }) => { assert.equal(r.status, "ready"); return r.value as T; };

function board(over: { specs?: unknown; agents?: unknown; threads?: unknown[] | "off" } = {}) {
  const threads = over.threads ?? syntheticThreads(now);
  return buildBoard({
    specs: pickSpecs(content(over.specs ?? syntheticSpecs(now)), missing, now),
    agents: readAgents(content(over.agents ?? syntheticAgents(now)), now),
    t3: threads === "off" ? "off" : readT3([JSON.stringify(threads)]),
    now,
  });
}
const rowsOf = (b: ReturnType<typeof board>) => { assert.equal(b.specs.status, "ready"); return b.specs.status === "ready" ? b.specs.rows : []; };
const row = (b: ReturnType<typeof board>, name: string) => rowsOf(b).find((r) => r.shortName === name)!;

test("a missing, malformed, unknown or stale specs file is unavailable, never zero", () => {
  assert.deepEqual(readSpecs(missing, now), { status: "unavailable", reason: "missing" });
  assert.deepEqual(readSpecs({ kind: "content", text: "{" }, now), { status: "unavailable", reason: "malformed" });
  assert.deepEqual(readSpecs(content({ ...syntheticSpecs(now), schema: "openwiz.specs.v9" }), now), { status: "unavailable", reason: "unknown-schema" });
  const stale = { ...syntheticSpecs(now), generatedAt: new Date(now - 31 * MIN).toISOString() };
  assert.deepEqual(readSpecs(content(stale), now), { status: "unavailable", reason: "stale" });
  const future = { ...syntheticSpecs(now), generatedAt: new Date(now + 6 * MIN).toISOString() };
  assert.deepEqual(readSpecs(content(future), now), { status: "unavailable", reason: "malformed" });
  const badTicket = syntheticSpecs(now);
  (badTicket.specs[0]!.tickets[0] as { state: string }).state = "finished";
  assert.equal(readSpecs(content(badTicket), now).status, "unavailable");

  const b = buildBoard({ specs: pickSpecs(missing, missing, now), agents: readAgents(missing, now), t3: "off", now });
  assert.deepEqual(b.specs, { status: "unavailable", reason: "missing" });
  assert.equal(b.running, null, "no source read: the running count is unknown, not 0");
  const html = renderBoard(b);
  assert.match(html, /Specs unavailable: no file yet/);
  assert.doesNotMatch(html, /Specs 0/);
  assert.match(html, /running unknown/);
});

test("v2 is read unless v1 is newer; a ready file wins over a broken one", () => {
  const v2 = syntheticSpecs(now);
  const v1 = { ...syntheticSpecs(now, "openwiz.specs.v1"), generatedAt: new Date(now - MIN).toISOString().replace(/\.\d+Z$/, "Z") };
  for (const spec of v1.specs) for (const t of spec.tickets as Record<string, unknown>[]) { delete t.updatedAt; if (t.state === "yours-later") t.state = "needs-you"; }
  assert.equal(ready<{ schema: string }>(pickSpecs(content(v2), content(v1), now)).schema, "openwiz.specs.v1", "v1 is newer");
  const olderV1 = { ...v1, generatedAt: new Date(now - 10 * MIN).toISOString() };
  assert.equal(ready<{ schema: string }>(pickSpecs(content(v2), content(olderV1), now)).schema, "openwiz.specs.v2");
  assert.equal(ready<{ schema: string }>(pickSpecs({ kind: "content", text: "nope" }, content(v1), now)).schema, "openwiz.specs.v1");
  assert.deepEqual(pickSpecs({ kind: "unreadable" }, missing, now), { status: "unavailable", reason: "unreadable" });
  assert.deepEqual(pickSpecs(missing, { kind: "unreadable" }, now), { status: "unavailable", reason: "unreadable" });
});

test("spec rows: WizBar's dot order, counts, rule and sort", () => {
  const b = board();
  const reader = row(b, "The reader");
  assert.deepEqual(reader.dots.map((d) => d.state), ["done", "done-recent", "building", "review", "needs-you", "yours-later", "not-started"]);
  assert.deepEqual([reader.done, reader.total, reader.doneLastHour, reader.needsYou, reader.yoursLater], [2, 7, 1, 1, 1]);
  assert.deepEqual(rowsOf(b).map((r) => r.shortName), ["The reader", "Search", "Old docs"], "needs you first, the spec with no tickets hidden, quiet last");
  assert.equal(row(b, "Old docs").quiet, true);
  assert.equal(row(b, "Old docs").muted, true);
  assert.equal(b.specs.status === "ready" && b.specs.rule, "Specs 2 · 1 ticket needs you (1 spec)");
  assert.equal(specsRule([{ ...reader, needsYou: 2 }, { ...reader, needsYou: 1 }]), "Specs 2 · 3 tickets need you (2 specs)");
});

test("live GitHub notes become the spec's agents; a working builder's dot breathes, a review dot never does", () => {
  const reader = row(board(), "The reader");
  assert.deepEqual(reader.agents.map((a) => [a.where, a.label, a.state]), [
    ["github", "Reviewer · RD4: review the look", "reviewing"],
    ["github", "Builder · RD3: the dots", "working"],
  ]);
  assert.equal(reader.agents[0]!.url, "https://github.com/example/site/pull/32", "a reviewer's note on a pull links the pull");
  const breathing = reader.dots.filter((d) => d.breathing).map((d) => d.code);
  assert.deepEqual(breathing, ["RD3"]);

  // A working agent on a ticket in review: the dot keeps its steady ring.
  const agents = syntheticAgents(now);
  agents.agents.push({ ...agents.agents[0]!, ticket: "example/site#14", commentId: 7 });
  assert.equal(row(board({ agents }), "The reader").dots.find((d) => d.code === "RD4")!.breathing, false);
});

test("an expired note is not running, and a note on no spec is listed apart", () => {
  const b = board({ threads: "off" });
  assert.equal(row(b, "Search").agents.length, 0, "the #22 note is 45 minutes old: past the 30 minute lease");
  assert.equal(row(b, "Search").dots.some((d) => d.breathing), false);
  assert.deepEqual(b.otherAgents.map((a) => [a.label, a.state]), [["Builder · example/site#90", "needs-you"]]);
  assert.equal(b.running, 2, "two live working notes; asking is not running");
});

test("T3 threads: fleet titles match their spec, pinned and needs-you sections, settled threads left out", () => {
  const b = board();
  const search = row(b, "Search");
  assert.deepEqual(search.agents.map((a) => [a.where, a.label, a.state, a.harness]), [["t3", "Builder · SR2: the query box", "working", "codex"]]);
  assert.equal(search.dots.find((d) => d.code === "SR2")!.breathing, true);
  assert.equal(b.t3.status, "ready");
  if (b.t3.status !== "ready") return;
  assert.deepEqual(b.t3.pinned.map((t) => [t.title, t.look]), [["Fleet #20: Search", "running"], ["Pinned notes", "idle"]]);
  assert.deepEqual(b.t3.needsYou.map((t) => [t.title, t.look]), [["Plan the next release", "needs-you"], ["Fix the flaky test", "failed"]]);
  assert.equal(b.running, 4, "two running T3 threads and two live working notes");
});

test("a T3 thread and a GitHub note for the same ticket and role show once, as the T3 thread", () => {
  const threads = [...syntheticThreads(now), {
    ...syntheticThreads(now)[1]!, threadId: "syn-9", title: "#13: the dots", parentThreadId: null,
  }];
  const reader = row(board({ threads }), "The reader");
  assert.deepEqual(reader.agents.filter((a) => a.ticket === "example/site#13").map((a) => a.where), ["t3"]);
});

test("titles: WizBar's fleet forms, and an ambiguous ticket number matches no spec", () => {
  assert.deepEqual(titleRef("#12: build it"), { kind: "issue", role: "Builder", number: 12 });
  assert.deepEqual(titleRef("Review #31 at 0abc1234"), { kind: "pull", role: "Reviewer", number: 31 });
  assert.deepEqual(titleRef("Fleet #20: Search"), { kind: "fleet", number: 20 });
  assert.deepEqual(titleRef("Builder · RD3: the dots"), { kind: "code", role: "Builder", code: "RD3" });
  assert.deepEqual(titleRef("Just a chat"), { kind: "none" });

  const specs = syntheticSpecs(now);
  specs.specs.push({ ...specs.specs[1]!, spec: "example/other#20", url: "https://github.com/example/other/issues/20",
    tickets: specs.specs[1]!.tickets.map((t) => ({ ...t, ticket: t.ticket.replace("site", "other") })) });
  const lonely = { ...syntheticThreads(now)[1]!, parentThreadId: null };
  const b = board({ specs, threads: [lonely] });
  assert.equal(rowsOf(b).every((r) => r.agents.every((a) => a.where !== "t3")), true, "#22 is in two repositories: no guess");
});

test("with one spec, a T3 thread whose ticket isn't in it stays out", () => {
  const specs = syntheticSpecs(now);
  specs.specs = [specs.specs[0]!];
  const stray = { ...syntheticThreads(now)[1]!, title: "#99: something else", parentThreadId: null };
  const b = board({ specs, threads: [stray] });
  assert.deepEqual(rowsOf(b)[0]!.agents.filter((a) => a.where === "t3"), []);
});

test("thread looks follow T3's run statuses", () => {
  const look = (status: string) => threadLook({ status } as T3Thread);
  assert.deepEqual(["preparing", "queued", "starting", "running"].map(look), ["running", "running", "running", "running"]);
  assert.equal(look("waiting"), "needs-you");
  assert.equal(look("failed"), "failed");
  assert.deepEqual(["idle", "completed", "interrupted", "cancelled"].map(look), ["idle", "idle", "idle", "idle"]);
});

test("t3 output that doesn't read is unavailable, and threads from several projects merge once", () => {
  assert.deepEqual(readT3(["not json"]), { status: "unavailable", reason: "malformed" });
  assert.deepEqual(readT3(["{}"]), { status: "unavailable", reason: "malformed" });
  assert.deepEqual(readT3([JSON.stringify([{ threadId: "x" }])]), { status: "unavailable", reason: "malformed" });
  const one = JSON.stringify(syntheticThreads(now).slice(0, 2));
  assert.equal(ready<T3Thread[]>(readT3([one, one])).length, 2);
  assert.deepEqual(readT3([]), { status: "ready", value: [] });
  const b = buildBoard({ specs: pickSpecs(missing, missing, now), agents: readAgents(missing, now), t3: { status: "unavailable", reason: "No running T3 Code server" }, now });
  assert.match(renderBoard(b), /T3 threads unavailable: No running T3 Code server/);
});

test("the page escapes every value and links only to GitHub", () => {
  const specs = syntheticSpecs(now);
  specs.specs[0]!.shortName = `<img src=x onerror=alert(1)>`;
  specs.specs[0]!.url = "javascript:alert(1)";
  const threads = syntheticThreads(now);
  threads[2]!.title = `"><script>alert(1)</script>`;
  const html = renderPage(board({ specs, threads }), { refreshSeconds: 0 });
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<script/, "a snapshot has no script");
  assert.equal(esc(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  assert.match(renderPage(board(), { refreshSeconds: 15, nonce: "abc" }), /<script nonce="abc">/);
});

test("the page shows WizBar's words: dots with labels, needs you, later, done in the last hour", () => {
  const html = renderBoard(board());
  assert.match(html, /aria-label="7 tickets: 1 done, 1 done in the last hour, 1 being built, 1 in review, 1 needs you, 1 later, 1 not started"/);
  assert.match(html, /1 needs you/);
  assert.match(html, /· 1 later/);
  assert.match(html, /1 done · 1h/);
  assert.match(html, /Quiet 1/);
  assert.match(html, /Pinned 2/);
  assert.match(html, /Needs you 2/);
  assert.match(html, /On GitHub 1/);
  assert.match(html, /4 running/);
  assert.match(html, /class="dot building breath"/);
});

test("usage counts the same running agents as the header, by harness and model, one name per harness", () => {
  const b = board();
  assert.equal(b.running, 4);
  assert.deepEqual(b.usage, {
    harnesses: [{ name: "Codex", count: 3 }, { name: "Claude", count: 1 }],
    models: [{ name: "gpt-6.1-sol", count: 3 }, { name: "claude-opus-5-5", count: 1 }],
  }, "T3's `codex` and the notes' `Codex` are one harness");
  const total = (list: { count: number }[]) => list.reduce((n, t) => n + t.count, 0);
  assert.equal(total(b.usage!.harnesses), b.running);
  assert.equal(total(b.usage!.models), b.running);
  const unnamed = [{ ...syntheticThreads(now)[1]!, providerInstanceId: "", model: "", parentThreadId: null }];
  assert.deepEqual(board({ threads: unnamed, agents: { ...syntheticAgents(now), agents: [] } }).usage!.harnesses, [{ name: "Unknown", count: 1 }]);
  const none = buildBoard({ specs: pickSpecs(missing, missing, now), agents: readAgents(missing, now), t3: "off", now });
  assert.equal(none.usage, null, "no source read: unknown, not empty");
});

test("T3's running threads that aren't a spec's agent are kept for the Agents view", () => {
  const b = board();
  assert.equal(b.t3.status, "ready");
  if (b.t3.status !== "ready") return;
  assert.deepEqual(b.t3.running.map((t) => t.title), ["Fleet #20: Search"], "#22 is Search's agent; the fleet's own thread is not");
});

test("the producer's run line gives each scan's requests; a line without them gives none", () => {
  const line = "wrote /h/.openwiz/specs.v2.json and /h/.openwiz/specs.v1.json: 49 specs, 59 of 59 specs requests (29 unchanged) · 20 of 20 agents requests (12 unchanged) · wrote agents.v1.json: 5 live agents";
  assert.deepEqual(readRequests(line, now), { specs: { used: 59, budget: 59, unchanged: 29 }, agents: { used: 20, budget: 20, unchanged: 12 }, at: now });
  assert.equal(readRequests("kept the last file: the scan needs more than 59 requests (59 requests)", now), null);
  assert.equal(readRequests("49 specs, 5 of 59 specs requests (0 unchanged)", now), null, "both scans or nothing");
});

// The vertical rail and its views, drawn without a browser (rail.browser.test.ts drives a real one).
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBoard, pickSpecs, readAgents, readT3, type FileRead } from "./board.ts";
import { monogram, parsePin, pinUrl, renderRail, views } from "./rail.ts";
import { badges, renderBoard, renderPage } from "./render.ts";
import { syntheticAgents, syntheticSpecs, syntheticThreads } from "./fixtures/synthetic.ts";

const now = Date.parse("2026-11-27T12:00:00Z");
const content = (value: unknown): FileRead => ({ kind: "content", text: JSON.stringify(value) });
const missing: FileRead = { kind: "missing" };
const board = (threads: unknown[] | "off" = syntheticThreads(now)) => buildBoard({
  specs: pickSpecs(content(syntheticSpecs(now)), missing, now),
  agents: readAgents(content(syntheticAgents(now)), now),
  t3: threads === "off" ? "off" : readT3([JSON.stringify(threads)]),
  now,
});
const pins = [{ label: "Slack", url: "https://example.slack.com/" }, { label: "Terminal", url: "http://localhost:7681/" }];
/** One view's HTML, from its opening tag to the next view or the footer. */
const viewOf = (html: string, key: string) => {
  const start = html.indexOf(`<div class="view" id="view-${key}"`);
  assert.ok(start >= 0, `view ${key} is drawn`);
  const next = html.slice(start + 1).search(/<div class="view" |<footer/);
  return html.slice(start, next < 0 ? undefined : start + 1 + next);
};

test("a pin is Label=URL, http or https, with no login in it", () => {
  assert.deepEqual(parsePin("Slack=https://example.slack.com/client"), { label: "Slack", url: "https://example.slack.com/client" });
  assert.deepEqual(parsePin(" Terminal = http://localhost:7681 "), { label: "Terminal", url: "http://localhost:7681/" });
  assert.deepEqual(parsePin("Search=https://example.com/?q=a=b"), { label: "Search", url: "https://example.com/?q=a=b" }, "split at the first =");
  assert.throws(() => parsePin("https://example.com"), /needs Label=URL/);
  assert.throws(() => parsePin("=https://example.com"), /needs Label=URL/);
  assert.throws(() => parsePin("Slack="), /needs Label=URL/);
  assert.throws(() => parsePin("X=javascript:alert(1)"), /http or https/);
  assert.throws(() => parsePin("X=data:text/html,hi"), /http or https/);
  assert.throws(() => parsePin("X=file:///etc/passwd"), /http or https/);
  assert.throws(() => parsePin("X=https://me:secret@example.com/"), /no login/);
  assert.throws(() => parsePin(`${"a".repeat(25)}=https://example.com/`), /at most 24/);
  assert.equal(pinUrl("JavaScript:alert(1)"), null);
  assert.equal(monogram("slack"), "S");
  assert.equal(monogram("ötzi"), "Ö");
});

test("the rail lists Now, Specs, Agents and Usage in that order, then the pins", () => {
  const html = renderRail({ pins, badges: { now: 4, agents: 2 }, current: "now" });
  assert.match(html, /^<nav class="rail" aria-label="Board views">/);
  assert.deepEqual([...html.matchAll(/<span class="label">([^<]+)/g)].map((m) => m[1]), ["Now", "Specs", "Agents", "Usage", "Slack", "Terminal"]);
  assert.deepEqual([...html.matchAll(/href="(#view-[a-z]+)"/g)].map((m) => m[1]), views.map((v) => `#view-${v.key}`));
  assert.equal(html.match(/aria-current="page"/g)?.length, 1);
  assert.match(html, /<a class="tab" href="#view-now" data-view="now" aria-current="page">/);
  assert.match(html, /<hr class="rail-rule"><a class="tab pin" href="https:\/\/example\.slack\.com\/" target="_blank" rel="noopener noreferrer">/);
  assert.match(html, /<span class="mono" aria-hidden="true">T<\/span><span class="label">Terminal<span class="sr"> \(opens a new tab\)<\/span>/);
  assert.match(html, /data-badge="now"><b>4<\/b><span class="sr"> need you<\/span>/);
  assert.match(html, /data-badge="agents"><b>2<\/b><span class="sr"> running<\/span>/);

  const quiet = renderRail({ badges: { now: 0, agents: 0 }, current: null });
  assert.doesNotMatch(quiet, /aria-current/);
  assert.doesNotMatch(quiet, /rail-rule/, "no pins, no divider");
  assert.match(quiet, /data-badge="now" hidden>/, "a zero badge is hidden, never a 0");
});

test("the rail draws only web links and escapes every label", () => {
  const html = renderRail({ pins: [{ label: `<img src=x onerror=alert(1)>`, url: "https://example.com/?a=1&b=\"2\"" }, { label: "Bad", url: "javascript:alert(1)" }], badges: { now: 0, agents: 0 }, current: null });
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /href="https:\/\/example\.com\/\?a=1&amp;b=%222%22"/);
  assert.doesNotMatch(html, /javascript:/);
  assert.doesNotMatch(html, />Bad</);
});

test("the live page opens on Now with its script; a still page shows every view and has no script", () => {
  const live = renderPage(board(), { refreshSeconds: 15, nonce: "abc", pins });
  assert.match(live, /<body data-view="now"><div class="shell"><nav class="rail"/);
  assert.match(live, /<script nonce="abc">/);
  assert.match(live, /max-width: 419\.98px/, "the script and the style switch to icons at the same width");
  assert.match(live, /@media \(max-width:419\.98px\)/);
  assert.match(live, /target="_blank" rel="noopener noreferrer"/);

  const still = renderPage(board(), { refreshSeconds: 0, pins });
  assert.match(still, /<body><div class="shell"><nav class="rail"/);
  assert.doesNotMatch(still, /<script/);
  assert.doesNotMatch(still, /<a [^>]*aria-current/);
  for (const { key } of views) assert.match(still, new RegExp(`id="view-${key}"`));
});

test("Now shows what waits on you: pinned, T3's needs you, GitHub agents asking, and specs with a ticket that needs you", () => {
  const view = viewOf(renderBoard(board()), "now");
  assert.match(view, /Pinned 2/);
  assert.match(view, /Needs you 2/);
  assert.match(view, /Plan the next release/);
  assert.match(view, /Asking on GitHub 1<\/span>.*Builder · example\/site#90/);
  assert.match(view, /1 ticket needs you<\/span> · 1 spec/);
  assert.match(view, /class="spec-name">The reader</);
  assert.doesNotMatch(view, /class="spec-name[^"]*">Search</, "a spec with nothing for you stays in Specs");
  assert.deepEqual(badges(board()), { now: 4, agents: 4 }, "2 T3 threads, 1 GitHub agent asking, 1 spec ticket; 4 running");
});

test("Now never says nothing waits when it can't read: a missing specs file is unavailable there too", () => {
  const b = buildBoard({ specs: pickSpecs(missing, missing, now), agents: readAgents(missing, now), t3: "off", now });
  const view = viewOf(renderBoard(b), "now");
  assert.match(view, /Specs unavailable: no file yet/);
  assert.doesNotMatch(view, /No spec ticket needs you/);
  assert.match(viewOf(renderBoard(b), "agents"), /Agents unknown/);
  assert.deepEqual(badges(b), { now: 0, agents: 0 });

  const calm = syntheticSpecs(now);
  for (const s of calm.specs) for (const t of s.tickets) if (t.state === "needs-you") t.state = "building";
  const quiet = buildBoard({ specs: pickSpecs(content(calm), missing, now), agents: readAgents(missing, now), t3: "off", now });
  assert.match(viewOf(renderBoard(quiet), "now"), /No spec ticket needs you\./);
});

test("Specs keeps the whole Specs section; Agents lists every live agent by spec, on GitHub, and other T3 threads", () => {
  const html = renderBoard(board());
  const specs = viewOf(html, "specs");
  assert.match(specs, /Specs 2 · <span class="warn">1 ticket needs you \(1 spec\)<\/span>/);
  assert.match(specs, /The reader.*Search.*Quiet 1/);

  const agents = viewOf(html, "agents");
  assert.match(agents, /On specs 3/);
  assert.match(agents, /class="group-name">The reader<\/span>.*Reviewer · RD4: review the look.*Builder · RD3: the dots/);
  assert.match(agents, /class="group-name">Search<\/span>.*Builder · SR2: the query box/);
  assert.match(agents, /On GitHub 1/);
  assert.match(agents, /Other T3 threads 1<\/span>.*Fleet #20: Search/);
  assert.doesNotMatch(agents, /#22: the query box/, "a thread shown as a spec's agent isn't listed again");
});

test("Usage: running agents by harness and model, the producer's GitHub requests, and no guessed tokens", () => {
  const ready = { status: "ready" as const, value: { specs: { used: 5, budget: 59, unchanged: 2 }, agents: { used: 3, budget: 20, unchanged: 0 }, at: now - 3 * 60_000 } };
  const usage = viewOf(renderBoard(board(), { requests: ready }), "usage");
  assert.match(usage, /Running by harness/);
  assert.deepEqual([...usage.matchAll(/<span class="bar-name">([^<]+)<\/span><span class="bar" aria-hidden="true"><i style="width:([\d.]+)%"><\/i><\/span><span class="bar-figure">([^<]+)</g)]
    .map((m) => [m[1], m[2], m[3]]), [
    ["Codex", "75", "3"], ["Claude", "25", "1"],
    ["gpt-6.1-sol", "75", "3"], ["claude-opus-5-5", "25", "1"],
    ["Specs scan", "8.5", "5 of 59"], ["Agents scan", "15", "3 of 20"],
  ]);
  assert.match(usage, /GitHub requests · last run 3m/);
  assert.match(usage, /title="Specs scan: 5 of 59 requests, 2 answered &quot;unchanged&quot;"/);
  assert.doesNotMatch(usage, /near its cap/);
  assert.match(usage, /Tokens and cost aren't shown/);

  const near = { ...ready, value: { ...ready.value, specs: { used: 52, budget: 59, unchanged: 0 } } };
  const warned = viewOf(renderBoard(board(), { requests: near }), "usage");
  assert.match(warned, /class="bar near"/);
  assert.match(warned, /<p class="warn">Specs scan is near its cap \(52 of 59\)\. Past it, the producer keeps the last file\.<\/p>/, "said in words, not by colour alone");

  assert.match(viewOf(renderBoard(board()), "usage"), /Not counted here: this board only reads the files/);
  assert.match(viewOf(renderBoard(board(), { requests: { status: "none", reason: "The specs producer hasn't finished a run yet." } }), "usage"), /hasn&#39;t finished a run yet/);
  const unread = buildBoard({ specs: pickSpecs(missing, missing, now), agents: readAgents(missing, now), t3: "off", now });
  const unknown = viewOf(renderBoard(unread), "usage");
  assert.match(unknown, /Running unknown/);
  assert.doesNotMatch(unknown, /Nothing running/, "unknown is never zero");
});

test("the refreshed fragment carries the rail's badge counts", () => {
  assert.match(renderBoard(board()), /<i hidden data-badges data-now="4" data-agents="4"><\/i>$/);
  assert.match(renderBoard(board()), /^<header>/);
});

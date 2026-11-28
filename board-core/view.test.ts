// The board core's view interface: a view, its input, the one escaper, and the stub rail.
import assert from "node:assert/strict";
import { test } from "node:test";
import { esc, renderView, unavailable, ready, type View } from "./view.ts";
import { createRail, decidedOrder, renderPage } from "./rail.ts";

/** A synthetic view: every value it draws goes through esc. */
interface Shelf { title: string; items: string[] }
const shelf: View<Shelf> = {
  id: "shelf",
  label: "Shelf <b>&</b>",
  count: (data) => data.items.length,
  render: (data) => `<h3>${esc(data.title)}</h3><ul>${data.items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`,
};
const hostile: Shelf = { title: `Tom's "list" & more`, items: [`<img src=x onerror=alert(1)>`, "plain"] };

/** A view with nothing but an id and a label, for the rail's order. */
const bare = (id: string, label: string): View<null> => ({ id, label, render: () => "" });
const needsYou = bare("needs-you", "Needs you");
const specs = bare("specs", "Specs");
const agents = bare("agents", "Agents");
const usage = bare("usage", "Usage");

test("esc escapes the five HTML characters and nothing else", () => {
  assert.equal(esc(`<a href="x" title='y'>&</a>`), "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  assert.equal(esc("Needs you · 3"), "Needs you · 3");
  assert.equal(esc(42), "42", "numbers are values too");
});

test("an input is data or unavailable with its reason", () => {
  assert.deepEqual(ready({ title: "t", items: [] }), { status: "ready", data: { title: "t", items: [] } });
  assert.deepEqual(unavailable("no file yet"), { status: "unavailable", reason: "no file yet" });
  assert.throws(() => unavailable(""), /reason/, "unavailable always says why");
});

test("a view renders its data escaped, and an unavailable input renders its reason, never zero", () => {
  const html = renderView(shelf, ready(hostile));
  assert.match(html, /^<div class="view" id="view-shelf" data-view="shelf">/);
  assert.match(html, /<h2 class="view-title">Shelf &lt;b&gt;&amp;&lt;\/b&gt;<\/h2>/);
  assert.match(html, /<h3>Tom&#39;s &quot;list&quot; &amp; more<\/h3>/);
  assert.match(html, /<li>&lt;img src=x onerror=alert\(1\)&gt;<\/li>/);
  assert.doesNotMatch(html, /<img|<b>/);

  const off = renderView(shelf, unavailable(`can't read <the> file`));
  assert.match(off, /<p class="unavailable">Shelf &lt;b&gt;&amp;&lt;\/b&gt; unavailable: can&#39;t read &lt;the&gt; file<\/p>/);
  assert.doesNotMatch(off, /\b0\b/, "unavailable is never drawn as zero");
  assert.doesNotMatch(off, /<h3>/, "the view's own render never runs without data");
});

test("a synthetic view registers as one rail entry and renders through the minimal page", () => {
  const rail = createRail();
  rail.register(shelf);
  assert.deepEqual(rail.entries(), [{ kind: "view", id: "shelf", label: "Shelf <b>&</b>" }]);
  assert.throws(() => rail.register(shelf), /already/, "one view, one rail entry");
  assert.throws(() => rail.register(bare("Bad Id", "Bad")), /lowercase/);
  assert.equal(rail.view("shelf"), shelf);

  const page = renderPage(shelf, ready(hostile));
  assert.match(page, /^<!doctype html>/);
  assert.match(page, /<nav class="rail" aria-label="Board views"><a class="tab" href="#view-shelf" data-view="shelf" aria-current="page"><span class="label">Shelf &lt;b&gt;&amp;&lt;\/b&gt;<\/span><span class="badge">2<\/span><\/a><\/nav>/);
  assert.match(page, /<main>.*<li>&lt;img src=x onerror=alert\(1\)&gt;<\/li>.*<\/main>/s);
  assert.doesNotMatch(page, /<img|<b>|<script/);
  assert.match(page, /<title>Shelf &lt;b&gt;&amp;&lt;\/b&gt;<\/title>/);

  const off = renderPage(shelf, unavailable("stale"));
  assert.doesNotMatch(off, /class="badge"/, "no count without data");
  assert.match(off, /Shelf &lt;b&gt;&amp;&lt;\/b&gt; unavailable: stale/);

  const empty = renderPage(shelf, ready({ title: "t", items: [] }));
  assert.doesNotMatch(empty, /class="badge"/, "a zero count is not drawn");
});

test("the rail keeps Needs you, Specs, Agents and Usage, then later views, then the pins", () => {
  assert.deepEqual(decidedOrder, ["needs-you", "specs", "agents", "usage"]);
  const rail = createRail({ pins: [{ label: "Slack", url: "https://example.slack.com/" }] });
  for (const view of [shelf, usage, agents, bare("settings", "Settings"), specs, needsYou]) rail.register(view);
  assert.deepEqual(rail.entries().map((e) => e.label), ["Needs you", "Specs", "Agents", "Usage", "Shelf <b>&</b>", "Settings", "Slack"]);
  assert.deepEqual(rail.entries().at(-1), { kind: "pin", label: "Slack", url: "https://example.slack.com/" });
});

test("the rail drops pins that aren't plain web links", () => {
  const rail = createRail({ pins: [{ label: "Bad", url: "javascript:alert(1)" }, { label: "Login", url: "https://me:pw@example.com/" }, { label: "Ok", url: "http://localhost:7681" }] });
  assert.deepEqual(rail.entries(), [{ kind: "pin", label: "Ok", url: "http://localhost:7681/" }]);
});

test("the board opens on Needs you and never on Agents", () => {
  const full = createRail();
  for (const view of [agents, specs, needsYou, usage]) full.register(view);
  assert.equal(full.opening(), "needs-you");

  const noNeedsYou = createRail();
  for (const view of [agents, usage, specs]) noNeedsYou.register(view);
  assert.equal(noNeedsYou.opening(), "specs", "the first view in rail order that isn't Agents");

  const onlyAgents = createRail();
  onlyAgents.register(agents);
  assert.equal(onlyAgents.opening(), null, "Agents alone opens nothing, never Agents");

  assert.equal(createRail().opening(), null);
});

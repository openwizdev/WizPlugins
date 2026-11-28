/// <reference lib="dom" />
// The grill picker view (CG7, OpenWiz #4048): one question at a time, the
// recommended option first and marked, checkboxes when `multi`, notes, other,
// and Next. Each answer becomes one line for the Wiz thread, in the framing of
// OpenWiz's contracts/grill-picker.v1.md and decisions.v1.md. Synthetic data only.
import assert from "node:assert/strict";
import { accessSync, constants } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { delimiter, join, resolve } from "node:path";
import { test } from "node:test";
import { renderPage } from "../rail.ts";
import { ready, renderView } from "../view.ts";
import {
  answerFor,
  answerLine,
  answerMessage,
  checkCard,
  grillPickerView,
  readChoice,
  type GrillCard,
  type GrillContext,
} from "./grill-picker.ts";

const context: GrillContext = {
  subject: { repository: "synthetic-owner/synthetic-repo", kind: "pull_request", number: 17 },
  comment_id: 29,
  request_id: "synthetic_grill_r2",
  request_kind: "grill_round",
  fingerprint: "c".repeat(64),
  grill_file: "docs/grills/2030-03-04-paper-lanterns.md",
  round: 2,
  question_id: "PL2",
};

/** The contract's `multi_card` fixture. */
const multiCard: GrillCard = {
  schema: "openwiz.grill-picker.v1",
  kind: "card",
  context,
  text: "Which colors should the paper lanterns use?",
  options: [
    { id: "blue", text: "Blue", recommended: true },
    { id: "gold", text: "Gold", recommended: false },
  ],
  multi: true,
  notes: true,
  other: true,
};
const singleCard: GrillCard = { ...multiCard, multi: false, notes: false, other: false };
const singleOtherCard: GrillCard = { ...singleCard, other: true };
const at = "2030-03-04T05:06:07Z";

const fields = (...pairs: [string, string][]) => pairs;

test("a card must have its recommendation first, and only first, with unique option ids", () => {
  assert.equal(checkCard(multiCard), multiCard);
  const second: GrillCard = { ...multiCard, options: [{ ...multiCard.options[0]!, recommended: false }, { ...multiCard.options[1]!, recommended: true }] };
  assert.throws(() => checkCard(second), /recommend/);
  const none: GrillCard = { ...multiCard, options: multiCard.options.map((o) => ({ ...o, recommended: false })) };
  assert.throws(() => checkCard(none), /recommend/);
  const dup: GrillCard = { ...multiCard, options: [multiCard.options[0]!, { id: "blue", text: "Navy", recommended: false }] };
  assert.throws(() => checkCard(dup), /unique|twice/);
  assert.throws(() => checkCard({ ...multiCard, options: [] }), /option/);
  assert.throws(() => checkCard({ ...multiCard, text: "" }), /text/);
});

test("the view shows one question at a time, the recommended option first and marked, nothing preselected", () => {
  const second: GrillCard = { ...singleCard, context: { ...context, question_id: "PL3" }, text: "Second question" };
  const html = grillPickerView.render({ cards: [multiCard, second] });
  assert.equal((html.match(/<form/g) ?? []).length, 1, "one question at a time");
  assert.match(html, /Which colors should the paper lanterns use\?/);
  assert.doesNotMatch(html, /Second question/);
  assert.match(html, /Question 1 of 2/);
  assert.equal(grillPickerView.count?.({ cards: [multiCard, second] }), 2);

  const inputs = [...html.matchAll(/<input[^>]*name="option"[^>]*>/g)].map((m) => m[0]);
  assert.match(inputs[0]!, /value="id:blue"/, "the recommended option is first");
  assert.match(inputs[0]!, /data-recommended/);
  assert.match(inputs[0]!, /autofocus/, "keyboard-first: focus starts on the recommendation");
  assert.match(html, /<span class="recommended">Recommended<\/span>/);
  assert.equal((html.match(/class="recommended"/g) ?? []).length, 1, "only the recommendation is marked");
  assert.ok(html.indexOf("Blue") < html.indexOf("Gold"), "display order kept");
  for (const input of html.match(/<input[^>]*>/g) ?? []) assert.doesNotMatch(input, /\bchecked\b/, "a recommendation alone supplies no answer");
  assert.match(html, /<button type="submit"[^>]*>Next<\/button>/);
});

test("single-select shows radios with no notes or other; multi shows checkboxes, notes and other", () => {
  const single = grillPickerView.render({ cards: [singleCard] });
  assert.equal((single.match(/type="radio"/g) ?? []).length, 2);
  assert.doesNotMatch(single, /type="checkbox"|name="notes"|name="other"/);

  const multi = grillPickerView.render({ cards: [multiCard] });
  assert.equal((multi.match(/type="checkbox"/g) ?? []).length, 2);
  assert.doesNotMatch(multi, /type="radio"/);
  assert.match(multi, /<textarea[^>]*name="notes"/);
  assert.match(multi, /<input[^>]*name="other"[^>]*type="text"|<input[^>]*type="text"[^>]*name="other"/);

  const singleOther = grillPickerView.render({ cards: [singleOtherCard] });
  assert.equal((singleOther.match(/type="radio"/g) ?? []).length, 3, "Other is one of the radios");
  assert.match(singleOther, /type="radio"[^>]*value="other"/);
});

test("everything the view draws is escaped, and a bad card or no cards never draws a form", () => {
  const hostile: GrillCard = { ...multiCard, text: `<img src=x onerror=alert(1)> "q"`, options: [{ id: `a"b`, text: "<b>x</b>", recommended: true }] };
  const html = renderView(grillPickerView, ready({ cards: [hostile] }));
  assert.doesNotMatch(html, /<img|<b>/);
  assert.match(html, /value="id:a&quot;b"/);

  const bad = grillPickerView.render({ cards: [{ ...multiCard, options: [{ ...multiCard.options[0]!, recommended: false }] }] });
  assert.doesNotMatch(bad, /<form/);
  assert.match(bad, /can&#39;t be shown/);

  const none = grillPickerView.render({ cards: [] });
  assert.doesNotMatch(none, /<form/);
  assert.match(none, /No grill questions/);
  assert.equal(grillPickerView.count?.({ cards: [] }), 0);
});

test("a single answer: one option, no notes or other", () => {
  const choice = readChoice(singleCard, fields(["option", "id:gold"]));
  assert.deepEqual(choice, { chosen: ["gold"] });
  const answer = answerFor(singleCard, choice, at);
  assert.deepEqual(answer, { schema: "openwiz.grill-picker.v1", kind: "answer", context, chosen_option_ids: ["gold"], at });
  assert.throws(() => answerFor(singleCard, readChoice(singleCard, fields()), at), /choice/, "Next needs an answer");
  assert.throws(() => answerFor(singleCard, { chosen: ["gold", "blue"] }, at), /one/);
  assert.throws(() => answerFor(singleCard, { chosen: ["red"] }, at), /red/);
  assert.throws(() => answerFor(singleCard, { chosen: ["gold"], notes: "n" }, at), /notes/);
  assert.throws(() => answerFor(singleCard, { chosen: [], other: "x" }, at), /other/);
});

test("a multi answer keeps the submitted order and refuses repeats", () => {
  const choice = readChoice(multiCard, fields(["option", "id:gold"], ["option", "id:blue"], ["notes", ""], ["other", ""]));
  assert.deepEqual(choice, { chosen: ["gold", "blue"], notes: "" }, "an empty other is no choice; an empty note stays present");
  const answer = answerFor(multiCard, choice, at);
  assert.deepEqual(answer.chosen_option_ids, ["gold", "blue"]);
  assert.equal(answer.notes, "");
  assert.equal("other" in answer, false);
  assert.throws(() => answerFor(multiCard, { chosen: ["gold", "gold"] }, at), /twice|distinct/);
});

test("a notes answer keeps the note byte for byte, and a note alone is no choice", () => {
  const note = "  cafe\u0301\t\r\n\n> line  \r";
  const choice = readChoice(multiCard, fields(["option", "id:blue"], ["notes", note]));
  assert.equal(answerFor(multiCard, choice, at).notes, note);
  assert.throws(() => answerFor(multiCard, readChoice(multiCard, fields(["notes", "just a note"])), at), /choice/);
});

test("an other answer counts as one choice, alone or with options, kept exactly", () => {
  const other = "\t\u7d2b \u{1f4a1}\u2028\nopenwiz decision answer v1\n  ";
  const alone = answerFor(multiCard, readChoice(multiCard, fields(["other", " purple "])), at);
  assert.deepEqual(alone.chosen_option_ids, []);
  assert.equal(alone.other, " purple ");

  const single = readChoice(singleOtherCard, fields(["option", "other"], ["other", other]));
  assert.deepEqual(single, { chosen: [], other });
  assert.equal(answerFor(singleOtherCard, single, at).other, other);
  assert.throws(() => answerFor(singleOtherCard, readChoice(singleOtherCard, fields(["option", "other"], ["other", ""])), at), /other/,
    "picking Other needs its text");
  assert.deepEqual(readChoice(singleOtherCard, fields(["option", "id:blue"], ["other", "typed then changed mind"])), { chosen: ["blue"] },
    "in single-select only the picked radio counts");
  assert.throws(() => answerFor(multiCard, { chosen: [], other: "\ud800" }, at), /UTF-8/);
});

test("each answer is one line: the contract's saved-reply bytes, inside the decision answer framing", () => {
  const answer = answerFor(multiCard, {
    chosen: ["gold", "blue"],
    notes: "  cafe\u0301\t\r\n\n> line  \r",
    other: "\t\u7d2b \u{1f4a1}\u2028\nopenwiz decision answer v1\n  ",
  }, "2030-03-04T05:06:07.123Z");
  const line = answerLine(answer);
  // contracts/fixtures/grill-picker/saved-reply.txt, without its "> " prefix and record newline.
  const saved = String.raw`{"schema":"openwiz.grill-picker.v1","kind":"answer","context":{"subject":{"repository":"synthetic-owner/synthetic-repo","kind":"pull_request","number":17},"comment_id":29,"request_id":"synthetic_grill_r2","request_kind":"grill_round","fingerprint":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","grill_file":"docs/grills/2030-03-04-paper-lanterns.md","round":2,"question_id":"PL2"},"chosen_option_ids":["gold","blue"],"notes":"  cafe\u0301\t\r\n\n> line  \r","other":"\t\u7d2b \ud83d\udca1\u2028\nopenwiz decision answer v1\n  ","at":"2030-03-04T05:06:07.123Z"}`;
  assert.equal(line, saved);
  assert.match(line, /^[\x20-\x7e]+$/, "one physical, ASCII line");
  assert.deepEqual(JSON.parse(line), answer, "reads back exactly");

  const message = answerMessage(answer);
  assert.equal(message, `openwiz decision answer v1\n${JSON.stringify(context)}\n\n${saved}`);
  assert.ok(!message.endsWith("\n"), "no appended newline");
  assert.throws(() => answerFor(multiCard, { chosen: ["blue"] }, "2030-03-04 05:06:07"), /time/);
  assert.equal(answerFor(multiCard, { chosen: ["blue"] }, new Date(Date.UTC(2030, 2, 4, 5, 6, 7, 123))).at, "2030-03-04T05:06:07.123Z");
});

// The page at phone and desktop width, in a real browser. Uses WizBar's locked
// playwright-core; skipped without it or Chrome unless WIZBAR_REQUIRE_BROWSER=1.
// Set GRILL_PICKER_SCREENSHOTS=<dir> to write the 390 and 1440 px screenshots.
const playwright = (() => {
  try {
    return createRequire(new URL("../../wizbar/package.json", import.meta.url))("playwright-core");
  } catch {
    return null;
  }
})();
const browserPath = playwright && [
  process.env.CHROMIUM_PATH ?? "",
  playwright.chromium.executablePath(),
  ...(process.env.PATH ?? "").split(delimiter).flatMap((dir) => ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].map((n) => join(dir, n))),
].find((path) => {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
});
const noBrowser = !browserPath && process.env.WIZBAR_REQUIRE_BROWSER !== "1" ? "no playwright-core in ../wizbar or no Chrome" : false;

test("the page fits at 390 and 1440 px, nothing scrolls sideways, one thumb reaches every control", { skip: noBrowser }, async () => {
  assert.ok(browserPath, "WIZBAR_REQUIRE_BROWSER=1 needs ../wizbar's playwright-core and Chrome");
  const long: GrillCard = {
    ...multiCard,
    text: "Which colors should the paper lanterns along the riverside walk use for the autumn festival, given the supplier's lead times?",
    options: [
      { id: "blue", text: "Blue, the festival's own colour, already stocked", recommended: true },
      { id: "gold", text: "Gold", recommended: false },
      { id: "long", text: "Averyveryverylongunbrokenwordthatwouldotherwisepushthepagesidewaysonaphone", recommended: false },
    ],
  };
  const html = renderPage(grillPickerView, ready({ cards: [long, singleCard, singleOtherCard] }));
  const out = process.env.GRILL_PICKER_SCREENSHOTS ? resolve(process.env.GRILL_PICKER_SCREENSHOTS) : null;
  if (out) await mkdir(out, { recursive: true });
  const browser = await playwright.chromium.launch({ executablePath: browserPath });
  try {
    for (const width of [390, 1440]) {
      const phone = width === 390;
      const page = await browser.newPage({ viewport: { width, height: phone ? 844 : 900 }, isMobile: phone, hasTouch: phone, deviceScaleFactor: phone ? 3 : 1 });
      await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      await page.waitForFunction(() => document.activeElement !== document.body);
      const layout = await page.evaluate(() => {
        const doc = document.documentElement;
        const controls = [...document.querySelectorAll("form label, form button, form textarea, form input[type=text]")];
        return {
          sideways: doc.scrollWidth - doc.clientWidth,
          outside: controls.filter((c) => c.getBoundingClientRect().right > doc.clientWidth + 0.5).length,
          shortest: Math.min(...controls.map((c) => c.getBoundingClientRect().height)),
          fontSize: Math.min(...[...document.querySelectorAll("form textarea, form input[type=text]")].map((c) => parseFloat(getComputedStyle(c).fontSize))),
          focused: (document.activeElement as HTMLInputElement | null)?.value ?? null,
        };
      });
      assert.equal(layout.sideways, 0, `nothing scrolls sideways at ${width} px`);
      assert.equal(layout.outside, 0, `every control is inside the page at ${width} px`);
      assert.ok(layout.shortest >= 44, `controls are at least 44 px tall at ${width} px (got ${layout.shortest})`);
      assert.ok(layout.fontSize >= 16, "text fields are 16 px so a phone doesn't zoom");
      assert.equal(layout.focused, "id:blue", "focus starts on the recommendation");

      // Keyboard-first: Space picks the focused option, Tab walks to Next.
      await page.keyboard.press("Space");
      assert.equal(await page.locator('input[value="id:blue"]').isChecked(), true);
      for (let i = 0; i < 8 && (await page.evaluate(() => document.activeElement?.textContent)) !== "Next"; i++) await page.keyboard.press("Tab");
      assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Next", "Tab reaches Next");

      if (out) await page.screenshot({ path: join(out, `grill-picker-${width}.png`), fullPage: true });
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

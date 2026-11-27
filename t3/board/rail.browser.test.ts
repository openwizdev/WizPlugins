// The rail in a real Chromium, against the real server: labels beside the icons from 420 px, icons only
// under it with each label on hover, keyboard focus or a long press, and one view at a time that
// survives the page's refresh and a reload. Uses WizBar's locked playwright-core (`cd wizbar && npm ci`)
// and an installed Chrome or Chromium; skipped when there is none, unless T3_REQUIRE_BROWSER=1 (CI).
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { accessSync, constants, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { Browser, BrowserContext, Page } from "playwright-core";

const require = createRequire(new URL("../../wizbar/package.json", import.meta.url));
let playwright: typeof import("playwright-core") | null = null;
try {
  playwright = require("playwright-core") as typeof import("playwright-core");
} catch {
  playwright = null;
}
const candidates = process.env.CHROMIUM_PATH ? [process.env.CHROMIUM_PATH] : [
  ...(playwright ? [playwright.chromium.executablePath()] : []),
  ...(process.env.PATH ?? "").split(delimiter).flatMap((dir) =>
    ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].map((name) => join(dir, name))),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];
const browserPath = candidates.find((path) => {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
});
const missing = !playwright ? "WizBar's playwright-core isn't installed (cd wizbar && npm ci)" : !browserPath ? "no Chrome or Chromium found (set CHROMIUM_PATH)" : null;
if (missing && process.env.T3_REQUIRE_BROWSER === "1") throw new Error(`The rail's browser test can't run: ${missing}`);
const skip = missing ? `skipped: ${missing}` : false;

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
let browser: Browser | null = null;
let server: ChildProcess | null = null;
let home = "";
let base = "";

before(async () => {
  if (skip) return;
  home = mkdtempSync(join(tmpdir(), "wizbar-t3-rail-"));
  server = spawn(process.execPath, [here("./server.ts"), "--port", "0", "--home", home, "--repo", "example/site", "--producer", here("./fixtures/fake-producer.ts"),
    "--t3", here("./fixtures/fake-t3.mjs"), "--t3-project", "demo", "--refresh", "1",
    "--pin", "Slack=https://example.slack.com/", "--pin", "Terminal=http://localhost:7681/"], { stdio: ["ignore", "pipe", "pipe"] });
  base = await new Promise<string>((resolve, reject) => {
    let out = "";
    server!.stdout!.on("data", (d) => {
      out += d;
      const m = /http:\/\/localhost:(\d+)/.exec(out);
      if (m) resolve(`http://localhost:${m[1]}/`);
    });
    server!.on("exit", (code) => reject(new Error(`server exited ${code}`)));
  });
  browser = await playwright!.chromium.launch({ executablePath: browserPath });
});

after(async () => {
  await browser?.close();
  server?.kill();
  if (home) rmSync(home, { recursive: true, force: true });
});

async function open(width: number, options: { touch?: boolean } = {}): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser!.newContext({ viewport: { width, height: 800 }, colorScheme: "dark", hasTouch: options.touch ?? false });
  const page = await context.newPage();
  await page.goto(base);
  // The fake producer writes the files right after the server starts; wait for the board to read them.
  await page.waitForFunction(() => document.querySelector("#view-specs .spec") !== null, undefined, { timeout: 10_000 });
  return { context, page };
}
const tab = (page: Page, label: string) => page.locator(".rail .tab").filter({ has: page.locator(".label", { hasText: new RegExp(`^${label}`) }) });
const labelOf = (page: Page, label: string) => tab(page, label).locator(".label");
const opacity = (page: Page, label: string) => labelOf(page, label).evaluate((el) => getComputedStyle(el).opacity);
const settled = (page: Page, label: string, value: string) =>
  page.waitForFunction(([l, v]) => [...document.querySelectorAll(".rail .tab")].some((t) => t.querySelector(".label")?.firstChild?.textContent === l
    && getComputedStyle(t.querySelector(".label")!).opacity === v), [label, value] as const, { timeout: 2000 });
const view = (page: Page) => page.evaluate(() => document.body.dataset.view);

test("from 420 px the rail shows each label beside its icon", { skip }, async () => {
  for (const width of [1440, 420]) {
    const { context, page } = await open(width);
    const rail = (await page.locator(".rail").boundingBox())!;
    assert.ok(rail.width >= 120, `rail ${rail.width}px wide at ${width}`);
    for (const label of ["Now", "Specs", "Agents", "Usage", "Slack", "Terminal"]) {
      assert.equal(await opacity(page, label), "1", `${label} at ${width}`);
      const box = (await labelOf(page, label).boundingBox())!;
      assert.ok(box.x + box.width <= rail.x + rail.width, `${label} sits inside the rail at ${width}`);
      assert.equal(await labelOf(page, label).evaluate((el) => el.scrollWidth <= el.clientWidth), true, `${label} isn't cut at ${width}`);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, "nothing spills sideways");
    await context.close();
  }
});

test("under 420 px the rail shows icons only, and a label on hover or keyboard focus", { skip }, async () => {
  const { context, page } = await open(419);
  assert.ok(((await page.locator(".rail").boundingBox())!.width) <= 46, "a narrow rail at 419 px");
  await context.close();

  const { context: c390, page: p } = await open(390);
  const rail = (await p.locator(".rail").boundingBox())!;
  assert.ok(rail.width <= 46, `rail ${rail.width}px wide`);
  for (const label of ["Now", "Specs", "Agents", "Usage", "Slack", "Terminal"]) assert.equal(await opacity(p, label), "0", `${label} hidden`);
  assert.equal(await p.locator('.rail [data-badge="now"]').isVisible(), true, "Now keeps a dot for what needs you");

  await tab(p, "Usage").hover();
  await settled(p, "Usage", "1");
  const shown = (await labelOf(p, "Usage").boundingBox())!;
  assert.ok(shown.x >= rail.x + rail.width, "the label shows to the right of the rail, over the board");
  await p.mouse.move(300, 700);
  await settled(p, "Usage", "0");

  await p.keyboard.press("Tab");
  assert.equal(await p.evaluate(() => (document.activeElement as HTMLElement).dataset.view), "now");
  await settled(p, "Now", "1");
  await p.keyboard.press("Tab");
  await settled(p, "Specs", "1");
  await settled(p, "Now", "0");

  for (const key of ["now", "specs", "agents", "usage"]) {
    await p.evaluate((k) => { location.hash = `#view-${k}`; }, key);
    assert.equal(await view(p), key);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 390, `${key} doesn't spill sideways at 390 px`);
  }
  await c390.close();
});

test("under 420 px a long press shows the label and doesn't open the tab; a tap does", { skip }, async () => {
  const { context, page } = await open(390, { touch: true });
  const press = (type: string) => tab(page, "Specs").evaluate((el, t) =>
    el.dispatchEvent(new PointerEvent(t, { pointerType: "touch", bubbles: true, isPrimary: true })), type);
  await press("pointerdown");
  await page.waitForTimeout(650);
  assert.equal(await tab(page, "Specs").evaluate((el) => el.classList.contains("peek")), true);
  await settled(page, "Specs", "1");
  await press("pointerup");
  await tab(page, "Specs").evaluate((el) => (el as HTMLElement).click());
  assert.equal(await view(page), "now", "the press only showed the label");

  const box = (await tab(page, "Specs").boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  assert.equal(await view(page), "specs");
  await settled(page, "Specs", "0");
  await context.close();
});

test("one view at a time; it stays open, with focus, through a refresh and a reload, and the badges follow", { skip }, async () => {
  const { context, page } = await open(1440);
  assert.equal(await view(page), "now");
  assert.equal(await page.locator("#view-now").isVisible(), true);
  assert.equal(await page.locator("#view-specs").isVisible(), false);
  assert.equal(await tab(page, "Now").getAttribute("aria-current"), "page");
  assert.equal(await page.locator('.rail [data-badge="now"] b').textContent(), "4");

  await tab(page, "Specs").click();
  assert.equal(await view(page), "specs");
  assert.equal(await page.evaluate(() => location.hash), "#view-specs");
  assert.equal(await page.locator("#view-specs").isVisible(), true);
  assert.equal(await page.locator("#view-now").isVisible(), false);
  assert.equal(await tab(page, "Specs").getAttribute("aria-current"), "page");
  assert.equal(await tab(page, "Now").getAttribute("aria-current"), null);

  // Mark the board, then wait for the page's own refresh to replace it.
  await page.evaluate(() => { document.querySelector("#board header")!.setAttribute("data-old", ""); });
  await page.waitForFunction(() => document.querySelector("#board header[data-old]") === null, undefined, { timeout: 5000 });
  assert.equal(await view(page), "specs");
  assert.equal(await page.locator("#view-specs").isVisible(), true);
  assert.equal(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.view), "specs", "the rail keeps focus: it isn't redrawn");
  assert.equal(await page.locator('.rail [data-badge="agents"] b').textContent(), "4");

  await page.reload();
  assert.equal(await view(page), "specs");
  await page.goto(base);
  assert.equal(await view(page), "specs", "the session remembers the view without the address");
  await context.close();
});

test("pinned links open in a new tab and leave the board as it is", { skip }, async () => {
  const { context, page } = await open(1440);
  const pins = await page.locator(".rail .pin").evaluateAll((links) => links.map((a) => [a.getAttribute("href"), a.getAttribute("target"), a.getAttribute("rel")]));
  assert.deepEqual(pins, [["https://example.slack.com/", "_blank", "noopener noreferrer"], ["http://localhost:7681/", "_blank", "noopener noreferrer"]]);
  await context.close();
});

import { accessSync, constants } from "node:fs";
import { mkdir } from "node:fs/promises";
import { delimiter, join, resolve } from "node:path";
import { chromium, type Browser, type Locator, type Page } from "playwright-core";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, expect, it } from "vitest";

const candidates = process.env.CHROMIUM_PATH ? [process.env.CHROMIUM_PATH] : [
  chromium.executablePath(),
  ...(process.env.PATH ?? "").split(delimiter).flatMap((dir) =>
    ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].map((name) => join(dir, name))),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];
const browserPath = candidates.find((path) => {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
});

if (!browserPath) {
  const message = "No Chromium or Chrome found. Install Chromium with Playwright or set CHROMIUM_PATH.";
  if (process.env.WIZBAR_REQUIRE_BROWSER === "1") throw new Error(message);
  process.stderr.write(`Skipping WizBar browser tests. ${message}\n`);
}

let server: ViteDevServer;
let browser: Browser;
let url: string;
const evidence = process.env.WIZBAR_BROWSER_EVIDENCE === "1"
  ? resolve("../docs/evidence/wizbar-0-7/r1")
  : null;

beforeAll(async () => {
  server = await createServer({
    configFile: false,
    esbuild: { jsx: "automatic" },
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  url = new URL("/browser/running-card.html", server.resolvedUrls!.local[0]).href;
  browser = await chromium.launch({ executablePath: browserPath });
  if (evidence) await mkdir(evidence, { recursive: true });
}, 30_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

function geometry(list: Locator) {
  return list.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const top = rect.top + node.clientTop;
    const bottom = top + node.clientHeight;
    const rows = [...node.querySelectorAll("[data-thread]")].map((row) => row.getBoundingClientRect());
    const whole = ({ top: y1, bottom: y2 }: DOMRect) => y1 >= top - 0.5 && y2 <= bottom + 0.5;
    return {
      atTop: node.scrollTop === 0,
      atBottom: node.scrollHeight - node.clientHeight - node.scrollTop < 1,
      firstWhole: whole(rows[0]!),
      lastWhole: whole(rows.at(-1)!),
      partialRows: rows.filter((row) => row.bottom > top + 0.5 && row.top < bottom - 0.5 && !whole(row)).length,
    };
  });
}

async function expectFade(fade: Locator, list: Locator, edge: "top" | "bottom") {
  const [overlay, viewport] = await Promise.all([fade.boundingBox(), list.boundingBox()]);
  expect.soft(overlay?.height, `${edge} fade covers one row of text`).toBeGreaterThanOrEqual(24);
  expect.soft(overlay?.width).toBe(viewport?.width);
  const { gradient, surface } = await fade.evaluate((node) => ({
    gradient: getComputedStyle(node).backgroundImage,
    surface: getComputedStyle(node.closest('[aria-label="Running threads"]')!).backgroundColor,
  }));
  expect.soft(gradient).toContain(edge === "top" ? "linear-gradient(to top," : "linear-gradient(");
  expect.soft(gradient).toMatch(/transparent|rgba\(0, 0, 0, 0\)/);
  expect.soft(gradient).toContain(`${surface} 85%`);
  const y = edge === "top" ? viewport!.y + 24 : viewport!.y + viewport!.height - 24;
  expect.soft(overlay?.y, `${edge} fade overlaps the edge row`).toBe(y);
}

async function tabThroughRows(page: Page, list: Locator, key: "Tab" | "Shift+Tab", steps: number) {
  const visited: string[] = [];
  const obscured: { row: string; by: string[] }[] = [];
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press(key);
    const result = await list.evaluate(async (viewport) => {
      // Let the scroll event update the fades before checking their painted bounds.
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const button = document.activeElement;
      const row = button?.closest("[data-thread]");
      if (!row || !viewport.contains(row)) return null;
      const bounds = button!.getBoundingClientRect();
      const visible = viewport.getBoundingClientRect();
      const by: string[] = [];
      if (bounds.top < visible.top - 0.5 || bounds.bottom > visible.bottom + 0.5) by.push("list edge");
      for (const overlay of [
        ...viewport.parentElement!.querySelectorAll("[data-scroll-fade]"),
        ...viewport.querySelectorAll("button[aria-controls]"),
      ]) {
        const rect = overlay.getBoundingClientRect();
        if (bounds.bottom > rect.top + 0.5 && bounds.top < rect.bottom - 0.5 &&
          bounds.right > rect.left + 0.5 && bounds.left < rect.right - 0.5) {
          by.push(overlay.getAttribute("data-scroll-fade") ?? "group heading");
        }
      }
      if (!button!.matches(":focus-visible")) by.push("no keyboard focus indicator");
      return { row: row.getAttribute("data-thread")!, by };
    });
    if (result) {
      visited.push(result.row);
      if (result.by.length > 0) obscured.push(result);
    }
  }
  return { visited, obscured };
}

it.skipIf(!browserPath).each([600, 900])("shows all 100 threads in a %i px window", async (height) => {
  const page = await browser.newPage({ viewport: { width: 350, height }, reducedMotion: "reduce" });
  try {
    await page.goto(url);
    const trigger = page.getByRole("button", { name: "100 running" });
    const card = page.getByRole("region", { name: "Running threads" });
    const list = card.locator('[aria-label="Threads"]');
    await trigger.hover();
    const start = (await trigger.boundingBox())!;
    const panel = (await card.boundingBox())!;
    expect.soft(panel.y, "the card fits above its trigger").toBeGreaterThanOrEqual(0);
    expect(panel.y + panel.height).toBeLessThan(start.y);
    await page.mouse.move(start.x + start.width / 2, panel.y + panel.height - 2, { steps: 12 });
    expect(await card.isVisible(), "pointer can cross the gap").toBe(true);
    await page.mouse.move(1, height - 40);
    expect(await card.isVisible()).toBe(false);

    await page.keyboard.press("Tab");
    expect(await trigger.evaluate((node) => node === document.activeElement)).toBe(true);
    await page.keyboard.press("Tab");
    const focus = await card.evaluate((node) => {
      const focused = document.activeElement!;
      const style = getComputedStyle(focused);
      return {
        inCard: node.contains(focused) && focused.matches(":focus-visible"),
        visible: (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0)
          || (style.boxShadow !== "none" && style.boxShadow.includes("1px")),
      };
    });
    expect(focus).toEqual({ inCard: true, visible: true });

    const topFade = card.locator('[data-scroll-fade="top"]');
    const bottomFade = card.locator('[data-scroll-fade="bottom"]');
    await expect.poll(async () => await bottomFade.isVisible()).toBe(true);
    expect(await topFade.isVisible()).toBe(false);

    expect(await list.locator("[data-thread]").count()).toBe(100);
    expect.soft(await geometry(list), "top exposes the whole first row and clips no row").toMatchObject({
      atTop: true, atBottom: false, firstWhole: true, partialRows: 0,
    });
    await expectFade(bottomFade, list, "bottom");
    const summary = await card.locator("p").evaluateAll((lines) =>
      lines.map((line) => ({ text: line.textContent, height: line.getBoundingClientRect().height, fits: line.scrollWidth <= line.clientWidth })));
    expect.soft(summary).toEqual([
      { text: "100 awake · 0 starting · 0 asleep", height: 20, fits: true },
      { text: "0 waiting on you · 0 cloud, 100 local", height: 20, fits: true },
      expect.objectContaining({
        text: "Cloud agents in their own sandbox may be missing from this list. GitHub agent data is unavailable.",
        fits: true,
      }),
    ]);
    if (evidence) await page.screenshot({ path: resolve(evidence, `${height}-top.png`) });
    await list.hover();
    await page.mouse.wheel(0, 300);
    await expect.poll(async () => await topFade.isVisible()).toBe(true);
    expect(await bottomFade.isVisible()).toBe(true);
    const heading = list.getByRole("button", { name: "Sample palette 60" });
    expect.soft((await heading.boundingBox())?.y, "the current spec heading stays at the top").toBe((await list.boundingBox())?.y);
    await page.mouse.wheel(0, 10_000);
    await expect.poll(async () => (await geometry(list)).atBottom).toBe(true);
    expect.soft(await geometry(list), "bottom exposes the whole last row and clips no row").toMatchObject({
      atTop: false, atBottom: true, lastWhole: true, partialRows: 0,
    });
    await expect.poll(async () => await bottomFade.isVisible()).toBe(false);
    expect(await topFade.isVisible()).toBe(true);
    await expectFade(topFade, list, "top");
    if (evidence) await page.screenshot({ path: resolve(evidence, `${height}-bottom.png`) });
    await page.mouse.wheel(0, -10_000);
    await expect.poll(async () => (await geometry(list)).firstWhole).toBe(true);

    const rows = Array.from({ length: 100 }, (_, index) => `sample-${index + 1}`);
    const controls = rows.length + 3; // Three expanded group headings.
    const forward = await tabThroughRows(page, list, "Tab", controls);
    expect.soft(forward.visited).toEqual(rows);
    expect.soft(forward.obscured, "forward Tab keeps each row clear").toEqual([]);
    const backward = await tabThroughRows(page, list, "Shift+Tab", controls - 1);
    expect.soft(backward.visited).toEqual(rows.slice(0, -1).reverse());
    expect.soft(backward.obscured, "reverse Tab keeps each row clear").toEqual([]);
  } finally {
    await page.close();
  }
}, 30_000);

it.skipIf(!browserPath)("shows all large machine totals without clipping or ellipsis", async () => {
  const page = await browser.newPage({ viewport: { width: 350, height: 600 } });
  try {
    await page.goto(`${url}?large-summary=1`);
    await page.getByRole("button", { name: "360 running" }).hover();
    const card = page.getByRole("region", { name: "Running threads" });
    const summary = card.getByText("120 waiting on you · 120 cloud, 120 local, 120 unknown");
    await summary.waitFor({ state: "visible" });
    const layout = await summary.evaluate((line) => ({
      fitsWidth: line.scrollWidth <= line.clientWidth,
      fitsHeight: line.scrollHeight <= line.clientHeight,
      textOverflow: getComputedStyle(line).textOverflow,
    }));
    expect(layout).toEqual({ fitsWidth: true, fitsHeight: true, textOverflow: "clip" });
  } finally {
    await page.close();
  }
});

import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser, type Locator } from "playwright-core";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, expect, it } from "vitest";

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
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
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

it.each([600, 900])("shows all 100 threads in a %i px window", async (height) => {
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
    if (evidence) await page.screenshot({ path: resolve(evidence, `${height}-top.png`) });
    await list.hover();
    await page.mouse.wheel(0, 300);
    await expect.poll(async () => await topFade.isVisible()).toBe(true);
    expect(await bottomFade.isVisible()).toBe(true);
    await page.mouse.wheel(0, 10_000);
    await expect.poll(async () => (await geometry(list)).atBottom).toBe(true);
    expect.soft(await geometry(list), "bottom exposes the whole last row and clips no row").toMatchObject({
      atTop: false, atBottom: true, lastWhole: true, partialRows: 0,
    });
    await expect.poll(async () => await bottomFade.isVisible()).toBe(false);
    expect(await topFade.isVisible()).toBe(true);
    if (evidence) await page.screenshot({ path: resolve(evidence, `${height}-bottom.png`) });
    await page.mouse.wheel(0, -10_000);
    await expect.poll(async () => (await geometry(list)).firstWhole).toBe(true);
  } finally {
    await page.close();
  }
}, 15_000);

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const marketplace = new URL("../../marketplace/", import.meta.url);
const screenshots = new URL("screenshots/wizbar/", marketplace);
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("WizBar marketplace files", () => {
  it("keeps the overview within 4,000 characters", () => {
    const overview = readFileSync(new URL("overview/wizbar.md", marketplace), "utf8");
    expect([...overview.replace(/\n$/, "")].length).toBeLessThanOrEqual(4_000);
  });

  it.each(readdirSync(screenshots))("keeps %s at least 1,200 pixels wide", (filename) => {
    const png = readFileSync(new URL(filename, screenshots));
    expect(png.subarray(0, 8)).toEqual(pngSignature);
    expect(png.toString("ascii", 12, 16)).toBe("IHDR");
    // The first four bytes of the IHDR payload are the big-endian width.
    expect(png.readUInt32BE(16)).toBeGreaterThanOrEqual(1_200);
  });
});

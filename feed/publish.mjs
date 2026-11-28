import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export async function publishFeed(destination, contents) {
  if (typeof destination !== "string" || destination.length === 0 || destination.includes("\0")) {
    throw new TypeError("destination must be a non-empty file path");
  }
  const bytes = typeof contents === "string"
    ? Buffer.from(contents, "utf8")
    : contents instanceof Uint8Array
      ? contents
      : null;
  if (bytes === null) {
    throw new TypeError("contents must be a string or Uint8Array");
  }

  const dir = dirname(destination);
  const base = basename(destination);
  if (base === "" || base === "." || base === "..") {
    throw new TypeError("destination must name a file");
  }

  await fs.mkdir(dir, { recursive: true });
  const tempPath = join(dir, `.${base}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`);
  let handle = await fs.open(tempPath, "wx");
  try {
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(tempPath, destination);
  } catch (error) {
    if (handle !== null) {
      await handle.close().catch(() => {});
    }
    await fs.unlink(tempPath).catch(() => {});
    throw error;
  }
}

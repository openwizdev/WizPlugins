import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { publishFeed } from "./publish.mjs";

async function withTempDir(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openwiz-feed-publish-"));
  try {
    return await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("replaces an existing destination with the complete new contents", async () => {
  await withTempDir(async (dir) => {
    const dest = path.join(dir, "feed.v1.json");
    const previous = '{"schema":"openwiz.feed.v1","cards":["old"]}\n';
    const next = '{"schema":"openwiz.feed.v1","cards":["new-1","new-2"]}\n';
    await fs.writeFile(dest, previous, "utf8");

    await publishFeed(dest, next);

    assert.equal(await fs.readFile(dest, "utf8"), next);
    assert.deepEqual(await fs.readdir(dir), ["feed.v1.json"]);
  });
});

test("publishes raw bytes without altering them and creates missing parent directories", async () => {
  await withTempDir(async (dir) => {
    const dest = path.join(dir, ".openwiz", "feed.v1.json");
    const payload = Buffer.from('{"schema":"openwiz.feed.v1","note":"caf\u00e9"}\n', "utf8");

    await publishFeed(dest, payload);

    assert.deepEqual(await fs.readFile(dest), payload);
    assert.deepEqual(await fs.readdir(path.dirname(dest)), ["feed.v1.json"]);
  });
});

test("forced failure before rename preserves previous contents, surfaces the error, and removes its temp file", async (t) => {
  await withTempDir(async (dir) => {
    const dest = path.join(dir, "feed.v1.json");
    const previous = '{"schema":"openwiz.feed.v1","cards":["keep"]}\n';
    const next = '{"schema":"openwiz.feed.v1","cards":["discard"]}\n';
    await fs.writeFile(dest, previous, "utf8");

    let seenTempPath = null;
    t.mock.method(fs, "rename", async (from, to) => {
      seenTempPath = from;
      assert.equal(path.dirname(from), dir);
      assert.equal(to, dest);
      assert.equal(await fs.readFile(from, "utf8"), next);
      throw new Error("simulated rename failure");
    });

    await assert.rejects(
      () => publishFeed(dest, next),
      /simulated rename failure/,
    );

    assert.ok(seenTempPath, "expected a temporary file to be created before rename");
    assert.equal(await fs.readFile(dest, "utf8"), previous);
    assert.deepEqual(await fs.readdir(dir), ["feed.v1.json"]);
  });
});

test("forced failure during write preserves previous contents, surfaces the error, and removes its temp file", async (t) => {
  await withTempDir(async (dir) => {
    const dest = path.join(dir, "feed.v1.json");
    const previous = '{"schema":"openwiz.feed.v1","cards":["keep"]}\n';
    await fs.writeFile(dest, previous, "utf8");

    const realOpen = fs.open;
    let seenTempPath = null;
    t.mock.method(fs, "open", async (filePath, ...rest) => {
      const handle = await realOpen.call(fs, filePath, ...rest);
      seenTempPath = filePath;
      const origWriteFile = handle.writeFile.bind(handle);
      handle.writeFile = async () => {
        await origWriteFile("partial");
        throw new Error("simulated write failure");
      };
      return handle;
    });

    await assert.rejects(
      () => publishFeed(dest, '{"schema":"openwiz.feed.v1","cards":["broken"]}\n'),
      /simulated write failure/,
    );

    assert.ok(seenTempPath, "expected a temporary file to be opened");
    assert.equal(await fs.readFile(dest, "utf8"), previous);
    assert.deepEqual(await fs.readdir(dir), ["feed.v1.json"]);
  });
});

test("overlapping calls use distinct temporary files and leave one complete result with no temp files", async (t) => {
  await withTempDir(async (dir) => {
    const dest = path.join(dir, "feed.v1.json");
    await fs.writeFile(dest, '{"schema":"openwiz.feed.v1","run":0}\n', "utf8");

    const realRename = fs.rename;
    const seenTempPaths = [];
    t.mock.method(fs, "rename", async (from, to) => {
      seenTempPaths.push(from);
      assert.equal(path.dirname(from), dir);
      assert.equal(to, dest);
      return realRename.call(fs, from, to);
    });

    const payloads = Array.from({ length: 16 }, (_, i) =>
      JSON.stringify({ schema: "openwiz.feed.v1", run: i + 1, pad: "x".repeat(512 + i * 37) }) + "\n",
    );

    await Promise.all(payloads.map((body) => publishFeed(dest, body)));

    assert.equal(seenTempPaths.length, payloads.length);
    assert.equal(new Set(seenTempPaths).size, payloads.length);

    const finalBody = await fs.readFile(dest, "utf8");
    assert.ok(payloads.includes(finalBody), "final contents must match one complete payload");
    assert.deepEqual(await fs.readdir(dir), ["feed.v1.json"]);
  });
});

test("rejects invalid destination or unserialized contents without touching the filesystem", async () => {
  await withTempDir(async (dir) => {
    const dest = path.join(dir, "feed.v1.json");
    await assert.rejects(() => publishFeed("", "{}"), TypeError);
    await assert.rejects(() => publishFeed(path.join(dir, "bad\0name"), "{}"), TypeError);
    await assert.rejects(() => publishFeed(dest, { not: "serialized" }), TypeError);
    await assert.rejects(() => publishFeed(dest, null), TypeError);
    assert.deepEqual(await fs.readdir(dir), []);
  });
});

// The server end to end: a real process on a free port, the fake producer and the fake `t3`.
import assert from "node:assert/strict";
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./server.ts";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const server = here("./server.ts");
const fakeT3 = here("./fixtures/fake-t3.mjs");
const fakeProducer = here("./fixtures/fake-producer.ts");
const folders: string[] = [];
const children: ChildProcess[] = [];
after(() => {
  for (const child of children) child.kill();
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
});
const folder = () => { const f = mkdtempSync(join(tmpdir(), "wizbar-t3-")); folders.push(f); return f; };

function start(args: string[], env: Record<string, string> = {}): Promise<{ port: number; child: ChildProcess; stderr: () => string }> {
  const child = spawn(process.execPath, [server, "--port", "0", ...args], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  let err = "";
  child.stderr!.on("data", (d) => { err += d; });
  return new Promise((resolve, reject) => {
    let out = "";
    child.stdout!.on("data", (d) => {
      out += d;
      const m = /http:\/\/localhost:(\d+)/.exec(out);
      if (m) resolve({ port: Number(m[1]), child, stderr: () => err });
    });
    child.on("exit", (code) => reject(new Error(`server exited ${code}: ${err}`)));
  });
}

function get(port: number, path: string, options: { host?: string; method?: string } = {}): Promise<{ status: number; headers: Record<string, unknown>; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method: options.method ?? "GET", headers: { host: options.host ?? `localhost:${port}` } }, (res) => {
      let body = "";
      res.on("data", (d) => { body += d; });
      res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function until<T>(read: () => Promise<T>, ok: (value: T) => boolean): Promise<T> {
  for (let i = 0; i < 100; i++) {
    const value = await read();
    if (ok(value)) return value;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("timed out");
}

test("serves the board from the producer's files and T3's threads, on loopback only", async () => {
  const home = folder();
  const producerLog = join(folder(), "producer.log");
  const t3Log = join(folder(), "t3.log");
  const { port } = await start(
    ["--home", home, "--repo", "example/site", "--author", "example-bot", "--producer", fakeProducer, "--t3", fakeT3, "--t3-project", "/work/site"],
    { FAKE_PRODUCER_LOG: producerLog, FAKE_T3_LOG: t3Log },
  );
  const json = await until(() => get(port, "/board.json"), (r) => r.status === 200 && JSON.parse(r.body).t3.status === "ready" && JSON.parse(r.body).specs.status === "ready");
  const board = JSON.parse(json.body);
  assert.equal(board.specs.rule, "Specs 2 · 1 ticket needs you (1 spec)");
  assert.equal(board.running, 4);
  assert.match(board.producer.line, /3 specs/);
  assert.deepEqual(JSON.parse(readFileSync(producerLog, "utf8").trim().split("\n")[0]!), ["--home", home, "--repo", "example/site", "--author", "example-bot"]);
  assert.deepEqual(JSON.parse(readFileSync(t3Log, "utf8").trim().split("\n")[0]!), ["thread", "list", "--project", "/work/site", "--json"]);

  const page = await get(port, "/");
  assert.equal(page.status, 200);
  assert.match(String(page.headers["content-type"]), /text\/html/);
  assert.equal(page.headers["cache-control"], "no-store");
  const nonce = /script-src 'nonce-([^']+)'/.exec(String(page.headers["content-security-policy"]))?.[1];
  assert.ok(nonce, "the page's one script runs by nonce");
  assert.ok(page.body.includes(`<script nonce="${nonce}">`));
  assert.match(page.body, /The reader/);
  assert.match(page.body, /Fleet #20: Search/);

  const fragment = await get(port, "/board");
  assert.match(fragment.body, /^<header>/);
  assert.doesNotMatch(fragment.body, /<script/);

  assert.equal((await get(port, "/", { host: "evil.example" })).status, 403, "a page elsewhere can't read it through a renamed host");
  assert.equal((await get(port, "/", { host: `127.0.0.1:${port}` })).status, 200);
  assert.equal((await get(port, "/", { method: "POST" })).status, 405);
  assert.equal((await get(port, "/nope")).status, 404);
});

test("without T3 or a producer it still serves the files, and says what is missing", async () => {
  const home = folder();
  const { port } = await start(["--home", home]);
  const page = await get(port, "/board");
  assert.match(page.body, /Specs unavailable: no file yet/);
  assert.match(page.body, /T3 threads off/);
  assert.match(page.body, /running unknown/);
});

test("a failing t3 shows as unavailable with its own words, never as zero threads", async () => {
  const home = folder();
  const { port } = await start(["--home", home, "--t3", fakeT3, "--t3-project", "/work/site"], { FAKE_T3_FAIL: "1" });
  const page = await until(() => get(port, "/board"), (r) => /T3 threads unavailable: No running/.test(r.body));
  assert.doesNotMatch(page.body, /Needs you 0/);
});

test("a failed producer run shows on the page, with the producer's reason", async () => {
  const home = folder();
  const { port } = await start(["--home", home, "--repo", "example/site", "--producer", fakeProducer], { FAKE_PRODUCER_FAIL: "1" });
  const page = await until(() => get(port, "/board"), (r) => /producer failed/.test(r.body));
  assert.match(page.body, /The specs producer failed: kept the last file: the scan needs more than 59 requests/);
  assert.match(page.body, /Specs unavailable: no file yet/);
});

test("--once prints a still page for T3's html_render, and --json the board", async () => {
  const home = folder();
  const run = (args: string[]) => new Promise<string>((resolve, reject) =>
    execFile(process.execPath, [server, "--home", home, "--repo", "example/site", "--producer", fakeProducer, "--t3", fakeT3, "--t3-project", "demo", ...args],
      (error, stdout) => (error ? reject(error) : resolve(stdout))));
  const html = await run(["--once"]);
  assert.match(html, /^<!doctype html>/);
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /The reader/);
  const board = JSON.parse(await run(["--json"]));
  assert.equal(board.t3.status, "ready");
});

test("running it again while a board runs leaves that board be; a port held by something else is an error", async () => {
  const home = folder();
  const { port } = await start(["--home", home]);
  const again = (p: number) => new Promise<{ code: number | null; out: string; err: string }>((resolve) =>
    execFile(process.execPath, [server, "--home", home, "--port", String(p)], (error, out, err) =>
      resolve({ code: error ? (typeof error.code === "number" ? error.code : 1) : 0, out, err })));
  const second = await again(port);
  assert.equal(second.code, 0);
  assert.match(second.out, new RegExp(`already running on http://localhost:${port}`));
  assert.equal((await get(port, "/board")).status, 200, "the first board still answers");

  const other = createServer((_, res) => res.end("not a board"));
  await new Promise<void>((resolve) => other.listen(0, "127.0.0.1", resolve));
  const busy = (other.address() as { port: number }).port;
  const third = await again(busy);
  other.close();
  assert.equal(third.code, 1);
  assert.match(third.err, /EADDRINUSE/);
});

test("flags: --home is required, values are checked, producer flags pass through", () => {
  assert.throws(() => parseArgs([]), /--home is required/);
  assert.throws(() => parseArgs(["--home", "/x", "--every", "0"]), /--every needs a whole number/);
  assert.throws(() => parseArgs(["--home", "/x", "--repo"]), /--repo needs a value/);
  assert.throws(() => parseArgs(["--home", "/x", "--token", "abc"]), /unknown flag --token/);
  const o = parseArgs(["--home", "/x", "--gh", "/opt/gh", "--run-map", "example/site#5", "--t3-project", "a", "--t3-project", "b"]);
  assert.deepEqual(o.producerArgs, ["--gh", "/opt/gh", "--run-map", "example/site#5"]);
  assert.deepEqual(o.t3Projects, ["a", "b"]);
  assert.equal(o.port, 4317);
});

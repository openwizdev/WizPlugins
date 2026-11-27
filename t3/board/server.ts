#!/usr/bin/env node
// WizBar for T3 Code: serves the board on this machine (127.0.0.1 only), for
// T3's built-in browser panel. It reads the files WizBar's specs producer
// writes, optionally runs that producer on a timer, and optionally reads T3's
// threads through the host's own `t3 thread list --json`. Read-only: it never
// writes to GitHub or to T3. Node 24, standard library only.
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBoard, pickSpecs, readAgents, readT3, type Board, type FileRead, type Read, type T3Thread } from "./board.ts";
import { renderBoard, renderPage } from "./render.ts";

export interface Options {
  home: string; port: number; repos: string[]; every: number; producer: string; producerArgs: string[];
  t3: string; t3Projects: string[]; t3Every: number; refresh: number; once: "html" | "json" | null;
}

const usage = `usage: node t3/board/server.ts --home <factory home> [--repo owner/name ...] [--every <minutes>]
  [--gh <path>] [--author <login> ...] [--run-map 'owner/name#<comment id>']
  [--t3-project <path or id> ...] [--t3 <path to t3>] [--t3-every <seconds>]
  [--port <n>] [--refresh <seconds>] [--once | --json]`;

export function parseArgs(argv: readonly string[]): Options {
  const o: Options = {
    home: "", port: 4317, repos: [], every: 10, producer: fileURLToPath(new URL("../../wizbar/tools/specs-producer/producer.ts", import.meta.url)),
    producerArgs: [], t3: "t3", t3Projects: [], t3Every: 60, refresh: 15, once: null,
  };
  const number = (flag: string, value: string | undefined, min: number) => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < min) throw new Error(`${flag} needs a whole number of at least ${min}`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]!;
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`${flag} needs a value`);
      return v;
    };
    switch (flag) {
      case "--home": o.home = resolve(value()); break;
      case "--repo": o.repos.push(value()); break;
      case "--every": o.every = number(flag, argv[++i], 1); break;
      case "--producer": o.producer = resolve(value()); break;
      case "--gh": case "--author": case "--run-map": o.producerArgs.push(flag, value()); break;
      case "--t3": o.t3 = value(); break;
      case "--t3-project": o.t3Projects.push(value()); break;
      case "--t3-every": o.t3Every = number(flag, argv[++i], 10); break;
      case "--port": o.port = number(flag, argv[++i], 0); break;
      case "--refresh": o.refresh = number(flag, argv[++i], 0); break;
      case "--once": o.once = "html"; break;
      case "--json": o.once = "json"; break;
      default: throw new Error(`unknown flag ${flag}`);
    }
  }
  if (!o.home) throw new Error("--home is required: the factory home the specs producer writes under");
  return o;
}

async function fileRead(path: string): Promise<FileRead> {
  try {
    return { kind: "content", text: await readFile(path, "utf8") };
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? { kind: "missing" } : { kind: "unreadable" };
  }
}

/** One line, at most 200 characters, for the page. */
const oneLine = (text: string) => (text.trim().split("\n").find((l) => l.trim()) ?? "").trim().slice(0, 200);

function run(file: string, args: readonly string[], timeoutMs: number): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((done) => {
    execFile(file, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, encoding: "utf8" }, (error, stdout, stderr) =>
      done({ ok: !error, stdout: String(stdout), stderr: String(stderr) || (error ? error.message : "") }));
  });
}

/** The parts that change over time; the HTTP handler only reads them. */
export class BoardState {
  readonly options: Options;
  private t3State: Read<T3Thread[]> | "off";
  private timers: NodeJS.Timeout[] = [];
  private producing = false;
  private readingT3 = false;
  lastProducer: { ok: boolean; line: string; at: number } | null = null;

  constructor(options: Options) {
    this.options = options;
    this.t3State = options.t3Projects.length > 0 ? { status: "unavailable", reason: "not read yet" } : "off";
  }

  /** Read every project's threads once through the host's own `t3` command. */
  async refreshT3(): Promise<void> {
    if (this.options.t3Projects.length === 0 || this.readingT3) return;
    this.readingT3 = true;
    try {
      const texts: string[] = [];
      for (const project of this.options.t3Projects) {
        const result = await run(this.options.t3, ["thread", "list", "--project", project, "--json"], 30_000);
        if (!result.ok) {
          this.t3State = { status: "unavailable", reason: oneLine(result.stderr) || "t3 thread list failed" };
          return;
        }
        texts.push(result.stdout);
      }
      this.t3State = readT3(texts);
    } finally {
      this.readingT3 = false;
    }
  }

  /** Run WizBar's specs producer once; a run never overlaps the last one. */
  async produce(): Promise<void> {
    if (this.options.repos.length === 0 || this.producing) return;
    this.producing = true;
    try {
      const args = [this.options.producer, "--home", this.options.home, ...this.options.repos.flatMap((r) => ["--repo", r]), ...this.options.producerArgs];
      const result = await run(process.execPath, args, 5 * 60_000);
      this.lastProducer = { ok: result.ok, line: oneLine(result.ok ? result.stdout : result.stderr || result.stdout), at: Date.now() };
      process.stderr.write(`producer: ${this.lastProducer.ok ? "" : "failed: "}${this.lastProducer.line}\n`);
    } finally {
      this.producing = false;
    }
  }

  /** The last producer run's failure, for the page; null when it worked or never ran. */
  note(): string | null {
    return this.lastProducer && !this.lastProducer.ok ? `The specs producer failed: ${this.lastProducer.line}` : null;
  }

  async board(now = Date.now()): Promise<Board> {
    const dir = join(this.options.home, ".openwiz");
    const [v2, v1, agents] = await Promise.all(["specs.v2.json", "specs.v1.json", "agents.v1.json"].map((f) => fileRead(join(dir, f))));
    return buildBoard({ specs: pickSpecs(v2!, v1!, now), agents: readAgents(agents!, now), t3: this.t3State, now });
  }

  start(): void {
    void this.produce();
    void this.refreshT3();
    this.timers.push(setInterval(() => void this.produce(), this.options.every * 60_000));
    if (this.options.t3Projects.length > 0) this.timers.push(setInterval(() => void this.refreshT3(), this.options.t3Every * 1000));
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }
}

/** Only this machine's own names: a page elsewhere can't reach the board by pointing a name at 127.0.0.1. */
const localHost = /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i;

export function serve(state: BoardState): Server {
  return createServer(async (request, response) => {
    const send = (status: number, type: string, body: string, extra: Record<string, string> = {}) => {
      response.writeHead(status, { "content-type": `${type}; charset=utf-8`, "cache-control": "no-store", "x-content-type-options": "nosniff", ...extra });
      response.end(body);
    };
    if (!localHost.test(request.headers.host ?? "")) return send(403, "text/plain", "WizBar answers only on 127.0.0.1 or localhost.\n");
    if (request.method !== "GET") return send(405, "text/plain", "GET only.\n", { allow: "GET" });
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    try {
      if (path === "/") {
        const nonce = randomBytes(16).toString("base64");
        const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'`;
        return send(200, "text/html", renderPage(await state.board(), { refreshSeconds: state.options.refresh, nonce, note: state.note() }), { "content-security-policy": csp });
      }
      if (path === "/board") return send(200, "text/html", renderBoard(await state.board(), state.note()));
      if (path === "/board.json") return send(200, "application/json", `${JSON.stringify({ ...(await state.board()), producer: state.lastProducer }, null, 2)}\n`);
      return send(404, "text/plain", "Not found.\n");
    } catch {
      return send(500, "text/plain", "The board could not be read.\n");
    }
  });
}

/** True when a WizBar board already answers on this port. */
async function isBoard(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/board.json`, { signal: AbortSignal.timeout(3000) });
    const body = (await response.json()) as Record<string, unknown>;
    return response.ok && typeof body.specs === "object" && "t3" in body;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  let options: Options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n${usage}\n`);
    process.exit(2);
  }
  const state = new BoardState(options);
  if (options.once) {
    await state.produce();
    await state.refreshT3();
    const board = await state.board();
    process.stdout.write(options.once === "json" ? `${JSON.stringify(board, null, 2)}\n` : renderPage(board, { refreshSeconds: 0, note: state.note() }));
    return;
  }
  const server = serve(state);
  server.on("error", async (error) => {
    // Running the T3 action again while the board runs just opens it again: that board answers, so this one leaves it be.
    if ((error as NodeJS.ErrnoException).code === "EADDRINUSE" && await isBoard(options.port)) {
      process.stdout.write(`WizBar board already running on http://localhost:${options.port}\n`);
      process.exit(0);
    }
    process.stderr.write(`WizBar board: ${(error as Error).message}\n`);
    process.exit(1);
  });
  server.listen(options.port, "127.0.0.1", () => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : options.port;
    process.stdout.write(`WizBar board on http://localhost:${port}\n`);
    state.start();
  });
  const quit = () => { state.stop(); server.close(); process.exit(0); };
  process.on("SIGINT", quit);
  process.on("SIGTERM", quit);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();

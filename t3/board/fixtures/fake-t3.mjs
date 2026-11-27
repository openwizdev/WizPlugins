#!/usr/bin/env node
// A stand-in for T3's `t3` command: answers `thread list --project <p> --json`
// with synthetic threads. FAKE_T3_FAIL=1 fails as `t3` does with no server;
// FAKE_T3_LOG names a file that gets each call's arguments, one JSON line each.
import { appendFileSync } from "node:fs";
import { syntheticThreads } from "./synthetic.ts";

const args = process.argv.slice(2);
if (process.env.FAKE_T3_LOG) appendFileSync(process.env.FAKE_T3_LOG, `${JSON.stringify(args)}\n`);
if (process.env.FAKE_T3_FAIL === "1") {
  process.stderr.write("No running T3 Code server uses /home/synthetic/.t3. Start T3 Code, then retry.\n");
  process.exit(1);
}
const [group, command, flag, , json] = args;
if (group !== "thread" || command !== "list" || flag !== "--project" || json !== "--json") {
  process.stderr.write(`fake t3: unexpected arguments ${JSON.stringify(args)}\n`);
  process.exit(2);
}
process.stdout.write(`${JSON.stringify(syntheticThreads(Date.now()), null, 2)}\n`);

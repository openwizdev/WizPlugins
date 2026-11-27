// A stand-in for WizBar's specs producer: writes the synthetic home and prints
// a run line, as the producer does. FAKE_PRODUCER_LOG gets its arguments;
// FAKE_PRODUCER_FAIL=1 fails the way the producer does, naming the reason.
import { appendFileSync } from "node:fs";
import { writeHome } from "./synthetic.ts";

const args = process.argv.slice(2);
if (process.env.FAKE_PRODUCER_LOG) appendFileSync(process.env.FAKE_PRODUCER_LOG, `${JSON.stringify(args)}\n`);
const home = args[args.indexOf("--home") + 1];
if (!home) process.exit(2);
if (process.env.FAKE_PRODUCER_FAIL === "1") {
  process.stderr.write("kept the last file: the scan needs more than 59 requests (59 requests)\n");
  process.exit(1);
}
writeHome(home);
process.stdout.write(`wrote ${home}/.openwiz/specs.v2.json and ${home}/.openwiz/specs.v1.json: 3 specs, 5 of 59 specs requests (0 unchanged) · 3 of 20 agents requests (0 unchanged) · wrote agents.v1.json: 3 live agents\n`);

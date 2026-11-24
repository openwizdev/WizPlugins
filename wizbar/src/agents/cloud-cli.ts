import type { PluginCliRegistration } from "@get-bb/plugin-sdk";
import type { CloudAgents } from "./cloud";

const usage = "agents [--json]";

export function withAgentsCommand(cli: PluginCliRegistration, read: (signal?: AbortSignal) => Promise<CloudAgents>): PluginCliRegistration {
  return {
    ...cli,
    commands: [...(cli.commands ?? []), { name: "agents", summary: "list agents seen on GitHub without a sidebar thread", usage }],
    async run(argv, ctx) {
      if (argv[0] !== "agents") return cli.run(argv, ctx);
      const json = argv.includes("--json");
      if (argv.length > (json ? 2 : 1)) {
        return {
          exitCode: 2,
          ...(json ? { stdout: JSON.stringify({ error: { code: "usage", message: usage } }) + "\n" } : { stderr: usage + "\n" }),
        };
      }
      const result = await read(ctx.signal);
      if (json) return { exitCode: 0, stdout: JSON.stringify(result) + "\n" };
      if (result.status === "unavailable") return { exitCode: 0, stdout: "GitHub agent data is unavailable.\n" };
      const lines = result.rows.map(({ label, detail, pull }) => `${label} · ${detail}${pull ? ` · ${pull}` : ""}`);
      if (result.more.length) lines.push(`${result.more.length} more in the run map with no recent note`, ...result.more.map(({ label }) => label));
      return { exitCode: 0, stdout: (lines.length ? lines.join("\n") : "No cloud agents.") + "\n" };
    },
  };
}

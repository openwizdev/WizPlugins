import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const executable = fileURLToPath(new URL("./fake-gh.mjs", import.meta.url));
const readArgs = ["api", "repos/synthetic-owner/feed/issues", "--jq", ".[].title"];
const readResponse = { args: readArgs, stdout: "Synthetic issue\n", stderr: "", status: 0 };

function setup(t, responses) {
  const directory = mkdtempSync(join(tmpdir(), "fake-gh-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const table = join(directory, "responses.json");
  const log = join(directory, "invocations.jsonl");
  const fallthroughLog = join(directory, "fallthrough.log");
  writeFileSync(table, JSON.stringify(responses));
  symlinkSync(process.execPath, join(directory, "node"));
  writeFileSync(join(directory, "gh"), '#!/bin/sh\nprintf "called\\n" > "$FALLTHROUGH_LOG"\n', { mode: 0o700 });

  return {
    run(args, overrides = {}) {
      const result = spawnSync(executable, args, {
        encoding: "utf8",
        env: {
          PATH: directory,
          FAKE_GH_RESPONSES: table,
          FAKE_GH_LOG: log,
          FALLTHROUGH_LOG: fallthroughLog,
          ...overrides,
        },
      });
      assert.ifError(result.error);
      assert.equal(result.signal, null);
      return { status: result.status, stdout: result.stdout, stderr: result.stderr };
    },
    invocations() {
      return readFileSync(log, "utf8").trimEnd().split("\n").map((line) => JSON.parse(line));
    },
    fallthroughLog,
    directory,
  };
}

test("a configured read returns its output and each repeated call adds a log entry", (t) => {
  const fake = setup(t, [readResponse]);
  const expected = { status: 0, stdout: "Synthetic issue\n", stderr: "" };
  assert.deepEqual(fake.run(readArgs), expected);
  assert.deepEqual(fake.invocations(), [readArgs]);
  assert.deepEqual(fake.run(readArgs), expected);
  assert.deepEqual(fake.invocations(), [readArgs, readArgs]);
});

test("only an exact argument list is accepted and rejected calls never reach another gh", (t) => {
  const fake = setup(t, [readResponse]);
  const unexpected = [
    ["api", "repos/synthetic-owner/feed/issues", "--jq .[].title"],
    [...readArgs, "--paginate"],
    readArgs.slice(0, -1),
    ["issue", "comment", "12", "--body", "Synthetic comment"],
    ["api", "repos/synthetic-owner/feed/issues", "--method", "POST"],
  ];

  for (const args of unexpected) {
    assert.deepEqual(fake.run(args), { status: 1, stdout: "", stderr: "Unexpected GitHub CLI invocation.\n" });
  }
  assert.deepEqual(fake.invocations(), unexpected);
  assert.equal(existsSync(fake.fallthroughLog), false);
});

test("a configured read failure preserves stdout, stderr and its exit status", (t) => {
  const args = ["pr", "view", "42", "--json", "headRefOid"];
  const fake = setup(t, [{ args, stdout: "partial\r\n", stderr: "Synthetic source unavailable", status: 17 }]);
  assert.deepEqual(fake.run(args), { status: 17, stdout: "partial\r\n", stderr: "Synthetic source unavailable" });
  assert.deepEqual(fake.invocations(), [args]);
});

test("ambiguous and malformed response tables fail closed and still log the invocation", (t) => {
  const invalidTables = [[readResponse, readResponse], [{ ...readResponse, status: "0" }]];
  for (const table of invalidTables) {
    const fake = setup(t, table);
    assert.deepEqual(fake.run(readArgs), { status: 1, stdout: "", stderr: "Invalid GitHub CLI fixture configuration.\n" });
    assert.deepEqual(fake.invocations(), [readArgs]);
  }
});

test("a failed log append stops a configured read from succeeding", (t) => {
  const fake = setup(t, [readResponse]);
  assert.deepEqual(fake.run(readArgs, { FAKE_GH_LOG: fake.directory }), {
    status: 1,
    stdout: "",
    stderr: "Invalid GitHub CLI fixture configuration.\n",
  });
});

#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";

function isResponse(entry) {
  return Array.isArray(entry?.args)
    && entry.args.every((arg) => typeof arg === "string")
    && typeof entry.stdout === "string"
    && typeof entry.stderr === "string"
    && Number.isInteger(entry.status)
    && entry.status >= 0
    && entry.status <= 255;
}

function readResponses(path) {
  const entries = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(entries) || !entries.every(isResponse)) {
    throw new Error("Invalid response table");
  }
  const responses = new Map(entries.map((entry) => [JSON.stringify(entry.args), entry]));
  if (responses.size !== entries.length) {
    throw new Error("Duplicate response arguments");
  }
  return responses;
}

function run(args, { FAKE_GH_RESPONSES, FAKE_GH_LOG }) {
  const invocation = JSON.stringify(args);
  let response;
  try {
    appendFileSync(FAKE_GH_LOG, invocation + "\n");
    response = readResponses(FAKE_GH_RESPONSES).get(invocation);
  } catch {
    process.stderr.write("Invalid GitHub CLI fixture configuration.\n");
    return 1;
  }

  if (!response) {
    process.stderr.write("Unexpected GitHub CLI invocation.\n");
    return 1;
  }

  process.stdout.write(response.stdout);
  process.stderr.write(response.stderr);
  return response.status;
}

process.exitCode = run(process.argv.slice(2), process.env);

// WB4-1 (openwizdev/OpenWiz#1435), S1 and S2: the specs file reader, the spec
// rows and the open-state setting, against the contract's hand-worked
// fixtures (src/fixtures/v4.ts; specs-section.v1.md sections 1 to 5).
import { describe, expect, it } from "vitest";
import {
  v4Matching, v4Matrix, v4Now, v4OpenSetting, v4OpenSettingCases, v4PullRequests, v4SpecRows, v4SpecsFile,
  v4SpecsReadCases, v4Threads, v4TitleCases,
} from "../fixtures/v4";
import { readOpenKeys, withOpen } from "./open-state";
import { readSpecsFile } from "./read";
import { matchSpec, matrixState, parseTitle, sectionRule, specRows } from "./rows";

const running = v4Threads.filter((t) => Object.hasOwn(v4Matching, t.id));

describe("S1: reading the specs file (section 1)", () => {
  // catches: a stale, missing or malformed file read as zero specs, and the 30- and 5-minute edges off by one.
  it.each(v4SpecsReadCases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(readSpecsFile(c.read, c.now)).toEqual(c.expected);
  });
});

describe("S1: spec rows, dots, last hour and needs you (section 2)", () => {
  // catches: dots in file order, a ticket closed exactly an hour ago counted as recent, finished or empty specs shown, the wrong agents.
  it("gives the contract's rows for the fixture file, rows and open setting", () => {
    expect(specRows(v4SpecsFile, v4Threads, readOpenKeys(v4OpenSetting), v4Now)).toEqual(v4SpecRows);
  });

  // catches: hidden specs counted in the rule, or a need-you count that ignores visibility.
  it("writes the section rule from visible rows only", () => {
    expect(sectionRule(v4SpecRows)).toBe("Specs 2 · 2 need you");
    expect(sectionRule({ ...v4SpecRows, needsYou: 0, specs: [v4SpecRows.specs[0]!].map((s) => ({ ...s, needsYou: 0 })) })).toBe("Specs 1");
  });

  // catches: a fresh file with only finished specs shown as unavailable or with rows.
  it("shows Specs 0 and no rows when every spec is hidden", () => {
    const hiddenOnly = { ...v4SpecsFile, specs: v4SpecsFile.specs.slice(2) };
    const result = specRows(hiddenOnly, v4Threads, [], v4Now);
    expect(result.specs).toEqual([]);
    expect(sectionRule(result)).toBe("Specs 0");
  });

  // catches: a close time a moment after now (clock skew) left out of the last hour.
  it("counts a close time just after now in the last hour", () => {
    const skewed = structuredClone(v4SpecsFile);
    skewed.specs[0]!.tickets.find((t) => t.code === "SP-0")!.closedAt = new Date(v4Now + 1000).toISOString();
    const row = specRows(skewed, [], [], v4Now).specs[0]!;
    expect(row.doneLastHour).toBe(2);
    expect(row.dots.filter((d) => d.state === "done-recent").map((d) => d.code)).toEqual(["SP-0", "SP-1"]);
  });
});

describe("S2: which running threads belong to a spec (section 3)", () => {
  // catches: a fleet parent losing to a ticket code, an ambiguous code picked anyway, a waiting row listed as running.
  it.each(running.map((t) => [t.id, t] as const))("%s", (id, row) => {
    expect(matchSpec(v4SpecsFile, row)).toBe(v4Matching[id]);
  });

  // catches: a loose title parse that takes a hyphen, a lower-case code or an empty role.
  it.each(v4TitleCases.map((c) => [c[0], c] as const))("parses %j", (_title, [title, role, code]) => {
    expect(parseTitle(title)).toEqual({ role, code });
  });

  // catches: an agent's matrix taken from a pull request the server never has, or reviewers shown as working.
  it.each(Object.entries(v4Matrix))("matrix for %s, in the app and on the server", (id, expected) => {
    const row = v4Threads.find((t) => t.id === id)!;
    expect({ app: matrixState(row, v4PullRequests[id] ?? null), server: matrixState(row, null) }).toEqual(expected);
  });
});

describe("S2: the open-state setting (section 4)", () => {
  // catches: a malformed value opening something instead of failing closed.
  it.each(v4OpenSettingCases.map((c) => [JSON.stringify(c[0]) ?? "undefined", c] as const))("reads %s", (_raw, [raw, keys]) => {
    expect(readOpenKeys(raw)).toEqual(keys);
  });

  // catches: opening twice adding a key twice, closing dropping other or gone specs' keys.
  it("opens and closes idempotently, keeping keys of specs no longer listed", () => {
    const opened = withOpen(v4OpenSetting, "example/sample-tools#77", true);
    expect(readOpenKeys(opened)).toEqual(["example/sample-plans#501", "example/gone#1", "example/sample-tools#77"]);
    expect(withOpen(opened, "example/sample-tools#77", true)).toBe(opened);
    const closed = withOpen(opened, "example/sample-plans#501", false);
    expect(readOpenKeys(closed)).toEqual(["example/gone#1", "example/sample-tools#77"]);
    expect(withOpen(closed, "example/sample-plans#501", false)).toBe(closed);
    expect(readOpenKeys(withOpen("not json", "example/sample-tools#77", true))).toEqual(["example/sample-tools#77"]);
  });
});

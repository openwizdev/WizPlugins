import { expect, it, vi } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import plugin from "./server";
import { readCollapsedSections, readSectionsOrder } from "./sections";
import { readThreadsFilter, readThreadsSort } from "./settings";

it("reloads every 0.6 setting and writes canonical section keys only when edited", async () => {
  const stored = {
    footerCountEnabled: false, machineIconsEnabled: false, childrenChipEnabled: true, parentChipEnabled: false,
    wizdeckFactories: "[]", wizdeckGithubToken: "synthetic-token-not-real",
    specsOpen: '["example/sample#21"]', specsSort: "closest",
    sectionsCollapsed: '["unread","specs"]', sectionsOrder: '["unread","pinned","specs"]',
  };
  let read = async (): Promise<Record<string, unknown>> => ({});
  const factory = (bb: BbPluginApi) => {
    const define = vi.spyOn(bb.settings, "define");
    plugin(bb);
    const handles = define.mock.results.map(({ value }) => value as { get(): Promise<Record<string, unknown>> });
    read = async () => Object.assign({}, ...await Promise.all(handles.map((handle) => handle.get())));
  };
  const host = createFakePluginHost({ pluginId: "wizbar" });
  factory(host.bb);
  await host.harness.behavior.setSettings(stored);
  const reload = await host.harness.lifecycle.reload(factory);
  try {
    const values = await read();
    expect(values).toEqual({ ...stored, threadsSort: "newest", threadsFilter: "{}" });
    expect(readCollapsedSections(values.sectionsCollapsed)).toEqual(["yours", "specs"]);
    expect(readSectionsOrder(values.sectionsOrder)).toEqual(["yours", "pinned", "specs"]);
    expect((await reload.harness.behavior.runCli(["section", "specs", "--expand"])).exitCode).toBe(0);
    expect(await read()).toEqual({ ...values, sectionsCollapsed: '["yours"]' });

    await reload.harness.behavior.setSettings({
      threadsSort: "activity", threadsFilter: '{"status":"idle","harness":"codex"}',
    });
    const reopened = await reload.harness.lifecycle.reload(factory);
    try {
      const saved = await read();
      expect(readThreadsSort(saved.threadsSort)).toBe("activity");
      expect(readThreadsFilter(saved.threadsFilter)).toEqual({ status: "idle", harness: "codex" });
    } finally {
      await reopened.harness.lifecycle.dispose();
    }
  } finally {
    await reload.harness.lifecycle.dispose();
    await host.harness.lifecycle.dispose();
  }
});

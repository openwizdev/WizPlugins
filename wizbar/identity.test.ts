// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { loadPluginApp } from "@get-bb/plugin-sdk/testing/app";
import manifest from "./package.json";

const app = await loadPluginApp(() => import("./app"));

describe("WizBar identity", () => {
  it("declares its own package identity, source and display branding", () => {
    expect(manifest.name).toBe("bb-plugin-wizbar");
    expect(manifest.bb.name).toBe("WizBar");
    expect(manifest.bb.branding.icon).toBe("Zap");
    expect(manifest.repository).toEqual({
      type: "git",
      url: "git+https://github.com/openwizdev/WizPlugins.git",
      directory: "wizbar",
    });
  });

  it("registers the WizBar sidebar while retaining the two header chips", () => {
    expect(app.threadLists.map(({ id, title }) => ({ id, title }))).toEqual([
      { id: "inbox", title: "WizBar" },
    ]);
    expect(app.threadHeaderActions.map(({ id }) => id)).toEqual([
      "parent",
      "children",
    ]);
  });
});

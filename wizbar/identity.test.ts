// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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

  it("keeps package metadata and WizBar README licence links aligned with the root Apache-2.0 licence", () => {
    const lockfile = JSON.parse(
      readFileSync(resolve(import.meta.dirname, "./package-lock.json"), "utf8"),
    ) as { packages: Record<string, { license?: string }> };
    const rootLicense = readFileSync(resolve(import.meta.dirname, "../LICENSE"), "utf8");
    const readme = readFileSync(resolve(import.meta.dirname, "./README.md"), "utf8");

    expect(rootLicense).toContain("Apache License");
    expect(manifest.license).toBe("Apache-2.0 AND MIT");
    expect(lockfile.packages[""]?.license).toBe("Apache-2.0 AND MIT");

    expect(readme).not.toContain("Sawyer Hood's original notice at the repository root");
    for (const relPath of [
      "../LICENSE",
      "../NOTICE",
      "LICENSE",
      "../THIRD_PARTY_LICENSES/LICENSE-MIT-sawyer-hood",
      "../THIRD_PARTY_LICENSES/LICENSE-MIT-michael-yong",
    ]) {
      expect(readme).toContain(`(${relPath})`);
      expect(existsSync(resolve(import.meta.dirname, relPath))).toBe(true);
    }
  });
});

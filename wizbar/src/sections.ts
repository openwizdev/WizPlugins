// S1 (#169): the collapsible Pinned, Inbox and Specs sections
// (sidebar-v3.v1.md section 9). One plugin setting, `sectionsCollapsed`, a JSON
// list of collapsed section keys; every section starts expanded and anything
// malformed collapses nothing (fail open, so no thread is hidden by a bad value).
// This file stays free of React: the server imports it for `wizbar section`.
import type { PluginCliRegistration, PluginCliResult } from "@get-bb/plugin-sdk";

export const sectionKeys = ["pinned", "inbox", "specs"] as const;
export type SectionKey = (typeof sectionKeys)[number];

/** The collapsed keys a raw `sectionsCollapsed` value names; anything malformed names none. */
export function readCollapsedKeys(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  return Array.isArray(value) && value.every((key) => typeof key === "string") ? value : [];
}

/**
 * The `sectionsCollapsed` value after collapsing or expanding one section.
 * Collapsing adds the key once, expanding removes it, and keys this version
 * does not know are kept.
 */
export function withCollapsed(raw: unknown, key: SectionKey, collapsed: boolean): string {
  const keys = readCollapsedKeys(raw);
  if (collapsed) return JSON.stringify(keys.includes(key) ? keys : [...keys, key]);
  return JSON.stringify(keys.filter((entry) => entry !== key));
}

/** The settings handle `bb.settings.define(sectionsSettingDescriptors)` returns. */
export interface SectionsSettingHandle {
  get(): Promise<{ sectionsCollapsed?: unknown }>;
  experimental_set(values: { sectionsCollapsed?: string | null }): Promise<{ sectionsCollapsed?: unknown }>;
}

const sectionUsage = "section <pinned|inbox|specs> --collapse|--expand [--json]";

/**
 * `wizbar section <pinned|inbox|specs> --collapse|--expand [--json]`, the
 * agent-first route to a header click: the same read-modify-write of
 * `sectionsCollapsed`, one at a time, never writing from a failed read.
 */
export function withSectionCommand(cli: PluginCliRegistration, settings: SectionsSettingHandle): PluginCliRegistration {
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(task, task);
    queue = next.catch(() => undefined);
    return next;
  };
  return {
    ...cli,
    commands: [...(cli.commands ?? []), { name: "section", summary: "collapse or expand a sidebar section", usage: sectionUsage }],
    async run(argv, ctx) {
      if (argv[0] !== "section") return cli.run(argv, ctx);
      const args = argv.slice(1);
      const json = (args.indexOf("--") === -1 ? args : args.slice(0, args.indexOf("--"))).includes("--json");
      const fail = (exitCode: number, code: string, message: string): PluginCliResult => ({
        exitCode, ...(json ? { stdout: JSON.stringify({ error: { code, message } }) + "\n" } : { stderr: `${message}\n` }),
      });
      // Same parser rules as the other commands: `--` before literal arguments.
      const end = args.indexOf("--");
      const options = end === -1 ? args : args.slice(0, end);
      const flags = options.filter((arg) => arg.startsWith("--"));
      const positional = [...options.filter((arg) => !arg.startsWith("--")), ...(end === -1 ? [] : args.slice(end + 1))];
      const key = positional[0];
      const ok = positional.length === 1 && (sectionKeys as readonly string[]).includes(key!)
        && new Set(flags).size === flags.length && flags.every((flag) => ["--json", "--collapse", "--expand"].includes(flag))
        && flags.includes("--collapse") !== flags.includes("--expand");
      if (!ok) return fail(2, "usage", sectionUsage);
      const section = key as SectionKey;
      const collapsed = flags.includes("--collapse");
      const written = await serial(async (): Promise<{ stored: unknown } | string> => {
        let raw: unknown;
        try {
          raw = (await settings.get()).sectionsCollapsed;
        } catch {
          // Never write from a list that could not be read: that would expand every other section.
          return "The settings read failed.";
        }
        try {
          return { stored: (await settings.experimental_set({ sectionsCollapsed: withCollapsed(raw, section, collapsed) })).sectionsCollapsed };
        } catch {
          return "The settings write failed.";
        }
      });
      if (typeof written === "string") return fail(1, "settings_failed", written);
      const result = { section, collapsed: readCollapsedKeys(written.stored).includes(section) };
      return { exitCode: 0, stdout: (json ? JSON.stringify(result) : `${section}: ${result.collapsed ? "collapsed" : "expanded"}`) + "\n" };
    },
  };
}

// ---- 0.6 (C0, #182): sidebar-v3.v1.md section 10 ------------------------------
// RED STUBS: 0.5 behaviour, replaced in the next commit.
export const sidebarSections = ["pinned", "specs", "unread"] as const;
export type SidebarSection = (typeof sidebarSections)[number];
export function readCollapsedSections(raw: unknown): string[] {
  return readCollapsedKeys(raw);
}
export function withSectionCollapsed(raw: unknown, key: SidebarSection, collapsed: boolean): string {
  return withCollapsed(raw, key as SectionKey, collapsed);
}
export function readSectionsOrder(_raw: unknown): SidebarSection[] {
  return [...sidebarSections];
}
export function withSectionMoved(_raw: unknown, _key: SidebarSection, _to: number): string {
  return JSON.stringify(sidebarSections);
}

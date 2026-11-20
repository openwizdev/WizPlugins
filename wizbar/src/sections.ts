// S1 (#169): the collapsible Pinned, Inbox and Specs sections. Stub for the red run.
export const sectionKeys = ["pinned", "inbox", "specs"] as const;
export type SectionKey = (typeof sectionKeys)[number];
export function readCollapsedKeys(_raw: unknown): string[] { return []; }
export function withCollapsed(raw: unknown, _key: SectionKey, _collapsed: boolean): string { return typeof raw === "string" ? raw : "[]"; }

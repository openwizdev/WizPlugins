// WZ19 (#43): the children list. Stub before the red run.
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { CardModelsResultV3, ChildrenResultV3 } from "./v3-types";

export function childrenList(
  _rows: readonly PluginSidebarThread[], _parentThreadId: string, _models?: CardModelsResultV3,
): ChildrenResultV3 | null {
  throw new Error("not implemented");
}

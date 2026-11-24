import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { AgentsRead } from "./read";

export function mappedThreadIds(read: AgentsRead): string[] {
  return read.status === "ready" ? [...new Set(read.runMap?.flatMap(({ threadId }) => threadId ? [threadId] : []))] : [];
}

/** The sidebar loads active rows by default. Check mapped IDs directly for archived rows. */
export async function archivedAgentIds(bb: BbPluginApi, ids: readonly string[]): Promise<string[]> {
  const archived: string[] = [];
  for (let index = 0; index < ids.length; index += 8) {
    const batch = await Promise.all(ids.slice(index, index + 8).map(async (threadId) => {
      try {
        const row = await bb.sdk.threads.get({ threadId });
        return row?.archivedAt != null && row.deletedAt == null ? threadId : null;
      } catch {
        return null;
      }
    }));
    archived.push(...batch.filter((id) => id !== null));
  }
  return archived;
}

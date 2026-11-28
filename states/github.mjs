export function parseFleetSettings() {
  return { ok: false, reason: "Unimplemented fleet settings parser." };
}

export function createBudgetedReader() {
  return {
    budget: () => ({ limit: 1, used: 0 }),
    get: async () => ({ ok: false, source: "issues", reason: "Unimplemented GitHub reader." }),
    pages: async () => ({ ok: false, source: "issues", reason: "Unimplemented GitHub reader." }),
  };
}

export async function readGitHubState() {
  throw new Error("Unimplemented GitHub state reader");
}

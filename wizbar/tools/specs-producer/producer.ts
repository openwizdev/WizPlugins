// Stub: the producer is built in the next commit.
export interface GitHubResponse { status: number; etag: string | null; next: string | null; body: unknown }
export type GitHubRequest = (path: string, etag: string | null) => Promise<GitHubResponse>;
export type RunResult = { ok: true; calls: number; specs: number } | { ok: false; calls: number; error: string };
export function shortNameOf(_title: string, _number: number): string { return ""; }
export function ticketCodeOf(_title: string): string | null { return null; }
export async function runOnce(_options: { home: string; repositories: readonly string[]; request: GitHubRequest; now?: () => Date }): Promise<RunResult> {
  return { ok: false, calls: 0, error: "not built" };
}

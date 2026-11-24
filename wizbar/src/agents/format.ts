export const agentsRelativePath = ".openwiz/agents.v1.json";
export const agentLeaseMs = 30 * 60_000;
export const agentKinds = ["builder", "reviewer", "fleet"] as const;
export const liveStates = ["working", "asking"] as const;

export const repositoryPattern = /^[A-Za-z0-9][A-Za-z0-9-]*\/(?!\.{1,2}$)[A-Za-z0-9._-]+$/;
export const pullPattern = /^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9-]*\/(?!\.{1,2}\/)[A-Za-z0-9._-]+)\/pull\/([1-9][0-9]*)$/;

// The public field restrictions from the agent status contract v1.
const privateText = [
  /(?<![A-Za-z0-9])thr_/i,
  /(?<![A-Za-z0-9])(?:proj|prj|mch|usr|acct|auto|cr)_[A-Za-z0-9]/i,
  /(?<![\w.:/~\-])(?:~\/|\/(?:Users|home|root|tmp|var|private|mnt|Volumes|opt|srv|code)(?:\/|\b))/i,
  /(?<![\w.:/~@%$}\\-])\/[\w.~+-]+\/[\w.~+-]/,
  /(?<![A-Za-z0-9])[A-Za-z]:\\|\\\\[\w.$-]+\\|\bfile:/i,
  /\$\{?HOME\b|%(?:USERPROFILE|HOMEPATH|HOMEDRIVE|APPDATA|LOCALAPPDATA)%/i,
  /\b(?:[a-z_]*token|[a-z_]*key|secret|password|passwd|pwd|sig|signature|auth|credentials?)\s*=/i,
  /\b(?:password|passwd|secret|token)\s*:\s*\S|\bbearer\s+\S/i,
  /\bgh[pousr]_[A-Za-z0-9]{8,}|\bgithub_pat_|\bAKIA[0-9A-Z]{16}\b|\bxox[abprs]-|\bsk-[A-Za-z0-9_-]{16,}/,
];

export function publicText(value: string, max: number): boolean {
  return value.length > 0 && [...value].length <= max
    && !/[\x00-\x1f\x7f"“”]/.test(value) && !value.startsWith(">")
    && !privateText.some((pattern) => pattern.test(value));
}

export interface GitHubAgent {
  repository: string;
  ticket: string;
  agent: typeof agentKinds[number];
  state: typeof liveStates[number];
  harness: string;
  model: string;
  step: string;
  time: string;
  pr?: string;
  updatedAt: string;
  commentId: number;
}

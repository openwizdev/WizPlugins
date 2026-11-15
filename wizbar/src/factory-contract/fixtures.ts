// Synthetic C1 fixtures. Every id, title, host and path is invented.
import type { FactoryBindingV1, SteerRequestV1 } from "./types";

export const fxNow = Date.parse("2026-11-15T12:00:00Z");

export const fxBinding: FactoryBindingV1 = {
  projectKey: "sample-factory",
  cloudroomProjectId: "prj_c1_sample",
  repositories: ["example-org/sample-app"],
  home: { hostId: "host_c1_sample", rootPath: "/synthetic/home" },
  orchestratorThreadId: "thr_c1_orchestrator",
};

const item = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  code: id.toUpperCase().replace(/[^A-Z0-9]/g, ""),
  question: `Sample question ${id}?`,
  options: [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }],
  recommendedOptionId: "yes",
  sourceUrl: `https://example.com/sample/${id}`,
  spec: "example-org/sample-app#7",
  risk: "ordinary",
  fingerprint: `fp-${id}-1`,
  createdAt: "2026-11-15T11:00:00Z",
  updatedAt: "2026-11-15T11:30:00Z",
  ...overrides,
});

/** A fresh, complete queue with two open decisions, as the orchestrator writes it. */
export const fxQueue = {
  schema: "openwiz.needs-you.v1",
  project: "sample-factory",
  revision: 4,
  updatedAt: "2026-11-15T11:55:00Z",
  expiresAt: "2026-11-15T12:30:00Z",
  complete: true,
  gaps: [],
  items: [
    item("n1"),
    item("n2", { risk: "release", recommendedOptionId: null, requestId: "req-sample-2", requestFingerprint: "rfp-sample-2" }),
  ],
};

export const fxQueueText = JSON.stringify(fxQueue);
export const fxQueueWith = (overrides: Record<string, unknown>) => JSON.stringify({ ...fxQueue, ...overrides });

export const fxAnswer: SteerRequestV1 = {
  requestId: "op-c1-sample-1",
  kind: "answer",
  projectKey: "sample-factory",
  orchestratorThreadId: "thr_c1_orchestrator",
  text: "Answer N1: Yes",
  answer: { itemId: "n1", optionId: "yes", fingerprint: "fp-n1-1", queueRevision: 4 },
};

const minutes = (n: number) => fxNow - n * 60_000;
const latest = { kind: "latest", segmentLimit: 20, returnedSegmentCount: 1, hasOlderRows: false, olderCursor: null };
const base = (id: string, at: number) =>
  ({ id, threadId: "thr_c1_builder", turnId: "turn_c1", sourceSeqStart: 1, sourceSeqEnd: 2, startedAt: at, createdAt: at });

/** A pending turn whose one command started 90 minutes ago and is still pending. */
export const fxTimelineLongTool = {
  timelinePage: latest,
  rows: [{
    ...base("row_turn", minutes(95)), kind: "turn", status: "pending", summaryCount: 0, completedAt: null,
    children: [{ ...base("row_cmd", minutes(90)), kind: "work", workKind: "command", status: "pending", completedAt: null }],
  }],
};

/** Running, but every row finished 3 hours ago: the row times are host record times. */
export const fxTimelineInactive = {
  timelinePage: latest,
  rows: [{
    ...base("row_turn", minutes(200)), kind: "turn", status: "pending", summaryCount: 0, completedAt: null,
    children: [{ ...base("row_cmd", minutes(190)), kind: "work", workKind: "command", status: "completed", completedAt: minutes(180) }],
  }],
};

export const fxTimelineOlderPage = { ...fxTimelineInactive, timelinePage: { ...latest, kind: "older" } };

export const fxStatusBody = [
  "<!-- openwiz:spec-status:v1 -->",
  "Now: Building the sample home (example-org/sample-app#8).",
  "Next: Review the sample board.",
  "When: 2026-11-16 17:00 UTC",
  "Updated: 2026-11-15T11:00:00Z",
].join("\n");

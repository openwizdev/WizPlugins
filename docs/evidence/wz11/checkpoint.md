# WZ11 checkpoint — awaiting ticket answers

Branch: `wz11-settings`, based on `origin/main` at
`0e1cecc81e9e3e9f739d99c6a970e39fcd668290`.

- Existing branch/PR check before the first write: none for WZ11/#25.
- No AGENTS.md or CLAUDE.md exists in this repository. Read docs/agents settings.
- Settings/status contract committed before controls; generated target committed
  and posted on #25 before visible implementation. Target inspected: both views,
  exact labels/status/version and no clipping; it is not a host screenshot.
- Rendered settings red proof: 8 failures for absent registration, committed at
  `5014854`. Backend red proof: 3 failures for absent declarations/unknown keys,
  first committed at `0cf459a`, corrected registration-inspection API at `e724b15`.
  Later refinement observes the real factory's settings handle rather than
  re-declaring settings in the test. No server fix has been made.
- Pure consumer red proof: 3 failing cases at `08df5e6`; same 5 boundary cases
  pass after the implementation at `29f65d3`.
- npm ci passed with the unchanged lockfile; npm run typecheck passed. The app
  and backend proofs intentionally remain red. The full plugin suite and real
  browser screenshots await authorized completion, not a claimed handback.
- No helper, new dependency, live host action, install, release or publication.
- Owned paths only; no shared source file changed yet. Both MIT notices intact.

Pending on #25: a narrow server.ts settings import/define grant and recorded
new-screen target approval. The SDK requires backend settings declarations;
manifest-only persistence is not a supported substitute. Keep needs-info and
ready-for-agent together. No ready PR or PR-monitor loop exists yet.

Resume: read the answers and current policy blobs; remove needs-info only when
both questions are resolved. Implement the registered page and visibility guards,
then source-status publication rendered proofs, real browser captures at both
widths, scoped checks and full plugin suite. Open one ready WZ11 PR only when
all local proofs pass, then create the requested single five-minute monitor.

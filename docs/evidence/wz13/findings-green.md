# PR #35 findings: green proof

Red commit: `158ae7fe7d4d02190519e7a78e2a0061147ac89d` (before production edits).
Scope: R1/R2 exact ThreadInbox grants on #29; MachineIcon source reports; R3 wording.

- `npm ci`: passed using the unchanged lockfile.
- `npm run typecheck`: passed.
- Affected registered-app tests: 102 passed in 2 files.
- Full plugin suite: 393 passed in 14 files (below).
- `git diff --check`: passed.

R1: Muted Cloud/Local/unknown with icons enabled/disabled retains navigation,
shortcut attributes and Unmute calls. R2: ready → loading/error → ready on the
same mounted sidebar, both visibility values, unavailable with no rows, and
unverified after source unmount. Status comes from the source consumer rather
than row lifetime. R3: only ambiguous startup data is described as unmarked.
Synthetic fixture proof only; build, host screenshots and N5-live remain for #9.
No dependencies, lifecycle, settings implementation or classifier rules changed.

```text

> bb-plugin-wizbar@0.1.0 test
> vitest run --config vitest.config.ts --maxWorkers=2


 RUN  v4.1.10 wizbar


 Test Files  14 passed (14)
      Tests  393 passed (393)
   Start at  07:14:42
   Duration  13.51s (transform 612ms, setup 0ms, import 5.00s, tests 11.79s, environment 6.04s)

```

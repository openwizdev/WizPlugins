# Scoped local check receipt

- `npm ci`: passed, 474 existing locked packages installed; package/lockfile unchanged.
- `npm run typecheck`: passed after the final source change.
- `npm test -- --maxWorkers=2`: 253 tests passed in 10 files; see `final-tests.log`.
- Counting proof: 18 passed; rendered footer proof: 8 passed (both included in full suite).
- `npm run build`: attempted, exit 2, `Unknown command plugin`; existing desktop
  build gate retained, as reported on #6. No supported alternative was substituted.
- `git diff --check`: passed. Existing registrations outside the permitted artwork
  section, both MIT notices and attribution were checked unchanged against main.
- Browser: actual React artwork with synthetic inputs, zero/positive/blank pairs
  and a real pointer-hover pair. All tabs closed after capture.

No dependency, live host, plugin installation or publication change is included.
There is no release version inferred from the ticket's absent milestone.

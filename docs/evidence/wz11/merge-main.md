# Main merge after the mute ticket

The conflict at WZ11 head `684d528` was caused by the mute ticket's updated
lifecycle import in server.ts. Main `29f1045` is merged with both the new mute
imports and the approved WZ11 settings import and declaration. Relative to main,
server.ts has exactly those two added settings lines. The shared contract includes
the separate Settings and Explicit mute sections.

Typecheck passes. The settings, backend and mute scoped run passes all 50 tests
in three files. The complete plugin suite passes all 326 tests in 13 files,
recorded in merge-main-suite.log. This merge uses the existing lockfile and
installed dependencies. The original failing-first receipts remain in history.

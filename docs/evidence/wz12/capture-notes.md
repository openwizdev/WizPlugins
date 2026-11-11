# Capture attempts

Synthetic pages only. Real screenshots of the React component through the SDK
rendered-app harness; they do not recreate or prove a real host action wrapper.

- `positive`, `zero`, `unavailable`, `disabled`: screenshot.py pair captures.
- First `hover` capture failed readiness: the fixture tested tooltip presence
  before React focus settled. A partial phone PNG remains but no completed manifest/pair; not screenshot proof.
- Hover fixture corrected to dispatch the hover input inside awaited React act;
  a new `hover-v2` directory is used, preserving the failed attempt separately.
- Earlier reconnect test initially hit an ESM spy limitation, rather than its
  intended behavioral failure. `reconnect-red.log` is retained as that harness
  failure; `reconnect-red-corrected.log` contains the actual stale-cache red run.

Standalone browser tooling preparation initially lacked browser-harness/Chromium
and Chrome runtime libraries. Those were resolved outside the public checkout.
No project dependency, SDK declaration or host/plugin state was changed.

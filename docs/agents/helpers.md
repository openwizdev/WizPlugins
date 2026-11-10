# Helper source guide

This guide records what a helper can establish from the copied plugin and the published `@get-bb/plugin-sdk` 0.4.4 declarations. It grants no installation, live application access, publishing or dependency permission. Agent settings remain in [fleet.md](fleet.md).

## Read and report

A source check should name the relative file, exported symbol or declaration, the observed result, and its limit. Keep examples synthetic. Distinguish a fixture result from host behavior; do not turn a missing field into an invented interface. Independent review remains separate from a builder's own checks.

| Slice | Source to read | What it can establish |
| --- | --- | --- |
| Attribution | Root `LICENSE`, `wizbar/LICENSE`, root README and the pinned upstream source | Notice bytes and existing credit; no live product claim |
| Identity | `wizbar/package.json`, `wizbar/app.tsx` | Package metadata and registered sidebar/header slots |
| Parking | `wizbar/src/lifecycle.ts`, `useLifecycle.ts`, `server.ts` | Pure shelf rules, live-work inputs, stored rows and RPC results |
| Frontend proof | `@get-bb/plugin-sdk/testing/app`, existing rendered tests | Validated registrations and fixture UI behavior; no host layout, persistence or multi-plugin arbitration |
| Backend proof | `@get-bb/plugin-sdk/testing`, `server.ts` | Fake-host RPC/storage behavior when optional test peers are available; no live authentication or cross-plugin arbitration |
| Build | SDK package README and package scripts | The published SDK documents a legacy command; a supported build boundary is Unverified under issue #3's ruling |

Declarations are in the installed SDK's `bundled-types/bb-plugin-sdk.d.ts`, `bb-plugin-sdk-app.d.ts`, `bb-plugin-sdk-testing.d.ts` and `bb-plugin-sdk-testing-app.d.ts`. Read those instead of vendoring unpublished declarations. The SDK README describes the fake's fidelity limits. Its backend fake imports the optional `cron-parser` peer, which this copied plugin does not declare; do not add it without dependency approval.

## Checks and limits

From `wizbar/`, the copied package supplies `npm run typecheck` and `npm test`. Install the existing lockfile with `npm ci`; bound Vitest workers when running locally. The source baseline has 80 tests in five files. The identity proof is additional. No supported plugin build command is verified, and the legacy executable must not be run under the ticket's ruling.

Source and published types do not establish the helper launcher, archive procedure, no-push accounting or review authority. Those are Unverified by this guide and must come from the separately applicable workflow and ticket authorization. They also cannot establish Cloud/Local classification, globally complete counting inputs, or live co-installation. Record such gaps; do not infer them from names or fixture success.

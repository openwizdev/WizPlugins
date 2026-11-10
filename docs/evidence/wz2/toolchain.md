# Toolchain boundary

Issue #3's 07:29Z ruling and subsequent path ruling retain the copied, published SDK version: `@get-bb/plugin-sdk` **0.4.4**, exactly pinned in both package and lockfile. Registry metadata confirms publication. No SDK fallback, dependency addition or lock graph change was needed.

Local tools observed: Node **24.22.1**, npm **11.19.1**, TypeScript through the existing `tsc --noEmit` script, Vitest **4.1.10**. These are the actual check tools, not newly imposed engine requirements.

The published SDK README says its app facade is replaced by the host's implementation during the legacy plugin build. It documents no supported `room-cli` replacement for this pinned package. Under the explicit issue ruling, the copied legacy `build` script was **not run**, and no synthetic build command or success receipt was substituted. Supported plugin build and emitted ID/artifact metadata are **Unverified**. The ready PR relies on typecheck and the tests, with this gap explicit for #7 and later live acceptance.

`npm ci` uses the existing lockfile. The complete upstream test suite stays at 80 unchanged tests; the new identity proof adds two. No live application, plugin install, activation, command operation or publication is part of these checks.

Reproduce the executable proof from `wizbar/`:

```sh
npm ci
npm run typecheck
npm test -- --maxWorkers=2
```

To inspect the synthetic browser evidence locally using the already installed transitive Vite tool, serve the repository root with `./wizbar/node_modules/.bin/vite --host 127.0.0.1 --port 8643` and visit `/docs/evidence/wz2/preview.html`. This is an evidence fixture, not the plugin build or a live application. Its package metadata and SDK registrations come from the plugin files, and its empty-list UI is rendered through the SDK test harness. The surrounding cards/styles and lightning outline are illustrative; the live host's presentation is Unverified. Stop the fixture server when finished.

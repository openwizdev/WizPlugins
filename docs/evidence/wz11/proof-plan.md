# N1 proof plan

Baseline has no settings registration, switches or visibility guards. Existing
rendered tests cover rows/footer but never a settings write, so always-visible
features and a fabricated live status could pass them.

1. Registered-app test expects one settings section, actual manifest version,
   both named switches and separate unavailable/unverified source states. Red:
   no settings section. Covers registration and version/status acceptance.
2. Stateful SDK boundary fixture persists only submitted keys, then unmounts and
   reopens with saved host values. Toggle both directions and inspect the real
   MachineIcon and FooterCounterArtwork under the same host snapshot. Red:
   absent section/guards. Fixtures prove consumer consistency, not PC storage.
3. A deferred/rejected settings write must preserve prior visibility, focus and
   accessible error feedback; all controls stay mounted during the write.
4. Real source-status publication lifecycle: explicit live report, error update,
   disabled source, unknown/default and cleanup. A toggle must never create live.
5. Pure descriptor/settings/source boundary cases cover exact booleans,
   defaults, conservative status aggregation and cleanup without a fabricated zero.
6. After the backend path grant, use the SDK fake with the actual server factory
   to prove descriptor enforcement and reload persistence. No production database.
7. Real browser renders at 390 and 1440 CSS px compare with the generated target;
   synthetic content only. Inspect both, check wrapping/contrast and native focus.
8. Run npm ci; scoped proofs; typecheck; complete plugin suite at handback.

Target approval and the backend settings-declaration line grant are pending on
#25; do not edit visible controls or server.ts until answered. No helper used.

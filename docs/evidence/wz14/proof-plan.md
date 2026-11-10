# N2 proof plan

Base: `0e1cecc81e9e3e9f739d99c6a970e39fcd668290`. No pre-existing #26 branch or pull request was found before the fresh branch was created. No project AGENTS.md/CLAUDE.md exists in this base; docs/agents supplies the policy. Build-ticket skill source was checked against ClosedWiz main by blob identity; no private source text is copied.

| Claim | Owning observable proof | Plausible missed regression |
| --- | --- | --- |
| Explicit persistent mute and undo share command/RPC/store | SDK fake-host CLI/RPC plus SQLite reload | Existing command tests know only the five ordinary operations |
| Mixed IDs retain isolated results and existing syntax | Extend registered command cases | Adding mute could bypass per-ID guard or swallow later IDs |
| Ordinary work/attention, restarts and refreshes stay muted | Pure shelf table; persisted row read in new plugin load; rendered shelf | Existing rules always wake on working |
| Pending, failure, newly finished attention break through | Pure table, registered event/CLI proof and rendered cases | Timestamp-only wake or status-only eligibility hides attention |
| Pinned, unavailable, already-attention inputs never mute | Server-boundary negative table with unchanged store/publications | UI-only guard could be bypassed by raw RPC |
| Manual undo/deletion wins pending validation | Deferred SDK-read races through real registration | A stale read can reinsert mute after undo |
| Footer working semantics stay independent | Existing count/isWorking tests plus muted running fixture classification | Changing working to implement hiding would lower the count |
| Muted shelf remains usable | Rendered app and synthetic browser screenshots at both widths | A stored flag without navigation/undo is not usable |

Every behavior proof is run before its fix. Evidence is synthetic. Browser target is illustrative; screenshots render the actual registered app against synthetic inputs. Live keeper commands, event delivery, persistence on the host and live Inbox/count acceptance remain Unverified for #9. The missing host mapping question is recorded on #26. No helper or live action is used.

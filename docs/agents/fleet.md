# Fleet settings

Every fleet in this repository starts from these settings. The fleet skills read this file instead of naming any project's agents, commands or rules. Each value names its source; when a source changes, run the `setup` skill again (or edit the line by hand) so the two agree. Keep the machine-read table headings, columns and agent rows unchanged.

Before your first commit in this repository, set Git’s `user.email` to your GitHub `users.noreply.github.com` address; verify that both author and committer emails use that domain for every outgoing commit.

## Builder

One per ticket. It builds its ticket on its own branch, and never reviews or merges.

| Setting | Value | `room-cli thread spawn` flag |
| --- | --- | --- |
| Harness | Codex | `--provider codex` |
| Model | Sol 6.1 | `--model gpt-6.1-sol` |
| Effort | High | `--reasoning-level high` |

Source: Jake, 2026-11-10 (CX1): while Claude is unavailable, every new builder uses Codex Sol 6.1, High ([private record](https://github.com/jparker2006/ClosedWiz/issues/325#issuecomment-6759733342)). No Claude thread starts until Jake restores it. Codex uses the default service tier, with no fast mode.

## Builder for small tickets

Tickets with an exact `polish`, `huntr` or `proposal` label use this table; every other ticket uses `## Builder`.

| Setting | Value | `room-cli thread spawn` flag |
| --- | --- | --- |
| Harness | Codex | `--provider codex` |
| Model | Sol 6.1 | `--model gpt-6.1-sol` |
| Effort | High | `--reasoning-level high` |

Source: Jake, 2026-11-10 (CX1): the same Codex Sol 6.1, High builder applies to every new ticket while Claude is unavailable ([private record](https://github.com/jparker2006/ClosedWiz/issues/325#issuecomment-6759733342)).

## Reviewer for Claude-built

One per pull request, in a fresh thread that never built or helped build it. It reviews the exact head and never edits. While Claude is unavailable, the temporary Codex assignment below applies; every other review and merge safeguard remains in force.

| Setting | Value | `room-cli thread spawn` flag |
| --- | --- | --- |
| Harness | Codex | `--provider codex` |
| Model | Sol 6.1 | `--model gpt-6.1-sol` |
| Effort | XHigh | `--reasoning-level xhigh` |

Source: Jake, 2026-11-10 (CX1): new reviews use Codex Sol 6.1, XHigh, independently on the exact head while Claude is unavailable ([private record](https://github.com/jparker2006/ClosedWiz/issues/325#issuecomment-6759733342)).

## Reviewer for GPT-built

Use the verified builder's provider, from its branch-matching `start checked` record and that exact thread's provider read. Unknown or conflicting family waits. New GPT-built reviews use a fresh Codex thread that never built or helped build the pull request. A review stopped by Claude's usage limit restarts on Codex with its branch and records preserved.

| Setting | Value | `room-cli thread spawn` flag |
| --- | --- | --- |
| Harness | Codex | `--provider codex` |
| Model | Sol 6.1 | `--model gpt-6.1-sol` |
| Effort | XHigh | `--reasoning-level xhigh` |

Source: Jake, 2026-11-10 (CX1): while Claude is unavailable, reviews do not wait for Claude; fresh Codex Sol 6.1, XHigh reviewers review the exact head, and GPT-built pull requests receive `gpt-reviewed` for a later Claude re-check ([private record](https://github.com/jparker2006/ClosedWiz/issues/325#issuecomment-6759733342)). All other review rules and the M1 base rule below stay unchanged.

## Builder helpers

Cheap helpers a builder starts for searches and chores; the builder keeps every judgment and writes every line.

| Setting | Value | `room-cli thread spawn` flag |
| --- | --- | --- |
| Harness | Codex | `--provider codex` |
| Model | Terra 6.1 | `--model gpt-6.1-terra` |
| Effort | High | `--reasoning-level high` |

Source: Jake, 2026-11-10 (CX1): builder helpers use Codex Terra 6.1, High ([private record](https://github.com/jparker2006/ClosedWiz/issues/325#issuecomment-6759733342)).

## Reviewer helpers

Helpers a reviewer starts to check one part each; the reviewer keeps every judgment and posts the one report.

| Setting | Value | `room-cli thread spawn` flag |
| --- | --- | --- |
| Harness | Codex | `--provider codex` |
| Model | Terra 6.1 | `--model gpt-6.1-terra` |
| Effort | High | `--reasoning-level high` |

Source: Jake, 2026-11-10 (CX1): new helpers use Codex Terra 6.1, High while Claude is unavailable ([private record](https://github.com/jparker2006/ClosedWiz/issues/325#issuecomment-6759733342)). The reviewer keeps the judgment and remains independent of the build.

## Labels

The triage labels and their names here are in `triage-labels.md`. A fleet adds one label of its own:

| Label | Means | Put on by | Taken off by |
| --- | --- | --- | --- |
| `held` | The ticket is held: it waits for the user's approval of a changed plan or contract, and never starts while it has this label. It has no ready label while held | `plan-graph`, before it changes an approved plan; `launch-fleet`, when a merge changes a contract the ticket relies on | `plan-graph`, as it puts the ready label back once the new approval is recorded; `launch-fleet`'s `release` line, if it is still on after that |

The skill that holds a ticket first creates the label, once, with the description "Held: waits for the user's approval".

Source: the fleet skills, `plan-graph` and `launch-fleet`, which put it on and take it off. It is the same in every project.

## Test commands

The plugin's own scripts, as upstream defines them in [`wizbar/package.json`](../../wizbar/package.json) (`build`, `test`, `typecheck`). Upstream names no Node version and has no lockfile-install script; the plugin folder has its own `package-lock.json`. A builder runs the red/green proof and the commands its change can affect, then opens the ready pull request.

| # | Folder | Command | CI check |
| --- | --- | --- | --- |
| 1 | `wizbar` | `npm ci` | none yet |
| 2 | `wizbar` | `npm run typecheck` | none yet |
| 3 | `wizbar` | `npm test` | none yet |
| 4 | `wizbar` | `npm run build` | none yet |

The unchanged upstream plugin files are copied into `wizbar/`; the commands above run from that folder. WZ2 retains identity, SDK and contract preparation. Its copied build script still names the legacy executable: do not run it until WZ2 establishes the supported `room-cli` build boundary. Command 1 is npm's standard install from the folder's lockfile; commands 2 to 4 are upstream's scripts.

Source: [`wizbar/package.json`](../../wizbar/package.json) scripts, and `.github/workflows/` (none upstream).

## CI checks

| Check | Runs | Required on |
| --- | --- | --- |
| none | Upstream has no CI workflow, and this repository has no ruleset or branch protection yet | none |

The spec asks for CI that runs the typecheck, the test suite and the plugin build. Until a ticket adds that workflow and a ruleset requires its check on `main`, no pull request has a required check. Run `setup` again when the workflow or the ruleset changes.

Source: `.github/workflows/` (absent), `gh api 'repos/openwizdev/wizplugins/rulesets'` (none) and the default branch's protection (none), read 2026-11-10.

## Standing merge rules

| Pull request | Review | Merged by, and when |
| --- | --- | --- |
| A ticket in an approved plan graph, once a ruleset requires CI checks on `main` | The reviewer above, on its exact head | The loop, as soon as the reviewer's APPROVE names that exact commit and every required CI check is green on it, it has no conflict with `main`, and `main` has moved since that CI run only by merges that were themselves green. Then the merge is read back |
| A ticket in an approved plan graph, while no CI check is required on `main` | The reviewer above, on its exact head | The loop, as soon as the reviewer's APPROVE names that exact commit and the pull request has no conflict with `main`. Then the merge is read back. This ends when a ruleset requires a CI check on `main`: from then on the row above applies. Jake, 2026-11-10 (WM1): until the CI ticket lands, exact-head review approval alone permits a ticket merge ([private record](https://github.com/jparker2006/ClosedWiz/issues/325#issuecomment-6760290221)) |
| Any other pull request while no CI check is required on `main` | None for docs-only changes by the orchestrator; otherwise the reviewer above | The orchestrator for docs-only changes; otherwise Jake only |
| Anything to a release, and every release or publication | None by rule | Jake only |

- **How a merge is done:** `gh pr merge <N> -R openwizdev/wizplugins --merge --match-head-commit <approved head>`, then read back: only `merged`, at the approved head, is a verified merge.
- **A pull request is never retargeted.** Pull requests are only ever opened against `openwizdev/wizplugins`, never against the upstream repository or the previous fork. Nothing is ever force-pushed.

Source: the WizBar spec, confirmed by Jake on 2026-11-10: tickets, reviews, CI and merges follow the normal Wiz rules ([private record](https://github.com/jparker2006/ClosedWiz/issues/325#issuecomment-6759599541)); Jake, 2026-10-30: plans authorize ticket merges after exact-head review and green CI, and the loop performs the merge; Jake, 2026-11-01: the base rule without a merge queue ([private record](https://github.com/jparker2006/ClosedWiz/issues/1275#issuecomment-6704671951)). The second row is the setup default for a rule whose CI precondition does not exist yet.

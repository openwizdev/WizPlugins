# Specs producer

Writes two files under your factory home, the files WizBar's Specs section reads: `.openwiz/specs.v2.json` (schema `openwiz.specs.v2`, v1 plus the later state, #162) and `.openwiz/specs.v1.json` (schema `openwiz.specs.v1`, exactly as before #162, a later ticket written as `needs-you`). A WizBar from #162 on reads both, uses the one that is ready if only one is, and picks the newer `generatedAt` when both are ready (v2 on a tie, #164 R3); an older WizBar reads v1. So the producer and WizBar can be updated in either order. Both files come from the same scan and are written together or not at all (#164 R1) ([contract section 1](../../contracts/specs-section.v1.md#1-the-specs-file)). It reads GitHub through your local `gh` login (REST only) and needs nothing else: Node 24 and `gh`, no packages.

Each run is one complete scan. For each repository it reads the open issues (an issue with sub-issues is a running spec) and the open pull requests, then each spec's sub-issues (its tickets). Each page is a conditional request with the ETag and the page kept in `.openwiz/specs.v1.etags.json` (a cache from an older producer is dropped once, so the first run after an update reads every page afresh), so an unchanged page costs nothing against GitHub's rate limit: GitHub answers it `304 Not Modified`, which still counts as one of the specs scan's 59 requests. The file is written whole (temp file, then rename) with `generatedAt` the run's time, or not at all: any failed read, or a scan that would need more than 59 requests, writes nothing, keeps the last file and exits 1 naming the reason. A repository you remove from `--repo` is gone from the file and the cache after the next successful run.

**Capacity.** The specs scan makes at most 59 requests, one per page of 100:

```text
pages(n) = max(1, ⌈n / 100⌉)
requests = sum per repository: pages(open issues and pull requests) + pages(open pull requests)
         + sum per spec:       pages(its sub-issues)
```

With one repository under 100 open issues and pull requests, and specs of up to 100 tickets, that is 2 + one per spec: **57 specs** fit (55 with two repositories). Under the same limits, ten specs in two repositories take 14 requests. A factory that outgrows this fails loudly with `the scan needs more than 59 requests`; it never writes part of a scan.

| Field | From GitHub |
| --- | --- |
| Short name | The spec title after `spec: ` and before the next `: ` (`0.1.0 spec: The kernel: records v1…` → `The kernel`), else the whole title; at most 40 characters |
| Ticket code | The `[A-Z]{1,3}[0-9]+` just before the title's first `:` (`0.1.0 KN3: the driver…` → `KN3`), else none |
| State | Closed → `done` (with `closedAt`); label `ready-for-human` → `needs-you` (due now), or `yours-later` while its sub-issues answer's `issue_dependencies_summary.blocked_by` (open blockers) is over 0, with no extra request; `held` or `needs-info` → `held`; an open pull request whose body closes it (`Closes #N`) → `review`, or `building` while every such pull is a draft; otherwise `not-started`. Closed as not planned: left out |
| `pulls` | The open pull requests in the ticket's own repository whose body closes it, when that repository is bound |
| `updatedAt` | v2 only (#183): the ticket's `updated_at` from the same sub-issues answer, its last activity, with no extra request, kept exactly as GitHub sent it (a fraction of a second included); left out when the answer has none or it is not a real UTC date and time, so the rest of the file still reads (#195). `specs.v1.json` never carries it |

## GitHub agents

After the specs scan, the producer uses a separate 20-request budget to write
`.openwiz/agents.v1.json`. The budget covers author lookups, comment pages and
the optional run map. It reads at most three pages of recently updated
issue comments per repository, newest updates first, from a two-hour window.
The request start rounds down to ten minutes for conditional reads.
The producer caches those ETags separately in
`.openwiz/agents.v1.etags.json`. Repeat `--author <login>` to set record
authors for the run. Without these flags, each repository supplies its record
authors in the GitHub identity table in `docs/agents/fleet.md`. A repository
without a record author contributes no notes. A failed author or notes read,
including a notes scan that runs out of budget, keeps the last agents file. If only the optional run map cannot be
read, the producer still writes the notes with no usable map. Pass every
product repository with `--repo`. Optionally pass `--run-map 'owner/name#comment-id'` to read the run map
through the same `gh` login. A private run map needs the `repo` scope. Its data
stays in the local snapshot. See the
[agents file contract](../../contracts/agents.v1.md).

## Run it once

Use the factory home and repositories of your WizDeck factory binding (the `wizdeckFactories` setting):

```sh
node wizbar/tools/specs-producer/producer.ts --home /path/to/factory-home --repo owner/name
```

The run line reports each scan's usage and result, for example
`49 specs, 59 of 59 specs requests (29 unchanged) · 20 of 20 agents requests (12 unchanged) · wrote agents.v1.json: 5 live agents`.
A 304 response counts toward its scan's budget and does not consume GitHub's
rate limit. `--gh` selects the executable, with `gh` on `PATH` as the default.
WizBar considers a file older than 30 minutes stale, so run the producer on a
timer.

## Run it every 10 minutes (systemd user timer)

Replace the paths and repositories, then:

```sh
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/wizbar-specs.service <<'EOF'
[Unit]
Description=WizBar specs producer

[Service]
Type=oneshot
Environment=PATH=/home/you/.local/bin:/usr/local/bin:/usr/bin
ExecStart=/usr/bin/env node /path/to/WizPlugins/wizbar/tools/specs-producer/producer.ts --home /path/to/factory-home --repo owner/name
EOF
cat > ~/.config/systemd/user/wizbar-specs.timer <<'EOF'
[Unit]
Description=Refresh the WizBar specs file every 10 minutes

[Timer]
OnBootSec=1min
OnUnitActiveSec=10min

[Install]
WantedBy=timers.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now wizbar-specs.timer
```

A user service's `PATH` can differ from your shell's: often it is only `/usr/local/bin:/usr/bin`, so a `gh` in `~/.local/bin` fails with `gh not found`. The example unit sets its own `PATH` in the `Environment=PATH=…` line: put `gh`'s folder first there (find it with `command -v gh` in your shell), or pass `--gh /full/path/to/gh` in `ExecStart` instead.

Check it with `systemctl --user list-timers wizbar-specs.timer` and `journalctl --user -u wizbar-specs.service`. The service runs as you, so it uses your `gh` login; if `node` is not on the service's `PATH`, give its full path in `ExecStart`.

## Remove it

```sh
systemctl --user disable --now wizbar-specs.timer
rm ~/.config/systemd/user/wizbar-specs.service ~/.config/systemd/user/wizbar-specs.timer
systemctl --user daemon-reload
```

Stopping the timer leaves the files in place. WizBar shows "Specs unavailable"
when neither specs file is fresh and readable. To remove the snapshots and
caches, delete `.openwiz/specs.v2.json`, `.openwiz/specs.v1.json`,
`.openwiz/specs.v1.etags.json`, `.openwiz/agents.v1.json` and
`.openwiz/agents.v1.etags.json` from the factory home.

## Tests

`producer.test.ts` runs the producer against recorded synthetic GitHub answers (`fixtures/recorded.ts`) as part of `npm test` in `wizbar/`.

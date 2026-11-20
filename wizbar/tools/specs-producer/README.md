# Specs producer

Writes `.openwiz/specs.v1.json` under your factory home, the file WizBar's Specs section reads ([contract section 1](../../contracts/specs-section.v1.md#1-the-specs-file)). It reads GitHub through your local `gh` login (REST only) and needs nothing else: Node 24 and `gh`, no packages.

For each repository it reads the open issues (an issue with sub-issues is a running spec), each spec's sub-issues (its tickets) and the open pull requests. Each page is a conditional request with the ETag kept in `.openwiz/specs.v1.etags.json`, so an unchanged page costs nothing against your rate limit. A run makes at most 40 requests: ten specs take about 15. A bigger scan resumes on the next run: it reads pages never read first, then those read longest ago, and the pages it did not reach keep their last data, so the file stays fresh. The file is written whole and holds every repository whose scan has finished once (a very large first scan takes a few runs). Repositories never block each other: a failed read stops only its own repository for that run, its specs keep their last data, the others refresh and the file is written; the run then exits 1 and names the failure. A repository you remove from `--repo` is dropped from the file and the cache on the next run. A spec whose sub-issues answer 404 keeps its last data while the repository's issue list is read again from its first page, before anything else; a list longer than one run's budget resumes where the last run stopped. If the spec is gone it leaves the file; if it is still listed the run reports it and the spec keeps its last data. The file's `generatedAt` is the read time of the oldest page whose data is in it, so data that cannot be refreshed makes WizBar call the file stale after 30 minutes.

| Field | From GitHub |
| --- | --- |
| Short name | The spec title after `spec: ` and before the next `: ` (`0.1.0 spec: The kernel: records v1…` → `The kernel`), else the whole title; at most 40 characters |
| Ticket code | The `[A-Z]{1,3}[0-9]+` just before the title's first `:` (`0.1.0 KN3: the driver…` → `KN3`), else none |
| State | Closed → `done` (with `closedAt`); label `ready-for-human` → `needs-you`; `held` or `needs-info` → `held`; an open pull request whose body closes it (`Closes #N`) → `review`, or `building` while every such pull is a draft; otherwise `not-started`. Closed as not planned: left out |
| `pulls` | The open pull requests in the ticket's own repository whose body closes it, when that repository is bound |

## Run it once

Use the factory home and repositories of your WizDeck factory binding (the `wizdeckFactories` setting):

```sh
node wizbar/tools/specs-producer/producer.ts --home /path/to/factory-home --repo owner/name [--repo owner/other]
```

It prints `wrote …/.openwiz/specs.v1.json: N specs, M requests`. WizBar calls a file older than 30 minutes stale, so run it on a timer.

## Run it every 10 minutes (systemd user timer)

Replace the paths and repositories, then:

```sh
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/wizbar-specs.service <<'EOF'
[Unit]
Description=WizBar specs producer

[Service]
Type=oneshot
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

Check it with `systemctl --user list-timers wizbar-specs.timer` and `journalctl --user -u wizbar-specs.service`. The service runs as you, so it uses your `gh` login; if `node` is not on the service's `PATH`, give its full path in `ExecStart`.

## Remove it

```sh
systemctl --user disable --now wizbar-specs.timer
rm ~/.config/systemd/user/wizbar-specs.service ~/.config/systemd/user/wizbar-specs.timer
systemctl --user daemon-reload
```

The last specs file stays until you delete `.openwiz/specs.v1.json` and `.openwiz/specs.v1.etags.json`; WizBar then shows "Specs unavailable".

## Tests

`producer.test.ts` runs the producer against recorded synthetic GitHub answers (`fixtures/recorded.ts`) as part of `npm test` in `wizbar/`.

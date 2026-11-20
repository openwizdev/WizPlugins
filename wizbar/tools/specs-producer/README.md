# Specs producer

Writes `.openwiz/specs.v1.json` under your factory home, the file WizBar's Specs section reads ([contract section 1](../../contracts/specs-section.v1.md#1-the-specs-file)). It reads GitHub through your local `gh` login (REST only) and needs nothing else: Node 24 and `gh`, no packages.

For each repository it reads the open issues (an issue with sub-issues is a running spec), each spec's sub-issues (its tickets) and the open pull requests. Each page is a conditional request with the ETag kept in `.openwiz/specs.v1.etags.json`, so an unchanged page costs nothing against your rate limit. A run with ten specs makes about 15 requests and stops before 60. The file is written whole, only when every read succeeded; a failed run keeps the last file and exits 1.

| Field | From GitHub |
| --- | --- |
| Short name | The spec title after `spec: ` and before the next `: ` (`0.1.0 spec: The kernel: records v1…` → `The kernel`), else the whole title; at most 40 characters |
| Ticket code | The `[A-Z]{1,3}[0-9]+` just before the title's first `:` (`0.1.0 KN3: the driver…` → `KN3`), else none |
| State | Closed → `done` (with `closedAt`); label `ready-for-human` → `needs-you`; `held` or `needs-info` → `held`; an open pull request whose body closes it (`Closes #N`) → `review`, or `building` while every such pull is a draft; otherwise `not-started`. Closed as not planned: left out |
| `pulls` | The open pull requests in the ticket's own repository whose body closes it |

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

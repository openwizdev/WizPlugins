# WizBar

WizBar is a Cloudroom sidebar plugin. It keeps T3 Sidebar's Inbox, Snoozed and
Settled shelves, manual parking and parent/child header chips, and adds batch
lifecycle commands, a persistent Muted shelf and Cloud/Local row markers.
Ordinary settle and snooze refuse working or waiting threads. Unreadable
activity fails closed. Ordinary parked threads return when work or new
attention requires it. The project lives in
[openwizdev/wizplugins](https://github.com/openwizdev/wizplugins).

![WizBar rendered with synthetic example rows](../docs/images/wizbar.png)

The image shows the React UI rendered with synthetic fixture data and styling.
The production footer counter is blank. Current row markers use an observed
`environment.providerId` mapping with unknown data left unmarked. Correct live
Cloud classification remains pending. Settings switches and a real
running-thread footer count are planned in
[#25](https://github.com/openwizdev/wizplugins/issues/25),
[#28](https://github.com/openwizdev/wizplugins/issues/28) and
[#29](https://github.com/openwizdev/wizplugins/issues/29).

## Install and activate — Unverified

Build, installation beside T3 Sidebar, activation and live command execution
remain **Unverified** pending [#9](https://github.com/openwizdev/wizplugins/issues/9).
The desktop CLI's help supplies these preparation commands. Read the
[install and rollback kit](https://github.com/openwizdev/wizplugins/issues/9#issuecomment-6768833446)
and current desktop help before running them.

```sh
git clone https://github.com/openwizdev/wizplugins.git
cd wizplugins/wizbar
npm ci
room-cli plugin build .
room-cli plugin install .
room-cli plugin list
```

Record the current sidebar settings first. Select WizBar in
**Settings → Appearance → Sidebar**, or use
`room-cli settings ui set sidebar.threadListProvider "<wizbar-plugin-id>"`
with its ID from `plugin list`. Change `sidebar.navigationProvider` only if
T3 Sidebar is selected there. Keep T3 Sidebar installed until replacement is
accepted. Follow #9 for disabling it and rollback. WizBar imports no T3 parked
rows. Separate runtime IDs and data still need live verification.

## Commands

The registered namespace is `wizbar`. Each operation accepts one or many IDs.
Use `--` to end options before literal IDs.

```text
wizbar settle <id>... [--json]
wizbar unsettle <id>... [--json]
wizbar snooze <id>... --until <time> [--json]
wizbar unsnooze <id>... [--json]
wizbar mute <id>... [--json]
wizbar unmute <id>... [--json]
wizbar list <id>... [--json]
```

Only `snooze` takes `--until`, which requires a future ISO timestamp with a
timezone or an available sidebar preset from `hour`, `evening`, `tomorrow` and
`next-week`. Results are per ID. Any failed ID produces a nonzero exit status
while other IDs are still processed.
`list` reports the resolved shelf and snooze wake time. Commands and sidebar
share the plugin store and refresh channel. Live dispatch and visible refresh
remain unverified in #9.

Explicit `mute` is the running-thread exception for keeper-selected fleet work.
It requires a verified running, unpinned thread without pending input or failure.
The Muted shelf uses the plugin's persistent store and keeps the selection
through reloads and ordinary working updates. A question, failure or stopped
work with newer unread attention returns the thread to Inbox. `unmute` provides
manual undo. The keeper's live breakthrough mapping and acceptance remain
unverified. See the [mute contract](contracts/mute.v1.md).

## Credit and licence

Derived from Sawyer Hood's T3 Sidebar, copied from `plugins/t3sidebar` at commit
`d3424f24e2cebe91da4e72cb38feb023da808922`. The source tag is
`t3sidebar/v0.1.0` (a different commit from that copied snapshot). WizBar starts
with a fresh history and adds its own changes after the copy.
[Upstream source](https://github.com/SawyerHood/sawyer-plugins/tree/d3424f24e2cebe91da4e72cb38feb023da808922/plugins/t3sidebar).

The MIT licences retain Sawyer Hood's original notice at the repository root
and Michael Yong's original plugin notice in this folder. The root licence adds
the WizBar notice. See the [root LICENSE](../LICENSE), [plugin LICENSE](LICENSE)
and [public privacy and attribution audit](../docs/verification/public-audit.md).

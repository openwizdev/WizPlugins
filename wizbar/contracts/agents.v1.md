# WizBar GitHub agents file v1

The specs producer writes `.openwiz/agents.v1.json` under the bound factory
home. See the [JSON schema](agents.v1.schema.json).

- `version` is the integer `1`. `generatedAt` is the scan's UTC timestamp.
- `agents` contains the latest [v1 status note](https://github.com/openwizdev/WizSkills/blob/a2993f47b8fd3d7853ee45e6c21feea708c70c02/contracts/agent-status.v1.md)
  from a record author for each repository, ticket and agent kind in the
  last two hours. Each entry has `repository` (`owner/name`), `ticket`
  (`owner/name#N`), `agent`, `state`, `harness`, `model`, `step`, `time`,
  optional `pr`, GitHub's `updatedAt`, numeric `commentId` and boolean `live`.
  Older v1 snapshots omit `live` and contain only active notes.
- `live` means the note is `working` or `asking` and its update timestamp is
  less than 30 minutes old. Readers recheck the lease. The file itself is
  unavailable at 30 minutes, when missing, or when its version or contents
  cannot be read.
- `authors: "unknown"` means one or more bound repositories have no record
  authors. Their notes do not count.
- If configured, `runMap` holds the map comment's normalized builder and
  reviewer references. Each has `role`, `repository`, positive integer
  `number`, nullable `threadId`, and nullable `run`. It is `null` when the
  read or parse failed. This is local data. Public outputs and evidence omit
  the IDs.

The producer requests at most three pages of issue comments per repository,
newest updates first. The request start rounds down to a ten-minute boundary.
The agents scan has its own 20-request budget for author lookup, comment
pages and the optional run map. The specs scan has a separate 59-request
budget. Failed note reads or exhausted budget during the notes scan keep the
last agents file. A failed optional map read still publishes the notes.

WizBar reads the file by absolute path through the host's file API. A mapped
agent is seen when its thread ID is known to the desktop, including archives.
Without a map entry, WizBar matches by ticket and kind against visible
sidebar threads. Cloud agents and `wizbar agents` show unseen notes and
separately list map entries that have no recent note. The running card uses
only the live unseen notes.

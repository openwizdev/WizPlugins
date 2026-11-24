# WizBar GitHub agents file v1

The specs producer writes `.openwiz/agents.v1.json` under the bound factory
home. See the [JSON schema](agents.v1.schema.json).

- `version` is the integer `1`. `generatedAt` is the scan's UTC timestamp.
- `agents` contains live [v1 status notes](https://github.com/openwizdev/WizSkills/blob/a2993f47b8fd3d7853ee45e6c21feea708c70c02/contracts/agent-status.v1.md)
  from record authors. Each entry has `repository` (`owner/name`), `ticket`
  (`owner/name#N`), `agent`, `state`, `harness`, `model`, `step`, `time`,
  optional `pr`, GitHub's `updatedAt`, and numeric `commentId`. The oldest
  live claim for each ticket and agent kind wins.
- `authors: "unknown"` means at least one bound repository has no record
  authors. Its notes do not count. An empty `agents` array is a successful
  scan with no qualifying claims in the repositories covered.
- A note counts while its state is `working` or `asking` and GitHub's update
  timestamp is less than 30 minutes old. Readers recheck that lease when
  they display the file. The file itself is unavailable at 30 minutes,
  when missing, or when its version or contents cannot be read.

The producer uses up to three pages of issue comments per repository and
shares the run's request budget after the specs scan. A failed agents read
or exhausted budget keeps the last agents file. WizBar reads the file by
absolute path through the host's file API. The card uses it to list GitHub
claims that do not match a visible running thread by ticket and agent kind.

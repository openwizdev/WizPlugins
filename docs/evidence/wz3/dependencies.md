# WZ3 dependency change

Authorized by WD1 on #4, 2026-11-10: add only `cron-parser` `^5.5.0` as a development dependency for the pinned SDK testing fake.

| Locked package | Version | Role |
| --- | --- | --- |
| `cron-parser` | `5.10.4` | SDK 0.4.4 testing module imports its cron parser unconditionally; satisfies the approved range |
| `luxon` | `3.7.2` | Required transitive dependency of `cron-parser` |

Both new lockfile entries are development-only and MIT-licensed. No other dependency version changes. SDK remains exactly `0.4.4`. The package change is one development-dependency entry; original ordering, metadata and scripts are preserved. No schedule or cron feature is added to WizBar.

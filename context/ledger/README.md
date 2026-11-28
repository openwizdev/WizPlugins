# Context engine item ledger

Pass the `ledger/` directory under the OpenWiz data directory's `context/`
folder. The context store supplies one JSON file per item. The counter requires
owner-only directories (0700) and data files (0600).

```sh
python3 -I context/ledger/ledger.py "$CONTEXT_DIR/ledger"
python3 -I context/ledger/ledger.py "$CONTEXT_DIR/ledger" --json
```

The first command prints the unresolved count as an integer. Use `--json` for
the count and the ID and reason of each unresolved item. For example, the same
synthetic ledger can print `1` or:

```json
{"unresolved_count": 1, "unresolved": [{"id": "item-6", "reason": "expected one closed state"}]}
```

A valid item has exactly one of Done, Ticketed, Decide, Reply or Drop, with
the fields in the [context engine contract][contract]. The closer persists
records through the local store, then runs the counter to validate them and
read the unresolved count. Reply requires boolean `sent_by_engine: false`
for every approval status. A malformed record with no trustworthy ID reports
`null` for that ID.

For Ticketed items the counter uses the owner's signed-in GitHub CLI, via
`gh issue view` and `gh pr view`. A completed issue needs at least one
verified merged closing pull request. Missing links and unreadable GitHub
results keep the item unresolved. Diagnostics contain fixed reasons.

Both commands exit 0 when they produce a count, including a nonzero count.
An unreadable ledger (for example, one with unsafe permissions or invalid
JSON syntax) exits 3 with a diagnostic on stderr and no count. The outcome
proof can use `--json` and distinguish a nonzero count from a read failure.

Run the offline proof with the contract fixtures from a sibling OpenWiz clone:

```sh
python3 -I context/ledger/test_ledger.py ../OpenWiz/contracts/fixtures/context-engine
```

[contract]: https://github.com/openwizdev/OpenWiz/blob/main/contracts/context-engine.v1.md#item-ledger

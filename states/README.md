# States producer (`openwiz.states.v1`)

Reads public GitHub records through the signed-in `gh` CLI (strictly read-only `GET`) with a fixed request budget and atomically writes `.openwiz/states.v1.json` for Tracks, Map, Kanban, agent cards, agent directory and attention views (`contracts/agent-states.v1.md`).

```sh
node states/producer.mjs --home /path/to/home --repo owner/name [--pr-repo owner/other] [--version 0.2.0] [--budget 50] [--feed .openwiz/feed.v1.json] [--gh /path/to/gh]
```

## Snapshot fields

| Field | Meaning |
| --- | --- |
| `schema` | Always `"openwiz.states.v1"`. Readers refuse any other value. |
| `read_at` | UTC RFC 3339 timestamp (`Z`) when the read finished. |
| `budget` | `{ limit, used }` with `0 <= used <= limit`; counts every attempted request, page and failure. |
| `tickets` | Rows `{ number, spec, version, title, blockers, state, problem, pull_request }`. `state` is `waiting`, `ready`, `building`, `ci`, `review`, `fix`, `merged`, or `closed`. `problem` is `{ kind, reason }` (`held`, `blocked`, `failing`, `stale`) or `null`. `pull_request` is `{ repo, number, merged_at }` or `null`. |
| `agents` | Rows `{ name, role, ticket, pull_request, state, since, record }`. `role` is `builder`, `reviewer`, `fixer`, or `fleet`. `state` is `queued`, `building`, `ci`, `review`, `fix`, `merge`, or `done`. `record` is `{ kind, repo, number, id? }` (`id` required for `comment`, `label`, `check`; omitted for `issue`, `pull_request`). |
| `tracks` | One row per readable spec: `{ spec, tickets, agents, needs_owner }`, referencing ticket numbers, agent names and `needs_owner` card IDs. Empty tracks stay present. |
| `unavailable` | Rows `{ kind, ref, source, reason }` for unreadable or budget-exhausted sources. Affected entries are omitted rather than guessed; reasons never expose raw service errors. |

## Synthetic example

```json
{
  "schema": "openwiz.states.v1",
  "read_at": "2030-01-03T13:00:00Z",
  "budget": { "limit": 50, "used": 8 },
  "tickets": [
    {
      "number": 9101,
      "spec": 9001,
      "version": "0.2.0",
      "title": "Synthetic ticket",
      "blockers": [9103],
      "state": "review",
      "problem": null,
      "pull_request": { "repo": "example/forge", "number": 9201, "merged_at": null }
    }
  ],
  "agents": [
    {
      "name": "reviewer-9201-1",
      "role": "reviewer",
      "ticket": 9101,
      "pull_request": { "repo": "example/forge", "number": 9201, "merged_at": null },
      "state": "review",
      "since": "2030-01-03T11:00:00Z",
      "record": { "kind": "comment", "repo": "example/forge", "number": 9201, "id": 1006 }
    }
  ],
  "tracks": [
    { "spec": 9001, "tickets": [9101], "agents": ["reviewer-9201-1"], "needs_owner": ["review:9201"] }
  ],
  "unavailable": []
}
```

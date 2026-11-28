kind: added

The read-only states producer reads GitHub records within a fixed request budget and atomically writes `.openwiz/states.v1.json` for Tracks, Map, Kanban, agent cards and the agent directory, reporting unreadable sources in `unavailable`.

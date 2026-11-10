# Domain docs

Where WizBar keeps its words and its decisions.

## Before exploring, read these

- **`README.md`** of the plugin: what WizBar is, and where it came from.
- **`GLOSSARY.md`** and **`docs/adr/`** at the root, when they exist. There are none yet; carry on without them. The `grill` skill creates them as terms and decisions get settled.
- **Grills** are private: they live in `docs/grills/` in the private records repository (`issue-tracker.md`), never in this repository. Read the grill that fed the spec only when authorized; never copy it here.

## Private storage

Orchestrator handoff and state stay under `private/orchestration/` in the private records checkout. A public source names a decision and a private-comment pointer, never exact replies or thread ids. If a source is not available, report the gap.

## Use the spec's words

Use the words the spec uses (Inbox, Snoozed, Settled, settle, snooze, working, waiting, footer number, Cloud, Local). If something new needs a name, note it for the next grill.

## Flag ADR conflicts

If your output contradicts an ADR, say so plainly instead of quietly overriding it.

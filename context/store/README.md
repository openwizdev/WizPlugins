# Local context store

The store implements the transcript and saved-post records from the
[context engine contract](https://github.com/openwizdev/OpenWiz/blob/main/contracts/context-engine.v1.md).
It runs locally with Python 3.9+ on Linux and macOS.

## Write a connector

Build a dictionary for each message using the contract's transcript fields.
Keep source IDs opaque, use UTC timestamps, preserve source text and provide
attachment IDs only. For sources that provide saved posts, write one
`saved-post` record per post and action. Send the dictionary to the store
before any local persistence. Each connector is off until the owner opts in.

With the WizPlugins root on Python's import path:

```python
from context.store.store import read, write

filename = write({
    "schema": "openwiz.context-engine.v1",
    "kind": "transcript",
    "source": "synthetic-chat",
    "conversation": "conversation-7",
    "message_id": "message-2",
    "author": "Synthetic Reader",
    "time": "2031-01-02T03:04:05Z",
    "text": "First line.\nSecond line.",
    "attachments": [{"id": "attachment-1"}],
})

messages = read("transcript")
saved_posts = read("saved-post")
```

`write(record)` returns the digest filename. It redacts recognized secret
material in `text` and `author` before writing. An identical retry returns
the same filename. A different record with that identity raises `StoreError`
and preserves the previous file. Invalid or unsafe records and locations
also raise `StoreError`.

`read(kind)` returns validated records in digest filename order. An absent
store returns an empty list. An unsafe location or unreadable record raises
`StoreError`. Reads never create directories.

The store uses `context/transcripts/` and `context/saved-posts/` under the
OpenWiz state directory. `OPENWIZ_STATE_DIR` can set an absolute state path.
Otherwise macOS uses `~/Library/Application Support/openwiz` and Linux uses
`$XDG_STATE_HOME/openwiz` or `~/.local/state/openwiz`. All store directories
use mode `0700` and record files use `0600`. Git repositories, including
linked worktrees, are refused.

Run the offline tests from the WizPlugins root with an adjacent OpenWiz
checkout. To use a checkout elsewhere, set `OPENWIZ_CONTEXT_FIXTURES` to
its `contracts/fixtures/context-engine` directory.

```sh
python3 -B -m unittest discover -s context/store
```

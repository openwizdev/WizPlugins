"""Count unresolved context engine items."""

import argparse
from contextlib import contextmanager
from datetime import datetime
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys


SCHEMA = "openwiz.context-engine.v1"
GITHUB_RECORD = r"https://github\.com/[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9_.-]+"
ISSUE_LINK = re.compile(GITHUB_RECORD + r"/issues/[1-9][0-9]*")
PULL_LINK = re.compile(GITHUB_RECORD + r"/pull/[1-9][0-9]*")
HTTPS_LINK = re.compile(r"https://[^/?#\s@]+(?:[/?#][^\s]*)?")
OPAQUE_ID = re.compile(r"[^\x00-\x1f\x7f]+")
V1_SECRET_SHAPE = re.compile(
    r"\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,}|"
    r"xox[baprs]-[A-Za-z0-9-]{20,})(?![A-Za-z0-9_-])"
    r"|\b[Aa]uthorization:[ \t]*[Bb]earer[ \t]+[A-Za-z0-9._~+/-]{20,}=*"
    r"|-----BEGIN ((?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY)-----"
    r"\r?\n[\s\S]*?\r?\n-----END \1-----"
    r"|\b(?:password|passwd|pwd|PASSWORD|PASSWD|PWD)[ \t]*=[ \t]*"
    r"""(?:"(?!\[redacted:password\]")[^"\r\n]+"|'(?!\[redacted:password\]')[^'\r\n]+')"""
)


class DuplicateField(ValueError):
    pass


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise DuplicateField
        result[key] = value
    return result


def invalid_constant(_value):
    raise ValueError("invalid JSON constant")


def read_json(value):
    return json.loads(value, object_pairs_hook=unique_object, parse_constant=invalid_constant)


def text_matches(value, pattern):
    return isinstance(value, str) and pattern.fullmatch(value) and not V1_SECRET_SHAPE.search(value)


def nonempty(value):
    return isinstance(value, str) and re.search(r"\S", value) and not V1_SECRET_SHAPE.search(value)


def valid_proof(proof):
    return isinstance(proof, dict) and (
        (proof.keys() == {"link"} and text_matches(proof["link"], HTTPS_LINK))
        or (proof.keys() == {"record"} and text_matches(proof["record"], OPAQUE_ID))
    )


STATE_FIELDS = {
    "Done": {"proof": valid_proof},
    "Ticketed": {"issue": lambda value: text_matches(value, ISSUE_LINK)},
    "Decide": {"question": nonempty, "recommendation": nonempty},
    "Reply": {
        "draft": nonempty,
        "approval": lambda value: value in ("pending", "approved", "declined"),
        "sent_by_engine": lambda value: value is False,
    },
    "Drop": {"reason": nonempty},
}


def gh_view(kind, url, fields):
    try:
        result = subprocess.run(
            ["gh", kind, "view", url, "--json", ",".join(fields)],
            env={**os.environ, "GH_PROMPT_DISABLED": "1"},
            capture_output=True, check=True, timeout=30,
        )
        data = read_json(result.stdout)
    except (OSError, subprocess.SubprocessError, ValueError, RecursionError):
        return None
    if isinstance(data, dict) and data.keys() == set(fields):
        returned_url = data["url"]
        if isinstance(returned_url, str) and returned_url.lower() == url.lower():
            return data
    return None


def confirms_merge(pull):
    if pull is None or pull["state"] != "MERGED":
        return False
    stamp = pull["mergedAt"]
    if not isinstance(stamp, str) or not re.fullmatch(
        r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z", stamp
    ):
        return False
    try:
        datetime.fromisoformat(stamp[:-1])
    except ValueError:
        return False
    return True


def ticket_reason(url):
    issue = gh_view("issue", url, ("url", "state", "stateReason", "closedByPullRequestsReferences"))
    if issue is None:
        return "GitHub issue unreadable"
    if issue["state"] != "CLOSED" or issue["stateReason"] != "COMPLETED":
        return "GitHub issue is not closed as completed"
    pulls = issue["closedByPullRequestsReferences"]
    if not isinstance(pulls, list):
        return "closing pull request readback invalid"
    if not pulls:
        return "no closing pull request"
    for pull in pulls:
        if not isinstance(pull, dict) or not text_matches(pull.get("url"), PULL_LINK):
            return "closing pull request readback invalid"
    for pull in pulls:
        if confirms_merge(gh_view("pr", pull["url"], ("url", "state", "mergedAt"))):
            return None
    return "closing pull request merge unverified"


def item_reason(item, item_id):
    if not isinstance(item, dict) or item.get("schema") != SCHEMA or item.get("kind") != "ledger-item":
        return "invalid ledger item"
    if item_id is None:
        return "invalid ledger item id"
    state = item.get("state")
    if not isinstance(state, dict):
        return "expected one closed state"
    if item.keys() != {"schema", "kind", "id", "state"}:
        return "extra ledger item fields"
    kind = state.get("kind")
    if not isinstance(kind, str) or kind not in STATE_FIELDS:
        return "unknown closed state"
    fields = STATE_FIELDS[kind]
    if state.keys() - {"kind"} - fields.keys():
        return f"extra {kind} fields"
    for field, valid in fields.items():
        if not valid(state.get(field)):
            if kind == "Reply" and field == "sent_by_engine":
                return "Reply sent_by_engine must be false"
            return f"invalid {kind} {field}"
    return ticket_reason(state["issue"]) if kind == "Ticketed" else None


@contextmanager
def owner_fd(path, mode, dir_fd=None):
    flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
    if mode == 0o700:
        flags |= os.O_DIRECTORY
    fd = os.open(path, flags, dir_fd=dir_fd)
    try:
        info = os.fstat(fd)
        expected_type = stat.S_IFDIR if mode == 0o700 else stat.S_IFREG
        if (info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != mode
                or stat.S_IFMT(info.st_mode) != expected_type):
            raise OSError("invalid ledger permissions or file type")
        yield fd
    finally:
        os.close(fd)


def read_items(directory):
    with owner_fd(directory.parent, 0o700) as context:
        with owner_fd(directory.name, 0o700, context) as ledger:
            for name in sorted(os.listdir(ledger)):
                if not name.endswith(".json"):
                    continue
                with owner_fd(name, 0o600, ledger) as fd:
                    with open(fd, encoding="utf-8", closefd=False) as source:
                        raw = source.read()
                try:
                    item = read_json(raw)
                except DuplicateField:
                    pairs = json.loads(raw, object_pairs_hook=list, parse_constant=invalid_constant)
                    ids = [value for key, value in pairs if key == "id"] if raw.lstrip().startswith("{") else []
                    item_id = ids[0] if len(ids) == 1 and text_matches(ids[0], OPAQUE_ID) else None
                    yield item_id, None, True
                    continue
                item_id = item.get("id") if isinstance(item, dict) else None
                yield item_id if text_matches(item_id, OPAQUE_ID) else None, item, False


def unresolved(items):
    by_id = {}
    pending = []
    for item_id, item, duplicate in items:
        if item_id is None:
            reason = "duplicate JSON field" if duplicate else item_reason(item, None)
            pending.append({"id": None, "reason": reason})
        else:
            by_id.setdefault(item_id, []).append((item, duplicate))
    for item_id, records in by_id.items():
        if len(records) != 1:
            reason = "duplicate ledger item id"
        else:
            item, duplicate = records[0]
            reason = "duplicate JSON field" if duplicate else item_reason(item, item_id)
        if reason is not None:
            pending.append({"id": item_id, "reason": reason})
    return pending


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ledger_dir", type=Path)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    directory = args.ledger_dir.absolute()
    try:
        items = list(read_items(directory))
    except (OSError, ValueError, RecursionError):
        print("Cannot read the local item ledger.", file=sys.stderr)
        return 3
    pending = unresolved(items)
    print(json.dumps({"unresolved_count": len(pending), "unresolved": pending}) if args.json else len(pending))
    return 0


if __name__ == "__main__":
    sys.exit(main())

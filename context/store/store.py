"""Local, owner-only storage for context engine source records."""

from contextlib import contextmanager
from datetime import date
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import stat
import sys
from uuid import uuid4


class StoreError(ValueError):
    """A record or store location could not be used safely."""


SCHEMA = "openwiz.context-engine.v1"
BUCKETS = {
    "transcript": ("transcripts", ("source", "conversation", "message_id")),
    "saved-post": ("saved-posts", ("source", "post_id", "action")),
}

KEY = re.compile(
    r"-----BEGIN ((?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY)-----\r?\n"
    r"[\s\S]*?\r?\n-----END \1-----"
)
PASSWORD = re.compile(
    r"(?a:\b)(?:password|passwd|pwd|PASSWORD|PASSWD|PWD)[ \t]*=[ \t]*"
    r"""(?:"(?!\[redacted:password\]")([^"\r\n]+)"|'(?!\[redacted:password\]')([^'\r\n]+)')"""
)
BEARER = re.compile(r"(?a:\b)[Aa]uthorization:[ \t]*[Bb]earer[ \t]+([A-Za-z0-9._~+/-]{20,}=*)")
TOKEN = re.compile(
    r"(?a:\b)(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,}|"
    r"xox[baprs]-[A-Za-z0-9-]{20,})(?![A-Za-z0-9_-])"
)
TIME = re.compile(
    r"20[0-9]{2}-[0-9]{2}-[0-9]{2}T"
    r"(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]+)?Z"
)
DIR_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW


def _replace_value(match, group, kind):
    start, end = match.span(group)
    return match[0][:start - match.start()] + f"[redacted:{kind}]" + match[0][end - match.start():]


def _redact(text):
    text = KEY.sub("[redacted:key]", text)
    text = PASSWORD.sub(lambda m: _replace_value(m, m.lastindex, "password"), text)
    text = BEARER.sub(lambda m: _replace_value(m, 1, "token"), text)
    return TOKEN.sub("[redacted:token]", text)


def _has_secret(value):
    return any(pattern.search(value) for pattern in (KEY, PASSWORD, BEARER, TOKEN))


def _is_id(value):
    return isinstance(value, str) and re.fullmatch(r"[^\x00-\x1f\x7f]+", value) and not _has_secret(value)


def _validated(record, *, redact=False):
    if not isinstance(record, dict):
        raise StoreError("expected a context record object")
    record = dict(record)
    kind = record.get("kind")
    if not isinstance(kind, str) or kind not in BUCKETS:
        raise StoreError("unknown source record kind")
    _, identity = BUCKETS[kind]
    fields = {"schema", "kind", "author", "time", "text", *identity}
    fields.add("attachments" if kind == "transcript" else "link")
    if record.keys() != fields or record["schema"] != SCHEMA:
        raise StoreError("invalid context record fields or schema")
    for field in fields - {"attachments"}:
        if not isinstance(record[field], str):
            raise StoreError("expected string context record fields")
    for field in ("author", "text"):
        if redact:
            record[field] = _redact(record[field])
        if _has_secret(record[field]):
            raise StoreError("known secret shape in context record")
    if not re.fullmatch(r"[a-z][a-z0-9-]{0,63}", record["source"]):
        raise StoreError("invalid source slug")
    try:
        if not TIME.fullmatch(record["time"]):
            raise ValueError
        date.fromisoformat(record["time"][:10])
    except ValueError:
        raise StoreError("invalid UTC message time") from None
    if not all(_is_id(record[field]) for field in identity):
        raise StoreError("invalid or secret-bearing identity")
    if kind == "transcript":
        refs = record["attachments"]
        if not isinstance(refs, list):
            raise StoreError("expected attachment references")
        refs = [dict(ref) if isinstance(ref, dict) else ref for ref in refs]
        if any(
            not isinstance(ref, dict) or ref.keys() != {"id"} or not _is_id(ref["id"])
            for ref in refs
        ):
            raise StoreError("expected attachment references")
        if len({ref["id"] for ref in refs}) != len(refs):
            raise StoreError("duplicate attachment reference")
        record["attachments"] = refs
    elif (record["action"] not in ("repost", "bookmark", "like")
          or not re.fullmatch(r"https://[^/?#\s@]+(?:[/?#][^\s]*)?", record["link"])
          or _has_secret(record["link"])):
        raise StoreError("invalid saved post action or link")
    return record


def _filename(record):
    _, fields = BUCKETS[record["kind"]]
    identity = json.dumps([record[field] for field in fields], ensure_ascii=False, separators=(",", ":"))
    return sha256(identity.encode("utf-8")).hexdigest() + ".json"


def _state_dir():
    explicit = os.environ.get("OPENWIZ_STATE_DIR")
    if explicit:
        path = Path(explicit)
        if not path.is_absolute():
            raise StoreError("OPENWIZ_STATE_DIR must be absolute")
        return path
    home = Path(os.environ.get("HOME", ""))
    if not home.is_absolute():
        raise StoreError("HOME must be absolute when OPENWIZ_STATE_DIR is unset")
    if sys.platform == "darwin":
        return home / "Library/Application Support/openwiz"
    xdg = Path(os.environ.get("XDG_STATE_HOME", ""))
    return (xdg if xdg.is_absolute() else home / ".local/state") / "openwiz"


def _exists(directory, name):
    try:
        os.stat(name, dir_fd=directory, follow_symlinks=False)
    except FileNotFoundError:
        return False
    return True


def _check_repository(directory, path):
    if _exists(directory, ".git") or all(
        _exists(directory, name) for name in ("HEAD", "objects", "refs")
    ):
        raise StoreError(f"context store is inside a Git repository at {path}")


@contextmanager
def _directory(path, *, create, private_from):
    current = Path(path.anchor)
    fd = os.open(current, DIR_FLAGS)
    try:
        _check_repository(fd, current)
        for part in path.parts[1:]:
            current /= part
            try:
                child = os.open(part, DIR_FLAGS, dir_fd=fd)
            except FileNotFoundError:
                if not create:
                    raise
                try:
                    os.mkdir(part, 0o700, dir_fd=fd)
                except FileExistsError:
                    pass
                child = os.open(part, DIR_FLAGS, dir_fd=fd)
            os.close(fd)
            fd = child
            _check_repository(fd, current)
            info = os.fstat(fd)
            mode = stat.S_IMODE(info.st_mode)
            if current == private_from or private_from in current.parents:
                if info.st_uid != os.geteuid() or mode != 0o700:
                    raise StoreError("context store directories must be owner-only (0700)")
            elif info.st_uid not in (0, os.geteuid()) or (mode & 0o022 and not mode & stat.S_ISVTX):
                raise StoreError("context store path has an untrusted parent directory")
        yield fd
    finally:
        os.close(fd)


@contextmanager
def _bucket(kind, *, create):
    if not isinstance(kind, str) or kind not in BUCKETS:
        raise StoreError("unknown source record kind")
    try:
        root = _state_dir().resolve() / "context"
        path = root / BUCKETS[kind][0]
        resolved = path.resolve()
        if resolved != path:
            try:
                with _directory(resolved, create=False, private_from=root):
                    pass
            except FileNotFoundError:
                pass
            raise StoreError("context store directories must not be symlinks")
        with _directory(path, create=create, private_from=root) as directory:
            yield directory
    except FileNotFoundError:
        raise
    except (OSError, RuntimeError):
        raise StoreError("could not safely access the context store") from None


def _unique_object(pairs):
    result = dict(pairs)
    if len(result) != len(pairs):
        raise StoreError("duplicate JSON keys in stored record")
    return result


def _read_record(directory, name, kind):
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
    with os.fdopen(fd, "rb") as stream:
        info = os.fstat(stream.fileno())
        if (not stat.S_ISREG(info.st_mode)
                or stat.S_IMODE(info.st_mode) != 0o600
                or info.st_uid != os.geteuid()):
            raise StoreError("context store records must be owner-only regular files (0600)")
        try:
            record = _validated(json.load(stream, object_pairs_hook=_unique_object))
            if record["kind"] == kind and _filename(record) == name:
                return record
        except (UnicodeError, json.JSONDecodeError, RecursionError):
            raise StoreError("invalid JSON in stored record") from None
    raise StoreError("stored record does not match its filename or kind")


def _check_retry(directory, name, record):
    if _read_record(directory, name, record["kind"]) != record:
        raise StoreError("different record already stored for this identity")


def write(record):
    """Persist a transcript or saved post and return its digest filename."""
    record = _validated(record, redact=True)
    try:
        name = _filename(record)
        payload = json.dumps(record, ensure_ascii=False).encode("utf-8") + b"\n"
    except UnicodeError:
        raise StoreError("context record is not valid UTF-8 text") from None
    try:
        with _bucket(record["kind"], create=True) as directory:
            try:
                _check_retry(directory, name, record)
                return name
            except FileNotFoundError:
                pass
            pending = f".pending-{uuid4().hex}"
            flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
            fd = os.open(pending, flags, 0o600, dir_fd=directory)
            try:
                with os.fdopen(fd, "wb") as stream:
                    info = os.fstat(stream.fileno())
                    if info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o600:
                        raise StoreError("could not create an owner-only context record")
                    stream.write(payload)
                    stream.flush()
                    os.fsync(stream.fileno())
                try:
                    os.link(pending, name, src_dir_fd=directory, dst_dir_fd=directory)
                except FileExistsError:
                    _check_retry(directory, name, record)
            finally:
                os.unlink(pending, dir_fd=directory)
            os.fsync(directory)
    except FileNotFoundError:
        raise StoreError("context store disappeared during write") from None
    return name


def read(kind):
    """Return persisted records of a single kind in digest filename order."""
    try:
        with _bucket(kind, create=False) as directory:
            try:
                return [_read_record(directory, name, kind)
                        for name in sorted(os.listdir(directory)) if name.endswith(".json")]
            except FileNotFoundError:
                raise StoreError("context record disappeared during read") from None
    except FileNotFoundError:
        return []

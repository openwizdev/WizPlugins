import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import store


FIXTURES = Path(os.environ.get(
    "OPENWIZ_CONTEXT_FIXTURES",
    Path(__file__).resolve().parents[3] / "OpenWiz/contracts/fixtures/context-engine",
))


class StoreTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.state = Path(temp.name) / "state"
        env = patch.dict(os.environ, {"OPENWIZ_STATE_DIR": str(self.state)})
        env.start()
        self.addCleanup(env.stop)
        self.record = json.loads((FIXTURES / "valid.json").read_text())["transcript"]

    def test_contract_redaction_vectors_on_disk(self):
        vectors = json.loads((FIXTURES / "redaction.json").read_text())
        self.assertTrue(vectors, "redaction fixtures are empty")
        for vector in vectors:
            with self.subTest(vector=vector["name"]):
                original = "".join(vector["before"])
                record = dict(self.record, message_id=vector["name"], text=original)
                try:
                    store.write(record)
                except NotImplementedError:
                    pass
                files = list((self.state / "context/transcripts").glob("*.json"))
                saved = next(
                    (row for file in files if (row := json.loads(file.read_bytes()))["message_id"]
                     == vector["name"]), None,
                )
                self.assertIsNotNone(saved, "a redacted record must be persisted")
                self.assertEqual(saved, dict(record, text=vector["after"]))
                self.assertEqual(record["text"], original)

    def test_store_round_trip_is_private_and_offline(self):
        """Catch public modes, socket use, and changes to Unicode or opaque IDs."""
        import sys

        def reject_socket(event, args):
            if guarding and event.startswith("socket."):
                raise AssertionError("the store attempted to use a socket")

        guarding = True
        sys.addaudithook(reject_socket)
        record = dict(self.record, conversation="café/..", message_id='m"\\',
                      text=" Café 🌱\r\n\t  ")
        old_umask = os.umask(0)
        try:
            self.assertEqual(store.read("transcript"), [])
            self.assertFalse(self.state.exists(), "reading an empty store must not create it")
            store.write(record)
            self.assertEqual(store.read("transcript"), [record])
        finally:
            os.umask(old_umask)
            guarding = False
        context = self.state / "context"
        folder = context / "transcripts"
        record_file = folder / (
            "5243f2165ab8f25f1e01f4ce78c23120db7e3d96ebdcd05e664c3b54eba04dde.json"
        )
        self.assertEqual(list(folder.iterdir()), [record_file])
        for path, mode in [(context, 0o700), (folder, 0o700), (record_file, 0o600)]:
            with self.subTest(path=path.name):
                self.assertEqual(path.stat().st_mode & 0o777, mode)
                self.assertEqual(path.stat().st_uid, os.geteuid())

    def test_saved_post_identity_includes_action(self):
        """Catch a connector action being lost when a post has several actions."""
        saved = json.loads((FIXTURES / "valid.json").read_text())["saved-post"]
        posts = [dict(saved, action=action) for action in ("repost", "bookmark", "like")]
        for post in posts:
            store.write(post)
        self.assertCountEqual(store.read("saved-post"), posts)
        self.assertEqual(store.read("transcript"), [])

    def test_worktrees_and_symlinked_destinations_are_refused(self):
        """Catch direct, linked and symlink-resolved worktree writes."""
        import subprocess

        root = self.state.parent
        worktree, linked, bare = (root / name for name in ("worktree", "linked", "bare"))
        git_env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
        for args in (
            ("init", "-q", str(worktree)),
            ("-C", str(worktree), "-c", "user.name=Synthetic",
             "-c", "user.email=synthetic@example.invalid", "commit",
             "-qm", "Synthetic", "--allow-empty"),
            ("-C", str(worktree), "worktree", "add", "--detach", str(linked)),
            ("init", "-q", "--bare", str(bare)),
        ):
            subprocess.run(["git", *args], env=git_env, check=True, capture_output=True)
        alias = root / "alias"
        alias.symlink_to(linked, target_is_directory=True)
        for parent, expected in ((worktree, worktree), (linked, linked), (alias, linked), (bare, bare)):
            with self.subTest(parent=parent.name):
                with patch.dict(os.environ, {"OPENWIZ_STATE_DIR": str(parent / "nested")}):
                    with self.assertRaises(store.StoreError) as error:
                        store.write(self.record)
                self.assertIn(str(expected.resolve()), str(error.exception))
                self.assertFalse((parent / "nested").exists())
        self.state.mkdir(mode=0o700)
        (self.state / "context").symlink_to(worktree, target_is_directory=True)
        with self.assertRaises(store.StoreError) as error:
            store.write(self.record)
        self.assertIn(str(worktree.resolve()), str(error.exception))
        self.assertFalse((worktree / "transcripts").exists())

    def test_existing_permissions_and_symlinks_fail_closed(self):
        """Catch reading or replacing an existing unsafe file or directory."""
        store.write(self.record)
        folder = self.state / "context/transcripts"
        [record_file] = folder.iterdir()
        for path in (folder.parent, folder, record_file):
            with self.subTest(path=path.name):
                mode = path.stat().st_mode & 0o777
                path.chmod(mode | 0o044)
                with self.assertRaises(store.StoreError):
                    store.read("transcript")
                with self.assertRaises(store.StoreError):
                    store.write(self.record)
                self.assertEqual(path.stat().st_mode & 0o777, mode | 0o044)
                path.chmod(mode)
        untouched = self.state.parent / "untouched"
        untouched.write_bytes(b"keep these bytes")
        record_file.unlink()
        record_file.symlink_to(untouched)
        with self.assertRaises(store.StoreError):
            store.read("transcript")
        with self.assertRaises(store.StoreError):
            store.write(self.record)
        self.assertEqual(untouched.read_bytes(), b"keep these bytes")
        self.assertTrue(record_file.is_symlink())

    def test_retries_preserve_the_first_valid_record(self):
        """Catch a race or retry overwriting a record with the same identity."""
        from concurrent.futures import ThreadPoolExecutor

        other = dict(self.record, text="A different synthetic message")
        with ThreadPoolExecutor(max_workers=2) as pool:
            writes = [pool.submit(store.write, record) for record in (self.record, other)]
        self.assertEqual(sum(write.exception() is None for write in writes), 1)
        [kept] = store.read("transcript")
        self.assertIn(kept, (self.record, other))
        refused = other if kept == self.record else self.record
        store.write(kept)
        with self.assertRaises(store.StoreError):
            store.write(refused)
        self.assertEqual(store.read("transcript"), [kept])
        self.assertEqual(len(list((self.state / "context/transcripts").iterdir())), 1)

    def test_invalid_records_do_not_create_store(self):
        """Catch invalid contract shapes being persisted before validation."""
        fixtures = json.loads((FIXTURES / "valid.json").read_text())
        cases = json.loads((FIXTURES / "broken.json").read_text())
        checked = []
        for case in cases:
            if case["valid"] not in ("transcript", "saved-post"):
                continue
            record = json.loads(json.dumps(fixtures[case["valid"]]))
            *parents, field = case["at"]
            target = record
            for key in parents:
                target = target[key]
            if "value" in case:
                target[field] = case["value"]
            else:
                del target[field]
            with self.subTest(case=case["case"]):
                with self.assertRaises(store.StoreError):
                    store.write(record)
                self.assertFalse(self.state.exists())
            checked.append(case["case"])
        self.assertTrue(checked, "no source record fixtures were checked")
        with self.assertRaisesRegex(store.StoreError, "UTC message time"):
            store.write(dict(self.record, time="2031-02-29T03:04:05Z"))
        self.assertFalse(self.state.exists())

    def test_corrupt_record_is_refused_and_preserved(self):
        """Catch duplicate JSON keys being silently accepted or overwritten."""
        name = store.write(self.record)
        path = self.state / "context/transcripts" / name
        valid = path.read_bytes()
        corrupt = b'{"text":"extra value",' + valid[1:]
        path.write_bytes(corrupt)
        with self.assertRaisesRegex(store.StoreError, "duplicate JSON keys"):
            store.read("transcript")
        with self.assertRaisesRegex(store.StoreError, "duplicate JSON keys"):
            store.write(self.record)
        self.assertEqual(path.read_bytes(), corrupt)

    def test_staged_write_is_redacted_and_a_failed_publish_leaves_no_record(self):
        """Catch raw staging bytes or a visible partial record after I/O failure."""
        text = 'Authorization: Bearer ' + 'Synthetic' + 'OnlyBearer0123456789'
        record = dict(self.record, text=text)

        def check_stage(source, destination, *, src_dir_fd, dst_dir_fd):
            fd = os.open(source, os.O_RDONLY, dir_fd=src_dir_fd)
            with os.fdopen(fd, "rb") as stream:
                self.assertEqual(json.load(stream), dict(record, text="Authorization: Bearer [redacted:token]"))
                self.assertEqual(os.fstat(stream.fileno()).st_mode & 0o777, 0o600)
            raise OSError("synthetic publish failure")

        with patch("store.os.link", side_effect=check_stage) as publish:
            with self.assertRaisesRegex(store.StoreError, "safely access"):
                store.write(record)
            publish.assert_called_once()
        self.assertEqual(list((self.state / "context/transcripts").iterdir()), [])
        self.assertEqual(store.read("transcript"), [])

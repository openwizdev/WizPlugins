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

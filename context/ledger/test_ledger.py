"""Run the ledger against the OpenWiz contract fixtures and a fake GitHub CLI."""

import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

CLI = Path(__file__).with_name("ledger.py")
OWNER = "https://github.com/synthetic-owner/synthetic-work"
ISSUE = ["issue", "view", f"{OWNER}/issues/3",
         "--json", "url,state,stateReason,closedByPullRequestsReferences"]
PR_URL = "https://github.com/synthetic-owner/synthetic-other/pull/7"
PR = ["pr", "view", PR_URL, "--json", "url,state,mergedAt"]
VALID_CASES = ("done-link", "done-record", "ticketed", "decide", "reply", "drop")
BROKEN_REASONS = {
    "done-proof": "invalid Done proof",
    "ambiguous-proof": "invalid Done proof",
    "ticketed-issue": "invalid Ticketed issue",
    "claimed-merge": "extra Ticketed fields",
    "decide-question": "invalid Decide question",
    "decide-recommendation": "invalid Decide recommendation",
    "reply-draft": "invalid Reply draft",
    "reply-approval": "invalid Reply approval",
    "missing-reply-approval": "invalid Reply approval",
    "engine-sent": "Reply sent_by_engine must be false",
    "numeric-sent-flag": "Reply sent_by_engine must be false",
    "drop-reason": "invalid Drop reason",
    "unresolved-no-state": "expected one closed state",
    "unresolved-two-states": "expected one closed state",
}


class LedgerTest(unittest.TestCase):
    def setUp(self):
        scratch = tempfile.TemporaryDirectory()
        self.addCleanup(scratch.cleanup)
        self.root = Path(scratch.name)
        context = self.root / "context"
        context.mkdir(mode=0o700)
        self.ledger = context / "ledger"
        self.ledger.mkdir(mode=0o700)
        self.record = self.ledger / "synthetic.json"
        self.plan = self.root / "plan"
        self.calls = self.root / "calls"
        fake = self.root / "gh"
        fake.write_text("#!" + sys.executable + "\n" + """
import json, os, pathlib, sys

calls = pathlib.Path(os.environ["SYN_CALLS"])
args = sys.argv[1:]
with calls.open("a") as log:
    log.write(json.dumps(args) + "\\n")
for command, reply in json.loads(pathlib.Path(os.environ["SYN_PLAN"]).read_text()):
    if args == command:
        if reply is None:
            sys.exit(1)
        print(json.dumps(reply))
        sys.exit(0)
sys.exit(91)
""", encoding="utf-8")
        fake.chmod(0o700)

    def run_cli(self, *options, plan=()):
        self.plan.write_text(json.dumps(plan), encoding="utf-8")
        self.calls.write_text("", encoding="utf-8")
        env = dict(os.environ, PATH=str(self.root), SYN_PLAN=str(self.plan),
                   SYN_CALLS=str(self.calls))
        return subprocess.run([sys.executable, "-I", str(CLI), str(self.ledger), *options],
                              env=env, capture_output=True, text=True, check=False)

    def put(self, item):
        self.record.write_text(json.dumps(item), encoding="utf-8")
        self.record.chmod(0o600)

    def check_item(self, item, reason=None, plan=()):
        self.put(item)
        result = self.run_cli("--json", plan=plan)
        self.assertEqual(result.returncode, 0, result.stderr)
        expected = [] if reason is None else [{"id": item["id"], "reason": reason}]
        self.assertEqual(json.loads(result.stdout),
                         {"unresolved_count": len(expected), "unresolved": expected})
        self.assertEqual(result.stderr, "")
        self.assertEqual(self.calls.read_text().splitlines(),
                         [json.dumps(command) for command, _ in plan])

    @staticmethod
    def issue(*pulls, state="CLOSED", reason="COMPLETED"):
        return {"url": f"{OWNER}/issues/3", "state": state, "stateReason": reason,
                "closedByPullRequestsReferences": [{"url": url} for url in pulls]}

    def test_contract_valid_records(self):
        for case in VALID_CASES:
            with self.subTest(case=case):
                plan = ((ISSUE, self.issue(PR_URL)),
                        (PR, {"url": PR_URL, "state": "MERGED",
                              "mergedAt": "2031-01-02T03:04:05Z"})) if case == "ticketed" else ()
                self.check_item(VALID[case], plan=plan)

    def test_contract_broken_records(self):
        cases = {row["case"]: row for row in BROKEN if row["valid"] in VALID_CASES}
        self.assertEqual(set(cases), set(BROKEN_REASONS))
        for name, row in cases.items():
            with self.subTest(case=name):
                item = copy.deepcopy(VALID[row["valid"]])
                target = item
                for key in row["at"][:-1]:
                    target = target[key]
                key = row["at"][-1]
                if "value" in row:
                    target[key] = row["value"]
                else:
                    del target[key]
                self.check_item(item, BROKEN_REASONS[name])

    def test_ticket_readback_uses_only_view_commands(self):
        item = VALID["ticketed"]
        for state in ("OPEN", "CLOSED", "MERGED"):
            with self.subTest(state=state):
                plan = ((ISSUE, self.issue(PR_URL)),
                        (PR, {"url": PR_URL, "state": state, "mergedAt": None}))
                self.check_item(item, "closing pull request merge unverified", plan)
        self.check_item(item, "closing pull request merge unverified",
                        ((ISSUE, self.issue(PR_URL)), (PR, None)))
        self.check_item(item, "no closing pull request", ((ISSUE, self.issue()),))
        self.check_item(item, "GitHub issue unreadable", ((ISSUE, None),))
        self.check_item(item, "GitHub issue is not closed as completed",
                        ((ISSUE, self.issue(PR_URL, state="OPEN", reason="REOPENED")),))
        self.check_item(item, "closing pull request readback invalid",
                        ((ISSUE, self.issue("--help")),))

    def test_duplicate_state_fails_closed(self):
        self.put(VALID["drop"])
        text = self.record.read_text()
        self.record.write_text(text[:-1] + ', "state": {"kind":"Drop","reason":"Synthetic"}}')
        result = self.run_cli("--json")
        self.assertEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout), {
            "unresolved_count": 1,
            "unresolved": [{"id": VALID["drop"]["id"], "reason": "duplicate JSON field"}],
        })

    def test_count_and_unreadable_store_are_distinct(self):
        self.put({key: value for key, value in VALID["drop"].items() if key != "state"})
        result = self.run_cli()
        self.assertEqual((result.returncode, result.stdout, result.stderr), (0, "1\n", ""))
        for broken in ("permissions", "malformed JSON", "missing"):
            with self.subTest(broken=broken):
                if broken == "permissions":
                    self.record.chmod(0o644)
                elif broken == "malformed JSON":
                    self.record.chmod(0o600)
                    self.record.write_text("{")
                else:
                    self.record.unlink()
                    self.ledger.rmdir()
                result = self.run_cli("--json")
                self.assertEqual((result.returncode, result.stdout, result.stderr),
                                 (3, "", "Cannot read the local item ledger.\n"))


if __name__ == "__main__":
    fixtures = Path(sys.argv.pop(1))
    VALID = json.loads((fixtures / "valid.json").read_text(encoding="utf-8"))
    BROKEN = json.loads((fixtures / "broken.json").read_text(encoding="utf-8"))
    unittest.main()

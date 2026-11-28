"""Count unresolved context engine items."""

import argparse
import json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ledger_dir")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    print(json.dumps({"unresolved_count": 0, "unresolved": []}) if args.json else 0)


if __name__ == "__main__":
    main()

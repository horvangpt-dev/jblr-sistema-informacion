from __future__ import annotations

import argparse
import json
from pathlib import Path

from .package import build_l1_package
from .validator import validate_rc3_release


def main() -> int:
    parser = argparse.ArgumentParser(prog="jblr-taxonomy-l1")
    sub = parser.add_subparsers(dest="command", required=True)
    validate = sub.add_parser("validate")
    validate.add_argument("source_zip")
    validate.add_argument("contract")
    validate.add_argument("--report")
    build = sub.add_parser("build")
    build.add_argument("source_zip")
    build.add_argument("release_contract")
    build.add_argument("identity_schema")
    build.add_argument("relation_rules")
    build.add_argument("output_zip")
    build.add_argument("--report")
    args = parser.parse_args()

    if args.command == "validate":
        result = validate_rc3_release(args.source_zip, args.contract).to_dict()
        code = 0 if result["status"] == "PASS" else 1
    else:
        result = build_l1_package(args.source_zip, args.release_contract, args.identity_schema, args.relation_rules, args.output_zip)
        code = 0
    text = json.dumps(result, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    if args.report:
        Path(args.report).write_text(text, encoding="utf-8")
    print(text, end="")
    return code


if __name__ == "__main__":
    raise SystemExit(main())

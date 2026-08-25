#!/usr/bin/env python3
from pathlib import Path
import argparse
import json
import sys

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE / "src"))
import reconcile as r


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--historical-stime", required=True)
    p.add_argument("--rc3-zip", required=True)
    p.add_argument("--review-queue", default=str(HERE / "contracts" / "historical_review_queue_14.json"))
    p.add_argument("--out", required=True)
    args = p.parse_args()
    queue_doc = json.loads(Path(args.review_queue).read_text(encoding="utf-8"))
    receipt = r.run_controlled_integration(args.historical_stime, args.rc3_zip, queue_doc["items"])
    Path(args.out).write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"READY_FOR_09": receipt["READY_FOR_09"], "out": args.out}))
    return 0 if receipt["READY_FOR_09"] == "YES" else 2


if __name__ == "__main__":
    raise SystemExit(main())

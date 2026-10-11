"""Validate every published artifact against data/contracts/*.schema.json and enforce the 400 KB gzip budget."""
from __future__ import annotations

import gzip
import json

from jsonschema import Draft202012Validator

from pipelines.common import CONTRACTS, PUBLIC

BUDGET = 400 * 1024


def main() -> None:
    bad = 0
    for sch in sorted(CONTRACTS.glob("*.schema.json")):
        name = sch.name.replace(".schema.json", "")
        f = PUBLIC / f"{name}.json"
        if not f.exists():
            print("MISSING", name); bad += 1; continue
        errs = list(Draft202012Validator(json.loads(sch.read_text())).iter_errors(json.loads(f.read_text())))
        gz = len(gzip.compress(f.read_bytes(), 9, mtime=0))
        status = "ok" if not errs and gz <= BUDGET else "FAIL"
        bad += status == "FAIL"
        print(f"{status:4s} {name:24s} gzip {gz:>8,d}" + (f"  {errs[0].message[:160]} at {list(errs[0].path)}" if errs else ""))
    raise SystemExit(1 if bad else 0)


if __name__ == "__main__":
    main()

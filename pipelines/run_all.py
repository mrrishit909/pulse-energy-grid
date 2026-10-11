"""One entrypoint: data/raw -> interim -> site/public/data -> docs/METHODOLOGY.md. Idempotent.

    uv run python -m pipelines.run_all [--fetch]

--fetch   download EBA.zip, NOAA station files and the pglib case first (skips files that exist); then extract. Without it the extraction
          from EBA.zip is skipped when data/interim/eia_long.parquet already exists, so a rerun needs no network and no 695 MB re-read.
Runtime per step is written to data/manifests/runtime.json.
"""
from __future__ import annotations

import argparse
import json
import time

from pipelines import contracts, publish
from pipelines.cleaning import clean
from pipelines.common import INTERIM, MANIFESTS, RAW


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fetch", action="store_true")
    a = ap.parse_args()
    timings: dict[str, float] = {}

    def step(name, fn):
        t = time.time()
        fn()
        timings[name] = round(time.time() - t, 1)
        print(f"[{name}] {timings[name]}s", flush=True)

    from pipelines.ingestion import eia, noaa, topology
    if a.fetch or not (RAW / "noaa").exists():
        step("fetch_noaa", noaa.fetch)
    step("fetch_topology", topology.fetch)
    if a.fetch or not (INTERIM / "eia_long.parquet").exists():
        step("extract_eia", eia.main)
    if a.fetch or not (INTERIM / "weather_hourly.parquet").exists():
        step("extract_noaa", noaa.main)
    step("clean", clean.main)
    step("contracts", contracts.build)
    step("publish", publish.build_all)
    from pipelines import methodology, validate_artifacts
    step("methodology", methodology.write)
    MANIFESTS.mkdir(parents=True, exist_ok=True)
    timings["total"] = round(sum(timings.values()), 1)
    (MANIFESTS / "runtime.json").write_text(json.dumps(timings, indent=2))
    try:
        validate_artifacts.main()
    except SystemExit as e:
        if e.code:
            raise
    print("total", timings["total"], "s")


if __name__ == "__main__":
    main()

"""Stream EBA.zip (4.4 GB JSON lines, one series per line) and keep only the chosen BAs and hourly series.

Output: data/interim/eia_long.parquet  (ba, kind, fuel, stamp_utc = raw EIA stamp, ts_utc = stamp - 1 h = interval start under the hour-ending reading, value)  plus data/manifests/eia_extract.json.
kind: D demand, DF EIA day-ahead demand forecast, NG total net generation, TI total interchange, GEN net generation by fuel.
"""
from __future__ import annotations

import json
import re
import subprocess
from datetime import datetime, timedelta

import polars as pl

from pipelines.common import BAS, END, EBA_URL, FUELS, INTERIM, MANIFESTS, RAW, START, sha256, write_json

HEAD = re.compile(r'^\{"series_id":"([^"]+)"')


def wanted() -> dict[str, tuple[str, str, str]]:
    w = {}
    for ba in BAS:
        for kind in ("D", "DF", "NG", "TI"):
            w[f"EBA.{ba}-ALL.{kind}.H"] = (ba, kind, "")
        for f in FUELS[ba]:
            w[f"EBA.{ba}-ALL.NG.{f}.H"] = (ba, "GEN", f)
    return w


def main() -> None:
    zp = RAW / "EBA.zip"
    if not zp.exists():
        subprocess.run(["curl", "-sL", "-o", str(zp), EBA_URL], check=True)
    w = wanted()
    rows, meta = [], {}
    # padded by 3 h each side so the per-series timing correction (pipelines/cleaning/timing.py) can move rows across the window edge
    lo, hi = datetime.fromisoformat(START) - timedelta(hours=3), datetime.fromisoformat(END) + timedelta(hours=3)
    p = subprocess.Popen(["unzip", "-p", str(zp), "EBA.txt"], stdout=subprocess.PIPE, text=True, bufsize=1 << 20)
    for line in p.stdout:
        m = HEAD.match(line)
        if not m or m.group(1) not in w:
            continue
        d = json.loads(line)
        ba, kind, fuel = w[d["series_id"]]
        n = 0
        for ts, v in d["data"]:
            # EIA-930 hourly stamps are HOUR-ENDING (the value stamped T covers [T-1h, T]); evidence: solar is ~0 in the stamp hour that ends at/before sunrise
            # and its mean profile centres near local solar noon only after this shift. Store the interval START so ts_utc is hour-beginning everywhere downstream.
            t = datetime.strptime(ts, "%Y%m%dT%H") - timedelta(hours=1)
            if lo <= t <= hi:
                rows.append((ba, kind, fuel, t + timedelta(hours=1), t, None if v is None else float(v)))
                n += 1
        meta[d["series_id"]] = {"name": d["name"], "units": d["units"], "start": d["start"], "end": d["end"], "last_updated": d["last_updated"], "rows_in_window": n}
    p.wait()
    missing = sorted(set(w) - set(meta))
    assert not missing, f"series missing from EBA.txt: {missing}"
    df = pl.DataFrame(rows, schema={"ba": pl.Utf8, "kind": pl.Utf8, "fuel": pl.Utf8, "stamp_utc": pl.Datetime("us"), "ts_utc": pl.Datetime("us"), "value": pl.Float64}, orient="row")
    INTERIM.mkdir(parents=True, exist_ok=True)
    df.sort(["ba", "kind", "fuel", "ts_utc"]).write_parquet(INTERIM / "eia_long.parquet")
    write_json(MANIFESTS / "eia_extract.json", {"source_url": EBA_URL, "zip_sha256": sha256(zp), "zip_bytes": zp.stat().st_size, "window": [START, END],
                                               "raw_rows_extracted": df.height, "series": meta}, compact=False)
    print("rows", df.height)


if __name__ == "__main__":
    main()

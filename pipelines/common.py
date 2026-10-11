"""Shared paths and constants for the Pulse Energy Grid pipeline."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
INTERIM = ROOT / "data" / "interim"
PROCESSED = ROOT / "data" / "processed"
MANIFESTS = ROOT / "data" / "manifests"
CONTRACTS = ROOT / "data" / "contracts"
PUBLIC = ROOT / "site" / "public" / "data"

SCHEMA_VERSION = "v1"
BAS = ("CISO", "ERCO")
BA_NAMES = {"CISO": "California ISO", "ERCO": "ERCOT (Texas)"}
BA_TZ = {"CISO": "America/Los_Angeles", "ERCO": "America/Chicago"}
FUELS = {"CISO": ("NG", "COL", "NUC", "OIL", "OTH", "SUN", "WAT", "WND"),
         "ERCO": ("NG", "COL", "NUC", "OTH", "SUN", "WAT", "WND")}
# Study window, UTC hours, inclusive start / inclusive end.
START = "2021-01-01T00:00:00"
END = "2025-08-26T23:00:00"  # NOAA ISD mirror ends 2025-08-27 (EIA runs to 2026-10; see DATA_SOURCES.md)
# Temporal split by UTC timestamp of the forecast TARGET hour (see docs/METHODOLOGY.md).
TRAIN_END = "2023-06-30T23:00:00"
VAL_END = "2024-08-31T23:00:00"  # test = (VAL_END, END]
EBA_URL = "https://www.eia.gov/opendata/bulk/EBA.zip"


def sha256(path: Path, chunk: int = 1 << 24) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while b := f.read(chunk):
            h.update(b)
    return h.hexdigest()


def write_json(path: Path, obj, compact: bool = True) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    s = json.dumps(obj, separators=(",", ":"), sort_keys=True, allow_nan=False) if compact else json.dumps(obj, indent=2, sort_keys=True, allow_nan=False)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(s + "\n")
    os.replace(tmp, path)
    return len(s) + 1

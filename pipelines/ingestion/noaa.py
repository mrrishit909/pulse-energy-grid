"""NOAA ISD global-hourly station files -> data/interim/weather_hourly.parquet (one row per station x UTC hour with an accepted observation).

Rule: parse TMP/DEW (tenths of degC, quality flag); accept quality in {0,1,4,5}; sentinel +9999 = missing. Each observation is assigned to the
nearest UTC hour; of several observations per hour keep the one closest to the hour mark (METAR at :53 maps to the next hour).
"""
from __future__ import annotations

import subprocess

import polars as pl

from pipelines.common import INTERIM, MANIFESTS, RAW, sha256, write_json

# ba, usaf+wban, name, weight (see docs/DATA_SOURCES.md)
STATIONS = [
    ("CISO", "72295023174", "Los Angeles Intl", 0.55), ("CISO", "72494023234", "San Francisco Intl", 0.20),
    ("CISO", "72290023188", "San Diego Intl", 0.15), ("CISO", "72483993225", "Sacramento Metropolitan", 0.10),
    ("ERCO", "72259003927", "Dallas/Fort Worth", 0.38), ("ERCO", "72243012960", "Houston Intercontinental", 0.35),
    ("ERCO", "72254013904", "Austin-Bergstrom", 0.14), ("ERCO", "72253012921", "San Antonio Intl", 0.13),
]
YEARS = range(2021, 2026)
URL = "https://noaa-global-hourly-pds.s3.amazonaws.com/{y}/{s}.csv"
OK_QC = (0, 1, 4, 5)


def fetch() -> None:
    d = RAW / "noaa"
    d.mkdir(parents=True, exist_ok=True)
    for _, sid, _, _ in STATIONS:
        for y in YEARS:
            f = d / f"{y}-{sid}.csv"
            if not f.exists() or f.stat().st_size == 0:
                subprocess.run(["curl", "-sf", "-o", str(f), URL.format(y=y, s=sid)], check=True)


def _parse(col: str) -> list[pl.Expr]:
    p = pl.col(col).str.split(",")
    v = p.list.get(0, null_on_oob=True).cast(pl.Float64, strict=False)
    q = p.list.get(1, null_on_oob=True).cast(pl.Int64, strict=False)
    ok = (v != 9999) & q.is_in(OK_QC)
    return [pl.when(ok).then(v / 10.0).otherwise(None).alias(col.lower() + "_c")]


def main() -> None:
    frames, man = [], {}
    for _, sid, _, _ in STATIONS:
        for y in YEARS:
            f = RAW / "noaa" / f"{y}-{sid}.csv"
            man[f.name] = {"sha256": sha256(f), "bytes": f.stat().st_size}
            df = pl.read_csv(f, columns=["STATION", "DATE", "TMP", "DEW"], schema_overrides={"STATION": pl.Utf8}, infer_schema_length=0)
            df = df.with_columns(pl.col("DATE").str.to_datetime("%Y-%m-%dT%H:%M:%S").alias("obs"), *_parse("TMP"), *_parse("DEW"))
            frames.append(df.select("STATION", "obs", "tmp_c", "dew_c"))
    d = pl.concat(frames)
    raw_obs = d.height
    d = d.with_columns(pl.col("obs").dt.round("1h").alias("ts_utc"), (pl.col("obs") - pl.col("obs").dt.round("1h")).abs().alias("dist"))
    d = d.filter(pl.col("tmp_c").is_not_null()).sort(["STATION", "ts_utc", "dist"]).unique(["STATION", "ts_utc"], keep="first", maintain_order=True)
    d = d.select(pl.col("STATION").alias("station"), "ts_utc", "tmp_c", "dew_c").sort("station", "ts_utc")
    INTERIM.mkdir(parents=True, exist_ok=True)
    d.write_parquet(INTERIM / "weather_hourly.parquet")
    write_json(MANIFESTS / "noaa_extract.json", {"source": "https://noaa-global-hourly-pds.s3.amazonaws.com/", "raw_observations": raw_obs, "hourly_rows_with_temp": d.height, "files": man}, compact=False)
    print("obs", raw_obs, "hourly with temp", d.height)


if __name__ == "__main__":
    main()

"""Loading helpers shared by analytics, tests and publishing."""
from __future__ import annotations

import polars as pl

from pipelines.common import INTERIM, TRAIN_END, VAL_END


def hourly(ba: str | None = None) -> pl.DataFrame:
    df = pl.read_parquet(INTERIM / "hourly.parquet")
    return df.filter(pl.col("ba") == ba).sort("ts_utc") if ba else df


def split_of(ts) -> str:
    return "train" if ts <= TRAIN_END else "val" if ts <= VAL_END else "test"

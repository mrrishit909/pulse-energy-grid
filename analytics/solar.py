"""Astronomical solar-noon helper shared by the timing correction and the tests (reference longitudes are BA-level approximations)."""
from __future__ import annotations

import math
from datetime import date, datetime
from zoneinfo import ZoneInfo

REF_LON = {"CISO": (-119.0, -120.0, "America/Los_Angeles"), "ERCO": (-97.5, -90.0, "America/Chicago")}


def solar_noon_clock(ba: str, d: date) -> float:
    """Local wall-clock hour (decimal, DST included) of solar noon on date d."""
    lon, std, tz = REF_LON[ba]
    n = d.timetuple().tm_yday
    b = 2 * math.pi * (n - 81) / 364
    eot_h = (9.87 * math.sin(2 * b) - 7.53 * math.cos(b) - 1.5 * math.sin(b)) / 60
    dst = datetime(d.year, d.month, d.day, 12, tzinfo=ZoneInfo(tz)).utcoffset().total_seconds() / 3600 - std / 15
    return 12 + (std - lon) / 15 - eot_h + dst


def centroid(sun, hours=range(24)) -> float:
    """Centroid of interval midpoints (hour + 0.5) of non-negative solar output."""
    v = [max(x, 0) for x in sun]
    return sum((h + 0.5) * x for h, x in zip(hours, v)) / sum(v)

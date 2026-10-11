"""Parse the pglib-opf IEEE 14-bus MATPOWER file (CC BY 4.0) into a plain dict. Illustrative test system only."""
from __future__ import annotations

import re
import subprocess

from pipelines.common import RAW, sha256

URL = "https://raw.githubusercontent.com/power-grid-lib/pglib-opf/master/pglib_opf_case14_ieee.m"
F = RAW / "pglib_opf_case14_ieee.m"


def fetch() -> None:
    if not F.exists():
        subprocess.run(["curl", "-sf", "-o", str(F), URL], check=True)


def _block(txt: str, name: str) -> list[tuple[list[float], str]]:
    m = re.search(rf"mpc\.{name} = \[(.*?)\];", txt, re.S)
    rows = []
    for line in m.group(1).strip().splitlines():
        body, _, comment = line.partition("%")
        nums = [float(x) for x in body.replace(";", " ").split()]
        if nums:
            rows.append((nums, comment.strip()))
    return rows


def parse() -> dict:
    t = F.read_text()
    base = float(re.search(r"mpc\.baseMVA = ([\d.]+);", t).group(1))
    buses = [{"id": int(r[0]), "type": int(r[1]), "pd_mw": r[2], "qd_mvar": r[3], "gs_mw": r[4], "bs_mvar": r[5], "base_kv": r[9]} for r, _ in _block(t, "bus")]
    branches = [{"from": int(r[0]), "to": int(r[1]), "r_pu": r[2], "x_pu": r[3], "b_pu": r[4], "rate_a_mva": r[5]} for r, _ in _block(t, "branch")]
    gens, costs = _block(t, "gen"), _block(t, "gencost")
    generators = [{"bus": int(g[0][0]), "pmax_mw": g[0][8], "pmin_mw": g[0][9], "cost_usd_mwh": c[0][5], "pglib_note": g[1]} for g, c in zip(gens, costs)]
    return {"label": "IEEE 14-bus test system (illustrative)", "illustrative": True, "source": URL, "license": "CC BY 4.0 (IEEE PES Power Grid Library, v23.07; data from the University of Washington PSTCA archive, Copyright 1999 Richard D. Christie)",
            "notes": "A 1962 academic test network. It is not the CAISO or ERCOT grid and its topology is not used in the dispatch LP; it only illustrates how generation, load and lines connect. Generator costs are pglib's, in USD/MWh at the linear coefficient.",
            "base_mva": base, "buses": buses, "branches": branches, "generators": generators, "_sha256": sha256(F)}

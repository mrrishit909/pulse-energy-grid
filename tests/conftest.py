import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

PUBLIC = ROOT / "site" / "public" / "data"
INTERIM = ROOT / "data" / "interim"


def pytest_collection_modifyitems(config, items):
    if not (INTERIM / "hourly.parquet").exists():
        skip = pytest.mark.skip(reason="data/interim/hourly.parquet missing: run `uv run python -m pipelines.run_all`")
        for it in items:
            if "slow" in it.keywords:
                it.add_marker(skip)


@pytest.fixture(scope="session")
def art():
    def load(name):
        return json.loads((PUBLIC / f"{name}.json").read_text())
    return load


@pytest.fixture(scope="session")
def hourly_all():
    from analytics.data import hourly
    return hourly()

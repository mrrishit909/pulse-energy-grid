import gzip
import json
import re
import subprocess

import pytest
from jsonschema import Draft202012Validator

from pipelines.common import CONTRACTS, PUBLIC, ROOT
from pipelines.contracts import SCHEMAS

TAG = re.compile(r"^(OBSERVED|DERIVED|PREDICTED|SIMULATED|SYNTHETIC)(/(OBSERVED|DERIVED|PREDICTED|SIMULATED|SYNTHETIC))*$")


@pytest.mark.parametrize("name", sorted(SCHEMAS))
def test_artifact_validates_against_schema(name):
    schema = json.loads((CONTRACTS / f"{name}.schema.json").read_text())
    Draft202012Validator.check_schema(schema)
    data = json.loads((PUBLIC / f"{name}.json").read_text())
    errs = list(Draft202012Validator(schema).iter_errors(data))
    assert not errs, errs[0].message


@pytest.mark.parametrize("name", sorted(SCHEMAS))
def test_artifact_size_budget_and_tags(name):
    raw = (PUBLIC / f"{name}.json").read_bytes()
    assert len(gzip.compress(raw, 9, mtime=0)) <= 400 * 1024
    d = json.loads(raw)
    assert d["schema_version"] == "v1" and d["tags"]
    assert all(TAG.match(v) for v in d["tags"].values())


def test_schema_files_match_generator():
    for n, s in SCHEMAS.items():
        assert json.loads((CONTRACTS / f"{n}.schema.json").read_text()) == json.loads(json.dumps(s, sort_keys=True))


def test_no_emdash_characters_in_tracked_files():
    files = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True).stdout.split()
    # binary evidence (png/jpg/webm/wasm) can contain the UTF-8 byte sequence by chance; scan text only
    binary = (".png", ".jpg", ".jpeg", ".webp", ".webm", ".mp4", ".wasm", ".woff2", ".gz", ".bin")
    bad = [f for f in files if not f.endswith(binary) and (ROOT / f).exists() and any(c in (ROOT / f).read_text(errors="ignore") for c in (chr(0x2014), chr(0x2015)))]
    assert not bad, bad


def test_no_nan_or_inf_in_artifacts():
    for f in PUBLIC.glob("*.json"):
        json.loads(f.read_text(), parse_constant=lambda c: (_ for _ in ()).throw(ValueError(f"{f.name}: {c}")))


def test_meta_has_attribution_and_split(art):
    m = art("meta")
    assert any("Energy Information Administration" in a for a in m["attribution"])
    assert any("CC BY 4.0" in a and "Illustrative" in a for a in m["attribution"])
    assert m["hours_in_window"] == 40776


def test_topology_is_labelled_illustrative(art):
    t = art("grid_topology")
    assert t["illustrative"] is True and "illustrative" in t["label"].lower() and "CC BY 4.0" in t["license"]
    assert len(t["buses"]) == 14 and len(t["branches"]) == 20

"""The routing eval set keeps its rules, and its recorded answers still score.

    uv run --frozen pytest eval/test_eval_set.py

No model is called: `run_eval --recorded` scores a file of answers.
"""

import json
import subprocess
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).parent
ROOT = HERE.parent
RECORDED = HERE / "recorded" / "routing.json"


@pytest.fixture(scope="module")
def cases() -> list[dict]:
    return json.loads((HERE / "routing_cases.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def route_ids() -> set[str]:
    return {r["id"] for r in json.loads((HERE / "acme.json").read_text(encoding="utf-8"))["routes"]}


def run_recorded(path: Path, *extra: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, "-m", "eval.run_eval", "--recorded", str(path), *extra],
                          cwd=ROOT, capture_output=True, text=True, encoding="utf-8")


def test_at_least_84_cases_with_unique_ids(cases):
    assert len(cases) >= 84
    assert len({c["id"] for c in cases}) == len(cases)


def test_case_shape(cases):
    for c in cases:
        assert set(c) == {"id", "lang", "text", "route_id"}, c
        assert c["lang"] in ("de", "en"), c
        assert c["text"].strip(), c


def test_a_third_is_german(cases):
    assert 3 * sum(c["lang"] == "de" for c in cases) >= len(cases)
    assert sum(c["lang"] == "de" for c in cases) >= 28


def test_every_route_at_least_six_times_and_only_known_ids(cases, route_ids):
    used = {c["route_id"] for c in cases} - {None}
    assert used <= route_ids
    for rid in route_ids:
        assert sum(c["route_id"] == rid for c in cases) >= 6, rid


def test_some_cases_land_on_no_route(cases):
    assert any(c["route_id"] is None for c in cases)


def test_recorded_answers_cover_every_case(cases):
    rec = json.loads(RECORDED.read_text(encoding="utf-8"))
    assert {"model", "prompt_version", "threshold", "answers"} <= set(rec)
    assert set(rec["answers"]) == {c["id"] for c in cases}


def test_recorded_file_scores_at_or_above_its_threshold():
    r = run_recorded(RECORDED)
    assert r.returncode == 0, r.stdout + r.stderr


def test_ten_flipped_answers_fail(cases, route_ids, tmp_path):
    rec = json.loads(RECORDED.read_text(encoding="utf-8"))
    right = [c for c in cases if rec["answers"][c["id"]] == c["route_id"]]
    assert len(right) >= 10
    for c in right[:10]:
        rec["answers"][c["id"]] = next(r for r in sorted(route_ids) if r != c["route_id"])
    broken = tmp_path / "broken.json"
    broken.write_text(json.dumps(rec), encoding="utf-8")
    r = run_recorded(broken)
    assert r.returncode != 0, r.stdout


def test_threshold_flag_overrides_the_file():
    assert run_recorded(RECORDED, "--threshold", "1.0").returncode != 0

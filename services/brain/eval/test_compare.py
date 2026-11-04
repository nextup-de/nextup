"""AIB-E1: a recorded provider run and the choice between providers. No model is called.

    uv run --frozen pytest eval/test_compare.py

The SDK classes are faked (brain.bedrock.AnthropicBedrockMantle, brain.llm.OpenAI).
"""

import json
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from brain.config import Settings
from brain.llm import LLMClient
from eval import compare, run_eval

HERE = Path(__file__).parent
ROOT = HERE.parent
KEY = "sk-secret-azure-key-789"
ENDPOINT = "https://secret-resource.openai.azure.com/openai/v1"
ACCOUNT = "123456789012"
JUDGEMENT = {"closest_id": "", "comparison": "-", "same_problem": False, "same_topic": False,
             "reason": "Row one covers it.", "route_id": "r1", "confidence": 0.9}


class FakeMantle:
    def __init__(self, **kw):
        self.messages = SimpleNamespace(create=self._create)

    def _create(self, **kw):
        usage = SimpleNamespace(input_tokens=100, output_tokens=20, cache_read_input_tokens=5,
                                cache_creation_input_tokens=1)
        return SimpleNamespace(content=[SimpleNamespace(type="text", text=json.dumps(JUDGEMENT))],
                               stop_reason="end_turn", model="claude-real", usage=usage)


class FakeOpenAI:
    def __init__(self, **kw):
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kw):
        msg = SimpleNamespace(content=json.dumps(JUDGEMENT))
        return SimpleNamespace(choices=[SimpleNamespace(message=msg)], model="gpt-real",
                               usage=SimpleNamespace(prompt_tokens=200, completion_tokens=30))


def base() -> LLMClient:
    with patch("brain.llm.OpenAI", FakeOpenAI):
        return LLMClient(Settings(llm_model="unused", _env_file=None))


def record(override, price_in=3.0, price_out=15.0, threshold=0.0):
    with patch("brain.llm.OpenAI", FakeOpenAI), patch("brain.bedrock.AnthropicBedrockMantle", FakeMantle):
        return run_eval.record_provider(override, price_in, price_out, threshold, base=base())


def test_aib_record_bedrock_has_every_field_and_the_cost():
    rec = record(run_eval.build_override("bedrock", "eu.anthropic.claude-sonnet-5-5", "eu-central-1"))
    assert {"provider", "model", "prompt_version", "threshold", "answers", "errors", "tokens_in", "tokens_out",
            "latency_ms", "usd_per_mtok", "cost_usd", "at"} <= set(rec)
    cases = run_eval.load_cases()
    assert rec["provider"] == "bedrock" and rec["model"] == "claude-real"
    assert set(rec["answers"]) == {c["id"] for c in cases} and rec["errors"] == 0
    assert rec["tokens_in"] == 106 * len(cases) and rec["tokens_out"] == 20 * len(cases)
    assert rec["usd_per_mtok"] == {"in": 3.0, "out": 15.0}
    assert rec["cost_usd"] == pytest.approx((rec["tokens_in"] * 3.0 + rec["tokens_out"] * 15.0) / 1e6)
    assert set(rec["latency_ms"]) == {"p50", "p95"} and rec["latency_ms"]["p95"] >= rec["latency_ms"]["p50"] >= 0


def test_aib_record_azure_reads_the_key_from_env_and_leaks_nothing(monkeypatch):
    monkeypatch.setenv("AZURE_OPENAI_KEY", KEY)
    rec = record(run_eval.build_override("azure-openai", "my-deployment", endpoint=ENDPOINT))
    text = json.dumps(rec)
    assert rec["provider"] == "azure-openai" and rec["model"] == "gpt-real"
    assert rec["tokens_in"] == 200 * len(run_eval.load_cases())
    for secret in (KEY, ENDPOINT, "secret-resource", "eu-central-1", ACCOUNT):
        assert secret not in text


def test_aib_record_azure_needs_key_and_endpoint(monkeypatch):
    monkeypatch.delenv("AZURE_OPENAI_KEY", raising=False)
    with pytest.raises(SystemExit):
        run_eval.build_override("azure-openai", "d", endpoint=ENDPOINT)
    monkeypatch.setenv("AZURE_OPENAI_KEY", KEY)
    with pytest.raises(SystemExit):
        run_eval.build_override("azure-openai", "d")


def test_aib_record_failed_calls_count_as_errors_and_misses():
    class Broken(FakeMantle):
        def _create(self, **kw):
            raise RuntimeError("boom")

    with patch("brain.llm.OpenAI", FakeOpenAI), patch("brain.bedrock.AnthropicBedrockMantle", Broken):
        rec = run_eval.record_provider(run_eval.build_override("bedrock", "m"), 1, 1, base=base())
    assert rec["errors"] == len(run_eval.load_cases()) and rec["answers"] == {} and rec["model"] == "m"
    assert rec["cost_usd"] == 0


def test_aib_record_file_is_still_scored_by_recorded(tmp_path):
    rec = record(run_eval.build_override("bedrock", "m"), threshold=0.0)
    path = tmp_path / "bedrock.json"
    path.write_text(json.dumps(rec), encoding="utf-8")
    r = subprocess.run([sys.executable, "-m", "eval.run_eval", "--recorded", str(path)], cwd=ROOT,
                       capture_output=True, text=True, encoding="utf-8")
    assert r.returncode == 0, r.stdout + r.stderr
    assert "recorded: model claude-real" in r.stdout
    rec["threshold"] = 1.0
    path.write_text(json.dumps(rec), encoding="utf-8")
    r = subprocess.run([sys.executable, "-m", "eval.run_eval", "--recorded", str(path)], cwd=ROOT,
                       capture_output=True, text=True, encoding="utf-8")
    assert r.returncode == 1


def test_aib_record_percentile_is_nearest_rank():
    assert run_eval.percentile([], 0.95) == 0
    assert run_eval.percentile(list(range(1, 101)), 0.95) == 95
    assert run_eval.percentile([5.0], 0.5) == 5.0


# ---------------------------------------------------------------- choose

def rec_of(provider, right, p95, cost):
    """A record whose first `right` of the cases are answered right and the rest wrong."""
    cases = run_eval.load_cases()
    wrong = "r1" if cases[0]["route_id"] != "r1" else "r2"
    answers = {c["id"]: (c["route_id"] if i < right else ("zz" if c["route_id"] == wrong else wrong))
               for i, c in enumerate(cases)}
    return {"provider": provider, "model": provider + "-m", "answers": answers, "errors": 0,
            "latency_ms": {"p50": p95 // 2, "p95": p95}, "cost_usd": cost}


def test_aib_choose_the_cheaper_of_two_qualifying():
    out = compare.choose([rec_of("bedrock", 90, 3000, 0.40), rec_of("azure-openai", 80, 4000, 0.25)])
    assert out["winner"]["provider"] == "azure-openai"
    assert [r["qualifies"] for r in out["rows"]] == [True, True]


def test_aib_choose_skips_low_accuracy_and_slow_even_when_cheaper():
    out = compare.choose([rec_of("bedrock", 73, 3000, 0.10),         # 73/92 = 0.793
                          rec_of("azure-openai", 92, 8001, 0.10),    # too slow by 1 ms
                          rec_of("other", 74, 8000, 0.90)])          # 74/92 = 0.804, p95 exactly at the limit
    assert [r["qualifies"] for r in out["rows"]] == [False, False, True]
    assert out["winner"]["provider"] == "other"


def test_aib_choose_breaks_a_cost_tie_by_latency():
    out = compare.choose([rec_of("bedrock", 90, 5000, 0.30), rec_of("azure-openai", 90, 2000, 0.30)])
    assert out["winner"]["provider"] == "azure-openai"


def test_aib_choose_reports_no_winner_when_none_qualifies(tmp_path, capsys):
    recs = [rec_of("bedrock", 50, 3000, 0.1), rec_of("azure-openai", 92, 9000, 0.1)]
    assert compare.choose(recs)["winner"] is None
    paths = []
    for r in recs:
        p = tmp_path / (r["provider"] + ".json")
        p.write_text(json.dumps(r), encoding="utf-8")
        paths.append(str(p))
    assert compare.main(paths) == 1
    assert "keep the AI off" in capsys.readouterr().out


def test_aib_choose_command_exits_0_with_a_winner(tmp_path, capsys):
    p = tmp_path / "bedrock.json"
    p.write_text(json.dumps(rec_of("bedrock", 92, 1000, 0.2)), encoding="utf-8")
    assert compare.main([str(p)]) == 0
    assert "Winner: bedrock" in capsys.readouterr().out


def test_aib_choose_is_pure():
    recs = [rec_of("bedrock", 90, 3000, 0.4)]
    before = json.dumps(recs)
    compare.choose(recs)
    assert json.dumps(recs) == before

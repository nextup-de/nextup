import json
import logging
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from brain import main
from brain.config import Settings
from brain.llm import LLMClient
from brain.schemas import CheckinDraft, CoachTurn, Judgement, PlanDraft
from brain.strict import strict_schema
from tests.conftest import FakeLLM, judgement

KEY = "sk-secret-azure-key-456"
AZURE = {"base_url": "https://co.openai.azure.com/openai/v1", "model": "my-deployment", "api_key": KEY,
         "provider": "azure-openai"}
BEDROCK = {"provider": "bedrock", "region": "eu-central-1", "model": "eu.anthropic.claude-sonnet-5-5"}
BANNED = {"minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength",
          "maxLength", "minItems", "maxItems", "pattern", "default", "title"}


class FakeOpenAI:
    built: list["FakeOpenAI"] = []

    def __init__(self, **kw):
        self.kw, self.calls = kw, []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))
        FakeOpenAI.built.append(self)

    def _create(self, **kw):
        self.calls.append(kw)
        msg = SimpleNamespace(content=json.dumps(judgement()))
        return SimpleNamespace(choices=[SimpleNamespace(message=msg)], model="gpt-real-name",
                               usage=SimpleNamespace(prompt_tokens=10, completion_tokens=3))


class FakeMantle:
    built: list["FakeMantle"] = []
    script: list = []

    def __init__(self, **kw):
        self.kw, self.calls = kw, []
        self.messages = SimpleNamespace(create=self._create)
        FakeMantle.built.append(self)

    def _create(self, **kw):
        self.calls.append(kw)
        return FakeMantle.script.pop(0) if len(FakeMantle.script) > 1 else FakeMantle.script[0]


def reply(text="", stop="end_turn", blocks=None, **usage):
    content = blocks if blocks is not None else [SimpleNamespace(type="text", text=text)]
    u = {"input_tokens": 100, "output_tokens": 20, "cache_read_input_tokens": 5, "cache_creation_input_tokens": 1, **usage}
    return SimpleNamespace(content=content, stop_reason=stop, model="claude-real", usage=SimpleNamespace(**u))


@pytest.fixture
def client(monkeypatch):
    FakeOpenAI.built, FakeMantle.built = [], []
    monkeypatch.setattr(main.settings, "api_key", "")
    with patch("brain.llm.OpenAI", FakeOpenAI), patch("brain.bedrock.AnthropicBedrockMantle", FakeMantle):
        main.app.state.llm = LLMClient(Settings(llm_model="stack-model", _env_file=None))
        yield TestClient(main.app)
    del main.app.state.llm


# ---------------------------------------------------------------- bedrock
def test_aib_bedrock_builds_mantle_for_the_region_and_sends_the_strict_schema(client, body):
    FakeMantle.script = [reply(json.dumps(judgement()))]
    r = client.post("/v1/route", json={**body, "llm": BEDROCK})
    assert r.status_code == 200 and r.json()["model"] == "claude-real"
    (m,) = FakeMantle.built
    assert m.kw["aws_region"] == "eu-central-1" and "api_key" not in m.kw
    (call,) = m.calls
    assert call["model"] == BEDROCK["model"] and call["max_tokens"] == 1500
    for banned in ("temperature", "top_p", "top_k", "thinking", "tool_choice"):
        assert banned not in call
    assert call["messages"][-1]["role"] == "user"
    fmt = call["output_config"]["format"]
    assert call["output_config"]["effort"] == "low" and fmt["type"] == "json_schema"
    assert fmt["schema"]["additionalProperties"] is False
    assert fmt["schema"]["required"] == list(fmt["schema"]["properties"])
    assert FakeOpenAI.built[0].calls == []  # the stack client was not used


def test_aib_bedrock_reads_the_text_block_after_thinking(client, body):
    blocks = [SimpleNamespace(type="thinking", thinking="hm"), SimpleNamespace(type="text", text=json.dumps(judgement()))]
    FakeMantle.script = [reply(blocks=blocks)]
    assert client.post("/v1/route", json={**body, "llm": BEDROCK}).json()["route_id"] == "r3"


@pytest.mark.parametrize("stop", ["refusal", "max_tokens"])
def test_aib_bedrock_refusal_ends_as_502_after_retries(client, body, stop):
    FakeMantle.script = [reply(json.dumps(judgement()), stop=stop)]
    r = client.post("/v1/route", json={**body, "llm": BEDROCK})
    assert r.status_code == 502
    assert len(FakeMantle.built[0].calls) == 3  # first try + llm_max_retries


def test_aib_bedrock_rejects_a_bad_region_or_a_key(client, body):
    assert client.post("/v1/route", json={**body, "llm": {**BEDROCK, "region": "mars"}}).status_code == 422
    assert client.post("/v1/route", json={**body, "llm": {**BEDROCK, "api_key": "x"}}).status_code == 422


def test_aib_bedrock_is_not_built_without_an_override(client, body):
    client.post("/v1/route", json=body)
    assert FakeMantle.built == []


# ---------------------------------------------------------------- azure
def test_aib_azure_sends_max_completion_tokens_and_no_temperature(client, body):
    r = client.post("/v1/route", json={**body, "llm": AZURE})
    assert r.status_code == 200
    (call,) = FakeOpenAI.built[1].calls
    assert call["max_completion_tokens"] == 1500
    assert "temperature" not in call and "max_tokens" not in call
    assert call["response_format"]["json_schema"]["schema"]["additionalProperties"] is False


def test_aib_azure_old_override_without_provider_keeps_max_tokens_and_temperature(client, body):
    old = {k: v for k, v in AZURE.items() if k != "provider"}
    client.post("/v1/route", json={**body, "llm": old})
    (call,) = FakeOpenAI.built[1].calls
    assert call["max_tokens"] == 700 and call["temperature"] == 0 and "max_completion_tokens" not in call


def test_aib_azure_the_key_is_not_in_logs_or_error_bodies(client, body, caplog):
    caplog.set_level(logging.DEBUG)
    r1 = client.post("/v1/route", json={**body, "llm": AZURE})
    r2 = client.post("/v1/route", json={**body, "llm": {**AZURE, "provider": "nope"}})
    assert r2.status_code == 422
    assert KEY not in r1.text and KEY not in r2.text
    assert all(KEY not in r.getMessage() for r in caplog.records)


# ---------------------------------------------------------------- strict schema and tokens
def walk(node):
    if isinstance(node, dict):
        yield node
        for v in node.values():
            yield from walk(v)
    elif isinstance(node, list):
        for v in node:
            yield from walk(v)


@pytest.mark.parametrize("model", [Judgement, CoachTurn, PlanDraft, CheckinDraft])
def test_aib_tokens_strict_schema_closes_every_object_and_drops_limits(model):
    raw = model.model_json_schema()
    s = strict_schema(raw)
    for node in walk(s):
        assert not BANNED & node.keys()
        if node.get("type") == "object":
            assert node["additionalProperties"] is False and node["required"] == list(node["properties"])
    assert "description" in json.dumps(s)
    assert raw == model.model_json_schema()  # the input is untouched


def test_aib_tokens_strict_schema_keeps_enum_and_property_names():
    s = strict_schema({"type": "object", "title": "T", "properties": {
        "title": {"type": "string", "maxLength": 3, "enum": ["a"]}, "n": {"type": "integer", "minimum": 0, "default": 1}},
        "$defs": {"X": {"type": "object", "properties": {"a": {"type": "string"}}}}})
    assert "title" not in s and list(s["properties"]) == ["title", "n"] and s["required"] == ["title", "n"]
    assert s["properties"]["title"] == {"type": "string", "enum": ["a"]}
    assert s["properties"]["n"] == {"type": "integer"}
    assert s["$defs"]["X"]["additionalProperties"] is False and s["$defs"]["X"]["required"] == ["a"]


def test_aib_tokens_are_summed_over_retries_and_report_the_answers_model(client, body):
    FakeMantle.script = [reply("not json"), reply(json.dumps(judgement()), input_tokens=50, output_tokens=7)]
    j = client.post("/v1/route", json={**body, "llm": BEDROCK}).json()
    assert j["tokens_in"] == (100 + 5 + 1) + (50 + 5 + 1) and j["tokens_out"] == 27
    assert j["model"] == "claude-real"


def test_aib_tokens_openai_usage_and_a_missing_usage_counts_zero(client, body):
    j = client.post("/v1/route", json={**body, "llm": AZURE}).json()
    assert (j["tokens_in"], j["tokens_out"], j["model"]) == (10, 3, "gpt-real-name")
    llm = LLMClient(Settings(_env_file=None))
    llm.client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(
        create=lambda **kw: SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="{}"))]))))
    llm.complete_json("s", "u", {}, "n")
    assert (llm.tokens_in, llm.tokens_out, llm.model_used) == (0, 0, llm.settings.llm_model)


def test_aib_tokens_count_every_call_of_coach_plan_and_checkin(monkeypatch):
    plan = {"steps": ["Do it"], "metric": "", "unit": "", "better": "down"}
    checkin = {"note": "n", "open": [], "ready": True}
    turn = {"earlier_id": "", "note": "Noted.", "question": "How often?", "why": "w", "recommended": "r"}
    match = {"closest_id": "", "comparison": "-", "same_problem": False}
    answers = {"/v1/plan": [plan], "/v1/checkin": [checkin], "/v1/coach": [match, turn]}
    bodies = {
        "/v1/plan": {"company": "A", "idea": {"title": "Idea one"}},
        "/v1/checkin": {"company": "A", "idea": {"title": "Idea one"}, "round": 1},
        "/v1/coach": {"company": "A", "idea": {"title": "Idea one"}, "brief": "b",
                      "history": [{"role": "user", "text": "Idea one"}]},
    }
    monkeypatch.setattr(main.settings, "api_key", "")
    main.app.state.llm = FakeLLM([])
    try:
        for path, queue in answers.items():
            FakeMantle.script = [reply(json.dumps(a), input_tokens=10, output_tokens=2,
                                       cache_read_input_tokens=0, cache_creation_input_tokens=0) for a in queue]
            with patch("brain.bedrock.AnthropicBedrockMantle", FakeMantle):
                r = TestClient(main.app).post(path, json={**bodies[path], "llm": BEDROCK})
            assert r.status_code == 200, r.text
            n = len(queue)
            assert (r.json()["tokens_in"], r.json()["tokens_out"]) == (10 * n, 2 * n), path
            assert r.json()["model"] == "claude-real"
    finally:
        del main.app.state.llm


def test_aib_tokens_are_separate_per_request_and_fakellm_survives_the_copy(client, body):
    a = client.post("/v1/route", json={**body, "llm": AZURE}).json()
    b = client.post("/v1/route", json={**body, "llm": AZURE}).json()
    assert a["tokens_in"] == b["tokens_in"] == 10
    fake = FakeLLM([judgement(), judgement()])
    c1, c2 = fake.for_request(None), fake.for_request(None)
    assert c1 is not fake and c1 is not c2 and c1.client is fake.client
    c1.tokens_in = 5
    assert c2.tokens_in == 0 and c1.model_used == "fake-model"
    c1.structured("route", Judgement, {"company": "", "idea": "", "routes": "", "known": ""})
    assert len(fake.calls) == 1  # the copy records into the same list

"""The Claude API as the company's provider (`anthropic`): the same strict JSON call as Bedrock, built with the
company's key from the request, never kept or logged."""
import json
import logging
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from brain import main
from brain.config import Settings
from brain.llm import LLMClient
from tests.conftest import judgement

KEY = "sk-ant-test-key-not-real-123"
CLAUDE = {"provider": "anthropic", "model": "claude-opus-5-5", "api_key": KEY}


class FakeAnthropic:
    built: list["FakeAnthropic"] = []

    def __init__(self, **kw):
        self.kw, self.calls = kw, []
        self.messages = SimpleNamespace(create=self._create)
        FakeAnthropic.built.append(self)

    def _create(self, **kw):
        self.calls.append(kw)
        usage = SimpleNamespace(input_tokens=100, output_tokens=20, cache_read_input_tokens=0, cache_creation_input_tokens=0)
        return SimpleNamespace(content=[SimpleNamespace(type="text", text=json.dumps(judgement()))], stop_reason="end_turn",
                               model="claude-opus-5-5", usage=usage)


class FakeOpenAI:
    built: list["FakeOpenAI"] = []

    def __init__(self, **kw):
        self.calls = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=lambda **k: self.calls.append(k)))
        FakeOpenAI.built.append(self)


@pytest.fixture
def client(monkeypatch):
    FakeAnthropic.built, FakeOpenAI.built = [], []
    monkeypatch.setattr(main.settings, "api_key", "")
    with patch("brain.llm.OpenAI", FakeOpenAI), patch("brain.bedrock.Anthropic", FakeAnthropic):
        main.app.state.llm = LLMClient(Settings(llm_model="stack-model", _env_file=None))
        yield TestClient(main.app)
    del main.app.state.llm


def test_the_claude_api_gets_the_key_and_model_and_the_strict_schema(client, body):
    r = client.post("/v1/route", json={**body, "llm": CLAUDE})
    assert r.status_code == 200 and r.json()["model"] == "claude-opus-5-5"
    (a,) = FakeAnthropic.built
    assert a.kw["api_key"] == KEY
    (call,) = a.calls
    assert call["model"] == "claude-opus-5-5"
    for banned in ("temperature", "top_p", "top_k", "thinking", "tool_choice"):
        assert banned not in call
    assert call["output_config"]["format"]["type"] == "json_schema"
    assert FakeOpenAI.built[0].calls == []  # the stack's own client was not used


def test_the_key_is_never_logged(client, body, caplog):
    with caplog.at_level(logging.DEBUG):
        client.post("/v1/route", json={**body, "llm": CLAUDE})
    assert KEY not in caplog.text


def test_the_claude_api_needs_its_key(client, body):
    r = client.post("/v1/route", json={**body, "llm": {"provider": "anthropic", "model": "claude-opus-5-5"}})
    assert r.status_code == 422
    assert FakeAnthropic.built == []

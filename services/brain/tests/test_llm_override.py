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

KEY = "sk-secret-override-key-123"
LLM = {"base_url": "https://llm.example/v1", "model": "company-model", "api_key": KEY}


class FakeOpenAI:
    """Stands in for openai.OpenAI: records how it was built and what it was asked."""

    built: list["FakeOpenAI"] = []

    def __init__(self, **kw):
        self.kw = kw
        self.models_asked: list[str] = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))
        FakeOpenAI.built.append(self)

    def _create(self, **kw):
        self.models_asked.append(kw["model"])
        msg = SimpleNamespace(content=json.dumps(judgement()))
        return SimpleNamespace(choices=[SimpleNamespace(message=msg)])


@pytest.fixture
def client(monkeypatch):
    FakeOpenAI.built = []
    monkeypatch.setattr(main.settings, "api_key", "")
    with patch("brain.llm.OpenAI", FakeOpenAI):
        main.app.state.llm = LLMClient(Settings(llm_base_url="http://stack:11434/v1", llm_model="stack-model",
                                                llm_api_key="stack-key", _env_file=None))
        yield TestClient(main.app)
    del main.app.state.llm


def test_route_with_llm_uses_that_endpoint_key_and_model(client, body):
    r = client.post("/v1/route", json={**body, "llm": LLM})
    assert r.status_code == 200
    assert r.json()["model"] == "company-model"
    stack, mine = FakeOpenAI.built
    assert mine.kw["base_url"] == "https://llm.example/v1" and mine.kw["api_key"] == KEY
    assert mine.models_asked == ["company-model"]
    assert stack.models_asked == []


def test_route_without_llm_uses_the_settings_client(client, body):
    r = client.post("/v1/route", json=body)
    assert r.status_code == 200 and r.json()["model"] == "stack-model"
    (stack,) = FakeOpenAI.built
    assert stack.kw["base_url"] == "http://stack:11434/v1"
    assert stack.models_asked == ["stack-model"]


def test_the_override_does_not_stick(client, body):
    client.post("/v1/route", json={**body, "llm": LLM})
    client.post("/v1/route", json=body)
    assert FakeOpenAI.built[0].models_asked == ["stack-model"]


def test_the_key_is_never_logged(client, body, caplog):
    caplog.set_level(logging.DEBUG)
    client.post("/v1/route", json={**body, "llm": LLM})
    client.post("/v1/route", json={**body, "llm": {**LLM, "base_url": "ftp://bad"}})  # a 422 must not log it either
    assert caplog.records
    assert all(KEY not in r.getMessage() and KEY not in str(r.args) for r in caplog.records)
    assert KEY not in repr(main.RouteIn.model_validate({**body, "llm": LLM}))


def test_llm_must_be_complete(client, body):
    assert client.post("/v1/route", json={**body, "llm": {"base_url": "https://x.example/v1", "model": "m"}}).status_code == 422

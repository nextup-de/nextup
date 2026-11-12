"""/v1/chat/completions: the app's free calls with the model on this stack (AI choice `local`)."""

import json
from types import SimpleNamespace

import httpx
import openai
import pytest
from fastapi.testclient import TestClient
from openai.types.chat import ChatCompletion, ChatCompletionChunk

from brain import main
from tests.conftest import FakeLLM

ANSWER = {
    "id": "c1", "object": "chat.completion", "created": 1, "model": "fake-model",
    "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": "Hello."}}],
    "usage": {"prompt_tokens": 12, "completion_tokens": 3, "total_tokens": 15},
}


def chunk(**over) -> ChatCompletionChunk:
    base = {"id": "c1", "object": "chat.completion.chunk", "created": 1, "model": "fake-model", "choices": []}
    return ChatCompletionChunk.model_validate({**base, **over})


@pytest.fixture
def stack(monkeypatch):
    """A client whose stack model answers from `create`; `seen` holds what the model server was asked."""
    seen: list[dict] = []

    def make(create, key=""):
        monkeypatch.setattr(main.settings, "api_key", key)
        llm = FakeLLM([])

        def recorded(**kw):
            seen.append(kw)
            return create(**kw)

        llm.client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=recorded)))
        main.app.state.llm = llm
        return TestClient(main.app)

    yield make, seen
    del main.app.state.llm


def test_answers_with_the_stack_model_whatever_the_request_names(stack):
    make, seen = stack
    r = make(lambda **kw: ChatCompletion.model_validate(ANSWER)).post("/v1/chat/completions", json={
        "model": "gpt-4.1", "messages": [{"role": "user", "content": "Hi"}], "max_tokens": 50,
        "base_url": "https://elsewhere.example/v1", "api_key": "x",
    })
    assert r.status_code == 200
    assert r.json()["choices"][0]["message"]["content"] == "Hello." and r.json()["usage"]["prompt_tokens"] == 12
    assert seen == [{"model": "fake-model", "messages": [{"role": "user", "content": "Hi"}], "max_tokens": 50}]


def test_streams_chunks_with_usage_and_tools(stack):
    make, seen = stack
    chunks = [
        chunk(choices=[{"index": 0, "delta": {"role": "assistant", "content": "Hel"}}]),
        chunk(choices=[{"index": 0, "delta": {"content": "lo."}}]),
        chunk(usage={"prompt_tokens": 9, "completion_tokens": 2, "total_tokens": 11}),
    ]
    tools = [{"type": "function", "function": {"name": "search", "parameters": {"type": "object"}}}]
    r = make(lambda **kw: iter(chunks)).post("/v1/chat/completions", json={
        "messages": [{"role": "user", "content": "Hi"}], "tools": tools, "stream": True,
        "stream_options": {"include_usage": False},
    })
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
    lines = [line[6:] for line in r.text.split("\n") if line.startswith("data: ")]
    assert lines[-1] == "[DONE]"
    data = [json.loads(x) for x in lines[:-1]]
    assert "".join(c["choices"][0]["delta"].get("content", "") for c in data if c["choices"]) == "Hello."
    assert data[-1]["usage"]["completion_tokens"] == 2
    assert seen[0]["tools"] == tools and seen[0]["stream"] is True and seen[0]["stream_options"] == {"include_usage": True}


def test_a_model_server_that_fails_is_502(stack):
    make, _ = stack

    def down(**kw):
        raise openai.APIConnectionError(request=httpx.Request("POST", "http://ollama:11434/v1/chat/completions"))

    c = make(down)
    body = {"messages": [{"role": "user", "content": "Hi"}]}
    assert c.post("/v1/chat/completions", json=body).status_code == 502
    assert c.post("/v1/chat/completions", json={**body, "stream": True}).status_code == 502


def test_needs_the_key_and_a_message(stack):
    make, seen = stack
    c = make(lambda **kw: ChatCompletion.model_validate(ANSWER), key="s3cret")
    body = {"messages": [{"role": "user", "content": "Hi"}]}
    assert c.post("/v1/chat/completions", json=body).status_code == 401
    assert c.post("/v1/chat/completions", json={"messages": []}, headers={"x-api-key": "s3cret"}).status_code == 422
    assert c.post("/v1/chat/completions", json=body, headers={"x-api-key": "s3cret"}).status_code == 200
    assert len(seen) == 1

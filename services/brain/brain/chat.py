"""Free chat with the stack's own model, for the company choice "model on this stack" (app: AI choice `local`).

The app's raise-page assistant and the company context draft need a plain chat call, not one of the brain's
structured answers. With `local` they come here instead of to a provider: the brain passes the call on to its own
model server (LLM_BASE_URL, Ollama in the stack) and never to anything a request names. The request's `model` is
ignored: the answer is always the stack's model, and says so in `model`.

OpenAI chat completions in and out, streamed (server-sent events) or not, so the app reuses its adapter.
"""

from typing import Any, Iterator

from openai import OpenAIError
from pydantic import BaseModel, ConfigDict, Field

from brain.llm import LLMClient


class ChatIn(BaseModel):
    """The part of an OpenAI chat request the app sends. Anything else is dropped, never passed on."""

    model_config = ConfigDict(extra="ignore")

    messages: list[dict[str, Any]] = Field(min_length=1, max_length=200)
    tools: list[dict[str, Any]] | None = Field(default=None, max_length=20)
    max_tokens: int | None = Field(default=None, ge=1, le=32000)
    stream: bool = False


class ChatFailed(RuntimeError):
    """The stack's model server refused or did not answer."""


def _kwargs(llm: LLMClient, body: ChatIn) -> dict[str, Any]:
    kw: dict[str, Any] = {"model": llm.settings.llm_model, "messages": body.messages}
    if body.tools:
        kw["tools"] = body.tools
    if body.max_tokens:
        kw["max_tokens"] = body.max_tokens
    if body.stream:
        kw["stream"] = True
        kw["stream_options"] = {"include_usage": True}
    return kw


def chat(llm: LLMClient, body: ChatIn) -> dict[str, Any]:
    """One answer, not streamed."""
    try:
        resp = llm.client.chat.completions.create(**_kwargs(llm, body))
    except OpenAIError as e:
        raise ChatFailed(type(e).__name__) from e
    return resp.model_dump(exclude_none=True)


def chat_stream(llm: LLMClient, body: ChatIn) -> Iterator[str]:
    """Opens the stream (a failure raises before anything is sent), then yields server-sent events."""
    try:
        stream = llm.client.chat.completions.create(**_kwargs(llm, body))
    except OpenAIError as e:
        raise ChatFailed(type(e).__name__) from e

    def events() -> Iterator[str]:
        try:
            for chunk in stream:
                yield f"data: {chunk.model_dump_json(exclude_none=True)}\n\n"
        except OpenAIError:
            pass  # cut off: the app sees a short answer and checks it like any other
        yield "data: [DONE]\n\n"

    return events()

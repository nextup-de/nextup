"""OpenAI-compatible client. Works with Ollama, vLLM or anything that speaks /v1.

Nothing model-specific here: model names and URLs come from config, prompts from brain/prompts.
"""

import copy
import json
import logging
import re
from pathlib import Path
from typing import Any, Callable, TypeVar

from openai import OpenAI
from pydantic import BaseModel, ValidationError

from brain.config import Settings
from brain.schemas import AnthropicOverride, BedrockOverride, LlmOverride
from brain.strict import strict_schema

log = logging.getLogger("brain.llm")
PROMPT_DIR = Path(__file__).parent / "prompts"
T = TypeVar("T", bound=BaseModel)
_VARIABLE = re.compile(r"\{\{(\w+)\}\}")

# Most answers are a few short fields. A reading is five dials and a dozen sentences: up to about
# 7,500 characters of JSON at its schema's limits. Under this cap it comes back cut off, every retry
# is cut off the same way, and the reading is lost.
OUTPUT_CAP = {"read": 2600}


class LLMOutputError(RuntimeError):
    """Raised when the model keeps producing invalid output after all retries."""


def load_prompt(name: str) -> tuple[str, str]:
    """Prompt files contain a '## system' and a '## user' section."""
    text = (PROMPT_DIR / f"{name}.md").read_text()
    _, rest = text.split("## system", 1)
    system, user = rest.split("## user", 1)
    return system.strip(), user.strip()


def render(template: str, **variables: Any) -> str:
    """Fills the template in one pass: "{{known}}" in an employee's text stays text. No value can
    close the triple quotes around the idea and go on as if it were the prompt."""
    def value(m: re.Match[str]) -> str:
        if m.group(1) not in variables:
            return m.group(0)
        v = variables[m.group(1)]
        return (v if isinstance(v, str) else json.dumps(v, ensure_ascii=False, indent=1)).replace('"""', "'''")
    return _VARIABLE.sub(value, template)


class LLMClient:
    def __init__(self, settings: Settings, provider: str = "openai-compatible"):
        self.settings = settings
        self.provider = provider
        self.client = OpenAI(base_url=settings.llm_base_url, api_key=settings.llm_api_key,
                             timeout=settings.llm_timeout, max_retries=1)
        self._reset_counters()

    def _reset_counters(self) -> None:
        self.invalid = 0  # attempts that failed JSON/schema validation, for the eval
        self.tokens_in = 0   # summed over every call (and retry) made through this object
        self.tokens_out = 0
        self.answered_by: str | None = None  # the model name the last answer reported

    @property
    def model_used(self) -> str:
        """The model that answered (a deployment name has no price), else the configured one."""
        return self.answered_by or self.settings.llm_model

    def for_request(self, override: LlmOverride | BedrockOverride | AnthropicOverride | None) -> "LLMClient":
        """The client for one request: always a new object, so counters never mix between threads.

        Without an override it is a copy sharing this one's SDK client; with the company's own
        endpoint it is a fresh client. No global state: the override lives only as long as the
        returned client. The key is read here and nowhere else, and is never logged.
        """
        if override is None:
            mine = copy.copy(self)
            mine._reset_counters()
            return mine
        if isinstance(override, BedrockOverride):
            from brain.bedrock import BedrockLLMClient  # lazy: a stack without Bedrock never builds it
            return BedrockLLMClient(self.settings.model_copy(update={"llm_model": override.model}), override.region)
        if isinstance(override, AnthropicOverride):
            from brain.bedrock import AnthropicApiLLMClient  # lazy, like Bedrock
            return AnthropicApiLLMClient(self.settings.model_copy(update={"llm_model": override.model}),
                                         override.api_key.get_secret_value())
        settings = self.settings.model_copy(update={
            "llm_base_url": override.base_url, "llm_model": override.model,
            "llm_api_key": override.api_key.get_secret_value()})
        return LLMClient(settings, provider=override.provider)

    def complete_json(self, system: str, user: str, schema: dict, name: str) -> str:
        """One raw completion constrained to a JSON schema. Separate method so tests can mock it."""
        # Azure's newer deployments refuse max_tokens and any temperature but the default.
        limits: dict[str, Any] = ({"max_completion_tokens": OUTPUT_CAP.get(name, 1500)} if self.provider == "azure-openai"
                                  else {"max_tokens": OUTPUT_CAP.get(name, 700), "temperature": 0})
        resp = self.client.chat.completions.create(
            model=self.settings.llm_model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            response_format={"type": "json_schema",
                             "json_schema": {"name": name, "schema": schema, "strict": True}},
            **limits,
        )
        usage = getattr(resp, "usage", None)
        self.tokens_in += getattr(usage, "prompt_tokens", 0) or 0
        self.tokens_out += getattr(usage, "completion_tokens", 0) or 0
        self.answered_by = getattr(resp, "model", None) or self.answered_by
        return resp.choices[0].message.content or ""

    def structured(self, prompt: str, model: type[T], variables: dict[str, Any],
                   schema_override: dict | None = None,
                   check: Callable[[T], None] | None = None, retries: int | None = None) -> T:
        """Render prompt, call the model with a JSON schema, validate with Pydantic, retry on invalid output.

        `check` may raise ValueError for semantic problems (e.g. an unknown route id); that also triggers a retry.
        """
        system_tpl, user_tpl = load_prompt(prompt)
        system, user = render(system_tpl, **variables), render(user_tpl, **variables)
        schema = strict_schema(schema_override or model.model_json_schema())
        last_error = ""
        tries = (self.settings.llm_max_retries if retries is None else retries) + 1
        for attempt in range(tries):
            msg = user if not last_error else (
                f"{user}\n\nYour previous answer was invalid: {last_error}\nReturn only valid JSON matching the schema.")
            raw = self.complete_json(system, msg, schema, prompt)
            try:
                result = model.model_validate_json(raw)
                if check:
                    check(result)
                return result
            except (ValidationError, ValueError) as e:
                self.invalid += 1
                last_error = str(e)[:500]
                log.warning("invalid output prompt=%s attempt=%d error=%s", prompt, attempt + 1, last_error[:200])
        raise LLMOutputError(f"{prompt}: invalid output after {tries} attempts: {last_error}")

    def health(self) -> dict:
        try:
            models = [m.id for m in self.client.with_options(timeout=5).models.list().data]
            ok = any(m == self.settings.llm_model or m.split(":")[0] == self.settings.llm_model for m in models)
            return {"reachable": True, "model_available": ok}
        except Exception as e:  # noqa: BLE001
            return {"reachable": False, "model_available": False, "error": type(e).__name__}

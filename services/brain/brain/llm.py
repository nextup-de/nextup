"""OpenAI-compatible client. Works with Ollama, vLLM or anything that speaks /v1.

Nothing model-specific here: model names and URLs come from config, prompts from brain/prompts.
"""

import json
import logging
from pathlib import Path
from typing import Any, Callable, TypeVar

from openai import OpenAI
from pydantic import BaseModel, ValidationError

from brain.config import Settings

log = logging.getLogger("brain.llm")
PROMPT_DIR = Path(__file__).parent / "prompts"
T = TypeVar("T", bound=BaseModel)


class LLMOutputError(RuntimeError):
    """Raised when the model keeps producing invalid output after all retries."""


def load_prompt(name: str) -> tuple[str, str]:
    """Prompt files contain a '## system' and a '## user' section."""
    text = (PROMPT_DIR / f"{name}.md").read_text()
    _, rest = text.split("## system", 1)
    system, user = rest.split("## user", 1)
    return system.strip(), user.strip()


def render(template: str, **variables: Any) -> str:
    for key, value in variables.items():
        if not isinstance(value, str):
            value = json.dumps(value, ensure_ascii=False, indent=1)
        template = template.replace("{{" + key + "}}", value)
    return template


class LLMClient:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.client = OpenAI(base_url=settings.llm_base_url, api_key=settings.llm_api_key,
                             timeout=settings.llm_timeout, max_retries=1)
        self.invalid = 0  # attempts that failed JSON/schema validation, for the eval

    def complete_json(self, system: str, user: str, schema: dict, name: str) -> str:
        """One raw completion constrained to a JSON schema. Separate method so tests can mock it."""
        resp = self.client.chat.completions.create(
            model=self.settings.llm_model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0,
            max_tokens=700,  # a safety cap: every answer here is a few short fields
            response_format={"type": "json_schema",
                             "json_schema": {"name": name, "schema": schema, "strict": True}},
        )
        return resp.choices[0].message.content or ""

    def structured(self, prompt: str, model: type[T], variables: dict[str, Any],
                   schema_override: dict | None = None,
                   check: Callable[[T], None] | None = None, retries: int | None = None) -> T:
        """Render prompt, call the model with a JSON schema, validate with Pydantic, retry on invalid output.

        `check` may raise ValueError for semantic problems (e.g. an unknown route id); that also triggers a retry.
        """
        system_tpl, user_tpl = load_prompt(prompt)
        system, user = render(system_tpl, **variables), render(user_tpl, **variables)
        schema = schema_override or model.model_json_schema()
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

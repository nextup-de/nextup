"""AIB contract: the `llm` objects the app sends (pinned by apps/app/tests/unit/aib/llm-contract.test.ts
against the same fixture) are accepted by every request model of the brain."""
import json
from pathlib import Path

import pytest
from pydantic import TypeAdapter

from brain import schemas

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "llm-overrides.json").read_text(encoding="utf-8"))
IN_MODELS = [m for n, m in vars(schemas).items() if n.endswith("In") and isinstance(m, type) and "llm" in getattr(m, "model_fields", {})]


def test_aib_contract_fixture_has_one_object_per_provider():
    assert sorted(FIXTURE) == ["azure-openai", "bedrock", "openai-compatible"]


def test_aib_contract_there_are_request_models():
    assert {m.__name__ for m in IN_MODELS} >= {"RouteIn"}


@pytest.mark.parametrize("provider", sorted(FIXTURE))
def test_aib_contract_every_request_model_accepts_the_fixture(provider):
    for model in IN_MODELS:
        TypeAdapter(model.model_fields["llm"].annotation).validate_python(FIXTURE[provider])


@pytest.mark.parametrize("provider", sorted(FIXTURE))
def test_aib_contract_route_in_accepts_the_fixture(provider, body):
    parsed = schemas.RouteIn.model_validate({**body, "llm": FIXTURE[provider]})
    assert parsed.llm is not None
